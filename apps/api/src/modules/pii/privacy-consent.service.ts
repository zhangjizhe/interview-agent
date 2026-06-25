import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

export type ConsentType = 'PRIVACY_POLICY' | 'DATA_PROCESSING' | 'MARKETING' | 'COOKIES';

@Injectable()
export class PrivacyConsentService {
  private readonly logger = new Logger(PrivacyConsentService.name);

  constructor(private prisma: PrismaService) {}

  async giveConsent(
    userId: string,
    consentType: ConsentType,
    version: string,
    ip?: string,
    userAgent?: string,
  ): Promise<{ accepted: boolean; acceptedAt: Date; version: string }> {
    const consent = await this.prisma.privacyConsent.upsert({
      where: {
        userId_consentType: { userId, consentType },
      },
      update: {
        accepted: true,
        acceptedAt: new Date(),
        version,
        ip,
        userAgent,
      },
      create: {
        userId,
        consentType,
        accepted: true,
        acceptedAt: new Date(),
        version,
        ip,
        userAgent,
      },
    });

    this.logger.log(`Consent ${consentType} v${version} given by user ${userId}`);
    return { accepted: consent.accepted, acceptedAt: consent.acceptedAt, version: consent.version };
  }

  async revokeConsent(userId: string, consentType: ConsentType): Promise<void> {
    await this.prisma.privacyConsent.upsert({
      where: {
        userId_consentType: { userId, consentType },
      },
      update: {
        accepted: false,
        revokedAt: new Date(),
      },
      create: {
        userId,
        consentType,
        accepted: false,
        revokedAt: new Date(),
      },
    });

    this.logger.log(`Consent ${consentType} revoked by user ${userId}`);
  }

  async hasConsent(userId: string, consentType: ConsentType, minVersion?: string): Promise<boolean> {
    const consent = await this.prisma.privacyConsent.findUnique({
      where: { userId_consentType: { userId, consentType } },
    });

    if (!consent || !consent.accepted) return false;
    if (minVersion && consent.version < minVersion) return false;
    return true;
  }

  async getUserConsents(userId: string): Promise<
    Array<{
      consentType: string;
      accepted: boolean;
      version: string;
      acceptedAt: Date | null;
      revokedAt: Date | null;
    }>
  > {
    const consents = await this.prisma.privacyConsent.findMany({
      where: { userId },
      select: {
        consentType: true,
        accepted: true,
        version: true,
        acceptedAt: true,
        revokedAt: true,
      },
    });
    return consents;
  }

  async requireConsent(userId: string, consentType: ConsentType, minVersion?: string): Promise<void> {
    const hasConsent = await this.hasConsent(userId, consentType, minVersion);
    if (!hasConsent) {
      throw new BadRequestException(
        `Consent required: ${consentType}${minVersion ? ` (min version: ${minVersion})` : ''}`,
      );
    }
  }

  async getConsentHistory(
    userId: string,
    consentType?: ConsentType,
  ): Promise<
    Array<{
      consentType: string;
      action: string;
      version: string;
      timestamp: Date;
    }>
  > {
    const consents = await this.prisma.privacyConsent.findMany({
      where: { userId, ...(consentType ? { consentType } : {}) },
      orderBy: { acceptedAt: 'desc' },
    });

    const history: Array<{ consentType: string; action: string; version: string; timestamp: Date }> = [];
    for (const c of consents) {
      if (c.acceptedAt) {
        history.push({
          consentType: c.consentType,
          action: 'ACCEPTED',
          version: c.version,
          timestamp: c.acceptedAt,
        });
      }
      if (c.revokedAt) {
        history.push({
          consentType: c.consentType,
          action: 'REVOKED',
          version: c.version,
          timestamp: c.revokedAt,
        });
      }
    }

    history.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return history;
  }
}
