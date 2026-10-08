import { NotFoundException } from '@nestjs/common';
import { scopeQuery } from './tenant-policy';
import { tenantContext } from './tenant-context';

describe('组织查询边界', () => {
  const run = (fn: () => unknown) => tenantContext.run({ organizationId: 'org-a', userId: 'alice' }, fn);
  it('没有组织上下文时拒绝业务查询', () => {
    expect(() => scopeQuery('Interview', 'findMany', {})).toThrow();
  });
  it.each(['findMany', 'findFirst', 'findUnique', 'count', 'aggregate', 'updateMany', 'deleteMany'])('%s 强制组织过滤且不覆盖已有归属条件', action => run(() => {
    const args = scopeQuery('Interview', action, { where: { userId: 'alice', OR: [{ organizationId: 'org-b' }] } });
    expect(args.where.organizationId).toBe('org-a');
    expect(args.where.userId).toBe('alice');
  }));
  it('禁止伪造组织写入', () => run(() => {
    expect(() => scopeQuery('Run', 'create', { data: { organizationId: 'org-b' } })).toThrow(NotFoundException);
  }));
  it('禁止资源迁移组织', () => run(() => {
    expect(() => scopeQuery('Interview', 'update', { where: { id: 'i' }, data: { organizationId: 'org-b' } })).toThrow(NotFoundException);
  }));
  it('创建与嵌套创建均写入当前组织', () => run(() => {
    const args = scopeQuery('Workspace', 'create', { data: { members: { create: { userId: 'alice' } } } });
    expect(args.data.organizationId).toBe('org-a');
    expect(args.data.members.create.organizationId).toBe('org-a');
  }));
  it('upsert 的两条分支都不能跨组织', () => run(() => {
    const args = scopeQuery('Agent', 'upsert', { where: { id: 'a' }, create: { name: 'a' }, update: { name: 'a2' } });
    expect(args.where.organizationId).toBe('org-a');
    expect(args.create.organizationId).toBe('org-a');
  }));
  it('JSON 数据中的同名字段不被策略修改', () => run(() => {
    const args = scopeQuery('Run', 'create', { data: { input: { organizationId: 'example', create: {} } } });
    expect(args.data.input.organizationId).toBe('example');
    expect(args.data.input.create).toEqual({});
  }));
  it('并发上下文互不串用', async () => {
    const values = await Promise.all(['org-a', 'org-b'].map(organizationId => tenantContext.run({ organizationId, userId: 'u' }, async () => {
      await Promise.resolve();
      return scopeQuery('Run', 'findMany', {}).where.organizationId;
    })));
    expect(values).toEqual(['org-a', 'org-b']);
  });
});

describe('全局字典反向关系防泄漏', () => {
  it('字典 include 与 count 也限制组织', () => tenantContext.run({ organizationId: 'org-a' }, () => {
    const args = scopeQuery('SkillDefinition', 'findMany', { include: { questions: true, _count: { select: { questions: true } } } });
    expect(args.include.questions.where.organizationId).toBe('org-a');
    expect(args.include._count.select.questions.where.organizationId).toBe('org-a');
  }));
});
