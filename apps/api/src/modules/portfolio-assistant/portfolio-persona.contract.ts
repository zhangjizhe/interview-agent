import { createHash } from 'node:crypto';
import { PortfolioDocument } from './portfolio.contract';
import { renderPortfolioDelivery } from './portfolio-guide.contract';
import voices from './data/portfolio-persona.v1.json';

export const PORTFOLIO_PERSONA_MODE = 'grounded-first-person/v1';
export const isPortfolioGreeting = (question: string) => /^(你好|您好|嗨|哈喽|hello|hi)[！!。.,，\s]*$/i.test(question.trim());
export function currentPortfolioQuestion(question: string) {
  try { const value = JSON.parse(question); if (typeof value.question === 'string') return value.question; } catch { /* ordinary question */ }
  return question;
}
export function isCareerOverview(question: string) {
  const q = currentPortfolioQuestion(question);
  return /工作经历|职业经历|职业方向|擅长|优势|个人介绍|自我介绍|你是谁|了解你|认识你/.test(q)
    && !/cti|urtc|\brtc\b|im\s*sdk|interview-agent|京东|优刻得|暖哇|众安|音视频|电销|送礼|rag|文章|promise|webpack/i.test(q);
}

/** Owner-authorized first-person wording with exact evidence fingerprints.
 * Model selection and checked technical notes stay dynamic. Personal claims
 * never come from an unconstrained generated biography.
 */
export function renderPortfolioPersona(raw: unknown, documents: PortfolioDocument[], references: unknown,
  question: string, final = true) {
  const checked = renderPortfolioDelivery(raw, documents, references);
  if (!checked.sources.length) return { ...checked, evidenceMode: PORTFOLIO_PERSONA_MODE };
  const value = JSON.parse(raw as string);
  const personal = checked.sources.filter(source => !source.id.startsWith('tech-'));
  const overview = isCareerOverview(question), q = currentPortfolioQuestion(question);
  const priority = ['profile', 'skills', 'cti'];
  if (overview) for (const id of ['profile', 'skills']) {
    const document = documents.find(item => item.id === id);
    if (document && !personal.some(source => source.id === id)) personal.push({ id, title: document.title, href: document.href, quote: document.text });
  }
  if (overview) personal.sort((a, b) => {
    const rank = (id: string) => priority.includes(id) ? priority.indexOf(id) : priority.length;
    return rank(a.id) - rank(b.id);
  });
  const facts = personal.map(source => {
    const voice = (voices as Record<string, { sourceSha256: string; text: string }>)[source.id];
    if (voice && createHash('sha256').update(source.quote).digest('hex') === voice.sourceSha256) return voice.text;
    // Changed/unreviewed evidence must not inherit an older first-person claim.
    return `公开资料中的原文是：${source.quote}`;
  }).join('\n\n');
  const lead = overview ? '可以，我先从经历和现在关注的方向说起。\n\n' : '';
  const explain = /如何|怎么|为什么|原理|技术细节|架构|实现|设计|接入|排查|难点|方案/.test(q) && !overview;
  const notes = explain ? value.technicalNotes.map((note: { title: string; body: string }) => `${note.title}\n${note.body}`).join('\n\n') : '';
  const limits = final && /(?:提升|降低|减少|节省|性能).*(?:多少|百分|%|数字|数据)|(?:多少|具体).*(?:提升|降低|性能)/.test(q)
    ? '\n\n关于具体的性能提升或收益数字，当前提供的公开资料没有给出可核验的数据，我暂时不能补充。' : '';
  const followup = final && overview ? '\n\n你更想了解具体项目中的工作，还是我现在关注的 AI 应用方向？' : '';
  return { answer: lead + facts + (notes ? `\n\n从技术角度展开一下（通用说明）：\n${notes}` : '') + limits + followup,
    sources: [...personal, ...checked.sources.filter(source => source.id.startsWith('tech-') && !!notes)], evidenceMode: PORTFOLIO_PERSONA_MODE };
}
