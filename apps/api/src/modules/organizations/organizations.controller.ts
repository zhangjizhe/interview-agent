import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import { IsString, Length } from 'class-validator';
import { Roles } from '../auth/roles.decorator';
import { OrganizationsService } from './organizations.service';

class CreateOrganizationDto {
  @IsString() @Length(1, 100) name: string;
}
class AssignMemberDto {
  @IsString() @Length(3, 32) userId: string;
}
@Controller('organizations')
@Roles('ADMIN')
export class OrganizationsController {
  constructor(private organizations: OrganizationsService) {}
  @Post()
  create(@Req() req: any, @Body() dto: CreateOrganizationDto) {
    return this.organizations.create(req.user, dto.name);
  }
  @Post(':organizationId/members')
  assign(@Req() req: any, @Param('organizationId') id: string, @Body() dto: AssignMemberDto) {
    return this.organizations.assign(req.user, id, dto.userId);
  }
}
