export interface AppConfig {
  port: number;
  webPort: number;
  nodeEnv: string;
  corsOrigin: string;
  database: {
    url: string;
  };
  redis: {
    url: string;
    sessionTtl: number;
  };
  qdrant: {
    url: string;
  };
  qwen: {
    apiKey: string;
    baseUrl: string;
    model: string;
  };
  deepseek: {
    apiKey: string;
    baseUrl: string;
    model: string;
  };
  bocha: {
    apiKey: string;
    baseUrl: string;
  };
  github: {
    token?: string;
  };
  notion: {
    token?: string;
  };
  langfuse: {
    publicKey: string;
    secretKey: string;
    baseUrl: string;
    sampleRate: {
      trace: number;
      span: number;
      generation: number;
    };
  };
  mem0: {
    apiKey?: string;
    host?: string;
    orgId?: string;
    projectId?: string;
  };
  milvus: {
    url: string;
  };
  multiAgent: {
    enabled: boolean;
  };
  semanticCache: {
    enabled: boolean;
    whitelist: string;
  };
  promptCache: {
    systemVersion: string;
  };
  knowledgeBase: {
    enabled: boolean;
    jsonPath: string;
  };
  // P0-3 修复：按 provider 配置的 maxTokens
  llm: {
    qwen: { maxTokens: number };
    deepseek: { maxTokens: number };
    default: { maxTokens: number };
  };
  // P0-1 修复：JWT + Rate Limiting
  auth: {
    jwtSecret: string;
    jwtExpiresIn: string;
  };
  throttler: {
    ttl: number;
    limit: number;
  };
}

/**
 * 严格整数解析：undefined / 非数字 / 0 / 负数 / NaN 都 fallback 到默认值。
 * 修 R-P2-24：原 `parseInt(s, 10) || fallback` 把 0 / NaN / 负数都当 falsy fallback，
 * 且不报错（静默吞错）。商用未正确设 PORT 时启动后 listen(NaN) 才崩。
 *
 * 命名：叫 parseSafeInt 而非 parsePortOr，因为实际用途是"任何整数环境变量
 * 的严格解析"（PORT / WEB_PORT / sessionTtl / maxTokens 等），不只限端口。
 * 审查员 2026-06-22 反馈：parsePortOr 用在 maxTokens 会让面试官疑惑。
 *
 * 上限：移除 `<= 65535` 上限（审查员第二轮反馈）。maxTokens（如 200000）可远超
 * 65535，保留端口上限会导致 maxTokens 静默 fallback。端口范围校验应由调用方
 * 自行负责（用 Number.isInteger(n) && n <= 65535 校验后传给 parseSafeInt）。
 */
// @internal - 导出用于单元测试（src/__tests__/configuration.spec.ts）
export function parseSafeInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const configuration = (): AppConfig => {
  // R-P2-23 修复：商用未设 LLM API Key 启动时立即报错（fail-fast），
  // 而不是运行时 401/402 才暴露（fail-late）。demo 模式仍可用空 apiKey 启动。
  if (
    process.env.NODE_ENV === 'production' &&
    !process.env.QWEN_API_KEY &&
    !process.env.DEEPSEEK_API_KEY
  ) {
    throw new Error(
      '商用环境必须显式设置 QWEN_API_KEY 或 DEEPSEEK_API_KEY（至少一个）',
    );
  }
  return {
  port: parseSafeInt(process.env.PORT, 3001),
  webPort: parseSafeInt(process.env.WEB_PORT, 5173),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  database: {
    url: process.env.DATABASE_URL || 'postgresql://dev:dev123@localhost:5432/interview',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    sessionTtl: parseSafeInt(process.env.REDIS_SESSION_TTL, 3600),
  },
  qdrant: {
    url: process.env.QDRANT_URL || 'http://localhost:6333',
  },
  qwen: {
    apiKey: process.env.QWEN_API_KEY || '',
    baseUrl: process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: process.env.QWEN_MODEL || 'qwen-plus',
  },
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  },
  bocha: {
    apiKey: process.env.BOCHA_API_KEY || '',
    baseUrl: process.env.BOCHA_BASE_URL || 'https://api.bochaai.com/v1',
  },
  github: {
    token: process.env.GITHUB_TOKEN,
  },
  notion: {
    token: process.env.NOTION_TOKEN,
  },
  langfuse: {
    publicKey: process.env.LANGFUSE_PUBLIC_KEY || '',
    secretKey: process.env.LANGFUSE_SECRET_KEY || '',
    baseUrl: process.env.LANGFUSE_BASE_URL || 'https://us.cloud.langfuse.com',
    sampleRate: {
      trace: parseFloat(process.env.LANGFUSE_SAMPLE_RATE_TRACE || '0.1'),
      span: parseFloat(process.env.LANGFUSE_SAMPLE_RATE_SPAN || '0.5'),
      generation: parseFloat(process.env.LANGFUSE_SAMPLE_RATE_GENERATION || '1.0'),
    },
  },
  mem0: {
    apiKey: process.env.MEM0_API_KEY,
    host: process.env.MEM0_HOST,
    orgId: process.env.MEM0_ORG_ID,
    projectId: process.env.MEM0_PROJECT_ID,
  },
  milvus: {
    url: process.env.MILVUS_URL || 'http://localhost:19530',
  },
  multiAgent: {
    enabled: process.env.MULTI_AGENT_ENABLED !== 'false', // 默认开
  },
  // P0 缓存工程
  semanticCache: {
    enabled: process.env.SEMANTIC_CACHE_ENABLED !== 'false', // 默认开
    whitelist: process.env.SEMANTIC_CACHE_WHITELIST || 'interview_question,general_qa',
  },
  promptCache: {
    systemVersion: process.env.PROMPT_CACHE_SYSTEM_VERSION || 'sys-v1',
  },
  knowledgeBase: {
    enabled: process.env.KNOWLEDGE_BASE_ENABLED !== 'false', // 默认开
    jsonPath: process.env.KNOWLEDGE_BASE_JSON || '', // 空则用默认路径
  },
  // P0-3 修复：按 provider 配置 maxTokens，区分模型能力
  llm: {
    qwen: {
      maxTokens: parseSafeInt(process.env.QWEN_MAX_TOKENS, 128000),
    },
    deepseek: {
      maxTokens: parseSafeInt(process.env.DEEPSEEK_MAX_TOKENS, 64000),
    },
    default: {
      maxTokens: parseSafeInt(process.env.LLM_DEFAULT_MAX_TOKENS, 32000),
    },
  },
  // P0 安全修复（审查员发现）：商用必须显式设置 JWT_SECRET 环境变量，
  // 未设置 + NODE_ENV=production → 启动失败（fail-fast，避免默认密钥泄漏）。
  // 默认值仅用于 demo/开发环境，且字符串本身包含 "INSECURE-DEV" 自描述，
  // 任何代码审计 / grep 都能立刻发现这是 placeholder。
  auth: {
    jwtSecret: process.env.JWT_SECRET || (() => {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET must be set when NODE_ENV=production (商用环境必须显式设置 JWT_SECRET)');
      }
      return 'INSECURE-DEV-DO-NOT-USE-IN-PRODUCTION-CHANGE-ME-PLEASE-32-CHARS';
    })(),
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  throttler: {
    ttl: parseInt(process.env.THROTTLER_TTL || '60', 10),
    limit: parseInt(process.env.THROTTLER_LIMIT || '60', 10),
  },
  };
}
