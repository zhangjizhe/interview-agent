/**
 * 面试题库 → JSON 序列化脚本
 *
 * 读 interview-qa-bank/01-09 *.md，按 `## Q{N}.` 切题，输出到 knowledge-base.json
 *
 * 跑法：ts-node scripts/serialize-qa-bank.ts
 *  或：npx tsx scripts/serialize-qa-bank.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const QA_BANK_DIR = process.env.QA_BANK_DIR || path.resolve(
  __dirname,
  '../../../sessions/mvs_931639eb440b4018a3f0b24490d24696/workspace/interview-qa-bank',
);

const TOPIC_FILES: Record<string, string> = {
  '01-Agent基础架构': 'Agent 基础架构（ReAct、记忆、Multi-Agent、规划）',
  '02-RAG检索增强': 'RAG 检索增强（切片、Embedding、向量库）',
  '03-工具调用-MCP': '工具调用 & MCP 协议（Function Call、Skill、A2A）',
  '04-LangGraph状态机': 'LangGraph 状态机（Checkpoint、interrupt）',
  '05-系统设计题': '系统设计（RAG 系统、客服系统、Code Agent、高并发）',
  '06-大模型工程': '大模型工程（Transformer、训练、量化、MoE、vLLM）',
  '07-八股与算法': '八股与算法（Redis、算法题）',
  '08-项目深挖-interview-agent': '项目深挖（interview-agent 追问）',
  '09-软素质与行为面试': '软素质与行为面试（自我介绍、挑战、规划）',
};

export interface QaItem {
  id: string;            // 全局唯一 id，如 "01-Q03"
  topic: string;         // 主题分类
  number: number;        // 题号
  title: string;         // 题目
  body: string;          // 答题内容（去头去尾的 markdown 块）
  tags: string[];        // 抽取的标签（考察点、关键词）
}

function parseMarkdown(content: string, topicKey: string): QaItem[] {
  const topicFull = TOPIC_FILES[topicKey] || topicKey;
  const lines = content.split('\n');
  const items: QaItem[] = [];
  let current: Partial<QaItem> | null = null;
  let currentBody: string[] = [];
  let currentNumber = 0;

  const flush = () => {
    if (current && currentNumber > 0 && current.title) {
      const body = currentBody.join('\n').trim();
      // 抽取 tags：扫考察点 / 关键词
      const tags: string[] = [];
      const tagMatches = body.match(/\*\*([^*]+)\*\*/g) || [];
      for (const m of tagMatches) {
        const t = m.replace(/\*\*/g, '').trim();
        if (t.length <= 30 && !tags.includes(t) && tags.length < 8) tags.push(t);
      }
      items.push({
        id: `${topicKey.slice(0, 2)}-Q${String(currentNumber).padStart(2, '0')}`,
        topic: topicFull,
        number: currentNumber,
        title: current.title,
        body,
        tags,
      });
    }
    current = null;
    currentBody = [];
    currentNumber = 0;
  };

  for (const line of lines) {
    // 匹配 "## Q1. 标题" 或 "### Q1. 标题"（07 八股与算法用三级标题）
    const m = line.match(/^#{2,3}\s+Q(\d+)\.\s+(.+?)$/);
    if (m) {
      // 推上一题
      flush();
      currentNumber = parseInt(m[1], 10);
      current = { title: m[2].trim() };
      continue;
    }
    if (current) {
      // 遇到一级标题时已 flush，二级/三级标题是 body
      if (line.startsWith('# ') && !line.startsWith('## ')) {
        // 不属于 body
        continue;
      }
      currentBody.push(line);
    }
  }
  flush();
  return items;
}

function main() {
  if (!fs.existsSync(QA_BANK_DIR)) {
    console.error(`❌ QA bank dir not found: ${QA_BANK_DIR}`);
    process.exit(1);
  }
  const allItems: QaItem[] = [];
  for (const [key] of Object.entries(TOPIC_FILES)) {
    const filename = `${key}.md`;
    const full = path.join(QA_BANK_DIR, filename);
    if (!fs.existsSync(full)) {
      console.warn(`⚠️  Skip missing file: ${filename}`);
      continue;
    }
    const content = fs.readFileSync(full, 'utf8');
    const items = parseMarkdown(content, key);
    console.log(`📚 ${filename}: ${items.length} 题`);
    allItems.push(...items);
  }

  const out = path.join(__dirname, '..', 'knowledge-base.json');
  fs.writeFileSync(
    out,
    JSON.stringify(
      {
        version: '1.0',
        generatedAt: new Date().toISOString(),
        source: 'interview-qa-bank/01-09',
        totalQuestions: allItems.length,
        topics: Object.values(TOPIC_FILES),
        items: allItems,
      },
      null,
      2,
    ),
  );
  console.log(`\n✅ Wrote ${allItems.length} questions to ${out}`);
  console.log(`   Topics: ${[...new Set(allItems.map((i) => i.topic))].join(', ')}`);
}

if (require.main === module) main();
