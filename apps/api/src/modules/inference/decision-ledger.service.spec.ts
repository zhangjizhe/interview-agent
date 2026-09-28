import { DecisionDomain } from '@prisma/client';
import { DecisionLedgerService } from './decision-ledger.service';

function createPrismaMock() {
  return {
    decisionRecord: {
      create: jest.fn().mockResolvedValue({ id: 'decision-1' }),
    },
    factAssertion: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

describe('DecisionLedgerService', () => {
  it('appends a decision with facts and evidence without mutating prior records', async () => {
    const prisma = createPrismaMock();
    const service = new DecisionLedgerService(prisma as any);

    await service.record({
      domain: DecisionDomain.INTERVIEW,
      decisionType: 'interview.routing',
      subjectType: 'INTERVIEW_TASK',
      subjectId: 'task-1',
      outcome: { createFollowUp: true },
      ruleSetVersion: 'interview-routing/v1',
      inputSnapshot: { score: 0.3 },
      facts: [
        {
          subjectType: 'INTERVIEW_TASK',
          subjectId: 'task-1',
          predicate: 'routing.outcome',
          value: { createFollowUp: true },
        },
      ],
      evidence: [
        {
          kind: 'RULE_EVALUATION',
          sourceType: 'INTERVIEW_ROUTING',
          payload: { matchedRules: ['IR-001'] },
        },
      ],
    });

    expect(prisma.decisionRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          inputHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          facts: expect.objectContaining({ create: expect.any(Array) }),
          evidence: expect.objectContaining({ create: expect.any(Array) }),
        }),
      }),
    );
    expect(prisma.decisionRecord.update).toBeUndefined();
  });

  it('queries facts valid at a requested point in time', async () => {
    const prisma = createPrismaMock();
    const service = new DecisionLedgerService(prisma as any);
    const at = new Date('2026-08-20T12:00:00.000Z');

    await service.listFactsAt('AGENT_VERSION', 'version-1', at);

    expect(prisma.factAssertion.findMany).toHaveBeenCalledWith({
      where: {
        subjectType: 'AGENT_VERSION',
        subjectId: 'version-1',
        validFrom: { lte: at },
        OR: [{ validTo: null }, { validTo: { gt: at } }],
      },
      orderBy: [{ validFrom: 'asc' }, { recordedAt: 'asc' }],
    });
  });

  it('returns a version decision snapshot constrained by effective time', async () => {
    const prisma = createPrismaMock();
    prisma.decisionRecord.findMany = jest.fn().mockResolvedValue([]);
    const service = new DecisionLedgerService(prisma as any);
    const at = new Date('2026-08-20T12:00:00.000Z');

    await service.listDecisionsAt('version-1', at);

    expect(prisma.decisionRecord.findMany).toHaveBeenCalledWith({
      where: {
        agentVersionId: 'version-1',
        effectiveAt: { lte: at },
      },
      include: { facts: true, evidence: true },
      orderBy: { recordedAt: 'desc' },
    });
  });
});
