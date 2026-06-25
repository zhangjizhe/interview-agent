"""Interview 路由（多 Agent 流式 / 同步，对齐 NestJS interview.controller.ts）"""
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List, AsyncGenerator
import json

from app.agents.state import create_initial_state

router = APIRouter()


class InterviewStartRequest(BaseModel):
    user_id: str
    user_message: str
    thread_id: Optional[str] = None


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

    initial = create_initial_state(req.user_message)
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

    # 同步执行
    result = await graph.ainvoke(initial, config=config)

    # 提取 final_response
    final = result.get("final_response") or "（暂无回复）"

    # L2 写 AI 回复
    if redis_mem:
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

    initial = create_initial_state(req.user_message)
    config = {"configurable": {"thread_id": req.thread_id or req.user_id}}

    async def event_generator() -> AsyncGenerator[str, None]:
        async for chunk in graph.astream(initial, config=config, stream_mode="values"):
            state = chunk if isinstance(chunk, dict) else {}
            current_node = state.get("current_specialist", "")

            if state.get("final_response"):
                yield f"data: {json.dumps({'type': 'final_response', 'content': state['final_response'], 'node': current_node}, ensure_ascii=False)}\n\n"

            yield f"data: {json.dumps({'type': 'node', 'node': current_node}, ensure_ascii=False)}\n\n"

        yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")