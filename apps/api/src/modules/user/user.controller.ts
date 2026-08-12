import { Body, Controller, Get, Param, Post, Req, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

interface CreateUserDto {
  email: string;
  name?: string;
}

@Controller('user')
export class UserController {
  constructor(private prisma: PrismaService) {}

  @Post()
  async createUser(@Body() dto: CreateUserDto, @Req() req: any) {
    if (dto.email !== req.user.email) {
      throw new BadRequestException('Cannot modify another user');
    }
    return this.prisma.user.upsert({
      where: { email: dto.email },
      create: dto,
      update: dto,
    });
  }

  @Get(':id')
  async getUser(@Param('id') id: string, @Req() req: any) {
    if (id !== req.user.userId) throw new BadRequestException('Cannot access another user');
    return this.prisma.user.findUnique({ where: { id } });
  }

  @Get(':id/interviews')
  async getUserInterviews(@Param('id') id: string, @Req() req: any) {
    if (id !== req.user.userId) throw new BadRequestException('Cannot access another user');
    return this.prisma.interview.findMany({
      where: { userId: id },
      orderBy: { startedAt: 'desc' },
      include: { report: true },
    });
  }
}
