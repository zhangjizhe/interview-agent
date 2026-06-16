/**
 * Planner 节点 — 用 LLM 生成执行计划
 *
 * 职责：
 * 1. 根据意图 + 对话上下文，生成步骤列表（2-6 步）
 * 2. 每个步骤指定 action / tool / args / description
 * 3. 写入 state.plan，重置 current_step_idx = 0
 *
 * 为什么不合并到 Supervisor？
 * - Supervisor 只负责分类，职责单一
 * - Planner 需要深入理解任务才能拆解，两者 prompt 不同
 * - 分离后可独立测试和调优
 */
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import type { InterviewAgentStateType, PlanStep } from '../state';
import { PlanStepSchema } from '../state';

/**
 * Planner 节点函数
 */
export function createPlannerNode(model: ChatOpenAI) {
    return async function plannerNode(
        state: InterviewAgentStateType,
    ): Promise<Partial<InterviewAgentStateType>> {
        const lastMessage = state.messages[state.messages.length - 1]?.content ?? '';

        const pastStepsSummary =
            state.past_steps.length > 0
                ? state.past_steps
                    .map((ps) => `✓ ${ps.step.description} → ${(ps.result as string).slice(0, 100)}`)
                    .join('\n')
                : '（无）';

        const intentPrompt: Record<string, string> = {
            jd_match: '匹配岗位要求：分析候选人技能与岗位 JD 的匹配度，给出差距和建议',
            mock_interview: '模拟面试：根据岗位出题、评估回答、追问或过渡到下一题',
            resume_review: '简历评估：解析简历、评估技能匹配度、给出改进建议',
        };

        const response = await model.withStructuredOutput(
            z.object({
                steps: z.array(PlanStepSchema).min(1).max(8),
                reasoning: z.string().describe('规划思路（为什么这样拆步骤）'),
            }),
        ).invoke([
            {
                role: 'system',
                content: `你是一个任务规划专家。根据用户意图，将任务拆解为可执行的步骤。

【用户意图】${state.user_intent}
【意图目标】${intentPrompt[state.user_intent] || '通用处理'}

【可用动作】
- search: 调用博查搜索（tool: bocha_search, args: {query: string, count?: number}）
- recall_memory: 召回候选人长期记忆（tool: memory_recall, args: {userId: string, query: string}）
- query_knowledge_bank: 查询面试题库（tool: knowledge_bank, args: {position: string, count?: number}）
- ask_llm: 让 LLM 生成内容（无需 tool，description 描述生成要求）
- generate_question: 生成面试题（tool: knowledge_bank, args: {position: string, level?: string, count?: number}）

【已完成的步骤】
${pastStepsSummary}

【用户最新消息】
${lastMessage}

【规划原则】
1. 步骤之间有逻辑顺序（先查再分析）
2. 每步只做一件事
3. 步骤数 2-6 步，不要过度拆分
4. 如果需要搜索/记忆召回，放在前面（信息收集优先）
5. 面试场景最后一通常是 ask_llm（生成回复或下一道题）`,
            },
        ]);

        const plan: PlanStep[] = response.steps.map((step, i) => ({
            ...step,
            id: step.id || `step-${i + 1}`,
        }));

        return {
            plan,
            current_step_idx: 0,
        };
    };
}
