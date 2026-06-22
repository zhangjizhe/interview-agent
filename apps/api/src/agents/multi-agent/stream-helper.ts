/**
 * Multi-agent 节点流式 LLM 调用 helper
 *
 * 解决的问题：
 * - LangGraph 节点内部既要让外层 streamEvents 监听到 on_chat_model_stream 事件（SSE 流式推前端）
 * - 又要在节点 return 前拿到完整文本写入 state.final_response
 * - 两种需求用同一个 helper 满足，避免 reviewer/respond_directly 各写一遍重复逻辑
 *
 * 链路：
 *   model.stream(messages, config)
 *     → LlmGatewayChatModel._streamResponseChunks
 *     → LlmGateway.streamChat 真流式吐 token
 *     → runManager.handleLLMNewToken 触发 LangChain 回调
 *     → LangGraph streamEvents 转发 on_chat_model_stream
 *     → MultiAgentService.stream 监听到后 yield 给 SSE
 *
 * 为啥不直接 yield 给 service？
 * - LangGraph 节点函数签名是 (state, config) => Promise<Partial<State>>，不支持 async generator
 * - 节点只能 return，不能 yield，所以必须内部累加 fullText 一次性写入 state
 * - 外层靠回调系统拿 token（这是 LangChain/LangGraph 的设计）
 */
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { RunnableConfig } from '@langchain/core/runnables';

export interface StreamCollectResult {
  fullText: string;
  tokenCount: number;
}

/**
 * 流式调用 chat model 并收集完整文本。
 *
 * @param model - LlmGatewayChatModel 实例（必须支持 _streamResponseChunks）
 * @param messages - ChatMessage 数组（OpenAI 格式：role + content）
 * @param config - RunnableConfig（透传 thread_id 等 configurable 字段）
 * @returns { fullText, tokenCount } 完整文本 + token 数
 *
 * 失败行为：抛错给调用方（与原 model.stream() 一致）。调用方应 try/catch 兜底。
 *
 * 调用示例：
 * ```ts
 * const { fullText } = await collectStreamText(model, [
 *   { role: 'system', content: '你是...' },
 *   { role: 'user', content: lastMessage },
 * ], config);
 * return { final_response: fullText, ... };
 * ```
 */
export async function collectStreamText(
  model: BaseChatModel,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  config?: RunnableConfig,
): Promise<StreamCollectResult> {
  let fullText = '';
  let tokenCount = 0;
  const stream = await model.stream(messages, config);
  for await (const chunk of stream) {
    const piece = typeof chunk.content === 'string' ? chunk.content : '';
    if (piece) {
      fullText += piece;
      tokenCount++;
    }
  }
  return { fullText, tokenCount };
}
