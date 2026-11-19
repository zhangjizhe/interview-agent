import { PortfolioDocument } from './portfolio.contract';
import { renderPortfolioDelivery } from './portfolio-guide.contract';

// Recognize complete JSON values only. Never repair truncated model text.
function valueEnd(text: string, start: number): number | null {
  const stack: string[] = []; let quoted = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; continue; }
    if (c === '"') quoted = true;
    else if (c === '[' || c === '{') stack.push(c === '[' ? ']' : '}');
    else if (c === ']' || c === '}') {
      if (stack.pop() !== c) throw new Error('Malformed streamed JSON');
      if (!stack.length) return i + 1;
    }
  }
  return null;
}

/** Public projection consists solely of complete, independently validated units.
 * A model token checkpoint is not itself safe public output.
 */
export function projectPortfolioStream(text: string, documents: PortfolioDocument[], references: unknown) {
  if (text.length > 8192) throw new Error('Guide output too large');
  let i = 0; const skip = () => { while (/\s/.test(text[i] || '') && i < text.length) i++; };
  skip(); if (text[i++] !== '{') return null;
  const seen = new Set<string>(); let selectedIds: unknown; const notes: unknown[] = [];
  while (i < text.length) {
    skip(); if (text[i] === '}') break;
    if (text[i] !== '"') return null;
    const keyStart = i++; let escaped = false, keyComplete = false;
    while (i < text.length) { const c = text[i++]; if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') { keyComplete = true; break; } }
    if (!keyComplete) break;
    const key = JSON.parse(text.slice(keyStart, i));
    if (seen.has(key) || !['selectedIds', 'technicalNotes'].includes(key)) throw new Error('Unexpected guide field');
    seen.add(key); skip(); if (text[i++] !== ':') break; skip();
    if (text[i] !== '[') break;
    if (key === 'selectedIds') {
      const end = valueEnd(text, i); if (end === null) break;
      selectedIds = JSON.parse(text.slice(i, end)); i = end;
    } else {
      i++; skip();
      while (i < text.length && text[i] !== ']') {
        if (text[i] !== '{') throw new Error('Malformed technical note');
        const end = valueEnd(text, i); if (end === null) break;
        notes.push(JSON.parse(text.slice(i, end))); i = end; skip();
        if (text[i] !== ',') break;
        i++; skip();
      }
      if (text[i] !== ']') break;
      i++;
    }
    skip(); if (text[i] !== ',') break; i++;
  }
  if (selectedIds === undefined) return null;
  const result = renderPortfolioDelivery(JSON.stringify({ selectedIds, technicalNotes: notes }), documents, references);
  return result.sources.length ? result : null;
}
