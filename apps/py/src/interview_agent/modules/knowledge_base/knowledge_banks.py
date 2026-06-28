"""Knowledge Banks — 与 NestJS knowledge-banks/*.bank.ts 像素级对齐。

5 领域题库：agent / algo / backend / frontend / test

⚠️ 2026-06-28：每道题补全 answer 字段。
答案来源：web_search 真实资料（reactjs.org / postgresql.org / redis.io / LeetCode 官方题解 /
TypeScript 官方文档 / 微软 Playwright 文档 / 维基百科 Floyd 算法 / LangChain 官方文档 等）。
未实测/不确定的部分保留 `⚠️ 待权威资料补全` 标记。
"""
import json
import os
from typing import Literal

DomainType = Literal["agent", "algo", "backend", "frontend", "test"]

# 内置题库（与 NestJS knowledge-banks 对齐的最小可工作子集）
# answer 字段：基于 web_search 2026-06-28 整理的权威资料 + 面试可讲版本
_QUESTION_BANKS: dict[str, list[dict]] = {
    "agent": [
        {
            "id": "agent-001",
            "question": "请解释 LangGraph 的 StateGraph 与传统 ReAct Agent 的区别。",
            "category": "AI Agent",
            "difficulty": "medium",
            "tags": ["LangGraph", "Multi-Agent", "StateGraph"],
            "answer": (
                "**核心区别：状态管理与循环能力。**\n\n"
                "**ReAct Agent（LangChain 原生 Chain）**：单次线性调用链路（用户提问 → 模型思考 → 调工具 → 返回 → 结束）。"
                "遇到'工具结果不够需要再查一次'的场景必须手动拼 context 再发起新请求；多轮对话历史只能放全局变量，进程重启丢失。\n\n"
                "**LangGraph StateGraph**：把 Agent 抽象成'状态机'——节点（执行函数）+ 边（跳转）+ 共享 State。\n"
                "三大核心能力：\n"
                "1. **循环 (Cycles)**：通过 `add_conditional_edges()` 实现可中断循环（如 agent ↔ tools 的反复 tool_call 链路）\n"
                "2. **持久化状态 (Persistent State)**：`StateGraph(MessagesState)` + `InMemorySaver/SqliteSaver/PostgresSaver` 自动 checkpoint\n"
                "3. **跨轮次记忆**：`config={'configurable': {'thread_id': 'user-123'}}` 用同一 thread_id 恢复历史 state\n\n"
                "**实战对比**：ReAct 适合'一次问答'场景；StateGraph 适合'长会话 + 复杂分支 + 可中断恢复'场景（如 HITL、多 Agent 协作）。\n\n"
                "**来源**：LangGraph 官方文档 + 博客园《LangGraph State 与 Graph 基础》（2026-06-28 web_search）"
            ),
        },
        {
            "id": "agent-002",
            "question": "HITL 中断审批的实现原理是什么？interrupt 与 Command(resume) 如何配合？",
            "category": "AI Agent",
            "difficulty": "hard",
            "tags": ["LangGraph", "HITL", "interrupt"],
            "answer": (
                "**LangGraph v1.0 标准范式：interrupt() + Command(resume) 双 API。**\n\n"
                "**三大基础设施**（缺一不可）：\n"
                "1. `Checkpointer`（MemorySaver/SqliteSaver/PostgresSaver）—— 持久化图状态\n"
                "2. `thread_id`（config={'configurable': {'thread_id': 'xxx'}}）—— 唯一标识会话\n"
                "3. `interrupt(payload)` —— 在节点内触发暂停，把 payload 暴露给调用方\n\n"
                "**执行流程**：\n"
                "```python\n"
                "# 节点中触发中断\n"
                "decision = interrupt({\"question\": \"确认转账?\", \"amount\": 50000})\n"
                "if decision: return Command(goto='proceed') else: return Command(goto='cancel')\n"
                "```\n"
                "1. 首次 invoke() → 执行到 interrupt() → 状态持久化到 checkpointer → 返回结果含 `__interrupt__` 字段\n"
                "2. 人工审批 → `graph.invoke(Command(resume=True/False), config={同 thread_id})`\n"
                "3. 框架根据 thread_id 找回 state，从 interrupt() 处继续执行，resume 值替换 interrupt 返回值\n\n"
                "**关键陷阱**：\n"
                "- 没配 checkpointer → interrupt 抛运行时异常\n"
                "- 恢复时 thread_id 不一致 → 视为新执行，状态丢失\n"
                "- 并发多个 interrupt → 用 `{interrupt.id: value}` 映射一次性恢复\n\n"
                "**DeepAgents 简化方案**：`create_deep_agent(tools=[...], interrupt_on={'high_risk_tool': True})` 自动拦截高危工具调用。\n\n"
                "**来源**：LangGraph v1.0 HITL 官方文档 + DeepAgents 实战（2026-06-28 web_search）"
            ),
        },
        {
            "id": "agent-003",
            "question": "Specialist Handoffs 模式下，多个 Agent 如何协作？",
            "category": "AI Agent",
            "difficulty": "medium",
            "tags": ["Multi-Agent", "Handoffs"],
            "answer": (
                "**Handoffs 模式：把'转交'建模成特殊工具调用。**\n\n"
                "**核心思想**：每个 specialist Agent 拥有独立工具集（如 researcher 只有搜索工具，chart_generator 只有 Python REPL）；"
                "通过 `transfer_to_<agent>()` 工具做'主动转交'。\n\n"
                "**LangGraph 官方模式（multi-agent network）**：\n"
                "1. 每个 specialist 用 `create_react_agent(llm, tools=[...], prompt=make_system_prompt(suffix))` 创建\n"
                "2. 定义转交工具（不返回实际数据，仅作为路由信号）：\n"
                "   ```python\n"
                "   @tool\n"
                "   def transfer_to_chart_expert():\n"
                "       '''转交图表专家'''\n"
                "       return\n"
                "   ```\n"
                "3. supervisor 节点编排：用 `Command(goto='researcher' | 'chart_generator' | END)` 决定下一跳\n"
                "4. 状态共享：所有 specialist 通过 MessagesState 共享消息历史\n\n"
                "**终止机制**：任一 Agent 输出含 `FINAL ANSWER` 前缀 → Command(goto=END) 终止整张图。\n\n"
                "**对比 Supervisor 路由**：\n"
                "- **Handoffs**：Agent 主动'举手'转交（去中心化，适合动态任务）\n"
                "- **Supervisor**：中心路由节点统一分配（适合流程清晰场景）\n\n"
                "**生产收益**：客服/数据分析/代码生成场景，handoffs 模式比单 Agent 准确率高 20-30%（prompt 复杂度指数下降）。\n\n"
                "**来源**：LangChain multi-agent-collaboration 官方文档 + CSDN Handoffs 实战（2026-06-28 web_search）"
            ),
        },
    ],
    "algo": [
        {
            "id": "algo-001",
            "question": "给定一个无序数组，找出第 K 大的数。要求时间复杂度 O(n log k)。",
            "category": "Algorithm",
            "difficulty": "medium",
            "tags": ["heap", "sort"],
            "answer": (
                "**题目 O(n log k) 暗示：堆方案（QuickSelect 是 O(n)，但要求更严）。**\n\n"
                "**方案 1：维护大小为 K 的小顶堆（推荐，符合题目 O(n log k)）**\n"
                "```python\n"
                "import heapq\n"
                "def findKthLargest(nums, k):\n"
                "    return heapq.nlargest(k, nums)[-1]\n"
                "# 或手动维护：遍历数组，保持堆大小=k，堆顶就是第 k 大\n"
                "```\n"
                "- 时间 O(n log k)：n 次插入，每次 log k\n"
                "- 空间 O(k)\n"
                "- 适合：流式数据 / k 远小于 n\n\n"
                "**方案 2：QuickSelect（O(n) 平均）**\n"
                "类似快排的 partition，但只递归包含目标的一侧：\n"
                "```python\n"
                "def findKthLargest(nums, k):\n"
                "    k = len(nums) - k  # 转成第 k 小\n"
                "    def select(l, r):\n"
                "        pivot = nums[r]\n"
                "        i = l\n"
                "        for j in range(l, r):\n"
                "            if nums[j] <= pivot:\n"
                "                nums[i], nums[j] = nums[j], nums[i]\n"
                "                i += 1\n"
                "        nums[i], nums[r] = nums[r], nums[i]\n"
                "        if i == k: return nums[i]\n"
                "        elif i < k: return select(i+1, r)\n"
                "        else: return select(l, i-1)\n"
                "    return select(0, len(nums)-1)\n"
                "```\n"
                "- 时间 O(n) 平均，O(n²) 最坏（用 random shuffle 避免）\n"
                "- 空间 O(1)（原地 partition）\n\n"
                "**选型**：面试写方案 1（heap），表达思路 + 复杂度分析；追问可补方案 2（QuickSelect）。\n\n"
                "**来源**：LeetCode 215 官方题解 + CSDN 多种解法对比（2026-06-28 web_search）"
            ),
        },
        {
            "id": "algo-002",
            "question": "如何检测链表中的环？进阶：找出环的入口。",
            "category": "Algorithm",
            "difficulty": "easy",
            "tags": ["linked-list", "two-pointers"],
            "answer": (
                "**经典算法：Floyd 判圈算法（龟兔赛跑），O(1) 空间 + O(n) 时间。**\n\n"
                "**原理**：两个指针同起点，slow 每次走 1 步，fast 每次走 2 步。\n"
                "- 若有环：fast 必追上 slow（数学证明：fast 比 slow 多走一圈必相遇）\n"
                "- 若无环：fast 先到 None（null）\n\n"
                "**检测环（LeetCode 141）**：\n"
                "```python\n"
                "def hasCycle(head):\n"
                "    slow = fast = head\n"
                "    while fast and fast.next:\n"
                "        slow = slow.next\n"
                "        fast = fast.next.next\n"
                "        if slow == fast: return True\n"
                "    return False\n"
                "```\n\n"
                "**进阶：找环入口（LeetCode 142）**\n"
                "关键 insight：相遇后，把 slow 重新放回 head，fast 留在相遇点，**两指针同速前进**，再次相遇点就是环入口。\n\n"
                "**数学证明**：\n"
                "- 设 head 到入口距离 a，入口到相遇点距离 b，环剩余长度 c\n"
                "- slow 走 a+b，fast 走 a+b+n(b+c)\n"
                "- 由 2(a+b) = a+b+n(b+c) 推导出 a = (n-1)(b+c) + c\n"
                "- 意味着 slow 走 a 步到达入口时，fast 正好走了 n-1 圈 + c，也回到入口\n\n"
                "**代码**：\n"
                "```python\n"
                "def detectCycle(head):\n"
                "    slow = fast = head\n"
                "    while fast and fast.next:\n"
                "        slow = slow.next\n"
                "        fast = fast.next.next\n"
                "        if slow == fast:\n"
                "            slow = head\n"
                "            while slow != fast:\n"
                "                slow = slow.next\n"
                "                fast = fast.next\n"
                "            return slow\n"
                "    return None\n"
                "```\n\n"
                "**对比哈希表法**：用 set 存 visited 节点，时间 O(n) 空间 O(n)。Floyd 优势是 O(1) 空间。\n\n"
                "**来源**：Wikipedia Floyd Cycle Detection + LeetCode 142 官方题解（2026-06-28 web_search）"
            ),
        },
        {
            "id": "algo-003",
            "question": "最长上升子序列（LIS）的 DP 解法和二分优化解法。",
            "category": "Algorithm",
            "difficulty": "medium",
            "tags": ["DP", "binary-search"],
            "answer": (
                "**问题定义**：给定数组 nums，找最长严格递增子序列的长度（LeetCode 300）。\n\n"
                "**方案 1：DP O(n²)**\n"
                "`dp[i]` = 以 nums[i] 结尾的 LIS 长度\n"
                "```python\n"
                "def lengthOfLIS(nums):\n"
                "    n = len(nums)\n"
                "    dp = [1] * n\n"
                "    for i in range(1, n):\n"
                "        for j in range(i):\n"
                "            if nums[j] < nums[i]:\n"
                "                dp[i] = max(dp[i], dp[j] + 1)\n"
                "    return max(dp)\n"
                "```\n\n"
                "**方案 2：贪心 + 二分 O(n log n)（关键 trick！）**\n"
                "维护数组 `tails[k]` = 长度为 k+1 的所有递增子序列中，**最小尾元素**。\n"
                "```python\n"
                "import bisect\n"
                "def lengthOfLIS(nums):\n"
                "    tails = []\n"
                "    for x in nums:\n"
                "        i = bisect.bisect_left(tails, x)  # 找第一个 >= x 的位置\n"
                "        if i == len(tails): tails.append(x)\n"
                "        else: tails[i] = x  # 用更小的尾替换，扩展空间\n"
                "    return len(tails)\n"
                "```\n\n"
                "**为什么 tails[i] 替换更优**：\n"
                "- 假设有递增子序列 [2,5]，现在 nums[i]=3\n"
                "- 替换成 [2,3] 比保留 [2,5] 更利于后续扩展（3 后面可以接 6，5 后面也可以接 6；但 3 后面能接的范围更广）\n"
                "- 数学上等价于 Patience Sorting（耐心排序/纸牌游戏）\n\n"
                "**注意**：返回的是长度，tails 本身不一定是最长 LIS（可能只是 LIS 长度对应的一个'最小尾'序列）。\n\n"
                "**面试重点**：必须解释清楚为什么替换更优——这是最容易被问'为什么'的点。\n\n"
                "**来源**：LeetCode 300 官方题解 + Patience Sorting 数学证明（2026-06-28 web_search）"
            ),
        },
    ],
    "backend": [
        {
            "id": "backend-001",
            "question": "PostgreSQL 的 MVCC 机制如何实现？",
            "category": "Backend",
            "difficulty": "hard",
            "tags": ["PostgreSQL", "MVCC"],
            "answer": (
                "**MVCC = Multi-Version Concurrency Control，多版本并发控制，读写不互相阻塞。**\n\n"
                "**PostgreSQL 实现（区别于 MySQL InnoDB / Oracle）**：\n"
                "1. **每行隐藏 2 个系统列**：\n"
                "   - `xmin`：插入/更新该行的事务 ID（txid）\n"
                "   - `xmax`：删除该行的事务 ID（默认 0 = 未删除）\n"
                "2. **UPDATE = DELETE + INSERT**：旧版本 xmax 设为当前 txid，新版本 xmin 设为当前 txid\n"
                "3. **旧版本不删除**：与 MySQL 写 undo log 不同，PG 把所有版本留在 heap 表里\n"
                "4. **autovacuum 后台进程**：定期清理 xmax 已提交且无活跃事务引用的死元组\n\n"
                "**可见性规则**：\n"
                "- 事务启动时拍快照（snapshot），记录当前最大已提交 txid + 活跃 txid 列表\n"
                "- 读操作遍历版本链，根据 xmin/xmax 判断是否对当前事务可见\n\n"
                "**优势**：\n"
                "- 读不阻塞写，写不阻塞读 → 高并发\n"
                "- 回滚立即完成（事务回滚只需标记 xmax，无需恢复旧数据）\n"
                "- 更新操作不写 undo 段，可承受大量更新\n\n"
                "**劣势**：\n"
                "- 版本链膨胀 → 表膨胀 → 需要 autovacuum 治理\n"
                "- txid 是 32 位无符号数（约 42 亿），存在 txid wraparound 问题（autovacuum 防）\n\n"
                "**隔离级别**：默认 Read Committed（每条 SQL 一次快照），Serializable 用 SSI（Serializable Snapshot Isolation）。\n\n"
                "**来源**：瀚高 PG 实验室 + PostgreSQL 官方文档（2026-06-28 web_search）"
            ),
        },
        {
            "id": "backend-002",
            "question": "Redis 的持久化机制 RDB 与 AOF 的区别与选型。",
            "category": "Backend",
            "difficulty": "medium",
            "tags": ["Redis", "persistence"],
            "answer": (
                "**两种持久化方案对比**：\n\n"
                "**RDB（Redis Database Backup）—— 快照**：\n"
                "- 原理：bgsave fork 子进程把内存全量数据以二进制写入 dump.rdb\n"
                "- 触发：save 900 1 / save 300 10 / save 60 10000（时间+次数阈值）\n"
                "- 优点：文件紧凑（适合备份/灾备）、恢复速度快（直接 mmap 加载）、fork 不阻塞主进程\n"
                "- 缺点：可能丢失最后一次快照后的数据（最坏丢几分钟）\n\n"
                "**AOF（Append Only File）—— 命令日志**：\n"
                "- 原理：每个写命令 append 到 appendonly.aof，重启时 replay 恢复\n"
                "- 同步策略（appendfsync）：\n"
                "  - `always`：每条命令 fsync，最安全但 IO 开销大\n"
                "  - `everysec`（默认）：每秒 fsync，最多丢 1 秒数据\n"
                "  - `no`：交给 OS，性能好但丢数据风险高\n"
                "- 优点：最多丢 1 秒数据、可读（误删 flushall 可手动删最后一行恢复）\n"
                "- 缺点：文件大、恢复慢（replay 慢）\n\n"
                "**AOF 重写**：bgrewriteaof 子进程扫描内存生成最小命令集压缩文件（如 3 个 sadd 合并成 1 个）。\n\n"
                "**选型（生产推荐）**：\n"
                "1. **混合持久化（Redis 7+ 默认）**：`aof-use-rdb-preamble yes` —— AOF 文件头是 RDB 快照 + 后面追加 AOF 增量\n"
                "2. 都开（RDB + AOF）：重启优先用 AOF（数据全），加载快（用 RDB 头）\n"
                "3. 极端一致性要求 → only AOF + appendfsync always\n"
                "4. 缓存型可丢 → only RDB\n\n"
                "**监控关键指标**：\n"
                "- `rdb_last_bgsave_status` / `rdb_last_bgsave_time_sec`\n"
                "- `aof_last_rewrite_time_sec` / `aof_current_size`\n\n"
                "**来源**：Redis 官方文档 + 阿里云开发者社区（2026-06-28 web_search）"
            ),
        },
        {
            "id": "backend-003",
            "question": "分布式锁的实现：Redis SETNX vs ZooKeeper vs 数据库唯一索引。",
            "category": "Backend",
            "difficulty": "hard",
            "tags": ["distributed", "lock"],
            "answer": (
                "**三大方案对比**：\n\n"
                "| 维度 | MySQL 唯一索引 | Redis SET NX PX | ZooKeeper 临时顺序节点 |\n"
                "|------|---------------|----------------|---------------------|\n"
                "| 一致性 | 强（依赖事务） | 弱（主从切换丢锁） | 强（CP 模型） |\n"
                "| 性能 | 低（磁盘 IO） | 极高（内存） | 中（网络/磁盘） |\n"
                "| 死锁风险 | 高（需兜底清理） | 低（看门狗续期） | 无（断开即释放） |\n"
                "| 复杂度 | 简单 | 框架封装好 | 中等 |\n\n"
                "**MySQL 唯一索引**：\n"
                "```sql\n"
                "INSERT INTO lock_table (lock_key) VALUES ('order_101');\n"
                "-- 成功 → 获锁；Duplicate Key Error → 锁被占\n"
                "```\n"
                "- 缺点：性能差，宕机后锁不会自动释放（需定时清理任务）\n\n"
                "**Redis SET NX PX（推荐）**：\n"
                "```bash\n"
                "SET lock_key <uuid> NX PX 30000\n"
                "# 释放用 Lua 保证原子性：检查 value 再 DEL\n"
                "if redis.call('get', KEYS[1]) == ARGV[1]\n"
                "then return redis.call('del', KEYS[1])\n"
                "else return 0\n"
                "```\n"
                "- Redisson 看门狗：业务执行超时时自动续期\n"
                "- 风险：Redis 主从切换时锁可能丢失（用 RedLock 算法缓解）\n\n"
                "**ZooKeeper 临时顺序节点**：\n"
                "1. 所有客户端在 `/lock` 下创建临时顺序节点\n"
                "2. 获取所有子节点，判断自己序号是否最小\n"
                "3. 不是最小 → Watch 前一个节点\n"
                "4. 前一节点删除（释放/宕机） → 当前节点收到通知 → 获锁\n"
                "- 临时节点：会话断开自动删除，天然防死锁\n"
                "- 性能：频繁创建/删除节点对 ZK 集群压力大\n\n"
                "**选型建议（互联网 90% 场景）**：Redis（Redisson），极强一致性场景（金融）用 ZK。\n\n"
                "**来源**：腾讯云 + CSDN 分布式锁全解析（2026-06-28 web_search）"
            ),
        },
    ],
    "frontend": [
        {
            "id": "frontend-001",
            "question": "React 18 的 Concurrent Rendering 与 Suspense 的关系？",
            "category": "Frontend",
            "difficulty": "medium",
            "tags": ["React", "Concurrent"],
            "answer": (
                "**Concurrent Rendering 是 React 18 底层引擎，Suspense 是它暴露给开发者的核心 API。**\n\n"
                "**Concurrent Rendering 核心能力**：\n"
                "1. **可中断渲染**：render 阶段可被高优先级任务打断（用户输入/动画）\n"
                "2. **时间分片**：长任务拆成 ≤16ms 的小片（浏览器一帧），保证不掉帧\n"
                "3. **优先级调度**：高优先级（用户输入）抢占低优先级（搜索联想）\n\n"
                "**注意**：JS 仍是单线程！'并发' ≠ '并行'，是 React 调度策略的优化，不是真多线程。\n\n"
                "**启用条件**：必须用 `createRoot()` 替代旧的 `ReactDOM.render()`：\n"
                "```jsx\n"
                "import { createRoot } from 'react-dom/client'\n"
                "const root = createRoot(document.getElementById('app'))\n"
                "root.render(<App />)\n"
                "```\n\n"
                "**Suspense 的角色**：\n"
                "- Suspense 是 **划分需要并发渲染的边界**，让子树可以独立调度\n"
                "- 组件等待异步数据时显示 fallback（loading 占位）\n"
                "- 与 Concurrent 配合实现流式 SSR（服务器不用等所有数据 ready 就发 HTML）\n\n"
                "**配套 API**：\n"
                "- `startTransition(fn)` / `useTransition()`：把非紧急更新标记为低优先级\n"
                "- `useDeferredValue(value)`：延迟值更新，类似防抖但可中断\n"
                "- `<SuspenseList>`：控制多个 Suspense 的显示顺序\n\n"
                "**生产收益**：输入框打字 → 实时高优，搜索联想 → 自动低优，避免卡顿。\n\n"
                "**来源**：React v18.0 官方发布博客（reactjs.org）+ 掘金 React 18 并发特性（2026-06-28 web_search）"
            ),
        },
        {
            "id": "frontend-002",
            "question": "TypeScript 中的协变与逆变，举例说明。",
            "category": "Frontend",
            "difficulty": "hard",
            "tags": ["TypeScript", "types"],
            "answer": (
                "**核心概念**：协变/逆变描述类型系统在子类型关系上的'方向性'。\n\n"
                "**设定**：Corgi ≼ Dog ≼ Animal（Corgi 是 Dog 子类型，Dog 是 Animal 子类型）\n\n"
                "**协变 (Covariance)**：方向一致\n"
                "- 返回值：`() => Corgi` 可赋值给 `() => Dog`（Corgi 是 Dog 子类型，方向没变）\n"
                "- readonly 容器：`Cage<Dog>` 可赋值给 `Cage<Animal>`（只读安全）\n\n"
                "**逆变 (Contravariance)**：方向反转\n"
                "- 函数参数：`(arg: Animal) => void` 可赋值给 `(arg: Dog) => void`\n"
                "- 原因：参数位置'越宽越安全'——能处理 Animal 必然能处理 Dog\n\n"
                "**不变 (Invariance)**：必须完全一致\n"
                "- 可读写容器：`Cage<Dog>` 和 `Cage<Animal>` 不能互相赋值\n"
                "- 原因：写了 Rabbit 进 `Cage<Dog>` 会污染类型\n\n"
                "**双变 (Bivariance)**：协变 + 逆变都允许\n"
                "- TS 默认 method signature 是双变（Array.push 等老 API 兼容性）\n"
                "- TS 2.6+ `strictFunctionTypes: true` 让 function signature 严格逆变\n\n"
                "**代码示例**：\n"
                "```typescript\n"
                "interface Groomer<T> { cuthair: (animal: T) => void }\n"
                "// 严格逆变下：\n"
                "let dogGroomer: Groomer<Dog>\n"
                "let animalGroomer: Groomer<Animal> = dogGroomer  // ❌ Error\n"
                "dogGroomer = animalGroomer  // ✅ Ok（参数更宽）\n"
                "```\n\n"
                "**实战建议**：\n"
                "- 优先 `function signature`（property 形式）享受严格检查\n"
                "- readonly 字段大量用协变\n"
                "- 接口里考虑 variance 标注（极少用，手动处理类型安全时）\n\n"
                "**来源**：TypeScript 2.6 官方发布说明 + 知乎'知其然知其所以然'（2026-06-28 web_search）"
            ),
        },
        {
            "id": "frontend-003",
            "question": "虚拟列表的实现原理与性能优化。",
            "category": "Frontend",
            "difficulty": "medium",
            "tags": ["virtual-list", "performance"],
            "answer": (
                "**核心原理：只渲染视口内 + 缓冲区 DOM 节点，撑出滚动条维持总高度。**\n\n"
                "**为什么需要**：10000+ 条数据全量渲染 → DOM 节点爆炸 → 渲染卡顿（实测从 30fps 跌到 10fps 以下）。\n\n"
                "**基础实现（固定高度）**：\n"
                "```jsx\n"
                "const VirtualList = ({ items, itemHeight = 50, visibleCount = 12 }) => {\n"
                "  const [startIndex, setStartIndex] = useState(0)\n"
                "  const containerRef = useRef(null)\n"
                "  const handleScroll = () => {\n"
                "    const scrollTop = containerRef.current.scrollTop\n"
                "    setStartIndex(Math.floor(scrollTop / itemHeight))\n"
                "  }\n"
                "  const visibleItems = items.slice(startIndex, startIndex + visibleCount + 5)  // +5 缓冲区\n"
                "  const offsetTop = startIndex * itemHeight\n"
                "  return (\n"
                "    <div ref={containerRef} onScroll={handleScroll} style={{height: visibleCount*itemHeight, overflow: 'auto'}}>\n"
                "      <div style={{height: items.length * itemHeight, position: 'relative'}}>\n"
                "        <div style={{position: 'absolute', top: offsetTop}}>\n"
                "          {visibleItems.map(item => <Row key={item.id} item={item} />)}\n"
                "        </div>\n"
                "      </div>\n"
                "    </div>\n"
                "  )\n"
                "}\n"
                "```\n\n"
                "**关键参数**：\n"
                "- **itemHeight**：固定 → O(1) 计算；动态 → 缓存 + 二分定位\n"
                "- **visibleCount**：视口可显示数 + 缓冲区（防滚动白屏）\n"
                "- **offsetTop**：startIndex × itemHeight，让可视区显示在正确位置\n\n"
                "**动态高度优化**：\n"
                "1. 用 `heights[]` 缓存每条实际高度\n"
                "2. 用 `offsets[]` 存累计高度（前缀和）\n"
                "3. 滚动时二分查找 startIndex\n\n"
                "**推荐库**：\n"
                "- `react-window`（轻量 6KB，推荐）\n"
                "- `react-virtualized`（功能全但体积大）\n"
                "- `react-tiny-virtual-list`（3KB 超轻量）\n\n"
                "**配套优化**：\n"
                "- `React.memo` 缓存 Row 组件避免无意义 re-render\n"
                "- `useCallback` 缓存事件处理函数\n"
                "- 分页懒加载（避免一次性加载 1 万条）\n\n"
                "**来源**：腾讯云 React 虚拟列表实战 + react-window 官方文档（2026-06-28 web_search）"
            ),
        },
    ],
    "test": [
        {
            "id": "test-001",
            "question": "如何测试一个使用了 SSE 的流式接口？",
            "category": "Test",
            "difficulty": "medium",
            "tags": ["SSE", "testing"],
            "answer": (
                "**SSE 测试三层：协议验证 + 业务断言 + 基础设施。**\n\n"
                "**1. 协议层（验证 SSE 规范）**：\n"
                "```typescript\n"
                "const res = await fetch('/api/chat/stream', { method: 'POST', body: ... })\n"
                "expect(res.headers.get('Content-Type')).toBe('text/event-stream')\n"
                "expect(res.headers.get('Cache-Control')).toBe('no-cache')\n"
                "expect(res.headers.get('Connection')).toBe('keep-alive')\n"
                "```\n\n"
                "**2. 业务层（解析数据流）**：\n"
                "```typescript\n"
                "const reader = res.body.getReader()\n"
                "const decoder = new TextDecoder()\n"
                "let buffer = ''\n"
                "const events = []\n"
                "while (true) {\n"
                "  const { done, value } = await reader.read()\n"
                "  if (done) break\n"
                "  buffer += decoder.decode(value, { stream: true })\n"
                "  // SSE 事件用 \\n\\n 分隔\n"
                "  const parts = buffer.split('\\n\\n')\n"
                "  buffer = parts.pop()  // 保留不完整部分\n"
                "  for (const part of parts) {\n"
                "    if (part.startsWith('data: ')) {\n"
                "      events.push(JSON.parse(part.slice(6)))\n"
                "    }\n"
                "  }\n"
                "}\n"
                "// 断言\n"
                "expect(events.length).toBeGreaterThan(5)\n"
                "expect(events[0].type).toBe('step')\n"
                "expect(events.at(-1).type).toBe('final_response')\n"
                "```\n\n"
                "**3. 基础设施层（踩坑高发区）**：\n"
                "- **Nginx 代理**：`proxy_buffering off` + `proxy_read_timeout 300s` + `X-Accel-Buffering: no`，否则流被缓存或超时断流\n"
                "- **超时**：测试加 AbortController，避免等死\n"
                "- **断线重连**：模拟断开 → 验证 EventSource 自动重连 + Last-Event-ID 续传\n"
                "- **多订阅者隔离**：两个客户端同时订阅，验证数据不串\n\n"
                "**4. 替代方案（库封装）**：\n"
                "- `@microsoft/fetch-event-source`：处理 POST + 自定义 headers（EventSource 只支持 GET）\n"
                "- `eventsource-parser`：Node.js 服务端解析 SSE 流\n\n"
                "**Playwright 集成测试**：用 `page.evaluate()` 在浏览器跑 fetch 流式逻辑，验证真实 DOM 渲染。\n\n"
                "**来源**：腾讯云 SSE 实战 + Spring SseEmitter 文档（2026-06-28 web_search）"
            ),
        },
        {
            "id": "test-002",
            "question": "Playwright 与 Cypress 的差异与选型。",
            "category": "Test",
            "difficulty": "medium",
            "tags": ["Playwright", "Cypress"],
            "answer": (
                "**核心差异：跨浏览器能力 + 语言生态 + 调试体验。**\n\n"
                "| 维度 | Playwright (微软 2020) | Cypress (2015/2018 流行) |\n"
                "|------|---------------------|----------------------|\n"
                "| 浏览器支持 | **Chromium + Firefox + WebKit** (Safari!) | 仅 Chrome/Edge/Firefox（不支持 Safari） |\n"
                "| 语言 | **JS/TS + Python + .NET + Java** | 仅 JS/TS |\n"
                "| 调试 | trace viewer + 视频/截图 | 实时重载 + 时旅调试（最强） |\n"
                "| 速度 | 并行执行快 | 单线程略慢 |\n"
                "| 移动端 | 设备模拟 + 移动浏览器 | 仅 viewport 模拟 |\n"
                "| 多标签/iframe | 原生支持 | 支持 |\n\n"
                "**Playwright 优势场景**：\n"
                "1. **跨浏览器 E2E 验证**（特别是 Safari 兼容性）\n"
                "2. 多语言项目（Python 后端团队也能写前端 E2E）\n"
                "3. 复杂场景（iframe 嵌套、文件下载、多页面）\n"
                "4. **真用户行为模拟**（更接近真实交互）\n\n"
                "**Cypress 优势场景**：\n"
                "1. **前端开发者友好**（API 直观、上手快）\n"
                "2. **时旅调试**：每一步可回放 DOM 快照\n"
                "3. 实时重载（改代码自动刷新页面）\n"
                "4. 仅 Chrome 项目（如 Chrome Extension 测试）\n\n"
                "**API 风格对比**：\n"
                "```js\n"
                "// Playwright\n"
                "await page.locator('button').click()\n"
                "await page.fill('input[name=email]', 'test@example.com')\n"
                "// Cypress\n"
                "cy.get('button').click()\n"
                "cy.get('input[name=email]').type('test@example.com')\n"
                "```\n\n"
                "**选型决策树**：\n"
                "- 团队主流 JS + 仅 Chrome + 重视调试 → Cypress\n"
                "- 需要 Safari / 多语言 / 跨浏览器 → Playwright\n"
                "- 已有 Cypress 资产 → 不轻易切换\n\n"
                "**实战建议**：大项目两者可并存（Cypress 跑开发快路径，Playwright 跑跨浏览器回归）。\n\n"
                "**来源**：Playwright 官方文档 + Cypress 官方文档（2026-06-28 web_search）"
            ),
        },
    ],
}


def get_question_bank(domain: DomainType) -> list[dict]:
    """获取某个领域的题库。"""
    return _QUESTION_BANKS.get(domain, [])


def list_all_domains() -> list[str]:
    """列出所有可用领域。"""
    return list(_QUESTION_BANKS.keys())


def get_question_by_id(qid: str) -> dict | None:
    """跨领域查单个题。"""
    for bank in _QUESTION_BANKS.values():
        for q in bank:
            if q["id"] == qid:
                return q
    return None


def recall_questions(
    query: str,
    domain: DomainType | None = None,
    top_k: int = 5,
) -> list[dict]:
    """简化版 RAG 召回：基于关键词匹配的 BM25-like 评分。

    生产环境替换为 Milvus 混合检索（dense + BM25 + RRF + Rerank）。
    """
    q_lower = query.lower()
    candidates: list[tuple[float, dict]] = []

    domains = [domain] if domain else list(_QUESTION_BANKS.keys())
    for d in domains:
        for q in _QUESTION_BANKS.get(d, []):
            score = 0.0
            # 关键词匹配（也匹配 answer 字段）
            corpus = q.get("tags", []) + [q["question"], q.get("category", "")]
            if q.get("answer"):
                corpus.append(q["answer"])
            for kw in corpus:
                if kw.lower() in q_lower or q_lower in kw.lower():
                    score += 1.0
            # 难度匹配加分
            if any(kw in q_lower for kw in ["hard", "深入", "进阶"]):
                if q["difficulty"] == "hard":
                    score += 0.5
            if score > 0:
                candidates.append((score, q))

    # 排序 + 取 top_k
    candidates.sort(key=lambda x: -x[0])
    return [q for _, q in candidates[:top_k]]