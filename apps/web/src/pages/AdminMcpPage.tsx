/**
 * MCP 服务管理页（系统级，管理员用）
 *
 * 纯展示 + 系统级启停 toggle
 * 不做"添加/删除"按钮 —— 增删 MCP = 改 config/mcp-servers.json + npm install + 重启 API
 *
 * 数据源：
 * - GET  /api/admin/mcp-servers         → 所有 server + 运行时状态
 * - POST /api/admin/mcp-servers/toggle   → 系统级启停
 * - GET  /api/admin/mcp-servers/:name/health → 健康检查
 * - POST /api/admin/mcp-servers/reload   → 重新加载 config
 */
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Server, RefreshCw, AlertCircle,
  Activity, Cpu,
} from 'lucide-react';

interface McpServer {
  name: string;
  displayName: string;
  description: string;
  emoji: string;
  category: string;
  enabled: boolean;
  author?: string;
  version?: string;
  transport: string;
  builtin: boolean;
  status: string;
  lastHealthCheck?: string;
  errorMessage?: string;
  pid?: number;
}

interface ServersResponse {
  servers: McpServer[];
  count: number;
  runningCount: number;
}

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  builtin: { label: '内置', color: 'bg-blue-100 text-blue-700' },
  running: { label: '运行中', color: 'bg-emerald-100 text-emerald-700' },
  stopped: { label: '已停止', color: 'bg-slate-100 text-slate-500' },
  error: { label: '异常', color: 'bg-red-100 text-red-700' },
};

const TRANSPORT_LABEL: Record<string, string> = {
  builtin: '内置',
  stdio: 'Stdio',
  'streamable-http': 'HTTP',
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

export function AdminMcpPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: serversData, isLoading } = useQuery({
    queryKey: ['admin-mcp-servers'],
    queryFn: async () => {
      const r = await fetch('/api/admin/mcp-servers');
      return safeJson(r) as Promise<ServersResponse>;
    },
    refetchInterval: 30000,
  });

  const toggleMut = useMutation({
    mutationFn: async ({ toolName, enabled }: { toolName: string; enabled: boolean }) => {
      const r = await fetch('/api/admin/mcp-servers/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolName, enabled }),
      });
      return safeJson(r);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-mcp-servers'] });
    },
  });

  const reloadMut = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/admin/mcp-servers/reload', { method: 'POST' });
      return safeJson(r);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-mcp-servers'] });
    },
  });

  const healthMut = useMutation({
    mutationFn: async (name: string) => {
      const r = await fetch(`/api/admin/mcp-servers/${name}/health`);
      return safeJson(r);
    },
  });

  const servers = serversData?.servers || [];
  const runningCount = serversData?.runningCount || 0;
  const totalCount = serversData?.count || 0;

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
            <Server className="w-5 h-5 md:w-6 md:h-6 text-violet-600" />
            MCP 服务管理
          </h1>
          <p className="text-xs md:text-sm text-slate-500 mt-0.5">
            系统级管理。增删 MCP 请改 config/mcp-servers.json + npm install 后重启 API。
          </p>
        </div>
        <button
          onClick={() => reloadMut.mutate()}
          disabled={reloadMut.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 rounded-lg transition disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${reloadMut.isPending ? 'animate-spin' : ''}`} />
          重载配置
        </button>
      </div>

      {/* 统计 */}
      <div className="grid grid-cols-3 gap-2 md:gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-3 md:p-4">
          <div className="text-xs text-slate-500">总服务</div>
          <div className="text-lg md:text-2xl font-semibold text-slate-900 font-mono mt-1">{totalCount}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3 md:p-4">
          <div className="text-xs text-slate-500">运行中</div>
          <div className="text-lg md:text-2xl font-semibold text-emerald-600 font-mono mt-1">{runningCount}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3 md:p-4">
          <div className="text-xs text-slate-500">已启用</div>
          <div className="text-lg md:text-2xl font-semibold text-blue-600 font-mono mt-1">
            {servers.filter((s) => s.enabled).length}
          </div>
        </div>
      </div>

      {/* Server 列表 */}
      {isLoading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-500">
          加载中...
        </div>
      ) : servers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-500">
          暂无 MCP 服务。请在 config/mcp-servers.json 中添加。
        </div>
      ) : (
        <div className="space-y-3">
          {servers.map((srv) => (
            <ServerCard
              key={srv.name}
              server={srv}
              onToggle={(enabled) => toggleMut.mutate({ toolName: srv.name, enabled })}
              onHealthCheck={() => healthMut.mutate(srv.name)}
              isToggling={toggleMut.isPending}
              healthResult={healthMut.data}
            />
          ))}
        </div>
      )}

      {/* 底部说明 */}
      <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4 text-xs md:text-sm text-violet-900 space-y-1">
        <div className="font-medium">MCP 服务管理说明</div>
        <div>• <b>系统级启停</b>：关闭后所有用户都无法使用该工具</div>
        <div>• <b>重载配置</b>：修改 mcp-servers.json 后点击"重载配置"即可生效，无需重启 API</div>
        <div>• <b>添加新 MCP</b>：npm install → 编辑 config/mcp-servers.json → 重载配置</div>
        <div>• <b>传输方式</b>：builtin = API 内置；stdio = 本地子进程；HTTP = 远程服务</div>
        <div className="pt-1">
          <Link to="/tools" className="text-violet-700 hover:underline font-medium">
            → 前往用户工具偏好
          </Link>
        </div>
      </div>
    </div>
  );
}

function ServerCard({
  server,
  onToggle,
  onHealthCheck,
  isToggling,
  healthResult,
}: {
  server: McpServer;
  onToggle: (enabled: boolean) => void;
  onHealthCheck: () => void;
  isToggling: boolean;
  healthResult?: any;
}) {
  const statusBadge = STATUS_BADGE[server.status] || STATUS_BADGE.stopped;

  return (
    <div className={`bg-white rounded-2xl border p-4 transition ${server.enabled ? 'border-slate-200' : 'border-dashed border-slate-200 bg-slate-50 opacity-75'
      }`}>
      <div className="flex items-start gap-3">
        <div className="text-2xl flex-shrink-0">{server.emoji}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-900">{server.displayName}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusBadge.color}`}>
              {statusBadge.label}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
              {TRANSPORT_LABEL[server.transport] || server.transport}
            </span>
            {server.version && (
              <span className="text-[10px] text-slate-400 font-mono">v{server.version}</span>
            )}
          </div>
          <div className="text-xs text-slate-600 mt-1 leading-relaxed">
            {server.description}
          </div>
          <div className="text-[10px] text-slate-400 font-mono mt-1">{server.name}</div>

          {/* 运行时信息 */}
          <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-500">
            {server.pid && (
              <span className="flex items-center gap-1">
                <Cpu className="w-3 h-3" /> PID: {server.pid}
              </span>
            )}
            {server.lastHealthCheck && (
              <span className="flex items-center gap-1">
                <Activity className="w-3 h-3" />
                检查于 {new Date(server.lastHealthCheck).toLocaleTimeString('zh-CN')}
              </span>
            )}
            {server.errorMessage && (
              <span className="flex items-center gap-1 text-red-500">
                <AlertCircle className="w-3 h-3" /> {server.errorMessage}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 操作栏 */}
      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={onHealthCheck}
            className="flex items-center gap-1 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-100 rounded-lg transition"
          >
            <Activity className="w-3 h-3" /> 健康检查
          </button>
          {healthResult && (
            <span className={`text-[11px] ${healthResult.ok ? 'text-emerald-600' : 'text-red-500'}`}>
              {healthResult.ok ? `OK (${healthResult.latencyMs}ms)` : `FAIL: ${healthResult.error}`}
            </span>
          )}
        </div>

        {/* 系统级开关 */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-500">系统级</span>
          <button
            onClick={() => onToggle(!server.enabled)}
            disabled={isToggling}
            className={`relative w-9 h-5 rounded-full transition ${server.enabled ? 'bg-violet-600' : 'bg-slate-200'
              } ${isToggling ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${server.enabled ? 'left-[18px]' : 'left-0.5'
                }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
