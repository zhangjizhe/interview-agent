/**
 * Qdrant 客户端 - v13 已有 SDK 但没用上，这里封装成单例 Service
 *
 * 用法：getClient() 拿到原 QdrantClient；高层操作通过 semantic-cache.service
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QdrantClient } from '@qdrant/js-client-rest';

@Injectable()
export class QdrantService implements OnModuleInit {
  private readonly logger = new Logger(QdrantService.name);
  private client: QdrantClient;

  constructor(private config: ConfigService) {}

  async onModuleInit() {
    const url = this.config.get<string>('qdrant.url') || 'http://localhost:6333';
    this.client = new QdrantClient({ url, timeout: 5000 });
    this.logger.log(`✅ Qdrant client initialized at ${url}`);
  }

  getClient(): QdrantClient {
    return this.client;
  }
}
