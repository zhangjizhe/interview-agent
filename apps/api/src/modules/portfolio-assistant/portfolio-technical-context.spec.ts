import { publicDocumentsFor } from './portfolio.contract';
import { technicalReferences, technicalReferencesFor, validateTechnicalReferenceSnapshot } from './portfolio-technical-context';
const ids = (documents: { id: string }[]) => technicalReferencesFor(documents).map(reference => reference.id);
describe('ranked bounded technical context', () => {
  it('keeps SSE for the highest-ranked project source instead of filling both slots from CTI', () => {
    const documents = publicDocumentsFor('介绍 interview-agent 项目').documents;
    expect(documents.map(document => document.id)).toEqual(['interview-agent', 'profile', 'cti']);
    expect(ids(documents)).toEqual(['tech-sse', 'tech-websocket']);
  });
  it('covers primary references for each ranked topic before secondary context', () => {
    expect(ids([{ id: 'cti' }, { id: 'rtc' }])).toEqual(['tech-websocket', 'tech-urtc']);
    expect(ids([{ id: 'rtc' }])).toEqual(['tech-urtc', 'tech-webrtc']);
    expect(ids([{ id: 'article-6-1' }, { id: 'article-6-2' }])).toEqual(['tech-promise']);
    expect(ids([{ id: 'unknown' }])).toEqual([]);
  });
  it('accepts only exact original or current policy snapshots, not other registry subsets or altered fields', () => {
    const documents = publicDocumentsFor('介绍 interview-agent 项目').documents;
    const legacy = technicalReferences.filter(reference => ['tech-websocket', 'tech-webrtc'].includes(reference.id))
      .map(({ id, title, href, quote, text }) => ({ id, title, href, quote, text }));
    expect(validateTechnicalReferenceSnapshot(legacy, documents)).toEqual(legacy);
    const current = technicalReferencesFor(documents);
    expect(validateTechnicalReferenceSnapshot(current, documents)).toEqual(current);
    for (const invalid of [current.slice(0, 1), [...current].reverse(), [...current, current[0]],
      current.map(reference => ({ ...reference, text: reference.text + 'invented' })),
      current.map(reference => ({ ...reference, extra: true }))]) {
      expect(() => validateTechnicalReferenceSnapshot(invalid, documents)).toThrow('Technical context mismatch');
    }
  });
});
