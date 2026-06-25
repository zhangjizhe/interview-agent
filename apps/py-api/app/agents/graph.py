"""
LangGraph v0.5 多 Agent 拓扑（对齐 NestJS graph.ts）

拓扑：
   START
     ↓
   supervisor ──→ planner ──→ executor ──→ replanner ──→ reviewer
     │                              │            │            │
     └→ respond_directly            │            │            │
                                   └────────────┘            │
                                                                ↓
                                            reviewer ──→ planner (revise)
                                                                ↓
                                              reviewer → END (approved)
                                              reviewer ──→ hitl_review ──→ END
"""
from typing import Literal
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.types import interrupt, Command

from app.agents.state import InterviewAgentState
from app.agents.nodes.supervisor import supervisor_node, supervisor_router
from app.agents.nodes.planner import planner_node
from app.agents.nodes.executor import executor_node
from app.agents.nodes.replanner import replanner_node, replanner_router
from app.agents.nodes.reviewer import reviewer_node, reviewer_router
from app.llm.qwen_provider import QwenProvider
from app.memory.redis_memory import RedisMemory
from app.memory.milvus_memory import MilvusMemory
from app.memory.mem0_memory import Mem0Memory


INTERVIEW_GRAPH_RECURSION_LIMIT = 60


async def build_interview_graph(
    redis_mem: RedisMemory,
    milvus_mem: MilvusMemory,
    mem0_mem: Mem0Memory,
    settings,
    checkpointer: AsyncPostgresSaver = None,
):
    """
    构建面试多 Agent 图（5 节点 + 2 旁路）

    Returns:
        编译好的 CompiledStateGraph，可直接 graph.stream() / graph.invoke()
    """
    # 初始化 LLM Provider（Qwen via dashscope）
    llm = QwenProvider(
        api_key=settings.QWEN_API_KEY,
        base_url=settings.QWEN_BASE_URL,
        model_name="qwen-plus",
    )

    # 注入记忆到各节点的闭包（LangGraph 节点必须是 async）
    async def _supervisor(state, config=None):
        return await supervisor_node(state, llm, config, redis_mem)

    async def _planner(state, config=None):
        return await planner_node(state, llm, config)

    async def _executor(state, config=None):
        return await executor_node(state, llm, config, milvus_mem, mem0_mem)

    # replanner 是纯路由函数，不调 LLM，直接同步返回
    def _replanner(state, config=None):
        return replanner_node(state, config)

    async def _reviewer(state, config=None):
        return await reviewer_node(state, llm, config, redis_mem)

    # respond_directly 旁路：general_qa 直接 LLM 回复
    async def respond_directly_node(state):
        last_msg = state["messages"][-1]
        user_text = last_msg.content if hasattr(last_msg, "content") else str(last_msg)
        response = await llm.chat([
            {"role": "system", "content": "你是 AI 面试官小面，简洁友好回答，不带 Markdown。"},
            {"role": "user", "content": user_text},
        ])
        from langchain_core.messages import AIMessage
        return {
            "messages": [AIMessage(content=response)],
            "final_response": response,
        }

    # hitl_review 旁路：评分争议 interrupt 暂停
    async def hitl_review_node(state):
        verdict = interrupt("HITL: 评分争议，等待 HR 审批")
        if verdict == "approved":
            from langchain_core.messages import AIMessage
            return {
                "messages": [AIMessage(content=state["final_response"])],
                "hitl_pending": False,
                "hitl_verdict": "approved",
            }
        return {
            "final_response": "",
            "hitl_pending": False,
            "hitl_verdict": "rejected",
        }

    def hitl_review_router(state) -> Literal["end", "planner"]:
        if state.get("hitl_verdict") == "approved" and state.get("final_response"):
            return "end"
        return "planner"

    # 构建 StateGraph
    graph = (
        StateGraph(InterviewAgentState)
        # 注册节点
        .add_node("supervisor", _supervisor)
        .add_node("planner", _planner)
        .add_node("executor", _executor)
        .add_node("replanner", _replanner)
        .add_node("reviewer", _reviewer)
        .add_node("respond_directly", respond_directly_node)
        .add_node("hitl_review", hitl_review_node)
        # 边
        .add_edge(START, "supervisor")
        .add_conditional_edges(
            "supervisor", supervisor_router,
            {"planner": "planner", "respond_directly": "respond_directly"},
        )
        .add_edge("planner", "executor")
        .add_edge("executor", "replanner")
        .add_conditional_edges(
            "replanner", replanner_router,
            {"executor": "executor", "reviewer": "reviewer"},
        )
        .add_conditional_edges(
            "reviewer", reviewer_router,
            {"end": END, "planner": "planner", "hitl_review": "hitl_review"},
        )
        .add_conditional_edges(
            "hitl_review", hitl_review_router,
            {"end": END, "planner": "planner"},
        )
        .add_edge("respond_directly", END)
    )

    return graph.compile(checkpointer=checkpointer)