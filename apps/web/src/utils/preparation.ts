import type { TargetJob } from './training';

export interface ResumeRecord {
  name?: string;
  position?: string;
  summary?: string;
  skills?: string;
  createdAt?: string;
}

const optionalText = (value: unknown) => value == null || typeof value === 'string';
export function isTargetJob(value: unknown): value is TargetJob {
  if (!value || typeof value !== 'object') return false;
  const job = value as Record<string, unknown>;
  return typeof job.id === 'string' && Boolean(job.id)
    && typeof job.title === 'string' && Boolean(job.title.trim())
    && typeof job.isActive === 'boolean'
    && ['level', 'company', 'jobDescription'].every(key => optionalText(job[key]));
}

export function isResumeRecord(value: unknown): value is ResumeRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && ['name', 'position', 'summary', 'skills', 'createdAt']
      .every(key => optionalText((value as Record<string, unknown>)[key]));
}
