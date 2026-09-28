import { Module } from '@nestjs/common';
import { DecisionLedgerService } from './decision-ledger.service';

@Module({
  providers: [DecisionLedgerService],
  exports: [DecisionLedgerService],
})
export class InferenceModule {}
