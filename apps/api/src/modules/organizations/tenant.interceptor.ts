import { CallHandler, ExecutionContext, Injectable, NestInterceptor, UnauthorizedException, HttpException } from '@nestjs/common';
import { Observable, map, catchError, throwError } from 'rxjs';
import { tenantContext, TenantScope } from './tenant-context';

@Injectable()
export class TenantInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const user = context.switchToHttp().getRequest().user;
    if (!user) return next.handle();
    if (!user.organizationId) throw new UnauthorizedException('Organization identity required');
    const scope: TenantScope = { organizationId: user.organizationId, userId: user.userId };
    const quotaError = () => scope.quotaFailure && new HttpException({ code: scope.quotaFailure.code, message: scope.quotaFailure.message }, scope.quotaFailure.status);
    return new Observable(subscriber => tenantContext.run(scope, () => {
      const subscription = next.handle().pipe(
        map(value => {
          const error = quotaError();
          if (error && !context.switchToHttp().getResponse().headersSent) throw error;
          return value;
        }),
        catchError(error => throwError(() => quotaError() || error)),
      ).subscribe(subscriber);
      return () => subscription.unsubscribe();
    }));
  }
}
