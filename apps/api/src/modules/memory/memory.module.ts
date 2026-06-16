import { Module } from '@nestjs/common';
import { RedisShortTermMemory } from './short-term/redis-memory.store';
import { MilvusLongTermMemory } from './long-term/milvus-memory.store';
import { Mem0CloudMemory } from './long-term/mem0.store';
import { MemoryService } from './memory.service';

@Module({
  providers: [
    RedisShortTermMemory,
    MilvusLongTermMemory,
    Mem0CloudMemory,
    MemoryService,
  ],
  exports: [MemoryService, MilvusLongTermMemory, Mem0CloudMemory],
})
export class MemoryModule {}