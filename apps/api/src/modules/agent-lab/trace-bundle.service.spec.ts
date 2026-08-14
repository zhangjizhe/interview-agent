import { TraceBundleService } from './trace-bundle.service';

describe('TraceBundleService', () => {
  it('导出原始事件并将大 payload 抽取为可验证引用', () => {
    const service = new TraceBundleService();
    const largeContent = 'x'.repeat(20 * 1024);
    const bundle = service.buildBundle(
      { id: 'run-1', status: 'COMPLETED', agentId: 'agent-1', agentVersionId: 'version-1' },
      [
        { seq: 1, type: 'user.message', modelVisible: true, payload: { content: '开始' } },
        { seq: 2, type: 'assistant.message', modelVisible: true, payload: { content: largeContent } },
      ],
    );

    expect(bundle.manifest.payloadReferences).toHaveLength(1);
    expect(bundle.events[1].payload).toEqual({
      $ref: bundle.manifest.payloadReferences[0].ref,
    });
    expect(bundle.payloads[bundle.manifest.payloadReferences[0].ref]).toEqual({
      content: largeContent,
    });
  });

  it('离线 reducer 关联模型历史、工具调用和终态证据', () => {
    const service = new TraceBundleService();
    const bundle = service.buildBundle(
      { id: 'run-1', status: 'FAILED', agentId: 'agent-1', agentVersionId: 'version-1' },
      [
        { seq: 1, type: 'user.message', modelVisible: true, payload: { content: '检索' } },
        { seq: 2, type: 'tool.call', callId: 'call-1', modelVisible: false, payload: { tool: 'search' } },
        { seq: 3, type: 'tool.result', callId: 'call-1', modelVisible: true, payload: { result: '结果' } },
        { seq: 4, type: 'run.failed', modelVisible: false, error: 'provider failed', payload: { error: 'provider failed' } },
      ],
    );

    const view = service.reduce(bundle);

    expect(view.modelHistory.map((item) => item.role)).toEqual(['user', 'tool']);
    expect(view.toolCalls).toEqual([
      expect.objectContaining({ callId: 'call-1', call: expect.anything(), result: expect.anything() }),
    ]);
    expect(view.edges).toEqual([
      { from: 'tool.call:call-1', to: 'tool.result:call-1', type: 'terminal-result' },
    ]);
    expect(view.errors).toHaveLength(1);
  });
});
