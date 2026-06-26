import { Question } from './agent.bank';

export const BACKEND_QUESTION_BANK: Question[] = [
  {
    id: 'be-e1',
    level: 'easy',
    category: '基础概念',
    question: 'RESTful API 的设计原则是什么？',
    keyPoints: [
      '资源命名用名词复数',
      'HTTP 动词（GET/POST/PUT/PATCH/DELETE）语义',
      '状态码规范使用',
    ],
    referenceAnswer:
      'RESTful 核心：1) 资源用名词复数命名（/users）2) HTTP 动词表达操作（GET 查询、POST 创建、PUT 全量更新、PATCH 部分更新、DELETE 删除）3) 正确使用状态码（200/201/400/404/500）4) 版本控制（/api/v1/）。',
  },
  {
    id: 'be-e2',
    level: 'easy',
    category: '数据库',
    question: '数据库索引是什么？什么情况下索引会失效？',
    keyPoints: [
      '索引底层数据结构（B+Tree）',
      '最左前缀原则',
      '函数/运算导致失效',
      'LIKE %开头失效',
    ],
    referenceAnswer:
      '索引是加速查询的数据结构，MySQL 默认用 B+Tree。失效场景：1) 对索引列使用函数或运算 2) LIKE \'%xxx\' 开头 3) 类型隐式转换 4) OR 条件部分无索引 5) 复合索引不满足最左前缀。',
  },
  {
    id: 'be-m1',
    level: 'medium',
    category: '并发与性能',
    question: '如何设计一个高并发场景下的接口限流方案？',
    keyPoints: [
      '能说出常见算法（令牌桶/漏桶/滑动窗口）',
      '分布式限流用 Redis',
      '网关层 vs 应用层限流',
    ],
    referenceAnswer:
      '限流算法：1) 令牌桶（允许突发流量，推荐）2) 漏桶（固定速率）3) 滑动窗口（更精确）。分布式场景用 Redis + Lua 脚本实现。架构上：API 网关层做粗粒度限流，应用层做细粒度限流。',
  },
  {
    id: 'be-m2',
    level: 'medium',
    category: '微服务',
    question: '微服务之间如何保证数据一致性？',
    keyPoints: [
      '分布式事务问题',
      'Saga 模式',
      '最终一致性 vs 强一致性',
      '消息队列的作用',
    ],
    referenceAnswer:
      '微服务数据一致性方案：1) 两阶段提交（强一致但性能差）2) Saga 模式（长事务拆短事务 + 补偿）3) 本地消息表 + MQ（最终一致性）4) 可靠消息服务。互联网场景通常选择最终一致性。',
  },
  {
    id: 'be-h1',
    level: 'hard',
    category: '架构设计',
    question: '设计一个支持百万级用户的消息推送系统。',
    keyPoints: [
      'WebSocket 长连接管理',
      '连接层 vs 业务层分离',
      '消息不丢失（确认机制）',
      '水平扩展方案',
    ],
    referenceAnswer:
      '架构分层：1) 接入层（网关 + WebSocket 集群，维护长连接）2) 消息层（Kafka/RabbitMQ 做消息分发）3) 存储层（用户在线状态 + 离线消息）。关键点：连接与业务解耦、心跳保活、消息确认+重投、离线消息队列。水平扩展通过 Redis 做连接路由。',
  },
];
