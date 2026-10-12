# 服务端撤销会话后的 Lab 恢复

产品合同：服务端已撤销的会话不得继续读取控制面或执行管理员操作；当前页面收到真实401后清除本会话并显示过期登录提示，重新登录可恢复权限。

隔离管理员已登录时，独立HTTP上下文实际POST/auth/logout撤销同一token的Redis会话。浏览器不先刷新：修改岗位触发未缓存条件下真实GET题库列表401，等待过期提示/登录表单，核对ia_access_token、ia_user_role、ia_userId均删除、控制面导航和题目行移除。旧token真实profile和管理员MCP重载POST均401，Provider及fixture用户LLM_CALL计数完全不变。刷新后仍为登录表单，真实登录200/newtoken profile200，旧token仍401，计数不变。

未注入HTTP故障回执，使用实际服务端撤销与鉴权拒绝。只增加独立测试helper，无应用/API/数据库/权限/计费变更，沿用已验镜像，无额外模型调用和外部费用。不读取或修改业务账号。

原题库已清空，题目行移除只证明界面卸载，不能宣称非空旧题内容或全部缓存逐项清除；QueryClient.clear为源码佐证，不是直接缓存观测。本次只验主动撤销，不代表TTL到期、角色降权或跨组织切换全部通过。

语法/eslint/diff和独立审查通过，首次完整隔离链exit0，API82/82、全部浏览器与严格PostgreSQL schema/行多集/sequence及实际Milvus/Qdrant恢复通过。仅为本撤销场景限定阶段通过；尚未提交，新精确head CI成功后才可合并；整体NOT_ACCEPTED，真实质量和生产部署边界保持。
