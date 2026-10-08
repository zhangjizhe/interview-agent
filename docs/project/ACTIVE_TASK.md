# 当前任务

更新：2026-10-08 · LAB-FIRST-ADMIN-1

## 目标

修复新组织管理员登录后 dashboard 404 和错误页面引导重复登录；核对并补足验收缺口。保留组织隔离，不迁移用户组织、不扩大权限、不调用模型。

## 实现与当前验证

LabDataset 从全局 version 唯一改为 organizationId/version 复合唯一，服务按当前组织 upsert；迁移保留所有行与 ID。错误页新增重试连接。真实 PostgreSQL 新库/存量升级与跨组织并发首次 dashboard、隔离/同组织重复验证 19/19；Lab 服务 15/15、认证 transport 10/10、相关 lint/API typecheck/Lab build 通过。实际镜像隔离 HTTP 36/36 与恢复演练通过；备份后部署迁移 18/18，本机用户浏览器已显示控制中心与 VALID 数据集。详细报告见 `docs/ACCEPTANCE-REPORT-2026-10-08-LAB-FIRST-ADMIN.md`。

## 测试缺口

服务测试 mock ensureGoldenDataset；固定管理员浏览器脚本未覆盖另一个组织的新管理员。旧 HTTP smoke 只验证 Lab agents，未访问 dashboard。本次加入普通用户被拒、合成授权/重新登录/全部初始接口/撤权拒绝回归。所有合成权限操作仅在无外网的专用 fixture 数据库执行。
