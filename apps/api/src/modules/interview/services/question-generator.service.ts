import { Injectable, Logger } from '@nestjs/common';
import { ResumeAnalysis } from './resume-parser.service';

export interface InterviewQuestion {
  id: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  question: string;
  expectedPoints: string[];
  followUpHints: string[];
}

type SkillQuestionBank = {
  easy: string[];
  medium: string[];
  hard: string[];
  followUp: string[];
  expectedAnswers: Record<string, string[]>;
};

@Injectable()
export class QuestionGeneratorService {
  private readonly logger = new Logger(QuestionGeneratorService.name);

  // 核心技能题库
  private readonly knowledgeBank: Record<string, SkillQuestionBank> = {
    react: {
      easy: [
        'React 中 useState 和 useRef 有什么区别？请举一个适合用 useRef 的场景。',
        '解释一下 React 的虚拟 DOM 工作原理，它相比直接操作 DOM 有什么优势？',
        'React 的组件生命周期和 useEffect 之间是什么关系？请举例说明。',
      ],
      medium: [
        'React 中的合成事件 (SyntheticEvent) 和原生事件有什么区别？为什么要做这个封装？',
        '请详细解释 React 的协调过程 (Reconciliation)，并说明 Fiber 架构带来了什么改进。',
        'useEffect 和 useLayoutEffect 的区别是什么？什么场景下必须用 useLayoutEffect？',
        'React Context 有什么局限性？你在项目中是如何解决 Context Provider 重渲染问题的？',
      ],
      hard: [
        '请深入解释 React Server Components (RSC) 的工作机制，它和传统 CSR/SSR 相比有什么核心优势？为什么 Next.js 会全面转向 RSC？',
        'React 的 useMemo 和 useCallback 是性能优化吗？什么时候应该用？什么情况下反而会拖慢性能？请结合渲染流程说明。',
        '如果让你实现一个轻量级的 React 状态管理库（类似 zustand），你会如何设计订阅通知机制？请考虑批量更新和选择性订阅。',
      ],
      followUp: [
        '能具体举一个你项目中用 useRef 解决的真实问题吗？',
        '这个机制在 React 18 中有什么变化？',
      ],
      expectedAnswers: {
        'useState': ['触发重渲染', '返回 [state, setState]', '异步更新'],
        'useRef': ['不触发重渲染', '保存可变值', '访问 DOM 节点'],
        '虚拟 DOM': ['内存中的 JS 对象', 'diff 算法', '批量更新', '跨平台'],
      },
    },
    typescript: {
      easy: [
        'TypeScript 中 interface 和 type 有什么区别？什么时候应该用哪个？',
        '请解释 TypeScript 的类型推断是如何工作的，并举一个需要显式类型标注的场景。',
      ],
      medium: [
        'TypeScript 的泛型约束 (generic constraints) 是什么？请举例说明 extends keyof 的用法。',
        '解释 never、unknown、any 三种类型的区别和各自的适用场景。',
      ],
      hard: [
        '请实现一个 DeepReadonly 工具类型，解释每一步类型推导的思路。',
        'TypeScript 的条件类型 (Conditional Types) 和分布式条件类型 (Distributive Conditional Types) 有什么区别？请设计一个实际场景来展示后者的价值。',
      ],
      followUp: [
        '你项目中有没有自定义过工具类型？能举个例子吗？',
      ],
      expectedAnswers: {
        'interface': ['声明合并', '描述对象形状'],
        'type': ['联合类型', '交叉类型', '工具类型'],
        'never': ['不可能的值', '穷尽检查'],
        'unknown': ['类型安全的 any', '必须类型断言后使用'],
      },
    },
    'node.js': {
      easy: [
        'Node.js 的事件循环 (Event Loop) 是如何工作的？为什么它是单线程但能处理高并发？',
        '请解释 Node.js 中 require 的模块加载机制，以及它和 ES Module 的区别。',
      ],
      medium: [
        'Node.js 中的 Buffer 是什么？相比字符串它在处理二进制数据时有什么优势？',
        '请解释 Node.js 的流 (Stream) 机制，以及背压 (backpressure) 的处理方式。',
      ],
      hard: [
        'Node.js 的 worker_threads 和 cluster 模块有什么区别？各自适合什么场景？如果让你设计一个 CPU 密集型任务调度，你会选什么方案？',
        '请详细说明 Node.js 的异步 I/O 底层实现（libuv），以及它与传统线程池 I/O 的性能差异。',
      ],
      followUp: [
        '你在 Node.js 项目中遇到过哪些性能瓶颈？如何定位和解决的？',
      ],
      expectedAnswers: {
        '事件循环': ['单线程', '非阻塞 I/O', 'setImmediate / process.nextTick'],
        'Buffer': ['二进制数据', '内存分配', '与字符串编码转换'],
      },
    },
    javascript: {
      easy: [
        '请解释 JavaScript 的原型链 (Prototype Chain) 是如何工作的。',
        'JavaScript 中的 == 和 === 有什么区别？为什么推荐使用 ===？',
      ],
      medium: [
        '请解释 JavaScript 的事件循环 (Event Loop)，宏任务 (Macro Task) 和微任务 (Micro Task) 的执行顺序。',
        '解释闭包 (Closure) 的原理，并举一个在项目中使用闭包优化性能的真实案例。',
      ],
      hard: [
        '请详细说明 V8 引擎的垃圾回收机制（新生代 + 老生代），以及它如何影响前端性能优化。',
        'JavaScript 的代理 (Proxy) 相比传统的 Object.defineProperty 有什么本质优势？请举一个你会用 Proxy 实现的真实功能。',
      ],
      followUp: [
        '你有没有遇到过闭包导致的内存泄漏？如何排查的？',
      ],
      expectedAnswers: {
        '原型链': ['__proto__', 'prototype', '查找链', '继承'],
        '事件循环': ['Call Stack', 'Task Queue', 'Microtask Queue', 'Promise'],
      },
    },
    vue: {
      easy: [
        'Vue 的响应式系统是如何工作的？Vue 2 和 Vue 3 有什么本质区别？',
        'Vue 中的 computed 和 watch 有什么区别？各自适用场景是什么？',
      ],
      medium: [
        '请解释 Vue 3 的 Composition API 相比 Options API 有什么核心优势？在实际项目中你如何组织大型组件的逻辑复用？',
        'Vue 的虚拟 DOM 和 React 的有什么异同？Diff 算法的核心思路是什么？',
      ],
      hard: [
        'Vue 3 的响应式系统 (Proxy-based) 相比 Vue 2 (Object.defineProperty) 在哪些场景下有显著差异？如何设计一个轻量级的响应式库？',
        '请分析 Vue 的编译时优化（静态提升、PatchFlags、Block 等）如何减少运行时开销。',
      ],
      followUp: [
        '你在 Vue 项目中做过哪些性能优化？',
      ],
      expectedAnswers: {
        '响应式': ['Proxy', '依赖收集', '派发更新'],
        'Composition API': ['setup', 'reactive/ref', '逻辑复用'],
      },
    },
    '前端': {
      easy: [
        '请解释浏览器的渲染流程：从输入 URL 到页面显示的完整过程。',
        '浏览器缓存（强缓存 + 协商缓存）是如何工作的？HTTP 缓存头有哪些？',
      ],
      medium: [
        '请说明 CSS 的 BFC (Block Formatting Context) 是什么？它解决了哪些常见的布局问题？',
        '浏览器的重绘 (Repaint) 和回流 (Reflow/Layout) 有什么区别？你是如何优化动画性能的？',
      ],
      hard: [
        '请从浏览器架构（进程 + 线程）的角度解释一个复杂页面（如视频 + 动画 + 长列表）是如何实现流畅渲染的。你会如何排查和优化卡顿问题？',
        '如果让你设计一个完整的前端监控 SDK（性能 + 错误 + 行为），你会如何设计上报策略、数据压缩和采样机制？',
      ],
      followUp: [
        '你优化过哪些真实的前端性能问题？效果如何？',
      ],
      expectedAnswers: {
        '渲染流程': ['DNS解析', 'TCP连接', 'HTTP请求', 'DOM树', 'CSSOM', 'Render树', 'Layout', 'Paint'],
        '缓存': ['Cache-Control', 'ETag', 'Last-Modified', '强缓存 vs 协商缓存'],
      },
    },
    '后端': {
      easy: [
        '请解释 HTTP 和 HTTPS 的区别，TLS 握手过程是怎样的？',
        '数据库索引的原理是什么？B+ 树相比二叉树有什么优势？',
      ],
      medium: [
        '请说明 Redis 的常用数据结构和各自的适用场景，你是如何在项目中选择使用的？',
        '微服务架构中，服务间通信（同步 vs 异步）如何选择？消息队列（如 Kafka）解决了什么问题？',
      ],
      hard: [
        '请设计一个秒杀系统的架构，从前端限流、后端削峰、数据库兜底三个维度说明你的方案，并解释每个环节的取舍。',
        '请详细说明分布式事务的几种解决方案（2PC/TCC/Saga/本地消息表），分析各自的一致性等级和适用场景，并设计一个电商下单的完整链路。',
      ],
      followUp: [
        '你有没有遇到过线上的性能故障？如何排查的？',
      ],
      expectedAnswers: {
        '数据库': ['索引', 'B+树', '查询优化', '事务隔离级别'],
        '分布式': ['CAP', 'BASE', '最终一致性', '分布式锁'],
      },
    },
    '微服务': {
      easy: [
        '微服务相比单体架构有什么优势和劣势？你认为一个项目什么时候适合拆分微服务？',
      ],
      medium: [
        '请说明服务注册与发现（如 Consul / Nacos / Eureka）的工作原理，以及健康检查机制的设计要点。',
        '微服务中的 API 网关解决了哪些问题？你会如何设计一个可水平扩展的网关？',
      ],
      hard: [
        '请设计一个微服务的分布式链路追踪系统（类似 Jaeger/SkyWalking），包括 Trace/Span 模型、采样策略、数据存储和查询架构。',
        '微服务拆分会引入分布式事务问题，你如何在保证业务正确性和性能之间做权衡？请结合实际项目说明你的选择。',
      ],
      followUp: [
        '你参与过从单体到微服务的迁移吗？踩过哪些坑？',
      ],
      expectedAnswers: {
        '服务发现': ['注册中心', '健康检查', '负载均衡'],
        'API网关': ['限流', '鉴权', '路由', '协议转换'],
      },
    },
    '算法': {
      easy: [
        '请说明常见排序算法的时间复杂度和稳定性，并解释你如何在实际项目中选择排序算法。',
        '哈希表的工作原理是什么？解决哈希冲突有哪些方法？',
      ],
      medium: [
        '请解释动态规划 (DP) 的核心思想，并设计一个经典问题的状态转移方程（如最长递增子序列或编辑距离）。',
        '图的 BFS 和 DFS 有什么区别？各自适合什么场景？请举一个需要用 BFS/DFS 解决的工程问题。',
      ],
      hard: [
        '请设计一个支持亿级数据的 Top-K 统计系统，包括数据结构选择、内存估算、分布式处理和实时更新策略。',
        '请说明红黑树、AVL 树、B+ 树的适用场景差异，并分析为什么数据库索引选择 B+ 树而不是其他结构。',
      ],
      followUp: [
        '你在工程中使用过哪些高级数据结构解决了什么真实问题？',
      ],
      expectedAnswers: {
        '排序': ['O(n log n) 下限', '稳定 vs 不稳定', '原地排序'],
        '动态规划': ['最优子结构', '重叠子问题', '状态转移'],
      },
    },
    '数据库': {
      easy: [
        '数据库的事务隔离级别有哪些？各自解决了什么问题？你实际项目中用的是哪个级别？',
        'MySQL 索引的底层数据结构是什么？为什么选 B+ 树而不是 B 树或红黑树？',
      ],
      medium: [
        '请解释数据库的 MVCC (Multi-Version Concurrency Control) 工作原理，以及它如何实现可重复读 (REPEATABLE READ) 隔离级别。',
        '你是如何做 SQL 性能优化的？请从索引设计、查询改写、执行计划分析三个维度详细说明。',
      ],
      hard: [
        '请设计一个高可用的数据库集群方案（主从 + 读写分离 + 故障切换），包括数据一致性保证、切换延迟控制和监控告警设计。',
        '请分析分布式数据库（如 TiDB / CockroachDB / Spanner）的核心架构，相比传统 MySQL 主从架构在扩展性和一致性上有什么本质突破？',
      ],
      followUp: [
        '你有没有处理过数据库的性能抖动或死锁问题？',
      ],
      expectedAnswers: {
        '事务': ['ACID', '隔离级别', 'MVCC'],
        '索引': ['B+树', '聚簇索引', '二级索引', '覆盖索引'],
      },
    },
    docker: {
      easy: [
        'Docker 容器和虚拟机有什么本质区别？容器为什么轻量？',
      ],
      medium: [
        '请解释 Docker 的镜像分层机制（Union FS），以及它如何实现镜像的高效存储和分发。',
        'Docker 的网络模式有哪些？你如何设计容器间通信和跨主机网络？',
      ],
      hard: [
        '请设计一个基于 Kubernetes 的容器编排部署方案，包括服务发现、水平扩展、滚动更新和健康检查策略的完整配置设计。',
      ],
      followUp: [
        '你写过哪些 Dockerfile？有哪些最佳实践？',
      ],
      expectedAnswers: {
        '容器': ['cgroups', 'namespace', 'Union FS', '镜像分层'],
      },
    },
    kubernetes: {
      easy: [
        'Kubernetes 的核心组件有哪些？各自职责是什么？',
      ],
      medium: [
        '请解释 K8s 的 Pod、Deployment、Service 的关系和工作流程。',
        'K8s 的 Ingress 和 Service 有什么区别？在什么场景下你会用 Ingress？',
      ],
      hard: [
        '请设计一个完整的 K8s 生产部署方案，包括资源请求/限制 (requests/limits)、HPA 自动扩缩容策略、节点亲和/反亲和和污点容忍的合理配置。',
      ],
      followUp: [
        '你有没有实际部署和维护过 K8s 集群？',
      ],
      expectedAnswers: {
        'K8s': ['Pod', 'Deployment', 'Service', 'Ingress', 'etcd'],
      },
    },
    redis: {
      easy: [
        'Redis 为什么这么快？它的单线程模型有什么优势和限制？',
      ],
      medium: [
        'Redis 的持久化机制（RDB vs AOF）如何选择？AOF 重写的原理是什么？',
        '请说明 Redis 的主从复制 + 哨兵 (Sentinel) + 集群 (Cluster) 的层级关系，以及各自的适用场景。',
      ],
      hard: [
        '请设计一个基于 Redis 的分布式锁方案，包括锁的超时、续约（续期）、可重入性、以及在网络分区场景下的安全性分析。',
        'Redis 的内存淘汰策略有哪些？你如何根据业务特征选择合适的策略并监控内存使用？',
      ],
      followUp: [
        '你用 Redis 解决过哪些真实的性能问题？',
      ],
      expectedAnswers: {
        'Redis': ['单线程', 'IO多路复用', '持久化', '主从复制', '哨兵', '集群'],
      },
    },
    kafka: {
      easy: [
        'Kafka 的核心概念：Topic、Partition、Broker、Producer、Consumer 分别是什么？它们如何协作？',
      ],
      medium: [
        '请说明 Kafka 的消息投递语义（at-most-once / at-least-once / exactly-once）是如何实现的，以及在真实业务中如何选择。',
        'Kafka 的分区策略和消费者 Rebalance 机制是怎样工作的？什么情况下会触发 Rebalance？',
      ],
      hard: [
        '请设计一个高吞吐、低延迟的消息系统架构，包括 Kafka 集群的分区设计、副本因子选择、监控指标和消息丢失的兜底方案。',
      ],
      followUp: [
        '你在项目中用 Kafka 解决了什么问题？遇到过哪些坑？',
      ],
      expectedAnswers: {
        'Kafka': ['Topic', 'Partition', 'Offset', 'ISR', 'Consumer Group'],
      },
    },
    '机器学习': {
      easy: [
        '请说明监督学习、无监督学习、强化学习的核心区别，并各举一个实际应用场景。',
      ],
      medium: [
        '请解释梯度下降 (Gradient Descent) 的原理，以及它的变体（SGD、Adam）有什么改进？',
        '过拟合 (Overfitting) 的原因和常见解决方案有哪些？请结合实际项目说明你是如何判断和处理过拟合的。',
      ],
      hard: [
        '请详细说明 Transformer 的注意力机制 (Self-Attention) 原理，并分析它相比 RNN/CNN 在处理序列数据时的核心优势。',
        '请设计一个推荐系统的完整链路，包括特征工程、召回层、粗排、精排、重排和线上 A/B 测试策略。',
      ],
      followUp: [
        '你有没有实际训练并部署过模型？工程化过程中遇到了哪些挑战？',
      ],
      expectedAnswers: {
        'ML': ['梯度下降', '过拟合', '正则化', '特征工程'],
        '深度学习': ['CNN', 'RNN', 'Transformer', '注意力机制'],
      },
    },
    '深度学习': {
      easy: [
        '请说明常见的激活函数（ReLU、Sigmoid、Tanh、GELU）的特点和适用场景。',
      ],
      medium: [
        '请解释批归一化 (Batch Normalization) 和层归一化 (Layer Normalization) 的区别，以及它们为什么能提升训练稳定性。',
        'Dropout 的原理是什么？在深度学习中它如何起到正则化作用？推理阶段为什么要关闭 Dropout？',
      ],
      hard: [
        '请深入说明大语言模型 (LLM) 的预训练、指令微调 (SFT) 和 RLHF 的完整流程，以及每个阶段的核心技术挑战。',
        '请分析 Transformer 架构的计算复杂度和内存瓶颈，以及在实际推理部署中你会采用哪些优化策略（KV Cache、量化、蒸馏等）。',
      ],
      followUp: [
        '你有没有实际做过模型部署？推理优化方面有哪些经验？',
      ],
      expectedAnswers: {
        'LLM': ['预训练', 'SFT', 'RLHF', 'Tokenizer', 'Attention'],
      },
    },
    '项目管理': {
      easy: [
        '你如何理解技术负责人的角色？请从技术选型、团队建设、项目交付三个维度说明你的工作方法。',
      ],
      medium: [
        '请分享一个你主导的复杂项目（架构设计 + 团队协作 + 交付质量），你是如何规划、拆分任务、追踪进度和管理风险的？',
        '在技术选型中，你如何平衡新技术和稳定性？请举一个你说服团队采用或拒绝某项技术的案例。',
      ],
      hard: [
        '请设计一个完整的软件交付流程（从需求分析到线上部署），包括代码评审标准、CI/CD 流水线设计、发布策略、灰度/回滚方案、以及 SLO 设定和告警机制。',
        '如果让你负责一个5-8人的技术团队，你会如何设计技术晋升通道和代码质量保障机制？请说明激励设计和度量指标。',
      ],
      followUp: [
        '你遇到过最大的技术挑战是什么？如何带领团队解决的？',
      ],
      expectedAnswers: {
        '管理': ['技术选型', '团队协作', '项目管理', '风险控制'],
      },
    },
    '架构设计': {
      easy: [
        '请说明你理解的"高可用"是什么？请从不同层级（应用、数据库、基础设施）举例说明实现方案。',
      ],
      medium: [
        '请设计一个支持千万级 DAU 的系统架构，包括服务分层、缓存策略、数据库分片和消息队列的应用。',
        '你如何理解 CAP 定理和 BASE 理论？在实际分布式系统中你是如何在一致性和可用性之间做取舍的？',
      ],
      hard: [
        '请设计一个类似淘宝/京东的秒杀系统，从限流策略、缓存层设计、数据库保护、库存扣减的一致性方案到最终订单统计，完整说明你的架构决策和每个环节的性能估算。',
        '请分析一个大型互联网系统从单体到微服务的完整演进路径，包括服务拆分策略、数据迁移方案、双写/读写分离的过渡方案，以及服务治理体系的建设顺序。',
      ],
      followUp: [
        '你主导过哪些系统重构？决策依据是什么？',
      ],
      expectedAnswers: {
        '架构': ['高可用', '可扩展', '一致性', '性能估算', 'SLA'],
      },
    },
  };

  private readonly genericQuestions: SkillQuestionBank = {
    easy: [
      '请简单介绍一下你自己，包括你的技术背景和擅长的领域。',
      '你做过最有挑战性的项目是什么？请从技术难点和你的贡献两个角度说明。',
    ],
    medium: [
      '请分享一个你在项目中解决过的最复杂的技术问题，包括问题背景、你的分析过程、最终方案和效果评估。',
      '你平时如何学习新技术？请分享一个你系统学习过某项技术的完整方法。',
    ],
    hard: [
      '如果让你从零设计一个类似我们当前产品的系统，你会如何做技术选型和架构设计？请说明你的决策依据。',
      '请分享一次你在技术上犯过的最大错误或判断失误，你从中学到了什么？',
    ],
    followUp: [
      '你为什么对我们这个岗位感兴趣？',
      '你对未来 3-5 年的技术成长有什么规划？',
    ],
    expectedAnswers: {},
  };

  async generateQuestions(
    resume: ResumeAnalysis,
    count: number = 8,
  ): Promise<InterviewQuestion[]> {
    const questions: InterviewQuestion[] = [];
    const matchedSkills: string[] = [];

    for (const skill of resume.skills) {
      const normalizedSkill = skill.toLowerCase().trim();
      // 精确匹配知识库中的 skill
      const directMatch = this.knowledgeBank[normalizedSkill];
      if (directMatch) {
        matchedSkills.push(normalizedSkill);
      } else {
        // 模糊匹配 - 检查 skill 关键词是否包含某个库的关键词
        for (const key of Object.keys(this.knowledgeBank)) {
          if (normalizedSkill.includes(key) || key.includes(normalizedSkill)) {
            if (!matchedSkills.includes(key)) {
              matchedSkills.push(key);
            }
            break;
          }
        }
      }
    }

    // 按 seniority 分配难度
    const difficultyDistribution = this.getDifficultyDistribution(resume.seniority);
    this.logger.debug(`技能匹配: ${matchedSkills.join(', ')}, 资历: ${resume.seniority}`);

    let id = 0;
    let poolQuestions: { skill: string; difficulty: 'easy' | 'medium' | 'hard'; question: string }[] = [];

    // 从每个匹配的技能抽取题目
    for (const skill of matchedSkills.slice(0, 6)) {
      const bank = this.knowledgeBank[skill];
      if (!bank) continue;
      for (const difficulty of ['easy', 'medium', 'hard'] as const) {
        for (const q of bank[difficulty]) {
          poolQuestions.push({ skill, difficulty, question: q });
        }
      }
    }

    // 如果没有匹配到任何技能，使用通用问题
    if (poolQuestions.length === 0) {
      for (const difficulty of ['easy', 'medium', 'hard'] as const) {
        for (const q of this.genericQuestions[difficulty]) {
          poolQuestions.push({ skill: 'general', difficulty, question: q });
        }
      }
    }

    // 打乱顺序
    poolQuestions = poolQuestions.sort(() => Math.random() - 0.5);

    // 按难度分布选取
    const targetEasy = Math.ceil(count * difficultyDistribution.easy);
    const targetMedium = Math.ceil(count * difficultyDistribution.medium);
    const targetHard = count - targetEasy - targetMedium;

    const easyPool = poolQuestions.filter((q) => q.difficulty === 'easy');
    const mediumPool = poolQuestions.filter((q) => q.difficulty === 'medium');
    const hardPool = poolQuestions.filter((q) => q.difficulty === 'hard');

    const selected = [
      ...easyPool.slice(0, targetEasy),
      ...mediumPool.slice(0, targetMedium),
      ...hardPool.slice(0, targetHard),
    ];

    // 打乱最终顺序
    selected.sort(() => Math.random() - 0.5);

    for (const item of selected.slice(0, count)) {
      const bank = this.knowledgeBank[item.skill] || this.genericQuestions;
      const expectedPoints = Object.entries(bank.expectedAnswers)
        .flatMap(([, values]) => values)
        .slice(0, 5);

      questions.push({
        id: `q-${id++}`,
        category: item.skill,
        difficulty: item.difficulty,
        question: item.question,
        expectedPoints,
        followUpHints: bank.followUp,
      });
    }

    this.logger.debug(`生成 ${questions.length} 道面试题`);
    return questions;
  }

  private getDifficultyDistribution(seniority: ResumeAnalysis['seniority']): {
    easy: number; medium: number; hard: number;
  } {
    switch (seniority) {
      case 'junior':
        return { easy: 0.6, medium: 0.3, hard: 0.1 };
      case 'mid':
        return { easy: 0.4, medium: 0.4, hard: 0.2 };
      case 'senior':
        return { easy: 0.25, medium: 0.45, hard: 0.3 };
      case 'architect':
        return { easy: 0.15, medium: 0.35, hard: 0.5 };
      default:
        return { easy: 0.4, medium: 0.4, hard: 0.2 };
    }
  }

  async generateFollowUp(
    question: string,
    previousAnswer: string,
    quality: number,
  ): Promise<string | null> {
    // 质量低 → 需要追问验证
    if (quality < 0.4) {
      const followUps = [
        '你刚才的回答比较简略，能再详细说说具体的实现思路吗？',
        '可以举一个你在实际项目中应用这个技术的例子吗？',
        '能更深入地解释一下背后的原理吗？',
        '如果遇到边缘情况（如并发、异常、性能瓶颈），你会如何处理？',
      ];
      return followUps[Math.floor(Math.random() * followUps.length)];
    }

    // 质量一般 → 换个角度考察
    if (quality < 0.7) {
      return '换个角度，如果让你来设计/优化这个功能，你会关注哪些方面？';
    }

    // 质量高 → 不需要追问，返回 null 进入下一题
    return null;
  }

  async getExpectedPoints(question: string): Promise<string[]> {
    for (const bank of Object.values(this.knowledgeBank)) {
      const allQuestions = [...bank.easy, ...bank.medium, ...bank.hard];
      if (allQuestions.some((q) => q === question)) {
        return Object.entries(bank.expectedAnswers)
          .flatMap(([, values]) => values)
          .slice(0, 5);
      }
    }
    return [];
  }
}
