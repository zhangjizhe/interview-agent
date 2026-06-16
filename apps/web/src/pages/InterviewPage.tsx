import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Send, Bot, User as UserIcon, Loader2, FileText, Menu, X, ArrowLeft, RefreshCw, Wrench, Zap, Upload, CheckCircle2, ChevronDown, ChevronUp, Check, FileCheck } from 'lucide-react';
import { useInterviewStream } from '../hooks/useInterviewStream';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { ToolsPanel } from '../components/ToolsPanel';
import type { Report } from '@interview-agent/shared-types';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

interface Resume {
  name: string | null;
  position: string;
  summary: string;
  skills: string;
  createdAt: string;
}

export function InterviewPage() {
  const { id: interviewId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const userId = searchParams.get('userId') || 'demo-user';

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [ending, setEnding] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sessionTokens, setSessionTokens] = useState(0);
  const [resume, setResume] = useState<Resume | null>(null);
  const [resumePanelOpen, setResumePanelOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedName, setUploadedName] = useState<string | null>(null);
  const [resumeConfirmed, setResumeConfirmed] = useState(true); // 默认 true，老面试/已确认面试不阻塞
  const [confirming, setConfirming] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { streaming, send, currentToken, events, reset } = useInterviewStream();

  // 当前正在调用的工具（用于侧边栏高亮）
  const activeTools = events
    .filter((e) => e.type === 'tool_call')
    .map((e) => e.toolName)
    .filter(Boolean) as string[];

  const handleRefresh = useCallback(async () => {
    if (!interviewId) return;
    try {
      const res = await fetch(`/api/interview/${interviewId}`);
      const data = await res.json();
      if (data?.messages) {
        setMessages(
          data.messages.map((m: any) => ({
            role: m.role,
            content: m.content,
            streaming: false,
          })),
        );
      }
      if (data?.report) setReport(data.report);
      if (data?.resume) setResume(data.resume);
      if (typeof data?.resumeConfirmed === 'boolean') setResumeConfirmed(data.resumeConfirmed);
    } catch (err) {
      console.error('Refresh failed:', err);
    }
  }, [interviewId]);

  // 确认简历 → 后端打标 → 解锁聊天
  const confirmResumeStart = async () => {
    if (!interviewId) return;
    setConfirming(true);
    try {
      await fetch(`/api/interview/${interviewId}/confirm-resume`, { method: 'POST' });
      setResumeConfirmed(true);
    } catch (err) {
      console.error('Confirm failed:', err);
    } finally {
      setConfirming(false);
    }
  };

  // 面试页内上传/换简历
  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('position', searchParams.get('position') || '后端开发工程师');
      fd.append('userId', userId);
      const res = await fetch('/api/interview/upload-resume', { method: 'POST', body: fd });
      const data = await res.json();
      if (data?.ragIngested) {
        setUploadedName(file.name);
        // 重新拉面试详情拿到新简历
        await handleRefresh();
        setResumePanelOpen(true);
      } else {
        alert('上传失败：' + JSON.stringify(data));
      }
    } catch (err: any) {
      alert('上传出错：' + err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const { pullDistance, refreshing, pullRef } = usePullToRefresh({
    onRefresh: handleRefresh,
    threshold: 60,
    resistance: 0.4,
  });

  // 把 scrollRef 和 pullRef 指向同一个节点
  useEffect(() => {
    pullRef.current = scrollRef.current;
  }, [pullRef]);

  // 进入页面 / interviewId 变化时加载历史消息
  useEffect(() => {
    if (interviewId) handleRefresh();
  }, [interviewId, handleRefresh]);

  // 注册 Service Worker
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('SW registration failed:', err);
      });
    }
  }, []);

  // 自动滚动
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, currentToken]);

  // 流式 token 拼接
  useEffect(() => {
    if (currentToken) {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && last.streaming) {
          return [...prev.slice(0, -1), { ...last, content: currentToken }];
        }
        return prev;
      });
    }
  }, [currentToken]);

  const handleSend = async () => {
    if (!input.trim() || streaming || !interviewId) return;
    if (!resumeConfirmed) {
      alert('请先确认简历信息后再开始面试');
      return;
    }
    const content = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content }]);
    setMessages((prev) => [...prev, { role: 'assistant', content: '', streaming: true }]);
    reset();

    try {
      await send(interviewId, userId, content);
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && last.streaming) {
          return [...prev.slice(0, -1), { ...last, streaming: false }];
        }
        return prev;
      });
      const est = Math.ceil(content.length / 2) + Math.ceil((currentToken.length || 0) / 2);
      setSessionTokens((prev) => prev + est);
    } catch (err) {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && last.streaming) {
          return [...prev.slice(0, -1), { ...last, content: '⚠️ 出错了：' + (err as Error).message, streaming: false }];
        }
        return prev;
      });
    }
  };

  const handleEnd = async () => {
    if (!interviewId || ending) return;
    setEnding(true);
    setDrawerOpen(false);
    try {
      const res = await fetch(`/api/interview/${interviewId}/end`, { method: 'POST' });
      const data = await res.json();
      // 空面试被后端删除 → 跳回首页
      if (data?.deleted) {
        alert(data.reason === 'no_messages' ? '空面试已退出，不保存' : '已退出');
        navigate('/');
        return;
      }
      setReport(data.report);
    } catch (err) {
      alert('生成报告失败：' + err);
    } finally {
      setEnding(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      className="flex h-[calc(100vh-65px)] relative"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* 简历确认面板（未确认时全屏覆盖） */}
      {!resumeConfirmed && resume && (
        <div className="absolute inset-0 z-40 bg-white/95 backdrop-blur-sm flex items-center justify-center p-4 md:p-8">
          <div className="max-w-2xl w-full bg-white border-2 border-blue-200 rounded-2xl shadow-xl p-5 md:p-8 space-y-4">
            <div className="flex items-center gap-2">
              <FileCheck className="w-6 h-6 text-blue-600" />
              <h2 className="text-lg md:text-xl font-semibold text-slate-900">
                请先确认简历信息
              </h2>
            </div>
            <div className="text-sm text-slate-600">
              系统已根据你上传的简历自动生成以下信息，<span className="font-medium text-slate-900">确认无误后</span>再开始面试。如需修改，请重新上传。
            </div>

            <div className="bg-slate-50 rounded-xl p-4 space-y-3">
              {resume.name && (
                <div className="flex">
                  <div className="w-16 text-xs text-slate-500 flex-shrink-0">姓名</div>
                  <div className="text-sm text-slate-900 font-medium">{resume.name}</div>
                </div>
              )}
              <div className="flex">
                <div className="w-16 text-xs text-slate-500 flex-shrink-0">岗位</div>
                <div className="text-sm text-slate-900">{resume.position}</div>
              </div>
              {resume.summary && (
                <div className="flex">
                  <div className="w-16 text-xs text-slate-500 flex-shrink-0">摘要</div>
                  <div className="text-sm text-slate-700 line-clamp-3">{resume.summary}</div>
                </div>
              )}
              {resume.skills && (
                <div className="flex">
                  <div className="w-16 text-xs text-slate-500 flex-shrink-0">技能</div>
                  <div className="text-sm text-slate-700 flex flex-wrap gap-1">
                    {resume.skills.split(/[、,，]/).filter(Boolean).slice(0, 12).map((s, i) => (
                      <span key={i} className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">
                        {s.trim()}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {resume.createdAt && (
                <div className="flex">
                  <div className="w-16 text-xs text-slate-500 flex-shrink-0">上传</div>
                  <div className="text-xs text-slate-500">
                    {new Date(resume.createdAt).toLocaleString('zh-CN')}
                  </div>
                </div>
              )}
            </div>

            {/* 重新上传 */}
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.md,.txt"
                onChange={handleResumeUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="text-sm text-slate-600 hover:text-blue-600 underline disabled:opacity-50"
              >
                {uploading ? '上传中...' : '重新上传简历'}
              </button>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={confirmResumeStart}
                disabled={confirming}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                确认无误，开始面试
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 移动端背景遮罩 */}
      {drawerOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/40 z-30"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* 左侧侧边栏 */}
      <aside
        className={`
          bg-white border-r border-slate-200 flex flex-col
          fixed md:static inset-y-0 left-0 z-40
          w-72 transform transition-transform duration-200
          ${drawerOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <Link to="/" className="text-sm text-slate-500 hover:text-slate-900 flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" /> 返回首页
          </Link>
          <button onClick={() => setDrawerOpen(false)} className="md:hidden p-1 hover:bg-slate-100 rounded">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
        <div className="p-4 flex-1 overflow-y-auto space-y-4">
          {/* 工具/MCP 面板（最上面，醒目） */}
          <ToolsPanel activeToolNames={activeTools} />

          {/* 当前面试信息 */}
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">当前面试</div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="text-sm font-medium text-slate-900 break-all">面试 #{interviewId?.slice(0, 8)}</div>
              <div className="text-xs text-slate-500 mt-1 break-all">候选人: {userId}</div>
              {sessionTokens > 0 && (
                <div className="text-xs text-slate-600 mt-2 font-mono">
                  ⚡ 本次 {sessionTokens.toLocaleString()} tokens
                </div>
              )}

              {/* 简历状态 + 上传/换 */}
              <div className="mt-3 pt-3 border-t border-blue-200">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.md,.txt"
                  onChange={handleResumeUpload}
                  className="hidden"
                />
                {resume ? (
                  <div className="flex items-center gap-2 text-xs">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-slate-700 flex-1 truncate">
                      📄 {resume.name || '已上传简历'}
                    </span>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="text-blue-600 hover:text-blue-700 font-medium"
                    >
                      {uploading ? '上传中...' : '换一份'}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="w-full border-2 border-dashed border-blue-300 bg-white text-slate-600 hover:border-blue-400 hover:text-blue-600 rounded-lg py-2 px-3 text-xs font-medium flex items-center justify-center gap-2 transition"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        解析中...
                      </>
                    ) : (
                      <>
                        <Upload className="w-3.5 h-3.5" />
                        上传简历（PDF/Word/TXT）
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 工具调用轨迹 */}
          {events.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                <Wrench className="w-3 h-3" /> 本轮调用
              </div>
              <div className="space-y-1">
                {events
                  .filter((e) => e.type === 'tool_call' || e.type === 'tool_result')
                  .map((e, i) => (
                    <div
                      key={i}
                      className="text-[11px] text-slate-600 bg-slate-50 rounded px-2 py-1.5 flex items-center gap-1.5"
                    >
                      {e.type === 'tool_call' ? (
                        <>
                          <Zap className="w-3 h-3 text-blue-500" />
                          <span>调用 <span className="font-mono text-slate-800">{e.toolName}</span></span>
                        </>
                      ) : (
                        <>
                          <span className="text-emerald-500">✓</span>
                          <span>返回结果</span>
                        </>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
        <div className="p-4 border-t border-slate-200">
          {messages.length > 0 ? (
            <button
              onClick={handleEnd}
              disabled={ending}
              className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium py-2 px-3 rounded-lg transition disabled:opacity-50"
            >
              {ending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              {ending ? '生成报告中...' : '结束并生成报告'}
            </button>
          ) : (
            <button
              onClick={() => navigate('/')}
              className="w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-medium py-2 px-3 rounded-lg transition"
            >
              <X className="w-4 h-4" />
              放弃面试，返回首页
            </button>
          )}
        </div>
      </aside>

      {/* 主对话区 */}
      <div className="flex-1 flex flex-col bg-slate-50 min-w-0">
        {report ? (
          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-5 md:p-8">
              <h2 className="text-2xl font-bold text-slate-900 mb-2">📊 面试报告</h2>

              {/* 面试者信息 */}
              {report.candidate && (
                <div className="bg-gradient-to-br from-blue-50 to-violet-50 rounded-xl p-4 mb-5 border border-blue-100">
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-600 to-violet-600 text-white flex items-center justify-center text-lg font-semibold flex-shrink-0">
                      {(report.candidate.name || '匿').slice(0, 1)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-base font-semibold text-slate-900">
                          {report.candidate.name}
                        </span>
                        <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                          {report.candidate.position}
                        </span>
                        <span className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">
                          {report.candidate.level}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-xs text-slate-600">
                        <div>
                          <div className="text-slate-400">开始</div>
                          <div className="font-mono text-slate-700">
                            {new Date(report.candidate.startedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                        <div>
                          <div className="text-slate-400">时长</div>
                          <div className="font-mono text-slate-700">{report.candidate.durationMin} 分钟</div>
                        </div>
                        <div>
                          <div className="text-slate-400">对话</div>
                          <div className="font-mono text-slate-700">{report.candidate.messageCount} 轮</div>
                        </div>
                        {report.totalTokens != null && (
                          <div>
                            <div className="text-slate-400">Token</div>
                            <div className="font-mono text-slate-700">{report.totalTokens.toLocaleString()}</div>
                          </div>
                        )}
                      </div>
                      {report.candidate.resumeSkills && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {report.candidate.resumeSkills.split(/[、,，]/).filter(Boolean).slice(0, 8).map((s, i) => (
                            <span key={i} className="text-[10px] px-1.5 py-0.5 bg-white text-slate-600 rounded border border-slate-200">
                              {s.trim()}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="text-sm text-slate-500 mb-6">
                总分：<span className="text-3xl font-bold text-blue-600">{report.overallScore}</span> / 100
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
                {Object.entries(report.scores as any).map(([key, value]) => (
                  <div key={key} className="bg-slate-50 rounded-lg p-3 md:p-4">
                    <div className="text-xs text-slate-500 uppercase mb-1 truncate">{key}</div>
                    <div className="text-xl font-semibold text-slate-900">{value as number}</div>
                  </div>
                ))}
              </div>
              <Section title="✨ 优点" content={report.strengths} />
              <Section title="⚠️ 不足" content={report.weaknesses} />
              <Section title="💡 建议" content={report.suggestions} />

              {/* 返回首页按钮 */}
              <button
                onClick={() => navigate('/')}
                className="mt-6 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                返回首页
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* 移动端顶部条 */}
            <div className="md:hidden bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between gap-2 pt-safe">
              <div className="flex items-center gap-2 min-w-0">
                <button onClick={() => setDrawerOpen(true)} className="p-1.5 hover:bg-slate-100 rounded">
                  <Menu className="w-5 h-5 text-slate-700" />
                </button>
                <span className="text-sm font-medium text-slate-700 truncate">面试 #{interviewId?.slice(0, 8)}</span>
              </div>
              {sessionTokens > 0 && (
                <span className="text-xs font-mono text-slate-500 bg-slate-50 px-2 py-1 rounded">
                  ⚡ {sessionTokens.toLocaleString()}
                </span>
              )}
            </div>

            {/* 简历摘要面板（可折叠） */}
            {(resume || uploadedName) && (
              <div className="bg-white border-b border-slate-200">
                <button
                  onClick={() => setResumePanelOpen(!resumePanelOpen)}
                  className="w-full px-4 md:px-6 py-2.5 flex items-center justify-between text-sm hover:bg-slate-50"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-violet-500" />
                    <span className="font-medium text-slate-700">
                      {resume?.name || uploadedName} 的简历
                    </span>
                    {resume?.skills && (
                      <span className="text-xs text-slate-400 hidden md:inline">
                        · {resume.skills.split('、').slice(0, 3).join('、')}
                      </span>
                    )}
                  </div>
                  {resumePanelOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {resumePanelOpen && resume && (
                  <div className="px-4 md:px-6 pb-4 space-y-2 text-sm">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <div className="text-xs text-slate-500 mb-1">岗位</div>
                        <div className="text-slate-800">{resume.position}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500 mb-1">技能</div>
                        <div className="flex flex-wrap gap-1">
                          {resume.skills.split('、').filter(Boolean).slice(0, 12).map((s, i) => (
                            <span key={i} className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded">
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500 mb-1">简历摘要</div>
                      <pre className="text-xs text-slate-700 bg-slate-50 p-3 rounded-lg whitespace-pre-wrap font-mono leading-relaxed">
                        {resume.summary}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 对话列表（含下拉刷新） */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-6 relative">
              {/* 下拉刷新指示器 */}
              {(pullDistance > 0 || refreshing) && (
                <div
                  className="md:hidden absolute left-0 right-0 flex justify-center pointer-events-none z-10"
                  style={{ top: pullDistance - 32, transition: refreshing ? 'none' : 'top 0.2s' }}
                >
                  <div className="bg-white border border-slate-200 shadow-sm rounded-full px-3 py-1.5 flex items-center gap-2 text-xs text-slate-600">
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-blue-600' : ''}`} />
                    {refreshing ? '加载中...' : pullDistance >= 60 ? '释放刷新' : '下拉刷新'}
                  </div>
                </div>
              )}

              <div className="max-w-3xl mx-auto space-y-4 md:space-y-6">
                {messages.length === 0 && (
                  <div className="text-center text-slate-400 py-12 md:py-20">
                    <Bot className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                    <p>开始你的第一句话吧～</p>
                  </div>
                )}
                {messages.map((msg, i) => (
                  <div key={i} className={`flex gap-2 md:gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    <div
                      className={`flex-shrink-0 w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center ${msg.role === 'user' ? 'bg-blue-600' : 'bg-gradient-to-br from-violet-500 to-purple-600'
                        }`}
                    >
                      {msg.role === 'user' ? (
                        <UserIcon className="w-3.5 h-3.5 md:w-4 md:h-4 text-white" />
                      ) : (
                        <Bot className="w-3.5 h-3.5 md:w-4 md:h-4 text-white" />
                      )}
                    </div>
                    <div
                      className={`rounded-2xl px-3 py-2 md:px-4 md:py-3 text-sm md:text-base ${msg.role === 'user'
                        ? 'bg-blue-600 text-white max-w-[78%] md:max-w-[70%]'
                        : 'bg-white border border-slate-200 text-slate-900 max-w-[85%] md:max-w-[70%]'
                        }`}
                    >
                      <div className="whitespace-pre-wrap text-sm leading-relaxed break-words">
                        {msg.content || (msg.streaming ? '...' : '')}
                        {msg.streaming && (
                          <span className="inline-block w-1.5 h-4 bg-blue-500 ml-0.5 animate-pulse" />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 输入区 */}
            <div
              className="border-t border-slate-200 bg-white p-3 md:p-4"
              style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
            >
              <div className="max-w-3xl mx-auto flex gap-2 md:gap-3 items-end">
                {/* 上传简历按钮（输入框左侧，始终可见） */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || streaming}
                  title="上传简历"
                  className={`flex-shrink-0 w-10 h-10 md:w-11 md:h-11 rounded-xl flex items-center justify-center transition ${resume
                    ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 border border-slate-200'
                    } disabled:opacity-50`}
                >
                  {uploading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : resume ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                </button>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    !resumeConfirmed
                      ? '请先确认上方简历信息...'
                      : resume
                      ? '简历已上传，开始面试吧...'
                      : '输入消息...'
                  }
                  rows={1}
                  disabled={streaming || !resumeConfirmed}
                  className="flex-1 px-3 py-2.5 md:px-4 md:py-3 text-sm md:text-base border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none disabled:bg-slate-50 max-h-32"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || streaming || !resumeConfirmed}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 md:px-5 rounded-xl font-medium transition disabled:opacity-50 flex items-center gap-2 h-10 md:h-11"
                >
                  {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
              {/* 上传状态提示 */}
              {uploading && (
                <div className="max-w-3xl mx-auto mt-1.5 text-xs text-blue-600 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  正在解析简历...
                </div>
              )}
              {uploadedName && !uploading && (
                <div className="max-w-3xl mx-auto mt-1.5 text-xs text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  已上传: {uploadedName}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, content }: { title: string; content: string }) {
  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-slate-900 mb-2">{title}</h3>
      <div className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 rounded-lg p-4 break-words">
        {content}
      </div>
    </div>
  );
}
