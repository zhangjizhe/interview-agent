// Deterministic private-fixture replies exercise consumers, never model quality.
export function goldenModelReply(body, { stage = 'baseline' } = {}) {
  if (!['baseline', 'retest'].includes(stage)) throw new Error('GOLDEN_FIXTURE_STAGE_INVALID');
  if (!body || !Array.isArray(body.messages) || !body.messages.length
    || !Array.from(body.messages).every(message => message && ['system', 'user', 'assistant', 'tool'].includes(message.role) && typeof message.content === 'string')) {
    throw new Error('GOLDEN_FIXTURE_MESSAGES_INVALID');
  }
  const systems = body.messages.filter(message => message.role === 'system').map(message => message.content);
  const user = body.messages.filter(message => message.role === 'user').at(-1)?.content || '';
  const kinds = new Set();
  for (const prompt of systems) {
    if (body.stream === true && prompt.startsWith('你是一位资深 AI 面试官。你的职责是：') && prompt.includes('【当前任务】')) kinds.add('executor-text');
    if (body.stream === true && prompt.startsWith('你是一位专业的 AI 面试官小面。') && prompt.includes('【最近收集到的信息（仅参考，不要复述）】')) kinds.add('reviewer-text');
    if (prompt.startsWith('你是一个意图分类器。根据用户最新消息和对话历史，判断用户意图。')) kinds.add('supervisor');
    if (prompt.startsWith('你是一个任务规划专家。根据用户意图，将任务拆解为可执行的步骤。')) kinds.add('planner');
    if (prompt.startsWith('你是一个严格的质量审核员。审阅以下面试官回复是否合格。')) kinds.add('reviewer');
    if (prompt.startsWith('你是一位资深技术面试官，需要同时完成两件事：') && prompt.includes('【评分标准】')) kinds.add('decision');
    if (prompt === '你是一个严格的面试评估 AI。' && user.startsWith('你是一位严格的面试评估 AI。') && user.includes('【已评分答题记录】') && user.includes('【输出格式】')) kinds.add('report');
    if (prompt === '你是一个严格的面试官。' && user.startsWith('你是一位资深面试官。请基于候选人的简历，为【') && user.includes('【候选人简历摘要】') && user.includes('【输出 JSON】')) kinds.add('personalized');
  }
  if (kinds.size !== 1) throw new Error('GOLDEN_FIXTURE_PROMPT_UNSUPPORTED');
  const score = stage === 'retest' ? 0.8 : 0.45;
  switch ([...kinds][0]) {
    case 'executor-text':
    case 'reviewer-text': return '这是合成工程验收回复。请说明如何验证资源清理和重复执行的边界。';
    case 'supervisor': return JSON.stringify({ intent: 'mock_interview', reason: 'Synthetic engineering fixture routing only' });
    case 'planner': return JSON.stringify({ steps: [{ id: 'synthetic-interview-step', action: 'ask_llm', specialist: 'interviewer', description: '提出一个关于约束与验证的面试问题。' }], reasoning: 'Synthetic single-step engineering fixture' });
    case 'reviewer': return JSON.stringify({ verdict: 'approved', score: 0.9, issues: [], suggestion: '', confidence: 0.9, issue_tags: [], reflection: '' });
    case 'decision': return JSON.stringify({ score, completeness: score, correctness: score, depth: score, feedback: 'Synthetic fixture: explain constraints and verification.', keyPoints: ['constraint'], missingPoints: ['verification'], shouldFollowUp: false, followUpQuestion: null, followUpReason: null, shouldAdvance: false, advancedQuestion: null });
    case 'report': return JSON.stringify({ overallScore: score * 100, scores: { technical: score * 100, communication: score * 100, logic: score * 100, learning: score * 100 }, strengths: ['Synthetic explicit constraint'], weaknesses: ['Synthetic verification gap'], suggestions: ['Synthetic targeted verification practice'] });
    case 'personalized': return JSON.stringify({ questions: [{ question: '请说明合成项目中的约束与验证方式。', reason: 'Synthetic resume project fixture' }] });
    default: throw new Error('GOLDEN_FIXTURE_PROMPT_UNSUPPORTED');
  }
}
