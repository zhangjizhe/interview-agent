import { Module } from '@nestjs/common';
import { EncryptionService } from './encryption.service';
import { DataClassifierService } from './data-classifier.service';
import { PiiAuditLogService } from './audit-log.service';
import { DataRetentionService } from './data-retention.service';
import { PrivacyConsentService } from './privacy-consent.service';
import { DataSubjectRightsService } from './data-subject-rights.service';
import { PiiController } from './pii.controller';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [PiiController],
  providers: [
    EncryptionService,
    DataClassifierService,
    PiiAuditLogService,
    DataRetentionService,
    PrivacyConsentService,
    DataSubjectRightsService,
  ],
  exports: [
    EncryptionService,
    DataClassifierService,
    PiiAuditLogService,
    DataRetentionService,
    PrivacyConsentService,
    DataSubjectRightsService,
  ],
})
export class PiiModule {}
