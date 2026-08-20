import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import { DecisionDomain } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

export type FactAssertionInput = {
  subjectType: string;
  subjectId: string;
  predicate: string;
  value: Record<string, unknown>;
  polarity?: boolean;
  validFrom?: Date;
  validTo?: Date;
  sourceType?: string;
  sourceId?: string;
};

export type DecisionEvidenceInput = {
  kind: string;
  sourceType: string;
  sourceId?: string;
  payload?: Record<string, unknown>;
};

export type RecordDecisionInput = {
  domain: DecisionDomain;
  decisionType: string;
  subjectType: string;
  subjectId: string;
  outcome: Record<string, unknown>;
  ruleSetVersion: string;
  inputSnapshot: Record<string, unknown>;
  actorId?: string;
  interviewId?: string;
  agentId?: string;
  agentVersionId?: string;
  effectiveAt?: Date;
  facts?: FactAssertionInput[];
  evidence?: DecisionEvidenceInput[];
};

@Injectable()
export class DecisionLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordDecisionInput) {
    const inputHash = this.hash(input.inputSnapshot);
    return this.prisma.decisionRecord.create({
      data: {
        domain: input.domain,
        decisionType: input.decisionType,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        outcome: input.outcome as any,
        ruleSetVersion: input.ruleSetVersion,
        inputSnapshot: input.inputSnapshot as any,
        inputHash,
        effectiveAt: input.effectiveAt,
        actorId: input.actorId,
        interviewId: input.interviewId,
        agentId: input.agentId,
        agentVersionId: input.agentVersionId,
        facts: input.facts?.length
          ? {
              create: input.facts.map((fact) => ({
                subjectType: fact.subjectType,
                subjectId: fact.subjectId,
                predicate: fact.predicate,
                value: fact.value as any,
                polarity: fact.polarity,
                validFrom: fact.validFrom,
                validTo: fact.validTo,
                sourceType: fact.sourceType,
                sourceId: fact.sourceId,
              })),
            }
          : undefined,
        evidence: input.evidence?.length
          ? {
              create: input.evidence.map((evidence) => ({
                kind: evidence.kind,
                sourceType: evidence.sourceType,
                sourceId: evidence.sourceId,
                payload: evidence.payload as any,
                contentHash: evidence.payload ? this.hash(evidence.payload) : undefined,
              })),
            }
          : undefined,
      },
      include: {
        facts: true,
        evidence: true,
      },
    });
  }

  async listFactsAt(
    subjectType: string,
    subjectId: string,
    at: Date = new Date(),
  ) {
    return this.prisma.factAssertion.findMany({
      where: {
        subjectType,
        subjectId,
        validFrom: { lte: at },
        OR: [{ validTo: null }, { validTo: { gt: at } }],
      },
      orderBy: [{ validFrom: 'asc' }, { recordedAt: 'asc' }],
    });
  }

  async listDecisionsAt(
    agentVersionId: string,
    at: Date = new Date(),
  ) {
    return this.prisma.decisionRecord.findMany({
      where: {
        agentVersionId,
        effectiveAt: { lte: at },
      },
      include: {
        facts: true,
        evidence: true,
      },
      orderBy: { recordedAt: 'desc' },
    });
  }

  private hash(value: Record<string, unknown>) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }
}
