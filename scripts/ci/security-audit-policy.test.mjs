import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completeAudit, reviewedAdvisory } from './security-audit-policy.mjs';
const zod = { module_name: 'zod', github_advisory_id: 'GHSA-mrhx-c7xc-m3w5', vulnerable_versions: '<4.6.6', findings: [{ version: '3.25.76' }] };
test('accepts only the exact reviewed advisory and installed version', () => {
  assert.equal(reviewedAdvisory(zod), true);
  assert.equal(reviewedAdvisory({ ...zod, findings: [{ version: '3.25.76' }, { version: '4.4.3' }] }), false);
  for (const replacement of [{ findings: [] }, { findings: undefined }, { findings: [{ version: '3.25.75' }] }, { module_name: 'other' }, { github_advisory_id: 'new-advisory' }, { vulnerable_versions: '<4.7.0' }]) {
    assert.equal(reviewedAdvisory({ ...zod, ...replacement }), false);
  }
});
test('retains narrow braces rule and refuses other findings', () => {
  const braces = { module_name: 'braces', github_advisory_id: 'GHSA-vfj7-8cjw-p6xm', vulnerable_versions: '<=3.0.3', findings: [{ version: '3.0.3' }] };
  assert.equal(reviewedAdvisory(braces), true);
  assert.equal(reviewedAdvisory({ ...braces, findings: [{ version: '3.0.2' }] }), false);
  assert.equal(reviewedAdvisory({}), false);
});

test('rejects incomplete audit responses and unsafe counts', () => {
  const metadata = { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 1, critical: 0 } };
  assert.equal(completeAudit({ metadata, advisories: { zod } }), true);
  assert.equal(completeAudit({ metadata, advisories: {} }), false);
  assert.equal(completeAudit({ metadata, advisories: [] }), false);
  assert.equal(completeAudit({ advisories: { zod } }), false);
  for (const high of [-1, 1.5, '1', undefined, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(completeAudit({ metadata: { vulnerabilities: { ...metadata.vulnerabilities, high } }, advisories: { zod } }), false);
  }
  assert.equal(completeAudit({ metadata: { vulnerabilities: { ...metadata.vulnerabilities, high: 0 } }, advisories: {} }), true);
  assert.equal(reviewedAdvisory({ ...zod, findings: Array(1) }), false);
  assert.equal(reviewedAdvisory({ ...zod, findings: [null] }), false);
});
