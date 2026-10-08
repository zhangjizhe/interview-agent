import { Body, Controller, Param, Post, Patch, Req } from '@nestjs/common';
import { IsString, Length, IsInt, Min, Max } from 'class-validator';
import { Roles } from '../auth/roles.decorator';
import { OrganizationsService } from './organizations.service';

class CreateOrganizationDto {
  @IsString() @Length(1, 100) name: string;
}
class AssignMemberDto {
  @IsString() @Length(3, 32) userId: string;
}
class PlanLimitsDto {
  @IsInt() @Min(0) @Max(1000000) monthlyInterviews: number;
  @IsInt() @Min(0) @Max(10000000) monthlyLlmCalls: number;
  @IsInt() @Min(1024) @Max(1048576) maxInputBytes: number;
  @IsInt() @Min(1) @Max(32768) maxOutputTokens: number;
}
class AssignPlanDto {
  @IsString() @Length(1, 32) planId: string;
}
@Controller('organizations')
@Roles('ADMIN')
export class OrganizationsController {
  constructor(private organizations: OrganizationsService) {}
  @Post()
  create(@Req() req: any, @Body() dto: CreateOrganizationDto) {
    return this.organizations.create(req.user, dto.name);
  }
  @Patch('plans/:planId')
  configurePlan(@Req() req: any, @Param('planId') id: string, @Body() dto: PlanLimitsDto) {
    return this.organizations.configurePlan(req.user, id, dto);
  }
  @Patch(':organizationId/plan')
  assignPlan(@Req() req: any, @Param('organizationId') id: string, @Body() dto: AssignPlanDto) {
    return this.organizations.assignPlan(req.user, id, dto.planId);
  }
  @Post(':organizationId/members')
  assign(@Req() req: any, @Param('organizationId') id: string, @Body() dto: AssignMemberDto) {
    return this.organizations.assign(req.user, id, dto.userId);
  }
}
