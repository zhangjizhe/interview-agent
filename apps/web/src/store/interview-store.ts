import { create } from 'zustand';
import type { Report } from '@interview-agent/shared-types';

interface Resume {
  name: string | null;
  position: string;
  summary: string;
  skills: string;
  createdAt: string;
}

interface InterviewState {
  // 消息
  messages: { role: 'user' | 'assistant'; content: string; streaming?: boolean }[];
  addMessage: (msg: { role: 'user' | 'assistant'; content: string; streaming?: boolean }) => void;
  updateLastMessage: (content: string, streaming?: boolean) => void;
  setMessages: (messages: InterviewState['messages']) => void;

  // 输入
  input: string;
  setInput: (input: string) => void;

  // 报告
  report: Report | null;
  setReport: (report: Report | null) => void;

  // 简历
  resume: Resume | null;
  setResume: (resume: Resume | null) => void;
  resumeConfirmed: boolean;
  setResumeConfirmed: (confirmed: boolean) => void;
  resumePanelOpen: boolean;
  setResumePanelOpen: (open: boolean) => void;

  // UI 状态
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

  // 重置
  reset: () => void;
}

const initialState = {
  messages: [],
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
};

export const useInterviewStore = create<InterviewState>((set) => ({
  ...initialState,

  addMessage: (msg) =>
    set((s) => ({ messages: [...s.messages, msg] })),

  updateLastMessage: (content, streaming) =>
    set((s) => {
      const last = s.messages[s.messages.length - 1];
      if (last?.role === 'assistant' && last.streaming) {
        return {
          messages: [...s.messages.slice(0, -1), { ...last, content, streaming }],
        };
      }
      return s;
    }),

  setMessages: (messages) => set({ messages }),

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

  reset: () => set(initialState),
}));
