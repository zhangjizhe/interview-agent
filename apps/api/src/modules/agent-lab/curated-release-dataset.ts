export const CURATED_INTERVIEW_RELEASE_DATASET_KEY = 'interview-release-v1';
export const CURATED_INTERVIEW_RELEASE_EVALUATOR_KEY = 'interview-release-keywords-v1';

const provenance = {
  sourceType: 'synthetic-product-scenario',
  sourceReference: 'docs/PROJECT-CONSTITUTION.md',
  owner: 'agent-lab-maintainers',
  allowedUse: 'agent-release-evaluation',
  containsCandidateData: false,
  containsPersonalData: false,
  reviewStatus: 'maintainer-review-required',
} as const;

export const CURATED_INTERVIEW_RELEASE_DATASET = {
  key: CURATED_INTERVIEW_RELEASE_DATASET_KEY,
  name: 'Interview Agent 发布回归集',
  description: '覆盖 RAG、Agent Evaluation 与系统设计的合成业务场景。仅用于发布回归，不含候选人或生产会话数据。',
  version: '1.0.0',
  metadata: {
    manifestVersion: 'interview-release/v1',
    purpose: 'release-regression',
    provenance,
    review: { status: 'PENDING' },
  },
  cases: [
    releaseCase('rag-retrieval-foundation', '请只提出一道 RAG 基础面试题，题目中必须使用术语“检索”。', '检索', 'rag', 'foundation'),
    releaseCase('rag-recall-intermediate', '请只提出一道 RAG 中级面试题，题目中必须使用术语“召回”。', '召回', 'rag', 'intermediate'),
    releaseCase('rag-hybrid-advanced', '请只提出一道 RAG 高级面试题，题目中必须使用术语“混合检索”。', '混合检索', 'rag', 'advanced'),
    releaseCase('rag-grounding-foundation', '请只提出一道 RAG 基础面试题，题目中必须使用术语“证据”。', '证据', 'rag', 'foundation'),
    releaseCase('evaluation-metric-foundation', '请只提出一道 Agent Evaluation 基础面试题，题目中必须使用术语“评估”。', '评估', 'agent-evaluation', 'foundation'),
    releaseCase('evaluation-dataset-intermediate', '请只提出一道 Agent Evaluation 中级面试题，题目中必须使用术语“数据集”。', '数据集', 'agent-evaluation', 'intermediate'),
    releaseCase('evaluation-regression-advanced', '请只提出一道 Agent Evaluation 高级面试题，题目中必须使用术语“回归”。', '回归', 'agent-evaluation', 'advanced'),
    releaseCase('evaluation-evidence-intermediate', '请只提出一道 Agent Evaluation 中级面试题，题目中必须使用术语“证据”。', '证据', 'agent-evaluation', 'intermediate'),
    releaseCase('system-components-foundation', '请只提出一道系统设计基础面试题，题目中必须使用术语“组件”。', '组件', 'system-design', 'foundation'),
    releaseCase('system-concurrency-intermediate', '请只提出一道系统设计中级面试题，题目中必须使用术语“并发”。', '并发', 'system-design', 'intermediate'),
    releaseCase('system-degradation-advanced', '请只提出一道系统设计高级面试题，题目中必须使用术语“降级”。', '降级', 'system-design', 'advanced'),
    releaseCase('system-cost-advanced', '请只提出一道系统设计高级面试题，题目中必须使用术语“成本”。', '成本', 'system-design', 'advanced'),
  ],
} as const;

export const CURATED_INTERVIEW_RELEASE_EVALUATOR = {
  key: CURATED_INTERVIEW_RELEASE_EVALUATOR_KEY,
  name: 'Interview 发布术语遵循检查',
  type: 'KEYWORD' as const,
  config: {
    minScore: 100,
    contractVersion: 'interview-release-keywords/v1',
  },
};

function releaseCase(
  key: string,
  message: string,
  keyword: string,
  skill: 'rag' | 'agent-evaluation' | 'system-design',
  difficulty: 'foundation' | 'intermediate' | 'advanced',
) {
  return {
    key,
    input: { message },
    expectedOutput: { keywords: [keyword] },
    metadata: {
      segments: {
        jobFamily: 'ai-agent-engineer',
        skill,
        difficulty,
      },
      provenance,
    },
    enabled: true,
  };
}
