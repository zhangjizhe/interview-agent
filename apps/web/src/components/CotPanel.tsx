import { memo, useState } from 'react';
import { Lightbulb, Search, FileText, Cog, ChevronDown, ChevronUp } from 'lucide-react';
import type { AgentEvent } from '@interview-agent/shared-types';

interface CotPanelProps {
  events: AgentEvent[];
}

const iconFor = (type: AgentEvent['type']) => {
  switch (type) {
    case 'thinking':
      return <Lightbulb className="w-3.5 h-3.5 text-amber-500" />;
    case 'searching':
    case 'tool_call':
    case 'tool_result':
      return <Search className="w-3.5 h-3.5 text-emerald-500" />;
    case 'recalling':
      return <FileText className="w-3.5 h-3.5 text-sky-500" />;
    case 'meta':
      return <Cog className="w-3.5 h-3.5 text-slate-400" />;
    default:
      return <Cog className="w-3.5 h-3.5 text-slate-400" />;
  }
};

const labelFor = (type: AgentEvent['type']) => {
  switch (type) {
    case 'thinking':
      return '思考中';
    case 'searching':
      return '检索中';
    case 'tool_call':
      return '调用工具';
    case 'tool_result':
      return '工具结果';
    case 'recalling':
      return '记忆召回';
    case 'meta':
      return '元信息';
    case 'token_usage':
      return 'Token 用量';
    case 'error':
      return '错误';
    default:
      return type;
  }
};

export const CotPanel = memo(function CotPanel({ events }: CotPanelProps) {
  const [open, setOpen] = useState(true);
  if (events.length === 0) return null;

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden text-xs">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-100 transition"
      >
        <span className="font-medium text-slate-700 flex items-center gap-2">
          <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
          思考过程
          <span className="text-[10px] text-slate-400">({events.length} 步)</span>
        </span>
        {open ? (
          <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
        )}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-1.5">
          {events.map((e, i) => (
            <div key={i} className="flex items-start gap-2 text-slate-600">
              <div className="mt-0.5 flex-shrink-0">{iconFor(e.type)}</div>
              <div className="flex-1 min-w-0">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider mr-2">
                  {labelFor(e.type)}
                </span>
                {e.content && <span className="text-slate-700">{e.content}</span>}
                {e.detail && <span className="text-slate-600">{e.detail}</span>}
                {e.toolName && e.type === 'tool_call' && (
                  <span className="font-mono text-emerald-700">→ {e.toolName}</span>
                )}
                {e.toolResult && e.type === 'tool_result' && (
                  <pre className="mt-1 bg-slate-100 rounded px-2 py-1 text-[10px] text-slate-500 overflow-x-auto font-mono max-h-20">
                    {typeof e.toolResult === 'string'
                      ? e.toolResult.slice(0, 300)
                      : JSON.stringify(e.toolResult).slice(0, 300)}
                  </pre>
                )}
                {e.type === 'meta' && (
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {e.engine && <span>engine: {e.engine}　</span>}
                    {e.intent && <span>intent: {e.intent}　</span>}
                    {e.plan && e.plan.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {e.plan.map((p, j) => (
                          <div key={j} className="text-slate-400">
                            • {p}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {e.type === 'token_usage' && (
                  <span className="text-[11px] text-slate-500 font-mono">
                    prompt: {e.promptTokens} / completion: {e.completionTokens} / total: {e.total}
                  </span>
                )}
                {e.type === 'error' && e.error && (
                  <span className="text-red-600 text-[11px]">{e.error}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
