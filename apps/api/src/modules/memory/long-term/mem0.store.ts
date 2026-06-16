import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatMessage, Memory } from '../interfaces/memory-store.interface';

/**
 * 长期记忆 - Mem0 接入层（云服务 或 OSS 自托管）
 *
 * 实现策略：绕开 mem0ai npm SDK 的 v3 路径前缀，
 * 用原生 fetch 直接调 Mem0 REST API。
 *
 * 云端路径（mem0ai npm SDK 3.0.6 实际使用的路径）：
 *   POST /v3/memories/           — add
 *   POST /v3/memories/search/    — search
 *   GET  /v1/memories/?filters=  — getAll
 *
 * OSS 自托管路径（Mem0 server v0.1.x 暴露的路径）：
 *   POST /memories               — add
 *   POST /search                 — search
 *   GET  /memories?user_id=...   — getAll
 *
 * Mem0 OSS 自托管依赖：Mem0 server (FastAPI) + Postgres + pgvector
 * 见 docker-compose.yml
 */
@Injectable()
export class Mem0CloudMemory implements OnModuleInit {
  private readonly logger = new Logger(Mem0CloudMemory.name);
  private enabled = false;
  private mode: 'cloud' | 'oss' | 'disabled' = 'disabled';
  private baseUrl = '';
  private headers: Record<string, string> = {};

  constructor(private config: ConfigService) {}

  async onModuleInit() {
    const apiKey = this.config.get<string>('mem0.apiKey');
    const host = this.config.get<string>('mem0.host');

    if (!apiKey && !host) {
      this.logger.warn('⚠️  MEM0_API_KEY & MEM0_HOST missing, Mem0 disabled');
      return;
    }

    if (host) {
      // OSS 自托管
      this.baseUrl = host.replace(/\/$/, '');
      this.headers = { 'Content-Type': 'application/json' };
      this.mode = 'oss';
    } else {
      // 云服务（api.mem0.ai / Token 鉴权）
      this.baseUrl = 'https://api.mem0.ai';
      this.headers = {
        'Content-Type': 'application/json',
        Authorization: `Token ${apiKey}`,
      };
      this.mode = 'cloud';
    }

    // 验证连通性（直接试 add 端点发一个最小 payload）
    // 暂跳过 probe：fetch 在 onModuleInit 时可能受网络/DNS 抖动影响，
    // 让 enabled 默认 true，第一次 memorize/search 失败时再处理
    this.enabled = true;
    this.logger.log(`✅ Mem0 client initialized (${this.mode} mode, host=${this.baseUrl})`);
    // 异步轻探一次（不阻塞启动），失败仅日志
    setTimeout(() => {
      fetch(this._url('search'), {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          query: '__healthcheck__',
          filters: { user_id: '__healthcheck__' },
          top_k: 1,
        }),
      })
        .then((r) => this.logger.log(`Mem0 healthcheck status: ${r.status}`))
        .catch((e) => this.logger.warn(`Mem0 healthcheck failed: ${e.message}`));
    }, 5000);
  }

  /**
   * 路径转换：cloud 用 /v3，OSS 走原始路径
   * 注意 cloud 模式下 add / search / getAll 都用 POST /v3/memories/*
   */
  private _url(endpoint: 'add' | 'search' | 'list'): string {
    if (this.mode === 'cloud') {
      // mem0ai npm SDK 3.0.6 实际路径
      if (endpoint === 'add') return `${this.baseUrl}/v3/memories/add/`;
      if (endpoint === 'search') return `${this.baseUrl}/v3/memories/search/`;
      return `${this.baseUrl}/v3/memories/`; // list = POST
    }
    // oss
    if (endpoint === 'search') return `${this.baseUrl}/search`;
    return `${this.baseUrl}/memories`;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getMode(): 'cloud' | 'oss' | 'disabled' {
    return this.mode;
  }

  async memorize(userId: string, messages: ChatMessage[]): Promise<void> {
    if (!this.enabled || messages.length === 0) return;
    try {
      const res = await fetch(this._url('add'), {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          user_id: userId,
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        this.logger.error(`Mem0 add failed: ${res.status} ${txt.slice(0, 200)}`);
      } else {
        this.logger.debug(`Mem0[${this.mode}]: added ${messages.length} messages for ${userId}`);
      }
    } catch (err) {
      this.logger.error(`Mem0 add failed: ${err.message}`);
    }
  }

  async recall(userId: string, query: string, limit = 5): Promise<Memory[]> {
    if (!this.enabled) return [];
    try {
      const res = await fetch(this._url('search'), {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          query,
          filters: { user_id: userId },
          top_k: limit,
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        this.logger.error(`Mem0 search failed: ${res.status} ${txt.slice(0, 200)}`);
        return [];
      }
      const data: any = await res.json();
      const list = Array.isArray(data) ? data : data.results || [];
      return list.map((r: any) => ({
        id: r.id,
        content: r.memory || r.text || r.data,
        score: r.score,
        metadata: r.metadata,
      }));
    } catch (err) {
      this.logger.error(`Mem0 search failed: ${err.message}`);
      return [];
    }
  }

  async getAll(userId: string): Promise<Memory[]> {
    if (!this.enabled) return [];
    try {
      const url = this._url('list');
      // cloud 模式用 POST + body，OSS 模式用 GET + query
      const res =
        this.mode === 'cloud'
          ? await fetch(url, {
              method: 'POST',
              headers: this.headers,
              body: JSON.stringify({ filters: { user_id: userId } }),
            })
          : await fetch(`${url}?user_id=${encodeURIComponent(userId)}`, {
              headers: this.headers,
            });
      if (!res.ok) {
        const txt = await res.text();
        this.logger.error(`Mem0 getAll failed: ${res.status} ${txt.slice(0, 200)}`);
        return [];
      }
      const data: any = await res.json();
      const list = Array.isArray(data) ? data : data.results || [];
      return list.map((r: any) => ({
        id: r.id,
        content: r.memory || r.text || r.data,
        metadata: r.metadata,
      }));
    } catch (err) {
      this.logger.error(`Mem0 getAll failed: ${err.message}`);
      return [];
    }
  }
}