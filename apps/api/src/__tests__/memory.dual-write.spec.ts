// Current MemoryService contract; synthetic stores, no provider calls.
jest.mock('../modules/memory/long-term/milvus-memory.store', () => ({ MilvusLongTermMemory: class {} }));
import { MemoryService } from '../modules/memory/memory.service';
import { RedisShortTermMemory } from '../modules/memory/short-term/redis-memory.store';
import { ConfigService } from '@nestjs/config';

describe('memory dual writes and working-state persistence', () => {
  it.each(['milvus', 'mem0', 'both'])('attempts both stores when %s fails, without losing the other write', async failing => {
    const milvus = { memorize: jest.fn().mockResolvedValue(undefined) };
    const mem0 = { memorize: jest.fn().mockResolvedValue(undefined) };
    if (failing !== 'mem0') milvus.memorize.mockRejectedValue(new Error('synthetic outage'));
    if (failing !== 'milvus') mem0.memorize.mockRejectedValue(new Error('synthetic outage'));
    const service = new MemoryService({} as any, milvus as any, mem0 as any);
    const messages = [{ role: 'user' as const, content: 'Synthetic engineering evidence' }];
    await expect(service.memorize('fixture', messages)).resolves.toBeUndefined();
    expect(milvus.memorize).toHaveBeenCalledWith('fixture', messages, 'conversation');
    expect(mem0.memorize).toHaveBeenCalledWith('fixture', messages);
  });
  it('round trips working state through the real Redis store serializer', async () => {
    const hashes = new Map<string, any>();
    const redis: any = { hgetall: jest.fn(async key => hashes.get(key) || {}), hmset: jest.fn(async (key, value) => { hashes.set(key, value); }), expire: jest.fn() };
    const store = new RedisShortTermMemory(redis, new ConfigService({ redis: { sessionTtl: 3600 } }));
    const service = new MemoryService(store, {} as any, {} as any);
    expect(await service.getWorkingState('fixture')).toEqual({});
    await service.setWorkingState('fixture', { questionIndex: 0, coveredSkills: ['RAG'] });
    await service.updateWorkingState('fixture', { questionIndex: 1 });
    expect(await service.getWorkingState('fixture')).toMatchObject({ questionIndex: 1, coveredSkills: ['RAG'] });
    redis.hmset.mockRejectedValueOnce(new Error('unavailable'));
    await expect(service.updateWorkingState('fixture', { questionIndex: 2 })).rejects.toThrow('unavailable');
  });
});
