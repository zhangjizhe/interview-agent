import { ServiceUnavailableException } from '@nestjs/common';
import { KnowledgeBaseService } from './knowledge-base.service';
import { DEFAULT_ORGANIZATION_ID, tenantCollection, tenantContext } from '../organizations/tenant-context';

describe('historical knowledge reads preserve unavailable/empty and organization boundaries', () => {
  const row = { itemId: 'historical-1', topic: 'LangGraph', number: 1, title: 'Checkpoint', body: 'Saved explanation', tags: ['state'] };
  function setup(scroll = jest.fn().mockResolvedValue({ points: [{ payload: row }] })) {
    const kb = new KnowledgeBaseService({} as any, { getClient: () => ({ scroll }) } as any);
    return { kb, scroll };
  }
  const scoped = <T>(organizationId: string, work: () => Promise<T>) => tenantContext.run({ organizationId }, async () => await work());

  it('reads existing Qdrant payload through the default organization without importing or embedding', async () => {
    const { kb, scroll } = setup();
    expect(await scoped(DEFAULT_ORGANIZATION_ID, () => kb.list(undefined, 200))).toEqual([{ id: row.itemId, topic: row.topic, number: 1, title: row.title, body: row.body, tags: row.tags }]);
    expect(scroll).toHaveBeenCalledWith('interview_knowledge_base', { limit: 200, filter: undefined, with_payload: true });
  });
  it.each(['list', 'listByTopic'] as const)('%s refuses a missing organization without reading global data', async operation => {
    const { kb, scroll } = setup();
    await expect(operation === 'list' ? kb.list() : kb.listByTopic('LangGraph')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(scroll).not.toHaveBeenCalled();
  });
  it('a real empty scroll remains an empty list', async () => {
    const { kb } = setup(jest.fn().mockResolvedValue({ points: [] }));
    expect(await scoped(DEFAULT_ORGANIZATION_ID, () => kb.list())).toEqual([]);
  });
  it.each(['list', 'listByTopic'] as const)('%s fails with503 rather than a successful empty result when storage is unavailable', async operation => {
    const { kb, scroll } = setup(jest.fn().mockRejectedValue(new Error('synthetic storage unavailable')));
    const read = () => operation === 'list' ? kb.list() : kb.listByTopic('LangGraph');
    await expect(scoped(DEFAULT_ORGANIZATION_ID, read)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(scroll).toHaveBeenCalledTimes(1);
  });
  it('topic reads and separate organizations use the authenticated collection without global fallback', async () => {
    const { kb, scroll } = setup();
    let expected = '';
    await scoped('organization-one', async () => { expected = tenantCollection('interview_knowledge_base'); await kb.listByTopic('LangGraph', 10); });
    await scoped('organization-two', () => kb.list(undefined, 20));
    expect(scroll.mock.calls[0]).toEqual([expected, { limit: 10, filter: { must: [{ key: 'topic', match: { value: 'LangGraph' } }] }, with_payload: true }]);
    expect(scroll.mock.calls[1][0]).not.toBe(expected);
    expect(scroll.mock.calls[1][0]).not.toBe('interview_knowledge_base');
  });
  it('cached source items stay organization-scoped and do not start vector or model work', async () => {
    const { kb, scroll } = setup();
    await scoped('organization-one', async () => {
      (kb as any).memoryCache = [{ id: 'cached', ...row }];
      expect(await kb.list('LangGraph', 10)).toHaveLength(1);
    });
    expect(scroll).not.toHaveBeenCalled();
    await scoped('organization-two', () => kb.list());
    expect(scroll).toHaveBeenCalledTimes(1);
  });
});
