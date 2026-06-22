/**
 * reviewer.ts 单元测试 - inferSourceType 动态推断
 *
 * 覆盖 R-P2-2 修复：
 *  - bocha_search → web_search
 *  - memory_recall → memory
 *  - github_* → github_repo
 *  - 其他（含 knowledge_bank）→ knowledge_bank（兼容旧数据）
 *  - 无 tool → knowledge_bank
 */
import { inferSourceType } from '../agents/multi-agent/nodes/reviewer';

describe('inferSourceType - 动态推断 citation 来源（R-P2-2 修复）', () => {
  it('bocha_search → web_search', () => {
    expect(inferSourceType('bocha_search')).toBe('web_search');
  });

  it('memory_recall → memory', () => {
    expect(inferSourceType('memory_recall')).toBe('memory');
  });

  it('github_get_repo → github_repo（github_ 前缀匹配）', () => {
    expect(inferSourceType('github_get_repo')).toBe('github_repo');
  });

  it('github_search → github_repo（github_ 前缀匹配）', () => {
    expect(inferSourceType('github_search')).toBe('github_repo');
  });

  it('knowledge_bank → knowledge_bank（兼容旧数据）', () => {
    expect(inferSourceType('knowledge_bank')).toBe('knowledge_bank');
  });

  it('未知 tool → knowledge_bank（默认）', () => {
    expect(inferSourceType('unknown_tool')).toBe('knowledge_bank');
  });

  it('无 tool (undefined) → knowledge_bank（默认）', () => {
    expect(inferSourceType()).toBe('knowledge_bank');
    expect(inferSourceType(undefined)).toBe('knowledge_bank');
  });

  it('空字符串 → knowledge_bank（默认）', () => {
    expect(inferSourceType('')).toBe('knowledge_bank');
  });
});
