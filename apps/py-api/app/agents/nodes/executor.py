"""Executor 节点：执行 plan 中的 step（含工具调用 / 记忆召回）"""


async def executor_node(state, llm, config=None, milvus_mem=None, mem0_mem=None) -> dict:
    """依次执行 plan 里的 step，把结果累积到 past_steps"""
    plan = state.get("plan") or []
    past_steps = list(state.get("past_steps") or [])
    executed = []

    for step in plan:
        step_type = step.get("type", "generate_question")
        description = step.get("description", "")

        if step_type == "generate_question":
            # 调用 LLM 出题
            prompt = f"作为 AI Agent 面试官，请出一道题：{description}"
            output = await llm.chat([{"role": "user", "content": prompt}])
            result = {"type": "question", "content": output}

        elif step_type == "evaluate_answer":
            # 评分（简化：用 LLM 直接打分）
            last_answer = state["messages"][-1].content if state["messages"] else ""
            prompt = (
                f"评估这个面试回答：\n{last_answer}\n\n"
                f"评估维度：{description}\n"
                f"返回 JSON: {{'score': 0-100, 'feedback': '...', 'pass': true/false}}"
            )
            raw = await llm.chat([{"role": "user", "content": prompt}])
            result = {"type": "evaluation", "raw": raw}

        elif step_type == "search_knowledge":
            # 从 Milvus/Mem0 召回相关记忆
            if mem0_mem:
                related = await mem0_mem.search(
                    user_id=state.get("user_id", "unknown"),
                    query=description,
                    limit=3,
                )
                result = {"type": "memory_recall", "hits": related}
            else:
                result = {"type": "memory_recall", "hits": []}

        else:
            result = {"type": "unknown", "error": f"Unknown step type: {step_type}"}

        executed.append({
            "step": step,
            "result": result,
            "success": "error" not in result,
        })

    return {
        "past_steps": past_steps + executed,
        "current_specialist": "executor",
    }