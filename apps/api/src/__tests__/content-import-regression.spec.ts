import { BadRequestException } from '@nestjs/common';

// QuestionBankController imports the Milvus-backed service. The controller
// tests inject a stub service, so loading the SDK only introduces unrelated
// ESM parsing work in Jest.
jest.mock('@zilliz/milvus2-sdk-node', () => ({}));
jest.mock('../modules/llm/llm.gateway.service', () => ({
  LlmGatewayService: class LlmGatewayService {},
}));
jest.mock('../modules/interview/services/resume-rag.service', () => ({
  ResumeRAGService: class ResumeRAGService {},
}));

import { ResumeParserService } from '../modules/interview/services/resume-parser.service';
import { QuestionBankController } from '../modules/interview/controllers/question-bank.controller';
import { ResumeController } from '../modules/interview/controllers/resume.controller';

describe('content import regressions', () => {
  it('removes Markdown heading syntax from a resume name', async () => {
    const parser = new ResumeParserService();

    const parsed = await parser.parse('# Li Ming\nEmail: liming@example.com\nTypeScript React Redis');

    expect(parsed.name).toBe('Li Ming');
  });

  it('rejects empty and unsupported resume uploads before parsing', async () => {
    const controller = new ResumeController({} as any, {} as any, {} as any, {} as any);
    const req = { user: { userId: 'user-1' } };

    await expect(controller.uploadResume(
      { size: 0, originalname: 'resume.md', mimetype: 'text/markdown' },
      '前端开发工程师',
      req,
    )).rejects.toBeInstanceOf(BadRequestException);

    await expect(controller.uploadResume(
      { size: 42, originalname: 'resume.docx', mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      '前端开发工程师',
      req,
    )).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns a 400 instead of a false-success response when URL extraction yields no questions', async () => {
    const questionBank = {
      importQuestions: jest.fn().mockResolvedValue({ count: 0, questionIds: [] }),
    };
    const controller = new QuestionBankController(
      questionBank as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => '<html><head><title>Empty</title></head><body>No useful content</body></html>',
    }) as any;

    await expect(controller.importQuestionBankUrl({
      url: 'https://example.com/docs',
      position: '前端开发工程师',
    })).rejects.toBeInstanceOf(BadRequestException);

    global.fetch = originalFetch;
  });

  it('passes title and document content to URL extraction', async () => {
    const questionBank = {
      importQuestions: jest.fn().mockResolvedValue({ count: 1, questionIds: ['q-1'] }),
    };
    const controller = new QuestionBankController(
      questionBank as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => '<html><head><title>TypeScript Union Types</title></head><body><article>Union types model multiple possible values.</article></body></html>',
    }) as any;

    await expect(controller.importQuestionBankUrl({
      url: 'https://example.com/types',
      position: '前端开发工程师',
      level: 'P5',
      category: 'TypeScript',
    })).resolves.toMatchObject({ success: true, count: 1 });

    expect(questionBank.importQuestions).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('文档标题：TypeScript Union Types'),
      position: '前端开发工程师',
      level: 'P5',
      category: 'TypeScript',
    }));
    global.fetch = originalFetch;
  });
});
