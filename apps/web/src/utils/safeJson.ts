/**
 * 安全 JSON 解析 — 统一处理 API 返回非 JSON（如 502 nginx HTML 错误页）的情况。
 *
 * 之前 HomePage / InterviewPage 各自定义了相同的 safeJson 函数（审查员 R-P2-17 发现），
 * 现统一到 utils，行为不变。
 *
 * 行为：
 * - res.ok=false 时尝试解析 body 为 JSON；解析失败兜底为 { _error, _status, message }
 * - res.ok=true 时尝试解析 JSON；解析失败兜底为 {}
 */

export async function safeJson(res: Response): Promise<any> {
  const text = await res.text();
  if (!res.ok) {
    try {
      const data = JSON.parse(text);
      return { _error: true, _status: res.status, ...data };
    } catch {
      return { _error: true, _status: res.status, message: `服务不可用 (HTTP ${res.status})` };
    }
  }
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}