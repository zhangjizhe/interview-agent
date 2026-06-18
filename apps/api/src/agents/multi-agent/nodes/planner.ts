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
import { McpRegistry, type McpToolMetadata } from '../../../modules/interview/services/mcp-registry';

export interface PlannerConfig {
    userId?: string;
    userPrefMap?: Map<string, boolean>;
}

/**
 * 生成工具描述字符串（用于 prompt）
 */
function formatToolsForPrompt(tools: McpToolMetadata[]): string {
    if (tools.length === 0) {
        return '- ask_llm: 让 LLM 生成内容（无需 tool，description 描述生成要求）';
    }

    const toolDescriptions = tools.map((tool) => {
        const actionName = tool.name.replace('_', ' ');
        return `- ${actionName}: ${tool.description}（tool: ${tool.name}）`;
    });

    return [
        ...toolDescriptions,
        '- ask_llm: 让 LLM 生成内容（无需 tool，description 描述生成要求）',
    ].join('\n');
}

/**
 * Planner 节点函数
 * 
 * @param model - ChatOpenAI 实例
 * @param config - 可选配置，包含 userId 和用户偏好映射
 */
export function createPlannerNode(model: ChatOpenAI, config?: PlannerConfig) {
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

        const availableTools = await McpRegistry.getAvailableTools(
            config?.userId || 'system',
            config?.userPrefMap || new Map(),
        );

        const toolsPrompt = formatToolsForPrompt(availableTools);

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

【可用工具】
${toolsPrompt}

【已完成的步骤】
${pastStepsSummary}

【用户最新消息】
${lastMessage}

【规划原则】
1. 步骤之间有逻辑顺序（先查再分析）
2. 每步只做一件事
3. 步骤数 2-6 步，不要过度拆分
4. 如果需要搜索/记忆召回，放在前面（信息收集优先）
5. 面试场景最后一步通常是 ask_llm（生成回复或下一道题）
6. 选择工具时考虑用户偏好设置`,
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
