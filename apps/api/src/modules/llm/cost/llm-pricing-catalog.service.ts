import { Injectable } from '@nestjs/common';

export type LlmPricingUsage = {
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  cachedPromptTokens?: number;
};

type PricingTier = {
  maxPromptTokens?: number;
  inputCnyPer1k: number;
  outputCnyPer1k: number;
  cachedInputCnyPer1k?: number;
};

type PricingEntry = {
  provider: string;
  models: string[];
  source: string;
  pricingBasis: string;
  tiers: PricingTier[];
};

type PricingCatalog = {
  catalogVersion: string;
  currency: 'CNY';
  effectiveAt: string;
  entries: PricingEntry[];
};

export type LlmCallPricingEvidence = LlmPricingUsage & {
  status: 'available';
  catalogVersion: string;
  currency: 'CNY';
  totalCny: number;
  inputCnyPer1k: number;
  outputCnyPer1k: number;
  cachedInputCnyPer1k: number;
  source: string;
  pricingBasis: string;
};

export type LlmPricingEvidence =
  | {
      status: 'available';
      catalogVersion: string;
      currency: 'CNY';
      totalCny: number;
      calls: LlmCallPricingEvidence[];
    }
  | {
      status: 'unavailable';
      catalogVersion: string;
      currency: 'CNY';
      reasons: string[];
      calls: LlmCallPricingEvidence[];
    };

export type LlmPricingReconciliation =
  | {
      status: 'matched' | 'mismatch';
      catalogVersion: string;
      currency: 'CNY';
      estimatedCny: number;
      billedCny: number;
      deltaCny: number;
      deltaRatio: number;
      toleranceRatio: number;
    }
  | {
      status: 'unavailable';
      catalogVersion: string;
      reasons: string[];
    };

// 价格来自 Provider 官方公开按量价格；使用高峰价或不享受缓存折扣的价格做保守估算。
// 费率变更必须新增 catalogVersion，并在验收报告中记录账单抽样对账结果。
const BUILTIN_CATALOG: PricingCatalog = {
  catalogVersion: '2026-10-05.1',
  currency: 'CNY',
  effectiveAt: '2026-10-05T00:00:00+08:00',
  entries: [
    {
      provider: 'qwen',
      models: ['qwen-plus', 'qwen-plus-2025-12-01'],
      source: 'https://help.aliyun.com/zh/model-studio/qwen-plus',
      pricingBasis: '华北2北京，非思考模式，按单次输入 Token 阶梯',
      tiers: [
        { maxPromptTokens: 128_000, inputCnyPer1k: 0.0008, outputCnyPer1k: 0.002 },
        { maxPromptTokens: 256_000, inputCnyPer1k: 0.0024, outputCnyPer1k: 0.02 },
        { maxPromptTokens: 1_000_000, inputCnyPer1k: 0.0048, outputCnyPer1k: 0.048 },
      ],
    },
    {
      provider: 'deepseek',
      models: ['deepseek-flash', 'deepseek-v4-flash', 'deepseek-v4-flash-vision-exp'],
      source: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/',
      pricingBasis: 'DeepSeek V4.1 Flash 工作日高峰价；缓存命中按官方高峰价',
      tiers: [
        { inputCnyPer1k: 0.002, outputCnyPer1k: 0.008, cachedInputCnyPer1k: 0.00004 },
      ],
    },
  ],
};

@Injectable()
export class LlmPricingCatalogService {
  private readonly catalog: PricingCatalog;

  constructor() {
    this.catalog = this.loadCatalog();
  }

  get version() {
    return this.catalog.catalogVersion;
  }

  estimateCall(usage: LlmPricingUsage): LlmCallPricingEvidence | { status: 'unavailable'; reason: string } {
    if (!this.isValidUsage(usage)) {
      return { status: 'unavailable', reason: `invalid usage for ${usage.provider}/${usage.model}` };
    }
    if (usage.promptTokens + usage.completionTokens === 0) {
      return {
        ...usage,
        status: 'available',
        catalogVersion: this.catalog.catalogVersion,
        currency: this.catalog.currency,
        totalCny: 0,
        inputCnyPer1k: 0,
        outputCnyPer1k: 0,
        cachedInputCnyPer1k: 0,
        source: 'no-billable-token',
        pricingBasis: '零 Token 调用',
      };
    }

    const entry = this.catalog.entries.find((item) =>
      item.provider === usage.provider && item.models.includes(usage.model));
    if (!entry) {
      return { status: 'unavailable', reason: `unknown pricing for ${usage.provider}/${usage.model}` };
    }
    const tier = entry.tiers.find((item) => item.maxPromptTokens === undefined
      || usage.promptTokens <= item.maxPromptTokens);
    if (!tier) {
      return { status: 'unavailable', reason: `prompt tier unavailable for ${usage.provider}/${usage.model}` };
    }

    const cachedPromptTokens = usage.cachedPromptTokens ?? 0;
    const uncachedPromptTokens = usage.promptTokens - cachedPromptTokens;
    const cachedInputCnyPer1k = tier.cachedInputCnyPer1k ?? tier.inputCnyPer1k;
    const totalCny = (uncachedPromptTokens / 1000) * tier.inputCnyPer1k
      + (cachedPromptTokens / 1000) * cachedInputCnyPer1k
      + (usage.completionTokens / 1000) * tier.outputCnyPer1k;

    return {
      ...usage,
      status: 'available',
      catalogVersion: this.catalog.catalogVersion,
      currency: this.catalog.currency,
      totalCny: Number(totalCny.toFixed(9)),
      inputCnyPer1k: tier.inputCnyPer1k,
      outputCnyPer1k: tier.outputCnyPer1k,
      cachedInputCnyPer1k,
      source: entry.source,
      pricingBasis: entry.pricingBasis,
    };
  }

  estimateCalls(usages: LlmPricingUsage[]): LlmPricingEvidence {
    const calls: LlmCallPricingEvidence[] = [];
    const reasons: string[] = [];
    for (const usage of usages) {
      const evidence = this.estimateCall(usage);
      if (evidence.status === 'available') calls.push(evidence);
      else reasons.push(evidence.reason);
    }
    if (reasons.length > 0) {
      return {
        status: 'unavailable',
        catalogVersion: this.catalog.catalogVersion,
        currency: this.catalog.currency,
        reasons: [...new Set(reasons)].sort(),
        calls,
      };
    }
    return {
      status: 'available',
      catalogVersion: this.catalog.catalogVersion,
      currency: this.catalog.currency,
      totalCny: Number(calls.reduce((sum, item) => sum + item.totalCny, 0).toFixed(9)),
      calls,
    };
  }

  reconcileSample(
    usages: LlmPricingUsage[],
    billedCny: number,
    toleranceRatio = 0.05,
  ): LlmPricingReconciliation {
    const estimate = this.estimateCalls(usages);
    if (estimate.status === 'unavailable') {
      return {
        status: 'unavailable',
        catalogVersion: estimate.catalogVersion,
        reasons: estimate.reasons,
      };
    }
    if (!Number.isFinite(billedCny) || billedCny < 0
      || !Number.isFinite(toleranceRatio) || toleranceRatio < 0 || toleranceRatio > 1) {
      return {
        status: 'unavailable',
        catalogVersion: estimate.catalogVersion,
        reasons: ['invalid reconciliation input'],
      };
    }
    const deltaCny = Number((estimate.totalCny - billedCny).toFixed(9));
    const deltaRatio = billedCny === 0
      ? (estimate.totalCny === 0 ? 0 : 1)
      : Number((Math.abs(deltaCny) / billedCny).toFixed(9));
    return {
      status: deltaRatio <= toleranceRatio ? 'matched' : 'mismatch',
      catalogVersion: estimate.catalogVersion,
      currency: estimate.currency,
      estimatedCny: estimate.totalCny,
      billedCny,
      deltaCny,
      deltaRatio,
      toleranceRatio,
    };
  }

  private loadCatalog(): PricingCatalog {
    const configured = process.env.LLM_PRICING_CATALOG_JSON;
    if (!configured) return BUILTIN_CATALOG;
    let parsed: unknown;
    try {
      parsed = JSON.parse(configured);
    } catch {
      throw new Error('LLM_PRICING_CATALOG_JSON 必须是合法 JSON');
    }
    if (!this.isCatalog(parsed)) {
      throw new Error('LLM_PRICING_CATALOG_JSON 不符合版本化费率目录合同');
    }
    return parsed;
  }

  private isCatalog(value: unknown): value is PricingCatalog {
    if (!value || typeof value !== 'object') return false;
    const catalog = value as PricingCatalog;
    return typeof catalog.catalogVersion === 'string'
      && catalog.catalogVersion.length > 0
      && catalog.currency === 'CNY'
      && !Number.isNaN(Date.parse(catalog.effectiveAt))
      && Array.isArray(catalog.entries)
      && catalog.entries.length > 0
      && catalog.entries.every((entry) => typeof entry.provider === 'string'
        && Array.isArray(entry.models) && entry.models.length > 0
        && entry.models.every((model) => typeof model === 'string' && model.length > 0)
        && typeof entry.source === 'string' && entry.source.startsWith('https://')
        && typeof entry.pricingBasis === 'string'
        && Array.isArray(entry.tiers) && entry.tiers.length > 0
        && entry.tiers.every((tier) => this.isRate(tier.inputCnyPer1k)
          && this.isRate(tier.outputCnyPer1k)
          && (tier.cachedInputCnyPer1k === undefined || this.isRate(tier.cachedInputCnyPer1k))
          && (tier.maxPromptTokens === undefined
            || (Number.isInteger(tier.maxPromptTokens) && tier.maxPromptTokens > 0))));
  }

  private isValidUsage(usage: LlmPricingUsage) {
    const cached = usage.cachedPromptTokens ?? 0;
    return Boolean(usage.provider && usage.model)
      && Number.isInteger(usage.promptTokens) && usage.promptTokens >= 0
      && Number.isInteger(usage.completionTokens) && usage.completionTokens >= 0
      && Number.isInteger(cached) && cached >= 0 && cached <= usage.promptTokens;
  }

  private isRate(value: number) {
    return Number.isFinite(value) && value >= 0;
  }
}
