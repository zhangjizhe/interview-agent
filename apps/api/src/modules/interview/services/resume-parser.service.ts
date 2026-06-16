import { Injectable, Logger } from '@nestjs/common';
import { LlmGatewayService } from '../../llm/llm.gateway.service';
import 'multer';

export interface ResumeExperience {
  company?: string;
  title?: string;
  duration?: string;
  description?: string;
}

export interface ResumeProject {
  name: string;
  description?: string;
  techStack?: string[];
}

export interface ParsedResume {
  name?: string;
  email?: string;
  phone?: string;
  skills: string[];
  experience: ResumeExperience[];
  projects: ResumeProject[];
  education?: string;
  rawText: string;
}

/**
 * 简历解析服务
 * 支持：.txt / .md（纯文本）+ .pdf（pdfjs-dist）
 * 暂不支持：.doc / .docx（MVP 阶段不引入 mammoth，提示用户先另存为 PDF）
 */
@Injectable()
export class ResumeParserService {
  private readonly logger = new Logger(ResumeParserService.name);

  constructor(private llm: LlmGatewayService) { }

  async parse(file: any): Promise<ParsedResume> {
    const text = await this.extractText(file);
    if (!text || text.length < 10) {
      throw new Error('简历内容为空或过短，请确认文件内容');
    }
    return this.parseWithLLM(text);
  }

  /**
   * 从文件提取文本
   * - .pdf：pdfjs-dist
   * - .doc/.docx：暂不支持，提示用户转 PDF
   * - 其他：按 utf-8 读取
   */
  private async extractText(file: any): Promise<string> {
    const filename = (file.originalname || '').toLowerCase();
    const buffer: Buffer = file.buffer;

    if (filename.endsWith('.pdf')) {
      return this.extractFromPdf(buffer);
    }

    if (filename.endsWith('.doc') || filename.endsWith('.docx')) {
      throw new Error('暂不支持 .doc / .docx 格式，请先在 Word/WPS 里"另存为 PDF"再上传');
    }

    return buffer.toString('utf-8').trim();
  }

  /**
   * 用 pdfjs-dist 提取 PDF 文本
   * pdfjs-dist v4 在 Node 用法：
   *   const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
   *   关闭 worker（用主线程或 disableWorker）
   */
  private async extractFromPdf(buffer: Buffer): Promise<string> {
    try {
      // 动态 import 避免启动时阻塞
      const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');

      // 关闭 worker（Node 端没有 WorkerGlobalScope）
      if (pdfjs.GlobalWorkerOptions) {
        pdfjs.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
      }

      const data = new Uint8Array(buffer);
      const loadingTask = pdfjs.getDocument({
        data,
        useSystemFonts: true,
        disableFontFace: true,
        verbosity: 0,
      });
      const doc = await loadingTask.promise;
      const pages: string[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        const text = content.items
          .map((it: any) => (typeof it.str === 'string' ? it.str : ''))
          .filter(Boolean)
          .join(' ');
        pages.push(text);
        page.cleanup();
      }
      await doc.destroy();
      const full = pages.join('\n\n').trim();
      if (!full) {
        throw new Error('PDF 未提取到文字（可能是扫描件/图片），请用文字版 PDF 或上传 .md/.txt');
      }
      this.logger.log(`✅ PDF parsed: ${doc.numPages} pages, ${full.length} chars`);
      return full;
    } catch (err: any) {
      this.logger.error(`PDF parse failed: ${err.message}`);
      throw new Error(`PDF 解析失败：${err.message}`);
    }
  }

  /**
   * 用 LLM 提取结构化字段
   */
  private async parseWithLLM(text: string): Promise<ParsedResume> {
    const prompt = `你是一位专业的简历解析助手。请从以下简历文本中提取结构化信息。

【简历文本】
${text.slice(0, 4000)}

【输出格式】严格 JSON：
\`\`\`json
{
  "name": "候选人姓名（如未提及填空字符串）",
  "email": "邮箱（如有）",
  "phone": "电话（如有）",
  "skills": ["技能1", "技能2", "技能3"],
  "experience": [
    { "company": "公司", "title": "职位", "duration": "时间段", "description": "简述" }
  ],
  "projects": [
    { "name": "项目名", "description": "简述", "techStack": ["技术1", "技术2"] }
  ],
  "education": "最高学历 + 学校"
}
\`\`\``;

    try {
      const res = await this.llm.chat({
        messages: [
          { role: 'system', content: '你是一个专业的简历解析 AI。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
      });

      const match = res.content.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('LLM 解析失败');

      const parsed = JSON.parse(match[0]);
      return {
        ...parsed,
        rawText: text.slice(0, 2000), // 保留前 2k 字
      };
    } catch (err) {
      this.logger.error(`Resume parse failed: ${err.message}`);
      // 兜底：返回原始文本
      return {
        skills: [],
        experience: [],
        projects: [],
        rawText: text,
      };
    }
  }
}
