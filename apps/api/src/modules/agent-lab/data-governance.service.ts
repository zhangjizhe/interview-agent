import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { requireTenant } from '../organizations/tenant-context';
import { getOrCreateOwnedWorkspace, requireActor } from './workspace-access';
import { CreateDataCollectionDto, CreateDataRecordDto, DataGrantDto, DataPageDto, UpdateDataRecordDto } from './dto/data.dto';
import { dataCollectionIds, MAX_DATA_CONTEXT_BYTES } from './data-bindings.contract';

type Db = Prisma.TransactionClient;
export type DataReference = { collectionId: string; kind: string; recordId: string; versionId: string; revision: number; contentHash: string };

@Injectable()
export class DataGovernanceService {
  constructor(private readonly prisma: PrismaService) {}
  private access(userId: string, write = false): Prisma.LabDataCollectionWhereInput {
    return { organizationId: requireTenant().organizationId, deletedAt: null, OR: [
      { ownerId: userId }, { grants: { some: { userId, ...(write ? { access: 'WRITE' as const } : {}) } } },
    ] };
  }
  private async collection(db: Db, userId: string, id: string, write = false, owner = false) {
    const value = await db.labDataCollection.findFirst({ where: {
      ...this.access(userId, write), id, ...(owner ? { ownerId: userId } : {}),
    } });
    if (!value) throw new NotFoundException('资料集合不存在或无权访问');
    return value;
  }
  private async mutate<T>(userId: string, id: string, owner: boolean, work: (tx: Db) => Promise<T>) {
    requireActor(userId);
    return this.prisma.$transaction(async tx => {
      // All writers, including grant/revoke/archive, take this row lock first.
      // Recheck ACL after waiting, before touching records; a denied write rolls back.
      const locked = await tx.labDataCollection.updateMany({ where: { id, organizationId: requireTenant().organizationId, deletedAt: null }, data: { revision: { increment: 1 } } });
      if (!locked.count) throw new NotFoundException('资料集合不存在或无权访问');
      await this.collection(tx, userId, id, true, owner);
      return work(tx);
    }, { maxWait: 5000, timeout: 10000 });
  }
  private audit(tx: Db, actorId: string, collectionId: string, action: string, targetId: string) {
    return tx.labDataAudit.create({ data: { organizationId: requireTenant().organizationId, actorId, collectionId, action, targetId } });
  }
  async list(userId: string, page: DataPageDto) {
    requireActor(userId);
    const where = { ...this.access(userId), ...(page.kind ? { kind: page.kind } : {}), ...(page.q?.trim() ? { name: { contains: page.q.trim(), mode: 'insensitive' as const } } : {}) };
    const rows = await this.prisma.labDataCollection.findMany({ where, skip: (page.page - 1) * page.limit, take: page.limit + 1,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], include: { grants: { where: { userId }, select: { access: true } }, _count: { select: { records: { where: { deletedAt: null } } } } } });
    return { items: rows.slice(0, page.limit).map(({ grants, ...row }) => ({ ...row, access: row.ownerId === userId ? 'OWNER' : grants[0]?.access })), hasMore: rows.length > page.limit, page: page.page };
  }
  async create(userId: string, dto: CreateDataCollectionDto) {
    requireActor(userId);
    const workspace = await getOrCreateOwnedWorkspace(this.prisma, userId);
    return this.prisma.$transaction(async tx => {
      const row = await tx.labDataCollection.create({ data: { organizationId: requireTenant().organizationId, workspaceId: workspace.id, ownerId: userId, kind: dto.kind, name: dto.name.trim() } });
      await this.audit(tx, userId, row.id, 'COLLECTION_CREATE', row.id);
      return { ...row, access: 'OWNER' };
    });
  }
  async archive(userId: string, id: string) {
    return this.mutate(userId, id, true, async tx => {
      await tx.labDataCollection.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit(tx, userId, id, 'COLLECTION_ARCHIVE', id);
      return { id, archived: true };
    });
  }
  async records(userId: string, id: string, page: DataPageDto) {
    requireActor(userId);
    const collection = await this.collection(this.prisma, userId, id);
    // ACL is part of the content query too, so a concurrent revocation cannot
    // turn a prior metadata check into an unscoped record read.
    const where: Prisma.LabDataRecordWhereInput = { collectionId: id, collection: this.access(userId), deletedAt: null,
      ...(page.q?.trim() ? { OR: [{ title: { contains: page.q.trim(), mode: 'insensitive' } }, { content: { contains: page.q.trim(), mode: 'insensitive' } }] } : {}) };
    const items = await this.prisma.labDataRecord.findMany({ where, take: page.limit + 1, skip: (page.page - 1) * page.limit, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }] });
    const grant = collection.ownerId === userId ? null : await this.prisma.labDataGrant.findFirst({ where: { collectionId: id, userId, collection: this.access(userId) } });
    if (collection.ownerId !== userId && !grant) throw new NotFoundException('资料集合不存在或无权访问');
    return { items: items.slice(0, page.limit), hasMore: items.length > page.limit, page: page.page, access: collection.ownerId === userId ? 'OWNER' : grant!.access };
  }
  private value(dto: CreateDataRecordDto) {
    const value = { title: dto.title.trim(), content: dto.content, sourceUrl: dto.sourceUrl || null, tags: dto.tags || [] };
    return { ...value, contentHash: createHash('sha256').update(JSON.stringify(value)).digest('hex') };
  }
  private async snapshot(tx: Db, actorId: string, row: any) {
    await tx.labDataRecordVersion.create({ data: { id: `${row.id}:${row.revision}`, organizationId: row.organizationId, recordId: row.id,
      revision: row.revision, contentHash: row.contentHash, actorId,
      snapshot: { title: row.title, content: row.content, sourceUrl: row.sourceUrl, tags: row.tags } } });
  }
  async createRecord(userId: string, id: string, dto: CreateDataRecordDto) {
    return this.mutate(userId, id, false, async tx => {
      const row = await tx.labDataRecord.create({ data: { organizationId: requireTenant().organizationId, collectionId: id, ...this.value(dto) } });
      await this.snapshot(tx, userId, row); await this.audit(tx, userId, id, 'RECORD_CREATE', row.id);
      return row;
    });
  }
  async updateRecord(userId: string, id: string, recordId: string, dto: UpdateDataRecordDto) {
    return this.mutate(userId, id, false, async tx => {
      const old = await tx.labDataRecord.findFirst({ where: { id: recordId, collectionId: id, deletedAt: null } });
      if (!old) throw new NotFoundException('资料不存在或无权访问');
      if (old.revision !== dto.revision) throw new ConflictException('资料已被更新，请重新读取后编辑');
      const row = await tx.labDataRecord.update({ where: { id: recordId }, data: { ...this.value(dto), revision: { increment: 1 } } });
      await this.snapshot(tx, userId, row); await this.audit(tx, userId, id, 'RECORD_UPDATE', row.id);
      return row;
    });
  }
  async deleteRecord(userId: string, id: string, recordId: string, revision: number) {
    return this.mutate(userId, id, false, async tx => {
      const row = await tx.labDataRecord.findFirst({ where: { id: recordId, collectionId: id, deletedAt: null } });
      if (!row) throw new NotFoundException('资料不存在或无权访问');
      if (row.revision !== revision) throw new ConflictException('资料已被更新，请重新读取后删除');
      await tx.labDataRecord.update({ where: { id: recordId }, data: { deletedAt: new Date() } });
      await this.audit(tx, userId, id, 'RECORD_DELETE', recordId);
      return { id: recordId, deleted: true };
    });
  }
  async history(userId: string, id: string, recordId: string, page: DataPageDto) {
    requireActor(userId);
    await this.collection(this.prisma, userId, id);
    const items = await this.prisma.labDataRecordVersion.findMany({ where: { recordId, record: { collectionId: id, collection: this.access(userId) } },
      take: page.limit + 1, skip: (page.page - 1) * page.limit, orderBy: { revision: 'desc' } });
    if (!items.length && page.page === 1) throw new NotFoundException('资料历史不存在或无权访问');
    return { items: items.slice(0, page.limit), hasMore: items.length > page.limit, page: page.page };
  }
  async grants(userId: string, id: string, page: DataPageDto) {
    requireActor(userId); await this.collection(this.prisma, userId, id, false, true);
    const items = await this.prisma.labDataGrant.findMany({ where: { collectionId: id, collection: { ownerId: userId, deletedAt: null } }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: page.limit + 1, skip: (page.page - 1) * page.limit });
    return { items: items.slice(0, page.limit), hasMore: items.length > page.limit, page: page.page };
  }
  async grant(userId: string, id: string, dto: DataGrantDto) {
    return this.mutate(userId, id, true, async tx => {
      if (dto.userId === userId) throw new BadRequestException('所有者已有管理权限，无需自我授权');
      const grantee = await tx.user.findFirst({ where: { id: dto.userId, organizationId: requireTenant().organizationId }, select: { id: true } });
      if (!grantee) throw new NotFoundException('授权对象不存在或不在当前组织');
      const row = await tx.labDataGrant.upsert({ where: { collectionId_userId: { collectionId: id, userId: dto.userId } },
        create: { organizationId: requireTenant().organizationId, collectionId: id, userId: dto.userId, access: dto.access }, update: { access: dto.access } });
      await this.audit(tx, userId, id, 'GRANT_SET', row.id);
      return row;
    });
  }
  async revoke(userId: string, id: string, granteeId: string) {
    return this.mutate(userId, id, true, async tx => {
      await tx.labDataGrant.deleteMany({ where: { collectionId: id, userId: granteeId } });
      await this.audit(tx, userId, id, 'GRANT_REVOKE', granteeId);
      return { revoked: true, userId: granteeId };
    });
  }
  async auditEvents(userId: string, id: string, page: DataPageDto) {
    requireActor(userId);
    const owner = await this.prisma.labDataCollection.findFirst({ where: { id, ownerId: userId } });
    if (!owner) throw new NotFoundException('资料集合不存在或无权访问');
    const items = await this.prisma.labDataAudit.findMany({ where: { collectionId: id, collection: { ownerId: userId } }, take: page.limit + 1,
      skip: (page.page - 1) * page.limit, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] });
    return { items: items.slice(0, page.limit), hasMore: items.length > page.limit, page: page.page };
  }
  async validateBindings(workspaceId: string, ids: string[]) {
    const userId = requireTenant().userId;
    if (!userId) throw new NotFoundException('资料授权身份缺失');
    const workspace = await this.prisma.workspace.findFirst({ where: { id: workspaceId, ownerId: userId } });
    if (!workspace) throw new NotFoundException('工作区不存在或无权访问');
    if (!ids.length) return;
    const allowed = await this.prisma.labDataCollection.count({ where: { ...this.access(userId), id: { in: ids } } });
    if (allowed !== ids.length) throw new NotFoundException('绑定的资料集合不存在或授权已失效');
  }
  async contextForVersion(userId: string, workspaceId: string, versionId: string, query: string) {
    requireActor(userId);
    const version = await this.prisma.agentVersion.findFirst({ where: { id: versionId, parentAgent: { workspaceId, workspace: { ownerId: userId } } } });
    if (!version) throw new NotFoundException('Agent版本不存在或无权访问');
    const ids = dataCollectionIds(version.knowledgeBindings);
    await this.validateBindings(workspaceId, ids);
    if (!ids.length) return { text: '', references: [] as DataReference[] };
    const words = [...new Set(query.slice(0, 200).match(/[A-Za-z0-9_-]{2,40}|[\p{Script=Han}]{2}/gu) || [])].slice(0, 12);
    const rows = await this.prisma.labDataRecord.findMany({ where: { collectionId: { in: ids }, deletedAt: null, collection: this.access(userId),
      ...(words.length ? { OR: words.flatMap(word => [{ title: { contains: word, mode: 'insensitive' as const } }, { content: { contains: word, mode: 'insensitive' as const } }]) } : {}) },
      include: { collection: { select: { kind: true } } }, take: 5, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }] });
    await this.validateBindings(workspaceId, ids);
    const sources: Array<DataReference & { title: string; content: string }> = [];
    for (const row of rows) {
      const source = { collectionId: row.collectionId, kind: row.collection.kind, recordId: row.id, versionId: `${row.id}:${row.revision}`,
        revision: row.revision, contentHash: row.contentHash, title: row.title, content: row.content.slice(0, 1200) };
      while (source.content && Buffer.byteLength(JSON.stringify([...sources, source]), 'utf8') > MAX_DATA_CONTEXT_BYTES) source.content = source.content.slice(0, Math.floor(source.content.length * 0.8));
      if (source.content) sources.push(source);
    }
    return { text: sources.length ? JSON.stringify(sources) : '', references: sources.map(({ title: _title, content: _content, ...reference }) => reference) };
  }
}
