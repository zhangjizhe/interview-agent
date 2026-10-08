import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { TenantInterceptor } from './tenant.interceptor';
@Module({
  controllers: [OrganizationsController],
  providers: [OrganizationsService, { provide: APP_INTERCEPTOR, useClass: TenantInterceptor }],
})
export class OrganizationsModule {}
