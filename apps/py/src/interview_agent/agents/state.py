"""Multi-Agent State — 与 NestJS state.ts 1:1 对齐。

字段对应 NestJS InterviewAgentState（Annotation Root）：
- messages: list（reducer 追加）
- plan / past_steps / user_intent / current_step_idx / final_response /
  retry_count / hitl_pending / hitl_verdict / issue_tags / reflection / current_specialist

用 Pydantic v2 实现，跟 Zod schema 等价。
"""
from typing import Any, Literal

from pydantic import BaseModel, Field


SpecialistType = Literal["interviewer", "evaluator", "searcher", "general"]
PlanAction = Literal["search", "memory_recall", "query_knowledge_bank", "ask_llm", "generate_question"]
UserIntent = Literal["jd_match", "mock_interview", "resume_review", "general_qa"]
ReplanDecision = Literal["continue", "replan", "finish", "respond_directly"]
ReviewVerdict = Literal["approved", "revise"]


class PlanStep(BaseModel):
    id: str
    action: PlanAction
    tool: str | None = None
    args: dict[str, Any] | None = None
    description: str
    specialist: SpecialistType | None = None


class PastStep(BaseModel):
    step: PlanStep
    result: str
    success: bool


class InterviewAgentState(BaseModel):
    """LangGraph State 等价物（Python 端用 Pydantic 表达）。

    messages 用 list 配合 reducer 追加；其他字段 LastValue 覆盖。
    """
    messages: list[dict] = Field(default_factory=list)
    plan: list[PlanStep] = Field(default_factory=list)
    past_steps: list[PastStep] = Field(default_factory=list)
    user_intent: UserIntent | None = None
    current_step_idx: int = 0
    final_response: str | None = None
    retry_count: int = 0
    hitl_pending: bool = False
    hitl_verdict: Literal["approved", "rejected"] | None = None
    issue_tags: list[str] = Field(default_factory=list)
    reflection: str | None = None
    current_specialist: SpecialistType | None = None

    def add_message(self, message: dict) -> None:
        """reducer = addMessages：追加新消息，不丢失历史。"""
        self.messages.append(message)

    def add_past_step(self, step: PastStep) -> None:
        """reducer 合并：增量追加（防止并发覆盖）。"""
        self.past_steps.append(step)