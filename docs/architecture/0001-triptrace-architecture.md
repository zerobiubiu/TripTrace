# 途迹 TripTrace 架构说明

- 状态：已执行（现状文档，随系统演进更新）
- 影响范围：本项目全部组件
- 生效版本：0.3.0
- 相关文件：[apps/api/wrangler.jsonc](../../apps/api/wrangler.jsonc)、[apps/web/vite.config.ts](../../apps/web/vite.config.ts)、[packages/contracts/src/index.ts](../../packages/contracts/src/index.ts)、[apps/api/src/db/schema.ts](../../apps/api/src/db/schema.ts)

## 1. 目标与形态

记录每日出差行程：**节点链（家 → 圣润 → 天九 → …）+ 分段里程（每段必填，默认带出历史值）**，并按日/月/年汇总。核心要求：日期默认今天可改、节点可自由输入、总里程由分段合计得出、历史分段与反方向里程自动带出以减少输入、数据持久化按账号隔离、登录态长期有效、**移动端为主桌面端可用**。

## 2. 部署拓扑：单 Worker（静态资源 + API）

```text
https://trips.zerobiubiu.top/           → Worker `triptrace` 的 assets 绑定（apps/web/dist，含 _headers）
https://trips.zerobiubiu.top/api/*      → 同一个 Worker 的 Hono 路由（run_worker_first）
https://triptrace.<sub>.workers.dev     → 同一个 Worker：前端启动时按主机名跳到正式域名
```

- **单部署物**：0.3.0 的「Pages 前端 + Worker 路由」已合并；一次 `wrangler deploy` 同时发布前后端（见 [changes/0005](../changes/0005-single-worker-topology.md)）。
- **路由分工**：`run_worker_first: ["/api", "/api/*"]` 让接口优先进入 Hono；其余路径由 `assets` 提供，未命中时按 `not_found_handling: single-page-application` 回退到 `index.html`。
- **同源设计**：前端与接口同一主机名、同一 Worker，Cookie（HttpOnly + SameSite=Lax + 400 天）与 CSRF 校验无需跨源让步，也不需要 CORS。
- 自定义域由 Worker 直接承载（`custom_domain: true`）；静态资源由 `wrangler` 在上传时从 `../web/dist` 读取，安全头由 `_headers` 随资源下发。

## 3. 工程结构（bun workspaces）

| 包 | 内容 | 职责 |
| --- | --- | --- |
| `apps/api` | `src/index.ts`（Hono 入口）、`src/lib/*`、`src/routes/*`、`src/db/schema.ts`、`migrations/`、`wrangler.jsonc`、`drizzle.config.ts` | 只提供 `/api/*`；D1/KV 绑定；迁移与 drizzle 生成 |
| `apps/web` | `src/*`（React SPA）、`index.html`、`vite.config.ts`、`public/`（`icon.svg`、`manifest.webmanifest`、`_headers`） | 纯静态 SPA，构建到 `dist/`，由 Worker 的 `assets` 绑定托管（不再单独部署） |
| `packages/contracts` | `src/index.ts` | **只放类型**的前后端契约（`import type` 引入，打包时擦除，零运行时耦合） |

工具链：bun（依赖与脚本）、全局 wrangler（`bun add -g wrangler`，迁移/部署/types/secret 都用它）、Drizzle（ORM 与迁移生成）、Vite 8 + React 19（前端构建）、TypeScript 7（三份 tsconfig：api / web / web-node）。

本地开发两种形态：

```bash
bun run build:web && bun run dev:api   # 单进程（8787）：同时提供静态资源与 /api，与生产同形态
bun run dev:web                        # Vite HMR（5173，代理 /api → 8787），前端迭代更快
```

生产同形态下浏览器直接开 `http://127.0.0.1:8787/`；走 Vite 时跨源写操作的 Origin 白名单可放在 `apps/api/.dev.vars` 的 `ALLOWED_ORIGINS`（不入库，仅本地需要，通常用不上）。

## 4. 数据模型（`apps/api/src/db/schema.ts`）

| 表 | 关键列 | 说明 |
| --- | --- | --- |
| `users` | `id`、`username`（唯一，归一化小写）、`display_name`、`pwd_algo`、`pwd_salt`、`pwd_hash`、`pwd_iterations`、`disabled_at`、`avatar`（data URL，最长边 ≤1000px）、`avatar_updated_at`（头像版本 / 缓存键） | 迭代次数按用户存储，便于将来升级算法而不影响存量账号；**头像大字段不进会话热路径**（`userColumns` 显式排除，按需由 `findUserAvatar` 取） |
| `sessions` | `id`、`user_id`、`token_hash`（唯一）、`created_at`、`last_seen_at`、`extended_at`、`expires_at`、`user_agent` | `extended_at` 把滚动续期限制为每天最多一次写入 |
| `trips` | `id`、`user_id`、`date`、`nodes`(JSON)、`legs`(JSON `{from,to,km\|null}`)、`total_km`(可空)、`note`、`source`、`created_at`、`updated_at` | 一次“当天的一条行程”；同一天可多条 |

约定：`total_km` 是统计口径、允许为空；若总里程为空且分段齐全，服务端按分段求和补齐；`legs[].from/to` 一律由 `nodes` 派生。查询集中在 `apps/api/src/lib/store.ts`，批量写入按 D1 单语句 100 个绑定参数上限分批（每批 8 行）。

### 迁移工作流

1. 改 `apps/api/src/db/schema.ts`；
2. `bun run db:generate` → 在 `apps/api/migrations/` 生成时间戳前缀 SQL（`migrations/meta/` 是 drizzle 快照与日志，需入库）；
3. `bun run db:migrate:local` / `bun run db:migrate:remote`（Wrangler 应用，记录在 D1 的 `d1_migrations`）。

`migrations/0001_init.sql` 是 v0.1 的基线（已应用）；`migrations/meta/` 首个快照与之等价，因此当前 `db:generate` 无变更。不使用 `drizzle-kit migrate`。

## 5. API 契约

统一前缀 `/api`；请求与响应均为 JSON；错误响应形如 `{"error":{"code","message","details?"}}`。类型定义在 `packages/contracts`，前后端共用。

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/me` | 否 | `{user\|null, signupCodeRequired, version}`；会话滚动续期时重发 Cookie |
| POST | `/api/auth/register` | 否 | 201 + 登录 Cookie；设置了 `SIGNUP_CODE` 密钥时校验邀请码 |
| POST | `/api/auth/login` | 否 | 用户信息 + 新会话 Cookie |
| POST | `/api/auth/logout` | 否 | 删除当前会话（D1 + KV）并清 Cookie |
| POST | `/api/auth/password` | 是 | 改密并清理该用户其它会话 |
| GET | `/api/trips` | 是 | 当前用户全部行程（日期倒序） |
| POST | `/api/trips` | 是 | 新建，返回 `{trip}` |
| PUT | `/api/trips/:id` | 是 | 修改（校验归属），返回更新后的 `{trip}` |
| DELETE | `/api/trips/:id` | 是 | 删除（校验归属） |
| POST | `/api/trips/bulk` | 是 | 批量导入（≤500 条），按 `日期+节点链` 去重（总里程不参与，避免同链不同里程重复入库） |
| PATCH | `/api/me` | 是 | 改显示名（trim 后 1..24 字符），返回 `{user}` |
| GET | `/api/me/sessions` | 是 | 当前用户的登录设备（会话）列表，含 `current` 标记 |
| DELETE | `/api/me/sessions/:id` | 是 | 登出指定设备（仅限自己的会话，否则 404） |
| PUT | `/api/me/avatar` | 是 | 上传/更换头像（data URL；请求体 ≤1.5MB，解码后 ≤700KB），返回 `{user}` |
| DELETE | `/api/me/avatar` | 是 | 移除头像（回到显示名首字），返回 `{user}` |
| GET | `/api/me/avatar` | 是 | 头像本体：`private, max-age=31536000, immutable`；无头像 → 404 + `no-store` |
| GET | `/api/admin/users` | 管理员 | 用户列表：行程数 / 合计里程 / 会话数 / 最近活跃 / 禁用状态 |
| PATCH | `/api/admin/users/:id` | 管理员 | 启用/禁用（禁用会立即清空该用户全部会话）；禁止操作自己 |
| POST | `/api/admin/users/:id/password` | 管理员 | 重置密码（≥8 位）并强制其全部设备重新登录 |
| DELETE | `/api/admin/users/:id` | 管理员 | 删除用户，级联清理其行程、会话与 KV 会话键；禁止删除自己 |

中间件链：`securityHeaders` →（`/api/*`）`attachDb` → 路由；受保护路由逐条挂 `...authedHandlers`（`requireSession` + `refreshSessionCookie`），管理员接口再挂 `requireAdmin`。写操作另做 CSRF 防护：`Sec-Fetch-Site: cross-site` 直接拒绝；带 `Origin` 时要求与请求主机一致，或命中 `ALLOWED_ORIGINS` 白名单（本地开发/分域部署用）。路径存在但方法不匹配时返回 404 JSON（Hono `notFound`）。

管理员与禁用：管理员由 `vars.ADMIN_USERNAMES`（逗号分隔、大小写不敏感，当前为 `zerobiubiu`）指定，`/api/me` 返回 `isAdmin` 供前端决定是否显示「管理」入口，服务端对 `/api/admin/*` 一律校验（403 `forbidden`）。`users.disabled_at` 非空即：拒绝登录（403 `disabled`）→ 会话在 D1 命中但用户已禁用/不存在时删会话并 401（含 KV 键）→ 禁用、重置密码、删除都会即时清空该用户的会话（D1 + KV 前缀 `s:<userId>:`）。

## 6. 鉴权与会话

- 密码：PBKDF2-SHA256 + 每用户 16 字节随机盐，默认 100000 次迭代（`vars.PBKDF2_ITERATIONS` 可调，按用户存储）。workerd 对迭代次数有 10 万次硬上限；本账号为 Workers Standard（付费额度，默认 30s CPU），10 万次迭代安全。处置见 [troubleshooting/0001](../troubleshooting/0001-auth-and-session-ops.md)。
- 会话令牌：32 字节随机数 → base64url，Cookie 值 `v1.<userId>.<token>`，D1 只存 `sha256(token)`。
- Cookie：`HttpOnly; SameSite=Lax; Path=/; Max-Age=34560000`（400 天），HTTPS 下附加 `Secure`。
- 长期不失效：会话 400 天，活跃时每天最多滚动续期一次并重发 Cookie；多设备互不影响；改密清理其它会话。
- 一致性：KV 命中即视为有效（缓存只在 D1 校验通过后写入）；登出/改密/手动清理都会删除对应 KV 键（键格式 `s:<userId>:<sha256(token)>`）。
- 限流（KV 计数）：同 IP 登录 30 次/15 分钟；同用户名 10 次/15 分钟；注册同 IP 10 次/小时。登录失败时对不存在的用户也执行一次同等开销的 PBKDF2，避免时序探测账号。

## 7. 前端结构与“智能建议”

```text
apps/web/src/
├── main.tsx / App.tsx        # 挂载（ThemeProvider + CssBaseline）、会话与数据编排、标签页路由
├── api.ts / types.ts         # API 封装（同源 /api）、类型入口（再导出契约包）
├── theme.ts / app.css        # MUI 主题与设计令牌（明暗自适应）；app.css 仅全局基线
├── lib/format.ts             # 日期与里程格式化
├── lib/suggest.ts            # 建议引擎（纯函数）
├── lib/importText.ts         # 历史文本解析器
├── lib/entry.ts              # 表单纯函数逻辑（节点链、分段、总里程自动/手动）
├── lib/draft.ts              # 草稿持久化（localStorage，按用户隔离；登录与启动两条路径恢复）
├── lib/tripList.ts           # 本地列表更新
├── lib/version.ts            # 构建期注入的版本号
├── components/               # TopBar（品牌 + 两个分组 + 头像 + 账号菜单）/ AvatarBadge / Toasts / PasswordDialog（全部 MUI）
├── views/                    # AuthScreen / EntryView（含页内展开的导入区）/ RecordsView（日历查询区）/ AccountView / AdminView（后三者懒加载）
└── app.css                   # 仅全局基线与安全区，其余全部走 MUI
```

导航（0.7.0 起）：标题栏只有**两个分组**（填报 / 记录）——导入并入填报（页内展开的次级卡片），汇总并入记录页（可折叠的独立区块）；账号自助与管理员后台从标题栏的账号菜单进入；用户名左侧显示头像（无自定义头像时用显示名首字）。日期选择统一用 `@mui/x-date-pickers`（dayjs 适配器 + 中文文案），记录页用 `StaticDatePicker` 做单日筛查。

视图与组件约定：`lib/avatar.ts` 负责客户端头像压缩（等比缩放到最长边 ≤1000px、质量自适应到 ≤700KB），`components/AvatarBadge.tsx` 负责头像/默认首字徽标；`lib/entry.ts` 的 `withNodesReordered` 是节点拖动/键盘换位的纯函数（仍相邻的端点对保留里程，其余按历史默认值补齐）。

建议引擎（登录后一次性拉取行程数组，`buildIndex` 建索引）：节点名按次数 + 最近使用排序（前缀优先）；分段里程**默认值**取同方向最常用值，没有同方向时**按反方向推断**（同一条路往返里程相同，界面不区分方向），已有手填值不覆盖；节点链完全一致时整链一键沿用（`withChainApplied`，按历史补齐分段）。总里程恒为分段合计（`formTotalKm`），任一段为空即拒绝保存（`formKmIssues` 区分「空白」与「不合规」）。

### 响应式布局（移动优先）

| 断点 | 布局 |
| --- | --- |
| 默认（手机） | 单列；**标题栏内含品牌 + 四个分组**；填报页底部固定保存条（含安全区适配）；触摸目标 ≥ 44px |
| ≥ 900px | 内容居中（maxWidth 1240）；卡片密度提高；保存按钮回到表单内 |
| ≥ 1180px | 填报/导入双栏；汇总两列（年度汇总跨列） |

CSP 由 `apps/web/public/_headers` 下发（`default-src 'none'`；`script-src 'self'` 另放行 Cloudflare Insights 信标；`style-src 'self' 'unsafe-inline'` 是 MUI/emotion **运行时注入样式**的必要代价——静态托管无法按请求下发 nonce，应用也无用户可控 HTML；`connect-src 'self' https://cloudflareinsights.com`），因此前端不能使用内联脚本。注意 `_headers` **不支持注释行**，写注释会让整份规则解析失败（可在 `wrangler dev` 上验证头部实际生效）。Worker 对 `/api/*` 的响应再补一次同源安全头，其 `style-src` 保持严格（API 不承载文档）。

## 8. 部署与运维

| 资源 | 名称 | 标识 |
| --- | --- | --- |
| 站点 + 接口（Worker） | `triptrace` | 自定义域 https://trips.zerobiubiu.top（静态资源 + `/api/*`）；旧地址 https://triptrace.1731865922.workers.dev |
| 前端构建产物 | `apps/web/dist` | 由 `wrangler deploy` 随 Worker 的 `assets` 上传（不单独部署） |
| 已删除（Pages） | `triptrace-web` | 0.4.0 起停用并于同日删除，自定义域与历史部署一并清除 |
| D1 | `triptrace-db` | `52a9d143-2cb4-4888-b158-4dfb36adb6c4` |
| KV | `triptrace-sessions` | `aa2cda7e62da49c7bb8449ec6150d888` |
| 账号 / Zone | 1731865922@qq.com's Account | `ece132b98267492c057accef6a60fe05` / `zerobiubiu.top`（`68a3e4dbefea64cdd5a83d4671c2ca96`） |

```bash
bun install                 # 依赖（wrangler 需另装：bun add -g wrangler）
bun run check               # 绑定类型 → 版本门禁 → api/web/node 三份 tsc
bun run build:web           # 前端产物 apps/web/dist
bun run dev:api             # 本地单进程 8787（首次先 bun run db:migrate:local）
bun run deploy              # 构建前端 + 部署 Worker（一条命令发布前后端）
bun run db:migrate:local|remote
```

版本单一来源是根 `package.json`：后端由 `scripts/check-version.mjs` 校验 `apps/api/wrangler.jsonc` 的 `vars.APP_VERSION`，前端由 Vite `define` 注入 `__APP_VERSION__`（页脚展示）。

## 9. 已知限制与设计取舍

- 前端产物：主包 635 kB（gzip ≈ 196 kB，含 React + MUI + `@mui/x-date-pickers`）；记录/汇总/导入视图按需懒加载分块。
- 设计系统为 MUI v9 + emotion（0.3.0 起）：前端文档的 CSP 必须放行 `style-src 'unsafe-inline'`；`vite preview` 不解析 `_headers`，头部与 CSP 只能在 `wrangler dev` 或生产上验证。
- 行程列表一次性拉全量（个人量级：数年数百条）；数据量到数千条以上需要加范围查询与分页。
- 无密码找回：以管理员身份在 D1 侧重置（见 troubleshooting/0001）。
- 无离线写入：断网只能读已加载页面，不能提交（无 Service Worker 或本地队列）。
- 旧地址（workers.dev）与新域名不共享 Cookie：前端启动时会按主机名把 `.workers.dev` 跳到正式域名，因此不会在旧地址上再形成第二套登录态（`/api/*` 直连旧地址仍可用，仅供调试）。
- 本地有两种形态：单进程（`build:web` + `dev:api`，与生产一致）与双进程（Vite HMR + `dev:api`，代理保证同源；跨源兜底靠 `.dev.vars` 的 `ALLOWED_ORIGINS`，新机器克隆后需补建）。
- 工具链坑（shim 残留、全局 vite 抢占、Pages 域名 DNS、TS7 baseUrl）见 [troubleshooting/0002](../troubleshooting/0002-workspace-tooling-gotchas.md)。
