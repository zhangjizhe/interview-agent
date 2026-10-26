export function completeAudit(audit) {
  const counts = audit?.metadata?.vulnerabilities;
  const advisories = audit?.advisories;
  if (!counts || !advisories || typeof advisories !== 'object' || Array.isArray(advisories)) return false;
  const values = ['info', 'low', 'moderate', 'high', 'critical'].map(key => counts[key]);
  if (!values.every(value => Number.isSafeInteger(value) && value >= 0)) return false;
  return values.every(value => value === 0) || Object.keys(advisories).length > 0;
}

// Version-scoped local mitigations; these are not upstream patched releases.
export function reviewedAdvisory(item) {
  if (!item || !Array.isArray(item.findings)) return false;
  const versions = Array.from(item.findings, finding => finding?.version);
  if (!Array.isArray(versions) || !versions.length) return false;
  if (item.module_name === 'braces' && item.github_advisory_id === 'GHSA-vfj7-8cjw-p6xm' && item.vulnerable_versions === '<=3.0.3') {
    return versions.every(version => version === '3.0.3');
  }
  return item.module_name === 'zod' && item.github_advisory_id === 'GHSA-mrhx-c7xc-m3w5' && item.vulnerable_versions === '<4.6.6'
    && versions.every(version => version === '3.25.76');
}
