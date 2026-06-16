import { Question } from './agent.bank';

export const FRONTEND_QUESTION_BANK: Question[] = [
  {
    id: 'fe-e1',
    level: 'easy',
    category: 'JavaScript 基础',
    question: '解释一下 JavaScript 的原型链和继承。',
    keyPoints: [
      '原型（prototype）/ 原型对象 / __proto__ 三者关系',
      '原型链查找机制',
      'ES6 class 是语法糖，本质还是原型继承',
    ],
    referenceAnswer:
      '每个函数有 prototype 属性，每个对象有 __proto__ 指向其构造函数的 prototype。访问属性时沿 __proto__ 链向上查找，直到 null。ES6 class 是基于原型的语法糖，extends 底层仍是原型链继承。',
  },
  {
    id: 'fe-e2',
    level: 'easy',
    category: 'React 基础',
    question: 'React 中 useState 和 useRef 有什么区别？',
    keyPoints: [
      'useState 触发 re-render',
      'useRef 不触发，存任意可变值',
      'useRef 适合存 DOM 引用 / 计时器 ID',
    ],
    referenceAnswer:
      'useState 改变值会触发组件重新渲染；useRef 改变 `.current` 不触发渲染。useRef 常用于：1) 访问 DOM 2) 存计时器 ID 3) 存上一次的值做对比。',
  },
  {
    id: 'fe-m1',
    level: 'medium',
    category: 'React 进阶',
    question: 'React 的 useEffect 依赖数组是什么？常见坑有哪些？',
    keyPoints: [
      '依赖数组决定 effect 何时重新执行',
      '空数组 = 仅 mount/unmount',
      '不传 = 每次 render 都跑',
      '常见坑：闭包陷阱、对象/数组引用变化',
    ],
    referenceAnswer:
      '依赖数组决定 effect 重新执行的时机。常见坑：1) 函数引用变化（用 useCallback） 2) 对象/数组字面量每次新建（用 useMemo 或拆字段）3) 闭包陷阱（stale state，配合 setState 传函数形式）4) 忘记清理副作用。',
  },
  {
    id: 'fe-m2',
    level: 'medium',
    category: '工程能力',
    question: '前端性能优化你会从哪些维度入手？',
    keyPoints: [
      '网络层：CDN、HTTP/2、压缩、预加载',
      '渲染层：SSR/SSG、Code Splitting、Tree Shaking',
      '运行时：虚拟列表、memo、Web Worker',
      '能讲出 Core Web Vitals（LCP/FID/CLS）',
    ],
    referenceAnswer:
      '分四层：1) 网络层（CDN、gzip/brotli、HTTP/2 推送）2) 资源层（Code Splitting、Tree Shaking、图片 WebP/懒加载）3) 渲染层（SSR/SSG、骨架屏）4) 运行时（React.memo、虚拟列表、Web Worker 跑重计算）。用 Core Web Vitals 量化。',
  },
  {
    id: 'fe-h1',
    level: 'hard',
    category: '架构设计',
    question: '设计一个大型前端应用的微前端架构（Micro Frontends），你会怎么选型？',
    keyPoints: [
      '能说出主流方案（qiankun / Module Federation / wujie）',
      '理解隔离机制（JS 沙箱、CSS 隔离）',
      '通信方案（props 传递 / 全局事件 / URL）',
      '适用场景和代价',
    ],
    referenceAnswer:
      '主流方案：1) qiankun（基于 single-spa，JS 沙箱 + HTML Entry，学习成本低）2) Module Federation（Webpack 5 原生，运行时共享模块）3) wujie（Web Component 沙箱，国产优秀）。隔离靠 Proxy 沙箱 + Shadow DOM；通信用 props、全局事件或 URL 状态。代价：构建复杂、调试难、SEO 挑战。',
  },
];
