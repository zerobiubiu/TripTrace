/**
 * 前后端共享的 API 契约类型。
 *
 * 约束：**只放类型**（`interface` / `type`），不放运行时代码——两端都用 `import type` 引入，
 * 打包时会被完全擦除，因此不会产生任何运行时耦合。
 */

export interface Leg {
  from: string;
  to: string;
  km: number | null;
}

/** 新建/修改行程的请求体。 */
export interface TripPayload {
  date: string;
  nodes: string[];
  legs: Array<{ from: string; to: string; km: number | null }>;
  totalKm: number | null;
  note: string;
}

/** 行程的响应体（服务端序列化结果）。 */
export interface TripDto {
  id: string;
  date: string;
  nodes: string[];
  legs: Leg[];
  totalKm: number | null;
  note: string | null;
  /** manual | import */
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserDto {
  id: string;
  username: string;
  displayName: string;
}

export interface MeResponse {
  user: UserDto | null;
  signupCodeRequired: boolean;
  version: string;
  /** 是否管理员（由服务端按 ADMIN_USERNAMES 判定） */
  isAdmin: boolean;
}

export interface AuthResponse {
  user: UserDto;
}

export interface TripListResponse {
  trips: TripDto[];
}

export interface TripResponse {
  trip: TripDto;
}

export interface BulkImportResponse {
  created: number;
  skipped: number;
}

export interface OkResponse {
  ok: boolean;
}

/** 统一错误响应体。 */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/** 用户管理（仅管理员）：用户列表行。 */
export interface AdminUserRow {
  id: string;
  username: string;
  displayName: string;
  createdAt: string;
  tripCount: number;
  totalKm: number;
  sessionCount: number;
  /** 最近活跃（由会话的 last_seen_at 得出，无会话时为 null） */
  lastSeenAt: string | null;
  disabledAt: string | null;
}

export interface AdminUserListResponse {
  users: AdminUserRow[];
}

/** 启用/禁用：true 表示禁用。 */
export interface AdminUserPatch {
  disabled: boolean;
}

export interface AdminSetPasswordPayload {
  password: string;
}

/** 账号自助：当前用户的登录设备（会话）。 */
export interface SessionRow {
  id: string;
  userAgent: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  /** 是否是当前这台设备正在使用的会话 */
  current: boolean;
}

export interface SessionListResponse {
  sessions: SessionRow[];
}

export interface ProfilePatch {
  displayName: string;
}

/** 「导入」页解析出来的单条记录（checked 是前端 UI 状态）。 */
export interface ImportEntry {
  date: string;
  nodes: string[];
  totalKm: number | null;
  hint: string;
  checked: boolean;
}

export interface ImportParseResult {
  entries: Array<Omit<ImportEntry, "checked">>;
  notes: string[];
}

export type TabKey = "entry" | "records" | "stats" | "import" | "account" | "admin";
