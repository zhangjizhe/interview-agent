import 'reflect-metadata';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { McpRegistry } from './modules/interview/services/mcp-registry';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT') || 3001;
  const corsOrigin = config.get<string>('CORS_ORIGIN') || 'http://localhost:5173';

  // 全局异常过滤
  app.useGlobalFilters(new GlobalExceptionFilter());

  // 全局参数校验
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  // CORS
  app.enableCors({
    origin: corsOrigin.split(','),
    credentials: true,
  });

  // 全局路由前缀（所有路由统一 /api/ 前缀，nginx 直接透传不 rewrite）
  app.setGlobalPrefix('api');

  // 启动时加载 MCP config（覆盖 in-code register）
  const configPath = path.resolve(__dirname, '../config/mcp-servers.json');
  const result = await McpRegistry.loadFromConfig(configPath);
  if (result.errors.length > 0) {
    Logger.warn(`MCP config had ${result.errors.length} errors: ${result.errors.join('; ')}`, 'Bootstrap');
  }

  await app.listen(port);
  Logger.log(`🚀 API server running on http://localhost:${port}`, 'Bootstrap');
}

bootstrap();
