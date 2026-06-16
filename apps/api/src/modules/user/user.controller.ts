import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

interface CreateUserDto {
  email: string;
  name?: string;
}

@Controller('user')
export class UserController {
  constructor(private prisma: PrismaService) {}

  @Post()
  async createUser(@Body() dto: CreateUserDto) {
    return this.prisma.user.upsert({
      where: { email: dto.email },
      create: dto,
      update: dto,
    });
  }

  @Get(':id')
  async getUser(@Param('id') id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  @Get(':id/interviews')
  async getUserInterviews(@Param('id') id: string) {
    return this.prisma.interview.findMany({
      where: { userId: id },
      orderBy: { startedAt: 'desc' },
      include: { report: true },
    });
  }
}
