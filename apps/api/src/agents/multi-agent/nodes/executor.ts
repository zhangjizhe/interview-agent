/**
 * Executor 节点 — 执行 plan 中的当前步骤
 *
 * 职责：
 * 1. 取 state.plan[state.current_step_idx]
 * 2. 根据 step.action 调用对应 MCP tool 或 LLM
 * 3. 将结果追加到 state.past_steps
 * 4. current_step_idx++
 * 5. 执行失败时 retry_count++
 *
 * 为什么不用 ReAct？
 * - ReAct 每步都重新决策下一步做什么，长链路容易跑偏
 * - ReAct 每步都要过 LLM 决策，token 浪费大
 * - Plan-and-Execute 模式：先规划再执行，每步有明确目标
 * - 执行结果可校验，跑偏了 Replanner 能纠正而非从头来
 */
import { ChatOpenAI } from '@langchain/openai';
import type { InterviewAgentStateType, PastStep } from '../state';
import { McpRegistry } from '../../../modules/interview/services/mcp-registry';

/**
 * Executor 节点函数
 */
export function createExecutorNode(model: ChatOpenAI) {
    return async function executorNode(
        state: InterviewAgentStateType,
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
                case 'recall_memory':
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
                    const lastMessage =
                        state.messages[state.messages.length - 1]?.content ?? '';
                    const contextFromPastSteps = state.past_steps
                        .map(
                            (ps) =>
                                `${ps.step.description}: ${(ps.result as string).slice(0, 300)}`,
                        )
                        .join('\n');

                    const llmResponse = await model.invoke([
                        {
                            role: 'system',
                            content: `你是一位专业的 AI 面试官小面。基于以下已收集的信息，完成指定任务。

【已收集信息】
${contextFromPastSteps || '（无）'}

【当前任务】${step.description}`,
                        },
                        { role: 'user', content: lastMessage },
                    ]);

                    result = llmResponse.content as string;
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
        };
    };
}
