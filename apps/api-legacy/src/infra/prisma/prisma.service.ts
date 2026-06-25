import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({ log: process.env.PRISMA_LOG === '1' ? [{ emit: 'event', level: 'query' }] : undefined });
    if (process.env.PRISMA_LOG === '1') {
      // @ts-ignore
      this.$on('query', (e: any) => {
        if (e.query.includes('session_cost')) {
          this.logger.warn(`[PRISMA] ${e.query.slice(0, 200)} params=${JSON.stringify(e.params).slice(0, 200)}`);
        }
      });
    }
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('✅ Prisma connected to database');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
