/**
 * Reviewer 节点 — 审阅最终回复质量 + HITL 中断
 *
 * 职责：
 * 1. 基于 past_steps 汇总生成 final_response
 * 2. 审阅 final_response 是否合理、完整
 * 3. 通过 → 结束；不通过 → 打回重做（retry_count++）
 * 4. 评分争议（score < HITL_THRESHOLD）→ 设置 hitl_pending=true 触发 interrupt
 *
 * 失败策略：
 * - Reviewer 不通过：retry_count++，清空 final_response，回到 Planner 重新规划
 * - retry_count >= 2：强制输出（宁可输出不完美的回复也不死循环）
 *
 * HITL 流程：
 * - Reviewer 评分 < 0.5 且 retry_count < MAX_RETRY_COUNT → hitl_pending=true
 * - graph.ts 中 reviewer 条件边检测 hitl_pending → 路由到 hitl_review 节点
 * - hitl_review 节点调用 interrupt() 暂停，等待 HR 审批
 * - HR 审批后通过 Command(resume) 恢复执行
 */
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { z } from 'zod';
import { AIMessage } from 'langchain';
import type { InterviewAgentStateType } from '../state';
import { ReviewVerdictSchema } from '../state';
import { dedupFinalResponse } from '../dedup';

export const ReviewResultSchema = z.object({
    verdict: ReviewVerdictSchema,
    score: z.number().min(0).max(1).describe('质量评分（0-1）'),
    issues: z.array(z.string()).describe('存在的问题列表'),
    suggestion: z.string().describe('修改建议'),
    confidence: z.number().min(0).max(1).describe('审核置信度'),
});

export type ReviewResult = z.infer<typeof ReviewResultSchema>;

const MAX_RETRY_COUNT = 2;
const HITL_SCORE_THRESHOLD = 0.5;

/**
 * Reviewer 节点函数
 *
 * 两阶段：
 * 1. 汇总生成 final_response（基于 past_steps）
 * 2. 审阅质量，通过则结束，不通过则打回
 */
export function createReviewerNode(model: BaseChatModel) {
    return async function reviewerNode(
        state: InterviewAgentStateType,
        config?: any,
    ): Promise<Partial<InterviewAgentStateType>> {
        const lastMessage = state.messages[state.messages.length - 1]?.content ?? '';
        const pastStepsSummary = state.past_steps
            .map(
                (ps) =>
                    `[${ps.step.description}]\n${(ps.result as string).slice(0, 500)}`,
            )
            .join('\n\n');

        // 第一阶段：汇总生成 final_response
        //
        // P0 修复（首字延迟 10s → 3-5s）：改用 model.stream() 让 token 实时透传到 service
        //
        // 链路：model.stream() 内部触发 LlmGatewayChatModel._streamResponseChunks() override
        //   → LlmGateway.streamChat() 真流式吐 token
        //   → LangGraph streamEvents(version:'v2') 监听 on_chat_model_stream
        //   → multi-agent.service.stream() 过滤 reviewer 节点的 token 推到前端
        //
        // 不再用 model.invoke() 是因为 invoke 一次性返回完整 AIMessage，
        // service 只能等 reviewer 节点完成（即 supervisor→planner→executor→replanner→reviewer
        // 全部跑完）才能 yield 第一个 token，用户感知到 10s 延迟。
        const synthesisStream = await model.stream(
            [
                {
                    role: 'system',
                    content: `你是一位专业的 AI 面试官小面。基于以下收集到的信息，给用户一个完整、专业的回复。

【用户意图】${state.user_intent}
【收集到的信息】
${pastStepsSummary}

【要求】
1. 回复要自然、口语化，像真人面试官
2. 不要用 Markdown 标题或列表
3. 如果是面试场景，每次只问一个问题
4. 基于收集到的信息回答，不要编造
5. 回复要直接面向用户，不要说"根据我收集到的信息..."`,
                },
                { role: 'user', content: lastMessage },
            ],
            config,
        );
        let finalResponse = '';
        for await (const chunk of synthesisStream) {
            const piece = typeof chunk.content === 'string' ? chunk.content : '';
            if (piece) finalResponse += piece;
        }
        // Dedup：消除 LLM 偶发重复输出（retry 时概率性输出"嗯嗯..."）
        // 必须在 return 前 dedup，否则重复段已推到前端无法回收
        finalResponse = dedupFinalResponse(finalResponse);

        // 第二阶段：审阅质量（结构化输出）
        const reviewResponse = await model.withStructuredOutput(ReviewResultSchema).invoke([
            {
                role: 'system',
                content: `你是一个严格的质量审核员。审阅以下面试官回复是否合格。

【用户意图】${state.user_intent}
【面试官回复】
${finalResponse}

【审核标准】
1. 相关性：是否直接回答了用户的问题
2. 事实准确性：是否基于提供的信息（而非编造）
3. 完整性：是否覆盖了核心要点
4. 逻辑性：是否有清晰的逻辑结构
5. 语气：是否专业友好
6. 格式：是否符合要求（口语化、无 Markdown）

【输出要求】
- score: 综合质量评分（0-1）
- issues: 问题列表（每项简洁描述）
- suggestion: 具体修改建议
- confidence: 你的审核置信度（0-1）

approved = 合格可输出，revise = 需要修改`,
            },
        ], config);

        // 防死循环：重试次数超限强制通过
        const isRetryExhausted = (state.retry_count || 0) >= MAX_RETRY_COUNT;
        const shouldApprove = reviewResponse.verdict === 'approved' || isRetryExhausted;

        // HITL 触发：评分争议且未超重试上限 → 暂停等待 HR 审批
        const needsHitl = !shouldApprove && reviewResponse.score < HITL_SCORE_THRESHOLD && !isRetryExhausted;

        if (shouldApprove) {
            return {
                messages: [new AIMessage(finalResponse)],
                final_response: finalResponse,
                review_score: reviewResponse.score,
                review_issues: reviewResponse.issues,
                review_suggestion: reviewResponse.suggestion,
                hitl_pending: false,
            } as any;
        }

        // HITL 中断：评分争议，暂停等待 HR
        if (needsHitl) {
            return {
                final_response: finalResponse, // 保留草稿，HR 审批后可使用
                retry_count: (state.retry_count || 0) + 1,
                review_score: reviewResponse.score,
                review_issues: reviewResponse.issues,
                review_suggestion: reviewResponse.suggestion,
                hitl_pending: true,
            } as any;
        }

        // 不通过 → 打回重做：清空 final_response，增加 retry_count
        // past_steps 不清——下一轮 Planner 可以参考之前的执行结果
        return {
            final_response: '',
            retry_count: (state.retry_count || 0) + 1,
            review_score: reviewResponse.score,
            review_issues: reviewResponse.issues,
            review_suggestion: reviewResponse.suggestion,
            hitl_pending: false,
        } as any;
    };
}

/**
 * Reviewer 条件路由函数
 *
 * - hitl_pending=true → 路由到 hitl_review 节点（interrupt 等待 HR 审批）
 * - 有 final_response 且非 HITL → 结束
 * - 没有 final_response（被打回）→ 回到 Planner 重新规划
 */
export function reviewerRouter(
    state: InterviewAgentStateType,
): 'end' | 'planner' | 'hitl_review' {
    // HITL 中断优先：评分争议，需要 HR 审批
    if (state.hitl_pending) {
        return 'hitl_review';
    }

    if (state.final_response) {
        return 'end';
    }
    return 'planner';
}
