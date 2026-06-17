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

  async parse(rawText: string): Promise<ResumeAnalysis> {
    const text = rawText.trim().toLowerCase();
    const sentences = rawText.split(/[\n。！？]/).map((s) => s.trim()).filter((s) => s);

    const skills = this.extractSkills(text);
    const yearsExp = this.extractYearsOfExperience(text);
    const position = this.detectPosition(skills);
    const name = this.extractName(rawText);
    const email = this.extractEmail(rawText);
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
      education: this.extractEducation(sentences),
      experience: this.extractExperience(sentences),
      projects,
      keywords,
      summary,
      seniority,
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
      return Math.min(parseInt(yearMatch[1] || yearMatch[2] || yearMatch[3] || '3', 20);
    }
    return 3; // 默认3年
  }

  private extractName(text: string): string {
    const lines = text.split('\n').map((l) => l.trim()).filter((l) => l));
    // 简历开头的短句子通常是姓名
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      if (lines[i].length < 10 && !lines[i].includes('@') && !lines[i].length > 0) {
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

  async categorizeBySkill(skills: string[]): string[] {
    return skills.map((s) => s.toLowerCase());
  }
}

// Helper: Helper 技能到知识点映射
