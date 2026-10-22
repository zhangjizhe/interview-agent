# SECURITY-IPADDRESS：PR59合并前置

2026-10-23，整体PRODUCT-REACCEPTANCE-1仍NOT_ACCEPTED。单主题依赖安全修复，独立于已提交的训练GET实现；本轮不修改业务API/schema、权限、费用门、审计允许列表或原braces补丁。

## 新阻断与官方依据

原训练候选ac03104201c361a0c23814405e901e09fa0ff178的PR run39831947507三项成功，但延迟生成的push run39834697409之lint job120020275007在生产审计失败，明确新公告GHSA-rxp7-6hxx-x8q5。未用旧PR通过覆盖最新失败，未盲重跑审计或降低门。

[官方公告](https://github.com/advisories/GHSA-rxp7-6hxx-x8q5)在GitHub公共库2026-10-22发布/审核，ip-address<=10.7.3受影响，修复10.7.4；异常IPv6 zone匹配可同步阻塞事件循环。[维护者修复](https://github.com/beaugunderson/ip-address/commit/ec80fcd)改为一次查找zone并拒绝行分隔符，[10.7.4发布](https://github.com/beaugunderson/ip-address/releases/tag/v10.7.4)已核实。

本轮pnpm实际链为@modelcontextprotocol/sdk1.32.1→express-rate-limit8.5.2→ip-address10.7.1（亦由mem0ai/Google SDK peer关联）；root override此前固定10.7.1。已读实际limiter.ipKeyGenerator：先node:net.isIPv6再构造Address6，不能据库公告就宣称项目端点可被该payload利用；完整应用可利用性未证明。升级受影响实际生产依赖是门控前置，非另造业务攻击路径。

## 最小修复与真实红绿

root override改10.7.4，锁文件仅该版本/完整性和limiter引用变化。生成lock时registry附带eslint/glob弃用描述元数据变更，已逐项还原无关文本；未升级这些无关包。冻结安装ignore-scripts真实exit0，实际SDK limiter解析链读回10.7.4。

新增dependency-ip-address.security.spec.ts通过SDK实际streamableHttp模块→limiter定位parser；在独立子进程对1MiB百分号后接LF/CR/U+2028/U+2029输入验证拒绝，3秒进程timeout防父进程挂死。原10.7.1实际1失败/1正常兼容通过，exit1、3.332秒，超时为红测证据；升级后同用例及原braces10项共12通过，exit0、0.415秒。正常zone、CIDR、limiter IPv6子网/IPv4/IPv4映射行为保留。子进程deadline不是生产时延Benchmark或完整SDK协议验收。

本轮API相关eslint/typecheck/Nest build工具exit0；真实生产security-audit exit0，moderate0/high1/critical0，新ip-address公告消失。high1仍是既有braces公告GHSA-vfj7-8cjw-p6xm，受审本地补丁checksum原值5119117206a8fea09e28f76c0c31763c259ec2e88e4a66ce1cf9d31306fd6eda且原10回归通过。禁止称零漏洞，审计脚本和allowlist完全未变。

临时红/绿/审计/安装收据为ip-address-red、ip-address-green、ip-address-audit、ip-address-install对应log/exit；本地临时输出不提交。

## 退出门与未完成

该依赖更改使候选SHA/镜像身份变化；原ac03104的Web278/API93/PG/浏览器/恢复仍只作为前一实现证据，不冒充新版运行时。最小安全提交后必须重新绑定PR59最新head，要求最新push/PR完整CI全部成功（含新安全回归、审计、API与实际隔离浏览器/PG/向量恢复），然后冻结head经PR合并并读回远端。

独立测试Agent曾完成训练源码/合同审查及helper，但后续运行复核额度中断，本安全子主题尚无其最终复核；CI独立完整执行待完成。外部模型0，未使用0.5CNY/次与新测试累计3CNY预算；历史未知账单、全产品真实模型质量、黄金链及部署边界不变。
