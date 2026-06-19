/**
 * 面试多 Agent 图拓扑定义
 *
 * 基于 LangGraph StateGraph v1.x
 *
 * 拓扑结构：
 *
 *   START
 *     │
 *     ▼
 *   supervisor ──→ planner ──→ executor ──→ replanner ──→ reviewer
 *     │                              │            │            │
 *     └→ respond_directly            │            │            │
 *                                   └────────────┘            │
 *                                   (replan → executor)       │
 *                                                                │
 *                                            reviewer ──→ planner
 *                                            (revise → replan) │
 *                                                                │
 *                                              reviewer → END
 *                                              (approved)
 *
 *   reviewer ──→ hitl_review ──→ END (HR approved)
 *                (interrupt)
 *
 * 条件边：
 * 1. supervisor → planner | respond_directly   （按意图路由）
 * 2. replanner → executor | reviewer           （按执行状态路由）
 * 3. reviewer → END | planner | hitl_review    （通过/打回/HITL中断）
 * 4. hitl_review → END                         （interrupt 暂停，HR 审批后 Command(resume) 恢复）
 */
import { StateGraph, END, START, interrupt, Command } from '@langchain/langgraph';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { InterviewAgentState, type InterviewAgentStateType } from './state';
export type { InterviewAgentStateType } from './state';
import { createSupervisorNode, supervisorRouter } from './nodes/supervisor';
import { createPlannerNode } from './nodes/planner';
import { createExecutorNode } from './nodes/executor';
import { createReplannerNode, replannerRouter } from './nodes/replanner';
import { createReviewerNode, reviewerRouter } from './nodes/reviewer';
import { LlmGatewayChatModel } from './llm-gateway-chat-model';
import { HumanMessage, AIMessage, BaseMessage } from 'langchain';
import { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
export interface StreamChunk {
  type: 'token' | 'step' | 'final_response' | 'error' | 'hitl_pending';
  content?: string;
  step?: string;
  node?: string;
  error?: string;
  hitlData?: { interviewId: string; score: number; issues: string[] };
}

/**
 * 构建面试多 Agent 图
 *
 * @param model - ChatOpenAI 实例（传入已配置好的 Qwen/DeepSeek 模型）
 * @returns 编译好的 LangGraph CompiledStateGraph
 *
 * @example
 * ```typescript
 * const model = new ChatOpenAI({
 *   modelName: 'qwen-plus',
 *   apiKey: process.env.QWEN_API_KEY,
 *   configuration: { baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
 * });
 *
 * const graph = buildInterviewGraph(model);
 * const result = await graph.invoke({
 *   messages: [new HumanMessage('帮我面试一下 AI Agent 工程师')],
 * });
 *
 * console.log(result.final_response);
 * ```
 */
export function buildInterviewGraph(
  model: LlmGatewayChatModel,
  checkpointer?: BaseCheckpointSaver,
) {
    // 创建节点函数
    const supervisorNode = createSupervisorNode(model);
    const plannerNode = createPlannerNode(model);
    const executorNode = createExecutorNode(model);
    const replannerNode = createReplannerNode(model);
    const reviewerNode = createReviewerNode(model);

    // respond_directly 节点：general_qa 直接调 LLM 回复，不走规划
    const respondDirectlyNode = async (
        state: InterviewAgentStateType,
        config?: any,
    ): Promise<Partial<InterviewAgentStateType>> => {
        const lastMessage =
            state.messages[state.messages.length - 1]?.content ?? '';
        const response = await model.invoke([
            {
                role: 'system',
                content:
                    '你是一位专业的 AI 面试官小面。请简洁友好地回答用户的问题，自然口语化，不要用 Markdown 标题或列表。',
            },
            { role: 'user', content: lastMessage },
        ], config);
        const text = response.content as string;
        // 既要 push AIMessage 到 messages（让 state 完整 + checkpointer 持久化完整对话），
        // 也要 set final_response（向后兼容 controller 取值）
        return {
            messages: [new AIMessage(text)],
            final_response: text,
        };
    };

    // hitl_review 节点：评分争议时 interrupt 暂停，等待 HR 审批
    // HR 审批后通过 Command(resume) 恢复，resume value = 'approved' | 'rejected'
    const hitlReviewNode = async (
        state: InterviewAgentStateType,
    ): Promise<Partial<InterviewAgentStateType>> => {
        // 调用 interrupt() 暂停图执行，等待外部输入
        // resume value 由 HR 审批端点传入：'approved' 或 'rejected'
        const verdict = (interrupt as any)(
            'HITL: 评分争议，等待 HR 审批',
        ) as 'approved' | 'rejected';

        if (verdict === 'approved') {
            // HR 批准：使用 reviewer 的草稿 final_response
            return {
                messages: [new AIMessage(state.final_response)],
                hitl_pending: false,
                hitl_verdict: 'approved',
                // final_response 保持不变（reviewer 已设置）
            };
        }

        // HR 拒绝：打回重做
        return {
            final_response: '',
            hitl_pending: false,
            hitl_verdict: 'rejected',
        };
    };

    // hitl_review 条件路由：approved → END，rejected → planner
    const hitlReviewRouter = (
        state: InterviewAgentStateType,
    ): 'end' | 'planner' => {
        if (state.hitl_verdict === 'approved' && state.final_response) {
            return 'end';
        }
        return 'planner';
    };

    // 构建 StateGraph
    const graph = new StateGraph(InterviewAgentState)
        // ── 注册节点 ──
        .addNode('supervisor', supervisorNode)
        .addNode('planner', plannerNode)
        .addNode('executor', executorNode)
        .addNode('replanner', replannerNode)
        .addNode('reviewer', reviewerNode)
        .addNode('respond_directly', respondDirectlyNode)
        .addNode('hitl_review', hitlReviewNode)

        // ── 定义边 ──

        // START → supervisor
        .addEdge(START, 'supervisor')

        // supervisor 条件路由
        .addConditionalEdges('supervisor', supervisorRouter, {
            planner: 'planner',
            respond_directly: 'respond_directly',
        })

        // planner → executor（固定边：规划完就执行）
        .addEdge('planner', 'executor')

        // executor → replanner（固定边：执行完就判断下一步）
        .addEdge('executor', 'replanner')

        // replanner 条件路由
        .addConditionalEdges('replanner', replannerRouter, {
            executor: 'executor',
            reviewer: 'reviewer',
        })

        // reviewer 条件路由（含 HITL 中断）
        .addConditionalEdges('reviewer', reviewerRouter, {
            end: END,
            planner: 'planner',
            hitl_review: 'hitl_review',
        })

        // hitl_review 条件路由（HR 审批后恢复）
        .addConditionalEdges('hitl_review', hitlReviewRouter, {
            end: END,
            planner: 'planner',
        })

        // respond_directly → END
        .addEdge('respond_directly', END);

    return graph.compile({ checkpointer });
}
