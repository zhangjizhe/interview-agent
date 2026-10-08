jest.mock('../../infra/prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('./agent-runtime.service', () => ({ AgentRuntimeService: class {} }));
import 'reflect-metadata';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { validate } from 'class-validator';
import { EvaluationController } from './evaluation.controller';
import { StartEvaluationJobDto } from './dto/agent.dto';

describe('public evaluation job contract', () => {
  it('accepts a durable receipt with 202 and passes the authenticated identity', async () => {
    const jobs = { enqueue: jest.fn().mockResolvedValue({ id: 'job', status: 'PENDING' }) };
    const controller = new EvaluationController({} as any, jobs as any);
    const request = Object.assign(new StartEvaluationJobDto(), {
      datasetId: 'dataset', evaluatorId: 'evaluator', requestKey: 'synthetic-request-1',
    });
    expect(await validate(request)).toHaveLength(0);
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, controller.runEvaluation)).toBe(202);
    expect(await controller.runEvaluation({ user: { userId: 'admin' } }, 'agent', request))
      .toEqual({ id: 'job', status: 'PENDING' });
    expect(jobs.enqueue).toHaveBeenCalledWith('admin', 'agent', request);
  });
  it.each([undefined, '', 'short', '../invalid-request-key', 'x'.repeat(101)])('rejects invalid requestKey %s', async requestKey => {
    const request = Object.assign(new StartEvaluationJobDto(), { datasetId: 'dataset', evaluatorId: 'evaluator', requestKey });
    expect((await validate(request)).some(error => error.property === 'requestKey')).toBe(true);
  });
});
