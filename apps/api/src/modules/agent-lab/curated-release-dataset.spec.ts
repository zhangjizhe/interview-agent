import { buildStratifiedEvaluationEvidence } from '../inference/evaluation-statistics';
import {
  CURATED_INTERVIEW_RELEASE_DATASET,
  CURATED_INTERVIEW_RELEASE_EVALUATOR,
} from './curated-release-dataset';

describe('Curated Interview release dataset', () => {
  it('is versioned, de-identified, stratified, and bounded', () => {
    const manifest = CURATED_INTERVIEW_RELEASE_DATASET;
    const evidence = buildStratifiedEvaluationEvidence(manifest.cases.map((item) => ({
      caseKey: item.key,
      score: 100,
      passed: true,
      metadata: item.metadata,
    })));

    expect(manifest.version).toBe('1.0.0');
    expect(manifest.cases).toHaveLength(12);
    expect(manifest.metadata.provenance).toMatchObject({
      sourceType: 'synthetic-product-scenario',
      containsCandidateData: false,
      containsPersonalData: false,
    });
    expect(new Set(manifest.cases.map((item) => item.key)).size).toBe(12);
    expect(evidence).toMatchObject({
      status: 'available',
      caseCount: 12,
      strata: {
        jobFamily: [expect.objectContaining({ value: 'ai-agent-engineer', caseCount: 12 })],
        skill: expect.arrayContaining([
          expect.objectContaining({ value: 'rag', caseCount: 4 }),
          expect.objectContaining({ value: 'agent-evaluation', caseCount: 4 }),
          expect.objectContaining({ value: 'system-design', caseCount: 4 }),
        ]),
        difficulty: expect.arrayContaining([
          expect.objectContaining({ value: 'foundation', caseCount: 4 }),
          expect.objectContaining({ value: 'intermediate', caseCount: 4 }),
          expect.objectContaining({ value: 'advanced', caseCount: 4 }),
        ]),
      },
    });
    expect(CURATED_INTERVIEW_RELEASE_EVALUATOR).toMatchObject({
      type: 'KEYWORD',
      config: { minScore: 100 },
    });
  });
});
