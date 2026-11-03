import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { portfolioSource } from './portfolio.contract';

describe('approved public portfolio source integrity', () => {
  it('preserves every character of the eleven published historical articles and their source routes', () => {
    const articles = JSON.parse(readFileSync(resolve(process.cwd(), '../../examples/portfolio-site/src/articles.json'), 'utf8'));
    expect(articles).toHaveLength(11);
    let preserved = 0;
    for (const article of articles) {
      const parts = portfolioSource.documents.filter(doc => doc.id.startsWith(`article-${article.id}-`))
        .sort((a, b) => Number(a.id.split('-').at(-1)) - Number(b.id.split('-').at(-1)));
      expect(parts.length).toBeGreaterThan(0);
      expect(parts.map(part => part.text).join('')).toBe(article.text);
      expect(parts.every(part => part.href === `#article/${article.id}` && part.title.includes(article.date))).toBe(true);
      preserved += article.text.length;
    }
    expect(preserved).toBe(16212);
    const sanitized = articles.find(article => article.id === '11');
    expect(sanitized.text).toContain('[凭据已脱敏]');
    expect(sanitized.html).toContain('[凭据已脱敏]');
    expect(JSON.stringify(articles)).not.toMatch(/服务器\s*git\s*密码\s*[A-Za-z0-9]+/i);
  });
  it('contains public self-description with an explicit unverified provenance, not inferred GitHub statistics', () => {
    expect(portfolioSource.source.verifiedAgainstRepository).toBe(false);
    expect(portfolioSource.documents.find(doc => doc.id === 'github-profile')).toMatchObject({
      href: 'https://github.com/zhangjizhe', text: 'LangChain | LangGraph | TS',
    });
    expect(portfolioSource.documents.some(doc => doc.href === '#notes')).toBe(false);
  });
});
