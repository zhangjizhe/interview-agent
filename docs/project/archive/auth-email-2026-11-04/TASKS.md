# 待办与验收门

2026-11-04 follow-up: after local API DNS correction, the user's current password-reset email was verified in the actual NetEase inbox by exact live challenge. At the read-only check it had369 seconds remaining and0 attempts; no code was displayed or consumed. The user reported a timeout, and the exact visible stage remains awaiting clarification. Do not label this particular delivery as missing or the code as expired without new evidence.

Found/fixed a separate real UX defect: requestPasswordReset swallowed email429 and returned a dummy challenge, advancing the UI despite quota rejection. Recovery now propagates429. Unknown/unverified email requests undergo identical address admission with suppressed delivery and no stored usable code, preserving the account-existence boundary. API46 tests in4 suites, Web5, API types/lint and frozen API build pass. Actual local HTTP: exhausted original address429; unknown first request200, second cooldown429; zero real mail sent. API-only deployment retained volumes, current challenges and scoped DNS.

Today's configured local20-send quota is now exhausted after the user's final request; no failures were removed and the single unused test reservation alone was reconciled earlier. Stop real sends and do not change the quota to manufacture acceptance. Latest real complete isolated registration journey still failed before DNS correction; user-assisted email recovery completion and exact new CI remain required. Main is not merged, no full auth/product pass.

## Earlier snapshot

Latest local network evidence: default SMTP DNS route returned an address that timed out at12s; independent resolver addresses both passed original-hostname TLS/greeting in139/243ms. Only the private API compose DNS was changed (no fixed IP, no system network change); actual API SMTP authentication then passed in356ms, messagesSent0. Real delivery after DNS correction remains unverified; owner asked to try email-input recovery, with one genuine daily attempt left. Owner has only NetEase, no backup sender. A user-chosen successful reset will make the previously generated current Keychain password obsolete; never overwrite that user choice or blindly replay old password scripts.

GitHub sync: auth-only1d28cfe8eacb1e847de1d8b622f94a15552087de pushed successfully through existing GitHub CLI HTTPS credentials after SSH/no-identity and one GitHub500 failure. API branch readback equals1d28cfe. New exact CI is pending, PR65 draft and main unchanged. No predecessor green result transfers.


2026-11-04 latest AUTH-EMAIL-VERIFICATION: user requires the complete registration-code -> password-login -> email-code recovery -> new-password-login journey. Added email input to both recovery pages and email lookup to reset request/completion; legacy userId API callers remain compatible. Codes still bind verified email, purpose and user; unknown/unverified emails do not get reset codes or account existence disclosure.

Verified new scope: API auth/session/integration28, Web auth4, all three app types, relevant lint, three frozen-source Docker builds, syntax/diff; isolated real API/PG/Redis/TLS synthetic browser passed registration, password logins, email-input reset, revocation, replay/old-password denial and greeting fallback. Original local images updated; both password logins/profile/ADMIN and email-only recovery form passed without mail requests. Schema and volumes retained.

Real NetEase recovery succeeded once: exact challenge mail was received, normal reset completed, old access rejected, and new password logged into BOTH local entries. This was on the prior username-request form; the new email-input contract is only synthetic-tested so far. A separate isolated full real-mail journey then FAILED on its first registration send (CONNECT_TIMEOUT after bounded fallback); no account was created. Two sends were conservatively reserved in the original durable quota; only one send was attempted, and exactly the unused second reservation was reconciled with CAS. All real failures/cooldowns remain counted. No more live sends under unchanged conditions. Full real registration/recovery stability remains NOT_ACCEPTED; asked whether a backup SMTP sender exists, not for credentials.

Previous b6c9a64 push41806050891/PR41806057103 FAILED: full auth browser passed, later resume evidence hit actual429 after password login removed former mail cooldown. Fixture helper now waits61seconds and retries once only for an observed synthetic429; production limiter and final200 assertion stay intact. Do not reuse the earlier bf9cf6c green CI. New scoped commit/exact CI pending; PR65 stays draft and main unchanged. No whole-product, website/report or model-quality acceptance.

## Earlier snapshot (superseded by latest evidence)

Local follow-up receipt: auth-only b6c9a64f1b999047b6873f657e6a8b7f74ed7f8d pushed to origin/agent-lab. PR65 title/body and draft/head were read back; main remains f0c17cf. Exact push41806050891 / PR41806057103 are running, not yet passed. Private original-stack browser result records both password-only logins and occupied-ID registration refusal. The screenshot is a password error, not a registration response; asked the user which registration failure they see. Do not print current credentials or replay SMTP without changed evidence.


2026-11-04 user correction: ordinary verified-account login now uses username/password directly, without SMTP or a new OTP. Registration, reset/change and first-time legacy claim retain mailbox verification. The previous every-login-code policy below is superseded. Registration checks username availability before mail; occupied IDs and mail503 never create accounts.

Actual new evidence: API auth/session/integration26 and Web auth4 pass; API/Web/Lab types, relevant lint, three frozen-source Docker images and syntax/diff checks pass. Isolated real API/PG/Redis/TLS synthetic browser passed registration, three password-only logins, change/reset/revocation/replay refusal and greeting-fault fallback. Original local Web AND Lab password login passed with ADMIN/profile readback and zero mail requests; occupied registration ID refused before mail. Local images updated, passwords/schema/volumes retained. Full real NetEase registration/recovery remains NOT_ACCEPTED. Previous bf9cf6c six green CI jobs do not certify this new diff; scoped new commit/CI next, PR65 stays draft and main unchanged. No unchanged-condition SMTP retry, OTP bypass or model-quality claim.

## Previous snapshot (login policy superseded above)

2026-11-04 唯一主题 `AUTH-EMAIL-VERIFICATION`，真实邮件阶段仍 **NOT_ACCEPTED**。原库备份已在隔离库恢复并核对用户/Run/组织数量；原卷保留且加性迁移完成。用户明确授权的原账号本机管理员恢复已通过真实邮箱OTP完成，身份/组织不变、旧会话撤销。

源码侧有界SMTP连接备用、严格TLS/脱敏日志、默认8次且可配置1-20的发送限制、标题修复已完成；本机私有验收配置20次，未清计数，60秒冷却不变。45项认证测试（含15邮件测试）、lint/typecheck/build及真实API/DB/Redis/Chrome/合成TLS首欢迎故障验收通过。bf9cf6c已推送origin/agent-lab、PR65保持草稿；精确push41795747017/PR41795752775共六项全部成功，两组Docker及lint/type/test原始日志已读；API1227/22skip、Web336、HTTP136、合成邮箱全链与严格PG/向量恢复通过。远端分支与草稿PR状态已读回、PR说明已更新；真实网易仍未通过，不能合并。

真实网易部分注册/登录/改密、原账号Lab登录与重启读取已通过，但候选人页面及原账号完整找回/最终双入口登录仍超时失败。用户未看到新邮件或安全/客户端提醒。无发信Mac/Docker握手各成功一次后，仅一次候选登录仍503/SOCKET_TIMEOUT，未重发、未改密码；后续无发信检查在连接前超时。透明转发TCP可达但TLS失败，已关闭；不得沿用不可达推断。条件未变化不重放。当前仍为钥匙串临时恢复密码，生成的新重置密码未应用。秘密仅本机加密/运行内存，私有配置不提交。详见 CURRENT_STATE、ACTIVE_TASK 和邮箱验收证据。

用户暂时无法切换网络；系统HTTP/HTTPS/SOCKS/PAC代理开关均关闭不能排除其他网络问题。停止相同条件的真实投递。最新远端CI收据保留为本地交接更新且PR65说明已更新，不为收据另建源码提交或重跑已过CI。

