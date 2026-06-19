import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Upload, Search, Trash2, Plus, Sparkles, Loader2, Database, BookOpen, Layers, X, Tag, FileText, Clock, Hash } from 'lucide-react';

const POSITIONS = ['后端开发工程师', '前端开发工程师', 'AI Agent 工程师', '算法工程师', '产品经理'];

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
const LEVELS = ['P4', 'P5', 'P6', 'P7'];

// 标签颜色映射（按维度）
const TAG_COLORS: Record<string, string> = {
  '架构': 'bg-blue-100 text-blue-700',
  '原理': 'bg-purple-100 text-purple-700',
  '性能': 'bg-orange-100 text-orange-700',
  '存储': 'bg-emerald-100 text-emerald-700',
  '工具': 'bg-cyan-100 text-cyan-700',
  '算法': 'bg-pink-100 text-pink-700',
  '场景': 'bg-yellow-100 text-yellow-700',
  '对比': 'bg-rose-100 text-rose-700',
  '深挖': 'bg-indigo-100 text-indigo-700',
};
const getTagColor = (tag: string) => TAG_COLORS[tag] || 'bg-slate-100 text-slate-700';

// 简单 markdown 渲染（仅支持加粗/换行/列表/代码块）
const renderMarkdown = (md: string) => {
  if (!md) return null;
  const lines = md.split('\n');
  const elements: JSX.Element[] = [];
  let inCode = false;
  let codeBuf: string[] = [];

  lines.forEach((line, i) => {
    if (line.startsWith('```')) {
      if (inCode) {
        elements.push(
          <pre key={`code-${i}`} className="bg-slate-900 text-slate-100 rounded-lg p-3 text-xs overflow-x-auto my-2">
            <code>{codeBuf.join('\n')}</code>
          </pre>,
        );
        codeBuf = [];
        inCode = false;
      } else {
        inCode = true;
      }
      return;
    }
    if (inCode) {
      codeBuf.push(line);
      return;
    }
    // 处理加粗
    const renderBold = (text: string, key: string) => {
      const parts = text.split(/(\*\*[^*]+\*\*)/g);
      return parts.map((p, j) => {
        if (p.startsWith('**') && p.endsWith('**')) {
          return <strong key={`${key}-${j}`} className="font-semibold text-slate-900">{p.slice(2, -2)}</strong>;
        }
        return <span key={`${key}-${j}`}>{p}</span>;
      });
    };

    if (line.startsWith('## ')) {
      elements.push(<h2 key={i} className="text-base font-semibold text-slate-900 mt-4 mb-2">{line.slice(3)}</h2>);
    } else if (line.startsWith('# ')) {
      elements.push(<h1 key={i} className="text-lg font-semibold text-slate-900 mt-4 mb-2">{line.slice(2)}</h1>);
    } else if (line.match(/^[-*]\s/)) {
      elements.push(
        <div key={i} className="flex gap-2 my-1 text-sm text-slate-700">
          <span className="text-slate-400 mt-1">•</span>
          <span>{renderBold(line.slice(2), `li-${i}`)}</span>
        </div>,
      );
    } else if (line.match(/^\d+\.\s/)) {
      elements.push(
        <div key={i} className="flex gap-2 my-1 text-sm text-slate-700">
          <span className="text-slate-400 min-w-[1.5rem]">{line.match(/^\d+/)![0]}.</span>
          <span>{renderBold(line.replace(/^\d+\.\s/, ''), `ol-${i}`)}</span>
        </div>,
      );
    } else if (line.startsWith('|')) {
      // 表格行（简化：合并到一行）
      elements.push(<div key={i} className="text-xs font-mono text-slate-600 bg-slate-50 px-2 py-1 rounded my-0.5">{line}</div>);
    } else if (line.trim() === '---') {
      elements.push(<hr key={i} className="my-3 border-slate-200" />);
    } else if (line.trim()) {
      elements.push(<p key={i} className="text-sm text-slate-700 my-1 leading-relaxed">{renderBold(line, `p-${i}`)}</p>);
    }
  });

  return <div>{elements}</div>;
};

interface Question {
  id: string;
  questionId: string;
  position: string;
  level: string;
  category: string;
  question: string;
  answer: string;
  tags: string[] | string;
  createdAt: string;
  score?: number;
  source: 'milvus' | 'qdrant';
  preview?: string;
  difficulty?: string;
}

export function QuestionBankPage() {
  const [view, setView] = useState<'list' | 'add' | 'search' | 'import'>('list');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [searchResults, setSearchResults] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState<null | 'file' | 'url'>(null);
  const [importResult, setImportResult] = useState<{
    count: number;
    source: string;
    questionIds: string[];
  } | null>(null);
  const [urlForm, setUrlForm] = useState({ url: '' });
  const [importFileEl, setImportFileEl] = useState<HTMLInputElement | null>(null);

  const [form, setForm] = useState({
    position: POSITIONS[0],
    level: 'P5',
    category: '通用',
    question: '',
    answer: '',
    tags: '',
    storeTo: 'milvus' as 'milvus' | 'qdrant',
  });

  const [searchForm, setSearchForm] = useState({
    query: '',
    position: '',
    level: '',
    category: '',
  });

  const [filter, setFilter] = useState({ position: '', limit: 20 });

  // 弹窗状态
  const [modal, setModal] = useState<Question | null>(null);

  // 弹窗打开时锁定背景滚动，关闭时恢复
  useEffect(() => {
    if (modal) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [modal]);

  // ESC 关闭弹窗
  useEffect(() => {
    if (!modal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModal(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal]);

  // 工具：tags 统一转数组
  const tagsToArray = (tags: string[] | string | undefined): string[] => {
    if (!tags) return [];
    if (Array.isArray(tags)) return tags;
    return tags.split(/[,，、\s]+/).filter(Boolean);
  };

  const loadList = async () => {
    setLoading(true);
    try {
      const [milvusRes, qdrantRes] = await Promise.all([
        fetch(`/api/interview/question-bank/list?position=${encodeURIComponent(filter.position)}&limit=${filter.limit}`),
        fetch('/api/knowledge-base/list'),
      ]);
      
      const milvusData = await safeJson(milvusRes);
      const qdrantData = await safeJson(qdrantRes);

      const milvusQuestions: Question[] = (milvusData.results || []).map((q: any) => ({
        ...q,
        source: 'milvus' as const,
      }));

      const qdrantQuestions: Question[] = (qdrantData.items || []).map((item: any) => ({
        id: item.id,
        questionId: item.id,
        position: item.topic,
        level: '',
        category: '',
        question: item.title,
        answer: item.body,
        tags: Array.isArray(item.tags) ? item.tags : [],
        preview: item.preview || '',
        difficulty: item.difficulty || '',
        createdAt: '',
        source: 'qdrant' as const,
      }));

      setQuestions([...milvusQuestions, ...qdrantQuestions]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (view === 'list') loadList();
  }, [view, filter]);

  const submitOne = async () => {
    if (!form.question.trim() || !form.answer.trim()) {
      alert('题目和答案不能为空');
      return;
    }
    setLoading(true);
    try {
      let r: Response;
      if (form.storeTo === 'milvus') {
        r = await fetch('/api/interview/questions/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...form,
            tags: form.tags.split(/[,，、\s]+/).filter(Boolean),
          }),
        });
      } else {
        r = await fetch('/api/knowledge-base/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: form.position,
            title: form.question,
            body: form.answer,
            tags: form.tags.split(/[,，、\s]+/).filter(Boolean),
          }),
        });
      }
      const data = await safeJson(r);
      if (!data._error) {
        alert('已添加');
        setForm({ ...form, question: '', answer: '', tags: '' });
        setView('list');
        loadList();
      } else {
        alert('失败：' + (data.message || JSON.stringify(data)));
      }
    } finally {
      setLoading(false);
    }
  };

  const submitSearch = async () => {
    if (!searchForm.query.trim()) {
      alert('请输入搜索词');
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ q: searchForm.query });
      if (searchForm.position) params.set('position', searchForm.position);
      if (searchForm.level) params.set('level', searchForm.level);
      if (searchForm.category) params.set('category', searchForm.category);

      const [milvusRes, qdrantRes] = await Promise.all([
        fetch(`/api/interview/question-bank/search?${params}`),
        fetch(`/api/knowledge-base/recall?${params}`),
      ]);

      const milvusData = await safeJson(milvusRes);
      const qdrantData = await safeJson(qdrantRes);

      const milvusResults: Question[] = (milvusData.results || []).map((q: any) => ({
        ...q,
        source: 'milvus' as const,
      }));

      const qdrantResults: Question[] = (qdrantData.hits || []).map((item: any) => ({
        id: item.item?.id || item.id,
        questionId: item.item?.id || item.id,
        position: item.item?.topic || item.topic,
        level: '',
        category: '',
        question: item.item?.title || item.title,
        answer: item.item?.body || item.body,
        tags: Array.isArray(item.item?.tags) ? item.item.tags : [],
        preview: item.item?.preview || '',
        difficulty: item.item?.difficulty || '',
        createdAt: '',
        score: item.score,
        source: 'qdrant' as const,
      }));

      setSearchResults([...milvusResults, ...qdrantResults].sort((a, b) => (b.score || 0) - (a.score || 0)));
    } finally {
      setLoading(false);
    }
  };

  const deleteQuestion = async (qid: string, source: 'milvus' | 'qdrant') => {
    if (!confirm(`确认删除题目 ${qid}？`)) return;
    if (source === 'milvus') {
      await fetch(`/api/interview/question-bank/${qid}`, { method: 'DELETE' });
    }
    loadList();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting('file');
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('position', form.position);
      fd.append('level', form.level);
      fd.append('category', form.category);
      const r = await fetch('/api/interview/question-bank/import-file', {
        method: 'POST',
        body: fd,
      });
      const data = await safeJson(r);
      if (data._error) {
        alert('导入失败：' + (data.message || JSON.stringify(data)));
      } else {
        setImportResult({
          count: data.count || 0,
          source: `file:${data.filename || file.name}`,
          questionIds: data.questionIds || [],
        });
      }
    } catch (err: any) {
      alert('导入失败：' + err.message);
    } finally {
      setImporting(null);
      if (importFileEl) importFileEl.value = '';
    }
  };

  const handleImportUrl = async () => {
    if (!urlForm.url.trim()) return;
    setImporting('url');
    setImportResult(null);
    try {
      const r = await fetch('/api/interview/question-bank/import-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: urlForm.url,
          position: form.position,
          level: form.level,
          category: form.category,
        }),
      });
      const data = await safeJson(r);
      if (data._error) {
        alert('抓取失败：' + (data.message || JSON.stringify(data)));
      } else {
        setImportResult({
          count: data.count || 0,
          source: `url:${data.url || urlForm.url}`,
          questionIds: data.questionIds || [],
        });
      }
    } catch (err: any) {
      alert('抓取失败：' + err.message);
    } finally {
      setImporting(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 md:px-6 md:py-10 space-y-6">
      <div className="flex items-center justify-between">
        <Link
          to="/"
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900 text-sm"
        >
          <ArrowLeft className="w-4 h-4" /> 返回首页
        </Link>
        <h1 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <Database className="w-5 h-5 text-violet-500" /> 面试题知识库
        </h1>
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        {(['list', 'add', 'import', 'search'] as const).map((v) => (
          <button
            key={v}
            onClick={() => {
              setView(v);
              if (v === 'list') loadList();
            }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              view === v
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {v === 'list'
              ? '📚 题目列表'
              : v === 'add'
              ? '➕ 添加题目'
              : v === 'import'
              ? '📥 批量导入'
              : '🔍 语义搜索'}
          </button>
        ))}
      </div>

      {view === 'list' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filter.position}
              onChange={(e) => setFilter({ ...filter, position: e.target.value })}
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm"
            >
              <option value="">全部岗位</option>
              {POSITIONS.map((p) => <option key={p}>{p}</option>)}
            </select>
            <button
              onClick={loadList}
              disabled={loading}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-sm rounded-lg flex items-center gap-1"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
              刷新
            </button>
            <span className="ml-auto text-xs text-slate-400">
              共 {questions.length} 条
              {questions.filter(q => q.source === 'qdrant').length > 0 && (
                <span className="ml-2">（知识库 {questions.filter(q => q.source === 'qdrant').length} 条）</span>
              )}
            </span>
          </div>

          {questions.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Database className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p>知识库还是空的</p>
              <button
                onClick={() => setView('add')}
                className="mt-3 text-blue-600 hover:underline text-sm"
              >
                添加第一道题
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {questions.map((q) => {
                const tags = tagsToArray(q.tags);
                return (
                  <div
                    key={q.id}
                    onClick={() => setModal(q)}
                    className="py-3 group cursor-pointer hover:bg-slate-50 -mx-2 px-2 rounded-lg transition"
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          {q.source === 'qdrant' && (
                            <span className="text-xs px-1.5 py-0.5 bg-violet-100 text-violet-700 rounded flex items-center gap-1">
                              <BookOpen className="w-3 h-3" /> 知识库
                            </span>
                          )}
                          {q.source === 'milvus' && (
                            <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded flex items-center gap-1">
                              <Layers className="w-3 h-3" /> 题库
                            </span>
                          )}
                          {q.position && (
                            <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded border border-blue-200">
                              {q.position}
                            </span>
                          )}
                          {q.level && (
                            <span className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">
                              {q.level}
                            </span>
                          )}
                          {q.difficulty && (
                            <span className="text-xs px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded border border-amber-200">
                              难度 {q.difficulty}
                            </span>
                          )}
                          {q.category && (
                            <span className="text-xs px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded">
                              {q.category}
                            </span>
                          )}
                          {tags.map((tag) => (
                            <span
                              key={tag}
                              className={`text-xs px-1.5 py-0.5 rounded ${getTagColor(tag)}`}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                        <div className="text-sm text-slate-900 font-medium line-clamp-2">
                          {q.question}
                        </div>
                        {q.preview && (
                          <div className="text-xs text-slate-500 mt-1.5 line-clamp-2 leading-relaxed">
                            {q.preview}
                          </div>
                        )}
                        {!q.preview && q.answer && (
                          <div className="text-xs text-slate-500 mt-1.5 line-clamp-2 leading-relaxed">
                            {q.answer}
                          </div>
                        )}
                      </div>
                      {q.source === 'milvus' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteQuestion(q.questionId, q.source);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                          title="删除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {view === 'add' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">岗位</label>
            <div className="flex flex-wrap gap-2">
              {POSITIONS.map((p) => (
                <button
                  key={p}
                  onClick={() => setForm({ ...form, position: p })}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    form.position === p
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">难度</label>
              <div className="flex gap-2">
                {LEVELS.map((l) => (
                  <button
                    key={l}
                    onClick={() => setForm({ ...form, level: l })}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                      form.level === l
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">分类</label>
              <input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="如：系统设计 / 算法 / 数据库"
                className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">存储位置</label>
            <div className="flex gap-2">
              <button
                onClick={() => setForm({ ...form, storeTo: 'milvus' })}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1 ${
                  form.storeTo === 'milvus'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Layers className="w-3 h-3" /> 题库
              </button>
              <button
                onClick={() => setForm({ ...form, storeTo: 'qdrant' })}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1 ${
                  form.storeTo === 'qdrant'
                    ? 'bg-violet-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <BookOpen className="w-3 h-3" /> 知识库
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">题干</label>
            <textarea
              value={form.question}
              onChange={(e) => setForm({ ...form, question: e.target.value })}
              placeholder="把题目写清楚..."
              rows={3}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">参考答案</label>
            <textarea
              value={form.answer}
              onChange={(e) => setForm({ ...form, answer: e.target.value })}
              placeholder="完整答案或思路要点..."
              rows={4}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              标签 <span className="text-xs text-slate-400">（逗号或空格分隔）</span>
            </label>
            <input
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              placeholder="如：限流, 高并发, 缓存"
              className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm"
            />
          </div>

          <button
            onClick={submitOne}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            添加到知识库
          </button>
        </div>
      )}

      {view === 'search' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-6 space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">搜索词（自然语言）</label>
              <input
                value={searchForm.query}
                onChange={(e) => setSearchForm({ ...searchForm, query: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && submitSearch()}
                placeholder="如：分布式限流 / MySQL 索引 / RAG"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <select
                value={searchForm.position}
                onChange={(e) => setSearchForm({ ...searchForm, position: e.target.value })}
                className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm"
              >
                <option value="">全部岗位</option>
                {POSITIONS.map((p) => <option key={p}>{p}</option>)}
              </select>
              <select
                value={searchForm.level}
                onChange={(e) => setSearchForm({ ...searchForm, level: e.target.value })}
                className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm"
              >
                <option value="">全部难度</option>
                {LEVELS.map((l) => <option key={l}>{l}</option>)}
              </select>
              <input
                value={searchForm.category}
                onChange={(e) => setSearchForm({ ...searchForm, category: e.target.value })}
                placeholder="分类（可选）"
                className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm"
              />
            </div>
            <button
              onClick={submitSearch}
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              语义搜索（同时搜索题库和知识库）
            </button>
          </div>

          {searchResults.length > 0 && (
            <div className="space-y-3">
              {searchResults.map((r, i) => {
                const tags = tagsToArray(r.tags);
                return (
                  <div
                    key={r.id}
                    onClick={() => setModal(r)}
                    className="bg-white rounded-xl border border-slate-200 p-4 cursor-pointer hover:border-blue-300 hover:shadow-sm transition"
                  >
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      {r.source === 'qdrant' && (
                        <span className="text-xs px-1.5 py-0.5 bg-violet-100 text-violet-700 rounded flex items-center gap-1">
                          <BookOpen className="w-3 h-3" /> 知识库
                        </span>
                      )}
                      {r.source === 'milvus' && (
                        <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded flex items-center gap-1">
                          <Layers className="w-3 h-3" /> 题库
                        </span>
                      )}
                      {r.position && (
                        <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded border border-blue-200">
                          {r.position}
                        </span>
                      )}
                      {r.level && (
                        <span className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">
                          {r.level}
                        </span>
                      )}
                      {r.difficulty && (
                        <span className="text-xs px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded border border-amber-200">
                          难度 {r.difficulty}
                        </span>
                      )}
                      {r.category && (
                        <span className="text-xs px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded">
                          {r.category}
                        </span>
                      )}
                      {tags.map((tag) => (
                        <span
                          key={tag}
                          className={`text-xs px-1.5 py-0.5 rounded ${getTagColor(tag)}`}
                        >
                          {tag}
                        </span>
                      ))}
                      {r.score !== undefined && (
                        <span className="ml-auto text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-mono">
                          {(r.score * 100).toFixed(1)}%
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-slate-900 font-medium mb-1">{r.question}</div>
                    {r.preview ? (
                      <div className="text-xs text-slate-500 line-clamp-3 leading-relaxed">{r.preview}</div>
                    ) : (
                      <div className="text-xs text-slate-500 line-clamp-3 leading-relaxed">{r.answer}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {!loading && searchResults.length === 0 && searchForm.query && (
            <div className="text-center text-slate-400 py-8">未找到匹配题目</div>
          )}
        </div>
      )}

      {view === 'import' && (
        <div className="space-y-4">
          {importResult ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <div className="text-emerald-700 font-medium mb-1">导入成功！</div>
              <div className="text-sm text-emerald-600">
                从 {importResult.source} 导入了 {importResult.count} 道题目
              </div>
              {importResult.questionIds.length > 0 && (
                <div className="text-xs text-emerald-500 mt-2">
                  ID: {importResult.questionIds.join(', ')}
                </div>
              )}
              <button
                onClick={() => { setImportResult(null); setView('list'); }}
                className="mt-3 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded-lg"
              >
                返回列表
              </button>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">岗位</label>
                  <div className="flex flex-wrap gap-2">
                    {POSITIONS.map((p) => (
                      <button
                        key={p}
                        onClick={() => setForm({ ...form, position: p })}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                          form.position === p
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">难度</label>
                    <div className="flex gap-2">
                      {LEVELS.map((l) => (
                        <button
                          key={l}
                          onClick={() => setForm({ ...form, level: l })}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                            form.level === l
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">分类</label>
                    <input
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      placeholder="如：系统设计"
                      className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-6">
                <h3 className="font-medium text-slate-900 mb-4 flex items-center gap-2">
                  <Upload className="w-4 h-4" /> 上传本地文件
                </h3>
                <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center">
                  <input
                    ref={(el) => setImportFileEl(el)}
                    type="file"
                    accept=".json,.txt,.md"
                    onChange={handleImportFile}
                    className="hidden"
                    id="file-upload"
                  />
                  <label
                    htmlFor="file-upload"
                    className="cursor-pointer"
                  >
                    <div className="text-slate-400 mb-2">
                      <Upload className="w-8 h-8 mx-auto" />
                    </div>
                    <div className="text-sm text-slate-600">点击或拖拽文件到此处</div>
                    <div className="text-xs text-slate-400 mt-1">支持 JSON / TXT / MD 格式</div>
                  </label>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-6">
                <h3 className="font-medium text-slate-900 mb-4">从 URL 抓取</h3>
                <div className="flex gap-2">
                  <input
                    value={urlForm.url}
                    onChange={(e) => setUrlForm({ url: e.target.value })}
                    placeholder="输入文章 URL..."
                    className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  />
                  <button
                    onClick={handleImportUrl}
                    disabled={!urlForm.url.trim() || importing === 'url'}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-sm rounded-lg disabled:opacity-50"
                  >
                    {importing === 'url' ? <Loader2 className="w-4 h-4 animate-spin" /> : '抓取'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* 题目详情弹窗 */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 overflow-hidden"
          onClick={() => setModal(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-3xl w-full max-h-[85vh] h-full shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between p-5 border-b border-slate-200 flex-shrink-0">
              <div className="flex-1 min-w-0 pr-3">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  {modal.source === 'qdrant' && (
                    <span className="text-xs px-1.5 py-0.5 bg-violet-100 text-violet-700 rounded flex items-center gap-1">
                      <BookOpen className="w-3 h-3" /> 知识库
                    </span>
                  )}
                  {modal.source === 'milvus' && (
                    <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded flex items-center gap-1">
                      <Layers className="w-3 h-3" /> 题库
                    </span>
                  )}
                  {modal.position && (
                    <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded border border-blue-200">
                      {modal.position}
                    </span>
                  )}
                  {modal.level && (
                    <span className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">
                      {modal.level}
                    </span>
                  )}
                  {modal.difficulty && (
                    <span className="text-xs px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded border border-amber-200">
                      难度 {modal.difficulty}
                    </span>
                  )}
                  {modal.category && (
                    <span className="text-xs px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded">
                      {modal.category}
                    </span>
                  )}
                  {modal.score !== undefined && (
                    <span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">
                      相似度 {(modal.score * 100).toFixed(1)}%
                    </span>
                  )}
                </div>
                <h2 className="text-base font-semibold text-slate-900 leading-snug">
                  {modal.question}
                </h2>
                {tagsToArray(modal.tags).length > 0 && (
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    <Tag className="w-3 h-3 text-slate-400" />
                    {tagsToArray(modal.tags).map((tag) => (
                      <span
                        key={tag}
                        className={`text-xs px-1.5 py-0.5 rounded ${getTagColor(tag)}`}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => setModal(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition flex-shrink-0"
                title="关闭"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-5 overscroll-contain">
              <div className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-1">
                <FileText className="w-4 h-4" /> 完整内容
              </div>
              {renderMarkdown(modal.answer)}
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 bg-slate-50 text-xs text-slate-500 flex-shrink-0">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <Hash className="w-3 h-3" /> {modal.questionId || modal.id}
                </span>
                {modal.createdAt && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {modal.createdAt}
                  </span>
                )}
              </div>
              <button
                onClick={() => setModal(null)}
                className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}