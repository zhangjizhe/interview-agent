/**
 * Executor 节点 — 执行 plan 中的当前步骤（含 Handoffs Specialist 路由）
 *
 * 职责：
 * 1. 取 state.plan[state.current_step_idx]
 * 2. 根据 step.action 调用对应 MCP tool 或 LLM
 * 3. 将结果追加到 state.past_steps
 * 4. current_step_idx++
 * 5. 执行失败时 retry_count++
 *
 * Handoffs 扩展：
 * - 如果 step.specialist 指定了 Specialist Agent，使用对应的 system prompt
 * - interviewer: 面试官角色（出题、追问、评估）
 * - evaluator: 评估角色（评分、反馈、报告）
 * - searcher: 搜索角色（联网搜索、信息检索）
 * - general: 通用角色
 */
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { InterviewAgentStateType, PastStep, SpecialistType } from '../state';
import { McpRegistry } from '../../../modules/interview/services/mcp-registry';
import { collectStreamText } from '../stream-helper';

/**
 * Specialist Agent 的 system prompt 映射
 */
const SPECIALIST_PROMPTS: Record<SpecialistType, string> = {
    interviewer: `你是一位资深 AI 面试官。你的职责是：
1. 根据候选人回答的质量，决定追问还是进入下一题
2. 追问要针对回答中的薄弱点，不是简单重复
3. 每次只问一个问题
4. 保持专业、友好、自然口语化
5. 不要用 Markdown 标题或列表`,

    evaluator: `你是一位严格的面试评估专家。你的职责是：
1. 基于评分细则对候选人回答进行评分
2. 评分要客观公正，指出优点和不足
3. 给出具体的改进建议
4. 评估维度：完整性、正确性、深度
5. 输出结构化评分结果`,

    searcher: `你是一位信息检索专家。你的职责是：
1. 根据用户需求搜索相关信息
2. 对搜索结果进行筛选和整理
3. 提取关键信息，去除噪音
4. 确保信息的时效性和准确性
5. 汇总搜索结果供后续使用`,

    general: `你是一位专业的 AI 面试官小面。请基于已收集的信息，完成指定任务。`,
};

/**
 * Executor 节点函数
 */
export function createExecutorNode(model: BaseChatModel) {
    return async function executorNode(
        state: InterviewAgentStateType,
        config?: any,
    ): Promise<Partial<InterviewAgentStateType>> {
        const step = state.plan[state.current_step_idx];

        // Plan 已全部执行完（不应走到这里，但兜底）
        if (!step) {
            return {
                past_steps: [
                    {
                        step: {
                            id: 'noop',
                            action: 'ask_llm',
                            description: '无待执行步骤',
                        },
                        result: 'plan 已执行完毕',
                        success: true,
                    },
                ],
            };
        }

        let result = '';
        let success = false;

        try {
            switch (step.action) {
                case 'search':
                case 'memory_recall':
                case 'query_knowledge_bank':
                case 'generate_question': {
                    // 调用 MCP 工具
                    const tool = McpRegistry.get(step.tool || step.action);
                    if (tool?.execute) {
                        const toolResult = await tool.execute(step.args || {});
                        result =
                            typeof toolResult === 'string'
                                ? toolResult
                                : JSON.stringify(toolResult);
                        success = true;
                    } else {
                        result = `工具 ${step.tool || step.action} 未注册或不可执行`;
                        success = false;
                    }
                    break;
                }

                case 'ask_llm': {
                    // 直接调 LLM 生成内容
                    // Handoffs: 根据 step.specialist 选择对应的 Specialist prompt
                    const lastMsgRaw = state.messages[state.messages.length - 1]?.content;
                    const lastMessage: string = typeof lastMsgRaw === 'string' ? lastMsgRaw : '';
                    const contextFromPastSteps = state.past_steps
                        .map(
                            (ps) =>
                                `${ps.step.description}: ${(ps.result as string).slice(0, 300)}`,
                        )
                        .join('\n');

                    const specialistType: SpecialistType = step.specialist || 'general';
                    const specialistPrompt = SPECIALIST_PROMPTS[specialistType];

                    // 2026-06-23 修复：改用 collectStreamText（model.stream）
                    // 原 model.invoke() 不触发 LangChain on_chat_model_stream 回调，
                    // 前端 SSE 只能等整个 LLM 输出完才一次性 emit（"突然出现全文"）。
                    // 现在用流式调用 + runManager.handleLLMNewToken → LangGraph streamMode
                    // 'messages' 实时 emit AIMessageChunk → SSE 逐字推到前端。
                    const { fullText } = await collectStreamText(model, [
                        {
                            role: 'system',
                            content: `${specialistPrompt}

【已收集信息】
${contextFromPastSteps || '（无）'}

【当前任务】${step.description}`,
                        },
                        { role: 'user', content: lastMessage },
                    ], config);

                    result = fullText;
                    success = true;
                    break;
                }

                default: {
                    result = `未知动作类型: ${step.action}`;
                    success = false;
                }
            }
        } catch (err: any) {
            result = `执行失败: ${err.message}`;
            success = false;
        }

        const pastStep: PastStep = { step, result, success };

        // 只返回增量（由 state reducer 合并到 past_steps），避免全量展开导致并发覆盖 + N² 内存
        return {
            past_steps: [pastStep],
            current_step_idx: state.current_step_idx + 1,
            // 失败时增加 retry_count
            retry_count: success ? state.retry_count : state.retry_count + 1,
            // Handoffs: 记录当前步骤的 specialist（供前端 CoT 面板展示）
            current_specialist: step.specialist || 'general',
        };
    };
}
