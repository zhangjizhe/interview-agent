# Agent 保存回执身份完整性

旧保存逻辑将任意HTTP2xx进入onSuccess，先显示“已保存”再使用缺失Agent/版本ID，可能部分更新状态或选择无效ID。保存mutation现先捕获创建模式/目标Agent/提交定义，要求非空ID、创建versions数组、首版本或新版本的agentId关联、提交版本号和DRAFT状态匹配，再执行成功状态更新。

独立12个旧代码红测（原10绿），修复并补版本数组类型边界后23/23、lint/type/build/diff通过。旧mock补实际agentId合同。仅保存mutation，不改API/globalclient/DB/权限/模型计费，不扩大启动与取消。此guard不比较配置全文/key/name，不宣称强一致全文回执。

浏览器创建真实Agent201，代理改投200/JSON{}，保留名称/提示词、不新增成功提示、单POST；实际GET首版本及currentVersionnull，刷新选择已存版本。再真实新增1.0.1版本201代理200{}，旧选择及编辑提示词保留、GET新版本DRAFT和关联/提示词、刷新选中新版本。合计两个实际元数据POST，Provider与fixture-admin账本无增量，无模型调用和外部费用。JSON损坏/其它畸形回执仅组件覆盖，不升级为自然故障。

第一链API82/82通过，浏览器filled“系统提示”包装label精确定位超时，诊断保留，不算整链通过；已改明确prompt textarea定位，第二链实际GET通过，但原生option已附着而不可见，默认visible等待超时；修正为stateattached后第三完整链exit0，API82/82、全部浏览器和严格PG schema/行多集/sequence及实际Milvus/Qdrant恢复通过。两个测试失败均保留，不冒充后端写入失败。真实完整链通过，Lab镜像sha256:8de82655fa99dcb6ea6492f0d055433ed0bb35251e856a70d639a86398f90e3d；未提交，需要新精确headCI后合并。源码清单982旧ID/状态/证据保留，保存guard仅pre-JSX变化，101 Builder节点行/hash已独立复核一致，hash af0a8c60922bbeb4df1e155136913076e0453099db1a107e407a787c6c365702。

已有成功提示在切换目标或新增后可能遗留，记录为后续提示归属检查；本场景从fresh编辑器开始，不证明该历史提示问题已修复。整体NOT_ACCEPTED，真实模型质量/部署/全部交互仍待验收，旧业务数据未复制。
