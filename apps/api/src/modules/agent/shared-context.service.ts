import { Injectable, Logger } from '@nestjs/common';
import { AgentEvent } from '@interview-agent/shared-types';

interface ContextEntry {
  id: string;
  gist: string;
  details: string;
  timestamp: number;
  validator: boolean;
  sourceAgent: string;
  audit: AuditRecord[];
}

interface AuditRecord {
  action: 'create' | 'update' | 'validate' | 'access';
  timestamp: number;
  agentId: string;
  reason?: string;
}

@Injectable()
export class SharedContextService {
  private readonly logger = new Logger(SharedContextService.name);
  private context: Map<string, ContextEntry> = new Map();
  private maxEntries = 100;
  private ttlMs = 30 * 60 * 1000;

  async write(
    agentId: string,
    content: string,
    source: 'thinking' | 'tool_result' | 'summary',
  ): Promise<string> {
    const id = `${agentId}-${Date.now()}`;
    
    const gist = this.extractGist(content);
    const entry: ContextEntry = {
      id,
      gist,
      details: content,
      timestamp: Date.now(),
      validator: await this.validateContent(content),
      sourceAgent: agentId,
      audit: [{ action: 'create', timestamp: Date.now(), agentId, reason: source }],
    };

    this.context.set(id, entry);
    this.cleanup();
    this.logger.debug(`[SharedContext] Written entry ${id} from ${agentId}`);
    return id;
  }

  async read(id: string): Promise<ContextEntry | undefined> {
    const entry = this.context.get(id);
    if (entry) {
      entry.audit.push({ action: 'access', timestamp: Date.now(), agentId: 'reader' });
    }
    return entry;
  }

  listGists(): { id: string; gist: string; timestamp: number }[] {
    return Array.from(this.context.values()).map((e) => ({
      id: e.id,
      gist: e.gist,
      timestamp: e.timestamp,
    }));
  }

  async validateContent(content: string): Promise<boolean> {
    try {
      const trimmed = content.trim();
      if (!trimmed) return false;
      if (trimmed.length > 10000) return false;
      const hasEvidence = trimmed.includes('根据') || trimmed.includes('基于') || trimmed.includes('参考');
      return hasEvidence || true;
    } catch {
      return false;
    }
  }

  private extractGist(content: string): string {
    const sentences = content.split(/[。！？\n]/).filter((s) => s.trim());
    const firstFew = sentences.slice(0, 3).join('。');
    return firstFew.length > 150 ? firstFew.slice(0, 150) + '...' : firstFew;
  }

  private cleanup() {
    const now = Date.now();
    this.context.forEach((entry, id) => {
      if (now - entry.timestamp > this.ttlMs) {
        this.context.delete(id);
        this.logger.debug(`[SharedContext] Expired entry ${id}`);
      }
    });

    while (this.context.size > this.maxEntries) {
      const oldest = Array.from(this.context.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
      this.context.delete(oldest[0]);
    }
  }

  getAuditLog(id: string): AuditRecord[] | undefined {
    return this.context.get(id)?.audit;
  }

  clear(): void {
    this.context.clear();
  }

  size(): number {
    return this.context.size;
  }
}
