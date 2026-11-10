import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { DataGovernanceService } from './data-governance.service';
import { CreateDataCollectionDto, CreateDataRecordDto, DataGrantDto, DataPageDto, DeleteDataRecordDto, UpdateDataRecordDto } from './dto/data.dto';

@Controller('agent-lab/data-collections')
@Roles('ADMIN')
export class DataGovernanceController {
  constructor(private readonly data: DataGovernanceService) {}
  @Get() list(@Req() req: any, @Query() page: DataPageDto) { return this.data.list(req.user.userId, page); }
  @Post() create(@Req() req: any, @Body() dto: CreateDataCollectionDto) { return this.data.create(req.user.userId, dto); }
  @Delete(':id') archive(@Req() req: any, @Param('id') id: string) { return this.data.archive(req.user.userId, id); }
  @Get(':id/records') records(@Req() req: any, @Param('id') id: string, @Query() page: DataPageDto) { return this.data.records(req.user.userId, id, page); }
  @Post(':id/records') add(@Req() req: any, @Param('id') id: string, @Body() dto: CreateDataRecordDto) { return this.data.createRecord(req.user.userId, id, dto); }
  @Put(':id/records/:recordId') update(@Req() req: any, @Param('id') id: string, @Param('recordId') recordId: string, @Body() dto: UpdateDataRecordDto) { return this.data.updateRecord(req.user.userId, id, recordId, dto); }
  @Delete(':id/records/:recordId') remove(@Req() req: any, @Param('id') id: string, @Param('recordId') recordId: string, @Query() dto: DeleteDataRecordDto) { return this.data.deleteRecord(req.user.userId, id, recordId, dto.revision); }
  @Get(':id/records/:recordId/history') history(@Req() req: any, @Param('id') id: string, @Param('recordId') recordId: string, @Query() page: DataPageDto) { return this.data.history(req.user.userId, id, recordId, page); }
  @Get(':id/grants') grants(@Req() req: any, @Param('id') id: string, @Query() page: DataPageDto) { return this.data.grants(req.user.userId, id, page); }
  @Put(':id/grants') grant(@Req() req: any, @Param('id') id: string, @Body() dto: DataGrantDto) { return this.data.grant(req.user.userId, id, dto); }
  @Delete(':id/grants/:userId') revoke(@Req() req: any, @Param('id') id: string, @Param('userId') userId: string) { return this.data.revoke(req.user.userId, id, userId); }
  @Get(':id/audit') audit(@Req() req: any, @Param('id') id: string, @Query() page: DataPageDto) { return this.data.auditEvents(req.user.userId, id, page); }
}
