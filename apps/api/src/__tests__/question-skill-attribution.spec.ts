jest.mock('../modules/llm/llm.gateway.service', () => ({ LlmGatewayService: class {} }));
jest.mock('../modules/interview/services/question-bank.service', () => ({ QuestionBankService: class {} }));
import { DynamicTaskQueueService } from '../modules/interview/services/dynamic-task-queue.service';
import { categoryForPosition } from '../modules/inference/interview-ontology';

const matches = (row: any, where: any = {}): boolean => Boolean(row) && Object.entries(where).every(([key, value]) => {
  if (value === undefined) return true;
  if (value && typeof value === 'object') return matches(row[key], value);
  return row[key] === value;
});

describe('question-to-owned-job skill attribution', () => {
  let service: any, prisma: any, job: any, interview: any, task: any;
  beforeEach(() => {
    const requirement = (id: string, slug: string) => ({ targetJobId: 'owned-job', organizationId: 'synthetic-org', skillId: id, skill: { id, slug, name: slug, isActive: true, taxonomyVersion: 'job-keywords-v1' } });
    job = { id: 'owned-job', organizationId: 'synthetic-org', userId: 'synthetic-owner', isActive: true, profileVersion: 1, skillRequirements: [requirement('react-skill', 'react'), requirement('ts-skill', 'typescript')] };
    interview = { id: 'owned-interview', organizationId: 'synthetic-org', userId: 'synthetic-owner', targetJobId: job.id, targetJobProfileVersion: 1, mode: 'FULL_SIMULATION', practiceSkillId: null, targetJob: job };
    task = { id: 'synthetic-task', interviewId: interview.id, type: 'QUESTION', question: 'Explain React useEffect cleanup.', category: 'frontend', difficulty: 'medium', context: JSON.stringify({ mode: 'FULL_SIMULATION', targetJobId: job.id, targetJobProfileVersion: 1 }) };
    const findInterview = jest.fn(async ({ where }: any) => matches(interview, where) ? interview : null);
    const findJob = jest.fn(async ({ where }: any) => matches(job, where) ? job : null);
    prisma = {
      interview: { findFirst: findInterview, findUnique: findInterview },
      targetJob: { findFirst: findJob, findUnique: findJob },
      jobSkillRequirement: { findMany: jest.fn(async () => job.skillRequirements) },
      interviewQuestion: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn(async ({ data }: any) => ({ id: 'normalized-question', ...data })) },
    };
    service = new DynamicTaskQueueService(prisma, {} as any);
  });
  const ensure = () => service.ensureQuestionRecord(task);
  const mapping = (row: any, reason: string) => {
    expect(row.selectionMetadata.skillMapping).toEqual(expect.objectContaining({ version: 'question-job-lexical/v1', reason, candidateSkillIds: expect.any(Array), matchedTerms: expect.any(Array) }));
    return row.selectionMetadata.skillMapping;
  };
  it.each([['React', 'Explain React useEffect cleanup.', 'react-skill'], ['TypeScript', 'Explain TypeScript conditional types.', 'ts-skill']])('maps a unique %s question to the actual current job requirement', async (_name, question, skillId) => {
    task.question = question; const row = await ensure(); expect(row.skillId).toBe(skillId);
    expect(mapping(row, 'unique-match').candidateSkillIds).toEqual([skillId]);
  });
  it('does not borrow the first JD skill when the question has no lexical evidence', async () => {
    task.question = 'Explain distributed Agent recovery.'; const row = await ensure();
    expect(row.skillId).toBeNull(); expect(mapping(row, 'no-match').candidateSkillIds).toEqual([]);
  });
  it('does not arbitrarily select one skill for a multi-skill question', async () => {
    task.question = 'Compare React props with TypeScript types.'; const row = await ensure();
    expect(row.skillId).toBeNull(); expect(mapping(row, 'ambiguous').candidateSkillIds.sort()).toEqual(['react-skill', 'ts-skill']);
  });
  it.each(['stale version', 'foreign job owner', 'inactive job'])('keeps attribution null for %s', async mode => {
    if (mode === 'stale version') job.profileVersion = 2;
    if (mode === 'foreign job owner') job.userId = 'other-user';
    if (mode === 'inactive job') job.isActive = false;
    const row = await ensure(); expect(row.skillId).toBeNull(); mapping(row, 'job-unavailable');
  });
  it('does not map an inactive skill requirement', async () => {
    job.skillRequirements[0].skill.isActive = false;
    const row = await ensure(); expect(row.skillId).toBeNull(); mapping(row, 'no-match');
  });
  it('does not turn a substring inside another word into React evidence', async () => {
    task.question = 'Explain reaction timing.'; const row = await ensure();
    expect(row.skillId).toBeNull(); mapping(row, 'no-match');
  });
  it('ignores forged context mode/practice skill for an actual full simulation', async () => {
    task.context = JSON.stringify({ mode: 'SKILL_PRACTICE', practiceSkillId: 'ts-skill', targetJobId: job.id, targetJobProfileVersion: 1 });
    const row = await ensure(); expect(row.skillId).toBe('react-skill'); mapping(row, 'unique-match');
    expect(row.selectionMetadata.mode).toBe('FULL_SIMULATION');
    expect(row.selectionMetadata.targetJobId).toBe(job.id); expect(row.selectionMetadata.targetJobProfileVersion).toBe(1);
  });
  it.each(['target', 'version'])('rejects mismatching context %s instead of accepting a spoofed mapping', async mode => {
    task.context = JSON.stringify({ mode: 'FULL_SIMULATION', targetJobId: mode === 'target' ? 'foreign-job' : job.id, targetJobProfileVersion: mode === 'version' ? 99 : 1 });
    const row = await ensure(); expect(row.skillId).toBeNull(); mapping(row, 'job-unavailable');
  });
  it('does not borrow a same-slug requirement from another organization', async () => {
    job.skillRequirements[0].organizationId = 'other-org';
    const row = await ensure(); expect(row.skillId).toBeNull(); mapping(row, 'no-match');
  });
  it('does not assign a known slug from an unknown taxonomy revision', async () => {
    job.skillRequirements[0].skill.taxonomyVersion = 'unreviewed-taxonomy';
    const row = await ensure(); expect(row.skillId).toBeNull(); mapping(row, 'no-match');
  });
  it('does not treat duplicate rows for one required skill as an ambiguous second skill', async () => {
    job.skillRequirements.push({ ...job.skillRequirements[0] });
    const row = await ensure(); expect(row.skillId).toBe('react-skill');
    expect(mapping(row, 'unique-match').candidateSkillIds).toEqual(['react-skill']);
  });
  it('rejects a foreign job even if a repository adapter ignores its owner filter', async () => {
    prisma.targetJob.findFirst.mockResolvedValue({ ...job, userId: 'other-owner' });
    const row = await ensure(); expect(row.skillId).toBeNull(); mapping(row, 'job-unavailable');
  });
  it('recomputes follow-up attribution from its own question instead of copying the parent skill', async () => {
    task.type = 'FOLLOW_UP';
    task.context = JSON.stringify({ mode: 'FULL_SIMULATION', targetJobId: job.id, targetJobProfileVersion: 1, followUpFrom: 'parent-task' });
    prisma.interviewQuestion.findUnique.mockImplementation(async ({ where }: any) => where.sourceTaskId === 'parent-task' ? { id: 'parent-question', interviewId: interview.id, skillId: 'ts-skill' } : null);
    const row = await ensure(); expect(row.parentQuestionId).toBe('parent-question');
    expect(row.skillId).toBe('react-skill'); mapping(row, 'unique-match');
  });
  it('does not attach a parent question belonging to another interview', async () => {
    task.type = 'FOLLOW_UP';
    task.context = JSON.stringify({ mode: 'FULL_SIMULATION', targetJobId: job.id, targetJobProfileVersion: 1, followUpFrom: 'foreign-task' });
    prisma.interviewQuestion.findUnique.mockImplementation(async ({ where }: any) => where.sourceTaskId === 'foreign-task' ? { id: 'foreign-question', interviewId: 'other-interview', skillId: 'ts-skill' } : null);
    const row = await ensure(); expect(row.parentQuestionId ?? null).toBeNull();
    expect(row.skillId).toBe('react-skill');
  });
  it('preserves the authoritative controlled practice skill rather than replacing it lexically', async () => {
    interview.mode = 'SKILL_PRACTICE'; interview.practiceSkillId = 'ts-skill';
    task.context = JSON.stringify({ mode: 'SKILL_PRACTICE', practiceSkillId: 'ts-skill', targetJobId: job.id, targetJobProfileVersion: 1 });
    const row = await ensure(); expect(row.skillId).toBe('ts-skill');
    expect(row.selectionMetadata.practiceSkillName).toBe('typescript');
  });
  it('does not accept a forged practice skill from task context', async () => {
    interview.mode = 'SKILL_PRACTICE'; interview.practiceSkillId = 'ts-skill';
    task.context = JSON.stringify({ mode: 'SKILL_PRACTICE', practiceSkillId: 'react-skill', practiceSkillName: 'spoofed-react', targetJobId: job.id, targetJobProfileVersion: 1 });
    const row = await ensure(); expect(row.skillId).toBe('ts-skill');
    expect(row.selectionMetadata.practiceSkillName).toBe('typescript');
  });
  it('does not mutate an already normalized question during repeat delivery', async () => {
    const original = { id: 'existing', skillId: null }; prisma.interviewQuestion.findUnique.mockResolvedValue(original);
    expect(await ensure()).toBe(original); expect(prisma.interviewQuestion.create).not.toHaveBeenCalled();
  });
});

describe('explicit English role category compatibility', () => {
  it.each([['Frontend Engineer', 'frontend'], ['FRONT-END Engineer', 'frontend'], ['Front End Developer', 'frontend'], ['Backend Engineer', 'backend'], ['Back-End Developer', 'backend'], ['Server-side Engineer', 'backend'], ['前端工程师', 'frontend'], ['后端工程师', 'backend'], ['Agent Engineer', 'agent']])('%s selects %s', (title, expected) => {
    expect(categoryForPosition(title)).toBe(expected);
  });
});
