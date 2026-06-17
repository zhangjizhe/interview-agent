import { memo } from 'react';
import { ChevronDown, ChevronRight, Zap } from 'lucide-react';
import type { AgentEvent } from '@interview-agent/shared-types';

interface CotPanelProps {
  events: AgentEvent[];
  defaultOpen?: boolean;
}

/**
 * CoT 思维链折叠面板 — 展示 Agent 的思考过程与工具调用
 * 面试亮点：将 Agent 内部状态可视化，提升可解释性
 */
export const CotPanel = memo(function CotPanel({ events, defaultOpen = false }: CotPanelProps) {
  const toolEvents = events.filter(
    (e) => e.type === 'tool_call' || e.type === 'tool_result'
  );

  if (toolEvents.length === 0) return null;

  return (
    <details open={defaultOpen} className="bg-slate-50 rounded-lg border border-slate-200">
      <summary className="px-3 py-2 text-xs font-semibold text-slate-500 cursor-pointer flex items-center gap-1.5 select-none hover:bg-slate-100 rounded-lg transition">
        <Zap className="w-3 h-3 text-blue-500" />
        思维链 ({toolEvents.length} 步)
        <ChevronDown className="w-3 h-3 ml-auto details-open:hidden" />
        <ChevronRight className="w-3 h-3 ml-auto hidden details-open:inline" />
      </summary>
      <div className="px-3 pb-3 space-y-1.5">
        {toolEvents.map((e, i) => (
          <div
            key={i}
            className="flex items-start gap-2 text-[11px] bg-white rounded-md px-2.5 py-2 border border-slate-100"
          >
            <span
              className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                e.type === 'tool_call'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              {e.type === 'tool_call' ? (
                <div>
                  <span className="font-mono font-medium text-slate-800">
                    {e.toolName}
                  </span>
                  <span className="text-slate-400 ml-1">调用中...</span>
                </div>
              ) : (
                <div className="text-emerald-700">✓ 返回结果</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
});
