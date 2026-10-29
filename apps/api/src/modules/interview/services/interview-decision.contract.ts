import { z } from 'zod';
import type { AgentDecision } from './heuristic-decide.util';

// Shared by the actual interview decision and its offline calibration runner.
// Changing this version invalidates comparability with older scoring prompts.
export const INTERVIEW_DECISION_CONTRACT_VERSION = 'interview-decision/v1';

export const AgentDecisionSchema = z.object({
  // ── 评分维度 ──
  score: z.number().finite().min(0).max(1).describe('综合评分'),
  completeness: z.number().finite().min(0).max(1).describe('回答完整性'),
  correctness: z.number().finite().min(0).max(1).describe('回答正确性'),
  depth: z.number().finite().min(0).max(1).describe('回答深度'),
  feedback: z.string().trim().min(1).max(4000).describe('改进建议'),
  keyPoints: z.array(z.string().trim().min(1).max(500)).max(64).describe('回答中涉及的关键点'),
  missingPoints: z.array(z.string().trim().min(1).max(500)).max(64).describe('缺失的关键点'),
  // ── Agent 决策维度 ──
  shouldFollowUp: z.boolean().describe('是否需要追问（Agent 自主判断，不是规则阈值）'),
  followUpQuestion: z.string().max(4000).nullable().describe('追问问题（基于候选人回答语义生成，null 则不追问）'),
  followUpReason: z.string().max(4000).nullable().describe('追问理由（为什么追问这个点）'),
  shouldAdvance: z.boolean().describe('是否需要进阶题'),
  advancedQuestion: z.string().max(4000).nullable().describe('进阶问题（null 则不进阶）'),
}).strict().superRefine((value, context) => {
  if (value.shouldFollowUp && (!value.followUpQuestion?.trim() || !value.followUpReason?.trim())) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['followUpQuestion'], message: 'A follow-up requires its question and reason' });
  }
  if (value.shouldAdvance && !value.advancedQuestion?.trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['advancedQuestion'], message: 'An advance decision requires its question' });
  }
});

export function buildInterviewDecisionMessages(question: string, answer: string, category: string, difficulty: string) {
  return [
    { role: 'system' as const, content: `你是一位资深技术面试官，需要同时完成两件事：

1. **评估候选人回答**：给出结构化评分
2. **自主决策下一步**：基于回答的语义内容（而非分数阈值），决定是否追问或出进阶题

【评分标准】
- score: 综合评分 (0-1)
- completeness: 完整性 (0-1)，是否覆盖核心要点
- correctness: 正确性 (0-1)，内容是否准确
- depth: 深度 (0-1)，是否有细节和原理
- feedback: 改进建议
- keyPoints: 回答中涉及的关键点
- missingPoints: 缺失的关键点

【Agent 决策规则】
- shouldFollowUp: 你自己判断是否需要追问。不要用分数阈值，而是看回答内容：
  - 回答提到了某个概念但理解有偏差 → 追问澄清
  - 回答只说了表面，缺少深层理解 → 追问深入
  - 回答已经很好很完整 → 不需要追问
  - 回答完全跑题 → 不追问（追问也没意义）
- followUpQuestion: 如果 shouldFollowUp=true，生成针对性追问（基于候选人说的具体内容）
- followUpReason: 为什么决定追问这个点
- shouldAdvance: 回答质量很高，可以出更难的题
- advancedQuestion: 如果 shouldAdvance=true，生成进阶题

【追问示例】
问题："请解释 React 中 useEffect 的工作原理"
回答："useEffect 在组件渲染后执行副作用，依赖数组控制执行时机，空数组表示只执行一次"
→ shouldFollowUp=true, followUpQuestion="你提到依赖数组控制执行时机，能具体说说什么场景下遇到过依赖数组导致的死循环吗？你是怎么排查和解决的？", followUpReason="候选人理解了基本概念，但依赖数组是 useEffect 最容易出 bug 的地方，追问可以考察实战经验"

回答："useEffect 就是组件加载时执行代码"
→ shouldFollowUp=true, followUpQuestion="useEffect 的依赖数组具体是怎么工作的？如果依赖项是引用类型会怎样？", followUpReason="回答过于简略，缺少对依赖机制的理解"

回答："useEffect 接收一个回调函数和一个依赖数组。组件挂载时执行回调；依赖数组变化时重新执行；返回函数作为清理逻辑。空数组 [] 表示只在挂载时执行一次。React 18 严格模式下会双重调用以检测副作用。常见陷阱包括闭包陈旧引用和无限循环。"
→ shouldFollowUp=false, followUpQuestion=null, followUpReason="回答已经非常完整，覆盖了核心机制、清理逻辑、严格模式行为和常见陷阱"

请用 JSON 格式输出，不要有其他文字。`,
    },
    { role: 'user' as const, content: `问题：${question}\n\n候选人回答：${answer}\n\n方向：${category}，难度：${difficulty}` },
  ];
}

export function parseInterviewDecision(content: string): AgentDecision {
  if (typeof content !== 'string' || content.length > 128_000) {
    throw new Error('Interview decision exceeds the response contract');
  }
  // This project compiles without strictNullChecks; Zod infers optional properties even after required-field validation.
  return AgentDecisionSchema.parse(JSON.parse(content)) as AgentDecision;
}
