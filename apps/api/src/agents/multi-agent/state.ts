/**
 * 面试多 Agent 状态定义
 *
 * 基于 LangGraph StateGraph + Annotation 模式
 *
 * Annotation API 规则：
 * - 数组字段（如 messages）：用 { reducer: messagesStateReducer, default: () => [] }
 * - scalar 字段（如 number/string/enum）：直接 Annotation<ScalarType>()（默认 LastValue）
 */
import { Annotation, messagesStateReducer } from '@langchain/langgraph';
import { BaseMessage } from 'langchain';
import { z } from 'zod';

// ============================================================
// Zod Schema（用于 LLM 结构化输出校验）
// ============================================================

/** 单个执行步骤 */
export const PlanStepSchema = z.object({
    id: z.string().describe('步骤唯一标识，如 step-1'),
    action: z
        .enum(['search', 'recall_memory', 'query_knowledge_bank', 'ask_llm', 'generate_question'])
        .describe('动作类型'),
    tool: z.string().optional().describe('MCP 工具名（如 bocha_search）'),
    args: z.record(z.any()).optional().describe('工具参数'),
    description: z.string().describe('步骤描述（人可读）'),
});
export type PlanStep = z.infer<typeof PlanStepSchema>;

/** 已执行步骤 + 结果 */
export const PastStepSchema = z.object({
    step: PlanStepSchema,
    result: z.string().describe('执行结果摘要'),
    success: z.boolean(),
});
export type PastStep = z.infer<typeof PastStepSchema>;

/** 意图分类 */
export const UserIntentSchema = z.enum(['jd_match', 'mock_interview', 'resume_review', 'general_qa']);
export type UserIntent = z.infer<typeof UserIntentSchema>;

/** Replanner 决策 */
export const ReplanDecisionSchema = z.enum(['continue', 'replan', 'finish', 'respond_directly']);
export type ReplanDecision = z.infer<typeof ReplanDecisionSchema>;

/** Reviewer 判定 */
export const ReviewVerdictSchema = z.enum(['approved', 'revise']);
export type ReviewVerdict = z.infer<typeof ReviewVerdictSchema>;

// ============================================================
// State Annotation
// ============================================================

/**
 * 面试多 Agent 全局状态
 *
 * 设计原则：
 * - messages: 用 addMessages reducer 追加（每次更新追加消息，不丢失历史）
 * - plan / past_steps: LastValue 覆盖（每次更新直接替换）
 * - user_intent / current_step_idx / retry_count / final_response: LastValue 覆盖
 */
export const InterviewAgentState = Annotation.Root({
    /**
     * 对话历史。
     * reducer = messagesStateReducer（addMessages）：每次更新时追加新消息，不丢失历史。
     */
    messages: Annotation<BaseMessage[]>({
        reducer: messagesStateReducer,
        default: () => [],
    }),

    /**
     * Planner 生成的步骤列表。
     * 每次重新规划时覆盖。
     */
    plan: Annotation<PlanStep[]>(),

    /**
     * 已执行的步骤 + 结果。
     * 每次 Executor 执行成功后追加。
     */
    past_steps: Annotation<PastStep[]>(),

    /**
     * 意图分类结果（Supervisor 节点写入）。
     */
    user_intent: Annotation<UserIntent>(),

    /**
     * 当前执行到 plan 的第几步（从 0 开始）。
     * Executor 每执行一步 +1。
     */
    current_step_idx: Annotation<number>(),

    /**
     * 最终给用户的回复。
     * Reviewer 审阅通过后写入，有内容表示流程结束。
     */
    final_response: Annotation<string>(),

    /**
     * 失败重试次数（全局计数器）。
     * Executor / Reviewer 执行失败时 +1。
     * >= 3 时强制进入 Reviewer（不死循环兜底）。
     */
    retry_count: Annotation<number>(),
});

export type InterviewAgentStateType = typeof InterviewAgentState.State;
