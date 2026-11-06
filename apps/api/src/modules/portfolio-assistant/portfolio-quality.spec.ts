import { portfolioSource, publicDocumentsFor } from './portfolio.contract';
describe('portfolio answer quality: recover actual public evidence', () => {
  it('recalls both RTC/IM SDK and CTI for the reported broad realtime-experience question', () => {
    expect(publicDocumentsFor('张继哲有哪些实时通信项目经验？').documents.map(x => x.id)).toEqual(expect.arrayContaining(['rtc', 'cti']));
  });
  it('preserves the owner-confirmed initial SDK responsibility and later integration role', () => {
    const text = portfolioSource.documents.find(x => x.id === 'rtc')!.text;
    for (const term of ['初版', '后期', '用户案例', '接入', '监狱', '医院', '教育', '大班课', '小班课']) expect(text).toContain(term);
  });
  it('includes already-public CTI adapter and weak-network contributions rather than only a role title', () => {
    const text = portfolioSource.documents.find(x => x.id === 'cti')!.text;
    for (const term of ['适配', '协议', '状态同步', '弱网', '多租户', '权限']) expect(text).toContain(term);
  });
});
