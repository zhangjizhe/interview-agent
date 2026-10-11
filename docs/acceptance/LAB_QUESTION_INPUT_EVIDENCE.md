# 新增题目输入拒绝与修正恢复

## 本轮产品合同

L07：必填空值由真实浏览器原生校验阻止POST；空白题干和字段分别合法但组合UTF-8超过8000字节的输入，由真实API400拒绝。拒绝不写题、不调用Provider、不增加UsageLedger，保留六字段并恢复编辑/保存/关闭。修正合法内容后，经现有真实Gateway/Milvus写入和API读回才关闭清表单。

现有DTO/service已具备拒绝能力，无确定产品缺陷，本轮只增加独立输入helper与只读计数快照、接入现有链路。API/数据库/权限/模型调用路径不变。快照用明确synthetic授权、容器名约束和固定私有DATABASE_URL校验，只返回离线Provider统计与合成账号LLM_CALL账本数量，不读取内容/密码/token/历史账单。快照失败即失败，不用默认零冒充证据。

## 双证据

独立Agent新增helper：原生required空零POST；真实POST空白题干400；题目3000B+答案6000B（单字段均合法）但组合超8000B真实400。每个拒绝核实际payload、一次POST、真实GET空题库、UI无题和六字段保留可编辑、会话token未清，前后Provider/ledger累计计数完全相同。合法修正复用原创建步骤，不增加合法模型调用，真实201/逐字段读回、成功关闭及后续搜索删除沿用独立核对。

本轮只证明上述两种服务拒绝，不代表全部字段/批量/超限/格式、自然503/超时或未知写入界面已验收。模板保持限定PARTIAL与最终NOT_ACCEPTED；真实模型质量、业务旧16题归属/复制、生产部署仍未通过。

## 状态

新增脚本语法、eslint、shell语法及diff检查通过；首次完整隔离链exit0：真实API82/82、全部浏览器步骤、严格PostgreSQL schema/行多集/sequence等值，以及Milvus题目和Qdrant vector/payload恢复通过。独立审查无范围阻断。应用镜像沿用已验API sha256:0ee7eec3d49142eb5332bb89a513d6a9331af68371edc69b39e0709f54cf3a6c、Lab sha256:38bcfffea5a8743e165d145dbcf5f3dc2d3f9677a8c178c002eefda7e9696654，不改应用代码，未重复已通过应用type/build。外部费用0，历史未知费用不记零。新精确CI须全绿才合并，整体NOT_ACCEPTED。

UI-0716仅登记真实400错误段落及核验指引出现的限定PARTIAL，不证明全部错误文案与每类状态；原有UI-0720/0722/0724/0726/0728/0730/0731补充输入保留与修正恢复证据，保留既有引用。累计34模板PARTIAL、最终980仍NOT_ACCEPTED。
