import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { EvalReport } from './eval-reporter';
import { toAgentLabRecordedRun } from './agent-lab-recording';

async function main() {
  const [reportPath, agentKey, agentVersion, runtimeVersion] = process.argv.slice(2);
  if (!reportPath || !agentKey || !agentVersion || !runtimeVersion) {
    throw new Error('Usage: tsx src/evals/import-agent-lab-recording.ts <report.json> <agentKey> <agentVersion> <runtimeVersion>');
  }
  const report = JSON.parse(readFileSync(resolve(reportPath), 'utf8')) as EvalReport;
  const payload = toAgentLabRecordedRun(report, { agentKey, agentVersion, runtimeVersion });
  const baseUrl = process.env.AGENT_LAB_API_URL;
  const token = process.env.AGENT_LAB_RECORDING_TOKEN;
  if (!baseUrl || !token) {
    throw new Error('AGENT_LAB_API_URL and AGENT_LAB_RECORDING_TOKEN are required; the importer never creates credentials.');
  }
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/agent-lab/recorded-imports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Agent Lab import failed: HTTP ${response.status}`);
  const result = await response.json() as { id: string };
  console.log(`Agent Lab recorded report submitted: ${result.id}. An administrator must explicitly import it from Agent Lab.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
