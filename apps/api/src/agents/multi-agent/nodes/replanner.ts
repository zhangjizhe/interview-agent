/**
 * Replanner 节点 — 根据执行结果决定下一步
 *
 * 职责：
 * 1. 检查 past_steps 中最新一步是否成功
 * 2. 判断 plan 是否需要调整
 * 3. 输出决策：continue / replan / finish
 *
 * 为什么不合并到 Planner？
 * - Planner 的输入是用户意图，Replanner 的输入是执行结果
 * - Planner 是"从零规划"，Replanner 是"基于反馈调整"
 * - 两者 prompt 不同、职责不同
 * - 分离后可独立测试"失败恢复"逻辑
 */
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { z } from 'zod';
import type { InterviewAgentStateType, PlanStep } from '../state';
import { PlanStepSchema, ReplanDecisionSchema } from '../state';

/**
 * Replanner 节点函数
 */
export function createReplannerNode(model: BaseChatModel) {
    return async function replannerNode(
        state: InterviewAgentStateType,
    ): Promise<Partial<InterviewAgentStateType>> {
        const lastPastStep = state.past_steps[state.past_steps.length - 1];
        const allStepsDone = state.current_step_idx >= state.plan.length;
        const hasFailedStep = state.past_steps.some((ps) => !ps.success);

        // 快速路径：plan 全部执行完且无失败 → 不改 state，路由函数会返回 'reviewer'
        if (allStepsDone && !hasFailedStep) {
            return {};
        }

        // 快速路径：重试次数超限 → 强制 finish（不死循环兜底）
        if (state.retry_count >= 3) {
            return {};
        }

        // 需要 LLM 决策
        const pastStepsSummary = state.past_steps
            .map(
                (ps) =>
                    `${ps.success ? '✓' : '✗'} ${ps.step.description} → ${(ps.result as string).slice(0, 200)}`,
            )
            .join('\n');

        const remainingSteps = state.plan
            .slice(state.current_step_idx)
            .map((s) => `- ${s.description}`)
            .join('\n');

        const response = await model.withStructuredOutput(
            z.object({
                decision: ReplanDecisionSchema,
                new_plan: z
                    .array(PlanStepSchema)
                    .optional()
                    .describe('仅当 decision=replan 时提供新 plan'),
                reason: z.string().describe('决策理由'),
            }),
        ).invoke([
            {
                role: 'system',
                content: `你是一个任务调度专家。根据已执行步骤的结果，决定下一步策略。

【原始计划剩余步骤】
${remainingSteps || '（已全部执行）'}

【已执行步骤】
${pastStepsSummary}

【失败次数】${state.retry_count}

【决策规则】
- continue: 剩余步骤合理，继续执行
- replan: 执行结果偏离预期，需要重新规划（提供新 plan）
- finish: 所有步骤已执行完毕（或失败超限），进入审阅
- respond_directly: 问题简单，不需要继续执行，直接回复

【注意】
- 如果某步失败但有替代方案，选 replan
- 如果失败超过 3 次，必须选 finish`,
            },
        ]);

        const updates: Partial<InterviewAgentStateType> = {};

        if (response.decision === 'replan' && response.new_plan) {
            updates.plan = response.new_plan.map((step, i) => ({
                ...step,
                id: step.id || `step-${i + 1}`,
            })) as PlanStep[];
            updates.current_step_idx = 0;
        }

        return updates;
    };
}

/**
 * Replanner 条件路由函数
 *
 * 失败重试 + 兜底策略：
 * - retry_count >= 3 → 强制进 reviewer
 * - plan 全部执行完且无失败 → reviewer
 * - 有未执行步骤 → 继续执行
 * - 其他 → reviewer（兜底）
 */
export function replannerRouter(
    state: InterviewAgentStateType,
): 'executor' | 'reviewer' | 'respond_directly' {
    const allStepsDone = state.current_step_idx >= state.plan.length;
    const hasFailedStep = state.past_steps.some((ps) => !ps.success);

    // 重试超限 → 强制进 reviewer
    if (state.retry_count >= 3) {
        return 'reviewer';
    }

    // plan 全部执行完且无失败 → reviewer
    if (allStepsDone && !hasFailedStep) {
        return 'reviewer';
    }

    // 有新 plan 且还没执行完 → 继续执行
    if (state.plan.length > 0 && state.current_step_idx < state.plan.length) {
        return 'executor';
    }

    // 兜底：进 reviewer
    return 'reviewer';
}
