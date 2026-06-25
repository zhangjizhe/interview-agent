"""自定义异常类 · 2026-06-26 商用 best practice

之前：所有错误都用 FastAPI HTTPException + print
现在：业务异常用自定义类，handler 统一格式化响应

异常层级：
- AppError（基类，所有业务异常的根）
  - ValidationError（输入校验）
  - ResourceNotFoundError（资源未找到）
  - ExternalServiceError（外部依赖失败，LLM/Redis/Milvus/Mem0）
  - BusinessError（业务规则违反，e.g. HITL 状态错误）
- HTTPException 由 handler 转 4xx/5xx
"""


class AppError(Exception):
    """所有业务异常的基类"""

    def __init__(
        self,
        message: str,
        code: str = "INTERNAL_ERROR",
        status_code: int = 500,
        details: dict | None = None,
    ):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details or {}

    def to_dict(self) -> dict:
        return {
            "error": self.code,
            "message": self.message,
            "details": self.details,
        }


class ValidationError(AppError):
    """输入校验失败（422）"""

    def __init__(self, message: str, field: str | None = None, details: dict | None = None):
        super().__init__(
            message=message,
            code="VALIDATION_ERROR",
            status_code=422,
            details={"field": field, **(details or {})},
        )


class ResourceNotFoundError(AppError):
    """资源未找到（404）"""

    def __init__(self, message: str, resource: str | None = None, id: str | None = None):
        super().__init__(
            message=message,
            code="NOT_FOUND",
            status_code=404,
            details={"resource": resource, "id": id},
        )


class ExternalServiceError(AppError):
    """外部依赖失败（502/503/504）"""

    def __init__(
        self,
        message: str,
        service: str,
        status_code: int = 503,
        details: dict | None = None,
    ):
        super().__init__(
            message=message,
            code="EXTERNAL_SERVICE_ERROR",
            status_code=status_code,
            details={"service": service, **(details or {})},
        )


class BusinessError(AppError):
    """业务规则违反（400/409）"""

    def __init__(
        self,
        message: str,
        code: str = "BUSINESS_ERROR",
        status_code: int = 400,
        details: dict | None = None,
    ):
        super().__init__(message=message, code=code, status_code=status_code, details=details or {})


class HITLPendingError(BusinessError):
    """HITL 评分争议，需要 HR 审批（409）"""

    def __init__(self, message: str = "评分争议，等待 HR 审批"):
        super().__init__(message=message, code="HITL_PENDING", status_code=409)