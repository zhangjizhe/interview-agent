import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { LlmGatewayService } from '../llm/llm.gateway.service';
import { LlmPricingCatalogService } from '../llm/cost/llm-pricing-catalog.service';
import { TraceEventService } from './trace-event.service';
import { assertSchema, RuntimeDefinition, RuntimeCancelledError, validateConfiguredVersion } from './configured-runtime.contract';

export { RuntimeCancelledError } from './configured-runtime.contract';
@Injectable()
export class ConfiguredRuntimeService {
  constructor(private prisma: PrismaService, private gateway: LlmGatewayService,
    private pricing: LlmPricingCatalogService, private trace: TraceEventService) {}

  models() { return this.gateway.getConfiguredModels(); }

  async prepare(version: any, workspaceId: string, allowDraft = false, pinDependencies = false) {
    const definition = validateConfiguredVersion(version);
    const versions = new Map<string, any>();
    if (definition.adapter === 'finite-workflow-v1') {
      for (const node of definition.nodes!) {
        const child = await this.prisma.agentVersion.findFirst({
          where: { id: node.agentVersionId, parentAgent: { workspaceId } },
        });
        if (!child || !(child.status === 'PUBLISHED' || (allowDraft && child.status === 'DRAFT'))) {
          throw new BadRequestException('工作流引用版本不存在、未发布或不属于当前工作区');
        }
        if (validateConfiguredVersion(child).adapter !== 'single-agent-v1') throw new BadRequestException('工作流节点只允许单Agent版本，禁止递归');
        const versionHash = createHash('sha256').update(JSON.stringify({ systemPrompt: child.systemPrompt,
          modelConfig: child.modelConfig, runtimeConfig: child.runtimeConfig, inputSchema: child.inputSchema,
          outputSchema: child.outputSchema, toolBindings: child.toolBindings, knowledgeBindings: child.knowledgeBindings, memoryBindings: child.memoryBindings })).digest('hex');
        if (pinDependencies) node.versionHash = versionHash;
        else if (node.versionHash !== versionHash) throw new BadRequestException('工作流依赖指纹缺失或已改变');
        versions.set(node.agentVersionId, child);
      }
    }
    return { definition, versions };
  }

  async execute(userId: string, run: any, version: any, input: any, prepared: { definition: RuntimeDefinition; versions: Map<string, any> }) {
    const { definition, versions } = prepared;
    assertSchema(version.inputSchema ?? { type: 'object' }, input);
    let response = String(input.message);
    let spent = 0;
    let promptTokens = 0;
    let completionTokens = 0;
    const evidence: any[] = [];
    const nodes: any[] = [];
    const started = Date.now();
    const check = async () => {
      const parent = await this.prisma.run.findFirst({ where: { id: run.id } });
      if (!parent || parent.cancelRequestedAt || parent.status !== 'RUNNING' || (run.leaseOwner && parent.leaseOwner !== run.leaseOwner)) throw new RuntimeCancelledError('运行取消或租约已失效；停止后续节点');
      if (Date.now() - started > definition.maxDurationMs) throw new ConflictException('运行时限耗尽；停止后续节点');
    };
    const invoke = async (target: any, childRun: any, message: string) => {
      await check();
      if (!message.trim() || message.length > 10000) throw new BadRequestException('节点输入须为1至10000字符');
      assertSchema(target.inputSchema ?? { type: 'object' }, { message });
      const config = target.modelConfig;
      const model = this.models().find(item => item.provider === config.provider && item.enabled);
      if (!model) throw new ConflictException('所选Provider不可用');
      // UTF-8 bytes are a conservative token bound; no retry/fallback for configured runs.
      const reserved = this.pricing.estimateCall({ provider: model.provider, model: model.model,
        promptTokens: Buffer.byteLength(target.systemPrompt + message, 'utf8') + 256,
        completionTokens: config.maxTokens });
      const childDefinition = validateConfiguredVersion(target);
      if (reserved.status !== 'available' || spent + reserved.totalCny > definition.maxEstimatedCostCny
        || reserved.totalCny > childDefinition.maxEstimatedCostCny) throw new ConflictException('费用不可确定或运行预算不足，未发起模型请求');
      await this.trace.append(childRun.id, { type: 'model.start', step: 'configured-agent',
        metadata: { provider: model.provider, model: model.model, maxTokens: config.maxTokens, fallback: false } });
      const callStarted = Date.now();
      const result = await this.gateway.chat({ messages: [
        { role: 'system', content: target.systemPrompt }, { role: 'user', content: message },
      ], maxTokens: config.maxTokens, temperature: config.temperature, userId,
      interviewId: childRun.id, allowFallback: false }, config.provider);
      const cost = this.pricing.estimateCall({ provider: result.provider, model: result.model, ...result.usage });
      // Preserve successful billable evidence even if schema/cancellation fails after the call.
      promptTokens += result.usage.promptTokens;
      completionTokens += result.usage.completionTokens;
      if (cost.status === 'available') spent += cost.totalCny;
      evidence.push(cost);
      const output = { response: result.content };
      await this.prisma.run.updateMany({ where: { id: run.id, status: 'RUNNING', ...(run.leaseOwner ? { leaseOwner: run.leaseOwner } : {}) }, data: {
        tokenUsage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens, calls: evidence.length },
        estimatedCost: evidence.every(item => item.status === 'available') ? spent : null,
        output: { response: result.content, nodes, pricing: evidence },
      } });
      if (childRun.id !== run.id) await this.prisma.run.updateMany({ where: { id: childRun.id, status: 'RUNNING' }, data: {
        output, tokenUsage: result.usage, estimatedCost: cost.status === 'available' ? cost.totalCny : null,
      } });
      await this.trace.append(childRun.id, { type: 'model.end', output,
        tokenUsage: result.usage, estimatedCost: cost.status === 'available' ? cost.totalCny : undefined,
        metadata: { provider: result.provider, model: result.model, pricing: cost } });
      if (Date.now() - callStarted > childDefinition.maxDurationMs) throw new ConflictException('节点时限耗尽；在途调用已记账，停止后续节点');
      if (result.finishReason === 'length') throw new ConflictException('模型输出达到Token上限，不能作为完整结果');
      if (cost.status !== 'available') throw new ConflictException('调用费用未知；停止后续节点');
      assertSchema(target.outputSchema ?? { type: 'object' }, output);
      await check();
      return { output, usage: result.usage, cost: cost.totalCny };
    };
    if (definition.adapter === 'single-agent-v1') {
      response = (await invoke(version, run, response)).output.response;
    } else {
      let node = definition.nodes![0];
      while (node) {
        await check();
        const target = versions.get(node.agentVersionId);
        const child = await this.prisma.run.create({ data: { workspaceId: run.workspaceId,
          agentId: target.agentId, agentVersionId: target.id, parentRunId: run.id,
          application: 'lab-workflow-node', input: { message: node.inputFrom === 'input' ? input.message : response },
          budget: { maxToolCalls: 0, maxModelCalls: 1 }, status: 'RUNNING', startedAt: new Date() } });
        await this.trace.append(run.id, { type: 'workflow.node.start', step: node.id,
          payload: { childRunId: child.id, agentVersionId: target.id } });
        try {
          const result = await invoke(target, child, node.inputFrom === 'input' ? input.message : response);
          response = result.output.response;
          await check();
          const completed = await this.prisma.run.updateMany({ where: { id: child.id, status: 'RUNNING', cancelRequestedAt: null }, data: { status: 'COMPLETED', output: result.output,
            tokenUsage: result.usage, estimatedCost: result.cost, completedAt: new Date() } });
          if (completed.count !== 1) throw new RuntimeCancelledError('节点已取消或恢复为终态');
          nodes.push({ id: node.id, childRunId: child.id, status: 'COMPLETED', response });
          await this.trace.append(run.id, { type: 'workflow.node.end', step: node.id, payload: nodes[nodes.length - 1] });
        } catch (error: any) {
          await this.prisma.run.updateMany({ where: { id: child.id, status: 'RUNNING' }, data: {
            status: error instanceof RuntimeCancelledError ? 'CANCELLED' : 'FAILED', error: error.message, completedAt: new Date() } });
          await this.trace.append(run.id, { type: 'workflow.node.failed', step: node.id, payload: { childRunId: child.id }, error: error.message });
          throw error;
        }
        const next = node.branch ? (response.includes(node.branch.contains) ? node.branch.then : node.branch.else) : node.next;
        node = definition.nodes!.find(item => item.id === next)!;
      }
    }
    const output = { response, nodes, pricing: evidence };
    assertSchema(version.outputSchema ?? { type: 'object' }, { response });
    return { response, output, tokenUsage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens, calls: evidence.length }, estimatedCostCny: spent, pricing: evidence };
  }
}
