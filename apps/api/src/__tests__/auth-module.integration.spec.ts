import { Controller, Get, Global, Module, UseGuards } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AuthModule } from '../modules/auth/auth.module';
import { AuthService } from '../modules/auth/auth.service';
import { AuthSessionService } from '../modules/auth/auth-session.service';
import { JwtAuthGuard } from '../modules/auth/jwt-auth.guard';
import { PrismaService } from '../infra/prisma/prisma.service';

@Global()
@Module({ providers: [{ provide: PrismaService, useValue: {} }], exports: [PrismaService] })
class FixtureInfrastructure {}
@Controller('fixture')
class FixtureController {
  @Get() @UseGuards(JwtAuthGuard)
  get() { return 'ok'; }
}
@Module({ imports: [AuthModule], controllers: [FixtureController] })
class ConsumerModule {}

describe('AuthModule consumer DI', () => {
  it('业务模块中的局部 JWT Guard 能装配会话依赖', async () => {
    const module = await Test.createTestingModule({ imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({ auth: { jwtSecret: 'fixture-only-secret' } })] }),
      FixtureInfrastructure, ConsumerModule,
    ] }).overrideProvider(AuthService).useValue({}).overrideProvider(AuthSessionService).useValue({}).compile();
    expect(module.get(FixtureController)).toBeDefined();
    await module.close();
  });
});
