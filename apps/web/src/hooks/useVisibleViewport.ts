import { useEffect, type RefObject } from 'react';

/** Fit an overlay/room to the visible area without detecting browser names. */
export function useVisibleViewport(ref: RefObject<HTMLElement>) {
  useEffect(() => {
    const element = ref.current;
    const viewport = window.visualViewport;
    const update = () => {
      const height = viewport?.height ?? window.innerHeight;
      const top = viewport?.offsetTop ?? 0;
      if (!element || !Number.isFinite(height) || height <= 0) return;
      element.style.setProperty('--candidate-visible-height', `${height}px`);
      element.style.setProperty('--candidate-visible-top', `${Number.isFinite(top) ? Math.max(0, top) : 0}px`);
    };
    update();
    window.addEventListener('resize', update);
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    return () => {
      window.removeEventListener('resize', update);
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
    };
  }, [ref]);
}
