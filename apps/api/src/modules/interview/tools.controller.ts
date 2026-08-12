import { Controller, Get, Post, Body, Query, BadRequestException, Req } from '@nestjs/common';
import { McpRegistry } from './services/mcp-registry';
import { PrismaService } from '../../infra/prisma/prisma.service';

/**
 * 工具偏好 API
 *
 * GET  /tools                            - 所有工具（合并系统级 + 用户级偏好）
 * GET  /tools/preferences?userId=        - 单个用户的所有偏好
 * POST /tools/preferences                - 切换单个工具偏好 {userId, toolName, enabled, config?}
 *
 * 设计：
 * - 系统级 enabled 由 Registry.setSystemEnabled() 管理（admin 接口）
 * - 用户级 enabled 持久化在 Prisma UserToolPreference
 * - list() 返回 enabled 字段 = 系统级 && 用户级都开
 */
interface UpsertPrefDto {
  toolName: string;
  enabled: boolean;
  config?: any;
}

@Controller('tools')
export class ToolsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list(@Req() req: any) {
    const userId = req.user.userId;
    const tools = McpRegistry.list();

    const prefs = await this.prisma.userToolPreference.findMany({ where: { userId } });
    const prefMap = new Map(prefs.map((p) => [p.toolName, p.enabled]));

    const merged = tools.map((t) => {
      const userWants = prefMap.get(t.name);
      // undefined = 用户没设置过偏好，默认跟随系统
      // false = 用户明确关掉
      // true = 用户明确开（即使系统关了也不开 —— 商用应该尊重系统级）
      const userEnabled = userWants === false ? false : t.enabled;
      return { ...t, userEnabled, effectiveEnabled: t.enabled && userEnabled };
    });

    return {
      tools: merged,
      count: merged.length,
      enabledCount: merged.filter((t) => t.effectiveEnabled).length,
      userDisabledCount: merged.filter((t) => t.userEnabled === false).length,
    };
  }

  @Get('preferences')
  async getPreferences(@Req() req: any) {
    const userId = req.user.userId;
    const prefs = await this.prisma.userToolPreference.findMany({ where: { userId } });
    return {
      userId,
      preferences: prefs,
      count: prefs.length,
    };
  }

  @Post('preferences')
  async upsertPreference(@Body() body: UpsertPrefDto, @Req() req: any) {
    if (!body.toolName || typeof body.enabled !== 'boolean') {
      throw new BadRequestException('toolName and enabled required');
    }
    // 验证工具存在
    const tool = McpRegistry.get(body.toolName);
    if (!tool) {
      throw new BadRequestException(`Unknown tool: ${body.toolName}`);
    }

    const pref = await this.prisma.userToolPreference.upsert({
      where: { userId_toolName: { userId: req.user.userId, toolName: body.toolName } },
      create: {
        userId: req.user.userId,
        toolName: body.toolName,
        enabled: body.enabled,
        config: body.config ?? undefined,
      },
      update: {
        enabled: body.enabled,
        config: body.config ?? undefined,
      },
    });

    return { ok: true, preference: pref };
  }
}
