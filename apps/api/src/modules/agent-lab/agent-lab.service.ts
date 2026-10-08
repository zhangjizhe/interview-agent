import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { loadGoldenDataset } from '../../evals/golden-dataset.schema';
import { ConfigService } from '@nestjs/config';
import { requireTenant } from '../organizations/tenant-context';

const RELEASE_THRESHOLDS = {
  qualityScore: 0.7,
  structuredOutputValidRate: 0.98,
  latencyMs: 10_000,
  estimatedCostCny: 1,
};

const FAILURE_CATEGORIES = new Set([
  'WRONG_QUESTION', 'BAD_FOLLOWUP', 'MISSING_EVIDENCE', 'HALLUCINATION',
  'CONTEXT_MISS', 'MEMORY_MISS', 'RAG_MISS', 'DIFFICULTY_MISMATCH',
  'REPETITIVE', 'OVER_SCORING', 'UNDER_SCORING', 'WRONG_SKILL',
  'STRUCTURED_OUTPUT', 'SAFETY', 'UNKNOWN',
]);
const FAILURE_SEVERITIES = new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
const DECISION_RATIONALES = {
  QUALITY_GATE_REVIEWED: 'An administrator reviewed the recorded quality, structure, latency, cost, and failure evidence.',
  COST_OR_LATENCY_REVIEW: 'An administrator requires additional review of recorded cost or latency before release.',
  RELEASE_GATE_REJECTED: 'An administrator rejected the release after reviewing the recorded gate evidence.',
} as const;

type LabMetrics = {
  qualityScore: number;
  structuredOutputValidRate: number;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostCny?: number;
};

type RecordedRunInput = {
  agentKey: string;
  agentVersion: string;
  runtimeVersion: string;
  promptVersion?: string;
  modelProvider?: string;
  modelVersion?: string;
  toolPolicyVersion?: string;
  datasetVersion: string;
  traceRef?: string;
  inputHash: string;
  metrics: LabMetrics;
  traceSummary: { stages: string[]; toolCalls: number; status: string };
  failures?: Array<{
    caseId: string;
    category: string;
    severity: string;
  }>;
};

type AuditKind = 'RUN' | 'IMPORT' | 'EXPERIMENT' | 'DECISION';
type AuditQuery = {
  kind?: string;
  datasetVersion?: string;
  agentKey?: string;
  status?: string;
  from?: string;
  to?: string;
  page?: string;
  limit?: string;
};

type OperationLogQuery = {
  action?: string;
  outcome?: string;
  objectType?: string;
  from?: string;
  to?: string;
  page?: string;
  limit?: string;
};

const OPERATION_ACTIONS = [
  'MCP_CONFIG_RELOAD',
  'RECORDED_IMPORT_SUBMIT',
  'RECORDED_IMPORT_EXECUTE',
  'EXPERIMENT_CREATE',
  'RELEASE_DECISION_RECORD',
  'RETENTION_EXECUTE',
] as const;
const OPERATION_OBJECTS = [
  'MCP_REGISTRY',
  'RECORDED_IMPORT',
  'EXPERIMENT',
  'RELEASE_DECISION',
  'RETENTION_POLICY',
] as const;
const OPERATION_OUTCOMES = ['SUCCEEDED', 'REJECTED'] as const;

@Injectable()
export class AgentLabService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config?: ConfigService,
  ) {}

  async dashboard() {
    const dataset = await this.ensureGoldenDataset();
    const [runs, decisions, experiments] = await Promise.all([
      this.prisma.labRun.findMany({
        include: { agentVersion: true, dataset: true, failures: true },
        orderBy: { startedAt: 'desc' },
        take: 20,
      }),
      this.prisma.labReleaseDecision.findMany({
        include: { agentVersion: true, dataset: true, run: true, experiment: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.labExperiment.findMany({
        include: {
          controlVersion: true,
          treatmentVersion: true,
          dataset: true,
          runs: { include: { run: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    return {
      dataset,
      thresholds: RELEASE_THRESHOLDS,
      summary: {
        runCount: runs.length,
        failedRunCount: runs.filter((run) =>
          run.failures.some((failure) => failure.severity === 'HIGH' || failure.severity === 'CRITICAL'),
        ).length,
        latestDecision: decisions[0]?.decision || null,
        experimentCount: experiments.length,
      },
      runs: runs.map((run) => this.runSummary(run)),
      decisions: decisions.map((decision) => ({
        id: decision.id,
        decision: decision.decision,
        rationale: decision.rationale,
        agent: this.versionSummary(decision.agentVersion),
        datasetVersion: decision.dataset.version,
        runId: decision.runId,
        experimentId: decision.experimentId,
        createdAt: decision.createdAt,
      })),
      experiments: experiments.map((experiment) => ({
        id: experiment.id,
        name: experiment.name,
        hypothesis: experiment.hypothesis,
        status: experiment.status,
        comparison: experiment.comparison,
        datasetVersion: experiment.dataset.version,
        control: this.versionSummary(experiment.controlVersion),
        treatment: this.versionSummary(experiment.treatmentVersion),
        runCount: experiment.runs.length,
        createdAt: experiment.createdAt,
        completedAt: experiment.completedAt,
      })),
    };
  }

  async audit(query: AuditQuery) {
    const filters = this.parseAuditQuery(query);
    const skip = (filters.page - 1) * filters.limit;
    const dateFilter = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    };

    if (filters.kind === 'RUN') {
      const where: any = {
        ...(Object.keys(dateFilter).length ? { startedAt: dateFilter } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.datasetVersion ? { dataset: { version: filters.datasetVersion } } : {}),
        ...(filters.agentKey ? { agentVersion: { agentKey: filters.agentKey } } : {}),
      };
      const [items, total] = await Promise.all([
        this.prisma.labRun.findMany({
          where,
          include: { agentVersion: true, dataset: true, failures: true },
          orderBy: { startedAt: 'desc' },
          skip,
          take: filters.limit,
        }),
        this.prisma.labRun.count({ where }),
      ]);
      return this.auditResponse(filters, total, items.map((item) => this.runSummary(item)));
    }

    if (filters.kind === 'IMPORT') {
      const where: any = {
        ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.datasetVersion || filters.agentKey ? {
          AND: [
            ...(filters.datasetVersion ? [{ recordedRun: { path: ['datasetVersion'], equals: filters.datasetVersion } }] : []),
            ...(filters.agentKey ? [{ recordedRun: { path: ['agentKey'], equals: filters.agentKey } }] : []),
          ],
        } : {}),
      };
      const [items, total] = await Promise.all([
        this.prisma.labRecordedImport.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: filters.limit }),
        this.prisma.labRecordedImport.count({ where }),
      ]);
      return this.auditResponse(filters, total, items.map((item) => this.recordedImportSummary(item)));
    }

    if (filters.kind === 'EXPERIMENT') {
      const where: any = {
        ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.datasetVersion ? { dataset: { version: filters.datasetVersion } } : {}),
        ...(filters.agentKey ? {
          OR: [
            { controlVersion: { agentKey: filters.agentKey } },
            { treatmentVersion: { agentKey: filters.agentKey } },
          ],
        } : {}),
      };
      const [items, total] = await Promise.all([
        this.prisma.labExperiment.findMany({
          where,
          include: { controlVersion: true, treatmentVersion: true, dataset: true, runs: true },
          orderBy: { createdAt: 'desc' },
          skip,
          take: filters.limit,
        }),
        this.prisma.labExperiment.count({ where }),
      ]);
      return this.auditResponse(filters, total, items.map((item) => ({
        id: item.id,
        name: item.name,
        hypothesis: item.hypothesis,
        status: item.status,
        comparison: item.comparison,
        datasetVersion: item.dataset.version,
        control: this.versionSummary(item.controlVersion),
        treatment: this.versionSummary(item.treatmentVersion),
        runCount: item.runs.length,
        createdAt: item.createdAt,
        completedAt: item.completedAt,
      })));
    }

    const where: any = {
      ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}),
      ...(filters.status ? { decision: filters.status } : {}),
      ...(filters.datasetVersion ? { dataset: { version: filters.datasetVersion } } : {}),
      ...(filters.agentKey ? { agentVersion: { agentKey: filters.agentKey } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.labReleaseDecision.findMany({
        where,
        include: { agentVersion: true, dataset: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: filters.limit,
      }),
      this.prisma.labReleaseDecision.count({ where }),
    ]);
    return this.auditResponse(filters, total, items.map((item) => ({
      id: item.id,
      decision: item.decision,
      rationale: item.rationale,
      agent: this.versionSummary(item.agentVersion),
      datasetVersion: item.dataset.version,
      runId: item.runId,
      experimentId: item.experimentId,
      createdAt: item.createdAt,
    })));
  }

  async operationLogs(query: OperationLogQuery) {
    const filters = this.parseOperationLogQuery(query);
    const where: any = {
      ...(filters.action ? { action: filters.action } : {}),
      ...(filters.outcome ? { outcome: filters.outcome } : {}),
      ...(filters.objectType ? { objectType: filters.objectType } : {}),
      ...(filters.from || filters.to ? {
        createdAt: {
          ...(filters.from ? { gte: filters.from } : {}),
          ...(filters.to ? { lte: filters.to } : {}),
        },
      } : {}),
    };
    const skip = (filters.page - 1) * filters.limit;
    const [items, total] = await Promise.all([
      this.prisma.labOperationLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: filters.limit,
      }),
      this.prisma.labOperationLog.count({ where }),
    ]);
    return {
      filters: {
        action: filters.action || null,
        outcome: filters.outcome || null,
        objectType: filters.objectType || null,
        from: filters.from || null,
        to: filters.to || null,
      },
      page: filters.page,
      limit: filters.limit,
      total,
      hasMore: filters.page * filters.limit < total,
      items: items.map((item) => ({
        id: item.id,
        actorId: item.actorId,
        action: item.action,
        objectType: item.objectType,
        objectId: item.objectId,
        outcome: item.outcome,
        createdAt: item.createdAt,
      })),
    };
  }

  async retentionPreview() {
    const retention = this.retentionCutoff();
    if (!retention) {
      return {
        enabled: false,
        retentionDays: null,
        cutoff: null,
        candidates: { imports: 0, runs: 0, experiments: 0, decisions: 0 },
        protected: ['Experiments and release decisions are retained indefinitely.'],
      };
    }
    const importWhere = this.expiredImportWhere(retention.cutoff);
    const runWhere = this.expiredRunWhere(retention.cutoff);
    const [imports, runs] = await Promise.all([
      this.prisma.labRecordedImport.count({ where: importWhere }),
      this.prisma.labRun.count({ where: runWhere }),
    ]);
    return {
      enabled: true,
      retentionDays: retention.days,
      cutoff: retention.cutoff,
      candidates: { imports, runs, experiments: 0, decisions: 0 },
      protected: ['Experiments and release decisions are retained indefinitely.', 'Runs referenced by a receipt, experiment, or release decision are retained.'],
    };
  }

  async executeRetention(input: { confirm: string }, requestedBy: string) {
    try {
      if (input.confirm !== 'DELETE_EXPIRED_AGENT_LAB_METADATA') {
        throw new BadRequestException('Retention cleanup requires the exact confirmation token');
      }
      const retention = this.retentionCutoff();
      if (!retention) {
        throw new ConflictException('Agent Lab retention is disabled');
      }
      const importWhere = this.expiredImportWhere(retention.cutoff);
      const runWhere = this.expiredRunWhere(retention.cutoff);
      const result = await this.prisma.$transaction(async (tx) => {
        const imports = await tx.labRecordedImport.deleteMany({ where: importWhere });
        const runs = await tx.labRun.deleteMany({ where: runWhere });
        return { imports: imports.count, runs: runs.count };
      });
      await this.recordOperation(requestedBy, 'RETENTION_EXECUTE', 'RETENTION_POLICY', 'configured-retention', 'SUCCEEDED');
      return {
        retentionDays: retention.days,
        cutoff: retention.cutoff,
        deleted: result,
        requestedBy,
        protected: ['Experiments and release decisions are retained indefinitely.'],
      };
    } catch (error) {
      await this.recordOperation(requestedBy, 'RETENTION_EXECUTE', 'RETENTION_POLICY', 'configured-retention', 'REJECTED');
      throw error;
    }
  }

  async recordRun(input: RecordedRunInput, approvedBy: string) {
    this.assertRecordedRun(input);
    const dataset = await this.ensureGoldenDataset();
    if (input.datasetVersion !== dataset.version) {
      throw new BadRequestException('Recorded report dataset version does not match the active Golden Dataset');
    }
    const agentVersion = await this.prisma.labAgentVersion.upsert({
      where: { agentKey_version: { agentKey: input.agentKey, version: input.agentVersion } },
      create: {
        agentKey: input.agentKey,
        version: input.agentVersion,
        runtimeVersion: input.runtimeVersion,
        promptVersion: input.promptVersion,
        modelProvider: input.modelProvider,
        modelVersion: input.modelVersion,
        toolPolicyVersion: input.toolPolicyVersion,
      },
      update: {
        runtimeVersion: input.runtimeVersion,
        promptVersion: input.promptVersion,
        modelProvider: input.modelProvider,
        modelVersion: input.modelVersion,
        toolPolicyVersion: input.toolPolicyVersion,
      },
    });

    const now = new Date();
    const run = await this.prisma.labRun.create({
      data: {
        agentVersionId: agentVersion.id,
        datasetId: dataset.id,
        runType: 'RECORDED',
        status: 'SUCCEEDED',
        traceRef: input.traceRef,
        inputHash: input.inputHash,
        metrics: {
          qualityScore: input.metrics.qualityScore,
          structuredOutputValidRate: input.metrics.structuredOutputValidRate,
        },
        traceSummary: input.traceSummary,
        startedAt: now,
        completedAt: now,
        durationMs: input.metrics.latencyMs,
        inputTokens: input.metrics.inputTokens || 0,
        outputTokens: input.metrics.outputTokens || 0,
        estimatedCostCny: input.metrics.estimatedCostCny || 0,
        failures: {
          create: (input.failures || []).map((failure) => ({
            caseId: failure.caseId,
            category: failure.category as any,
            severity: failure.severity as any,
            // Control-plane callers never supply candidate text. This is a classification receipt,
            // not a copy of the answer, prompt, retrieval context, or tool output.
            evidenceSummary: `Sanitized ${failure.category} classification for ${failure.caseId}.`,
          })),
        },
      },
      include: { agentVersion: true, dataset: true, failures: true },
    });
    const decision = this.decide(run, true);
    const releaseDecision = await this.prisma.labReleaseDecision.create({
      data: {
        agentVersionId: run.agentVersionId,
        datasetId: run.datasetId,
        runId: run.id,
        decision: decision.decision as any,
        thresholdSnapshot: RELEASE_THRESHOLDS,
        metricsSnapshot: run.metrics,
        rationale: decision.rationale,
        approvedBy,
      },
    });

    return { run: this.runSummary(run), decision: { ...releaseDecision, rationale: decision.rationale } };
  }

  async listRecordedImports() {
    const imports = await this.prisma.labRecordedImport.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return {
      imports: imports.map((record) => this.recordedImportSummary(record)),
    };
  }

  async submitRecordedImport(input: RecordedRunInput, submittedBy: string) {
    try {
      this.assertRecordedRun(input);
      const dataset = await this.ensureGoldenDataset();
      if (input.datasetVersion !== dataset.version) {
        throw new BadRequestException('Recorded report dataset version does not match the active Golden Dataset');
      }
      const record = await this.prisma.labRecordedImport.create({
        data: {
          receiptHash: input.inputHash,
          recordedRun: this.safeRecordedRun(input),
          submittedBy,
        },
      });
      await this.recordOperation(submittedBy, 'RECORDED_IMPORT_SUBMIT', 'RECORDED_IMPORT', record.id, 'SUCCEEDED');
      return this.recordedImportSummary(record);
    } catch (error: any) {
      if (error?.code === 'P2002') {
        await this.recordOperation(submittedBy, 'RECORDED_IMPORT_SUBMIT', 'RECORDED_IMPORT', this.safeOperationObjectId(input.inputHash, 'new-receipt'), 'REJECTED');
        throw new ConflictException('This recorded report has already been submitted');
      }
      await this.recordOperation(submittedBy, 'RECORDED_IMPORT_SUBMIT', 'RECORDED_IMPORT', 'new-receipt', 'REJECTED');
      throw error;
    }
  }

  async executeRecordedImport(importId: string, importedBy: string) {
    try {
      const claimed = await this.prisma.labRecordedImport.updateMany({
        where: { id: importId, status: 'PENDING' },
        data: { status: 'IMPORTING', importedBy },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('Recorded report is unavailable for import');
      }
      const record = await this.prisma.labRecordedImport.findUnique({ where: { id: importId } });
      if (!record) throw new NotFoundException('Recorded report import not found');
      const result = await this.recordRun(record.recordedRun as unknown as RecordedRunInput, importedBy);
      const updated = await this.prisma.labRecordedImport.update({
        where: { id: importId },
        data: {
          status: 'IMPORTED',
          runId: result.run.id,
          importedAt: new Date(),
          error: null,
        },
      });
      await this.recordOperation(importedBy, 'RECORDED_IMPORT_EXECUTE', 'RECORDED_IMPORT', importId, 'SUCCEEDED');
      return { import: this.recordedImportSummary(updated), ...result };
    } catch (error) {
      await this.prisma.labRecordedImport.update({
        where: { id: importId },
        data: { status: 'FAILED', error: 'The recorded report could not be imported. Review the verified receipt and retry with a new submission.' },
      }).catch(() => undefined);
      await this.recordOperation(importedBy, 'RECORDED_IMPORT_EXECUTE', 'RECORDED_IMPORT', this.safeOperationObjectId(importId, 'unavailable-receipt'), 'REJECTED');
      throw error;
    }
  }

  async createExperiment(
    input: { controlRunId: string; treatmentRunId: string },
    createdBy: string,
  ) {
    try {
      if (!input.controlRunId || !input.treatmentRunId || input.controlRunId === input.treatmentRunId) {
        throw new BadRequestException('Experiment requires two different recorded runs');
      }
      const runs = await this.prisma.labRun.findMany({
        where: { id: { in: [input.controlRunId, input.treatmentRunId] } },
        include: { agentVersion: true, failures: true },
      });
      const control = runs.find((run) => run.id === input.controlRunId);
      const treatment = runs.find((run) => run.id === input.treatmentRunId);
      if (!control || !treatment) throw new NotFoundException('Both recorded runs are required');
      if (control.datasetId !== treatment.datasetId) {
        throw new BadRequestException('Experiment runs must use the same dataset version');
      }
      if (control.agentVersionId === treatment.agentVersionId) {
        throw new BadRequestException('Control and treatment must use different agent versions');
      }

      const comparison = this.compareRuns(control, treatment);
      const name = `${control.agentVersion.agentKey} ${control.agentVersion.version} to ${treatment.agentVersion.version}`;
      const hypothesis = `Treatment ${treatment.agentVersion.version} changes recorded evaluator outcomes relative to control ${control.agentVersion.version}.`;
      const experiment = await this.prisma.labExperiment.create({
        data: {
          name,
          hypothesis,
          controlVersionId: control.agentVersionId,
          treatmentVersionId: treatment.agentVersionId,
          datasetId: control.datasetId,
          status: 'COMPLETED',
          comparison,
          createdBy,
          completedAt: new Date(),
          runs: {
            create: [
              { runId: control.id, arm: 'CONTROL' },
              { runId: treatment.id, arm: 'TREATMENT' },
            ],
          },
        },
        include: { dataset: true, treatmentVersion: true },
      });
      const treatmentDecision = this.decide(treatment, true);
      const releaseDecision = await this.prisma.labReleaseDecision.create({
        data: {
          agentVersionId: treatment.agentVersionId,
          datasetId: treatment.datasetId,
          runId: treatment.id,
          experimentId: experiment.id,
          decision: treatmentDecision.decision as any,
          thresholdSnapshot: RELEASE_THRESHOLDS,
          metricsSnapshot: comparison,
          rationale: `${treatmentDecision.rationale} Experiment comparison is recorded; a RECORDED run still requires human approval before release.`,
          approvedBy: createdBy,
        },
      });

      await this.recordOperation(createdBy, 'EXPERIMENT_CREATE', 'EXPERIMENT', experiment.id, 'SUCCEEDED');
      return {
        experiment: {
          id: experiment.id,
          status: experiment.status,
          comparison,
          datasetVersion: experiment.dataset.version,
          treatment: this.versionSummary(experiment.treatmentVersion),
        },
        decision: releaseDecision,
      };
    } catch (error) {
      await this.recordOperation(createdBy, 'EXPERIMENT_CREATE', 'EXPERIMENT', 'new-experiment', 'REJECTED');
      throw error;
    }
  }

  async recordManualDecision(
    input: { runId: string; decision: string; rationaleCode: keyof typeof DECISION_RATIONALES },
    approvedBy: string,
  ) {
    try {
      if (!['APPROVE', 'NEEDS_REVIEW', 'REJECT'].includes(input.decision)
        || !Object.prototype.hasOwnProperty.call(DECISION_RATIONALES, input.rationaleCode)) {
        throw new BadRequestException('A valid decision and approved rationale code are required');
      }
      const run = await this.prisma.labRun.findUnique({
        where: { id: input.runId },
        include: { agentVersion: true, dataset: true, failures: true },
      });
      if (!run) throw new NotFoundException('Run not found');
      if (input.decision === 'APPROVE' && run.status !== 'SUCCEEDED') {
        throw new BadRequestException('Only a successful run can be manually approved');
      }

      const releaseDecision = await this.prisma.labReleaseDecision.create({
        data: {
          agentVersionId: run.agentVersionId,
          datasetId: run.datasetId,
          runId: run.id,
          decision: input.decision as any,
          thresholdSnapshot: RELEASE_THRESHOLDS,
          metricsSnapshot: run.metrics,
          rationale: DECISION_RATIONALES[input.rationaleCode],
          approvedBy,
        },
      });
      await this.recordOperation(approvedBy, 'RELEASE_DECISION_RECORD', 'RELEASE_DECISION', releaseDecision.id, 'SUCCEEDED');
      return releaseDecision;
    } catch (error) {
      await this.recordOperation(approvedBy, 'RELEASE_DECISION_RECORD', 'RELEASE_DECISION', this.safeOperationObjectId(input.runId, 'new-decision'), 'REJECTED');
      throw error;
    }
  }

  private async ensureGoldenDataset() {
    const datasetPath = [
      join(process.cwd(), 'src/evals/golden-dataset.json'),
      join(process.cwd(), 'evals/golden-dataset.json'),
    ].find(existsSync);
    if (!datasetPath) {
      throw new NotFoundException('Golden Dataset asset is unavailable to the Agent Lab runtime');
    }
    const source = readFileSync(datasetPath);
    const parsed = loadGoldenDataset(datasetPath);
    const sourceHash = createHash('sha256').update(source).digest('hex');
    const responseCount = parsed.cases.reduce((total, item) => total + item.responses.length, 0);
    return this.prisma.labDataset.upsert({
      where: { organizationId_version: { organizationId: requireTenant().organizationId, version: parsed.version } },
      create: {
        version: parsed.version,
        name: 'Golden Dataset',
        sourceHash,
        caseCount: parsed.cases.length,
        responseCount,
        validationStatus: 'VALID',
      },
      update: { sourceHash, caseCount: parsed.cases.length, responseCount, validationStatus: 'VALID' },
    });
  }

  private assertRecordedRun(input: RecordedRunInput) {
    if (!input.agentKey?.trim() || !input.agentVersion?.trim() || !input.runtimeVersion?.trim() || !input.datasetVersion?.trim()) {
      throw new BadRequestException('agentKey, agentVersion, runtimeVersion and datasetVersion are required');
    }
    if (!/^[a-f0-9]{32,128}$/i.test(input.inputHash || '')) {
      throw new BadRequestException('inputHash must be a SHA-256 style digest; raw input is not accepted');
    }
    if (input.traceRef && !/^[a-zA-Z0-9._:-]{1,128}$/.test(input.traceRef)) {
      throw new BadRequestException('traceRef must be an opaque, content-free identifier');
    }
    if (!input.traceSummary || !Array.isArray(input.traceSummary.stages) || input.traceSummary.stages.length === 0) {
      throw new BadRequestException('traceSummary must contain non-empty stage names');
    }
    if (input.traceSummary.stages.some((stage) => typeof stage !== 'string' || stage.length > 80)) {
      throw new BadRequestException('Trace stage names must be concise summaries');
    }
    if (!Number.isInteger(input.traceSummary.toolCalls) || input.traceSummary.toolCalls < 0 || input.traceSummary.toolCalls > 100) {
      throw new BadRequestException('toolCalls must be an integer from 0 to 100');
    }
    const metrics = input.metrics;
    if (!metrics || !this.isRatio(metrics.qualityScore) || !this.isRatio(metrics.structuredOutputValidRate)
      || !this.isNonNegative(metrics.latencyMs) || !this.isNonNegative(metrics.inputTokens || 0)
      || !this.isNonNegative(metrics.outputTokens || 0) || !this.isNonNegative(metrics.estimatedCostCny || 0)) {
      throw new BadRequestException('Metrics must be bounded, non-negative numeric summaries');
    }
    for (const failure of input.failures || []) {
      if (!failure.caseId || failure.caseId.length > 100 || !FAILURE_CATEGORIES.has(failure.category)
        || !FAILURE_SEVERITIES.has(failure.severity)) {
        throw new BadRequestException('Failure entries must use the approved taxonomy and severity');
      }
    }
  }

  private safeRecordedRun(input: RecordedRunInput): RecordedRunInput {
    return {
      agentKey: input.agentKey.trim(),
      agentVersion: input.agentVersion.trim(),
      runtimeVersion: input.runtimeVersion.trim(),
      datasetVersion: input.datasetVersion.trim(),
      inputHash: input.inputHash,
      promptVersion: input.promptVersion?.trim() || undefined,
      modelProvider: input.modelProvider?.trim() || undefined,
      modelVersion: input.modelVersion?.trim() || undefined,
      toolPolicyVersion: input.toolPolicyVersion?.trim() || undefined,
      traceRef: input.traceRef,
      metrics: {
        qualityScore: input.metrics.qualityScore,
        structuredOutputValidRate: input.metrics.structuredOutputValidRate,
        latencyMs: input.metrics.latencyMs,
        inputTokens: input.metrics.inputTokens || 0,
        outputTokens: input.metrics.outputTokens || 0,
        estimatedCostCny: input.metrics.estimatedCostCny || 0,
      },
      traceSummary: {
        stages: [...input.traceSummary.stages],
        toolCalls: input.traceSummary.toolCalls,
        status: input.traceSummary.status,
      },
      failures: (input.failures || []).map((failure) => ({
        caseId: failure.caseId,
        category: failure.category,
        severity: failure.severity,
      })),
    };
  }

  private parseAuditQuery(query: AuditQuery) {
    const kind = (query.kind || 'RUN').toUpperCase() as AuditKind;
    if (!['RUN', 'IMPORT', 'EXPERIMENT', 'DECISION'].includes(kind)) {
      throw new BadRequestException('Audit kind is not allowed');
    }
    const statusByKind: Record<AuditKind, string[]> = {
      RUN: ['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED'],
      IMPORT: ['PENDING', 'IMPORTING', 'IMPORTED', 'FAILED'],
      EXPERIMENT: ['DRAFT', 'RUNNING', 'COMPLETED'],
      DECISION: ['APPROVE', 'NEEDS_REVIEW', 'REJECT'],
    };
    if (query.status && !statusByKind[kind].includes(query.status)) {
      throw new BadRequestException('Audit status is not allowed for this kind');
    }
    const datasetVersion = this.safeAuditIdentifier(query.datasetVersion, 'datasetVersion');
    const agentKey = this.safeAuditIdentifier(query.agentKey, 'agentKey');
    const from = this.safeAuditDate(query.from, 'from');
    const to = this.safeAuditDate(query.to, 'to');
    if (from && to && from > to) throw new BadRequestException('Audit from must not be after to');
    return {
      kind,
      datasetVersion,
      agentKey,
      status: query.status,
      from,
      to,
      page: this.safeAuditInteger(query.page, 1, 1, 10_000),
      limit: this.safeAuditInteger(query.limit, 20, 1, 50),
    };
  }

  private parseOperationLogQuery(query: OperationLogQuery) {
    const action = this.safeOperationFilter(query.action, OPERATION_ACTIONS, 'action');
    const outcome = this.safeOperationFilter(query.outcome, OPERATION_OUTCOMES, 'outcome');
    const objectType = this.safeOperationFilter(query.objectType, OPERATION_OBJECTS, 'object type');
    const from = this.safeAuditDate(query.from, 'from');
    const to = this.safeAuditDate(query.to, 'to');
    if (from && to && from > to) throw new BadRequestException('Operation log from must not be after to');
    return {
      action,
      outcome,
      objectType,
      from,
      to,
      page: this.safeAuditInteger(query.page, 1, 1, 10_000),
      limit: this.safeAuditInteger(query.limit, 20, 1, 50),
    };
  }

  private safeOperationFilter(value: string | undefined, allowed: readonly string[], name: string) {
    if (!value) return undefined;
    if (!allowed.includes(value)) throw new BadRequestException(`Operation log ${name} is not allowed`);
    return value;
  }

  private safeOperationObjectId(value: string | undefined, fallback: string) {
    return value && /^[a-zA-Z0-9._-]{1,128}$/.test(value) ? value : fallback;
  }

  private async recordOperation(
    actorId: string,
    action: (typeof OPERATION_ACTIONS)[number],
    objectType: (typeof OPERATION_OBJECTS)[number],
    objectId: string,
    outcome: (typeof OPERATION_OUTCOMES)[number],
  ) {
    await this.prisma.labOperationLog.create({
      data: { actorId, action, objectType, objectId, outcome },
    });
  }

  private auditResponse(filters: any, total: number, items: unknown[]) {
    return {
      kind: filters.kind,
      filters: {
        datasetVersion: filters.datasetVersion || null,
        agentKey: filters.agentKey || null,
        status: filters.status || null,
        from: filters.from || null,
        to: filters.to || null,
      },
      page: filters.page,
      limit: filters.limit,
      total,
      hasMore: filters.page * filters.limit < total,
      items,
    };
  }

  private safeAuditIdentifier(value: string | undefined, name: string) {
    if (!value) return undefined;
    if (!/^[a-zA-Z0-9._-]{1,120}$/.test(value)) {
      throw new BadRequestException(`Audit ${name} must be an exact identifier`);
    }
    return value;
  }

  private safeAuditDate(value: string | undefined, name: string) {
    if (!value) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) throw new BadRequestException(`Audit ${name} is invalid`);
    return date;
  }

  private safeAuditInteger(value: string | undefined, fallback: number, min: number, max: number) {
    if (!value) return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
      throw new BadRequestException('Audit pagination is invalid');
    }
    return parsed;
  }

  private retentionCutoff() {
    const raw = this.config?.get<string>('agentLab.retentionDays') || process.env.AGENT_LAB_RETENTION_DAYS;
    if (!raw) return null;
    const days = Number(raw);
    if (!Number.isInteger(days) || days < 30 || days > 3_650) {
      throw new BadRequestException('Agent Lab retention days must be an integer from 30 to 3650');
    }
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - days);
    return { days, cutoff };
  }

  private expiredImportWhere(cutoff: Date) {
    return {
      createdAt: { lt: cutoff },
      status: { in: ['PENDING', 'FAILED'] as any[] },
      runId: null,
    };
  }

  private expiredRunWhere(cutoff: Date) {
    return {
      startedAt: { lt: cutoff },
      releaseDecisions: { none: {} },
      experiments: { none: {} },
      recordedImport: null,
    };
  }

  private recordedImportSummary(record: any) {
    const payload = record.recordedRun as RecordedRunInput;
    return {
      id: record.id,
      receiptHash: record.receiptHash,
      status: record.status,
      submittedBy: record.submittedBy,
      importedBy: record.importedBy,
      runId: record.runId,
      error: record.error,
      createdAt: record.createdAt,
      importedAt: record.importedAt,
      agent: {
        agentKey: payload.agentKey,
        version: payload.agentVersion,
        runtimeVersion: payload.runtimeVersion,
      },
      datasetVersion: payload.datasetVersion,
      metrics: payload.metrics,
      failureCount: payload.failures?.length || 0,
    };
  }

  private decide(run: any, requireHumanReview: boolean) {
    const metrics = run.metrics as { qualityScore: number; structuredOutputValidRate: number };
    const hasSevereFailure = run.failures.some((failure: any) => failure.severity === 'CRITICAL' || failure.severity === 'HIGH');
    if (hasSevereFailure || metrics.qualityScore < RELEASE_THRESHOLDS.qualityScore
      || metrics.structuredOutputValidRate < RELEASE_THRESHOLDS.structuredOutputValidRate) {
      return { decision: 'REJECT', rationale: 'Quality, structured output, or failure severity breached the release gate.' };
    }
    if ((run.durationMs || 0) > RELEASE_THRESHOLDS.latencyMs
      || run.estimatedCostCny > RELEASE_THRESHOLDS.estimatedCostCny
      || requireHumanReview) {
      return { decision: 'NEEDS_REVIEW', rationale: requireHumanReview
        ? 'Recorded deterministic evidence is auditable but requires human release approval.'
        : 'Latency or cost requires manual release review.' };
    }
    return { decision: 'APPROVE', rationale: 'All quality, structure, latency, cost, and failure gates passed.' };
  }

  private compareRuns(control: any, treatment: any) {
    const controlMetrics = control.metrics as { qualityScore: number; structuredOutputValidRate: number };
    const treatmentMetrics = treatment.metrics as { qualityScore: number; structuredOutputValidRate: number };
    return {
      qualityScoreDelta: treatmentMetrics.qualityScore - controlMetrics.qualityScore,
      structuredOutputValidRateDelta: treatmentMetrics.structuredOutputValidRate - controlMetrics.structuredOutputValidRate,
      latencyMsDelta: (treatment.durationMs || 0) - (control.durationMs || 0),
      estimatedCostCnyDelta: treatment.estimatedCostCny - control.estimatedCostCny,
      criticalOrHighFailureDelta: this.severeFailureCount(treatment) - this.severeFailureCount(control),
    };
  }

  private runSummary(run: any) {
    return {
      id: run.id,
      type: run.runType,
      status: run.status,
      traceRef: run.traceRef,
      agent: this.versionSummary(run.agentVersion),
      datasetVersion: run.dataset.version,
      metrics: run.metrics,
      durationMs: run.durationMs,
      inputTokens: run.inputTokens,
      outputTokens: run.outputTokens,
      estimatedCostCny: run.estimatedCostCny,
      failureCounts: run.failures.reduce((counts: Record<string, number>, failure: any) => {
        counts[failure.severity] = (counts[failure.severity] || 0) + 1;
        return counts;
      }, {}),
      failures: run.failures.map((failure: any) => ({
        caseId: failure.caseId,
        category: failure.category,
        severity: failure.severity,
        evidenceSummary: failure.evidenceSummary,
      })),
      startedAt: run.startedAt,
      completedAt: run.completedAt,
    };
  }

  private versionSummary(version: any) {
    return {
      agentKey: version.agentKey,
      version: version.version,
      runtimeVersion: version.runtimeVersion,
      promptVersion: version.promptVersion,
      modelProvider: version.modelProvider,
      modelVersion: version.modelVersion,
      toolPolicyVersion: version.toolPolicyVersion,
    };
  }

  private severeFailureCount(run: any) {
    return run.failures.filter((failure: any) => failure.severity === 'HIGH' || failure.severity === 'CRITICAL').length;
  }

  private isRatio(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
  }

  private isNonNegative(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
  }
}
