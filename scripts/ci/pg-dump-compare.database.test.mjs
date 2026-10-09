import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { canonicalizeDump } from './pg-dump-compare.mjs';

// Only the disposable no-external-network verification PostgreSQL is allowed.
const container = process.env.PG_DUMP_FIXTURE_CONTAINER;
if (container) assert.match(container, /^interview-built-check-\d+-pg$/);
test('real PostgreSQL dumps retain all data while ignoring relation row order', { skip: !container }, () => {
  const original = 'dump_compare_original';
  const reordered = 'dump_compare_reordered';
  const command = (...args) => execFileSync('docker', ['exec', container, ...args], { encoding: 'utf8' });
  const sql = (db, query) => command('psql', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-c', query);
  const dump = db => command('pg_dump', '-U', 'postgres', '--no-owner', '--no-privileges', db);
  command('createdb', '-U', 'postgres', original);
  command('createdb', '-U', 'postgres', reordered);
  try {
    for (const db of [original, reordered]) sql(db, 'CREATE TABLE example (id integer, value text); CREATE SEQUENCE example_seq;');
    const rows = "(1, E'escaped\\nline'), (2, 'duplicate'), (2, 'duplicate'), (3, NULL)";
    sql(original, `INSERT INTO example VALUES ${rows};`);
    sql(reordered, "INSERT INTO example VALUES (3, NULL), (2, 'duplicate'), (2, 'duplicate'), (1, E'escaped\\nline');");
    const before = dump(original);
    assert.notEqual(dump(reordered), before, 'fixture must exercise an actual COPY row order difference');
    assert.equal(canonicalizeDump(dump(reordered)), canonicalizeDump(before));
    sql(reordered, "UPDATE example SET value='changed' WHERE id=1;");
    assert.notEqual(canonicalizeDump(dump(reordered)), canonicalizeDump(before), 'changed field must fail');
    sql(reordered, "UPDATE example SET value=E'escaped\\nline' WHERE id=1;");
    sql(reordered, 'DELETE FROM example WHERE ctid = (SELECT ctid FROM example WHERE id=2 LIMIT 1);');
    assert.notEqual(canonicalizeDump(dump(reordered)), canonicalizeDump(before), 'missing duplicate must fail');
    sql(reordered, "INSERT INTO example VALUES (2, 'duplicate'); SELECT setval('example_seq', 2, true);");
    assert.notEqual(canonicalizeDump(dump(reordered)), canonicalizeDump(before), 'changed sequence must fail');
    sql(reordered, "SELECT setval('example_seq', 1, false); ALTER TABLE example ALTER COLUMN value TYPE varchar;");
    assert.notEqual(canonicalizeDump(dump(reordered)), canonicalizeDump(before), 'changed column type must fail');
  } finally {
    command('dropdb', '-U', 'postgres', original);
    command('dropdb', '-U', 'postgres', reordered);
  }
});
