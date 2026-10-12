# 创建回执完整性

原创建 mutation 将所有HTTP2xx视为成功；缺success/ID甚至无效JSON被api解析为{}时仍关闭并清空草稿。局部修复要求success严格true且questionId为非空字符串，其他回执进入未知提示并保留草稿，不自动重发。全局api、API、数据库、权限、模型计费路径不变。

独立组件六个畸形回执先6红/12绿，修复后18/18通过，覆盖successfalse、缺success、缺ID、空白/非字符串ID、无效JSON；六字段保留、按钮恢复、单POST、零clear/invalidate。正常完整成功与503回归保留，lint/typecheck/build/diff通过。

新增浏览器模式实际POST201且真实持久化成功，再由代理改投HTTP200/合法JSON{}。浏览器保留六字段/会话、未知提示、无自动重发；真实GET及刷新同ID全字段，显式真实DELETE/Strong空。每种503与畸形200模式各一次离线embedding与fixture账本增量，合计两次；新增模式额外一次，外部费用0。浏览器只验证缺失回执的合法JSON{}，无效JSON仅组件覆盖，不能升级为自然API/网络/存储故障。

Lab镜像sha256:fcda2edfe24c3a49f2ded13f7f0ba96d910a916046504df5ce994ed38222c06f。首次完整隔离链exit0，API82/82、全部浏览器、严格PostgreSQL schema/行多集/sequence与实际Milvus/Qdrant恢复通过，独立审查无阻断。新批次本地待提交/新CI，不沿用PR24的CI。整体NOT_ACCEPTED，真实模型质量/全UI/生产验收边界保持，旧业务题未复制。
