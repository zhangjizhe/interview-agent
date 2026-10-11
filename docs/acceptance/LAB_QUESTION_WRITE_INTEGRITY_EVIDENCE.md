# 题库写入回执与补偿完整性

## 问题和最小修复

L07独立红测确认旧实现允许稀疏/重复/超int64主键回执成功；补偿只依据delete ack+flush，无Strong读回就宣称已回滚。初始10项8红/2绿。修复后追加5项发现部分回执仍误报：两条写入只确认一个主键，即使已知主键查空，未确认行仍可能存在。该追加红测也已修复。

最终要求主键回执完整数组、明确string/safe number、非负整数、int64上限、规范化后唯一。仅按验证的新主键补偿；成功状态、数量和insert_cnt完整覆盖整批时，delete+flush+Strong空读回才允许QUESTION_WRITE_ROLLED_BACK。缺回执/部分回执/残留/RPC失败/无status或data都保持QUESTION_WRITE_UNCONFIRMED。插入和embedding不重试。

沿用现有QuestionBankService/Milvus SDK及Strong常量，无架构/API/数据库迁移/权限变更。回滚增加一次有界5s Strong读；不增加模型调用。日志仅事件/布尔，不保存题目或凭据。未知结果仍需先核存储再重试，不承诺消除未知持久化。

## 验证与边界

独立新增15项，与input/boundaries合计34/34通过；修改后lint/typecheck通过。最终API镜像sha256:0ee7eec3d49142eb5332bb89a513d6a9331af68371edc69b39e0709f54cf3a6c已构建并确认含部分回执修复。首次实际隔离链exit0：API82/82、完整浏览器回归、严格PostgreSQL schema/行多集/sequence等值，以及Milvus题目和Qdrant vector/payload恢复通过；新存储补偿两项PASS。Lab沿用sha256:38bcfffea5a8743e165d145dbcf5f3dc2d3f9677a8c178c002eefda7e9696654。独立最终审查无新增范围阻断。

实际SDK fixture将插入后flush故障与伪delete ack组合，但真实Milvus行未移除；要求Strong残留保持未知、原有题保留，再恢复真实delete显式移除及Strong确认。使用恒定合成向量，证明存储SDK补偿，不能证明Gateway计量或HTTP未知写入界面。仅由verify-built-api私有新容器调用，禁止手工对业务MILVUS_URL运行。

其余完整HTTP/浏览器调用离线fixture provider，外部模型费用0，历史未知费用不记零。业务旧16题未复制；真实质量、全部UI、生产部署仍未验收，整体NOT_ACCEPTED。新精确提交须CI全绿后才合并。
