/** Best-effort telemetry scrubbing; not a substitute for consent or PII governance. */
export function redactTelemetry(value: unknown, ancestors = new WeakSet<object>()): any {
  if (typeof value === 'string') {
    return value
      .replace(/\bBearer\s+[^\s"',;]+/gi, 'Bearer [REDACTED]')
      .replace(/\bsk-[a-zA-Z0-9_-]+/g, '[REDACTED]')
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
      .replace(/\b1[3-9]\d{9}\b/g, '[REDACTED_PHONE]');
  }
  if (value === null || typeof value !== 'object') return value;
  if (ancestors.has(value)) return '[CIRCULAR]';
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return value.map(item => redactTelemetry(item, ancestors));
    return Object.fromEntries(Object.entries(value).map(([key, item]) => {
      const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
      const sensitive = /apikey|secret|password|authorization|cookie|accesstoken|refreshtoken/.test(normalized)
        || ['token', 'email', 'phone', 'mobile', 'resume', 'rawtext', 'candidateprofile'].includes(normalized);
      return [key, sensitive ? '[REDACTED]' : redactTelemetry(item, ancestors)];
    }));
  } finally {
    ancestors.delete(value);
  }
}
