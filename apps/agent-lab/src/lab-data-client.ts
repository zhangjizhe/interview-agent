import { api } from './api';
export type DataAccess = 'OWNER' | 'READ' | 'WRITE';
export type DataChoice = { id: string; name: string; kind: 'QUESTION' | 'ARTICLE' | 'DOCUMENT'; access: DataAccess };
export type DataRecord = { id: string; collectionId: string; title: string; content: string; sourceUrl?: string | null; tags: string[]; revision: number };
const invalid = () => new Error('资料读取响应不完整，请重试读取；未将失败当成空数据。');
const access = (value: unknown): value is DataAccess => ['OWNER', 'READ', 'WRITE'].includes(String(value));
export async function readDataPage<T>(path: string): Promise<{ items: T[]; hasMore: boolean; page: number }> {
  const data = await api(path, { signal: AbortSignal.timeout(15000) });
  const requested = Number(new URL(path, 'https://local.invalid').searchParams.get('page') || '1');
  if (!Array.isArray(data?.items) || typeof data.hasMore !== 'boolean' || data.page !== requested || data.items.length > 50
    || data.items.some((item: any) => !item || typeof item.id !== 'string' || !item.id)
    || new Set(data.items.map((item: any) => item.id)).size !== data.items.length) throw invalid();
  return data;
}
export async function readCollectionPage(path: string) {
  const data = await readDataPage<DataChoice>(path);
  if (data.items.some(item => typeof item.name !== 'string' || !['QUESTION', 'ARTICLE', 'DOCUMENT'].includes(item.kind) || !access(item.access))) throw invalid();
  return data;
}
export async function readRecordPage(path: string, collectionId: string) {
  const data = await readDataPage<DataRecord>(path) as Awaited<ReturnType<typeof readDataPage<DataRecord>>> & { access: DataAccess };
  if (!access(data.access) || data.items.some(item => item.collectionId !== collectionId || typeof item.title !== 'string'
    || typeof item.content !== 'string' || !Number.isInteger(item.revision) || item.revision < 1 || !Array.isArray(item.tags)
    || item.tags.some(tag => typeof tag !== 'string') || (item.sourceUrl && !/^https?:\/\//i.test(item.sourceUrl)))) throw invalid();
  return data;
}
