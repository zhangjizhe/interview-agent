import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { requireTenant, tenantContext } from './tenant-context';

const models = new Map(Prisma.dmmf.datamodel.models.map(model => [model.name, model]));
const scoped = (model: string) => models.get(model)?.fields.some(field => field.name === 'organizationId');
const reads = new Set(['findMany', 'findFirst', 'findFirstOrThrow', 'findUnique', 'findUniqueOrThrow', 'count', 'aggregate', 'groupBy', 'update', 'updateMany', 'delete', 'deleteMany', 'upsert']);

/** 数据库复合外键维护同组织引用；这里负责入口过滤和嵌套写入赋值。 */
function scopeData(model: string, data: any, organizationId: string, creating: boolean): any {
  if (Array.isArray(data)) return data.map(item => scopeData(model, item, organizationId, creating));
  if (!data || typeof data !== 'object') return data;
  const out = { ...data };
  if (scoped(model)) {
    if (out.organizationId !== undefined && out.organizationId !== organizationId) throw new NotFoundException('Resource not found');
    if (out.organization !== undefined) throw new NotFoundException('Resource not found');
    if (creating) out.organizationId = organizationId;
    else delete out.organizationId;
  }
  for (const field of models.get(model)?.fields || []) {
    if (field.kind !== 'object' || !out[field.name]) continue;
    const relation = { ...out[field.name] };
    // 只处理已知关系字段，JSON payload 不是关系，不能递归改写。
    if (relation.create) relation.create = scopeData(field.type, relation.create, organizationId, true);
    if (relation.createMany) relation.createMany = { ...relation.createMany, data: scopeData(field.type, relation.createMany.data, organizationId, true) };
    // 嵌套关联更新可绕过顶层 middleware；当前业务只需嵌套 create/connect，其他操作拒绝。
    for (const key of ['update', 'updateMany', 'upsert', 'delete', 'deleteMany', 'disconnect', 'set', 'connectOrCreate']) {
      if (relation[key] !== undefined) throw new NotFoundException('Unsupported nested mutation');
    }
    if (relation.connect && scoped(field.type)) {
      const addScope = (where: any) => ({ ...where, organizationId });
      relation.connect = Array.isArray(relation.connect) ? relation.connect.map(addScope) : addScope(relation.connect);
    }
    out[field.name] = relation;
  }
  return out;
}

function scopeSelection(model: string, args: any, organizationId: string): any {
  const out = { ...args };
  for (const key of ['include', 'select']) {
    if (!out[key]) continue;
    const selection = { ...out[key] };
    for (const field of models.get(model)?.fields || []) {
      if (field.kind !== 'object' || !selection[field.name]) continue;
      let relation = selection[field.name] === true ? {} : selection[field.name];
      if (field.isList && scoped(field.type)) relation = { ...relation, where: { ...relation.where, organizationId } };
      selection[field.name] = scopeSelection(field.type, relation, organizationId);
    }
    if (selection._count) {
      const count = selection._count === true ? {} : { ...selection._count.select };
      for (const field of models.get(model)?.fields || []) {
        if (field.kind === 'object' && field.isList && scoped(field.type) && (selection._count === true || count[field.name])) {
          count[field.name] = { where: { ...(typeof count[field.name] === 'object' ? count[field.name].where : {}), organizationId } };
        }
      }
      selection._count = { select: count };
    }
    out[key] = selection;
  }
  return out;
}

export function scopeQuery(model: string, action: string, input: any) {
  if (model === 'User' && !tenantContext.getStore()) return input;
  if (!scoped(model)) return tenantContext.getStore() ? scopeSelection(model, input, requireTenant().organizationId) : input;
  const { organizationId } = requireTenant();
  const args = { ...input };
  if (reads.has(action)) args.where = { ...args.where, organizationId };
  if (action === 'create' || action === 'createMany') args.data = scopeData(model, args.data, organizationId, true);
  if (action === 'update' || action === 'updateMany') args.data = scopeData(model, args.data, organizationId, false);
  if (action === 'upsert') {
    args.create = scopeData(model, args.create, organizationId, true);
    args.update = scopeData(model, args.update, organizationId, false);
  }
  // 全局字典的反向 include 可能暴露组织数据，由 middleware 下方统一处理。
  return scopeSelection(model, args, organizationId);
}

export const tenantMiddleware: Prisma.Middleware = async (params, next) => {
  if (!params.model) {
    if (tenantContext.getStore()) throw new NotFoundException('Raw queries are not available in tenant requests');
    return next(params);
  }
  params.args = scopeQuery(params.model, params.action, params.args || {});
  try { return await next(params); }
  catch (error: any) {
    if (['P2025', 'P2003'].includes(error?.code)) throw new NotFoundException('Resource not found');
    throw error;
  }
};
