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

export const configuration = (): AppConfig => ({
  port: parseInt(process.env.PORT, 10) || 3001,
  webPort: parseInt(process.env.WEB_PORT, 10) || 5173,
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  database: {
    url: process.env.DATABASE_URL || 'postgresql://dev:dev123@localhost:5432/interview',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    sessionTtl: parseInt(process.env.REDIS_SESSION_TTL, 10) || 3600,
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
      maxTokens: parseInt(process.env.QWEN_MAX_TOKENS, 10) || 128000,
    },
    deepseek: {
      maxTokens: parseInt(process.env.DEEPSEEK_MAX_TOKENS, 10) || 64000,
    },
    default: {
      maxTokens: parseInt(process.env.LLM_DEFAULT_MAX_TOKENS, 10) || 32000,
    },
  },
  // P0-1 修复：JWT + Rate Limiting
  auth: {
    jwtSecret: process.env.JWT_SECRET || 'interview-agent-dev-secret-change-in-production',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  throttler: {
    ttl: parseInt(process.env.THROTTLER_TTL || '60', 10),
    limit: parseInt(process.env.THROTTLER_LIMIT || '60', 10),
  },
});
