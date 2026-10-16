# 启动回执形状完整性

原start mutation对任意2xx直接选择result.id并报排队，缺字段可清已有运行或误报成功。局部校验非空字符串id、boolean reused、RunStatus五态（含FAILED/CANCELLED），异常提示先核验运行记录，再次明确提交复用同请求键；onMutate只清旧提示，不清确认、输入、key或既有runId。无API/globalclient/数据库/权限/计费路径变化。

八个畸形回执旧红测（原32绿），补已存在运行保留/无runsundefined请求/同key重试，以及FAILED/CANCELLED合法复用，修复43/43、lint/type/build/diff通过。旧mock补真实status合同，不为兼容错误mock削弱校验。

浏览器复用已完成真实运行：原503不转发后保持key，再实际reused202改投202/JSON{}，保持旧运行、输入/确认/Agent/版本，无新排队提示；后续同key held真实reused202恢复同ID，真实GET COMPLETED/calls1、Provider及fixture-admin账本无增量。新增一次复用HTTP，不增加模型调用或外部费用。首次完整隔离链exit0，API82/82、全部浏览器、严格PG schema/行多集/sequence及实际Milvus/Qdrant恢复通过。Lab镜像sha256:1f1e4a9fc73b371451ada4f8c80b639c0acba0a839dbcbe030e0b25c4351d568。

此guard是三字段形状校验，不证明返回id属于当前Agent/版本；浏览器覆盖合法JSON{}，其它畸形/null/status主要组件证据。源码清单983原ID/审查/证据/verdict保留，102Builder行/hash已独立复核，hash125d9a7e75a9efb58bc331accb7652afbc2feb92ddc4e53ab43f2ab9358cccbf。限定阶段通过，尚未提交，需新精确CI成功后合并，整体NOT_ACCEPTED，真实质量与部署边界保持，无业务数据操作。
