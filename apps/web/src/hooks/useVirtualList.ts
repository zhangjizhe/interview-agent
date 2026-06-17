import { useRef, useState, useEffect, useCallback } from 'react';

/**
 * 轻量虚拟列表 hook — 只渲染可视区域 + 缓冲区的消息
 * 避免长对话场景下 DOM 节点过多导致卡顿
 *
 * 面试亮点：自研虚拟滚动，不依赖第三方库，基于 scrollHeight 差值估算
 */
export function useVirtualList<T>(
  items: T[],
  options: {
    itemHeight: number;     // 预估每条高度
    overscan?: number;      // 上下缓冲条数
    containerRef: React.RefObject<HTMLDivElement | null>;
  },
) {
  const { itemHeight, overscan = 5, containerRef } = options;
  const [scrollTop, setScrollTop] = useState(0);
  const rafRef = useRef<number>(0);

  const containerHeight = containerRef.current?.clientHeight ?? 600;

  const handleScroll = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setScrollTop(containerRef.current?.scrollTop ?? 0);
    });
  }, [containerRef]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', handleScroll);
      cancelAnimationFrame(rafRef.current);
    };
  }, [containerRef, handleScroll]);

  const totalHeight = items.length * itemHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    items.length,
    Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan,
  );
  const visibleItems = items.slice(startIndex, endIndex);
  const offsetY = startIndex * itemHeight;

  return { visibleItems, startIndex, endIndex, totalHeight, offsetY };
}
