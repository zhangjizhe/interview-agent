import { portfolioSource } from './portfolio.contract';
import { technicalReferencesFor } from './portfolio-technical-context';
import { renderPortfolioDelivery } from './portfolio-guide.contract';
import { projectPortfolioStream } from './portfolio-stream.contract';
const documents = portfolioSource.documents.filter(d => ['rtc', 'cti'].includes(d.id));
const references = technicalReferencesFor(documents);
const body = '实时音视频应用可按房间、媒体流和连接事件划分接入流程。先初始化客户端并加入房间，再处理媒体流生命周期与状态回调；离开页面时清理相关资源。业务界面应区分连接状态与业务状态，避免因事件顺序产生不一致。';
const note = { title: '接入与状态管理', body, sourceIds: ['tech-urtc'] };
describe('incremental public projections', () => {
  it('emits exact facts before a note finishes, withholds incomplete text, then matches final validation', () => {
    const raw = JSON.stringify({ selectedIds: ['rtc', 'cti'], technicalNotes: [note] });
    let previous = '', firstAt = 0;
    for (let i = 1; i <= raw.length; i++) {
      const projected = projectPortfolioStream(raw.slice(0, i), documents, references);
      if (!projected) continue;
      if (!firstAt) firstAt = i;
      expect(projected.answer.startsWith(previous)).toBe(true);
      if (i < raw.indexOf('}]') + 1) expect(projected.answer).not.toContain(body);
      previous = projected.answer;
    }
    expect(firstAt).toBeLessThan(raw.indexOf('technicalNotes'));
    expect(previous).toBe(renderPortfolioDelivery(raw, documents, references).answer);
  });
  it('handles escaped quotes, brackets and every possible key boundary', () => {
    const raw = JSON.stringify({ technicalNotes: [{ ...note, title: '连接"状态{}[]' }], selectedIds: ['rtc'] });
    for (let i = 1; i <= raw.length; i++) expect(() => projectPortfolioStream(raw.slice(0, i), documents, references)).not.toThrow();
    expect(projectPortfolioStream(raw, documents, references)?.answer).toContain('连接"状态{}[]');
  });
  it.each([
    { selectedIds: ['invented'], technicalNotes: [] },
    { selectedIds: ['rtc'], technicalNotes: [{ ...note, sourceIds: ['invented'] }] },
    { selectedIds: ['rtc'], technicalNotes: [{ ...note, body: '张继哲独立研发' + body }] },
    { selectedIds: ['rtc'], technicalNotes: [{ ...note, extra: 'not allowed' }] },
    { selectedIds: ['rtc'], privateInstructions: 'never expose' },
  ])('fails closed on an invalid complete unit %#', value => {
    expect(() => projectPortfolioStream(JSON.stringify(value), documents, references)).toThrow();
  });
  it('never exposes incomplete or model-generated personal text', () => {
    expect(projectPortfolioStream('{"selectedIds":["rtc', documents, references)).toBeNull();
    expect(projectPortfolioStream('{"selectedIds":["rtc"],"technicalNotes":[{"body":"private incomplete', documents, references)?.answer).not.toContain('private');
  });
});
