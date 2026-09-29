import { createHash } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { ServiceUnavailableException } from '@nestjs/common';

export const DEFAULT_ORGANIZATION_ID = 'default-organization';
export type TenantScope = { organizationId: string; userId?: string; quotaFailure?: { status: number; code: string; message: string } };
export const tenantContext = new AsyncLocalStorage<TenantScope>();

/** 只能由已认证的数据库身份或显式后台任务建立，绝不消费请求体/请求头的组织 ID。 */
export function requireTenant(): TenantScope {
  const scope = tenantContext.getStore();
  if (!scope?.organizationId) throw new ServiceUnavailableException('Organization context required');
  return scope;
}

export function tenantCollection(base: string): string {
  const { organizationId } = requireTenant();
  return organizationId === DEFAULT_ORGANIZATION_ID ? base : `${base}_${createHash('sha256').update(organizationId).digest('hex').slice(0, 32)}`;
}
