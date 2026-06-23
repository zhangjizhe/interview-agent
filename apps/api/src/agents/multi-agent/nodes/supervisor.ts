/**
 * Supervisor 节点 — 意图分类 + 条件路由
 *
 * 职责：
 * 1. 分析用户最新消息，分类意图（4 类）
 * 2. 将意图写入 state.user_intent
 * 3. 条件边根据意图决定下一步路由
 *
 * 为什么不在 LLM 自由路由？
 * - 边界 case 分类不一致，同一句话可能走不同分支
 * - 无法对特定意图做定制化处理
 * - 不可观测：不知道 LLM 为什么选了这条路
 * - 显式意图分类让路由可预测、可调试、可针对优化
 */
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { z } from 'zod';
import type { InterviewAgentStateType } from '../state';
import { UserIntentSchema, type UserIntent } from '../state';

/**
 * Supervisor 节点函数
 */
export function createSupervisorNode(model: BaseChatModel) {
    return async function supervisorNode(
        state: InterviewAgentStateType,
        config?: any,
    ): Promise<Partial<InterviewAgentStateType>> {
        const lastMessage = state.messages[state.messages.length - 1]?.content ?? '';
        const history = state.messages
            .slice(-6)
            .map((m) => `${m._getType()}: ${(m.content as string).slice(0, 200)}`)
            .join('\n');

        const response = await model.withStructuredOutput(
            z.object({
                intent: UserIntentSchema,
                reason: z.string().describe('分类理由（一句话）'),
            }),
        ).invoke([
            {
                role: 'system',
                content: `你是一个意图分类器。根据用户最新消息和对话历史，判断用户意图。

【意图定义】
- jd_match: 用户想匹配岗位要求（如"这个岗位需要什么技能"、"我适合这个岗吗"）
- mock_interview: 用户想进行模拟面试（如"开始面试"、"问我一道题"、"面试一下"）
- resume_review: 用户想评估简历（如"帮我看看简历"、"简历有什么问题"）
- general_qa: 通用问答（闲聊、概念解释、其他）

【对话历史】
${history || '（空）'}

【最新消息】
${lastMessage}

请输出意图分类和理由。`,
            },
        ], config);

        // 2026-06-24 修复：每轮新对话清空"上一轮 reviewer 残留状态"
        // 否则 reviewerRouter 看 state.final_response 非空直接 return 'end'，
        // 新 user message 永远不进 reviewer 处理（导致 R3/R4 输出完全相同）
        // 同时清空 retry_count / reflection / review_* / hitl_* 等，
        // 避免 reviewer 上一轮 revise→planner 的循环状态污染新一轮
        const cleared = {
            user_intent: response.intent as UserIntent,
            final_response: '',
            retry_count: 0,
            reflection: '',
            issue_tags: [],
            hitl_pending: false,
            hitl_verdict: undefined,
            past_steps: [],  // 也清空 past_steps（每轮新规划从空开始累积）
            plan: [],
            current_step_idx: 0,
            // review_* 不在 state schema 中（reviewer 用 as any 写入），用 any 清空
            review_score: undefined,
            review_issues: [],
            review_suggestion: '',
        } as any;
        return cleared;
    };
}

/**
 * Supervisor 条件路由函数
 *
 * - general_qa: 不需要规划，直接让 LLM 回答
 * - 其他意图: 都需要走 Planner 拆解任务
 */
export function supervisorRouter(
    state: InterviewAgentStateType,
): 'planner' | 'respond_directly' {
    if (state.user_intent === 'general_qa') {
        return 'respond_directly';
    }
    return 'planner';
}
