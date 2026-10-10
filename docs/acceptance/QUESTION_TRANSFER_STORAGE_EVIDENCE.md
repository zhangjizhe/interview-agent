# 题库迁移存储合同限定验收

范围：全新私有 Docker 网络、Milvus 2.5.3/etcd与合成题目，复用实际QuestionBankService建立BM25/dense生产schema，固定1024维合成向量。没有真实模型或业务题复制，普通用户API/浏览器尚未包含。

## 已发现失败

首轮及两轮定位运行均失败，未记通过。实际insert成功，但后续flush被默认RateLimit（0.1/s）拒绝，执行器正确记WRITE_UNKNOWN。实际SDK回执形状与当前桥接兼容。测试在后续fixture桥接flush前等待11秒（初始合成源seed flush直接调用），控制请求频率而不重试；不宣称生产限流恢复已实现。

## 最终增强版限定通过

2026-10-10最终增强版退出0，三组PASS日志已核对；语法及diff检查通过，独立测试Agent只读复核通过。实际运行API镜像digest为 `sha256:494462b80a84e54d5486867efca006e48b63f60baad237bfed2cd57d120c9af1`；新增脚本使用该镜像中的既有schema能力，源码基线main `1d811487053d8600061e103c890a27a7d9e2292d`。CI新增步骤仍须由最终提交验证。成功运行输出随工具会话保存，未将合成日志或本机路径提交。

最终增强版检查授权错配/来源指纹变化及真实已存内容冲突拒绝零插入，完整并集/源与其他组织不变，幂等二次零插入，真实成功insert后人工丢弃ack必须WRITE_UNKNOWN且该任务永远无VERIFIED；显式Strong核对后以新任务恢复并跳过。

锁是单进程测试hook，收据为内存；不证明真实跨进程锁、持久收据、普通写入协调、产品租户鉴权、embedding来源、旧16题归属或业务迁移完成。SDK可能内置SchemaMismatch重试，本测试只证明无应用主动重插；不作SDK零重试声明。

实现仅新增验收脚本与CI步骤，无应用API/数据库迁移/运行时/业务权限变更，费用0，整体NOT_ACCEPTED。

## 2026-10-11 隔离PG跨进程/持久收据增量

增强harness退出0，四组PASS日志核对完成；新增真实PG16专用空数据库，两个独立Node worker执行同目标迁移。父进程先持目标advisory锁，查询PG两个真实等待者后才释放；worker锁覆盖读计划/写入/flush/Strong核对与收据。最终总insertCount2、skipCount2，目标仅源两题，无重复，源/B指纹保持。

收据在独立连接autocommit，worker退出后新PG连接读到两任务PREPARED→VERIFIED；未知ack任务仅PREPARED→WRITE_UNKNOWN，新核对任务才VERIFIED。PREPARED收据失败拒绝且零insert。表仅存执行器元数据，无题干/答案/向量。脚本语法/diff与独立审查通过；基线main a5a8610，API镜像沿用上述digest。CI新head仍须核验。

此增量替代的是fixture单进程锁/内存sink，不是生产迁移能力。fixture URL与synthetic标志限制，无生产schema/API/权限改动；只追加由当前代码保证，未验证生产数据库权限。连接失效检查不能fence已在途Milvus写入，普通生产写入协调、真实授权与来源、浏览器和业务旧题迁移仍未完成。外部模型费用0，整体NOT_ACCEPTED。
