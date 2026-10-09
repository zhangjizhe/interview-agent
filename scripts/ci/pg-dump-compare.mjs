import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

// SQL relations have no implicit row order. Preserve every COPY row (including
// duplicates), every field byte and all DDL/sequence statements; sort rows only.
export function canonicalizeDump(dump) {
  const lines = dump.split('\n');
  const result = [];
  let rows = null;
  for (const line of lines) {
    if (rows !== null) {
      if (line === '\\.') {
        rows.sort();
        for (const row of rows) result.push(row);
        result.push(line);
        rows = null;
      } else {
        rows.push(line);
      }
    } else if (/^\\(?:un)?restrict /.test(line)) {
      // pg_dump generates a fresh local psql guard token for each export.
    } else {
      result.push(line);
      if (/^COPY .+ FROM stdin;$/.test(line)) rows = [];
    }
  }
  if (rows !== null) throw new Error('Unterminated COPY section in recovery dump');
  return result.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [original, restored] = process.argv.slice(2);
  assert.ok(original && restored, 'Two complete SQL dump paths required');
  const before = readFileSync(original, 'utf8');
  const after = readFileSync(restored, 'utf8');
  if (canonicalizeDump(after) !== canonicalizeDump(before)) throw new Error('Restored schema, complete row multiset or sequences differ; synthetic diagnostics retained when enabled');
  console.log('PASS complete PostgreSQL schema/row-multiset/sequence equality after restore');
}
