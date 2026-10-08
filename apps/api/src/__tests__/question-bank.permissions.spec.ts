jest.mock('@zilliz/milvus2-sdk-node', () => ({}));
jest.mock('../modules/llm/llm.gateway.service', () => ({ LlmGatewayService: class {} }));
jest.mock('../modules/interview/services/resume-rag.service', () => ({ ResumeRAGService: class {} }));
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../modules/auth/roles.guard';
import { QuestionBankController } from '../modules/interview/controllers/question-bank.controller';

describe('question bank administrative read boundary', () => {
  const guard = new RolesGuard(new Reflector());
  it.each(['searchQuestionBank', 'listQuestionBank'])('%s refuses USER and unauthenticated callers', handler => {
    const context = (role?: string): any => ({ getHandler: () => QuestionBankController.prototype[handler], getClass: () => QuestionBankController,
      switchToHttp: () => ({ getRequest: () => ({ user: role ? { role } : undefined }) }) });
    expect(() => guard.canActivate(context())).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context('USER'))).toThrow(ForbiddenException);
    expect(guard.canActivate(context('ADMIN'))).toBe(true);
  });
  it('does not return HTTP success when the backing service failed to delete', async () => {
    const controller = new QuestionBankController({ deleteQuestion: jest.fn().mockResolvedValue({ deleted: false }) } as any, {} as any, {} as any, {} as any);
    await expect(controller.deleteQuestionBank('synthetic-question')).rejects.toMatchObject({ status: 503 });
  });
});
