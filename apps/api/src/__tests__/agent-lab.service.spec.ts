import { BadRequestException } from '@nestjs/common';
import { AgentLabService } from '../modules/agent-lab/agent-lab.service';

describe('AgentLabService', () => {
  const prisma = {
    labAgentVersion: { upsert: jest.fn() },
    labRun: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn() },
    labReleaseDecision: { create: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    labExperiment: { create: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    labDataset: { upsert: jest.fn() },
    labRecordedImport: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn(), count: jest.fn() },
    labOperationLog: { create: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  };
  const validInput = {
    agentKey: 'interview-evaluator',
    agentVersion: 'v0.2.0',
    runtimeVersion: 'langgraph-v1',
    datasetVersion: 'golden-v1',
    inputHash: 'a'.repeat(64),
    metrics: {
      qualityScore: 0.91,
      structuredOutputValidRate: 1,
      latencyMs: 820,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostCny: 0,
    },
    traceSummary: { stages: ['dataset', 'evaluator', 'report'], toolCalls: 0, status: 'SUCCEEDED' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('records only sanitized evidence and marks a recorded run for human release review', async () => {
    const service = new AgentLabService(prisma as any);
    jest.spyOn(service as any, 'ensureGoldenDataset').mockResolvedValue({ id: 'dataset-1', version: 'golden-v1' });
    prisma.labAgentVersion.upsert.mockResolvedValue({ id: 'agent-1', agentKey: validInput.agentKey, version: validInput.agentVersion });
    prisma.labRun.create.mockResolvedValue({
      id: 'run-1',
      runType: 'RECORDED',
      status: 'SUCCEEDED',
      agentVersionId: 'agent-1',
      datasetId: 'dataset-1',
      agentVersion: { agentKey: validInput.agentKey, version: validInput.agentVersion, runtimeVersion: 'langgraph-v1' },
      dataset: { version: 'golden-v1' },
      metrics: { qualityScore: 0.91, structuredOutputValidRate: 1 },
      durationMs: 820,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostCny: 0,
      failures: [],
      startedAt: new Date(),
      completedAt: new Date(),
    });
    prisma.labReleaseDecision.create.mockResolvedValue({ id: 'decision-1', decision: 'NEEDS_REVIEW' });

    const result = await service.recordRun(validInput, 'admin-1');

    expect(result.decision.decision).toBe('NEEDS_REVIEW');
    expect(prisma.labRun.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        runType: 'RECORDED',
        inputHash: validInput.inputHash,
        traceSummary: validInput.traceSummary,
      }),
    }));
    expect(JSON.stringify(prisma.labRun.create.mock.calls[0][0])).not.toContain('candidate answer');
  });

  it('rejects raw input and unknown failure taxonomy values', async () => {
    const service = new AgentLabService(prisma as any);
    await expect(service.recordRun({ ...validInput, inputHash: 'candidate answer' }, 'admin-1'))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.recordRun({
      ...validInput,
      failures: [{ caseId: 'case-001', category: 'NOT_A_TAXONOMY', severity: 'LOW' }],
    }, 'admin-1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.recordRun({ ...validInput, traceRef: 'candidate answer copied here' }, 'admin-1'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.labRun.create).not.toHaveBeenCalled();
  });

  it('rejects a recorded report from a different dataset version before persistence', async () => {
    const service = new AgentLabService(prisma as any);
    jest.spyOn(service as any, 'ensureGoldenDataset').mockResolvedValue({ id: 'dataset-1', version: 'golden-v1' });
    await expect(service.recordRun({ ...validInput, datasetVersion: 'golden-v2' }, 'admin-1'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.labRun.create).not.toHaveBeenCalled();
  });

  it('allows an administrator to record an explicit approval without deploying anything', async () => {
    const service = new AgentLabService(prisma as any);
    prisma.labRun.findUnique.mockResolvedValue({
      id: 'run-1',
      status: 'SUCCEEDED',
      agentVersionId: 'agent-1',
      datasetId: 'dataset-1',
      metrics: { qualityScore: 0.91, structuredOutputValidRate: 1 },
      failures: [],
    });
    prisma.labReleaseDecision.create.mockResolvedValue({ id: 'decision-approve', decision: 'APPROVE' });
    prisma.labOperationLog.create.mockResolvedValue({ id: 'operation-approve' });

    await expect(service.recordManualDecision({
      runId: 'run-1',
      decision: 'APPROVE',
      rationaleCode: 'QUALITY_GATE_REVIEWED',
    }, 'admin-1')).resolves.toMatchObject({ decision: 'APPROVE' });
    expect(prisma.labReleaseDecision.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ approvedBy: 'admin-1', runId: 'run-1', decision: 'APPROVE' }),
    }));
    expect(prisma.labReleaseDecision.create.mock.calls[0][0].data.rationale)
      .toContain('administrator reviewed');
    expect(prisma.labOperationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 'admin-1',
        action: 'RELEASE_DECISION_RECORD',
        objectType: 'RELEASE_DECISION',
        objectId: 'decision-approve',
        outcome: 'SUCCEEDED',
      }),
    });
  });

  it('creates comparisons only from different agent versions on the same dataset', async () => {
    const service = new AgentLabService(prisma as any);
    prisma.labRun.findMany.mockResolvedValue([
      {
        id: 'run-control',
        datasetId: 'dataset-1',
        agentVersionId: 'agent-control',
        agentVersion: { agentKey: 'evaluator', version: 'v1', runtimeVersion: 'runner-v1' },
        metrics: { qualityScore: 0.7, structuredOutputValidRate: 1 },
        durationMs: 500,
        estimatedCostCny: 0,
        failures: [],
      },
      {
        id: 'run-treatment',
        datasetId: 'dataset-1',
        agentVersionId: 'agent-treatment',
        agentVersion: { agentKey: 'evaluator', version: 'v2', runtimeVersion: 'runner-v1' },
        metrics: { qualityScore: 0.8, structuredOutputValidRate: 1 },
        durationMs: 550,
        estimatedCostCny: 0,
        failures: [],
      },
    ]);
    prisma.labExperiment.create.mockResolvedValue({
      id: 'experiment-1',
      status: 'COMPLETED',
      dataset: { version: 'golden-v1' },
      treatmentVersion: { agentKey: 'evaluator', version: 'v2', runtimeVersion: 'runner-v1' },
    });
    prisma.labReleaseDecision.create.mockResolvedValue({ id: 'decision-1', decision: 'NEEDS_REVIEW' });

    await expect(service.createExperiment({
      controlRunId: 'run-control',
      treatmentRunId: 'run-treatment',
    }, 'admin-1')).resolves.toMatchObject({ experiment: { id: 'experiment-1' } });
    expect(prisma.labExperiment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        name: 'evaluator v1 to v2',
        hypothesis: expect.stringContaining('Treatment v2'),
      }),
    }));
  });

  it('rejects same-run experiment requests before querying recorded runs', async () => {
    const service = new AgentLabService(prisma as any);
    await expect(service.createExperiment({ controlRunId: 'run-1', treatmentRunId: 'run-1' }, 'admin-1'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.labRun.findMany).not.toHaveBeenCalled();
  });

  it('queues a sanitized report receipt and only executes it after an administrator claims it', async () => {
    const service = new AgentLabService(prisma as any);
    jest.spyOn(service as any, 'ensureGoldenDataset').mockResolvedValue({ id: 'dataset-1', version: 'golden-v1' });
    prisma.labRecordedImport.create.mockResolvedValue({
      id: 'import-1',
      receiptHash: validInput.inputHash,
      status: 'PENDING',
      recordedRun: validInput,
      submittedBy: 'admin-submit',
      createdAt: new Date(),
    });

    await expect(service.submitRecordedImport(validInput, 'admin-submit')).resolves.toMatchObject({
      id: 'import-1',
      status: 'PENDING',
      submittedBy: 'admin-submit',
      datasetVersion: 'golden-v1',
    });
    expect(prisma.labRun.create).not.toHaveBeenCalled();

    prisma.labRecordedImport.updateMany.mockResolvedValue({ count: 1 });
    prisma.labRecordedImport.findUnique.mockResolvedValue({ id: 'import-1', recordedRun: validInput });
    jest.spyOn(service, 'recordRun').mockResolvedValue({
      run: { id: 'run-1' },
      decision: { decision: 'NEEDS_REVIEW' },
    } as any);
    prisma.labRecordedImport.update.mockResolvedValue({
      id: 'import-1',
      receiptHash: validInput.inputHash,
      status: 'IMPORTED',
      recordedRun: validInput,
      submittedBy: 'admin-submit',
      importedBy: 'admin-execute',
      runId: 'run-1',
      createdAt: new Date(),
      importedAt: new Date(),
    });

    await expect(service.executeRecordedImport('import-1', 'admin-execute')).resolves.toMatchObject({
      import: { status: 'IMPORTED', importedBy: 'admin-execute', runId: 'run-1' },
    });
    expect(prisma.labRecordedImport.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'import-1', status: 'PENDING' },
      data: { status: 'IMPORTING', importedBy: 'admin-execute' },
    }));
  });

  it('does not execute an already claimed report receipt', async () => {
    const service = new AgentLabService(prisma as any);
    prisma.labRecordedImport.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.executeRecordedImport('import-locked', 'admin-1')).rejects.toMatchObject({ status: 409 });
    expect(prisma.labRun.create).not.toHaveBeenCalled();
  });

  it('returns only the requested page of safe run audit summaries', async () => {
    const service = new AgentLabService(prisma as any);
    prisma.labRun.findMany.mockResolvedValue([{
      id: 'run-1',
      runType: 'RECORDED',
      status: 'SUCCEEDED',
      agentVersion: { agentKey: 'evaluator', version: 'v1', runtimeVersion: 'runner-v1' },
      dataset: { version: 'golden-v1' },
      metrics: { qualityScore: 0.9, structuredOutputValidRate: 1 },
      durationMs: 100,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostCny: 0,
      failures: [],
      startedAt: new Date(),
      completedAt: new Date(),
    }]);
    prisma.labRun.count.mockResolvedValue(2);

    await expect(service.audit({
      kind: 'RUN',
      datasetVersion: 'golden-v1',
      agentKey: 'evaluator',
      status: 'SUCCEEDED',
      page: '2',
      limit: '1',
    })).resolves.toMatchObject({
      kind: 'RUN',
      page: 2,
      limit: 1,
      total: 2,
      hasMore: false,
      items: [{ id: 'run-1', datasetVersion: 'golden-v1' }],
    });
    expect(prisma.labRun.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 1,
      take: 1,
      where: expect.objectContaining({ status: 'SUCCEEDED' }),
    }));
  });

  it('rejects arbitrary audit fields and invalid status filters', async () => {
    const service = new AgentLabService(prisma as any);
    await expect(service.audit({ kind: 'RUN', datasetVersion: 'raw candidate answer' }))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.audit({ kind: 'DECISION', status: 'SUCCEEDED' }))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.audit({ kind: 'TRACE' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.labRun.findMany).not.toHaveBeenCalled();
  });

  it('keeps retention disabled by default and never schedules experiment or decision deletion', async () => {
    const service = new AgentLabService(prisma as any, { get: jest.fn().mockReturnValue(undefined) } as any);
    await expect(service.retentionPreview()).resolves.toEqual(expect.objectContaining({
      enabled: false,
      candidates: { imports: 0, runs: 0, experiments: 0, decisions: 0 },
    }));
    expect(prisma.labRecordedImport.count).not.toHaveBeenCalled();
    expect(prisma.labExperiment.deleteMany).toBeUndefined();
    expect(prisma.labReleaseDecision.deleteMany).toBeUndefined();
  });

  it('requires a fixed confirmation token before configured cleanup', async () => {
    const service = new AgentLabService(prisma as any, { get: jest.fn().mockReturnValue('30') } as any);
    await expect(service.executeRetention({ confirm: 'delete everything' }, 'admin-1'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).toBeUndefined();
    expect(prisma.labOperationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 'admin-1',
        action: 'RETENTION_EXECUTE',
        objectType: 'RETENTION_POLICY',
        objectId: 'configured-retention',
        outcome: 'REJECTED',
      }),
    });
  });

  it('deletes only expired unreferenced receipts and runs when retention is explicitly enabled', async () => {
    const transaction = {
      labRecordedImport: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
      labRun: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    prisma.$transaction = jest.fn(async (callback) => callback(transaction));
    const service = new AgentLabService(prisma as any, { get: jest.fn().mockReturnValue('30') } as any);
    await expect(service.executeRetention({ confirm: 'DELETE_EXPIRED_AGENT_LAB_METADATA' }, 'admin-1'))
      .resolves.toMatchObject({ deleted: { imports: 2, runs: 1 }, requestedBy: 'admin-1' });
    expect(transaction.labRecordedImport.deleteMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ runId: null }),
    }));
    expect(transaction.labRun.deleteMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        releaseDecisions: { none: {} },
        experiments: { none: {} },
        recordedImport: null,
      }),
    }));
    expect(transaction.labExperiment).toBeUndefined();
    expect(transaction.labReleaseDecision).toBeUndefined();
  });

  it('returns paginated fixed-field operation logs without a content search surface', async () => {
    const service = new AgentLabService(prisma as any);
    prisma.labOperationLog.findMany.mockResolvedValue([{
      id: 'operation-1',
      actorId: 'admin-1',
      action: 'EXPERIMENT_CREATE',
      objectType: 'EXPERIMENT',
      objectId: 'experiment-1',
      outcome: 'SUCCEEDED',
      createdAt: new Date(),
    }]);
    prisma.labOperationLog.count.mockResolvedValue(2);

    await expect(service.operationLogs({
      action: 'EXPERIMENT_CREATE',
      outcome: 'SUCCEEDED',
      objectType: 'EXPERIMENT',
      page: '2',
      limit: '1',
    })).resolves.toMatchObject({
      page: 2,
      limit: 1,
      total: 2,
      hasMore: false,
      items: [{
        action: 'EXPERIMENT_CREATE',
        objectType: 'EXPERIMENT',
        objectId: 'experiment-1',
        outcome: 'SUCCEEDED',
      }],
    });
    expect(prisma.labOperationLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 1,
      take: 1,
      where: expect.objectContaining({
        action: 'EXPERIMENT_CREATE',
        outcome: 'SUCCEEDED',
        objectType: 'EXPERIMENT',
      }),
    }));
  });

  it('rejects arbitrary operation-log filters and does not persist raw request input', async () => {
    const service = new AgentLabService(prisma as any);
    await expect(service.operationLogs({ action: 'candidate answer copied here' }))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.submitRecordedImport({ ...validInput, inputHash: 'candidate answer copied here' }, 'admin-1'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.labOperationLog.findMany).not.toHaveBeenCalled();
    expect(JSON.stringify(prisma.labOperationLog.create.mock.calls)).not.toContain('candidate answer copied here');
  });
});
