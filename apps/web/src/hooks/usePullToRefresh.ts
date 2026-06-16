import { useEffect, useRef, useState, useCallback, MutableRefObject } from 'react';

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void> | void;
  threshold?: number; // 触发刷新的下拉距离
  resistance?: number; // 阻尼系数，0-1，越大越跟手
}

interface UsePullToRefreshReturn {
  pullDistance: number;
  refreshing: boolean;
  pullRef: MutableRefObject<HTMLDivElement | null>;
}

/**
 * 移动端下拉刷新 hook
 * - 仅在容器顶部滚动到顶时触发
 * - 阻尼效果，避免拉太长
 * - 下拉超阈值释放后触发 onRefresh
 */
export function usePullToRefresh({
  onRefresh,
  threshold = 60,
  resistance = 0.4,
}: UsePullToRefreshOptions): UsePullToRefreshReturn {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const pulling = useRef(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
      setPullDistance(0);
    }
  }, [onRefresh]);

  useEffect(() => {
    const el = pullRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (refreshing) return;
      if (el.scrollTop > 0) return; // 已经在滚动，不触发
      startY.current = e.touches[0].clientY;
      pulling.current = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pulling.current || refreshing) return;
      if (el.scrollTop > 0) {
        pulling.current = false;
        setPullDistance(0);
        return;
      }
      const deltaY = (e.touches[0].clientY - startY.current) * resistance;
      if (deltaY > 0) {
        setPullDistance(Math.min(deltaY, threshold * 1.5));
      }
    };

    const onTouchEnd = () => {
      if (!pulling.current) return;
      pulling.current = false;
      if (pullDistance >= threshold && !refreshing) {
        handleRefresh();
      } else {
        setPullDistance(0);
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [pullDistance, refreshing, threshold, resistance, handleRefresh]);

  return { pullDistance, refreshing, pullRef };
}
