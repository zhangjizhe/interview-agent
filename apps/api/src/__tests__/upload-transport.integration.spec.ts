import { Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';

@Controller('fixture-upload')
class UploadFixture {
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 16 } }))
  upload(@UploadedFile() file: any) { return { bytes: file?.size, name: file?.originalname }; }
}

describe('NestJS multipart transport with pinned Multer', () => {
  let app: any, url: string;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [UploadFixture] }).compile();
    app = module.createNestApplication(); await app.listen(0, '127.0.0.1'); url = await app.getUrl();
  });
  afterAll(async () => { await app?.close(); });
  it('keeps memory-backed multipart upload compatible with NestJS 10', async () => {
    const body = new FormData(); body.append('file', new Blob(['synthetic']), 'fixture.md');
    const response = await fetch(`${url}/fixture-upload`, { method: 'POST', body });
    expect(response.status).toBe(201); expect(await response.json()).toEqual({ bytes: 9, name: 'fixture.md' });
  });
  it('enforces configured file limits instead of accepting oversized payloads', async () => {
    const body = new FormData(); body.append('file', new Blob(['x'.repeat(17)]), 'fixture.md');
    expect((await fetch(`${url}/fixture-upload`, { method: 'POST', body })).status).toBe(413);
  });
  it('fails malformed multipart input within a bounded request', async () => {
    const response = await fetch(`${url}/fixture-upload`, {
      method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=fixture-boundary' },
      body: 'malformed fixture', signal: AbortSignal.timeout(3000),
    });
    expect(response.status).toBe(400);
  });
});
