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
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { z } from 'zod';
import type { InterviewAgentStateType, PlanStep } from '../state';
import { PlanStepSchema, SpecialistTypeSchema } from '../state';
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
export function createPlannerNode(model: BaseChatModel, config?: PlannerConfig) {
    return async function plannerNode(
        state: InterviewAgentStateType,
        config?: any,
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

【可用工具】（用于 step.tool 字段，**只能选下面列出的**，不要自创）
${toolsPrompt}

⚠️ **重要：step.action 字段只能从以下 5 个枚举值中选**：
- "search": 调用 step.tool 执行搜索/查询类工具（bocha_search / knowledge_bank / github_* / notion_*）
- "memory_recall": 调用 memory_recall 工具做长期记忆检索（tool 字段写 "memory_recall"）
- "query_knowledge_bank": 调用 knowledge_bank 工具做面试题库 RAG
- "ask_llm": 不调工具，让 LLM 自己生成内容（无需 step.tool，step.description 描述生成要求）
- "generate_question": 生成下一道面试题（无需 step.tool）

❌ **绝对不能**把 MCP 工具名（github_get_user / notion_search 等）直接当 action！
✅ MCP 工具只能通过 action="search" + tool="<mcp_tool_name>" 调用。

【可用 Specialist Agent（Handoffs 路由）】
- interviewer: 面试官 Agent，擅长出题、追问、评估回答质量
- evaluator: 评估 Agent，擅长评分、写反馈、生成报告
- searcher: 搜索 Agent，擅长联网搜索、信息检索
- general: 通用 Agent，处理其他任务

【已完成的步骤】
${pastStepsSummary}

${
  state.reflection
    ? `【Reviewer 反思（必须重点避免）】
${state.reflection}

【Reviewer 高频问题标签】
${(state.issue_tags || []).join(', ')}

→ 重新规划时要**针对性调整**，比如：
  - 反思提到 "factual_error" → 新 plan 增加 "事实核查" 步骤（knowledge_search 再查一遍）
  - 反思提到 "incomplete" → 新 plan 增加 "补全要点" 步骤（focused ask_llm）
  - 反思提到 "no_citation" → 新 plan 提示 ask_llm 必须带 [1] [2] 引用
`
    : ''
}

【用户最新消息】
${lastMessage}

【规划原则】
1. 步骤之间有逻辑顺序（先查再分析）
2. 每步只做一件事
3. 步骤数 2-6 步，不要过度拆分
4. 如果需要搜索/记忆召回，放在前面（信息收集优先）
5. 面试场景最后一步通常是 ask_llm（生成回复或下一道题）
6. 选择工具时考虑用户偏好设置
7. **Handoffs**: 如果某个步骤需要特定专业能力，指定 specialist 字段路由到对应 Agent
   - 出题/追问 → specialist: interviewer
   - 评分/反馈 → specialist: evaluator
   - 搜索/检索 → specialist: searcher
   - 其他 → specialist: general（或不指定）`,
            },
        ], config);

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
