# 0007 用户管理：管理员后台与个人账号自助

- 状态：已执行
- 影响范围：`apps/api`（新路由、中间件、store、schema）、`apps/web`（两个新视图、标题栏账号菜单）、`packages/contracts`
- 前置文档：[0005-single-worker-topology.md](0005-single-worker-topology.md)
- 生效版本：0.5.0

## 背景

应用已有注册/登录/改密，但缺少两类能力：

- **管理员后台**：用户列表（行程数、最近活跃）、重置密码、启用/禁用、删除用户——此前只能手工连 D1 操作（见 [troubleshooting/0001](../troubleshooting/0001-auth-and-session-ops.md)）。
- **个人账号自助**：改显示名、查看登录设备（会话）并逐个登出、修改密码入口。

用户选择两项都做。

## 方案

- **管理员判定**：环境变量 `ADMIN_USERNAMES`（逗号分隔、大小写不敏感）；`isAdmin(env, username)` 由服务端判定，`/api/me` 返回 `isAdmin` 供前端决定是否显示「管理」入口；`requireAdmin` 中间件保护 `/api/admin/*`（非管理员 403 `forbidden`）。
- **禁用即失效**：`users.disabled_at` 非空即拒绝登录（403 `disabled`，PBKDF2 开销与不存在用户一致）并删除其全部会话（D1 + KV）；`requireSession` 增加兜底：会话在 D1 命中但用户已禁用（或已不存在）时，删除该会话并返回 401。
- **级联清理**：禁用、重置密码、删除都会清空目标用户的会话行与 KV 键（`s:<userId>:<sha256(token)>` 前缀分页删除）；删除用户同时删除其全部行程。所有删除都是单谓词 SQL，无需分批。
- **自我操作防护**：管理员不能禁用或删除自己（400 `self_forbidden`）；前端对自己那一行也不渲染禁用/删除按钮。
- **自助接口**：`PATCH /api/me`（显示名 trim 后 1..24 字符）、`GET /api/me/sessions`、`DELETE /api/me/sessions/:id`（仅限自己的会话）。
- **前端**：新增懒加载视图 `AccountView`（显示名、登录设备、修改密码入口）与 `AdminView`（用户表格 + 重置密码/启用禁用/删除，均带确认对话框）；入口放在标题栏账号菜单（「账号」所有人可见，「管理」仅管理员）；轻提示支持四种严重级别以复用。

## 实施（改动文件清单）

| 文件 | 变更 |
| --- | --- |
| `packages/contracts/src/index.ts` | 新增 `AdminUserRow`/`AdminUserListResponse`/`AdminUserPatch`/`AdminSetPasswordPayload`/`SessionRow`/`SessionListResponse`/`ProfilePatch`；`MeResponse` 加 `isAdmin`；`TabKey` 扩展 `account`/`admin` |
| `apps/api/src/db/schema.ts` + `migrations/20261009014732_charming_madripoor.sql` | `users.disabled_at`（`ALTER TABLE users ADD disabled_at text;`） |
| `apps/api/src/env.d.ts`、`wrangler.jsonc` | `ADMIN_USERNAMES` 声明与默认值（现为 `zerobiubiu`） |
| `apps/api/src/lib/context.ts` | `isAdmin` / `requireAdmin`；`requireSession` 的禁用兜底；KV 会话键工具与按前缀清理 |
| `apps/api/src/lib/store.ts` | 用户列表聚合（行程数/里程/会话数/最近活跃）、会话查询与删除、级联删除、显示名与禁用状态更新 |
| `apps/api/src/routes/auth.ts` | `me` 带 `isAdmin`；新增 `PATCH /api/me`、`GET /api/me/sessions`、`DELETE /api/me/sessions/:id`；登录拒绝禁用账号 |
| `apps/api/src/routes/admin.ts`（新增） | `GET /api/admin/users`、`PATCH /api/admin/users/:id`、`POST /api/admin/users/:id/password`、`DELETE /api/admin/users/:id` |
| `apps/api/src/index.ts` | 挂载 `/api/admin` 路由 |
| `apps/web/src/api.ts` | 七个新方法（`updateProfile` / `listSessions` / `revokeSession` / `adminListUsers` / `adminSetDisabled` / `adminSetPassword` / `adminDeleteUser`） |
| `apps/web/src/views/AccountView.tsx`、`AdminView.tsx`（新增） | 账号自助页与管理员页（含加载/空/错误态、确认对话框、44px 触摸目标、aria-label） |
| `apps/web/src/lib/format.ts` | `formatDateTimeLabel`、`userAgentLabel` |
| `apps/web/src/components/TopBar.tsx`、`Toasts.tsx`、`src/types.ts`、`App.tsx` | 菜单入口、严重级别放宽、懒加载接线与 `isAdmin` 补拉 |

## 执行验证记录

### 执行环境

Windows 10 / bun 1.4.2 / wrangler 4.148.0；本地单 Worker `wrangler dev --port 8790`（本地 D1/KV）；浏览器 iPhone 12 设备模拟；管理员为本地账号 `split_muzcj95b`（在 `apps/api/.dev.vars` 配置）。

### 验证命令与实际输出

| 验证 | 手段 | 实际输出 |
| --- | --- | --- |
| 服务端冒烟（子代理执行） | 临时脚本 62 项断言 | `failures=0`：注册/登录、`me.isAdmin`、改显示名（含 400 边界「显示名不能为空」/「最多 24 个字符」）、会话列表（3 条、lastSeenAt 倒序、current 唯一）、登出单设备（被登出者 401、他机 200）、跨用户删除会话 404、禁用（登录 403 `disabled`）、重置密码、删除级联、自我操作 400 |
| 类型与版本 | `bun run check` | 三份 tsc 通过；`✓ 版本一致：0.5.0` |
| 菜单入口 | 管理员账号打开账号菜单 | `["账号","管理","修改密码","导出数据（JSON）","退出登录"]` |
| 非管理员边界 | 退出后以 `verifynormal` 登录 | `/api/me` → `isAdmin=false`；菜单为 `["账号","修改密码","导出数据（JSON）","退出登录"]`（无「管理」）；直连 `/api/admin/users` → **403** `{"error":{"code":"forbidden","message":"需要管理员权限"}}` |
| 账号自助 | 改显示名为「拆分测试」 | toast「显示名已更新」；`GET /api/me` 返回新值 |
| 登录设备 | 打开账号页 | 三行会话（Chrome · Windows、Chrome · Windows「当前设备」、Bun/1.4.2），非当前设备有「登出」 |
| 管理页列表 | 打开「管理」 | 表格含用户名/显示名/行程数/合计里程/最近活跃/状态；自己那行只保留「重置密码」按钮 |
| 禁用 / 启用 | 行内操作 + 确认对话框 | `GET /api/admin/users` 由 `verifytmp:正常` → `verifytmp:禁用` → 恢复 `正常` |
| 重置密码 | 对话框提交 | 对话框关闭、接口 200 |
| 删除级联 | 删除 `verifytmp` 后用它旧 cookie 请求 | `/api/me` → `{"user":null,…}`；`/api/trips` → 401；用户列表不再含该账号；toast「已删除用户 verifytmp」 |
| 清理 | 删除冒烟账号与验证行程 | 本地库回到 1 个用户、3 条（原始）行程 |
| 控制台 | 账号页与管理页 | 0 错误 |

### 验证结论

管理员后台与账号自助两端到端可用：权限边界（403/400/自我操作）、会话失效（含 KV 缓存）、级联删除均有实测证据；前端仅在管理员账号下出现「管理」入口。

### 已知限制

- 管理员由环境变量 `ADMIN_USERNAMES` 指定：改管理员需要重新部署（`wrangler.jsonc` 的 `vars`），应用内没有「授予管理员」界面。
- `AccountView` 的会话接口若返回 401，只呈现错误态（不会自动跳登录页）；管理员页已接 `onSessionInvalid`。
- 用户列表一次拉全量（个人量级），未做分页；重置密码后强制该用户全部设备重新登录（设计如此）。
- 未做操作审计日志（谁禁用了谁）。

## 后续验证建议

1. 生产上以真实账号（`zerobiubiu`）点开「管理」，确认列表与自身账号的按钮约束。
2. 需要时把 `ADMIN_USERNAMES` 扩展为多人（逗号分隔）并重新部署。
