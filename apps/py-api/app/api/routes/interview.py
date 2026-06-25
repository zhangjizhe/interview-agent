"""Interview 路由（多 Agent 流式 / 同步，对齐 NestJS interview.controller.ts）

P1-8 修复：用 try/except 包裹 graph.ainvoke / astream，
异常时返回 500 + 降级 token（仿 NestJS multi-agent.stream 的错误边界）。
"""
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List, AsyncGenerator
import json
import structlog

from app.agents.state import create_initial_state

logger = structlog.get_logger(__name__)

router = APIRouter()


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
        await redis_mem.set_working_state(
            req.user_id or "default",
            {
                "last_message_at": str(__import__("datetime").datetime.utcnow().isoformat()),
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
    """SSE 流式输出（对齐 NestJS streamWithSteps）"""
    graph = request.app.state.interview_graph

    if graph is None:
        raise HTTPException(status_code=503, detail="Graph not initialized")

    # P1-6 修复：把 user_id + user_role 注入 state
    initial = create_initial_state(
        user_message=req.user_message,
        user_id=req.user_id,
        user_role=req.user_role,
    )
    config = {"configurable": {"thread_id": req.thread_id or req.user_id}}

    async def event_generator() -> AsyncGenerator[str, None]:
        # P1-8 修复：try/except 包 astream，异常时 yield 降级 event + [DONE]
        # P0-2 修复：用 stream_mode="values"（兼容性最好），节点 token 通过 chunk 检测
        try:
            # values 模式：yield dict state（兼容 LangGraph 0.5.x 所有版本）
            async for state in graph.astream(initial, config=config, stream_mode="values"):
                if not isinstance(state, dict):
                    # 防御：未来 LangGraph 版本可能 yield 其他类型
                    continue

                current_node = state.get("current_specialist", "")
                final_response = state.get("final_response")

                # token 增量：从 messages[-1] 拿最新 AIMessage content（增量推送）
                messages = state.get("messages", [])
                if messages and hasattr(messages[-1], "content") and isinstance(messages[-1].content, str):
                    # 简单 token 化：每行作为一个 token（生产应该用 AIMessageChunk 流式拼接）
                    # 这里 yield final_response 而不是逐 token
                    pass

                # node event
                yield f"data: {json.dumps({'type': 'node', 'node': current_node}, ensure_ascii=False)}\n\n"

                # final_response event（一次性 yield，对齐 NestJS streamWithSteps）
                if final_response:
                    yield f"data: {json.dumps({'type': 'final_response', 'content': final_response, 'node': current_node}, ensure_ascii=False)}\n\n"
        except Exception as e:
            logger.error(
                "graph_astream_failed",
                user_id=req.user_id,
                error=str(e),
                error_type=type(e).__name__,
            )
            # 降级：yield error event + [DONE]，让前端能清理 SSE 连接
            yield f"data: {json.dumps({'type': 'error', 'message': '面试流程异常', 'fallback': '抱歉，面试服务暂时不可用。'}, ensure_ascii=False)}\n\n"

        yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")