/**
 * JSON 解析工具 - v13 原有 `\{[\s\S]*\}` 贪婪匹配在 LLM 返回 markdown + 嵌套 array 时会挂
 *
 * extractFirstJsonObject:扫描字符串，平衡花括号，找到第一个完整 JSON object
 * stripJsonFence:剥离 ```json ... ``` 包装
 * safeJsonParse:组合以上两者 + 详细错误信息
 */

/** 从 LLM 输出中提取第一个完整 JSON object（处理 markdown 包裹、嵌套大括号、转义） */
export function extractFirstJsonObject(text: string): string | null {
  if (!text) return null;

  // 1. 先剥 markdown ```json ... ``` 包装
  const stripped = stripJsonFence(text);

  // 2. 找第一个 {
  const startIdx = stripped.indexOf('{');
  if (startIdx < 0) return null;

  // 3. 平衡花括号扫描（处理字符串内转义）
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = startIdx; i < stripped.length; i++) {
    const ch = stripped[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return stripped.slice(startIdx, i + 1);
      }
    }
  }
  return null;
}

/**
 * 容错 JSON 解析：当 LLM 输出有轻微格式问题时做修复
 * - 单引号 → 双引号
 * - 末尾逗号去除
 * - 注释去除（// 和 /* ... *\/）
 * - 未引号 key 加引号
 */
export function repairJsonLoose(text: string): string {
  let s = text;
  // 1. 去掉单行注释 //
  s = s.replace(/\/\/.*$/gm, '');
  // 2. 去掉多行注释 /* ... */
  s = s.replace(/\/\*[\s\S]*?\*\//g, '');
  // 3. 去掉尾逗号 ,} 或 ,]
  s = s.replace(/,(\s*[}\]])/g, '$1');
  // 4. 未引号的 key 加引号："word": → "word":
  //    只处理 [a-zA-Z_] 开头 + : 跟随 + 不是数字/true/false/null
  s = s.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
  // 5. 单引号字符串 → 双引号（保守：只在 value 位置）
  s = s.replace(/:\s*'([^']*)'/g, ': "$1"');
  return s;
}

/** 剥 ```json ... ``` 或 ``` ... ``` 包装 */
export function stripJsonFence(text: string): string {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (m) return m[1].trim();
  return text.trim();
}

/** 安全解析：返回 { ok, value, error } */
export function safeJsonParse<T = any>(text: string): { ok: true; value: T } | { ok: false; error: string } {
  const jsonStr = extractFirstJsonObject(text);
  if (!jsonStr) {
    return { ok: false, error: 'No JSON object found in text' };
  }
  // 先试标准解析
  try {
    return { ok: true, value: JSON.parse(jsonStr) as T };
  } catch (firstErr: any) {
    // 容错修复:去尾逗号 + 去注释 + 加引号 key
    const repaired = repairJsonLoose(jsonStr);
    try {
      return { ok: true, value: JSON.parse(repaired) as T };
    } catch (secondErr: any) {
      return {
        ok: false,
        error: `JSON parse error: ${firstErr.message}; repair failed: ${secondErr.message} (snippet: ${jsonStr.slice(0, 80)}...)`,
      };
    }
  }
}
