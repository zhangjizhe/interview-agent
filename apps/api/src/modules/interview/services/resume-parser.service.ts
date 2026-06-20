import { Injectable, Logger } from '@nestjs/common';

export interface ResumeAnalysis {
  name: string;
  email: string;
  position: string;
  yearsOfExperience: number;
  skills: string[];
  education: string[];
  experience: string[];
  projects: string[];
  keywords: string[];
  summary: string;
  seniority: 'junior' | 'mid' | 'senior' | 'architect';
}

export interface ParsedResume extends ResumeAnalysis {
  rawText: string;
}

@Injectable()
export class ResumeParserService {
  private readonly logger = new Logger(ResumeParserService.name);
  private readonly skillKeywords = new Set([
    'react', 'vue', 'angular', 'javascript', 'typescript', 'node',
    'python', 'java', 'go', 'golang', 'rust', 'c++', 'c#',
    'docker', 'kubernetes', 'k8s', 'aws', 'gcp', 'azure',
    '微服务', '分布式', '高并发', '数据库', 'mysql', 'postgresql', 'redis', 'mongodb',
    'graphql', 'rest', 'grpc', '消息队列', 'kafka', 'rabbitmq',
    '前端', '后端', '全栈', '算法', '大数据', '机器学习', '深度学习',
    '项目管理', '团队管理', '架构设计',
  ]);

  async parse(fileOrText: any, userPosition?: string): Promise<ParsedResume> {
    let rawText: string;
    if (typeof fileOrText === 'string') {
      rawText = fileOrText;
    } else if (fileOrText?.buffer) {
      // 根据文件类型选择解析方式：PDF 用 pdfjs-dist@4 (鲁棒) + pdf-parse 兜底，二进制/文本直接读
      const isPdf =
        fileOrText.mimetype === 'application/pdf' ||
        (fileOrText.originalname || '').toLowerCase().endsWith('.pdf');
      if (isPdf) {
        rawText = await this.extractPdfText(fileOrText.buffer);
        this.logger.log(`PDF 解析完成：${rawText.length} 字符`);
      } else {
        // .txt / .md / .docx(转纯文本) — UTF-8 解码
        rawText = fileOrText.buffer.toString('utf-8');
      }
    } else {
      throw new Error('Invalid input: expected a string or a file object with buffer');
    }

    // 清洗 PDF 内部结构噪音（兜底，对付 pdf-parse 偶发的元数据泄漏，如 %PDF-1.7 / /ICCBased）
    rawText = this.scrubPdfStructureNoise(rawText);

    const text = rawText.trim().toLowerCase();
    const sentences = rawText.split(/[\n。！？]/).map((s) => s.trim()).filter((s) => s);

    const skills = this.extractSkills(text);
    const yearsExp = this.extractYearsOfExperience(text);
    const position = userPosition || this.detectPosition(skills);
    const name = this.extractName(rawText);
    const email = this.extractEmail(rawText);
    const education = this.extractEducation(sentences);
    const experience = this.extractExperience(sentences);
    const projects = this.extractProjects(sentences);
    const keywords = this.extractKeywords(text);
    const summary = this.generateSummary({ skills, yearsExp, position });
    const seniority = this.determineSeniority(yearsExp, skills.length);

    return {
      name,
      email,
      position,
      yearsOfExperience: yearsExp,
      skills,
      education,
      experience,
      projects,
      keywords,
      summary,
      seniority,
      rawText,
    };
  }

  private extractSkills(text: string): string[] {
    const found: string[] = [];
    for (const keyword of this.skillKeywords) {
      if (text.includes(keyword)) {
        found.push(keyword);
      }
    }
    // 按原文提取
    const explicitMatches = text.match(/[【\[\(（][^\]】\)）]+/g);
    if (explicitMatches) {
      explicitMatches.forEach((m) => {
        const cleaned = m.replace(/[【\[\(（\]】\)）]/g, '').trim();
        if (cleaned.length > 0 && cleaned.length < 20) {
          found.push(cleaned);
        }
      });
    }
    return [...new Set(found)].slice(0, 20);
  }

  private extractYearsOfExperience(text: string): number {
    const yearMatch = text.match(/(\d+)年.*年|(\d+)\+?\s*年|(\d+)\s*years?/i);
    if (yearMatch) {
      return Math.min(parseInt(yearMatch[1] || yearMatch[2] || yearMatch[3] || '3', 10), 20);
    }
    return 3; // 默认3年
  }

  private extractName(text: string): string {
    const lines = text.split('\n').map((l) => l.trim()).filter((l) => l);
    // 简历开头的短句子通常是姓名
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      if (lines[i].length < 10 && !lines[i].includes('@') && lines[i].length > 0) {
        return lines[i];
      }
    }
    return '候选人';
  }

  private extractEmail(text: string): string {
    const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    return emailMatch ? emailMatch[0] : '';
  }

  private detectPosition(skills: string[]): string {
    const frontendCount = skills.filter((s) => ['react', 'vue', 'angular', '前端', 'javascript', 'typescript', 'html', 'css'].some((p) => s.includes(p))).length;
    const backendCount = skills.filter((s) => ['后端', 'node', 'java', 'python', 'go', 'java', '数据库', 'mysql', '微服务'].some((p) => s.includes(p))).length;
    const algorithmCount = skills.filter((s) => ['算法', '机器学习', '深度学习', '大数据', 'ai'].some((p) => s.includes(p))).length;

    if (frontendCount > Math.max(backendCount, algorithmCount)) return '前端开发工程师';
    if (algorithmCount > backendCount) return '算法工程师';
    if (backendCount >= frontendCount) return '后端开发工程师';
    return '全栈开发工程师';
  }

  private extractKeywords(text: string): string[] {
    const all = [...this.skillKeywords].filter((k) => text.includes(k));
    return [...new Set(all)].slice(0, 15);
  }

  private extractEducation(sentences: string[]): string[] {
    return sentences.filter((s) => s.includes('学') || s.includes('学院') || s.includes('教育') || s.includes('学历'))
      .slice(0, 3);
  }

  private extractExperience(sentences: string[]): string[] {
    return sentences.filter((s) => (s.includes('公司') || s.includes('工作') || s.includes('负责') || s.includes('参与')))
      .slice(0, 5);
  }

  private extractProjects(sentences: string[]): string[] {
    return sentences.filter((s) => s.includes('项目') || s.includes('负责') || s.includes('开发'))
      .slice(0, 5);
  }

  private generateSummary(data: { skills: string[]; yearsExp: number; position: string }): string {
    return `简历包含以下信息：\n- 职位：${data.position}\n- 年限：${data.yearsExp}年\n- 技能：${data.skills.slice(0, 10).join('、')}`;
  }

  private determineSeniority(years: number, skillsCount: number): 'junior' | 'mid' | 'senior' | 'architect' {
    if (years >= 10 || skillsCount >= 15) return 'architect';
    if (years >= 5) return 'senior';
    if (years >= 2) return 'mid';
    return 'junior';
  }

  async categorizeBySkill(skills: string[]): Promise<string[]> {
    return skills.map((s) => s.toLowerCase());
  }

  /**
   * PDF 文本提取 — 优先 pdfjs-dist@4（PDF.js 引擎，Node 端用 legacy build 无 worker），
   * 失败回退到 pdf-parse。两种路径输出都经过 scrubPdfStructureNoise 清洗。
   *
   * 修复背景（2026-06-21）：pdf-parse@1.1.x 在复杂排版/自定义字体/部分在线简历工具导出 PDF
   * 时会把 PDF 内部 PostScript 语法泄漏进 text 字段（%PDF-1.7、/ICCBased 11 0 R、/Type /Catalog
   * 等），导致下游 LLM 把 %PDF-1.7 当姓名、/ICCBased 当技能。
   */
  private async extractPdfText(buffer: Buffer): Promise<string> {
    try {
      const text = await this.extractWithPdfJs(buffer);
      if (text && text.trim().length > 0) return text;
      this.logger.warn('pdfjs-dist 输出为空，回退到 pdf-parse');
    } catch (e) {
      this.logger.warn(
        `pdfjs-dist 解析失败，回退到 pdf-parse: ${(e as Error)?.message || e}`,
      );
    }
    const pdfParse = (await import('pdf-parse')).default;
    const data = await pdfParse(buffer);
    return data.text;
  }

  private async extractWithPdfJs(buffer: Buffer): Promise<string> {
    // pdfjs-dist 4 是纯 ESM，必须 dynamic import
    // legacy/build/pdf.mjs 是 Node 同步版本（无 worker、不需要 isEvalSupported）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: false,
      disableFontFace: true,
      isEvalSupported: false,
      verbosity: 0,
    });
    const pdf = await loadingTask.promise;
    const lines: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      // 按 y 坐标分组重建排版（PDF 坐标系 y 从底部向上）
      const yGroups = new Map<number, Array<{ x: number; str: string }>>();
      for (const item of content.items as Array<{ str?: string; transform: number[]; hasEOL?: boolean }>) {
        if (!item.str) continue;
        const y = Math.round(item.transform[5]);
        const x = item.transform[4];
        if (!yGroups.has(y)) yGroups.set(y, []);
        yGroups.get(y)!.push({ x, str: item.str });
      }
      const ys = [...yGroups.keys()].sort((a, b) => b - a);
      for (const y of ys) {
        const items = yGroups.get(y)!.sort((a, b) => a.x - b.x);
        const line = items.map((it) => it.str).join(' ').replace(/\s+/g, ' ').trim();
        if (line) lines.push(line);
      }
      lines.push('');
    }
    return lines.join('\n').trim();
  }

  /**
   * 清洗 PDF 内部结构噪音（兜底，主要对付 pdf-parse 偶发的元数据泄漏）。
   * 规则：行内含 PDF 内部 PostScript 语法 → 删整行。
   * 设计：宁严勿松——"PDF 元数据混进简历正文"的概率远大于"简历里写 /Type /Catalog"。
   */
  private scrubPdfStructureNoise(text: string): string {
    const lines = text.split('\n');
    const cleaned: string[] = [];
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) {
        cleaned.push('');
        continue;
      }
      // 行内含 PDF 内部 PostScript 标识 → 删整行
      // - 头尾标记: %PDF-1.7, %%EOF, startxref
      // - 对象声明: "11 0 obj" / "endobj" / "beginobj"
      // - 对象引用: "/Name 11 0 R"（间接对象语法 = 数字 数字 R）
      // - stream 标记: "stream" / "endstream"
      // - 字典/对象头: "<<", "/Length 1234", "/Type /Catalog", "/Subtype /...", "/Filter /..."
      // - 颜色/字体引用: "/ICCBased ...", "/F1 12 Tf", "/Font <<"
      // - 资源/MediaBox: "/MediaBox [0 0 612 792]", "/Resources <<"
      if (
        /%PDF-\d/.test(line) ||
        /%%EOF/.test(line) ||
        /\bstartxref\b/.test(line) ||
        /\b\d+\s+\d+\s+obj\b/.test(line) ||
        /\bendobj\b/.test(line) ||
        /\bbeginobj\b/.test(line) ||
        /^\s*<<\s*$/.test(line) ||
        /^\s*>>\s*$/.test(line) ||
        /^\s*stream\s*$/.test(line) ||
        /^\s*endstream\s*$/.test(line) ||
        /\/ICCBased\b/.test(line) ||
        /\/MediaBox\b/.test(line) ||
        /\/Resources\b/.test(line) ||
        /\/Type\s+\/[\w-]+/.test(line) || // /Type /Catalog /Type /Pages /Type /Font 等
        /\/Subtype\s+\/[\w-]+/.test(line) || // /Subtype /Type1 /Subtype /TrueType 等
        /\/Filter\s+\/[\w-]+/.test(line) || // /Filter /FlateDecode 等
        /\/Length\s+\d+/.test(line) || // /Length 1234
        /^\/[\w.-]+\s+\d+\s+\d+\s+R\s*$/.test(line) || // 整行是对象引用 "/F1 12 0 R"
        /^\/[\w.-]+\s+[-\d.]+\s+(Tf|Tm|Td|TD|T\*|Tj|TJ)\s*$/.test(line) || // 整行是字体/矩阵命令 "/F1 12 Tf"
        /^\/[\w.-]+\s+<<\s*$/.test(line) // 整行是字典开始 "/Font <<"
      ) {
        continue;
      }
      // 移除控制字符（保留 \n \r \t）
      const noCtrl = line.replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '');
      if (noCtrl) cleaned.push(noCtrl);
    }
    return cleaned.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }
}

// Helper: Helper 技能到知识点映射
