import { OrganizationsService } from './organizations.service';

describe('组织管理员指派', () => {
  const actor = { userId: 'platform-admin', role: 'ADMIN' };
  const config = { get: () => ['platform-admin'] } as any;
  it('普通组织 ADMIN 不能跨组织指派', async () => {
    const service = new OrganizationsService({} as any, config);
    await expect(service.assign({ userId: 'other-admin', role: 'ADMIN' }, 'org', 'user')).rejects.toMatchObject({ status: 403 });
  });
  it('普通用户即使在配置名单也不能指派', async () => {
    const service = new OrganizationsService({} as any, config);
    await expect(service.create({ ...actor, role: 'USER' }, 'org')).rejects.toMatchObject({ status: 403 });
  });
  it('未找到成员或组织统一返回 404', async () => {
    const service = new OrganizationsService({ organization: { findUnique: async () => null }, user: { findUnique: async () => null } } as any, config);
    await expect(service.assign(actor, 'missing', 'user')).rejects.toMatchObject({ status: 404 });
  });
  it('已有数据阻止移动并返回可操作的 409', async () => {
    const service = new OrganizationsService({ organization: { findUnique: async () => ({ id: 'b' }) }, user: { findUnique: async () => ({ id: 'u' }), update: async () => { throw { code: 'P2003' }; } } } as any, config);
    await expect(service.assign(actor, 'b', 'u')).rejects.toMatchObject({ status: 409 });
  });
});
