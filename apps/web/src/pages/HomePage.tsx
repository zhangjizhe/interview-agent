import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Clock, FileText, ChevronRight, Plus, BarChart3, X, Cpu, Sparkles, Upload, CheckCircle2, Loader2 } from 'lucide-react';
import type { McpToolMeta } from '@interview-agent/shared-types';
import { safeJson } from '../utils/safeJson';

// 默认岗位改为「前端开发工程师」—— 更符合通用 demo 直觉
// （之前默认是 AI Agent 工程师，会让用户误以为选了"前端"但实际是 agent）
const POSITIONS = ['前端开发工程师', 'AI Agent 工程师', '高级测试工程师', '后端开发工程师', '算法工程师', '产品经理'];
const LEVELS = ['P4', 'P5', 'P6', 'P7'];

export function HomePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const showNew = searchParams.get('new') === '1';

  const [userId, setUserId] = useState(() => {
    const stored = localStorage.getItem('ia_userId');
    if (stored) return stored;
    // R-P2-18 修复：原 Math.random().toString(36).slice(2,8) 仅 6 字符 (~36^6=2B)，
    // 生日攻击约 4 万次开始 50% 碰撞风险。改用 timestamp + crypto randomUUID 后缀
    // （~24 字符 base36，碰撞概率可忽略）。
    const id = `demo-user-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
    localStorage.setItem('ia_userId', id);
    return id;
  });

  // 切换用户（清空记忆 + 生成新 userId）
  const switchUser = () => {
    const id = `demo-user-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
    localStorage.setItem('ia_userId', id);
    setUserId(id);
  };

  const [showForm, setShowForm] = useState(showNew);
  const [position, setPosition] = useState(() => {
    const q = searchParams.get('position');
    if (q && POSITIONS.includes(q)) return q;
    return POSITIONS[0];
  });
  const [level, setLevel] = useState(() => {
    const q = searchParams.get('level');
    if (q && LEVELS.includes(q)) return q;
    return LEVELS[1];
  });
  const [loading, setLoading] = useState(false);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [resumeUploaded, setResumeUploaded] = useState(false);
  const [uploadedInterviewId, setUploadedInterviewId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleResumePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setResumeFile(file);
    setUploading(true);
    setResumeUploaded(false);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('position', position);
      fd.append('userId', userId);
      const res = await fetch('/api/interview/upload-resume', { method: 'POST', body: fd });
      const data = await safeJson(res);
      if (data?._error || (data?.ragIngested === false && !data?.interviewId)) {
        // 上传失败（_error 显式错 或 既没 ingest 也没生成 interview）
        alert('简历上传失败：' + (data?.message || JSON.stringify(data)));
        return;
      }
      // 成功：ragIngested 可能是 true/false（dev 模式 0 embedding），但有 interviewId 就是成功
      setResumeUploaded(true);
      setUploadedInterviewId(data.interviewId);
    } catch (err: any) {
      alert('上传出错：' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const { data: interviews = [] } = useQuery({
    queryKey: ['interviews', userId],
    queryFn: async () => {
      const r = await fetch(`/api/interview/list?userId=${userId}`);
      if (!r.ok) throw new Error(`List API ${r.status}`);
      return safeJson(r);
    },
    refetchInterval: 10000, // R-P2-19 修复：3s 太频繁，改 10s（节省 70% 请求）
    retry: 3,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const { data: stats } = useQuery({
    queryKey: ['token-stats', userId],
    queryFn: async () => {
      const url = `/api/interview/stats?userId=${encodeURIComponent(userId)}`;
      const r = await fetch(url);
      if (!r.ok) {
        throw new Error(`Stats API ${r.status}`);
      }
      return safeJson(r);
    },
    refetchInterval: 10000, // R-P2-19 修复：5s 改 10s，与 interview list 同步
    retry: 3,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  // 工具列表（首页技能市场）
  const { data: toolsData } = useQuery({
    queryKey: ['tools'],
    queryFn: async () => {
      const r = await fetch('/api/tools');
      const data: any = safeJson(r);
      // 防御：safeJson 在 502/HTML 错误时返回 {}，tools 字段可能缺失
      // 不加防御会 throw "Cannot read properties of undefined (reading 'map')"
      if (data && Array.isArray(data.tools)) {
        return data as { tools: McpToolMeta[]; count: number; enabledCount: number };
      }
      return { tools: [] as McpToolMeta[], count: 0, enabledCount: 0 };
    },
    refetchInterval: 30000,
  });

  // 空面试（30min 无对话）：首页弹窗提醒
  interface EmptyRoom { id: string; position: string; level: string | null; createdAt: string; idleMinutes: number }
  const { data: emptyRoomsData, refetch: refetchEmpty } = useQuery({
    queryKey: ['empty-rooms', userId],
    queryFn: async () => {
      const r = await fetch(`/api/interview/empty-rooms?userId=${userId}&idleMinutes=30`);
      return safeJson(r) as Promise<{ emptyRooms: EmptyRoom[]; count: number }>;
    },
    refetchInterval: 60000, // 每分钟查一次
  });
  const [dismissedEmpty, setDismissedEmpty] = useState<Set<string>>(new Set());
  const [deletingEmpty, setDeletingEmpty] = useState<string | null>(null);

  // 过滤已忽略的
  const pendingEmpty = (emptyRoomsData?.emptyRooms || []).filter(
    (r) => !dismissedEmpty.has(r.id),
  );

  const dismissEmpty = (id: string) => {
    setDismissedEmpty((prev) => new Set([...Array.from(prev), id]));
  };

  const deleteEmpty = async (id: string) => {
    setDeletingEmpty(id);
    try {
      await fetch(`/api/interview/${id}?userId=${userId}`, { method: 'DELETE' });
      dismissEmpty(id);
      refetchEmpty();
    } finally {
      setDeletingEmpty(null);
    }
  };

  const keepEmpty = (id: string) => {
    dismissEmpty(id);
  };

  // 用于 useEffect 闭包的稳定 ref
  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;

  useEffect(() => {
    if (showNew) setShowForm(true);
  }, [showNew]);

  // 弹窗关闭时清空简历状态 + 清除 URL 参数
  useEffect(() => {
    if (!showForm) {
      setResumeFile(null);
      setResumeUploaded(false);
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      // 关闭时清除 ?new=1，避免 URL 残留导致再次点击打不开
      const sp = searchParamsRef.current;
      if (sp.get('new') === '1') {
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.delete('new');
          return next;
        }, { replace: true });
      }
    }
  }, [showForm]);

  // 弹窗打开时锁 body 滚动（iOS 弹性滚动 + PC 背景不动）
  useEffect(() => {
    if (showForm) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [showForm]);

  const startInterview = async () => {
    setLoading(true);
    try {
      // 如果 upload-resume 已经创建了 interview，直接 navigate（不调 /start）
      if (uploadedInterviewId) {
        setShowForm(false);
        navigate(`/interview/${uploadedInterviewId}?userId=${userId}`);
        return;
      }
      const res = await fetch('/api/interview/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          user_message: `开始 ${position} ${level} 面试`,
          user_role: position,
          thread_id: undefined,
        }),
      });
      const data = await safeJson(res);
      if (data?._error) {
        alert('启动失败：' + (data.message || JSON.stringify(data)));
        return;
      }
      setShowForm(false);
      const realUserId = data.interview?.userId || userId;
      navigate(`/interview/${data.interviewId}?userId=${realUserId}`);
    } catch (err) {
      alert('启动失败：' + err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 md:px-6 md:py-10 space-y-6 md:space-y-8">
      {/* 空面试清理弹窗（30min 无对话） */}
      {pendingEmpty.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 md:p-5">
          <div className="flex items-start gap-3 mb-3">
            <Clock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-sm md:text-base font-semibold text-amber-900">
                发现 {pendingEmpty.length} 个空面试（开始后 30 分钟无对话）
              </div>
              <div className="text-xs text-amber-700 mt-1">
                空面试不产生有效记录，建议删除以保持列表整洁。
              </div>
            </div>
          </div>
          <div className="space-y-2 mt-3">
            {(pendingEmpty ?? []).map((room) => (
              <div
                key={room.id}
                className="bg-white rounded-xl border border-amber-200 p-3 flex items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900 truncate">
                    {room.position}
                    {room.level && (
                      <span className="ml-1 text-xs px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">
                        {room.level}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    开始于 {new Date(room.createdAt).toLocaleString('zh-CN')} · 闲置 {room.idleMinutes} 分钟
                  </div>
                </div>
                <button
                  onClick={() => keepEmpty(room.id)}
                  disabled={deletingEmpty === room.id}
                  className="px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  保留
                </button>
                <button
                  onClick={() => deleteEmpty(room.id)}
                  disabled={deletingEmpty === room.id}
                  className="px-2.5 py-1.5 text-xs bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center gap-1 disabled:opacity-50"
                >
                  {deletingEmpty === room.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : null}
                  删除
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 顶部统计 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <StatCard icon="🎯" label="总面试" value={stats?.totalInterviews ?? 0} />
        <StatCard icon="✅" label="已完成" value={stats?.completedInterviews ?? 0} />
        <StatCard icon="⚡" label="总 Token" value={(stats?.totalTokens ?? 0).toLocaleString()} />
        <StatCard
          icon="💰"
          label="估算成本"
          value={`¥${((stats?.totalTokens ?? 0) * 0.00002).toFixed(3)}`}
          hint="按 ¥0.02/1k token"
        />
      </div>

      {/* 候选人身份 */}
      <div className="flex items-center justify-between bg-slate-50 rounded-lg px-4 py-2.5 text-sm">
        <div className="flex items-center gap-2 text-slate-600">
          <span className="text-slate-400">👤 当前用户</span>
          <code className="font-mono text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200">
            {userId}
          </code>
        </div>
        <button
          onClick={switchUser}
          className="text-xs text-blue-600 hover:text-blue-700 font-medium px-2 py-1 hover:bg-blue-50 rounded"
          title="切换用户后，记忆会重新累积（旧 userId 的记忆保留在 Qdrant 里）"
        >
          切换用户
        </button>
      </div>

      {/* 技能市场 */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-4 md:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-4 h-4 md:w-5 md:h-5 text-amber-500 flex-shrink-0" />
            <span className="text-sm md:text-base font-semibold text-slate-900 flex-shrink-0">技能市场</span>
            <span className="text-xs text-slate-500 flex-shrink-0">
              {toolsData?.enabledCount ?? 0} / {toolsData?.count ?? 0} 可用
            </span>
            <div className="flex items-center gap-1.5 overflow-x-auto ml-1 md:ml-2 min-w-0">
              {(toolsData?.tools ?? []).map((tool) => (
                <span
                  key={tool.name}
                  title={tool.description}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] flex-shrink-0 ${tool.enabled
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-slate-50 text-slate-400 border border-slate-200'
                    }`}
                >
                  <span>{tool.emoji}</span>
                  <span className="font-medium">{tool.displayName}</span>
                  <span className={`w-1.5 h-1.5 rounded-full ${tool.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                </span>
              ))}
            </div>
          </div>
          <button
            onClick={() => navigate('/tools')}
            className="text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2.5 py-1 rounded-lg transition flex-shrink-0"
          >
            管理 →
          </button>
        </div>
      </div>

      {/* 面试列表 */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-4 md:px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-base md:text-lg font-semibold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 md:w-5 md:h-5 text-slate-400" />
            面试记录
          </h2>
          <button
            onClick={() => setSearchParams({ new: '1' }, { replace: true })}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
          >
            <Plus className="w-4 h-4" /> 新建
          </button>
        </div>

        {interviews.length === 0 ? (
          <div className="px-6 py-12 md:py-16 text-center">
            <div className="text-5xl mb-3">🤖</div>
            <p className="text-slate-600 mb-4">还没有面试记录，开始你的第一场吧</p>
            <button
              onClick={() => setSearchParams({ new: '1' }, { replace: true })}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-5 py-2 rounded-lg"
            >
              开始面试
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {(interviews ?? []).map((iv: any) => (
              <InterviewRow key={iv.id} interview={iv} onClick={() => navigate(`/interview/${iv.id}?userId=${userId}`)} />
            ))}
          </div>
        )}
      </div>

      {/* 新建面试弹窗 - Portal 渲染到 body 跨父级 stacking context + iOS safe-area + 点空白关闭 */}
      {showForm && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-end md:items-center justify-center p-0 md:p-4"
          style={{
            paddingTop: 'env(safe-area-inset-top)',
            paddingBottom: 'env(safe-area-inset-bottom)',
            paddingLeft: 'env(safe-area-inset-left)',
            paddingRight: 'env(safe-area-inset-right)',
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
          }}
          onClick={() => setShowForm(false)}
        >
          <div
            className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-md max-h-[85vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <h3 className="text-lg font-semibold text-slate-900">开始新面试</h3>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-slate-100 rounded">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">应聘岗位</label>
                <div className="flex flex-wrap gap-2">
                  {POSITIONS.map((p) => (
                    <button
                      key={p}
                      onClick={() => setPosition(p)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${position === p
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">职级</label>
                <div className="flex gap-2">
                  {LEVELS.map((l) => (
                    <button
                      key={l}
                      onClick={() => setLevel(l)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${level === l
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              {/* 简历上传（必填） */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  简历 <span className="text-red-500">*</span>
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.md,.txt"
                  onChange={handleResumePick}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className={`w-full border-2 border-dashed rounded-lg py-3 px-4 text-sm font-medium transition flex items-center justify-center gap-2 ${resumeUploaded
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                      : 'border-slate-300 bg-slate-50 text-slate-700 hover:border-blue-400 hover:bg-blue-50'
                    }`}
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      解析并写入向量库中...
                    </>
                  ) : resumeUploaded ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      已上传：{resumeFile?.name}
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      点击选择简历（PDF / Word / TXT / MD）
                    </>
                  )}
                </button>
                <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                  上传后自动解析并入向量库，AI 面试官会基于你的简历提问
                </p>
              </div>

              <button
                onClick={startInterview}
                disabled={loading || !resumeUploaded}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                title={!resumeUploaded ? '请先上传简历' : ''}
              >
                {loading ? '启动中...' : !resumeUploaded ? '请先上传简历' : '开始面试 →'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function StatCard({ icon, label, value, hint }: { icon: string; label: string; value: any; hint?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3 md:p-4">
      <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
        <span>{icon}</span> {label}
      </div>
      <div className="text-lg md:text-2xl font-semibold text-slate-900 font-mono">{value}</div>
      {hint && <div className="text-[10px] text-slate-400 mt-0.5">{hint}</div>}
    </div>
  );
}

function InterviewRow({ interview, onClick }: { interview: any; onClick: () => void }) {
  const statusMap: Record<string, { label: string; color: string }> = {
    IN_PROGRESS: { label: '进行中', color: 'bg-amber-100 text-amber-700' },
    COMPLETED: { label: '已完成', color: 'bg-emerald-100 text-emerald-700' },
    ABANDONED: { label: '已放弃', color: 'bg-slate-100 text-slate-500' },
  };
  const status = statusMap[interview.status] || statusMap.IN_PROGRESS;
  const score = interview.report?.overallScore;
  const totalTokens = interview.messages?.reduce(
    (sum: number, m: any) => sum + (m.promptTokens || 0) + (m.completionTokens || 0),
    0,
  ) || 0;

  // 智能时间：今天 / 昨天 / 本周 / 更早
  const d = new Date(interview.startedAt);
  const now = new Date();
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  const fmt = (dt: Date) => dt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  let timeLabel: string;
  if (sameDay(d, now)) timeLabel = `今天 ${fmt(d)}`;
  else if (sameDay(d, yesterday)) timeLabel = `昨天 ${fmt(d)}`;
  else if (now.getTime() - d.getTime() < 7 * 24 * 3600 * 1000) {
    timeLabel = d.toLocaleString('zh-CN', { weekday: 'long', hour: '2-digit', minute: '2-digit' });
  } else {
    timeLabel = d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  // Title 拼接：简历姓名·岗位·职级·时间
  const resumeName = interview.display?.resumeName || null;
  const titleText = resumeName
    ? `${resumeName} · ${interview.position} · ${interview.level} · ${timeLabel}`
    : `${interview.position} · ${interview.level} · ${timeLabel}`;

  return (
    <button
      onClick={onClick}
      className="w-full px-4 md:px-6 py-3 md:py-4 flex items-center gap-3 md:gap-4 hover:bg-slate-50 transition text-left"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="font-medium text-slate-900 text-sm md:text-base truncate">
            {titleText}
          </span>
          <span className={`text-xs px-1.5 py-0.5 rounded ${status.color}`}>{status.label}</span>
          {resumeName && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">
              📄 简历
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 md:gap-4 text-xs text-slate-500">
          {totalTokens > 0 && (
            <span className="font-mono">⚡ {totalTokens.toLocaleString()} tokens</span>
          )}
          {score != null && (
            <span className="flex items-center gap-1 font-semibold text-blue-600">
              <FileText className="w-3 h-3" /> {score} 分
            </span>
          )}
        </div>
      </div>
      <ChevronRight className="w-5 h-5 text-slate-300 flex-shrink-0" />
    </button>
  );
}
