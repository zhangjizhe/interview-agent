import { ExecutionContext, HttpException, HttpStatus, Injectable, SetMetadata } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { InjectThrottlerOptions, InjectThrottlerStorage, ThrottlerGuard, ThrottlerModuleOptions, ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerRequest } from '@nestjs/throttler/dist/throttler.guard.interface';

const POLICY = 'security:rate-limit';
export const RateLimitPolicy = (policy: 'auth' | 'sse') => SetMetadata(POLICY, policy);

@Injectable()
export class SecurityThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector,
    private readonly config: ConfigService,
  ) { super(options, storage, reflector); }

  protected handleRequest(request: ThrottlerRequest): Promise<boolean> {
    const policy = this.reflector.getAllAndOverride<string>(POLICY, [request.context.getHandler(), request.context.getClass()]);
    const limit = policy === 'auth'
      ? this.config.get<number>('throttler.authLimit', 10)
      : policy === 'sse' ? this.config.get<number>('throttler.sseLimit', 20) : request.limit;
    // SSE 只在进入控制器前计一次；不按 token/心跳计数，也不关闭已建立的连接。
    return super.handleRequest({ ...request, limit });
  }

  protected async throwThrottlingException(_context: ExecutionContext): Promise<void> {
    throw new HttpException({ code: 'RATE_LIMIT_EXCEEDED', message: '请求过于频繁，请稍后重试。' }, HttpStatus.TOO_MANY_REQUESTS);
  }
}
