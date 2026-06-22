/**
 * Milvus filter expression 字符串转义工具
 *
 * Milvus filter 语法：`position == "frontend"`、`level == "P6"`
 * 如果用户输入包含反斜杠或双引号，filter 会被注入绕过（如 position == "\"; "1==1）。
 *
 * 修复（P0-1）：先转义反斜杠 `\` → `\\`（避免双重转义我们后加的引号转义），
 * 再转义双引号 `"` → `\"`。
 *
 * 独立文件：避免 question-bank.service.ts 拉 Milvus SDK（@zilliz/milvus2-sdk-node
 *  依赖 thrift / parquetjs，在 Node 18 ESM 解析时报错）。
 */

export function escapeMilvusString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
