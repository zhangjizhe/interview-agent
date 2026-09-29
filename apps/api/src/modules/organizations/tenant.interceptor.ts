import { CallHandler, ExecutionContext, Injectable, NestInterceptor, UnauthorizedException } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tenantContext } from './tenant-context';

@Injectable()
export class TenantInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const user = context.switchToHttp().getRequest().user;
    if (!user) return next.handle();
    if (!user.organizationId) throw new UnauthorizedException('Organization identity required');
    return new Observable(subscriber => tenantContext.run({ organizationId: user.organizationId, userId: user.userId }, () => {
      const subscription = next.handle().subscribe(subscriber);
      return () => subscription.unsubscribe();
    }));
  }
}
