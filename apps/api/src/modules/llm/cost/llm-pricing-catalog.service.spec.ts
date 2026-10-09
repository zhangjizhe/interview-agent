import { LlmPricingCatalogService } from './llm-pricing-catalog.service';

describe('LlmPricingCatalogService', () => {
  const originalCatalog = process.env.LLM_PRICING_CATALOG_JSON;

  afterEach(() => {
    if (originalCatalog === undefined) delete process.env.LLM_PRICING_CATALOG_JSON;
    else process.env.LLM_PRICING_CATALOG_JSON = originalCatalog;
  });

  it('按实际 Provider/Model 和输入阶梯生成版本化成本证据', () => {
    delete process.env.LLM_PRICING_CATALOG_JSON;
    const service = new LlmPricingCatalogService();

    expect(service.estimateCalls([
      { provider: 'qwen', model: 'qwen-plus', promptTokens: 1000, completionTokens: 500 },
      { provider: 'deepseek', model: 'deepseek-flash', promptTokens: 1000, completionTokens: 500 },
    ])).toMatchObject({
      status: 'available',
      catalogVersion: '2026-10-09.1',
      totalCny: 0.0078,
      calls: [
        { provider: 'qwen', model: 'qwen-plus', totalCny: 0.0018 },
        { provider: 'deepseek', model: 'deepseek-flash', totalCny: 0.006 },
      ],
    });
  });

  it('对 DeepSeek 缓存输入使用官方高峰缓存价', () => {
    delete process.env.LLM_PRICING_CATALOG_JSON;
    const service = new LlmPricingCatalogService();

    expect(service.estimateCall({
      provider: 'deepseek', model: 'deepseek-flash',
      promptTokens: 1000, cachedPromptTokens: 800, completionTokens: 0,
    })).toMatchObject({ status: 'available', totalCny: 0.000432 });
  });

  it('未知模型显式返回不可用，不套用其他 Provider 默认价', () => {
    delete process.env.LLM_PRICING_CATALOG_JSON;
    const service = new LlmPricingCatalogService();

    expect(service.estimateCalls([
      { provider: 'deepseek', model: 'deepseek-unknown', promptTokens: 10, completionTokens: 2 },
    ])).toEqual(expect.objectContaining({
      status: 'unavailable',
      reasons: ['unknown pricing for deepseek/deepseek-unknown'],
    }));
  });

  it('拒绝无效的环境费率覆盖', () => {
    process.env.LLM_PRICING_CATALOG_JSON = JSON.stringify({ catalogVersion: 'broken' });
    expect(() => new LlmPricingCatalogService()).toThrow('不符合版本化费率目录合同');
  });

  it('按容差输出可审计的账单抽样对账结论', () => {
    delete process.env.LLM_PRICING_CATALOG_JSON;
    const service = new LlmPricingCatalogService();
    const usage = [{
      provider: 'qwen', model: 'qwen-plus', promptTokens: 1000, completionTokens: 500,
    }];

    expect(service.reconcileSample(usage, 0.00182, 0.02)).toMatchObject({
      status: 'matched', estimatedCny: 0.0018, billedCny: 0.00182,
      deltaCny: -0.00002, deltaRatio: 0.010989011, toleranceRatio: 0.02,
    });
    expect(service.reconcileSample(usage, 0.0025, 0.02)).toMatchObject({
      status: 'mismatch', estimatedCny: 0.0018, billedCny: 0.0025,
    });
  });
});
