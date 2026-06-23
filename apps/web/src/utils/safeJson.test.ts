import { describe, it, expect } from 'vitest';
import { safeJson } from './safeJson';

describe('safeJson', () => {
  it('parses valid JSON successfully', async () => {
    const res = new Response('{"foo": "bar"}', { status: 200 });
    const data = await safeJson(res);
    expect(data).toEqual({ foo: 'bar' });
  });

  it('parses JSON arrays', async () => {
    const res = new Response('[1, 2, 3]', { status: 200 });
    const data = await safeJson(res);
    expect(data).toEqual([1, 2, 3]);
  });

  it('returns empty object when body is empty string (200)', async () => {
    const res = new Response('', { status: 200 });
    const data = await safeJson(res);
    expect(data).toEqual({});
  });

  it('returns empty object when body is invalid JSON (200)', async () => {
    const res = new Response('not json{', { status: 200 });
    const data = await safeJson(res);
    expect(data).toEqual({});
  });

  it('returns _error marker when status is not ok (502)', async () => {
    const res = new Response('Bad Gateway', { status: 502 });
    const data = await safeJson(res);
    expect(data._error).toBe(true);
    expect(data._status).toBe(502);
    expect(data.message).toContain('502');
  });

  it('merges JSON body with _error when status is not ok', async () => {
    const res = new Response('{"error":"validation failed"}', { status: 400 });
    const data = await safeJson(res);
    expect(data._error).toBe(true);
    expect(data._status).toBe(400);
    expect(data.error).toBe('validation failed');
  });

  it('handles HTML error page (nginx 502)', async () => {
    const html = '<html><body><h1>502 Bad Gateway</h1></body></html>';
    const res = new Response(html, { status: 502 });
    const data = await safeJson(res);
    expect(data._error).toBe(true);
    expect(data._status).toBe(502);
    expect(data.message).toBe('服务不可用 (HTTP 502)');
  });

  it('handles 404 with JSON body', async () => {
    const res = new Response('{"message":"Not found"}', { status: 404 });
    const data = await safeJson(res);
    expect(data._error).toBe(true);
    expect(data._status).toBe(404);
    expect(data.message).toBe('Not found');
  });

  it('handles 500 with HTML error page', async () => {
    const html = '<html>Internal Server Error</html>';
    const res = new Response(html, { status: 500 });
    const data = await safeJson(res);
    expect(data._error).toBe(true);
    expect(data.message).toContain('500');
  });
});
