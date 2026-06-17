import { Routes, Route, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useState, lazy, Suspense, useEffect } from 'react';
import { Cpu, Database } from 'lucide-react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { HomePage } from './pages/HomePage';
import { initWebVitals } from './utils/web-vitals';

// 路由级懒加载 — 首屏不加载 InterviewPage / QuestionBankPage / ToolsPage / AdminMcpPage
const InterviewPage = lazy(() =>
  import('./pages/InterviewPage').then((m) => ({ default: m.InterviewPage })),
);
const QuestionBankPage = lazy(() =>
  import('./pages/QuestionBankPage').then((m) => ({ default: m.QuestionBankPage })),
);
const ToolsPage = lazy(() =>
  import('./pages/ToolsPage').then((m) => ({ default: m.ToolsPage })),
);
const AdminMcpPage = lazy(() =>
  import('./pages/AdminMcpPage').then((m) => ({ default: m.AdminMcpPage })),
);

function PageSpinner() {
  return (
    <div className="flex items-center justify-center h-[60vh]">
      <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );
}

function WallEIcon({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden="true">
      <rect x="16" y="16" width="480" height="480" rx="96" ry="96" fill="#1e1b4b" />
      <rect x="128" y="200" width="256" height="200" rx="20" ry="20" fill="none" stroke="#a5b4fc" strokeWidth="10" strokeLinejoin="round" />
      <rect x="108" y="360" width="76" height="56" rx="28" ry="28" fill="none" stroke="#a5b4fc" strokeWidth="10" />
      <rect x="328" y="360" width="76" height="56" rx="28" ry="28" fill="none" stroke="#a5b4fc" strokeWidth="10" />
      <rect x="216" y="160" width="80" height="56" rx="8" ry="8" fill="none" stroke="#a5b4fc" strokeWidth="10" />
      <line x1="216" y1="188" x2="296" y2="188" stroke="#a5b4fc" strokeWidth="6" />
      <path d="M 176 80 L 336 80 L 320 160 L 192 160 Z" fill="none" stroke="#a5b4fc" strokeWidth="10" strokeLinejoin="round" />
      <rect x="200" y="96" width="44" height="44" rx="6" ry="6" fill="none" stroke="#a5b4fc" strokeWidth="8" />
      <circle cx="222" cy="118" r="10" fill="#a5b4fc" />
      <rect x="268" y="96" width="44" height="44" rx="6" ry="6" fill="none" stroke="#a5b4fc" strokeWidth="8" />
      <circle cx="290" cy="118" r="10" fill="#a5b4fc" />
      <line x1="256" y1="80" x2="256" y2="48" stroke="#a5b4fc" strokeWidth="8" strokeLinecap="round" />
      <circle cx="256" cy="40" r="8" fill="#a5b4fc" />
      <path d="M 128 240 L 88 280" stroke="#a5b4fc" strokeWidth="10" strokeLinecap="round" />
      <circle cx="80" cy="288" r="10" fill="none" stroke="#a5b4fc" strokeWidth="8" />
      <path d="M 384 240 L 424 280" stroke="#a5b4fc" strokeWidth="10" strokeLinecap="round" />
      <circle cx="432" cy="288" r="10" fill="none" stroke="#a5b4fc" strokeWidth="8" />
    </svg>
  );
}

function TopBar() {
  const navigate = useNavigate();
  const userId = localStorage.getItem('ia_userId') || 'demo-user';
  const [showStart, setShowStart] = useState(false);

  const { data: stats } = useQuery({
    queryKey: ['token-stats', userId],
    queryFn: async () => {
      const r = await fetch(`/api/interview/token-stats?userId=${userId}`);
      return r.json();
    },
    refetchInterval: 5000,
  });

  return (
    <nav className="bg-white border-b border-slate-200 pt-safe sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-3 md:py-4 flex items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-2 md:gap-3 min-w-0">
          <WallEIcon className="w-8 h-8 md:w-10 md:h-10 flex-shrink-0" />
          <div className="min-w-0">
            <div className="text-base md:text-xl font-semibold text-slate-900 truncate">小面 · AI 面试官</div>
            <div className="text-xs text-slate-400 hidden md:block">自研 Agent 循环 + Mem0 + MCP</div>
          </div>
        </Link>

        <div className="flex items-center gap-2 md:gap-4">
          {/* 工具/MCP 状态指示 */}
          <ToolsIndicator />

          {/* 面试题知识库入口 */}
          <Link
            to="/question-bank"
            className="flex items-center gap-1.5 text-xs md:text-sm text-slate-600 bg-violet-50 hover:bg-violet-100 px-2.5 py-1.5 rounded-lg transition"
            title="面试题知识库"
          >
            <Database className="w-3.5 h-3.5 text-violet-500" />
            <span className="font-medium text-slate-900">题库</span>
          </Link>

          {/* token 统计 */}
          <div className="hidden sm:flex items-center gap-1.5 text-xs md:text-sm text-slate-600 bg-slate-50 px-2.5 py-1.5 rounded-lg">
            <span className="text-slate-400">⚡</span>
            <span className="font-mono font-medium text-slate-900">
              {(stats?.totalTokens || 0).toLocaleString()}
            </span>
            <span className="text-slate-400">tokens</span>
          </div>

          {/* 开始面试按钮 */}
          <div className="relative">
            <button
              onClick={() => setShowStart(!showStart)}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm md:text-base font-medium px-3 md:px-4 py-2 rounded-lg flex items-center gap-1.5"
            >
              <span>+</span>
              <span className="hidden sm:inline">开始新面试</span>
              <span className="sm:hidden">新面试</span>
            </button>
            {showStart && (
              <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-xl shadow-lg p-2 z-30">
                <button
                  onClick={() => { setShowStart(false); navigate('/?new=1'); }}
                  className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg"
                >
                  🚀 自定义岗位
                </button>
                <button
                  onClick={() => {
                    setShowStart(false);
                    navigate('/?new=1&position=AI+Agent+工程师&level=P5');
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg"
                >
                  🤖 AI Agent 工程师
                </button>
                <button
                  onClick={() => {
                    setShowStart(false);
                    navigate('/?new=1&position=前端开发工程师&level=P5');
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg"
                >
                  🎨 前端开发工程师
                </button>
                <button
                  onClick={() => {
                    setShowStart(false);
                    navigate('/?new=1&position=高级测试工程师&level=P6');
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg"
                >
                  🧪 高级测试工程师
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

function ToolsIndicator() {
  const { data } = useQuery({
    queryKey: ['tools-count'],
    queryFn: async () => {
      const r = await fetch('/api/tools');
      return r.json() as Promise<{ count: number; enabledCount: number }>;
    },
    refetchInterval: 30000,
  });

  return (
    <Link
      to="/tools"
      className="flex items-center gap-1.5 text-xs md:text-sm text-slate-600 bg-slate-50 hover:bg-slate-100 px-2.5 py-1.5 rounded-lg transition"
      title="工具偏好"
    >
      <Cpu className="w-3.5 h-3.5 text-slate-400" />
      <span className="font-medium text-slate-900">{data?.enabledCount ?? 0}</span>
      <span className="text-slate-400">/ {data?.count ?? 0}</span>
    </Link>
  );
}

export default function App() {
  // 初始化 Web Vitals 性能监控
  useEffect(() => { initWebVitals(); }, []);

  return (
    <div className="min-h-screen">
      <TopBar />
      <main>
        <ErrorBoundary>
          <Suspense fallback={<PageSpinner />}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/interview/:id" element={<InterviewPage />} />
              <Route path="/question-bank" element={<QuestionBankPage />} />
              <Route path="/tools" element={<ToolsPage />} />
              <Route path="/admin/mcp" element={<AdminMcpPage />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
}
