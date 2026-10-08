// Offline runner/report contract. Passing never proves real model quality.
jest.mock('../modules/llm/llm.gateway.service', () => ({ LlmGatewayService: class {} }));
import { join } from 'node:path';
import { loadGoldenDataset, GoldenDatasetSchema } from '../evals/golden-dataset.schema';
import { EvalRunner } from '../evals/eval-runner';
import { EvalReporter } from '../evals/eval-reporter';

const datasetPath = join(__dirname, '../evals/golden-dataset.json');
describe('Golden Dataset offline contract', () => {
  it('validates all 30 cases and rejects scores outside the declared rubric', () => {
    const data = loadGoldenDataset(datasetPath);
    expect(data.cases).toHaveLength(30);
    const invalid = JSON.parse(JSON.stringify(data)); invalid.cases[0].responses[0].expectedScore = 101;
    expect(() => GoldenDatasetSchema.parse(invalid)).toThrow();
  });
  it('runs the actual scorer pipeline with a synthetic provider and preserves provider failures', async () => {
    const dataset = loadGoldenDataset(datasetPath);
    const llm = { chat: jest.fn().mockResolvedValue({ content: JSON.stringify({ correctness: 0.5, depth: 0.5, completeness: 0.5, score: 50, feedbackKeywords: ['fixture'], feedback: 'Synthetic feedback' }) }) };
    llm.chat.mockRejectedValueOnce(new Error('synthetic failure'));
    const reporter = new EvalReporter('unused-fixture-output');
    jest.spyOn(reporter, 'writeJson').mockResolvedValue('not-written'); jest.spyOn(reporter, 'writeMarkdown').mockResolvedValue('not-written');
    const report = await new EvalRunner(llm as any, { datasetPath, outputDir: 'unused-fixture-output', caseFilter: dataset.cases[0].id, concurrency: 1, model: 'qwen' }, reporter).run();
    expect(llm.chat).toHaveBeenCalledTimes(dataset.cases[0].responses.length);
    expect(report.caseResults).toHaveLength(1);
    expect(report.caseResults[0].responses[0].error).toBe('synthetic failure');
    expect(report.overall.sampleSize).toBe(dataset.cases[0].responses.length - 1);
  });
});
