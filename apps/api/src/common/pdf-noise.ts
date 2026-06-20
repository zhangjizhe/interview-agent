/**
 * PDF 文本清洗工具 — 清洗 pdf-parse 偶发泄漏的 PDF 内部 PostScript 语法。
 *
 * 修复背景（2026-06-21）：pdf-parse@1.1.x 在复杂排版/自定义字体/在线简历工具
 * 导出 PDF 上会把 PDF 内部语法泄漏到 text 字段（%PDF-1.7、/ICCBased 11 0 R、
 * /Type /Catalog、/Length、stream 标记等），LLM 收到就把 PDF 元数据当真。
 *
 * 提供 2 个工具：
 *  - scrubPdfStructureNoise(text): 行级清洗，删含 PDF PostScript 标识的整行
 *  - isPdfStructureToken(s): 短字符串级检测，用于 extractName/extractSkills
 *    兜底（"提取出来的姓名/技能是不是 PDF 元数据？"）
 */

const PDF_STRUCTURE_LINE_PATTERNS: RegExp[] = [
  /%PDF-\d/i, // PDF 头
  /%%EOF/i, // PDF 尾
  /\bstartxref\b/i,
  /\b\d+\s+\d+\s+obj\b/, // "11 0 obj"
  /\bendobj\b/i,
  /\bbeginobj\b/i,
  /^\s*<<\s*$/,
  /^\s*>>\s*$/,
  /^\s*stream\s*$/i,
  /^\s*endstream\s*$/i,
  /\/ICCBased\b/i,
  /\/MediaBox\b/i,
  /\/Resources\b/i,
  /\/Type\s+\/[\w-]+/i, // /Type /Catalog /Type /Pages /Type /Font 等
  /\/Subtype\s+\/[\w-]+/i, // /Subtype /Type1 /Subtype /TrueType 等
  /\/Filter\s+\/[\w-]+/i, // /Filter /FlateDecode 等
  /\/Length\s+\d+/i, // /Length 1234
  /^\/[\w.-]+\s+\d+\s+\d+\s+R\s*$/i, // 整行是对象引用 "/F1 12 0 R"
  /^\/[\w.-]+\s+[-\d.]+\s+(Tf|Tm|Td|TD|T\*|Tj|TJ)\s*$/i, // 整行是字体/矩阵命令 "/F1 12 Tf"
  /^\/[\w.-]+\s+<<\s*$/i, // 整行是字典开始 "/Font <<"
];

/**
 * 清洗 PDF 内部结构噪音 — 删整行含 PDF PostScript 标记的内容。
 * 设计：宁严勿松——"PDF 元数据混进简历正文"的概率远大于"简历里写 /Type /Catalog"。
 */
export function scrubPdfStructureNoise(text: string): string {
  if (!text) return text;
  const lines = text.split('\n');
  const cleaned: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      cleaned.push('');
      continue;
    }
    if (PDF_STRUCTURE_LINE_PATTERNS.some((re) => re.test(line))) {
      continue;
    }
    // 移除控制字符（保留 \n \r \t）
    const noCtrl = line.replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '');
    if (noCtrl) cleaned.push(noCtrl);
  }
  return cleaned.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// 短字符串级 PDF 结构 token 检测（用于 extractName/extractSkills 兜底）
// 例如：%PDF-1.7、/ICCBased、/Type /Catalog、stream、endstream、startxref、%EOF
const PDF_STRUCTURE_TOKEN_RE =
  /^(?:%PDF-\d+(?:\.\d+)?|%%EOF|%EOF|startxref|endobj|beginobj|stream|endstream|trailer|xref|\d+\s+\d+\s+obj|\/[\w.-]+\s+\d+\s+\d+\s+R|\/[\w.-]+\s+[-\d.]+\s+(?:Tf|Tm|Td|TD|T\*|Tj|TJ)|\/Type\s|\/Subtype\s|\/Filter\s|\/Length\s|\/MediaBox\b|\/Resources\b|\/ICCBased\b|\/Font\b|\/Encoding\b|\/BaseFont\b|\/FontDescriptor\b|<<|>>).*$/i;

const HAS_PDF_STRUCTURE_RE =
  /%PDF-\d|%%EOF|\bstartxref\b|\/ICCBased|\/Type\s+\/|<<\s*\/|\bstream\b|\bendstream\b|\bendobj\b|\/Length\s+\d+/i;

/**
 * 判断一个短字符串是否是 PDF 内部结构 token（用于 extractName/extractSkills 兜底）
 */
export function isPdfStructureToken(s: string): boolean {
  if (!s) return false;
  const t = s.trim();
  if (!t) return false;
  return PDF_STRUCTURE_TOKEN_RE.test(t);
}

/**
 * 判断文本是否"看起来含 PDF 结构噪音"（粗筛，用于清洗前/写入前的快速判断）
 */
export function looksLikePdfStructureNoise(text: string): boolean {
  if (!text) return false;
  return HAS_PDF_STRUCTURE_RE.test(text);
}
