import { useCallback, useEffect, useRef, useState } from 'react';
import { labViewUrl, readLabView, type LabView } from './lab-navigation';

// Keep browser navigation usable without introducing a second router/runtime.
export function useLabNavigation(locked: boolean, dirty = false) {
  const [view, setCurrent] = useState(() => readLabView(window.location.search));
  const acceptedUrl = useRef(window.location.href);
  useEffect(() => {
    const onPop = () => {
      const next = readLabView(window.location.search);
      if (next !== view && (locked || (dirty && !window.confirm('当前有未保存修改，放弃并切换页面？')))) {
        window.history.replaceState(null, '', acceptedUrl.current);
        return;
      }
      acceptedUrl.current = window.location.href;
      setCurrent(next);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [locked, view, dirty]);
  const navigate = useCallback((next: LabView) => {
    if (locked || next === view) return;
    if (dirty && !window.confirm('当前有未保存修改，放弃并切换页面？')) return;
    window.history.pushState(null, '', labViewUrl(next, window.location.href));
    acceptedUrl.current = window.location.href;
    setCurrent(next);
  }, [locked, view, dirty]);
  return [view, navigate] as const;
}
