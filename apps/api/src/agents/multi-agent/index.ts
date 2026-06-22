/**
 * 面试多 Agent 入口 — 导出工厂函数
 *
 * 用法：
 * ```typescript
 * import { createInterviewAgent, runInterviewAgent } from './agents/multi-agent';
 *
 * // 创建 Agent 实例
 * const agent = createInterviewAgent({
 *   apiKey: process.env.QWEN_API_KEY,
 *   baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
 *   modelName: 'qwen-plus',
 *   temperature: 0.7,
 * });
 *
 * // 便捷调用
 * const result = await runInterviewAgent(agent, '开始面试 AI Agent 工程师', {
 *   userId: 'user-123',
 *   position: 'AI Agent 工程师',
 * });
 *
 * console.log(result.response);   // 最终回复
 * console.log(result.intent);     // 意图分类
 * console.log(result.plan);        // 执行计划
 * console.log(result.pastSteps);   // 执行步骤
 * ```
 */
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage } from 'langchain';
import { buildInterviewGraph, INTERVIEW_GRAPH_RECURSION_LIMIT } from './graph';
import type { InterviewAgentStateType } from './state';

// ── Re-export 公共类型 ──────────────────────────────────────────
export type {
    InterviewAgentStateType,
    PlanStep,
    PastStep,
    UserIntent,
    ReplanDecision,
    ReviewVerdict,
} from './state';

export { InterviewAgentState } from './state';

/**
 * Agent 配置
 */
export interface InterviewAgentConfig {
    /** API Key */
    apiKey: string;
    /** OpenAI 兼容协议 baseURL */
    baseURL: string;
    /** 模型名，默认 qwen-plus */
    modelName?: string;
    /** 温度，默认 0.7 */
    temperature?: number;
}

/**
 * 创建面试多 Agent 实例
 *
 * 内部封装 ChatOpenAI + buildInterviewGraph，返回编译好的图。
 * 同一个 config 可以创建多个 agent 实例（无状态，每次 invoke 独立）。
 *
 * 注意：multi-agent.service.ts 的生产路径已经走 LlmGatewayChatModel；
 * 这个工厂函数保留 ChatOpenAI 是给 standalone 用例（不接入 LlmGateway）
 */
export function createInterviewAgent(config: InterviewAgentConfig) {
    const model = new ChatOpenAI({
        modelName: config.modelName || 'qwen-plus',
        apiKey: config.apiKey,
        configuration: { baseURL: config.baseURL },
        temperature: config.temperature ?? 0.7,
    });

    return buildInterviewGraph(model as any);
}

/**
 * 便捷调用函数 — 传入用户消息，返回结构化结果
 *
 * @param agent - createInterviewAgent() 创建的图实例
 * @param userMessage - 用户输入
 * @param options - 可选：userId / position（透传到 state，供工具使用）
 */
export async function runInterviewAgent(
    agent: ReturnType<typeof createInterviewAgent>,
    userMessage: string,
    options?: {
        userId?: string;
        position?: string;
    },
): Promise<{
    /** 最终给用户的回复 */
    response: string;
    /** 意图分类 */
    intent: string;
    /** 执行计划 */
    plan: InterviewAgentStateType['plan'];
    /** 已执行步骤 */
    pastSteps: InterviewAgentStateType['past_steps'];
    /** 总调用次数（用于估算 token） */
    steps: number;
}> {
    // P0-7 修复：传 recursionLimit 给 invoke，触发 GraphRecursionError 兜底
    const result = await agent.invoke(
        {
            messages: [new HumanMessage(userMessage)],
        } as Partial<InterviewAgentStateType>,
        { recursionLimit: INTERVIEW_GRAPH_RECURSION_LIMIT },
    );

    return {
        response: result.final_response || '',
        intent: result.user_intent,
        plan: result.plan,
        pastSteps: result.past_steps,
        steps: result.past_steps.length,
    };
}

/**
 * 流式调用函数（备选，如前端需要 SSE）
 *
 * 注意：LangGraph StateGraph 原生支持流式，
 * 但面试场景 token 量不大，优先用 runInterviewAgent 同步调用。
 *
 * stream() 每次 yield 整个 state（不是 delta），
 * 所以我们取 chunk.final_response（字符串）作为 token 输出。
 */
export async function* streamInterviewAgent(
    agent: ReturnType<typeof createInterviewAgent>,
    userMessage: string,
): AsyncGenerator<string> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stream = await (agent as any).stream({
        messages: [new HumanMessage(userMessage)],
    } as Partial<InterviewAgentStateType>);

    for await (const chunk of stream) {
        // LangGraph stream 每次返回完整 state，取 final_response 字段
        const state = chunk as InterviewAgentStateType;
        if (state?.final_response) {
            yield state.final_response as string;
        }
    }
}
