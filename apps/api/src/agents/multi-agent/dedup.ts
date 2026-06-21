/**
 * 消除 LLM 偶发重复输出
 *
 * 触发场景：reviewer 节点在 retry 时,LLM 概率性输出重复段
 *   （如"嗯，这个细节很有意思......嗯，这个细节很有意思......"）
 * 这种重复会让前端 SSE 流式输出两次相同的文案,体验差。
 *
 * 实现：从大到小尝试找"前半段 == 后半段"的重复块,合并掉。
 * 只处理"前 N 字符 == 后 N 字符"的简单重复（最常见的形式）,
 * 复杂交叉重复不做处理(LLM 实际很少发生,过度处理反而会破坏正常内容)。
 *
 * 调用位置：
 * - reviewer 节点：在 model.stream() 累加完 final_response 后调用
 * - multi-agent.service.stream()：保留旧引用（向后兼容）
 */
export function dedupFinalResponse(text: string): string {
  if (text.length < 20) return text;

  // 从最大可能重复长度(取文本一半,且不超过 300 字符)开始往下找
  const maxSearch = Math.min(300, Math.floor(text.length / 2));
  for (let len = maxSearch; len >= 10; len--) {
    const first = text.slice(0, len);
    const second = text.slice(len, len + len);
    if (first === second) {
      // 找到重复块,合并:前半段 + 后半段之后的内容
      const merged = first + text.slice(len + len);
      // 递归检查合并后是否还有重复（理论上罕见,一次 dedup 通常够用）
      return dedupFinalResponse(merged);
    }
  }
  return text;
}