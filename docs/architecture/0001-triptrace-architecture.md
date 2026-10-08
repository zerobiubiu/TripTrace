# 途迹 TripTrace 架构说明

- 状态：已执行（现状文档，随系统演进更新）
- 影响范围：本项目全部组件
- 生效版本：0.3.0
- 相关文件：[apps/api/wrangler.jsonc](../../apps/api/wrangler.jsonc)、[apps/web/vite.config.ts](../../apps/web/vite.config.ts)、[packages/contracts/src/index.ts](../../packages/contracts/src/index.ts)、[apps/api/src/db/schema.ts](../../apps/api/src/db/schema.ts)

## 1. 目标与形态

记录每日出差行程：**节点链（家 → 圣润 → 天九 → …）+ 分段里程（可选）+ 总里程**，并按日/月/年汇总。核心要求：日期默认今天可改、节点可自由输入、分段可不填只填总里程、历史路线自动提示以减少输入、数据持久化按账号隔离、登录态长期有效、**移动端为主桌面端可用**。

## 2. 部署拓扑：同一域名，两个路径

```text
https://trips.zerobiubiu.top/         → Cloudflare Pages（apps/web 构建产物 dist/，含 _headers）
https://trips.zerobiubiu.top/api/*    → Worker 路由 → Worker `triptrace`（apps/api，Hono）
https://triptrace.<sub>.workers.dev   → 保留：/api/* 可用；非 API 路径 302 跳前端站点
```

- **同源设计**：前端与 API 同一主机名，Cookie（HttpOnly + SameSite=Lax + 400 天）与 CSRF 校验策略无需为跨源做让步，也不需要 CORS。
- **路由优先**：官方规则「Routes 在同一主机名上优先于 Custom Domain」，因此 `/api/*` 稳定命中 Worker，其余路径由 Pages 提供（含 SPA 回退与 `_headers` 注入的安全头）。
- 前端与后端**各自独立部署**：前端 `wrangler pages deploy`，后端 `wrangler deploy`。

## 3. 工程结构（bun workspaces）

| 包 | 内容 | 职责 |
| --- | --- | --- |
| `apps/api` | `src/index.ts`（Hono 入口）、`src/lib/*`、`src/routes/*`、`src/db/schema.ts`、`migrations/`、`wrangler.jsonc`、`drizzle.config.ts` | 只提供 `/api/*`；D1/KV 绑定；迁移与 drizzle 生成 |
| `apps/web` | `src/*`（React SPA）、`index.html`、`vite.config.ts`、`public/`（`icon.svg`、`manifest.webmanifest`、`_headers`） | 纯静态 SPA，构建到 `dist/`，由 Pages 托管 |
| `packages/contracts` | `src/index.ts` | **只放类型**的前后端契约（`import type` 引入，打包时擦除，零运行时耦合） |

工具链：bun（依赖与脚本）、全局 wrangler（`bun add -g wrangler`，迁移/部署/types/secret 都用它）、Drizzle（ORM 与迁移生成）、Vite 8 + React 19（前端构建）、TypeScript 7（三份 tsconfig：api / web / web-node）。

本地开发是两个进程：

```bash
bun run dev:api   # wrangler dev（8787，本地 D1/KV，加载 apps/api/.dev.vars）
bun run dev:web   # vite（5173，代理 /api → 8787，保持同源语义）
```

跨源写操作的 Origin 白名单放在 `apps/api/.dev.vars` 的 `ALLOWED_ORIGINS`（不入库，仅本地需要）。

## 4. 数据模型（`apps/api/src/db/schema.ts`）

| 表 | 关键列 | 说明 |
| --- | --- | --- |
| `users` | `id`、`username`（唯一，归一化小写）、`display_name`、`pwd_algo`、`pwd_salt`、`pwd_hash`、`pwd_iterations` | 迭代次数按用户存储，便于将来升级算法而不影响存量账号 |
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

中间件链：`securityHeaders` →（`/api/*`）`attachDb` → 路由；受保护路由逐条挂 `...authedHandlers`（`requireSession` + `refreshSessionCookie`）。写操作另做 CSRF 防护：`Sec-Fetch-Site: cross-site` 直接拒绝；带 `Origin` 时要求与请求主机一致，或命中 `ALLOWED_ORIGINS` 白名单（本地开发/分域部署用）。路径存在但方法不匹配时返回 404 JSON（Hono `notFound`）。

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
├── components/               # TopBar / NavTabs / Toasts / PasswordDialog（全部 MUI 组件）
└── views/                    # AuthScreen / EntryView / RecordsView / StatsView / ImportView（Records/Stats/Import 懒加载）
```

建议引擎（登录后一次性拉取行程数组，`buildIndex` 建索引）：节点名按次数 + 最近使用排序（前缀优先）；分段里程取同方向最常用值，无同方向时用反方向并标注「反向」；节点链完全一致时提示「历史路线」（可一键沿用并自动补齐空白分段）；总里程默认按分段自动合计，手改后转手动并提示差额。

### 响应式布局（移动优先）

| 断点 | 布局 |
| --- | --- |
| 默认（手机） | 单列；顶部工具栏 + **底部固定导航**（4 项，安全区适配）；触摸目标 ≥ 44px |
| ≥ 900px | 左侧竖排导航 + 内容区；卡片密度提高 |
| ≥ 1180px | 填报/导入双栏；汇总两列（年度汇总跨列） |

CSP 由 `apps/web/public/_headers` 下发（`default-src 'none'`；`script-src 'self'` 另放行 Cloudflare Insights 信标；`style-src 'self' 'unsafe-inline'` 是 MUI/emotion **运行时注入样式**的必要代价——静态托管无法按请求下发 nonce，应用也无用户可控 HTML；`connect-src 'self' https://cloudflareinsights.com`），因此前端不能使用内联脚本。注意 `_headers` **不支持注释行**，写注释会让整份规则解析失败（可在 `wrangler dev` 上验证头部实际生效）。Worker 对 `/api/*` 的响应再补一次同源安全头，其 `style-src` 保持严格（API 不承载文档）。

## 8. 部署与运维

| 资源 | 名称 | 标识 |
| --- | --- | --- |
| 前端（Pages） | `triptrace-web` | https://trips.zerobiubiu.top（项目子域 `triptrace-web-367.pages.dev`） |
| 后端（Worker） | `triptrace` | 路由 `trips.zerobiubiu.top/api/*`；旧地址 https://triptrace.1731865922.workers.dev |
| D1 | `triptrace-db` | `52a9d143-2cb4-4888-b158-4dfb36adb6c4` |
| KV | `triptrace-sessions` | `aa2cda7e62da49c7bb8449ec6150d888` |
| 账号 / Zone | 1731865922@qq.com's Account | `ece132b98267492c057accef6a60fe05` / `zerobiubiu.top`（`68a3e4dbefea64cdd5a83d4671c2ca96`） |

```bash
bun install                 # 依赖（wrangler 需另装：bun add -g wrangler）
bun run check               # 绑定类型 → 版本门禁 → api/web/node 三份 tsc
bun run dev:api             # 本地后端 8787（首次先 bun run db:migrate:local）
bun run dev:web             # 本地前端 5173（代理 /api）
bun run build:web           # 前端产物 apps/web/dist
bun run deploy:api          # 部署 Worker（含路由与变量）
bun run deploy:web          # 构建 + 上传到 Pages 项目 triptrace-web
bun run db:migrate:local|remote
```

版本单一来源是根 `package.json`：后端由 `scripts/check-version.mjs` 校验 `apps/api/wrangler.jsonc` 的 `vars.APP_VERSION`，前端由 Vite `define` 注入 `__APP_VERSION__`（页脚展示）。

## 9. 已知限制与设计取舍

- 前端产物：主包 458 kB（gzip 141 kB，含 React + MUI）；记录/汇总/导入视图已按需懒加载分块（3.7 / 9.2 / 18.7 kB）。
- 设计系统为 MUI v9 + emotion（0.3.0 起）：前端文档的 CSP 必须放行 `style-src 'unsafe-inline'`；`vite preview` 不解析 `_headers`，头部与 CSP 只能在 `wrangler dev` 或生产上验证。
- 行程列表一次性拉全量（个人量级：数年数百条）；数据量到数千条以上需要加范围查询与分页。
- 无密码找回：以管理员身份在 D1 侧重置（见 troubleshooting/0001）。
- 无离线写入：断网只能读已加载页面，不能提交（无 Service Worker/本地队列）。
- 本地 `vite dev`/`wrangler dev` 是两个进程；跨源写操作依赖 `apps/api/.dev.vars` 的 `ALLOWED_ORIGINS`（新机器克隆后需补建）。
- 旧地址（workers.dev）与新域名不共享 Cookie：换域名后旧站点登录态不迁移，需要在新站点重新登录一次。
- 工具链坑（shim 残留、全局 vite 抢占、Pages 域名 DNS、TS7 baseUrl）见 [troubleshooting/0002](../troubleshooting/0002-workspace-tooling-gotchas.md)。
