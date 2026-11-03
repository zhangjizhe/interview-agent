import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { requireTenant } from '../../organizations/tenant-context';
import { QuestionCatalogIndexService, QuestionItem, QuestionVectorIndexService } from './question-vector-index.service';
export { QuestionItem, RerankedQuestion } from './question-vector-index.service';
export { escapeMilvusString } from './escape-milvus.util';

type Input = Omit<QuestionItem, 'id' | 'createdAt'>;
type Tx = Prisma.TransactionClient;
const payload = (item: Input) => ({ questionId: item.questionId, position: item.position, level: item.level,
  category: item.category, question: item.question, answer: item.answer, tags: item.tags });
const contractVersion = 'question-catalog/v1' as const;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Interview-owned canonical catalog, with an explicit, reversible-source adoption boundary. */
@Injectable()
export class QuestionBankService {
  constructor(private readonly prisma: PrismaService, private readonly legacy: QuestionVectorIndexService,
    private readonly index: QuestionCatalogIndexService) {}

  private async state() {
    return this.prisma.questionCatalogState.findUnique({ where: { organizationId: requireTenant().organizationId } });
  }

  /** Updating the tenant state row takes a PostgreSQL row lock for the entire transaction.
   * All ordinary legacy/catalog writes and adoption use the same lock across API instances. */
  private async locked<T>(work: (tx: Tx, mode: string) => Promise<T>): Promise<T> {
    const { organizationId } = requireTenant();
    return this.prisma.$transaction(async tx => {
      await tx.questionCatalogState.upsert({ where: { organizationId }, create: { organizationId }, update: {} });
      const state = await tx.questionCatalogState.update({ where: { organizationId }, data: { revision: { increment: 1 } } });
      return work(tx, state.mode);
    }, { maxWait: 5000, timeout: 180000 });
  }

  async catalogStatus() {
    const state = await this.state();
    if (state?.mode !== 'CATALOG') return { contractVersion, mode: 'LEGACY', canonicalStore: 'milvus-legacy', adoptionRequired: true };
    const { organizationId } = requireTenant();
    const active = { organizationId, deletedAt: null };
    const [count, pendingIndexCount] = await Promise.all([
      this.prisma.questionCatalogEntry.count({ where: active }),
      this.prisma.questionCatalogEntry.count({ where: { ...active, indexStatus: { not: 'READY' } } }),
    ]);
    return { contractVersion, mode: 'CATALOG', canonicalStore: 'postgresql', count, pendingIndexCount,
      sourceCount: state.sourceCount, sourceHash: state.sourceHash, adoptedAt: state.adoptedAt,
      legacySourceRetained: true, semanticQuality: 'not-assessed' };
  }

  /** No embeddings or source mutations. External/offline vector writers must be paused by operators. */
  async adoptLegacy(maintenanceConfirmed: boolean) {
    if (maintenanceConfirmed !== true) throw new BadRequestException('QUESTION_MAINTENANCE_CONFIRMATION_REQUIRED');
    return this.locked(async (tx, mode) => {
      if (mode === 'CATALOG') return { contractVersion, mode, reused: true, providerCalls: 0 };
      const { organizationId } = requireTenant();
      const rows = await this.legacy.readLegacySnapshot();
      const ids = new Set<string>();
      for (const row of rows) {
        if (ids.has(row.questionId)) throw new ConflictException('QUESTION_LEGACY_DUPLICATE_ID: reconcile source before adoption');
        ids.add(row.questionId);
        if (!Number.isFinite(Date.parse(row.createdAt))) throw new ConflictException('QUESTION_LEGACY_CREATED_AT_INVALID');
      }
      for (let offset = 0; offset < rows.length; offset += 20) this.legacy.validateItems(rows.slice(offset, offset + 20));
      const snapshotHash = (snapshot: QuestionItem[]) => hash(snapshot.map(row => ({ ...payload(row), createdAt: row.createdAt })).sort((a, b) => a.questionId.localeCompare(b.questionId)));
      const sourceHash = snapshotHash(rows);
      if (snapshotHash(await this.legacy.readLegacySnapshot()) !== sourceHash) throw new ConflictException('QUESTION_LEGACY_SOURCE_CHANGED');
      const entries = rows.map(row => {
        const id = randomUUID();
        return { id, organizationId, ...payload(row), currentVersion: 1, contentHash: hash(payload(row)),
          indexKey: `${id}:1`, indexStatus: 'PENDING', createdAt: new Date(row.createdAt) };
      });
      if (entries.length) {
        await tx.questionCatalogEntry.createMany({ data: entries });
        await tx.questionCatalogVersion.createMany({ data: entries.map(entry => ({ id: entry.indexKey, organizationId, entryId: entry.id,
          version: 1, contentHash: entry.contentHash, snapshot: payload(entry), origin: 'legacy-milvus-adoption/v1' })) });
      }
      await tx.questionCatalogState.update({ where: { organizationId }, data: { mode: 'CATALOG', adoptedAt: new Date(),
        sourceHash, sourceCount: rows.length } });
      return { contractVersion, mode: 'CATALOG', adoptedCount: rows.length, sourceHash, indexStatus: 'PENDING',
        legacySourceRetained: true, providerCalls: 0 };
    });
  }

  private item(row: any): QuestionItem & { version: number; contentHash: string; indexStatus: string } {
    return { ...payload(row), id: row.id, createdAt: row.createdAt.toISOString(), version: row.currentVersion,
      contentHash: row.contentHash, indexStatus: row.indexStatus, catalogVersionId: row.indexKey, catalogContentHash: row.contentHash };
  }

  async addQuestion(item: Input) {
    const result = await this.addQuestions([item]);
    return { questionId: item.questionId, ...result };
  }

  async addQuestions(items: Input[]) {
    this.legacy.validateItems(items);
    const saved = await this.locked(async (tx, mode) => {
      if (mode !== 'CATALOG') return { ...await this.legacy.addQuestions(items), mode: 'LEGACY' as const };
      const { organizationId } = requireTenant();
      const keys: string[] = [];
      for (const input of items) {
        const data = payload(input), contentHash = hash(data);
        const existing = await tx.questionCatalogEntry.findUnique({ where: { organizationId_questionId: { organizationId, questionId: input.questionId } } });
        if (existing && existing.contentHash === contentHash && !existing.deletedAt) continue;
        const id = existing?.id ?? randomUUID(), version = (existing?.currentVersion ?? 0) + 1;
        const indexKey = `${id}:${version}`;
        await tx.questionCatalogEntry.upsert({ where: { organizationId_questionId: { organizationId, questionId: input.questionId } },
          create: { id, organizationId, ...data, currentVersion: version, contentHash, indexKey, indexStatus: 'PENDING' },
          update: { ...data, currentVersion: version, contentHash, indexKey, indexStatus: 'PENDING', deletedAt: null } });
        await tx.questionCatalogVersion.create({ data: { id: indexKey, organizationId, entryId: id, version, contentHash, snapshot: data, origin: 'question-bank-api/v1' } });
        keys.push(indexKey);
      }
      return { count: items.length, mode: 'CATALOG' as const, keys };
    });
    if (saved.mode === 'LEGACY') return { count: saved.count };
    // Canonical commit precedes indexing. An index failure must never erase saved questions.
    if (saved.keys.length) await this.indexKeys(saved.keys);
    const pending = await this.prisma.questionCatalogEntry.count({ where: { organizationId: requireTenant().organizationId,
      questionId: { in: items.map(item => item.questionId) }, deletedAt: null, indexStatus: { not: 'READY' } } });
    return { count: saved.count, mode: 'CATALOG', canonicalStatus: 'SAVED', indexStatus: pending ? 'PENDING' : 'READY' };
  }

  private async indexKeys(keys: string[]): Promise<boolean> {
    try {
      return await this.locked(async (tx, mode) => {
        if (mode !== 'CATALOG') throw new ConflictException('QUESTION_CATALOG_REQUIRED');
        const organizationId = requireTenant().organizationId;
        const rows = await tx.questionCatalogEntry.findMany({ where: { organizationId, indexKey: { in: keys }, deletedAt: null, indexStatus: { not: 'READY' } } });
        if (!rows.length) return true;
        await this.index.addQuestions(rows.map(row => ({ ...payload(row), questionId: row.indexKey })));
        await tx.questionCatalogEntry.updateMany({ where: { organizationId, indexKey: { in: rows.map(row => row.indexKey) }, deletedAt: null }, data: { indexStatus: 'READY' } });
        return true;
      });
    } catch { return false; } // Durable PENDING is the explicit retry receipt; no provider retry here.
  }

  /** At most 20 items per explicit administrator request; no automatic paid replay. */
  async rebuildIndex(questionIds?: string[]) {
    if (questionIds !== undefined && (!Array.isArray(questionIds) || questionIds.length < 1 || questionIds.length > 20
      || questionIds.some(id => typeof id !== 'string' || !id.trim() || Buffer.byteLength(id) > 100)
      || new Set(questionIds).size !== questionIds.length)) throw new BadRequestException('QUESTION_INDEX_IDS_INVALID');
    if (await this.state().then(state => state?.mode) !== 'CATALOG') throw new ConflictException('QUESTION_CATALOG_REQUIRED');
    const keys = await this.locked(async tx => {
      const organizationId = requireTenant().organizationId;
      const rows = await tx.questionCatalogEntry.findMany({ where: { organizationId, deletedAt: null,
        ...(questionIds ? { questionId: { in: questionIds } } : { indexStatus: { not: 'READY' } }) }, orderBy: { id: 'asc' }, take: 20 });
      if (questionIds && rows.length !== new Set(questionIds).size) throw new ConflictException('QUESTION_CATALOG_IDS_NOT_FOUND');
      await tx.questionCatalogEntry.updateMany({ where: { organizationId, indexKey: { in: rows.map(row => row.indexKey) } }, data: { indexStatus: 'PENDING' } });
      return rows.map(row => row.indexKey);
    });
    const ready = await this.indexKeys(keys);
    return { contractVersion, requestedCount: keys.length, canonicalStatus: 'SAVED', indexStatus: ready ? 'READY' : 'PENDING' };
  }

  async list(position?: string, limit = 20): Promise<QuestionItem[]> {
    if ((await this.state())?.mode !== 'CATALOG') return this.legacy.list(position, limit);
    const rows = await this.prisma.questionCatalogEntry.findMany({ where: { organizationId: requireTenant().organizationId,
      deletedAt: null, ...(position ? { position } : {}) }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: limit });
    return rows.map(row => this.item(row));
  }

  async selectInitial(position: string, level: string, category: string): Promise<QuestionItem[]> {
    if ((await this.state())?.mode !== 'CATALOG') return this.legacy.selectInitial(position, level, category);
    const rows = await this.prisma.questionCatalogEntry.findMany({ where: { organizationId: requireTenant().organizationId,
      deletedAt: null, level, category }, orderBy: { questionId: 'asc' }, take: 100 });
    return rows.sort((a, b) => Number(b.position === position) - Number(a.position === position))
      .slice(0, 5).map(row => ({ ...this.item(row), answer: '' }));
  }

  async search(query: string, options: Parameters<QuestionVectorIndexService['search']>[1] = {}) {
    if ((await this.state())?.mode !== 'CATALOG') return this.legacy.search(query, options);
    const organizationId = requireTenant().organizationId;
    if (await this.prisma.questionCatalogEntry.count({ where: { organizationId, deletedAt: null, indexStatus: { not: 'READY' } } })) {
      throw new ServiceUnavailableException('QUESTION_INDEX_PENDING: saved catalog is available through list; rebuild index before semantic search');
    }
    // Index text is never authoritative. Hydrate only live, exact current-version keys.
    const found = await this.index.search(query, { ...options, limit: 100, rerank: false });
    const rows = await this.prisma.questionCatalogEntry.findMany({ where: { organizationId, deletedAt: null,
      indexStatus: 'READY', indexKey: { in: found.map(row => row.questionId) },
      ...(options.position ? { position: options.position } : {}), ...(options.level ? { level: options.level } : {}),
      ...(options.category ? { category: options.category } : {}) } });
    const current = new Map(rows.map(row => [row.indexKey, row]));
    const seen = new Set<string>();
    const hydrated = found.flatMap(hit => {
      const row = current.get(hit.questionId);
      if (!row || seen.has(row.id)) return [];
      seen.add(row.id);
      return [{ ...this.item(row), score: hit.score }];
    });
    const candidates = hydrated.slice(0, options.limit ?? 5);
    const ranked = options.rerank === false ? candidates : await this.index.rerankCurrent(query, candidates);
    return ranked.slice(0, options.limit ?? 5);
  }

  async deleteQuestion(questionId: string) {
    return this.locked(async (tx, mode) => {
      if (mode !== 'CATALOG') return this.legacy.deleteQuestion(questionId);
      // Tombstones protect retrieval even if the vector service is unavailable. Historical versions remain.
      await tx.questionCatalogEntry.updateMany({ where: { organizationId: requireTenant().organizationId, questionId, deletedAt: null }, data: { deletedAt: new Date() } });
      return { deleted: true };
    });
  }

  extractQuestionsFromText(...args: Parameters<QuestionVectorIndexService['extractQuestionsFromText']>) {
    return this.legacy.extractQuestionsFromText(...args);
  }

  async importQuestions(args: { text: string; position: string; level?: string; category?: string; source: string }) {
    const rows = await this.extractQuestionsFromText(args.text, args.position, args.level, args.category);
    if (!rows.length) return { count: 0, questionIds: [] };
    const result = await this.addQuestions(rows);
    return { ...result, questionIds: rows.map(row => row.questionId) };
  }
}
