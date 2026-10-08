import { MetricsService } from '../../modules/metrics/metrics.service';
import { SsrfBlockedException } from '../../modules/interview/controllers/external-url.util';
import { redactTelemetry } from '../../infra/langfuse/redact';
import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(private metrics?: MetricsService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    if (exception instanceof SsrfBlockedException) this.metrics?.reject('ssrf');
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestPath = request.path || request.url.split('?')[0];

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: any = 'Internal server error';
    let code: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'object' && typeof (res as any).code === 'string') code = (res as any).code;
      message = typeof res === 'string' ? res : (res as any).message || res;
    }

    this.logger.error(
      `[${request.method} ${requestPath}] ${status} - ${JSON.stringify(redactTelemetry(exception instanceof Error ? exception.name : exception))}`,
      exception instanceof Error ? redactTelemetry(exception.stack || exception.message)
        .replace(/(password|secret|token|api[_-]?key)\s*[=:]\s*[^\s,;]+/gi, '$1=[REDACTED]') : undefined,
    );

    // SSE 流检测：headers 已发（Content-Type: text/event-stream）时不能再 setHeader
    // 否则会抛 ERR_HTTP_HEADERS_SENT，整个流被中断
    const headersSent = response.headersSent;
    const contentType = response.getHeader?.('Content-Type') as string | undefined;
    const isSse = headersSent && contentType?.includes('text/event-stream');

    if (isSse) {
      // 写 SSE error event + 关闭流，不 setHeader
      try {
        response.write(`data: ${JSON.stringify({
          type: 'error',
          statusCode: status,
          message,
          error: message,
          ...(code ? { code } : {}),
          path: requestPath,
        })}\n\n`);
      } catch (writeErr) {
        this.logger.error('SSE error write failed');
      }
      response.end();
      return;
    }

    // 普通 HTTP 响应：保持原行为
    if (!headersSent) {
      response.status(status).json({
        statusCode: status,
        ...(code ? { code } : {}),
        timestamp: new Date().toISOString(),
        path: requestPath,
        message,
      });
    } else {
      // headers 已发但不是 SSE — 尽力写一些错误信息后 end
      try {
        response.write(JSON.stringify({ statusCode: status, message }));
      } catch {
        // ignore
      }
      response.end();
    }
  }
}
