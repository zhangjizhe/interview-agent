import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

export type PiiActionType =
  | 'ACCESS'
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'EXPORT'
  | 'ANONYMIZE'
  | 'ENCRYPT'
  | 'DECRYPT';

export interface PiiAuditEntry {
  userId: string;
  action: PiiActionType;
  dataType: string;
  dataId?: string;
  fields?: string[];
  reason?: string;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class PiiAuditLogService {
  private readonly logger = new Logger(PiiAuditLogService.name);

  constructor(private prisma: PrismaService) {}

  async log(entry: PiiAuditEntry): Promise<void> {
    try {
      await this.prisma.piiAuditLog.create({
        data: {
          userId: entry.userId,
          action: entry.action,
          dataType: entry.dataType,
          dataId: entry.dataId,
          fields: entry.fields || [],
          reason: entry.reason,
          ip: entry.ip,
          userAgent: entry.userAgent,
        },
      });
    } catch (err: any) {
      this.logger.error(`PII audit log write failed: ${err.message}`);
    }
  }

  async logBulk(entries: PiiAuditEntry[]): Promise<void> {
    if (entries.length === 0) return;
    try {
      await this.prisma.piiAuditLog.createMany({
        data: entries.map((e) => ({
          userId: e.userId,
          action: e.action,
          dataType: e.dataType,
          dataId: e.dataId,
          fields: e.fields || [],
          reason: e.reason,
          ip: e.ip,
          userAgent: e.userAgent,
        })),
      });
    } catch (err: any) {
      this.logger.error(`PII audit log bulk write failed: ${err.message}`);
    }
  }

  async getUserLogs(
    userId: string,
    page = 1,
    pageSize = 20,
  ): Promise<{
    logs: Array<{
      id: string;
      action: string;
      dataType: string;
      dataId: string | null;
      fields: string[];
      reason: string | null;
      createdAt: Date;
    }>;
    total: number;
    page: number;
    pageSize: number;
  }> {
    const [logs, total] = await Promise.all([
      this.prisma.piiAuditLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          action: true,
          dataType: true,
          dataId: true,
          fields: true,
          reason: true,
          createdAt: true,
        },
      }),
      this.prisma.piiAuditLog.count({ where: { userId } }),
    ]);

    return { logs, total, page, pageSize };
  }
}
