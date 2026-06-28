/**
 * Identity / UserId Validation — 与后端 SAFE_USERID_REGEX 像素级对齐。
 *
 * 同步源：
 * - apps/api/src/modules/auth/auth.service.ts (NestJS)
 * - apps/py/src/interview_agent/modules/auth/auth_service.py (Python)
 *
 * 三端必须保持完全一致的正则 + 保留名列表。
 *
 * R-AUTH-1 (2026-06-28)：
 * - 3-32 字符
 * - 首字符必须是小写字母或数字
 * - 后续字符允许：小写字母、数字、-、_
 * - 不允许：纯大写、特殊字符、中文、emoji
 *
 * 防恶意注入 3 层：
 * 1. 前端实时校验（边输边显示）
 * 2. 后端 Pydantic 校验（DRY 共享常量）
 * 3. DB CHECK 约束（apps/py/alembic/versions/2026_06_28_002_users_id_check.py）
 */

export const SAFE_USERID_REGEX = /^[a-z0-9][a-z0-9_-]{2,31}$/;

export const SAFE_USERID_ERROR =
  'ID 必须 3-32 字符，小写字母/数字开头，后续允许小写字母/数字/-/_';

/**
 * 系统保留名黑名单（与后端 RESERVED_USER_IDS 像素级一致）。
 *
 * 注：保留名比较时用 toLowerCase()，所以 'Admin' 也会被拒绝。
 */
export const RESERVED_USER_IDS = new Set([
  // 系统路径
  'admin', 'api', 'system', 'root', 'superuser', 'sys',
  // 程序关键字
  'null', 'undefined', 'true', 'false', 'none', 'nil', 'nan',
  // 公开占位
  'demo', 'test', 'guest', 'anonymous', 'public', 'default',
  // 角色
  'support', 'staff', 'mod', 'moderator', 'operator', 'service',
  // 平台名（防止冒名）
  'mavis', 'interview-agent', 'interview', 'agent',
  // 其他
  'me', 'self', 'login', 'logout', 'register', 'signup', 'auth',
]);

/**
 * 校验 userId 格式 + 保留名（前端校验，不依赖网络）。
 *
 * 返回：
 * - { ok: true } 格式合法 + 非保留名
 * - { ok: false, reason: string } 不合法或保留名
 */
export function validateUserIdLocal(
  userId: string,
): { ok: true } | { ok: false; reason: string } {
  if (!userId || typeof userId !== 'string') {
    return { ok: false, reason: 'ID 不能为空' };
  }
  if (!SAFE_USERID_REGEX.test(userId)) {
    return { ok: false, reason: SAFE_USERID_ERROR };
  }
  if (RESERVED_USER_IDS.has(userId.toLowerCase())) {
    return { ok: false, reason: `"${userId}" 是系统保留名，请换一个` };
  }
  return { ok: true };
}

/**
 * 智能 ID 推荐：基于浏览器信息生成可读的默认建议。
 *
 * 优先级：
 * 1. URL query 参数 ?suggest=<id>
 * 2. 浏览器语言 zh-CN → "用户-<随机6>"
 * 3. 默认 "用户-<随机6>"
 */
export function suggestDefaultId(): string {
  if (typeof window === 'undefined') return 'user-001';
  const params = new URLSearchParams(window.location.search);
  const q = params.get('suggest');
  if (q && validateUserIdLocal(q).ok) return q;
  const random6 = Math.random().toString(36).slice(2, 8).toLowerCase();
  return `user-${random6}`;
}

/**
 * localStorage keys — 集中管理避免打错字。
 */
export const LS_USER_ID = 'ia_userId';
export const LS_ACCESS_TOKEN = 'ia_accessToken';
export const LS_USER_PROFILE = 'ia_userProfile';

export interface UserProfile {
  userId: string;
  email: string;
  name: string | null;
}

export interface LoginResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: string;
  userId: string;
  email: string;
  name: string | null;
}

export interface RegisterResponse {
  userId: string;
  email: string;
  name: string | null;
  created: boolean;
}

export interface CheckResponse {
  userId: string;
  available: boolean;
  reason?: string;
}
