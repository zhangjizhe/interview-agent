import { Controller, Get, Req } from '@nestjs/common';
import { UsageService } from './usage.service';

@Controller('usage')
export class UsageController {
  constructor(private usage: UsageService) {}

  @Get('summary')
  async summary(@Req() req: any) {
    return this.usage.summary(req.user.userId);
  }
}
