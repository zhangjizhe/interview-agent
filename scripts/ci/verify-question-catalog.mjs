// Real HTTP + PostgreSQL + Milvus with the isolated localhost synthetic provider.
// This checks persistence/contracts, not model or interview quality.
import { createRequire } from 'node:module';
const { registerFixtureUser, loginFixtureUser } = await import('/tmp/fixture-auth-http.mjs');
import { createHash } from 'node:crypto';
const require = createRequire(`${process.cwd()}/package.json`);
const { PrismaClient } = require('@prisma/client');
const { MilvusClient, ConsistencyLevelEnum } = require('@zilliz/milvus2-sdk-node');
export async function verifyQuestionCatalog({ request, admin, owner, check }) {
  if (process.env.MILVUS_URL !== 'http://fixture-milvus:19530' || new URL(process.env.DATABASE_URL).pathname !== '/fixture') throw new Error('Only isolated synthetic catalog fixtures are permitted');
  const originalRequest = request;
  request = (path, options = {}) => originalRequest(path, { ...options, timeoutMs: 90000 });
  const prisma = new PrismaClient();
  const milvus = new MilvusClient({ address: process.env.MILVUS_URL });
  const fixtureUserId = 'fixture-ci-catalog-admin';
  const password = 'isolated-fixture-catalog-password';
  const registered = await registerFixtureUser(request, fixtureUserId, password);
  if (registered.userId !== fixtureUserId) throw new Error('Synthetic catalog administrator registration failed');
  await prisma.user.update({ where: { id: fixtureUserId }, data: { role: 'ADMIN' } });
  const session = await loginFixtureUser(request, fixtureUserId, password);
  if (session.role !== 'ADMIN') throw new Error('Synthetic catalog administrator session failed');
  admin = session.accessToken;
  const base = '/interview/question-bank';
  const post = (path, body) => request(`${base}/${path}`, { method: 'POST', token: admin, body });
  const stats = () => fetch('http://127.0.0.1:3335/fixture/stats').then(response => response.json());
  const input = { questionId: 'fixture-canonical-question', position: 'Fixture Catalog', category: 'frontend', level: 'P5', question: 'Synthetic catalog constraint?', answer: 'Canonical content version one.', tags: ['catalog'] };
  try {
    for (const [path, method, body] of [['catalog/status', 'GET'], ['catalog/adopt-legacy', 'POST', { maintenanceConfirmed: true }], ['catalog/rebuild-index', 'POST', {}]]) {
      check(`USER catalog ${path} denied`, (await request(`${base}/${path}`, { method, token: owner, body })).status === 403);
    }
    check('catalog explicitly starts in legacy mode', (await request(`${base}/catalog/status`, { token: admin })).data.mode === 'LEGACY');
    check('synthetic source question created through legacy HTTP path', (await request(base, { method: 'POST', token: admin, body: input })).status === 201);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: fixtureUserId } });
    const collection = user.organizationId === 'default-organization' ? 'question_bank_v2' : `question_bank_v2_${createHash('sha256').update(user.organizationId).digest('hex').slice(0, 32)}`;
    const sourceRows = async () => {
      const result = await milvus.query({ collection_name: collection, filter: '', limit: 1000, consistency_level: ConsistencyLevelEnum.Strong, output_fields: ['questionId', 'question', 'answer'] });
      if (result.status?.error_code !== 'Success') throw new Error('Synthetic legacy read was not confirmed');
      return result.data.map(row => ({ questionId: row.questionId, question: row.question, answer: row.answer })).sort((a, b) => a.questionId.localeCompare(b.questionId));
    };
    const beforeSource = JSON.stringify(await sourceRows()), before = await stats();
    check('adoption requires explicit maintenance declaration', (await post('catalog/adopt-legacy', {})).status === 400);
    const adopted = await post('catalog/adopt-legacy', { maintenanceConfirmed: true });
    check('real HTTP adoption saves a canonical snapshot without claiming embedding', adopted.status === 201 && adopted.data.contractVersion === 'question-catalog/v1' && adopted.data.mode === 'CATALOG' && adopted.data.providerCalls === 0 && adopted.data.adoptedCount >= 1);
    const after = await stats();
    check('legacy adoption makes no provider call', JSON.stringify(before) === JSON.stringify(after));
    check('legacy source stays unchanged after adoption', beforeSource === JSON.stringify(await sourceRows()));
    const again = await post('catalog/adopt-legacy', { maintenanceConfirmed: true });
    check('adoption retry is idempotent', again.status === 201 && again.data.reused === true && again.data.providerCalls === 0);
    const stored = await prisma.questionCatalogEntry.findUniqueOrThrow({ where: { organizationId_questionId: { organizationId: user.organizationId, questionId: input.questionId } } });
    const first = await prisma.questionCatalogVersion.findUniqueOrThrow({ where: { id: stored.indexKey } });
    check('actual PG keeps immutable first version and pending index', stored.currentVersion === 1 && stored.indexStatus === 'PENDING' && first.snapshot.answer === input.answer && first.organizationId === user.organizationId);
    check('pending index is explicitly unavailable for semantic search', (await request(`${base}/search?q=catalog&limit=5`, { token: admin })).status === 503);
    const rebuilt = await post('catalog/rebuild-index', {});
    check('real metered embedding rebuilds the separate Milvus index', rebuilt.status === 201 && rebuilt.data.indexStatus === 'READY' && rebuilt.data.requestedCount >= 1 && rebuilt.data.requestedCount <= 20);
    const changed = { ...input, answer: 'Canonical content version two.' };
    const updated = await request(base, { method: 'POST', token: admin, body: changed });
    check('canonical update persists version two and explicit index receipt', updated.status === 201 && updated.data.canonicalStatus === 'SAVED' && updated.data.indexStatus === 'READY');
    const current = await prisma.questionCatalogEntry.findUniqueOrThrow({ where: { id: stored.id } });
    check('old PG version remains unchanged', current.currentVersion === 2 && current.indexKey !== stored.indexKey && JSON.stringify(await prisma.questionCatalogVersion.findUniqueOrThrow({ where: { id: first.id } })) === JSON.stringify(first));
    const search = await request(`${base}/search?q=catalog&limit=5`, { token: admin });
    const hit = search.data.results?.find(row => row.questionId === input.questionId);
    check('search hydrates current PG content and exact version identity', search.status === 200 && hit?.answer === changed.answer && hit?.catalogVersionId === current.indexKey && hit?.catalogContentHash === current.contentHash);
    check('canonical delete does not require destructive historical deletion', (await request(`${base}/${input.questionId}`, { method: 'DELETE', token: admin })).data.deleted === true);
    const deletedSearch = await request(`${base}/search?q=catalog&limit=5`, { token: admin });
    check('stale vector hits cannot return a deleted canonical question', deletedSearch.status === 200 && !deletedSearch.data.results.some(row => row.questionId === input.questionId));
    check('historical question versions survive delete', await prisma.questionCatalogVersion.count({ where: { entryId: stored.id, organizationId: user.organizationId } }) === 2);
    check('source Milvus remains retained after canonical update and delete', beforeSource === JSON.stringify(await sourceRows()));
  } finally { await prisma.$disconnect(); await milvus.closeConnection(); }
}
