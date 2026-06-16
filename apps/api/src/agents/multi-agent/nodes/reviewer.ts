/**
 * Reviewer 节点 — 审阅最终回复质量
 *
 * 职责：
 * 1. 基于 past_steps 汇总生成 final_response
 * 2. 审阅 final_response 是否合理、完整
 * 3. 通过 → 结束；不通过 → 打回重做（retry_count++）
 *
 * 失败策略：
 * - Reviewer 不通过：retry_count++，清空 final_response，回到 Planner 重新规划
 * - retry_count >= 2：强制输出（宁可输出不完美的回复也不死循环）
 */
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { AIMessage } from 'langchain';
import type { InterviewAgentStateType } from '../state';
import { ReviewVerdictSchema } from '../state';

/**
 * Reviewer 节点函数
 *
 * 两阶段：
 * 1. 汇总生成 final_response（基于 past_steps）
 * 2. 审阅质量，通过则结束，不通过则打回
 */
export function createReviewerNode(model: ChatOpenAI) {
    return async function reviewerNode(
        state: InterviewAgentStateType,
    ): Promise<Partial<InterviewAgentStateType>> {
        const lastMessage = state.messages[state.messages.length - 1]?.content ?? '';
        const pastStepsSummary = state.past_steps
            .map(
                (ps) =>
                    `[${ps.step.description}]\n${(ps.result as string).slice(0, 500)}`,
            )
            .join('\n\n');

        // 第一阶段：汇总生成 final_response
        const synthesisResponse = await model.invoke([
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
        ]);

        const finalResponse = synthesisResponse.content as string;

        // 第二阶段：审阅质量
        const reviewResponse = await model.withStructuredOutput(
            z.object({
                verdict: ReviewVerdictSchema,
                issues: z
                    .array(z.string())
                    .optional()
                    .describe('存在的问题（仅当 verdict=revise 时）'),
                suggestion: z.string().optional().describe('修改建议'),
            }),
        ).invoke([
            {
                role: 'system',
                content: `你是一个质量审核员。审阅以下面试官回复是否合格。

【用户意图】${state.user_intent}
【面试官回复】
${finalResponse}

【审核标准】
1. 是否回答了用户的问题
2. 是否基于事实（而非编造）
3. 语气是否专业友好
4. 是否有明显的逻辑错误
5. 回复是否完整（不是半截话）

approved = 合格，revise = 需要修改`,
            },
        ]);

        // 通过或重试超限 → 直接输出
        if (reviewResponse.verdict === 'approved' || state.retry_count >= 2) {
            return {
                messages: [new AIMessage(finalResponse)],
                final_response: finalResponse,
            };
        }

        // 不通过 → 打回重做：清空 final_response，增加 retry_count
        // past_steps 不清——下一轮 Planner 可以参考之前的执行结果
        return {
            final_response: '',
            retry_count: state.retry_count + 1,
        };
    };
}

/**
 * Reviewer 条件路由函数
 *
 * - 有 final_response → 结束
 * - 没有 final_response（被打回）→ 回到 Planner 重新规划
 */
export function reviewerRouter(
    state: InterviewAgentStateType,
): 'end' | 'planner' {
    if (state.final_response) {
        return 'end';
    }
    return 'planner';
}
