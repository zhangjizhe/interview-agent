/**
 * Web Vitals 性能监控
 *
 * 采集 LCP / INP / CLS / FID / TTFB 五大核心指标
 * 上报到后端 /api/metrics/vitals 接口
 *
 * 面试亮点：前端可观测性闭环 — 采集 → 上报 → Langfuse 关联
 */

type MetricName = 'LCP' | 'INP' | 'CLS' | 'FID' | 'TTFB';

interface VitalMetric {
  name: MetricName;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta: number;
  navigationType: string;
  url: string;
  timestamp: number;
}

// 评级阈值（Google Core Web Vitals 标准）
const THRESHOLDS: Record<MetricName, [number, number]> = {
  LCP: [2500, 4000],
  INP: [200, 500],
  CLS: [0.1, 0.25],
  FID: [100, 300],
  TTFB: [800, 1800],
};

function getRating(name: MetricName, value: number): VitalMetric['rating'] {
  const [good, poor] = THRESHOLDS[name];
  if (value <= good) return 'good';
  if (value <= poor) return 'needs-improvement';
  return 'poor';
}

// 批量上报缓冲
let buffer: VitalMetric[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  if (buffer.length === 0) return;
  const payload = buffer.slice();
  buffer = [];
  flushTimer = null;

  // 使用 sendBeacon 确保页面关闭时也能上报
  const blob = new Blob([JSON.stringify({ vitals: payload })], {
    type: 'application/json',
  });
  const sent = navigator.sendBeacon?.('/api/metrics/vitals', blob);
  if (!sent) {
    // sendBeacon 失败时 fallback 到 fetch
    fetch('/api/metrics/vitals', {
      method: 'POST',
      body: JSON.stringify({ vitals: payload }),
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
    }).catch(() => {});
  }
}

function report(metric: VitalMetric) {
  buffer.push(metric);
  // 最多缓存 5 条或 3 秒后批量上报
  if (buffer.length >= 5) {
    flush();
  } else if (!flushTimer) {
    flushTimer = setTimeout(flush, 3000);
  }
}

/**
 * 采集 PerformanceObserver 指标
 */
function observeLCP() {
  try {
    const po = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last) {
        report({
          name: 'LCP',
          value: last.startTime,
          rating: getRating('LCP', last.startTime),
          delta: last.startTime,
          navigationType: (last as any).navigationType || 'navigate',
          url: location.href,
          timestamp: Date.now(),
        });
      }
    });
    po.observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {}
}

function observeCLS() {
  try {
    let sessionValue = 0;
    const po = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!(entry as any).hadRecentInput) {
          sessionValue += (entry as any).value;
        }
      }
      report({
        name: 'CLS',
        value: sessionValue,
        rating: getRating('CLS', sessionValue),
        delta: sessionValue,
        navigationType: 'navigate',
        url: location.href,
        timestamp: Date.now(),
      });
    });
    po.observe({ type: 'layout-shift', buffered: true });
  } catch {}
}

function observeINP() {
  try {
    let worst = 0;
    const po = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const duration = (entry as any).duration || 0;
        if (duration > worst) worst = duration;
      }
    });
    po.observe({ type: 'event', buffered: true });
    // 页面隐藏时上报最差 INP
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && worst > 0) {
        report({
          name: 'INP',
          value: worst,
          rating: getRating('INP', worst),
          delta: worst,
          navigationType: 'navigate',
          url: location.href,
          timestamp: Date.now(),
        });
      }
    });
  } catch {}
}

function observeTTFB() {
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    if (nav) {
      const value = nav.responseStart - nav.requestStart;
      report({
        name: 'TTFB',
        value,
        rating: getRating('TTFB', value),
        delta: value,
        navigationType: nav.type,
        url: location.href,
        timestamp: Date.now(),
      });
    }
  } catch {}
}

/**
 * 初始化 Web Vitals 采集
 * 在 App 入口调用一次即可
 */
export function initWebVitals() {
  if (typeof window === 'undefined') return;
  observeLCP();
  observeCLS();
  observeINP();
  observeTTFB();
  // 页面关闭时强制 flush
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}
