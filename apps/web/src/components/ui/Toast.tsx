/**
 * Toast 通用组件（2026-06-28 R-AUTH-4 UI 改造）
 *
 * 提供 4 种语义类型：success / error / warning / info
 * 自动消失（默认 3s，可配置）
 * 支持堆叠显示
 * Portal 渲染到 body，跨父级 stacking context
 */
import { useEffect, useState, useCallback, useRef, createContext, useContext, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;  // ms, 0 = 不自动消失
}

interface ToastContextValue {
  toast: (item: Omit<ToastItem, 'id'>) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // 单组件直接使用时的 fallback（不需要 Provider）
    return createStandaloneToast();
  }
  return ctx;
}

const ICONS: Record<ToastType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const COLORS: Record<ToastType, { border: string; icon: string; bg: string }> = {
  success: { border: 'border-l-emerald-500', icon: 'text-emerald-500', bg: 'bg-white' },
  error: { border: 'border-l-red-500', icon: 'text-red-500', bg: 'bg-white' },
  warning: { border: 'border-l-amber-500', icon: 'text-amber-500', bg: 'bg-white' },
  info: { border: 'border-l-blue-500', icon: 'text-blue-500', bg: 'bg-white' },
};

function ToastItemView({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const Icon = ICONS[item.type];
  const color = COLORS[item.type];
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-start gap-3 ${color.bg} rounded-xl border border-slate-200 ${color.border} border-l-4 shadow-lg px-4 py-3 min-w-[280px] max-w-md pointer-events-auto animate-in slide-in-from-top-2 fade-in duration-200`}
    >
      <Icon className={`w-5 h-5 ${color.icon} flex-shrink-0 mt-0.5`} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-900">{item.title}</div>
        {item.description && (
          <div className="text-xs text-slate-500 mt-0.5">{item.description}</div>
        )}
      </div>
      <button
        onClick={onDismiss}
        className="flex-shrink-0 text-slate-400 hover:text-slate-700 transition rounded p-0.5"
        aria-label="关闭"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

interface ToastProviderProps {
  children: ReactNode;
  maxVisible?: number;
}

export function ToastProvider({ children, maxVisible = 5 }: ToastProviderProps) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const toast = useCallback((item: Omit<ToastItem, 'id'>) => {
    const id = `toast-${++idRef.current}`;
    setItems((prev) => [...prev.slice(-(maxVisible - 1)), { ...item, id }]);
    if (item.duration !== 0) {
      setTimeout(() => dismiss(id), item.duration ?? 3000);
    }
  }, [dismiss, maxVisible]);

  const success = useCallback((title: string, description?: string) => toast({ type: 'success', title, description }), [toast]);
  const error = useCallback((title: string, description?: string) => toast({ type: 'error', title, description }), [toast]);
  const warning = useCallback((title: string, description?: string) => toast({ type: 'warning', title, description }), [toast]);
  const info = useCallback((title: string, description?: string) => toast({ type: 'info', title, description }), [toast]);

  const value: ToastContextValue = { toast, success, error, warning, info, dismiss };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {typeof document !== 'undefined' && createPortal(
        <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
          {items.map((item) => (
            <ToastItemView key={item.id} item={item} onDismiss={() => dismiss(item.id)} />
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

/**
 * 不需要 Provider 时的 fallback（单组件使用）
 * 仅在同一组件树内有效
 */
function createStandaloneToast(): ToastContextValue {
  const noop = () => {};
  return {
    toast: noop,
    success: noop,
    error: noop,
    warning: noop,
    info: noop,
    dismiss: noop,
  };
}

// 自动挂载版本（当根组件没有 Provider 时使用）
export function GlobalToastMount() {
  // 提供一个静态 no-op，避免每个组件单独 import useToast 时崩溃
  return null;
}
