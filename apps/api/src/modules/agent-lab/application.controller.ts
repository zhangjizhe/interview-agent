import { Roles } from '../auth/roles.decorator';
import { Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApplicationService } from './application.service';

@Controller('agent-lab/applications')
export class ApplicationController {
  constructor(private readonly applications: ApplicationService) {}

  @Post('bootstrap/interview')
  bootstrapInterview(@Req() req: any) {
    return this.applications.bootstrapInterviewApplication(req.user.userId);
  }

  @Get()
  list(@Req() req: any) {
    return this.applications.listApplications(req.user.userId);
  }

  @Get(':applicationId')
  get(@Req() req: any, @Param('applicationId') applicationId: string) {
    return this.applications.getApplication(req.user.userId, applicationId);
  }
}
