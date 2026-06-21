import { Module } from '@nestjs/common';
import { InterviewAgentService } from './interview-agent.service';
import { DeepAgentsAgentService } from './deepagents-agent.service';
import { MultiAgentService } from './multi-agent.service';
import { BochaSearchTool } from './tools/bocha-search.tool';
import { GitHubTool } from './tools/github.tool';
import { ContextManager } from './services/context-manager.service';
import { LlmModule } from '../llm/llm.module';
import { MemoryModule } from '../memory/memory.module';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { KnowledgeBaseModule } from '../knowledge-base/knowledge-base.module';
import { TaskQueueModule } from './task-queue.module';
import { ReflectionModule } from '../reflection/reflection.module';

@Module({
  imports: [LlmModule, MemoryModule, PrismaModule, KnowledgeBaseModule, TaskQueueModule, ReflectionModule],
  providers: [
    InterviewAgentService, // 手写循环（兜底）
    DeepAgentsAgentService, // 写真实 deepagents
    MultiAgentService, // LangGraph 多 Agent（Supervisor 模式）
    BochaSearchTool,
    GitHubTool, // ADR #11：MCP 第三方工具集成
    ContextManager,
  ],
  exports: [InterviewAgentService, DeepAgentsAgentService, MultiAgentService, ContextManager],
})
export class AgentModule {}