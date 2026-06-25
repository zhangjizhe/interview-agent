import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  Param,
  UseGuards,
  Request,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DataSubjectRightsService } from './data-subject-rights.service';
import { PrivacyConsentService, ConsentType } from './privacy-consent.service';
import { PiiAuditLogService } from './audit-log.service';
import { DataRetentionService } from './data-retention.service';

@Controller('pii')
@UseGuards(JwtAuthGuard)
export class PiiController {
  private readonly logger = new Logger(PiiController.name);

  constructor(
    private dataSubjectRights: DataSubjectRightsService,
    private privacyConsent: PrivacyConsentService,
    private auditLog: PiiAuditLogService,
    private retention: DataRetentionService,
  ) {}

  @Get('me/export')
  async exportMyData(@Request() req: any) {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) throw new BadRequestException('User not authenticated');
    return this.dataSubjectRights.exportUserData(userId);
  }

  @Delete('me/account')
  async deleteMyAccount(@Request() req: any) {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) throw new BadRequestException('User not authenticated');
    return this.dataSubjectRights.deleteAccount(userId);
  }

  @Post('me/anonymize')
  async anonymizeMyAccount(@Request() req: any) {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) throw new BadRequestException('User not authenticated');
    return this.dataSubjectRights.anonymizeAccount(userId);
  }

  @Get('me/consents')
  async getMyConsents(@Request() req: any) {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) throw new BadRequestException('User not authenticated');
    return this.privacyConsent.getUserConsents(userId);
  }

  @Post('me/consents/:type')
  async giveConsent(
    @Request() req: any,
    @Param('consentType') consentType: ConsentType,
    @Body() body: { version: string },
  ) {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) throw new BadRequestException('User not authenticated');
    const ip = req.ip;
    const userAgent = req.headers['user-agent'];
    return this.privacyConsent.giveConsent(userId, consentType, body.version, ip, userAgent);
  }

  @Delete('me/consents/:consentType')
  async revokeConsent(@Request() req: any, @Param('consentType') consentType: ConsentType) {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) throw new BadRequestException('User not authenticated');
    await this.privacyConsent.revokeConsent(userId, consentType);
    return { revoked: true };
  }

  @Get('me/audit-log')
  async getMyAuditLog(
    @Request() req: any,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) throw new BadRequestException('User not authenticated');
    return this.auditLog.getUserLogs(
      userId,
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 20,
    );
  }

  @Get('retention/stats')
  async getRetentionStats() {
    return this.retention.getRetentionStats();
  }
}
