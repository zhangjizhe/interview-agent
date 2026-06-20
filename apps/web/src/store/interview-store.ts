import { create } from 'zustand';
import type { Report, AgentEvent } from '@interview-agent/shared-types';

interface ChatMessage {
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

interface InterviewState {
  // ========== 渲染触发器（解决 React batching 问题）==========
  _renderCount: number;
  forceRender: () => void;

  // ========== 消息流（流式核心） ==========
  messages: ChatMessage[];
  /** 追加一条完整消息（用户或 assistant 占位） */
  addMessage: (msg: ChatMessage) => void;
  /** 追加 token 到最后一条 streaming=true 的 assistant 消息 */
  appendToLastMessage: (delta: string) => void;
  /** 把最后一条 streaming 消息的 streaming 标记置 false */
  finalizeLastMessage: () => void;
  /** 整体替换 messages（刷新历史用） */
  setMessages: (messages: ChatMessage[]) => void;

  // ========== Agent / 工具调用事件流（CoT 面板用） ==========
  agentEvents: AgentEvent[];
  appendAgentEvent: (event: AgentEvent) => void;
  clearAgentEvents: () => void;

  // ========== 输入框（避免 prop drilling） ==========
  input: string;
  setInput: (input: string) => void;

  // ========== 报告 ==========
  report: Report | null;
  setReport: (report: Report | null) => void;

  // ========== 简历 ==========
  resume: Resume | null;
  setResume: (resume: Resume | null) => void;
  resumeConfirmed: boolean;
  setResumeConfirmed: (confirmed: boolean) => void;
  resumePanelOpen: boolean;
  setResumePanelOpen: (open: boolean) => void;

  // ========== UI 状态 ==========
  ending: boolean;
  setEnding: (ending: boolean) => void;
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  sessionTokens: number;
  addTokens: (tokens: number) => void;
  uploading: boolean;
  setUploading: (uploading: boolean) => void;
  uploadedName: string | null;
  setUploadedName: (name: string | null) => void;
  confirming: boolean;
  setConfirming: (confirming: boolean) => void;

  // ========== 流式状态（Transient） ==========
  streaming: boolean;
  setStreaming: (v: boolean) => void;
  reconnecting: boolean;
  setReconnecting: (v: boolean) => void;
  error: string | null;
  setError: (e: string | null) => void;

  // ========== HITL 审批状态 ==========
  hitlPending: boolean;
  hitlScore: number | null;
  hitlIssues: string[];
  hitlSuggestion: string | null;
  hitlResuming: boolean;
  setHitlPending: (pending: boolean, data?: { score?: number; issues?: string[]; suggestion?: string }) => void;
  setHitlResuming: (resuming: boolean) => void;

  // ========== 重置 ==========
  reset: () => void;
}

const initialState = {
  _renderCount: 0,
  messages: [] as ChatMessage[],
  agentEvents: [] as AgentEvent[],
  input: '',
  report: null,
  resume: null,
  resumeConfirmed: true,
  resumePanelOpen: false,
  ending: false,
  drawerOpen: false,
  sessionTokens: 0,
  uploading: false,
  uploadedName: null,
  confirming: false,
  streaming: false,
  reconnecting: false,
  error: null,
  hitlPending: false,
  hitlScore: null as number | null,
  hitlIssues: [] as string[],
  hitlSuggestion: null as string | null,
  hitlResuming: false,
};

export const useInterviewStore = create<InterviewState>((set, get) => ({
  ...initialState,

  forceRender: () => set((s) => ({ _renderCount: s._renderCount + 1 })),

  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),

  appendToLastMessage: (delta) =>
    set((s) => {
      if (s.messages.length === 0) return s;
      const last = s.messages[s.messages.length - 1];
      if (last.role !== 'assistant' || !last.streaming) return s;

      // Dedup：检查 delta 是否与 last.content 末尾重叠（重复内容）
      // 触发场景：
      //   1. LLM 偶发重复输出（如"嗯嗯"重复一次）
      //   2. 后端 SSE 重发（如网络重试、pull-to-refresh 期间 store 重置后 token 重入）
      //   3. useInterviewStream 自动重试导致同一 token 被 append 两次
      // 实现：找 last.content 末尾与 delta 开头的最大重叠，跳过重叠部分
      let dedupDelta = delta;
      const lastContent = last.content;
      if (lastContent.length > 0 && delta.length > 0) {
        const maxOverlap = Math.min(delta.length, lastContent.length);
        for (let overlap = maxOverlap; overlap > 0; overlap--) {
          if (lastContent.endsWith(delta.slice(0, overlap))) {
            dedupDelta = delta.slice(overlap);
            break;
          }
        }
      }
      if (dedupDelta.length === 0) return s; // 全部重复，不追加

      const newLast = { ...last, content: last.content + dedupDelta };
      return {
        messages: [...s.messages.slice(0, -1), newLast],
      };
    }),

  finalizeLastMessage: () =>
    set((s) => {
      if (s.messages.length === 0) return s;
      const last = s.messages[s.messages.length - 1];
      if (last.role !== 'assistant') return s;
      return {
        messages: [...s.messages.slice(0, -1), { ...last, streaming: false }],
      };
    }),

  setMessages: (messages) => set({ messages }),

  appendAgentEvent: (event) =>
    set((s) => ({ agentEvents: [...s.agentEvents, event] })),

  clearAgentEvents: () => set({ agentEvents: [] }),

  setInput: (input) => set({ input }),

  setReport: (report) => set({ report }),

  setResume: (resume) => set({ resume }),

  setResumeConfirmed: (resumeConfirmed) => set({ resumeConfirmed }),

  setResumePanelOpen: (resumePanelOpen) => set({ resumePanelOpen }),

  setEnding: (ending) => set({ ending }),

  setDrawerOpen: (drawerOpen) => set({ drawerOpen }),

  addTokens: (tokens) =>
    set((s) => ({ sessionTokens: s.sessionTokens + tokens })),

  setUploading: (uploading) => set({ uploading }),

  setUploadedName: (uploadedName) => set({ uploadedName }),

  setConfirming: (confirming) => set({ confirming }),

  streaming: false,
  setStreaming: (streaming) => set({ streaming }),
  reconnecting: false,
  setReconnecting: (reconnecting) => set({ reconnecting }),
  error: null,
  setError: (error) => set({ error }),

  setHitlPending: (pending, data) =>
    set({
      hitlPending: pending,
      hitlScore: data?.score ?? null,
      hitlIssues: data?.issues ?? [],
      hitlSuggestion: data?.suggestion ?? null,
    }),

  setHitlResuming: (hitlResuming) => set({ hitlResuming }),

  reset: () => set(initialState),
}));
