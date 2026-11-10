import { BadRequestException } from '@nestjs/common';
export const MAX_DATA_COLLECTIONS = 5;
export const MAX_DATA_CONTEXT_BYTES = 8000;
export function dataCollectionIds(bindings: unknown): string[] {
  if (bindings === undefined || bindings === null) return [];
  if (typeof bindings !== 'object' || Array.isArray(bindings)) throw new BadRequestException('资料绑定必须为对象');
  const value = bindings as Record<string, unknown>;
  if (!Object.keys(value).length) return [];
  if (Object.keys(value).some(key => key !== 'collectionIds') || !Array.isArray(value.collectionIds)
    || value.collectionIds.length > MAX_DATA_COLLECTIONS || value.collectionIds.some(id => typeof id !== 'string' || !id.trim() || id.length > 100)
    || new Set(value.collectionIds).size !== value.collectionIds.length) throw new BadRequestException('须显式绑定至多5个不同资料集合');
  return value.collectionIds as string[];
}
