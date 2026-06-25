"""Interview 路由（多 Agent 流式 / 同步，对齐 NestJS interview.controller.ts）

P1-8 修复：用 try/except 包裹 graph.ainvoke / astream，
异常时返回 500 + 降级 token（仿 NestJS multi-agent.stream 的错误边界）。

SSE 逐 token 增量推送（2026-06-26 真流式）：
- 用 asyncio.Queue 边收集边推
- AsyncCallbackHandler.on_chat_model_stream 把 token put 到 queue
- event_generator await queue.get() → 立即 yield SSE event
- 真·流式（不是 graph 跑完才 drain）
"""
import asyncio
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List, AsyncGenerator
import json
import structlog
from langchain_core.callbacks import AsyncCallbackHandler

from app.agents.state import create_initial_state

logger = structlog.get_logger(__name__)

router = APIRouter()


class StreamingTokenCallback(AsyncCallbackHandler):
    """LangChain 异步回调：每个 LLM token 立即 push 到 asyncio.Queue

    真流式核心（2026-06-26）：
    - on_chat_model_stream 是 async，可以直接 await
    - asyncio.Queue 是 async-safe
    - SSE event_generator 协程 await queue.get() 立即 yield → 客户端立即收到
    """

    def __init__(self, queue: asyncio.Queue):
        self.queue = queue

    async def on_chat_model_start(self, *args, **kwargs):
        # 标记节点开始（用于 SSE 追踪）
        await self.queue.put({"type": "node_start"})

    async def on_chat_model_stream(self, token, **kwargs):
        """每个 token 到达时回调 → 立即 push 到 queue"""
        if hasattr(token, "content") and token.content:
            await self.queue.put({"type": "token", "content": token.content})
        elif isinstance(token, str) and token:
            await self.queue.put({"type": "token", "content": token})

    async def on_llm_new_token(self, token, **kwargs):
        """旧 API 兼容（langchain-core < 0.3）"""
        if isinstance(token, str) and token:
            await self.queue.put({"type": "token", "content": token})

    async def on_chat_model_end(self, *args, **kwargs):
        """LLM 调用结束（标记节点结束）"""
        await self.queue.put({"type": "node_end"})


# 保留旧的 TokenCollectorCallback（向后兼容，之前测试用）
class TokenCollectorCallback(AsyncCallbackHandler):
    """LangChain 异步回调：收集 LLM 流式 token（仅测试用）"""

    def __init__(self):
        self.tokens: List[str] = []

    async def on_chat_model_start(self, *args, **kwargs):
        pass

    async def on_chat_model_stream(self, token, **kwargs):
        if hasattr(token, "content") and token.content:
            self.tokens.append(token.content)
        elif isinstance(token, str) and token:
            self.tokens.append(token)

    async def on_llm_new_token(self, token, **kwargs):
        if isinstance(token, str) and token:
            self.tokens.append(token)


class InterviewStartRequest(BaseModel):
    user_id: str
    user_message: str
    thread_id: Optional[str] = None
    user_role: Optional[str] = None  # P1-10 修复：候选人岗位，planner fallback 用


class InterviewStep(BaseModel):
    type: str
    content: Optional[str] = None
    step: Optional[str] = None
    node: Optional[str] = None


@router.post("/start")
async def start_interview(req: InterviewStartRequest, request: Request):
    """启动一次多 Agent 面试（同步返回）"""
    graph = request.app.state.interview_graph
    redis_mem = request.app.state.redis_mem

    if graph is None:
        raise HTTPException(status_code=503, detail="Graph not initialized")

    # P1-6 修复：把 user_id + user_role 注入 state
    initial = create_initial_state(
        user_message=req.user_message,
        user_id=req.user_id,
        user_role=req.user_role,
    )
    config = {"configurable": {"thread_id": req.thread_id or req.user_id}}

    # L1 工作记忆：写入当前 user_intent + session 元信息
    if redis_mem:
        from datetime import datetime, timezone
        await redis_mem.set_working_state(
            req.user_id or "default",
            {
                "last_message_at": datetime.now(timezone.utc).isoformat(),
                "thread_id": req.thread_id or req.user_id or "",
                "status": "running",
            },
        )

    # L2 写入消息
    if redis_mem:
        await redis_mem.append_message(
            req.user_id or "default",
            {"role": "user", "content": req.user_message},
        )

    # 同步执行（P1-8 修复：try/except 包 ainvoke，异常时返回 500 + 降级文案）
    try:
        result = await graph.ainvoke(initial, config=config)
    except Exception as e:
        logger.error(
            "graph_ainvoke_failed",
            user_id=req.user_id,
            error=str(e),
            error_type=type(e).__name__,
        )
        # L1 标记失败
        if redis_mem:
            try:
                await redis_mem.update_working_field(
                    req.user_id or "default", "status", "failed"
                )
            except Exception:
                pass
        raise HTTPException(
            status_code=500,
            detail={
                "error": "interview_failed",
                "message": "面试流程异常，请稍后重试",
                "fallback_message": "抱歉，面试服务暂时不可用，请稍后再试。",
            },
        )

    # 提取 final_response
    final = result.get("final_response") or "（暂无回复）"

    # L2 写 AI 回复
    if redis_mem:
        try:
            await redis_mem.append_message(
                req.user_id or "default",
                {"role": "assistant", "content": final},
            )
            # L1 标记完成
            await redis_mem.update_working_field(
                req.user_id or "default",
                "status",
                "completed",
            )
        except Exception as e:
            logger.warning("redis_write_failed_after_success", error=str(e))

    return {
        "final_response": final,
        "review_score": result.get("review_score"),
        "review_issues": result.get("review_issues"),
        "hitl_pending": result.get("hitl_pending", False),
        "node_path": result.get("current_specialist"),
    }


@router.post("/stream")
async def stream_interview(req: InterviewStartRequest, request: Request):
    """SSE 流式输出（对齐 NestJS streamWithSteps）

    2026-06-26 真流式：
    - asyncio.Queue 收集 LLM token（CallbackHandler put）
    - event_generator 协程 await queue.get() 立即 yield
    - 真·逐 token 推送（不是 graph 跑完才 drain）

    实现：起两个协程
    1. graph 任务：跑 astream(values)，同时 CallbackHandler put token 到 queue
    2. event_generator：循环 await queue.get()，按 type 分类 yield
    """
    graph = request.app.state.interview_graph

    if graph is None:
        raise HTTPException(status_code=503, detail="Graph not initialized")

    # P1-6 修复：把 user_id + user_role 注入 state
    initial = create_initial_state(
        user_message=req.user_message,
        user_id=req.user_id,
        user_role=req.user_role,
    )

    # 真流式：asyncio.Queue（CallbackHandler put / event_generator get）
    token_queue: asyncio.Queue = asyncio.Queue()
    streaming_cb = StreamingTokenCallback(token_queue)

    config = {
        "configurable": {"thread_id": req.thread_id or req.user_id},
        "callbacks": [streaming_cb],
    }

    async def run_graph_and_signal_end():
        """跑 graph + 跑完后 push sentinel（让 event_generator 退出循环）"""
        try:
            async for state in graph.astream(initial, config=config, stream_mode="values"):
                if not isinstance(state, dict):
                    continue
                # 把 state 推到 queue（type=state），让 event_generator 处理
                await token_queue.put({"type": "state", "state": state})
        except Exception as e:
            await token_queue.put({"type": "graph_error", "error": str(e)})
        finally:
            # sentinel：通知 event_generator 退出
            await token_queue.put(None)

    async def event_generator() -> AsyncGenerator[str, None]:
        # 起后台任务跑 graph
        graph_task = asyncio.create_task(run_graph_and_signal_end())
        try:
            while True:
                item = await token_queue.get()
                if item is None:
                    # sentinel：graph 跑完，退出循环
                    break

                if item["type"] == "token":
                    # 真流式：每个 token 立即 push 到客户端
                    yield f"data: {json.dumps({'type': 'token', 'content': item['content']}, ensure_ascii=False)}\n\n"

                elif item["type"] == "node_start":
                    yield f"data: {json.dumps({'type': 'node', 'event': 'start'}, ensure_ascii=False)}\n\n"

                elif item["type"] == "node_end":
                    yield f"data: {json.dumps({'type': 'node', 'event': 'end'}, ensure_ascii=False)}\n\n"

                elif item["type"] == "state":
                    state = item["state"]
                    current_node = state.get("current_specialist", "")
                    final_response = state.get("final_response")
                    # node event
                    yield f"data: {json.dumps({'type': 'node', 'node': current_node}, ensure_ascii=False)}\n\n"
                    # final_response event
                    if final_response:
                        yield f"data: {json.dumps({'type': 'final_response', 'content': final_response, 'node': current_node}, ensure_ascii=False)}\n\n"

                elif item["type"] == "graph_error":
                    logger.error(
                        "graph_streaming_failed",
                        user_id=req.user_id,
                        error=item["error"],
                    )
                    yield f"data: {json.dumps({'type': 'error', 'message': '面试流程异常', 'fallback': '抱歉，面试服务暂时不可用。'}, ensure_ascii=False)}\n\n"

        finally:
            # 确保后台任务完成
            if not graph_task.done():
                graph_task.cancel()
                try:
                    await graph_task
                except asyncio.CancelledError:
                    pass

        yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

    return StreamingResponse(event_generator(), media_type="text/event-stream")