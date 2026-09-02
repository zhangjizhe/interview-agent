import { createRequire } from 'node:module';
const require = createRequire(new URL('../../web/package.json', import.meta.url));
const { chromium } = require('playwright');

const baseUrl = process.env.AGENT_LAB_URL || 'http://localhost:5175';
const chromePath = process.env.CHROME_PATH;
const password = 'acceptance-password-123';

const browser = await chromium.launch({ headless: true, executablePath: chromePath || undefined });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  console.log('checking login gate');
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  if (await page.getByRole('heading', { name: '进入控制台' }).count() !== 1) throw new Error('admin login gate missing');

  await page.getByLabel('用户名').fill('admin-acceptance');
  await page.getByLabel('密码').fill(password);
  await page.getByRole('button', { name: '登录控制台' }).click();
  console.log('checking admin control plane');
  await page.getByRole('heading', { name: '控制中心' }).waitFor({ state: 'visible' });
  if (await page.getByRole('button', { name: '重载配置' }).count() !== 1) throw new Error('MCP control action missing');
  if (await page.getByRole('button', { name: 'Trace' }).count() !== 1) throw new Error('Trace control view missing');
  if (await page.getByRole('button', { name: '评测' }).count() !== 1) throw new Error('Evaluation control view missing');
  console.log('checking recorded report import');
  const receipts = await page.evaluate(async () => {
    const accessToken = localStorage.getItem('ia_access_token');
    const dashboard = await fetch('/api/agent-lab/dashboard', {
      headers: { Authorization: `Bearer ${accessToken}` },
    }).then((response) => response.json());
    const stamp = Date.now().toString(16);
    const submit = async (arm, qualityScore) => {
      const receiptHash = `${'a'.repeat(64 - stamp.length - arm.length)}${stamp}${arm}`;
      const response = await fetch('/api/agent-lab/recorded-imports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          agentKey: `acceptance-evaluator-${stamp}`,
          agentVersion: `v-${arm}-${stamp}`,
          runtimeVersion: 'recorded-fixture-v1',
          datasetVersion: dashboard.dataset.version,
          inputHash: receiptHash,
          metrics: {
            qualityScore,
            structuredOutputValidRate: 1,
            latencyMs: 420,
            inputTokens: 0,
            outputTokens: 0,
            estimatedCostCny: 0,
          },
          traceSummary: { stages: ['dataset', 'recorded-evaluator', 'report'], toolCalls: 0, status: 'SUCCEEDED' },
          failures: [],
        }),
      });
      if (!response.ok) throw new Error(`recorded report submission failed: ${response.status}`);
      return response.json();
    };
    return { stamp, control: await submit('c', 0.81), treatment: await submit('d', 0.91) };
  });
  if (!receipts.control.id || !receipts.treatment.id) throw new Error('recorded report receipts missing');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '控制中心' }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: '评测' }).click();
  const controlVersion = `v-c-${receipts.stamp}`;
  const treatmentVersion = `v-d-${receipts.stamp}`;
  await page.locator('.lab-import-row').filter({ hasText: controlVersion }).getByRole('button', { name: '导入' }).click();
  await page.getByText('录制报告已导入控制面。').waitFor({ state: 'visible' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '评测' }).click();
  await page.locator('.lab-import-row').filter({ hasText: treatmentVersion }).getByRole('button', { name: '导入' }).click();
  await page.getByText('录制报告已导入控制面。').waitFor({ state: 'visible' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '实验' }).click();
  const selectRun = async (label, version) => {
    const selector = page.getByLabel(label);
    const value = await selector.locator('option').evaluateAll((options, wantedVersion) =>
      options.find((option) => option.textContent?.includes(wantedVersion))?.getAttribute('value'),
    version);
    if (!value) throw new Error(`run option missing for ${version}`);
    await selector.selectOption(value);
  };
  await selectRun('Control run', controlVersion);
  await selectRun('Treatment run', treatmentVersion);
  await page.getByRole('button', { name: '创建实验' }).click();
  await page.getByText('实验比较已记录。').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: '发布' }).click();
  const releaseSelect = page.getByLabel(`Release decision for ${treatmentVersion}`);
  await releaseSelect.selectOption('APPROVE');
  await releaseSelect.locator('xpath=following-sibling::button').click();
  await page.getByText('人工发布决策已记录。').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: '操作日志' }).click();
  await page.getByRole('heading', { name: '操作日志' }).waitFor({ state: 'visible' });
  await page.getByLabel('Operation action').selectOption('RELEASE_DECISION_RECORD');
  await page.getByLabel('Operation outcome').selectOption('SUCCEEDED');
  await page.locator('.lab-list .lab-row').first().waitFor({ state: 'visible' });
  await page.getByRole('button', { name: '审计' }).click();
  await page.getByRole('heading', { name: '审计查询' }).waitFor({ state: 'visible' });
  await page.getByLabel('Audit kind').selectOption('DECISION');
  await page.locator('.lab-list .lab-row').first().waitFor({ state: 'visible' });
  const retentionEnabled = await page.evaluate(async () => {
    const accessToken = localStorage.getItem('ia_access_token');
    return fetch('/api/agent-lab/retention/preview', {
      headers: { Authorization: `Bearer ${accessToken}` },
    }).then(async (response) => {
      if (!response.ok) throw new Error(`retention preview failed: ${response.status}`);
      return (await response.json()).enabled;
    });
  });
  if (retentionEnabled !== false) throw new Error('retention should be disabled without explicit configuration');

  const userContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const userPage = await userContext.newPage();
  console.log('checking ordinary-user rejection');
  await userPage.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  const ordinaryUserId = `agent-lab-user-${Date.now()}`;
  await userPage.getByRole('button', { name: '创建管理员账号' }).click();
  await userPage.getByLabel('用户名').fill(ordinaryUserId);
  await userPage.getByLabel('密码').fill(password);
  await userPage.getByRole('button', { name: '创建并验证权限' }).click();
  await userPage.getByText('当前账号不在 Agent Lab 管理员允许名单中').waitFor({ state: 'visible' });
  const userControlPlaneStatus = await userPage.evaluate(async ({ ordinaryUserId, password }) => {
    const login = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: ordinaryUserId, password }),
    }).then((response) => response.json());
    const headers = { Authorization: `Bearer ${login.accessToken}` };
    const [audit, operations] = await Promise.all([
      fetch('/api/agent-lab/audit?kind=RUN', { headers }),
      fetch('/api/agent-lab/operation-logs', { headers }),
    ]);
    return {
      audit: audit.status,
      operations: operations.status,
    };
  }, { ordinaryUserId, password });
  if (userControlPlaneStatus.audit !== 403 || userControlPlaneStatus.operations !== 403) {
    throw new Error(`ordinary user control-plane API was not rejected: ${JSON.stringify(userControlPlaneStatus)}`);
  }
  await userContext.close();
  console.log('PASS Agent Lab admin login, MCP control access, and USER rejection');
} finally {
  await browser.close();
}
