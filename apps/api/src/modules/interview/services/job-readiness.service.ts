import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { ResumeRAGService } from './resume-rag.service';

const MAX_JOB_DESCRIPTION_CHARS = 12_000;
const SKILL_TAXONOMY_VERSION = 'job-keywords-v1';
const READINESS_FORMULA_VERSION = 'readiness-v1';

const SKILL_TERMS: Array<{ slug: string; name: string; terms: string[] }> = [
  { slug: 'react', name: 'React', terms: ['react', 'react.js', 'reactjs'] },
  { slug: 'typescript', name: 'TypeScript', terms: ['typescript', 'ts 类型'] },
  { slug: 'javascript', name: 'JavaScript', terms: ['javascript', 'es6', 'esnext'] },
  { slug: 'node-js', name: 'Node.js', terms: ['node.js', 'nodejs', 'node'] },
  { slug: 'system-design', name: '系统设计', terms: ['系统设计', '架构设计', '高可用', '分布式'] },
  { slug: 'rag', name: 'RAG', terms: ['rag', '检索增强', '向量检索', '向量数据库'] },
  { slug: 'agent-architecture', name: 'Agent 架构', terms: ['agent', '智能体', 'langgraph', 'multi-agent'] },
  { slug: 'evaluation', name: '评估', terms: ['evaluation', '评估', 'llm-as-a-judge', 'evaluator'] },
  { slug: 'tool-calling', name: '工具调用', terms: ['tool calling', '工具调用', 'mcp'] },
  { slug: 'testing', name: '测试工程', terms: ['测试', 'jest', 'vitest', 'playwright', 'e2e'] },
  { slug: 'database', name: '数据库', terms: ['postgresql', 'mysql', '数据库', 'sql'] },
  { slug: 'redis', name: 'Redis', terms: ['redis', '缓存'] },
];

export interface UpsertTargetJobInput {
  title: string;
  level?: string;
  company?: string;
  jobDescription?: string;
}

@Injectable()
export class JobReadinessService {
  constructor(
    private prisma: PrismaService,
    private resumeRag: ResumeRAGService,
  ) {}

  async createTargetJob(userId: string, input: UpsertTargetJobInput) {
    const normalized = this.normalizeInput(input);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.targetJob.updateMany({
          where: { userId, isActive: true },
          data: { isActive: false },
        });
        const targetJob = await tx.targetJob.create({
          data: {
            userId,
            ...normalized,
            isActive: true,
            source: normalized.jobDescription ? 'jd-keyword-v1' : 'role-baseline-v1',
            jobDescriptionHash: normalized.jobDescription
              ? this.hash(normalized.jobDescription)
              : null,
          },
        });
        await this.syncRequirements(tx, targetJob.id, targetJob.title, targetJob.level, targetJob.jobDescription);
        return tx.targetJob.findUniqueOrThrow({
          where: { id: targetJob.id },
          include: {
            skillRequirements: {
              include: { skill: { select: { slug: true, name: true, taxonomyVersion: true } } },
              orderBy: { importance: 'desc' },
            },
          },
        });
      });
    } catch (error) {
      this.rethrowActiveJobConflict(error);
    }
  }

  async updateTargetJob(userId: string, targetJobId: string, input: Partial<UpsertTargetJobInput>) {
    const existing = await this.requireOwnedTargetJob(userId, targetJobId);
    const normalized = this.normalizeInput({
      title: input.title ?? existing.title,
      level: input.level ?? existing.level ?? undefined,
      company: input.company ?? existing.company ?? undefined,
      jobDescription: input.jobDescription ?? existing.jobDescription ?? undefined,
    });
    return this.prisma.$transaction(async (tx) => {
      const targetJob = await tx.targetJob.update({
        where: { id: targetJobId },
        data: {
          ...normalized,
          profileVersion: { increment: 1 },
          source: normalized.jobDescription ? 'jd-keyword-v1' : 'role-baseline-v1',
          jobDescriptionHash: normalized.jobDescription
            ? this.hash(normalized.jobDescription)
            : null,
        },
      });
      await tx.jobSkillRequirement.deleteMany({ where: { targetJobId } });
      await this.syncRequirements(tx, targetJob.id, targetJob.title, targetJob.level, targetJob.jobDescription);
      return tx.targetJob.findUniqueOrThrow({
        where: { id: targetJobId },
        include: {
          skillRequirements: {
            include: { skill: { select: { slug: true, name: true, taxonomyVersion: true } } },
            orderBy: { importance: 'desc' },
          },
        },
      });
    });
  }

  async activateTargetJob(userId: string, targetJobId: string) {
    await this.requireOwnedTargetJob(userId, targetJobId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.targetJob.updateMany({
          where: { userId, isActive: true },
          data: { isActive: false },
        });
        return tx.targetJob.update({
          where: { id: targetJobId },
          data: { isActive: true },
        });
      });
    } catch (error) {
      this.rethrowActiveJobConflict(error);
    }
  }

  async getReadiness(userId: string, targetJobId: string) {
    const targetJob = await this.requireOwnedTargetJob(userId, targetJobId, {
      skillRequirements: {
        include: { skill: { select: { id: true, slug: true, name: true, taxonomyVersion: true } } },
        orderBy: { importance: 'desc' },
      },
    });
    const [resumes, states, finalRun] = await Promise.all([
      this.resumeRag.searchByUser(userId, 1).catch(() => []),
      this.prisma.candidateSkillState.findMany({
        where: {
          userId,
          targetJobId,
          sourceRun: {
            mode: 'FINAL',
            status: 'SUCCEEDED',
            interview: { userId, targetJobId },
          },
        },
        include: { skill: { select: { id: true, slug: true, name: true } } },
      }),
      this.prisma.evaluationRun.findFirst({
        where: {
          interview: { userId, targetJobId },
          mode: 'FINAL',
          status: 'SUCCEEDED',
        },
        orderBy: { completedAt: 'desc' },
        select: {
          id: true,
          completedAt: true,
          reportPayload: true,
          _count: { select: { assessmentEvidence: true } },
        },
      }),
    ]);

    const requiredSkills = (targetJob as any).skillRequirements as Array<{
      skillId: string;
      importance: number;
      expectedLevel: string | null;
      source: string;
      skill: { id: string; slug: string; name: string; taxonomyVersion: string };
    }>;
    const stateBySkill = new Map<string, {
      score: number;
      confidence: number;
      evidenceCount: number;
    }>(states.map((state: any) => [
      state.skillId,
      {
        score: state.score,
        confidence: state.confidence,
        evidenceCount: state.evidenceCount,
      },
    ]));
    const matchedStates: Array<{
      requirement: { importance: number };
      state: { score: number; confidence: number; evidenceCount: number };
    }> = [];
    for (const requirement of requiredSkills) {
      const state = stateBySkill.get(requirement.skillId);
      if (state) {
        matchedStates.push({
          requirement: { importance: requirement.importance },
          state,
        });
      }
    }
    const missingReasons: string[] = [];
    if (resumes.length === 0) missingReasons.push('尚未找到可用简历证据');
    if (!finalRun) missingReasons.push('尚未完成可用于准备度的正式面试评价');
    if (requiredSkills.length === 0) missingReasons.push('目标岗位尚未解析出技能要求');
    if (matchedStates.length === 0) missingReasons.push('目标岗位尚无正式技能状态');

    const components = {
      resumeEvidence: {
        status: resumes.length > 0 ? 'AVAILABLE' : 'MISSING',
        score: resumes.length > 0 ? 100 : null,
        evidenceCount: resumes.length,
        weight: 0.2,
      },
      interviewPerformance: {
        status: finalRun ? 'AVAILABLE' : 'MISSING',
        score: this.readOverallScore(finalRun?.reportPayload),
        evidenceCount: finalRun?._count.assessmentEvidence ?? 0,
        evaluatedAt: finalRun?.completedAt ?? null,
        weight: 0.5,
      },
      skillCoverage: {
        status: requiredSkills.length > 0 && matchedStates.length > 0 ? 'AVAILABLE' : 'MISSING',
        score: this.weightedSkillScore(matchedStates),
        evidenceCount: matchedStates.reduce((sum, item) => sum + item.state.evidenceCount, 0),
        requiredSkillCount: requiredSkills.length,
        assessedSkillCount: matchedStates.length,
        weight: 0.3,
      },
    };
    const available = missingReasons.length === 0
      && components.interviewPerformance.score !== null
      && components.skillCoverage.score !== null;
    const overallScore = available
      ? Math.round(
          components.resumeEvidence.score! * components.resumeEvidence.weight
          + components.interviewPerformance.score! * components.interviewPerformance.weight
          + components.skillCoverage.score! * components.skillCoverage.weight,
        )
      : null;
    const confidence = available
      ? Math.min(
          1,
          (matchedStates.reduce((sum, item) => sum + item.state.confidence, 0) / matchedStates.length)
          * Math.min(1, components.interviewPerformance.evidenceCount / 3),
        )
      : 0;

    return {
      targetJob: {
        id: targetJob.id,
        title: targetJob.title,
        level: targetJob.level,
        company: targetJob.company,
        profileVersion: targetJob.profileVersion,
        hasJobDescription: Boolean(targetJob.jobDescription),
        skillRequirements: requiredSkills.map((requirement) => ({
          skill: requirement.skill,
          importance: requirement.importance,
          expectedLevel: requirement.expectedLevel,
          source: requirement.source,
        })),
      },
      formulaVersion: READINESS_FORMULA_VERSION,
      available,
      overallScore,
      confidence,
      components,
      missingReasons,
      disclaimer: '准备度是基于当前简历、正式面试评价和技能证据的系统估计，不代表 Offer 结果。',
    };
  }

  private async syncRequirements(
    tx: any,
    targetJobId: string,
    title: string,
    level: string | null,
    jobDescription: string | null,
  ) {
    const matches = this.findSkillTerms(`${title}\n${jobDescription || ''}`);
    for (const match of matches) {
      const skill = await tx.skillDefinition.upsert({
        where: {
          slug_taxonomyVersion: {
            slug: match.slug,
            taxonomyVersion: SKILL_TAXONOMY_VERSION,
          },
        },
        create: {
          slug: match.slug,
          name: match.name,
          taxonomyVersion: SKILL_TAXONOMY_VERSION,
          applicableRoles: [title],
        },
        update: {
          isActive: true,
          applicableRoles: { set: [title] },
        },
      });
      await tx.jobSkillRequirement.create({
        data: {
          targetJobId,
          skillId: skill.id,
          importance: jobDescription && match.matchedTerms.length > 1 ? 5 : 3,
          expectedLevel: level,
          source: jobDescription ? 'jd-keyword-v1' : 'role-baseline-v1',
          matchedTerms: match.matchedTerms,
        },
      });
    }
  }

  private findSkillTerms(text: string) {
    const normalized = text.toLowerCase();
    const matches = SKILL_TERMS.map((skill) => ({
      ...skill,
      matchedTerms: skill.terms.filter((term) => normalized.includes(term.toLowerCase())),
    })).filter((skill) => skill.matchedTerms.length > 0);
    return matches.length > 0 ? matches : [{
      slug: 'role-foundation',
      name: '岗位基础能力',
      terms: [],
      matchedTerms: [text.slice(0, 80)],
    }];
  }

  private weightedSkillScore(
    items: Array<{ requirement: { importance: number }; state: { score: number } }>,
  ) {
    if (items.length === 0) return null;
    const totalWeight = items.reduce((sum, item) => sum + item.requirement.importance, 0);
    return Math.round(
      items.reduce((sum, item) => sum + item.state.score * item.requirement.importance, 0) / totalWeight,
    );
  }

  private readOverallScore(payload: unknown) {
    if (!payload || typeof payload !== 'object') return null;
    const score = (payload as { overallScore?: unknown }).overallScore;
    return typeof score === 'number' && Number.isFinite(score) ? score : null;
  }

  private normalizeInput(input: UpsertTargetJobInput) {
    const title = this.normalizeShortText(input.title, '岗位名称', 120, true);
    const level = this.normalizeShortText(input.level, '职级', 32, false);
    const company = this.normalizeShortText(input.company, '公司名称', 120, false);
    const jobDescription = this.normalizeJobDescription(input.jobDescription);
    return { title, level, company, jobDescription };
  }

  private rethrowActiveJobConflict(error: unknown): never {
    if ((error as { code?: string })?.code === 'P2002') {
      throw new ConflictException('当前岗位设置已被另一请求更新，请刷新后重试');
    }
    throw error;
  }

  private normalizeShortText(value: string | undefined, field: string, maxLength: number, required: boolean) {
    if (!value) {
      if (required) throw new BadRequestException(`${field}不能为空`);
      return null;
    }
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (!normalized || normalized.length > maxLength || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(normalized)) {
      throw new BadRequestException(`${field}格式不合法`);
    }
    return normalized;
  }

  private normalizeJobDescription(value: string | undefined) {
    if (!value) return null;
    const normalized = value.replace(/\r\n/g, '\n').trim();
    if (normalized.length < 20 || normalized.length > MAX_JOB_DESCRIPTION_CHARS) {
      throw new BadRequestException(`JD 必须为 20-${MAX_JOB_DESCRIPTION_CHARS} 个字符`);
    }
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(normalized)) {
      throw new BadRequestException('JD 包含不支持的控制字符');
    }
    return normalized;
  }

  private async requireOwnedTargetJob(userId: string, targetJobId: string, include?: any) {
    const targetJob = await this.prisma.targetJob.findFirst({
      where: { id: targetJobId, userId },
      include,
    });
    if (!targetJob) throw new NotFoundException('Target job not found');
    return targetJob;
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
}
