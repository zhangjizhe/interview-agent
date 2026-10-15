# 运行中跨版本历史恢复与来源展示

运行详情新增关联Agent名称与固定版本，只取真实getRun的agent/agentVersion关系；缺失显示“未记录”，不取编辑器savedVersion。Agent名称是当前关联名称，不宣称历史名称快照。无新增API/数据库/权限或模型路径。

组件两旧红测修复后32/32：编辑1.0.1时从历史恢复RUNNING的1.0.0，仍展示1.0.0且可取消；缺运行关系时不回填编辑器版本。lint/type/build/diff通过。

浏览器复用既有单串行离线模型等待点，不新增模型次数：RUNNING的1.0.0期间真实创建元数据版本1.0.1，取消Agent选择再回选真实GET新版本，切1.0.1时旧runUI不出现、后台旧run仍RUNNING且固定旧ID/1.0.0、无cancelRequestedAt。历史RUNNING按钮恢复旧run，编辑器仍1.0.1而显示真实固定1.0.0，随后复用真实取消流程并核终态agentVersionId/version仍旧版本。首次完整隔离链exit0，API82/82、全部浏览器及严格PG schema/行多集/sequence和实际Milvus/Qdrant恢复通过。Lab镜像sha256:b90d0dbff7ba497fbaed8ea4ed49e206b0f6bdd7c514e3f89b406e867e57e936。

新增源码展示UI0983，总983；原101Builder节点tags/attrs/ID/审查/证据/verdict保留，仅更新行/表达式与来源hash，新增项已核验记限定PARTIAL，最终NOT_ACCEPTED。独立复核通过，sourcehashcf3e311276c99c127a5e70aed6fdfbf75752cbf24668b727c04dc06711870f42。尚未提交，新精确CI后才合并。此场景不扩为跨用户/组织或工作流全部版本条件。整体NOT_ACCEPTED，外部费用0，无业务账号或旧题操作。
