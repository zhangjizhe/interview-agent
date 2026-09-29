import { BadRequestException, Logger } from '@nestjs/common';
import { GlobalExceptionFilter } from '../common/filters/global-exception.filter';

describe('异常响应脱敏', () => {
  beforeEach(() => { jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {}); });
  afterEach(() => jest.restoreAllMocks());
  function run(error: unknown, headersSent = false, sse = false) {
    const res: any = { headersSent, getHeader: () => sse ? 'text/event-stream' : 'application/json', status: jest.fn().mockReturnThis(), json: jest.fn(), write: jest.fn(), end: jest.fn() };
    const host: any = { switchToHttp: () => ({ getResponse: () => res, getRequest: () => ({ method: 'GET', url: '/api/test?token=private', path: '/api/test' }) }) };
    new GlobalExceptionFilter().catch(error, host); return res;
  }
  it('普通异常只返回统一 500，不返回内部 message', () => {
    const res = run(new Error('database password=secret'));
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Internal server error', path: '/api/test' }));
    expect(JSON.stringify(res.json.mock.calls)).not.toContain('secret');
  });
  it('SSE 错误不重新写 HTTP header 且隐藏内部异常', () => {
    const res = run(new Error('private internal detail'), true, true);
    expect(res.status).not.toHaveBeenCalled(); expect(res.end).toHaveBeenCalled();
    expect(res.write.mock.calls[0][0]).toContain('Internal server error');
    expect(res.write.mock.calls[0][0]).not.toContain('private');
  });
  it('已发非 SSE 响应也不泄漏', () => {
    const res = run(new Error('secret'), true);
    expect(res.write.mock.calls[0][0]).not.toContain('secret'); expect(res.end).toHaveBeenCalled();
  });
  it('保留业务异常状态与安全错误码', () => {
    const res = run(new BadRequestException({ message: '输入无效', code: 'INVALID_INPUT' }));
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVALID_INPUT', message: '输入无效' }));
  });
  it('服务端日志保留路径和异常堆栈', () => {
    run(new Error('failure'));
    expect(Logger.prototype.error).toHaveBeenCalledWith(expect.stringContaining('/api/test'), expect.stringContaining('Error: failure'));
  });
  it('非 Error 抛出值也返回统一错误', () => { const res = run({ internal: 'secret' }); expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Internal server error' })); });
});
