/**
 * EmptyState 通用组件（2026-06-28 R-AUTH-4 UI 改造）
 *
 * 3 种 size：sm / md / lg
 * 5 种语义：no-data / no-result / error / loading / no-permission
 * 可选 primary/secondary CTA
 */
import { ReactNode } from 'react';
import { Database, SearchX, AlertCircle, Loader2, Lock, Inbox } from 'lucide-react';

export type EmptyVariant = 'no-data' | 'no-result' | 'error' | 'no-permission';

interface EmptyStateProps {
  variant?: EmptyVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  title: string;
  description?: string;
  primaryAction?: { label: string; onClick: () => void; icon?: ReactNode };
  secondaryAction?: { label: string; onClick: () => void };
  children?: ReactNode;
}

const ICON_MAP = {
  'no-data': Database,
  'no-result': SearchX,
  'error': AlertCircle,
  'no-permission': Lock,
};

const ICON_COLOR = {
  'no-data': 'text-slate-300',
  'no-result': 'text-slate-300',
  'error': 'text-red-400',
  'no-permission': 'text-slate-300',
};

const SIZE_PADDING = {
  sm: 'py-8',
  md: 'py-12',
  lg: 'py-20',
};

const SIZE_ICON = {
  sm: 'w-8 h-8',
  md: 'w-12 h-12',
  lg: 'w-16 h-16',
};

const SIZE_TITLE = {
  sm: 'text-sm font-medium',
  md: 'text-base font-semibold',
  lg: 'text-lg font-semibold',
};

export function EmptyState({
  variant = 'no-data',
  size = 'md',
  icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  children,
}: EmptyStateProps) {
  const DefaultIcon = ICON_MAP[variant];
  const Icon = icon ?? <DefaultIcon className={`${SIZE_ICON[size]} ${ICON_COLOR[variant]} mx-auto`} />;

  return (
    <div className={`text-center ${SIZE_PADDING[size]} px-4`}>
      <div className="mb-3 flex justify-center">{Icon}</div>
      <div className={`${SIZE_TITLE[size]} text-slate-900 mb-1`}>{title}</div>
      {description && (
        <div className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
          {description}
        </div>
      )}
      {(primaryAction || secondaryAction) && (
        <div className="mt-5 flex flex-col sm:flex-row items-center justify-center gap-2">
          {primaryAction && (
            <button
              onClick={primaryAction.onClick}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition shadow-sm hover:shadow-md"
            >
              {primaryAction.icon}
              {primaryAction.label}
            </button>
          )}
          {secondaryAction && (
            <button
              onClick={secondaryAction.onClick}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition"
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

/**
 * 加载中占位（不属于 EmptyState，但放一起方便 import）
 */
interface LoadingStateProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function LoadingState({ message = '加载中...', size = 'md' }: LoadingStateProps) {
  return (
    <div className={`text-center ${SIZE_PADDING[size]} px-4`}>
      <Loader2 className={`${SIZE_ICON[size]} text-blue-500 mx-auto animate-spin mb-3`} />
      <div className="text-sm text-slate-500">{message}</div>
    </div>
  );
}

/**
 * 错误状态（详情版，可带 retry）
 */
interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ title = '加载失败', message, onRetry }: ErrorStateProps) {
  return (
    <EmptyState
      variant="error"
      title={title}
      description={message}
      primaryAction={onRetry ? { label: '重试', onClick: onRetry } : undefined}
    />
  );
}

/**
 * 空 inbox 图标（更轻量的 no-data）
 */
export function InboxEmpty({ title = '暂无内容', description }: { title?: string; description?: string }) {
  return (
    <EmptyState
      variant="no-data"
      icon={<Inbox className="w-10 h-10 text-slate-300 mx-auto" />}
      title={title}
      description={description}
      size="sm"
    />
  );
}
