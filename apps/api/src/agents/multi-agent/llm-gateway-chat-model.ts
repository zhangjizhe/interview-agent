/**
 * LlmGatewayChatModel - LangChain BaseChatModel 适配器
 *
 * 目的：让 LangGraph 节点能透明地走 LlmGatewayService
 * 收益：multi 模式也能享受缓存、降级、成本追踪
 *
 * 实现：
 * - 继承 BaseChatModel
 * - _generate() 内部调 this.llmGateway.chat()
 * - 这样 LangChain 的 model.invoke() 实际是调 LlmGateway
 *
 * 关键设计：threadId 透传
 * - LangChain v1.x 的 BaseChatModel._generate 拿到的 options 是 ParsedCallOptions
 *   （RunnableConfig 已经被剥离了 configurable 等字段）—— _generate 里拿不到 thread_id
 * - 各 LangGraph 节点也未必会把 config 透传到 model.withStructuredOutput().invoke()
 * - 解法：用 AsyncLocalStorage 在 run/stream 入口处设 threadId，
 *   _generate 从 ALS 读出来，链路最稳定
 */
import { AsyncLocalStorage } from 'async_hooks';
import { BaseChatModel, type BaseChatModelParams } from '@langchain/core/language_models/chat_models';
import {
  AIMessage,
  BaseMessage,
  ChatMessage,
  HumanMessage,
  SystemMessage,
  type MessageContent,
  type MessageContentText,
} from '@langchain/core/messages';
import { ChatResult } from '@langchain/core/outputs';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import type { LlmGatewayService } from '../../modules/llm/llm.gateway.service';

export interface LlmGatewayChatModelFields extends BaseChatModelParams {
  llmGateway: LlmGatewayService;
  provider: 'qwen' | 'deepseek';
  interviewId?: string;
  userId?: string;
}

/**
 * 跨 async 调用栈的 threadId 上下文
 * MultiAgentService.run/stream 用 threadIdStorage.run({threadId, userId}, ...) 包装，
 * _generate 读这个 store 拿真实 sessionId —— 避免硬编码 'unknown' 触发 session_costs FK 违反
 */
interface ThreadContext {
  threadId?: string;
  userId?: string;
}
export const threadIdStorage = new AsyncLocalStorage<ThreadContext>();

export class LlmGatewayChatModel extends BaseChatModel {
  lc_namespace = ['interview-agent', 'custom'];

  private llmGateway: LlmGatewayService;
  private provider: 'qwen' | 'deepseek';
  private interviewId: string;
  private userId: string;

  constructor(fields: LlmGatewayChatModelFields) {
    super(fields);
    this.llmGateway = fields.llmGateway;
    this.provider = fields.provider;
    this.interviewId = fields.interviewId || 'unknown';
    this.userId = fields.userId || 'anonymous';

    // LangChain v1.x：父类 lc_serializable 是 property，子类 override 必须用同样的方式
    // 用 defineProperty 在实例上覆盖，避免 TS2611 冲突
    Object.defineProperty(this, 'lc_serializable', {
      value: false,
      writable: true,
      configurable: true,
    });
  }

  getModelName(): string {
    return this.provider;
  }

  /**
   * LangChain 内部调这个方法生成内容
   * 这里转给 LlmGateway，承接缓存、降级、成本埋点
   */
  async _generate(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
    _runManager?: CallbackManagerForLLMRun,
  ): Promise<ChatResult> {
    // 拿真实 sessionId：
    //   优先级 1: AsyncLocalStorage 上下文（MultiAgentService 入口设置的 threadId）
    //   优先级 2: LangChain options 里的字段（兜底，多数情况下已被剥离）
    //   优先级 3: 构造时传的 interviewId（fallback）
    //   优先级 4: 'unknown'（最后兜底）
    const ctx = threadIdStorage.getStore();
    const optionThreadId =
      (options as any)?.config?.configurable?.thread_id
      ?? (options as any)?.configurable?.thread_id
      ?? (options as any)?.runId
      ?? (options as any)?.thread_id;
    const threadId = ctx?.threadId ?? optionThreadId;
    const resolvedInterviewId = (typeof threadId === 'string' && threadId.length > 0)
      ? threadId
      : this.interviewId;
    const resolvedUserId = ctx?.userId ?? this.userId;

    const gatewayMessages = messages.map((m) => {
      const content = typeof m.content === 'string' ? m.content : this.extractText(m.content);
      // LangChain v1.x: _getType() → getType() (private → public)
      const mtype = m.getType ? m.getType() : (m as any)._getType?.();
      if (mtype === 'system') return { role: 'system' as const, content };
      if (mtype === 'human') return { role: 'user' as const, content };
      if (mtype === 'ai') return { role: 'assistant' as const, content };
      return { role: 'user' as const, content };
    });

    const response = await this.llmGateway.chat(
      {
        messages: gatewayMessages,
        interviewId: resolvedInterviewId,
        userId: resolvedUserId,
      },
      this.provider,
    );

    const aiMessage = new AIMessage(response.content);
    return {
      generations: [
        {
          text: response.content,
          message: aiMessage,
        },
      ],
      llmOutput: {
        tokenUsage: response.usage,
        model_name: response.model,
        finish_reason: response.finishReason,
      },
    };
  }

  private extractText(content: MessageContent): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .map((c) => (typeof c === 'string' ? c : (c as MessageContentText).text || ''))
        .join('');
    }
    return (content as MessageContentText).text || '';
  }

  _llmType(): string {
    return 'llm-gateway';
  }

  /**
   * LangChain v1.x 的 withStructuredOutput 走 tool calling 路径时需要 model.bindTools()
   * LlmGateway 本身不暴露 tool calling，所以重写 withStructuredOutput 让它走 prompt-based JSON 路径：
   * 1. 调 _generate 拿到 LLM 完整 content
   * 2. 用 safeJsonParse 解析成对象
   * 3. 用 zod schema 验证
   *
   * 这样 LangGraph 的 supervisor/planner/reviewer 用 `model.withStructuredOutput(zodSchema).invoke(...)` 时
   * 不用管 tool calling 细节，LlmGateway 当作纯 prompt-based JSON 模型用。
   */
  withStructuredOutput(schema: any, _options?: any): any {
    const model = this;
    // P0 修复：把 zod schema 递归 dump 到 prompt（含嵌套 object/array），让 LLM 知道字段怎么命名
    const describeField = (v: any, depth = 0): string => {
      const def = (v as any)?._def;
      if (!def) return 'any';
      const t = def.typeName;
      if (t === 'ZodString') return 'string';
      if (t === 'ZodNumber') return 'number';
      if (t === 'ZodBoolean') return 'boolean';
      if (t === 'ZodEnum') return `enum(${def.values.map((x: any) => JSON.stringify(x)).join('|')})`;
      if (t === 'ZodOptional') return `${describeField(def.innerType, depth)} (optional)`;
      if (t === 'ZodArray') {
        const inner = describeField(def.type, depth + 1);
        return `[${inner}]`;
      }
      if (t === 'ZodObject') {
        const shape = def.shape?.();
        if (!shape || depth > 2) return 'object';
        const sub = Object.entries(shape).map(([k2, v2]) => `      "${k2}": ${describeField(v2, depth + 1)}`).join(',\n');
        return `{\n${sub}\n    }`;
      }
      if (t === 'ZodRecord') return 'record';
      if (t === 'ZodAny') return 'any';
      return 'unknown';
    };
    const schemaDump = (s: any): string => {
      if (!s || typeof s.parse !== 'function') return '';
      const shape = s._def?.shape?.() || s._def?.schema?._def?.shape?.() || s.shape;
      if (!shape) return '';
      const lines = Object.entries(shape).map(([k, v]) => {
        const def = (v as any)._def;
        const desc = def?.description ? ` // ${def.description}` : '';
        return `  "${k}": ${describeField(v, 0)}${desc}`;
      });
      return `\n\n【输出 JSON Schema】必须用以下**精确字段名和类型**（不要拼错、不要自创字段名）：\n{\n${lines.join(',\n')}\n}`;
    };
    const jsonInstruction = `\n\n【输出格式要求】必须严格输出**纯 JSON 对象**（不要 markdown 代码块、不要任何额外文字/解释/前缀）。` + schemaDump(schema);
    const executor = {
      async invoke(input: any, options?: any): Promise<any> {
        const messages = Array.isArray(input) ? input : [input];
        // 注入 JSON 输出指示到 system prompt
        const augmentedMessages = (messages as any[]).map((m, i) => {
          if (i === 0 && m && m.role === 'system') {
            return { ...m, content: (m.content || '') + jsonInstruction };
          }
          return m;
        });
        if (!augmentedMessages[0] || augmentedMessages[0].role !== 'system') {
          augmentedMessages.unshift({ role: 'system', content: '你是一个 JSON 输出助手。' + jsonInstruction });
        }
        const result = await model._generate(augmentedMessages as any, options || {});
        const text = result.generations[0]?.text ?? '';
// 鲁棒解析：去掉 markdown fence + 提取首尾 {} 区间（应对 LLM 在 JSON 前后加中文解释）
        let cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
          cleaned = cleaned.slice(firstBrace, lastBrace + 1);
        }
        try {
          const parsed = JSON.parse(cleaned);
          // zod 验证（如果有 schema.parse）
          if (schema && typeof schema.parse === 'function') {
            return schema.parse(parsed);
          }
          return parsed;
        } catch (err: any) {
          throw new Error(
            `withStructuredOutput: failed to parse LLM output as JSON.\n` +
            `Output: ${text.slice(0, 500)}\n` +
            `Parse error: ${err.message}`,
          );
        }
      },
      async stream(_input: any): Promise<any> {
        throw new Error('withStructuredOutput.stream not supported on LlmGatewayChatModel');
      },
    };
    return executor;
  }
}
