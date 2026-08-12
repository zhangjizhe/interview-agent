/**
 * Real content workflow acceptance against Docker Compose API.
 * Requires valid Qwen credentials in .env and a running local stack.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..', '..');
const api = process.env.API_URL || 'http://localhost:3001';
const timestamp = Date.now();
const userId = `content-e2e-${timestamp}`;
const password = 'acceptance-password-123';
const reportDir = join(__dirname, 'screenshots', 'acceptance-2026-08-12');
mkdirSync(reportDir, { recursive: true });

const checks = [];
function check(name, passed, detail = '') {
  checks.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
  if (!passed) throw new Error(`${name} failed: ${detail}`);
}

async function request(path, options = {}) {
  const response = await fetch(`${api}${path}`, options);
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 200) }; }
  if (!response.ok) throw new Error(`${path} HTTP ${response.status}: ${body.message || text.slice(0, 200)}`);
  return body;
}

async function auth(id) {
  const login = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: id, password }),
  });
  return `Bearer ${login.accessToken}`;
}

await request('/api/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId, password }),
});
const userAuth = await auth(userId);
const adminAuth = await auth('admin-acceptance');

const resumeForm = new FormData();
resumeForm.append(
  'file',
  new Blob([readFileSync(join(root, 'apps/api/tests/fixtures/acceptance-resume.md'))], { type: 'text/markdown' }),
  'acceptance-resume.md',
);
resumeForm.append('position', 'AI Agent 工程师');
const resume = await request('/api/interview/upload-resume', {
  method: 'POST',
  headers: { Authorization: userAuth },
  body: resumeForm,
});
check('resume name is normalized', resume.parsed.name === 'Li Ming', resume.parsed.name);
check('resume is ingested into RAG', resume.ragIngested === true);
check('resume generates personalized questions', resume.personalizedQuestions.length > 0, String(resume.personalizedQuestions.length));

const resumes = await request(`/api/interview/resumes/${userId}`, {
  headers: { Authorization: userAuth },
});
check('owner can recall uploaded resume', resumes.count > 0, String(resumes.count));

const start = await request('/api/interview/start', {
  method: 'POST',
  headers: { Authorization: userAuth, 'Content-Type': 'application/json' },
  body: JSON.stringify({ position: 'AI Agent 工程师', level: 'P5' }),
});
await request(`/api/interview/${start.interviewId}/confirm-resume`, {
  method: 'POST',
  headers: { Authorization: userAuth },
});
check('interview starts after resume ingestion', Boolean(start.interviewId));

const questionFileForm = new FormData();
questionFileForm.append(
  'file',
  new Blob([readFileSync(join(root, 'apps/api/tests/fixtures/acceptance-question-bank.md'))], { type: 'text/markdown' }),
  'acceptance-question-bank.md',
);
questionFileForm.append('position', '后端开发工程师');
questionFileForm.append('level', 'P5');
questionFileForm.append('category', '系统设计');
const fileImport = await request('/api/interview/question-bank/import-file', {
  method: 'POST',
  headers: { Authorization: adminAuth },
  body: questionFileForm,
});
check('question-bank file import extracts questions', fileImport.count >= 2, String(fileImport.count));

const fileSearch = await request('/api/interview/question-bank/search?q=event%20loop&position=%E5%90%8E%E7%AB%AF%E5%BC%80%E5%8F%91%E5%B7%A5%E7%A8%8B%E5%B8%88&limit=5', {
  headers: { Authorization: userAuth },
});
check('file import is immediately searchable', fileSearch.count > 0, String(fileSearch.count));

const urlImport = await request('/api/interview/question-bank/import-url', {
  method: 'POST',
  headers: { Authorization: adminAuth, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: 'https://www.typescriptlang.org/docs/handbook/2/everyday-types.html',
    position: '前端开发工程师',
    level: 'P5',
    category: 'TypeScript',
  }),
});
check('URL import generates questions from technical documentation', urlImport.count > 0, String(urlImport.count));

const urlSearch = await request('/api/interview/question-bank/search?q=TypeScript%20union%20types&position=%E5%89%8D%E7%AB%AF%E5%BC%80%E5%8F%91%E5%B7%A5%E7%A8%8B%E5%B8%88&limit=5', {
  headers: { Authorization: userAuth },
});
check('URL import is immediately searchable', urlSearch.count > 0, String(urlSearch.count));

const invalidUrl = await fetch(`${api}/api/interview/question-bank/import-url`, {
  method: 'POST',
  headers: { Authorization: adminAuth, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: 'http://127.0.0.1:3001/api/health',
    position: '前端开发工程师',
  }),
});
check('SSRF-protected URL is rejected', invalidUrl.status === 400, String(invalidUrl.status));

const report = {
  generatedAt: new Date().toISOString(),
  api,
  passed: checks.length,
  failed: 0,
  checks,
};
writeFileSync(join(reportDir, 'content-workflow-results.json'), `${JSON.stringify(report, null, 2)}\n`);
