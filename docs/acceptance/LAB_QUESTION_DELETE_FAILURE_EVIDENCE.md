# 删除失败保留与显式重试

产品合同：删除未确认时显示错误、恢复按钮、保留题目和登录状态；管理员核对实际存储后再次确认删除。列表和删除不调用模型。

独立 helper 复用未知回执测试已存的合成题：一次 DELETE 代理返回503且不转发后台，浏览器错误提示及按钮恢复；实际 GET 同 ID 的岗位、级别、类别、题干、答案、标签一致，会话保留。观察期只有一次 DELETE，Provider 聚合与 fixture 用户 LLM_CALL 账本完全不变。随后原 helper 再次确认，真实 DELETE200/deleted=true、实际 Strong 列表为空、浏览器空状态且错误消失，计数仍不变。

这是代理拒绝测试，不证明自然 Milvus 删除故障；有限观察期无自动重试不代表无限时间保证。没有应用/API/数据库/权限修改，没有复制旧业务题或新增外部模型费用。沿用既有 API/Lab 镜像，不重复未变更的 type/build。

语法、eslint、diff 与独立审查通过。完整隔离链 API82/82及浏览器通过，首次完整隔离链 exit0，严格 PostgreSQL schema/行多集/sequence 与实际 Milvus/Qdrant 恢复全部通过；当前尚未提交，需新精确提交 CI 全绿才合并。整体 NOT_ACCEPTED。
