/**
 * 工具偏好管理页
 *
 * 用户级别开关：决定面试官能用哪些工具
 * 系统级别开关（admin 模式）也在同一页展示
 *
 * 数据源：
 * - GET /api/tools  →  所有工具列表（含系统级 enabled）
 * - GET /api/tools/preferences?userId=  →  当前用户偏好
 * - POST /api/tools/preferences  →  切换单个
 */
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Cpu, Search, Filter, CheckCircle2, XCircle, Wrench,
} from 'lucide-react';

interface Tool {
  name: string;
  displayName: string;
  description: string;
  emoji: string;
  category: 'search' | 'knowledge' | 'code' | 'mcp' | 'custom';
  enabled: boolean;       // 系统级
  userEnabled?: boolean;  // 用户级（后端合并后可能返回）
  author?: string;
  version?: string;
}

interface ToolsResponse {
  tools: Tool[];
  count: number;
  enabledCount: number;
}

interface Pref {
  userId: string;
  toolName: string;
  enabled: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  search: '搜索',
  knowledge: '知识',
  code: '代码',
  mcp: 'MCP',
  custom: '自定义',
};

const CATEGORY_COLORS: Record<string, string> = {
  search: 'bg-blue-100 text-blue-700',
  knowledge: 'bg-emerald-100 text-emerald-700',
  code: 'bg-violet-100 text-violet-700',
  mcp: 'bg-amber-100 text-amber-700',
  custom: 'bg-slate-100 text-slate-700',
};

// 安全 JSON 解析：API 返回非 JSON（如 502 的 nginx HTML 错误页）时兜底
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

export function ToolsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const userId = localStorage.getItem('ia_userId') || 'demo-user';
  const [keyword, setKeyword] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // 工具列表（系统级 + 用户级合并后的 enabled）
  const { data: toolsData, isLoading } = useQuery({
    queryKey: ['tools', userId],
    queryFn: async () => {
      const r = await fetch(`/api/tools?userId=${userId}`);
      return safeJson(r) as Promise<ToolsResponse>;
    },
  });

  // MCP server 运行时状态（admin 用）
  const { data: mcpStatus } = useQuery({
    queryKey: ['mcp-status'],
    queryFn: async () => {
      const r = await fetch('/api/admin/mcp-servers');
      return safeJson(r) as Promise<{
        servers: Array<{ name: string; status: string; transport: string }>;
        count: number;
        runningCount: number;
      }>;
    },
    refetchInterval: 30000,
  });

  // 切换用户偏好
  const toggleMut = useMutation({
    mutationFn: async ({ toolName, enabled }: { toolName: string; enabled: boolean }) => {
      const r = await fetch('/api/tools/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, toolName, enabled }),
      });
      return safeJson(r);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tools', userId] });
      queryClient.invalidateQueries({ queryKey: ['tools-count'] });
    },
  });

  // 系统级启停（仅 admin 可见，简化：直接调 toggle）
  const systemMut = useMutation({
    mutationFn: async ({ toolName, enabled }: { toolName: string; enabled: boolean }) => {
      const r = await fetch('/api/admin/mcp-servers/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolName, enabled }),
      });
      return safeJson(r);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tools', userId] });
    },
  });

  const filtered = (toolsData?.tools || []).filter((t) => {
    if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;
    if (keyword) {
      const k = keyword.toLowerCase();
      return t.name.toLowerCase().includes(k) ||
        t.displayName.toLowerCase().includes(k) ||
        t.description.toLowerCase().includes(k);
    }
    return true;
  });

  const enabledCount = (toolsData?.tools || []).filter((t) => t.enabled).length;
  const totalCount = toolsData?.count || 0;
  const userDisabled = (toolsData?.tools || []).filter((t) => !t.userEnabled).length;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 md:px-6 md:py-10 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/')}
          className="p-1.5 hover:bg-slate-100 rounded-lg transition"
          title="返回首页"
        >
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Cpu className="w-5 h-5 md:w-6 md:h-6 text-blue-600" />
            工具偏好
          </h1>
          <p className="text-xs md:text-sm text-slate-500 mt-0.5">
            决定面试官能调用哪些工具。系统级关闭的工具对本用户也禁用。
          </p>
        </div>
      </div>

      {/* 统计 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-3 md:p-4">
          <div className="text-xs text-slate-500">系统启用</div>
          <div className="text-lg md:text-2xl font-semibold text-slate-900 font-mono mt-1">
            {enabledCount} <span className="text-sm text-slate-400">/ {totalCount}</span>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3 md:p-4">
          <div className="text-xs text-slate-500">你关闭了</div>
          <div className="text-lg md:text-2xl font-semibold text-amber-600 font-mono mt-1">
            {userDisabled}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3 md:p-4">
          <div className="text-xs text-slate-500">面试可用</div>
          <div className="text-lg md:text-2xl font-semibold text-emerald-600 font-mono mt-1">
            {enabledCount - userDisabled}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3 md:p-4">
          <div className="text-xs text-slate-500">MCP 运行</div>
          <div className="text-lg md:text-2xl font-semibold text-blue-600 font-mono mt-1">
            {mcpStatus?.runningCount ?? 0} <span className="text-sm text-slate-400">/ {mcpStatus?.count ?? 0}</span>
          </div>
        </div>
      </div>

      {/* MCP server 状态条（admin） */}
      {(mcpStatus?.servers?.length ?? 0) > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-3 md:p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-semibold text-slate-700">MCP 服务运行时状态</span>
            </div>
            <span className="text-[10px] text-slate-400">每 30s 刷新 · 改 config 后调 POST /api/admin/mcp-servers/reload</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(mcpStatus?.servers ?? []).map((s) => (
              <span
                key={s.name}
                title={`${s.name} · ${s.status} · ${s.transport}`}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] ${
                  s.status === 'running' || s.status === 'builtin'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : s.status === 'error'
                      ? 'bg-red-50 text-red-700 border border-red-200'
                      : 'bg-slate-50 text-slate-500 border border-slate-200'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    s.status === 'running' || s.status === 'builtin'
                      ? 'bg-emerald-500'
                      : s.status === 'error'
                        ? 'bg-red-500'
                        : 'bg-slate-300'
                  }`}
                />
                {s.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 搜索 + 分类筛选 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3 md:p-4 flex flex-col md:flex-row gap-2 md:gap-3">
        <div className="flex-1 flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="搜索工具..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="flex-1 bg-transparent text-sm focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button
            onClick={() => setCategoryFilter('all')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition whitespace-nowrap ${
              categoryFilter === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            全部
          </button>
          {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setCategoryFilter(k)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                categoryFilter === k
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 工具列表 */}
      {isLoading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-500">
          加载中...
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-500">
          没有匹配的工具
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((tool) => (
            <ToolCard
              key={tool.name}
              tool={tool}
              onToggleUser={(enabled) => toggleMut.mutate({ toolName: tool.name, enabled })}
              onToggleSystem={(enabled) => systemMut.mutate({ toolName: tool.name, enabled })}
              isUserToggling={toggleMut.isPending}
              isSystemToggling={systemMut.isPending}
            />
          ))}
        </div>
      )}

      {/* 底部说明 */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-xs md:text-sm text-blue-900 space-y-1">
        <div className="font-medium">💡 使用说明</div>
        <div>• <b>用户级</b>开关：只影响当前用户，系统重启/换用户不影响</div>
        <div>• <b>系统级</b>开关：所有用户都受影响（如停用联网搜索避免 token 浪费）</div>
        <div>• 添加新工具需在 <code className="bg-blue-100 px-1 rounded">apps/api/config/mcp-servers.json</code> 声明 + npm install 后重启 API</div>
        <div className="pt-1">
          <Link to="/admin/mcp" className="text-blue-700 hover:underline font-medium">
            → 前往 MCP 服务管理（系统级）
          </Link>
        </div>
      </div>
    </div>
  );
}

function ToolCard({
  tool,
  onToggleUser,
  onToggleSystem,
  isUserToggling,
  isSystemToggling,
}: {
  tool: Tool & { userEnabled?: boolean };
  onToggleUser: (enabled: boolean) => void;
  onToggleSystem: (enabled: boolean) => void;
  isUserToggling: boolean;
  isSystemToggling: boolean;
}) {
  // 如果后端还没实现 userEnabled 字段，默认 true（与系统一致）
  const userEnabled = tool.userEnabled !== false;

  return (
    <div className={`bg-white rounded-2xl border p-4 transition ${
      tool.enabled && userEnabled
        ? 'border-slate-200'
        : 'border-dashed border-slate-200 bg-slate-50 opacity-75'
    }`}>
      <div className="flex items-start gap-3">
        <div className="text-2xl flex-shrink-0">{tool.emoji}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-900">{tool.displayName}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${CATEGORY_COLORS[tool.category]}`}>
              {CATEGORY_LABELS[tool.category]}
            </span>
            {tool.author && (
              <span className="text-[10px] text-slate-400">@{tool.author}</span>
            )}
            {tool.version && (
              <span className="text-[10px] text-slate-400 font-mono">v{tool.version}</span>
            )}
          </div>
          <div className="text-xs text-slate-600 mt-1 leading-relaxed line-clamp-2">
            {tool.description}
          </div>
          <div className="text-[10px] text-slate-400 font-mono mt-1">{tool.name}</div>
        </div>
      </div>

      {/* 双层开关 */}
      <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
        <SwitchRow
          label="系统级"
          checked={tool.enabled}
          onChange={(v) => onToggleSystem(v)}
          disabled={isSystemToggling}
          tone={tool.enabled ? 'blue' : 'slate'}
        />
        <SwitchRow
          label="本用户"
          checked={userEnabled}
          onChange={(v) => onToggleUser(v)}
          disabled={isUserToggling || !tool.enabled}
          tone={userEnabled ? 'emerald' : 'slate'}
        />
      </div>
    </div>
  );
}

function SwitchRow({
  label,
  checked,
  onChange,
  disabled,
  tone,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  tone: 'blue' | 'emerald' | 'slate';
}) {
  const track = tone === 'blue'
    ? (checked ? 'bg-blue-600' : 'bg-slate-200')
    : tone === 'emerald'
      ? (checked ? 'bg-emerald-600' : 'bg-slate-200')
      : 'bg-slate-200';
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5 text-xs text-slate-600">
        {checked ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
        ) : (
          <XCircle className="w-3.5 h-3.5 text-slate-300" />
        )}
        <span>{label}</span>
      </div>
      <button
        onClick={() => onChange(!checked)}
        disabled={disabled}
        className={`relative w-9 h-5 rounded-full transition ${track} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${
            checked ? 'left-[18px]' : 'left-0.5'
          }`}
        />
      </button>
    </div>
  );
}
