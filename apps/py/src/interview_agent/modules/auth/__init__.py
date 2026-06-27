"""Auth module — 与 NestJS AuthModule 像素级对齐。

对齐点：
- demo 简化登录：userId 传进来即生成 JWT（不做密码验证）
- userId 格式校验：^[a-zA-Z0-9_-]{2,50}$
- JWT 算法锁定 HS256（防 algorithm confusion）
- demo 模式无 token：注入 mock user
- 全局 Throttler 60 req/min/IP
"""