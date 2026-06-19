import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Cpu, Zap, Sparkles } from 'lucide-react';
import type { McpToolMeta } from '@interview-agent/shared-types';

// 安全 JSON 解析
async function safeJson(res: Response): Promise<any> {
  const text = await res.text();
  if (!res.ok) {
    try {
      const data = JSON.parse(text);
      return { _error: true, _status: res.status, ...data };
    } catch {
      return { _error: true, _status: res.status, message: `服务不可用 (HTTP ${res.status})` };
    }
  }
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

interface ToolsPanelProps {
  activeToolNames?: string[]; // 当前正在调用的工具名（用于高亮）
}

/**
 * 工具/MCP 面板
 * 轮询后端 /tools 接口，实时展示可用 MCP
 */
export function ToolsPanel({ activeToolNames = [] }: ToolsPanelProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['tools'],
    queryFn: async () => {
      const r = await fetch('/api/tools');
      return safeJson(r) as Promise<{ tools: McpToolMeta[]; count: number; enabledCount: number }>;
    },
    refetchInterval: 10000,
  });

  const [recentUsed, setRecentUsed] = useState<string[]>([]);

  // 工具被调用时，记录到 recent（最近 3 个）
  useEffect(() => {
    const newActive = activeToolNames.filter((n) => !recentUsed.includes(n));
    if (newActive.length > 0) {
      setRecentUsed((prev) => [...newActive, ...prev].slice(0, 3));
    }
  }, [activeToolNames.join(',')]);

  const categoryMap: Record<string, { label: string; color: string; icon: any }> = {
    search: { label: '搜索', color: 'bg-blue-100 text-blue-700', icon: Zap },
    knowledge: { label: '知识', color: 'bg-emerald-100 text-emerald-700', icon: Sparkles },
    code: { label: '代码', color: 'bg-purple-100 text-purple-700', icon: Cpu },
    mcp: { label: 'MCP', color: 'bg-amber-100 text-amber-700', icon: Cpu },
    custom: { label: '自定义', color: 'bg-pink-100 text-pink-700', icon: Sparkles },
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <Cpu className="w-3.5 h-3.5" /> 可用工具
        </div>
        <span className="text-xs text-slate-400">
          {data?.enabledCount ?? 0}/{data?.count ?? 0}
        </span>
      </div>

      {isLoading ? (
        <div className="text-xs text-slate-400 py-3 text-center">加载中...</div>
      ) : (
        <div className="space-y-1.5">
          {data?.tools.map((tool) => {
            const isActive = activeToolNames.includes(tool.name);
            const cat = categoryMap[tool.category] || categoryMap.custom;
            const CatIcon = cat.icon;
            return (
              <div
                key={tool.name}
                className={`p-2.5 rounded-lg border transition-all ${
                  isActive
                    ? 'border-blue-400 bg-blue-50 shadow-sm scale-[1.02]'
                    : tool.enabled
                    ? 'border-slate-200 bg-white'
                    : 'border-slate-100 bg-slate-50 opacity-60'
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="text-lg flex-shrink-0">{tool.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-slate-900 truncate">
                        {tool.displayName}
                      </span>
                      {isActive && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-blue-600 text-white rounded-full animate-pulse">
                          调用中
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">
                      {tool.description}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${cat.color}`}>
                        {cat.label}
                      </span>
                      {tool.author && (
                        <span className="text-[10px] text-slate-400">@{tool.author}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
