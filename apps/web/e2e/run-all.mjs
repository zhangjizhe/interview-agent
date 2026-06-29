#!/usr/bin/env node
/**
 * e2e/run-all.mjs · 串跑 apps/web/e2e/*.spec.mjs
 *
 * 策略：
 * - homepage-defensive.spec.mjs（不依赖 LLM）：必须 pass
 * - streaming-flow.spec.mjs（依赖真实 LLM）：失败时记录 SKIP，不阻塞 CI
 * - reviewer-prompt-fix.spec.mjs（依赖真实 LLM）：失败时记录 SKIP，不阻塞 CI
 *
 * CI 上 QWEN_API_KEY 是 sk-test-placeholder（placeholder），
 * 真实 LLM 调用会 401 → spec fail → 但应该 skip 不是 fail。
 *
 * 用法：
 *   cd apps/web && node e2e/run-all.mjs
 *   cd apps/web && STRICT_LLM=1 node e2e/run-all.mjs  # 全过才算过（dev 模式）
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STRICT = !!process.env.STRICT_LLM;  // dev 模式：全过才 pass

const REQUIRED_PASS = ['homepage-defensive.spec.mjs'];     // 必须 pass
const SKIPPABLE = ['streaming-flow.spec.mjs', 'reviewer-prompt-fix.spec.mjs'];  // LLM 失败可 skip

const ALL_SPECS = [...REQUIRED_PASS, ...SKIPPABLE];

async function runSpec(name) {
  const isRequired = REQUIRED_PASS.includes(name);
  return new Promise((resolve) => {
    const start = Date.now();
    const proc = spawn('node', [join(__dirname, name)], {
      stdio: 'inherit',
      env: { ...process.env, CI: 'true' },
    });

    proc.on('close', (code) => {
      const elapsed = Math.round((Date.now() - start) / 1000);
      const status = code === 0 ? 'PASS' : 'FAIL';
      console.log(`\n━━━ [${status}] ${name} (${elapsed}s, exit=${code}) ━━━\n`);
      resolve({ name, status, code, elapsed, isRequired });
    });

    proc.on('error', (err) => {
      console.error(`FATAL ${name}: ${err.message}`);
      resolve({ name, status: 'FAIL', code: -1, elapsed: 0, isRequired });
    });
  });
}

async function main() {
  console.log('━━━ Interview Agent E2E (run-all.mjs) ━━━');
  console.log(`API: ${process.env.API_URL || 'http://localhost:3001'}`);
  console.log(`Web: ${process.env.WEB_URL || 'http://localhost:5173'}`);
  console.log(`CHROME_PATH: ${process.env.CHROME_PATH || '(bundled chromium)'}`);
  console.log(`STRICT_LLM: ${STRICT ? 'ON（dev 模式）' : 'OFF（CI 模式，LLM spec skip）'}\n`);

  // 检查 spec 文件存在
  const files = readdirSync(__dirname).filter(f => f.endsWith('.spec.mjs'));
  for (const name of ALL_SPECS) {
    if (!files.includes(name)) {
      console.error(`✗ Missing spec: ${name}`);
      process.exit(1);
    }
  }

  const results = [];
  for (const name of ALL_SPECS) {
    const r = await runSpec(name);
    results.push(r);
  }

  // 总结
  console.log('\n━━━ Summary ━━━');
  let pass = 0, skip = 0, fail = 0;
  for (const r of results) {
    if (r.status === 'PASS') {
      console.log(`  ✅ ${r.name} — PASS (${r.elapsed}s)`);
      pass++;
    } else if (r.isRequired) {
      console.log(`  ❌ ${r.name} — FAIL (${r.elapsed}s) [REQUIRED]`);
      fail++;
    } else if (STRICT) {
      console.log(`  ❌ ${r.name} — FAIL (${r.elapsed}s) [STRICT]`);
      fail++;
    } else {
      console.log(`  ⏭️  ${r.name} — SKIP (${r.elapsed}s) [LLM-dependent, CI mode]`);
      skip++;
    }
  }

  console.log(`\nResult: ${pass} pass / ${fail} fail / ${skip} skip`);
  console.log(`Screenshots: ${join(__dirname, 'screenshots')}`);

  if (fail > 0) process.exit(1);
  if (STRICT && skip > 0) process.exit(1);  // strict 模式下不允许 skip
  process.exit(0);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});