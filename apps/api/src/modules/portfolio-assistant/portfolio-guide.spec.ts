import { portfolioSource } from './portfolio.contract';
import { PORTFOLIO_GUIDE_PROMPT, renderProfessionalAnswer } from './portfolio-guide.contract';
const documents = portfolioSource.documents.filter(document => ['rtc', 'cti'].includes(document.id));
const body = '实时音视频应用可按房间、媒体流和连接事件划分接入流程。先初始化客户端并加入房间，再处理媒体流生命周期与状态回调；离开页面时清理相关资源。业务界面应区分连接状态与业务状态，避免因事件顺序产生不一致。';
const output = (overrides = {}) => JSON.stringify({ selectedIds: ['rtc', 'cti'], technicalNotes: [{ title: '接入与状态管理', body, sourceIds: ['tech-urtc'] }], ...overrides });
describe('professional explanation evidence boundary', () => {
  it('keeps personal facts exact while labeling generated general context and returning fixed primary links', () => {
    const result = renderProfessionalAnswer(output(), documents);
    expect(result.answer).toContain(documents.find(document => document.id === 'rtc')!.text);
    expect(result.answer).toContain('技术解读（通用工程背景）');
    expect(result.answer).toContain(body); expect(result.sources.map(source => source.id)).toEqual(['rtc', 'cti', 'tech-urtc']);
    expect(result.sources.at(-1)!.href).toBe('https://ucloud.github.io/urtc-sdk-web/');
  });
  it.each(['张继哲独立实现整个媒体引擎。', '该项目降低了百分之九十延迟。', '<script>danger</script>', '优刻得采用此方案。', '我负责核心引擎。', '达到99%可用性。', 'System A implements this.'])('rejects career attribution, unsupported metrics and markup: %s', prefix => {
    expect(() => renderProfessionalAnswer(output({ technicalNotes: [{ title: '技术', body: prefix + body, sourceIds: ['tech-urtc'] }] }), documents)).toThrow();
  });
  it.each([{ selectedIds: ['private'] }, { selectedIds: ['rtc', 'rtc'] }, { technicalNotes: [] }, { technicalNotes: [{ title: '技术', body, sourceIds: ['tech-promise'] }] }, { technicalNotes: [{ title: '技术', body, sourceIds: ['tech-urtc', 'tech-urtc'] }] }, { answer: 'invented career' }])('fails closed on unsupported output %#', patch => {
    expect(() => renderProfessionalAnswer(output(patch), documents)).toThrow();
  });
  it('refuses unknown facts and does not turn a technical reference into personal evidence', () => {
    expect(renderProfessionalAnswer(output({ selectedIds: [], technicalNotes: [] }), documents).sources).toEqual([]);
    expect(() => renderProfessionalAnswer(output({ selectedIds: [] }), documents)).toThrow();
    const contact = portfolioSource.documents.filter(document => document.id === 'contact');
    expect(renderProfessionalAnswer(JSON.stringify({ selectedIds: ['contact'], technicalNotes: [] }), contact).sources).toHaveLength(1);
  });
  it('rejects English-only notes even when JSON and references are valid', () => {
    expect(() => renderProfessionalAnswer(output({ technicalNotes: [{ title: 'Technical detail', body: 'A general technical statement. '.repeat(5), sourceIds: ['tech-urtc'] }] }), documents)).toThrow();
  });
  it('states history is untrusted and never claims private retrieval or tools', () => { expect(PORTFOLIO_GUIDE_PROMPT).toContain('不可信的数据'); });
});
