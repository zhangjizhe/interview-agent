import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonicalizeDump } from './pg-dump-compare.mjs';

const make = (rows = ['2\tbeta', '1\talpha'], ddl = 'CREATE TABLE public.example (id integer, value text);', sequence = 'SELECT pg_catalog.setval(\'public.example_id_seq\', 2, true);') =>
  `${ddl}\n\nCOPY public.example (id, value) FROM stdin;\n${rows.length ? rows.join('\n') + '\n' : ''}\\.\n\n${sequence}\n`;
const same = (a, b) => assert.equal(canonicalizeDump(a), canonicalizeDump(b));
const different = (a, b) => assert.notEqual(canonicalizeDump(a), canonicalizeDump(b));

test('only COPY data row order is irrelevant', () => {
  same(make(), make(['1\talpha', '2\tbeta']));
  assert.equal(canonicalizeDump(make()), canonicalizeDump(canonicalizeDump(make())));
});
test('duplicate rows are retained including their multiplicity', () => {
  same(make(['2\tbeta', '1\talpha', '1\talpha']), make(['1\talpha', '2\tbeta', '1\talpha']));
  different(make(['1\talpha', '1\talpha']), make(['1\talpha']));
});
test('field bytes and column ordering are not normalized', () => {
  for (const row of ['1\tAlpha', '1\talpha ', '1\t alpha', '1\talpha\t', 'alpha\t1', '1\talphä', '1\talpha\u0000']) {
    different(make(['1\talpha']), make([row]));
  }
  different(make(), make().replace('(id, value) FROM', '(value, id) FROM'));
});
test('SQL NULL remains distinct from empty text and literal escaped NULL', () => {
  const rows = ['1\t\\N', '1\t', '1\t\\\\N'];
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) different(make([rows[i]]), make([rows[j]]));
});
test('COPY escape spellings and literal control characters remain byte exact', () => {
  for (const [a, b] of [['1\t\\t', '1\t\t'], ['1\t\\n', '1\tn'], ['1\t\\000', '1\t\\0'], ['1\t\\\\', '1\t\\'], ['1\t\\r', '1\tr']]) {
    different(make([a]), make([b]));
  }
});
test('DDL char/varchar and lengths stay significant', () => {
  different(make([], 'CREATE TABLE public.example (id integer, value char(4));'), make([], 'CREATE TABLE public.example (id integer, value varchar(4));'));
  different(make([], 'CREATE TABLE public.example (id integer, value varchar(4));'), make([], 'CREATE TABLE public.example (id integer, value varchar(5));'));
});
test('sequence value and is_called stay significant', () => {
  different(make(), make().replace("_seq', 2, true", "_seq', 3, true"));
  different(make(), make().replace("_seq', 2, true", "_seq', 2, false"));
});
test('all non-COPY text and its order remain significant', () => {
  different(make(), make().replace('CREATE TABLE', '-- changed\nCREATE TABLE'));
  different(make(), make().replace('\n\nCOPY', '\nCOPY'));
  different(make(), make().replace('public.example (id, value)', 'public.other (id, value)'));
});
test('multiple COPY blocks sort independently without moving rows between tables', () => {
  const second = 'COPY public.other (id, value) FROM stdin;\n4\tdelta\n3\tgamma\n\\.\n';
  same(make() + second, make(['1\talpha', '2\tbeta']) + second.replace('4\tdelta\n3\tgamma', '3\tgamma\n4\tdelta'));
  different(make(['1\talpha']) + second, make(['4\tdelta']) + second.replace('4\tdelta', '1\talpha'));
});
test('COPY-shaped escaped cell values are data, not headers or terminators', () => {
  same(make(['1\tCOPY public.foo FROM stdin;', '2\t\\\\.']), make(['2\t\\\\.', '1\tCOPY public.foo FROM stdin;']));
});
test('empty COPY tables are supported without fabricating a row', () => {
  same(make([]), make([]));
  different(make([]), make(['']));
});
test('unterminated COPY must fail closed', () => {
  assert.throws(() => canonicalizeDump('COPY public.example (id) FROM stdin;\n1\n'));
  assert.throws(() => canonicalizeDump('COPY public.example (id) FROM stdin;\n1\n\\.extra\n'));
});

test('psql generated guard token is excluded but similarly named SQL is retained', () => {
  same('\\restrict token-a\n' + make() + '\\unrestrict token-a\n', '\\restrict token-b\n' + make() + '\\unrestrict token-b\n');
  different(make(), make().replace('CREATE TABLE', '-- \\restrict token-a\nCREATE TABLE'));
});
