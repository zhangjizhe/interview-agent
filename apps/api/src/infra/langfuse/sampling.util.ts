/**
 * Langfuse 采样决策工具（独立文件）
 *
 * 独立文件：避免 langfuse.service.ts 拉入 langfuse SDK（@langfuse/* 用 dynamic import，
 * 在 Node 18 + Jest 30 ESM 模式下 ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG）。
 *
 * R-P2-11 修复：原 Math.random() 不可复现，同一请求重试时采样结果不同，
 * 导致 trace 数据碎片化。改用 hash(seed) % 100 < rate*100 决策。
 */

export interface SampleRate {
  trace: number;
  span: number;
  generation: number;
}

/**
 * 纯函数版 shouldSample
 *
 * @param sampleRate 三个采样率（trace/span/generation）
 * @param type 当前调用类型
 * @param seed 用于确定性 hash 的字符串（建议 name+sessionId+userId）
 * @returns 是否采样
 */
export function shouldSampleWith(
  sampleRate: SampleRate,
  type: 'trace' | 'span' | 'generation',
  seed?: string,
): boolean {
  const rate = sampleRate[type];
  if (rate >= 1) return true;
  if (rate <= 0) return false;
  if (!seed) {
    // 没传 seed 时回退到随机（不推荐，会失去一致性）
    return Math.random() < rate;
  }
  // 简单 hash：djb2 算法
  let hash = 5381;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) + hash) + seed.charCodeAt(i);
    hash = hash & hash; // 32-bit
  }
  const normalized = Math.abs(hash) / 0x7fffffff; // 0-1
  return normalized < rate;
}
