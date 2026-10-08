import { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service';
import { DEFAULT_ORGANIZATION_ID, tenantCollection, tenantContext } from './tenant-context';

describe('知识库组织隔离', () => {
  const run = (organizationId: string, fn: () => any) => tenantContext.run({ organizationId }, fn);
  it('旧集合仅属于默认组织，新组织生成稳定且不同的集合', () => {
    expect(run(DEFAULT_ORGANIZATION_ID, () => tenantCollection('knowledge'))).toBe('knowledge');
    const a = run('a', () => tenantCollection('knowledge'));
    expect(a).not.toBe(run('b', () => tenantCollection('knowledge')));
    expect(a).toBe(run('a', () => tenantCollection('knowledge')));
  });
  it('无身份不能退回旧全局集合', () => {
    expect(() => tenantCollection('knowledge')).toThrow();
  });
  it('内存兜底与统计不会共享其他组织数据', async () => {
    const kb = new KnowledgeBaseService({} as any, {} as any);
    await run('a', async () => {
      (kb as any).memoryCache = [{ id: 'secret', topic: 'test', title: 'secret', body: 'private', tags: [] }];
      expect((await kb.list()).length).toBe(1);
    });
    await run('b', async () => {
      expect(kb.getStats().cachedItems).toBe(0);
      expect((kb as any).fallbackMemorySearch('secret', undefined, 5)).toEqual([]);
    });
  });
  it('向量检索也使用当前组织集合', async () => {
    const search = jest.fn().mockResolvedValue([]);
    const kb = new KnowledgeBaseService({} as any, { getClient: () => ({ search }) } as any);
    (kb as any).enabled = true;
    (kb as any).embedOne = async () => [1];
    await run('a', () => kb.recall('fixture'));
    await run('b', () => kb.recall('fixture'));
    expect(search.mock.calls[0][0]).not.toBe(search.mock.calls[1][0]);
  });
});
