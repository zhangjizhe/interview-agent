/**
 * Skeleton 通用组件（2026-06-28 R-AUTH-4 UI 改造）
 *
 * 提供 3 种 primitive：<Skeleton> (rect) / <SkeletonCircle> / <SkeletonText>
 * 自动 shimmer 动画（CSS keyframes）
 */
import { CSSProperties, ReactNode } from 'react';

interface SkeletonProps {
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  width?: number | string;
  height?: number | string;
  borderRadius?: number | string;
}

/**
 * 矩形骨架（最常用）
 */
export function Skeleton({ className = '', children, style: customStyle, width, height, borderRadius }: SkeletonProps) {
  return (
    <div
      className={`bg-slate-200/70 ${className}`}
      style={{
        width,
        height,
        borderRadius,
        animation: 'shimmer 1.4s ease-in-out infinite',
        ...customStyle,
      }}
    >
      {children}
    </div>
  );
}

interface SkeletonCircleProps {
  size?: number;  // px
  className?: string;
}

export function SkeletonCircle({ size = 32, className = '' }: SkeletonCircleProps) {
  return (
    <div
      className={`bg-slate-200/70 rounded-full ${className}`}
      style={{
        width: size,
        height: size,
        animation: 'shimmer 1.4s ease-in-out infinite',
      }}
    />
  );
}

interface SkeletonTextProps {
  lines?: number;
  className?: string;
  lastLineWidth?: string;  // 例如 '60%'
}

/**
 * 多行文字骨架
 */
export function SkeletonText({ lines = 3, className = '', lastLineWidth = '60%' }: SkeletonTextProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-3 bg-slate-200/70 rounded"
          style={{
            width: i === lines - 1 ? lastLineWidth : '100%',
            animation: 'shimmer 1.4s ease-in-out infinite',
            animationDelay: `${i * 100}ms`,
          }}
        />
      ))}
    </div>
  );
}

/**
 * 题目卡片骨架（QuestionBankPage 用）
 */
export function QuestionCardSkeleton() {
  return (
    <div className="py-3">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <Skeleton style={{ width: 50, height: 16, borderRadius: 4 }} />
            <Skeleton style={{ width: 80, height: 16, borderRadius: 4 }} />
            <Skeleton style={{ width: 30, height: 16, borderRadius: 4 }} />
          </div>
          <Skeleton style={{ height: 14, marginBottom: 6 }} />
          <Skeleton style={{ height: 14, width: '70%' }} />
        </div>
      </div>
    </div>
  );
}

/**
 * 面试记录骨架（HomePage 用）
 */
export function InterviewRowSkeleton() {
  return (
    <div className="px-4 md:px-6 py-3 md:py-4 flex items-center gap-3 md:gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <Skeleton style={{ height: 14, width: '60%' }} />
          <Skeleton style={{ height: 16, width: 60, borderRadius: 4 }} />
        </div>
        <div className="flex items-center gap-3 text-xs">
          <Skeleton style={{ height: 11, width: 90 }} />
          <Skeleton style={{ height: 11, width: 60 }} />
        </div>
      </div>
    </div>
  );
}

/**
 * 工具卡片骨架（ToolsPage 用）
 */
export function ToolCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className="flex items-start gap-3 mb-3">
        <SkeletonCircle size={36} />
        <div className="flex-1">
          <Skeleton style={{ height: 14, width: '50%', marginBottom: 6 }} />
          <Skeleton style={{ height: 11, width: '80%', marginBottom: 4 }} />
          <Skeleton style={{ height: 11, width: '40%' }} />
        </div>
      </div>
      <div className="pt-3 border-t border-slate-100 space-y-2">
        <Skeleton style={{ height: 16, width: '100%' }} />
        <Skeleton style={{ height: 16, width: '100%' }} />
      </div>
    </div>
  );
}

/**
 * MCP server 卡片骨架（AdminMcpPage 用）
 */
export function McpServerCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className="flex items-start gap-3 mb-3">
        <SkeletonCircle size={36} />
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Skeleton style={{ height: 14, width: 80 }} />
            <Skeleton style={{ height: 16, width: 50, borderRadius: 4 }} />
          </div>
          <SkeletonText lines={2} lastLineWidth="70%" />
        </div>
      </div>
      <div className="pt-3 border-t border-slate-100 flex justify-between">
        <Skeleton style={{ height: 24, width: 100, borderRadius: 6 }} />
        <Skeleton style={{ height: 20, width: 60, borderRadius: 999 }} />
      </div>
    </div>
  );
}

// CSS keyframes（需要在全局 CSS 中定义 @keyframes shimmer）
// 注意：在 tailwind.config.js 也可定义 animation
export const SKELETON_CSS = `
@keyframes shimmer {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}
`;
