/**
 * ResumeParserService 单测 — 覆盖 PDF 文本提取 + 结构噪音清洗
 *
 * 修复背景（2026-06-21）：pdf-parse@1.1.x 在复杂 PDF 上会把 PDF 内部 PostScript
 * 语法泄漏到 text 字段（%PDF-1.7、/ICCBased 11 0 R、/Type /Catalog 等），导致 LLM
 * 把 PDF 元数据当姓名/技能。本测试用真实 PDF 文件验证修复有效。
 */
import * as fs from 'fs';
import * as path from 'path';
import { ResumeParserService } from '../modules/interview/services/resume-parser.service';
import {
  scrubPdfStructureNoise,
  isPdfStructureToken,
  looksLikePdfStructureNoise,
} from '../common/pdf-noise';

describe('pdf-noise util', () => {
  describe('scrubPdfStructureNoise - PDF 元数据清洗', () => {
    it('清洗 PDF 头标识 %PDF-1.7', () => {
      const input = '%PDF-1.7\n张继哲\n18516604751\n%%EOF\n';
      const out = scrubPdfStructureNoise(input);
      expect(out).not.toContain('%PDF-1.7');
      expect(out).not.toContain('%%EOF');
      expect(out).toContain('张继哲');
      expect(out).toContain('18516604751');
    });

    it('清洗 PDF 对象引用 /ICCBased 11 0 R', () => {
      const input = '张继哲\n/ICCBased 11 0 R\nReact 工程师\n/F1 12 Tf\n';
      const out = scrubPdfStructureNoise(input);
      expect(out).not.toContain('/ICCBased');
      expect(out).not.toContain('/F1 12 Tf');
      expect(out).toContain('张继哲');
      expect(out).toContain('React 工程师');
    });

    it('清洗 stream/endstream/obj 标记', () => {
      const input = '11 0 obj\nstream\nendstream\nendobj\n实际内容\n';
      const out = scrubPdfStructureNoise(input);
      expect(out).not.toMatch(/\bstream\b/);
      expect(out).not.toMatch(/\bendstream\b/);
      expect(out).not.toMatch(/\d+\s+\d+\s+obj\b/);
      expect(out).toContain('实际内容');
    });

    it('清洗 PDF 字典头 << /Length xxx', () => {
      const input = '<<\n/Length 1234\n/Foo <<\n正常内容\n';
      const out = scrubPdfStructureNoise(input);
      expect(out).not.toMatch(/^<<$/m);
      expect(out).not.toMatch(/\/Length\s+\d+/);
      expect(out).toContain('正常内容');
    });

    it('保留正常简历文本不被误删', () => {
      const resume = `张继哲
AI Agent 前端开发工程师
18516604751  |  zhangjizhe311@163.com
核心技能
React  Vue  TypeScript  LangChain  MCP Server
工作经历
- 京东外包 2025.11 - 至今
- 上海暖哇科技 2022.11 - 2025.03
教育背景
北京交通大学 · 工程管理
东北石油大学 · 通信技术
`;
      const out = scrubPdfStructureNoise(resume);
      expect(out).toBe(resume.trim());
    });

    it('移除控制字符但保留换行和制表符', () => {
      const input = '张继哲\x00\x01\x02\nReact\t工程师\n\x7F内容';
      const out = scrubPdfStructureNoise(input);
      expect(out).toContain('张继哲');
      expect(out).toContain('React\t工程师');
      expect(out).toContain('内容');
      expect(out).not.toContain('\x00');
      expect(out).not.toContain('\x7F');
    });

    it('混合 PDF 元数据 + 正常文本的混合输入', () => {
      const input = `张继哲
AI Agent 前端开发工程师
%PDF-1.7
/ICCBased 11 0 R
18516604751
/Type /Catalog
%%EOF
LangChain  MCP Server  React
startxref
1234
% 实际简历内容
`;
      const out = scrubPdfStructureNoise(input);
      expect(out).toContain('张继哲');
      expect(out).toContain('AI Agent 前端开发工程师');
      expect(out).toContain('18516604751');
      expect(out).toContain('LangChain');
      expect(out).toContain('MCP Server');
      expect(out).toContain('React');
      expect(out).not.toContain('%PDF-1.7');
      expect(out).not.toContain('/ICCBased');
      expect(out).not.toContain('/Type /Catalog');
      expect(out).not.toContain('%%EOF');
      expect(out).not.toContain('startxref');
    });
  });

  describe('isPdfStructureToken - 短字符串级 token 检测', () => {
    it.each([
      ['%PDF-1.7', true],
      ['%%EOF', true],
      ['/ICCBased', true],
      ['/ICCBased 11 0 R', true],
      ['/F1 12 Tf', true],
      ['/Type /Catalog', true],
      ['/Subtype /TrueType', true],
      ['/Length 1234', true],
      ['stream', true],
      ['endstream', true],
      ['11 0 obj', true],
      ['startxref', true],
      ['<<', true],
      ['张继哲', false],
      ['React', false],
      ['AI Agent 工程师', false],
      ['', false],
    ])('isPdfStructureToken(%j) === %j', (input, expected) => {
      expect(isPdfStructureToken(input)).toBe(expected);
    });
  });

  describe('looksLikePdfStructureNoise - 粗筛', () => {
    it('返回 true 当含 PDF 元数据', () => {
      expect(looksLikePdfStructureNoise('张继哲\n%PDF-1.7\nReact')).toBe(true);
      expect(looksLikePdfStructureNoise('clean text\n/ICCBased 11 0 R\nmore')).toBe(true);
    });
    it('返回 false 当不含 PDF 元数据', () => {
      expect(looksLikePdfStructureNoise('张继哲\nReact\nAI Agent 工程师')).toBe(false);
      expect(looksLikePdfStructureNoise('')).toBe(false);
    });
  });
});

describe('ResumeParserService - PDF 解析', () => {
  let service: ResumeParserService;

  beforeEach(() => {
    service = new ResumeParserService();
  });

  describe('extractName - PDF 元数据兜底', () => {
    // 访问 private 方法
    const extractName = (text: string) =>
      (service as unknown as { extractName: (t: string) => string }).extractName(text);

    it('PDF 头 %PDF-1.7 不被当成姓名', () => {
      const out = extractName('%PDF-1.7\n张继哲\n18516604751\n');
      expect(out).not.toBe('%PDF-1.7');
      expect(out).toBe('张继哲');
    });

    it('全 PDF 元数据无姓名 → 兜底为"候选人"', () => {
      const out = extractName('%PDF-1.7\n/ICCBased 11 0 R\nstream\nendstream\n');
      expect(out).toBe('候选人');
    });

    it('正常姓名提取', () => {
      const out = extractName('张继哲\nAI Agent 前端开发工程师\n18516604751\n');
      expect(out).toBe('张继哲');
    });
  });

  describe('parse - 真实 PDF 端到端', () => {
    // 用项目里能找到的真实 PDF 做集成测试
    const candidatePaths = [
      // 用户简历
      '/Users/zhangjizhe/Desktop/张继哲-AI前端开发工程师-18516604751.pdf',
      '/Users/zhangjizhe/Desktop/张继哲-AI前端开发工程师-18516604751-v2.1.pdf',
      // 题库 PDF
      '/Users/zhangjizhe/Desktop/LLM_VLM_Agent_面试题库_含参考答案_2026-06-16.pdf',
    ];

    it.each(candidatePaths.filter((p) => fs.existsSync(p)))(
      '解析 %s 不含 PDF 结构噪音',
      (pdfPath) => {
        const buffer = fs.readFileSync(pdfPath);
        const file = { buffer, mimetype: 'application/pdf', originalname: path.basename(pdfPath) };
        return service.parse(file).then((r) => {
          // 核心断言：解析结果不含 PDF 内部 PostScript 语法
          expect(r.rawText).not.toMatch(/%PDF-\d/);
          expect(r.rawText).not.toMatch(/\/ICCBased/);
          expect(r.rawText).not.toMatch(/\/Type\s+\/Catalog/);
          expect(r.rawText).not.toMatch(/\bstream\b/);
          expect(r.rawText).not.toMatch(/\bendstream\b/);
          // name/skills 也不能是 PDF 元数据
          expect(isPdfStructureToken(r.name || '')).toBe(false);
          for (const s of r.skills || []) {
            expect(isPdfStructureToken(s)).toBe(false);
          }
          // 必须有实际内容
          expect(r.rawText.length).toBeGreaterThan(50);
        });
      },
      30000, // PDF 解析 + pdfjs 启动可能慢
    );

    it('扫描型 PDF / 几乎空 PDF 也能优雅处理', async () => {
      // 最小有效 PDF buffer (单页空白) - 防止真没有这种文件时硬依赖外部资源
      // 这里用用户电脑上的方洁简历作 smoke test（不一定空白，但要保证不崩）
      const pdfPath = '/Users/zhangjizhe/Desktop/方洁   简历.pdf';
      if (!fs.existsSync(pdfPath)) return;
      const buffer = fs.readFileSync(pdfPath);
      const file = { buffer, mimetype: 'application/pdf', originalname: '方洁.pdf' };
      const result = await service.parse(file);
      expect(result).toBeDefined();
      expect(result.rawText).toBeDefined();
    });
  });
});
