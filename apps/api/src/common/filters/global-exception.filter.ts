import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: any = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      message = typeof res === 'string' ? res : (res as any).message || res;
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    this.logger.error(
      `[${request.method} ${request.url}] ${status} - ${JSON.stringify(message)}`,
      exception instanceof Error ? exception.stack : undefined,
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
          path: request.url,
        })}\n\n`);
      } catch (writeErr) {
        this.logger.error(`SSE error write failed: ${writeErr.message}`);
      }
      response.end();
      return;
    }

    // 普通 HTTP 响应：保持原行为
    if (!headersSent) {
      response.status(status).json({
        statusCode: status,
        timestamp: new Date().toISOString(),
        path: request.url,
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
