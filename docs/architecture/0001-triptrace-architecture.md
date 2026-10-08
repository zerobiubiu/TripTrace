# 途迹 TripTrace 架构说明

- 状态：已执行（现状文档，随系统演进更新）
- 影响范围：本项目全部组件
- 生效版本：0.2.0
- 相关文件：[wrangler.jsonc](../../wrangler.jsonc)、[vite.config.ts](../../vite.config.ts)、[drizzle.config.ts](../../drizzle.config.ts)、[src/db/schema.ts](../../src/db/schema.ts)、[src/worker](../../src/worker)、[src/app](../../src/app)

## 1. 目标与形态

记录每日出差行程：**节点链（家 → 圣润 → 天九 → …）+ 分段里程（可选）+ 总里程**，并按日/月/年汇总。核心体验要求：

1. 打开即出现当天日期，日期可改；
2. 节点直接输入，历史节点名自动补全；
3. 分段里程可以不填，只填总里程也能保存；
4. 历史路线能自动提示/一键沿用以减少输入；
5. 数据持久化、按账号隔离、多人使用需要鉴权；
6. 登录态在一台设备上长期有效；
7. **移动端为主要使用场景，桌面端可用**：移动优先设计 + 响应式布局。

## 2. 技术栈与组件

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 包管理 | **bun** | `bun install` / `bun run <script>`；`bun.lock` 入库 |
| 构建/开发 | **Vite 8 + @vitejs/plugin-react + @cloudflare/vite-plugin** | `vite dev` 在 Workers 运行时里跑 Worker（本地 D1/KV 绑定）；`vite build` 产出 `dist/client`（前端）+ `dist/triptrace`（Worker 与输出 wrangler.json） |
| 后端 | **Hono** | 路由/中间件/错误处理；仅 `/api/*` 进入 Worker |
| ORM | **Drizzle**（`drizzle-orm/d1`） | 表定义见 `src/db/schema.ts`；迁移由 drizzle-kit 生成、Wrangler 应用 |
| 前端 | **React 19** | 原生 ES 模块 + Vite 打包，无 UI 框架；样式为手写 CSS（设计令牌 + 媒体查询） |
| 存储 | D1 + KV | D1 为事实来源；KV 做会话缓存与限流计数 |
| CLI | 全局 wrangler（`bun add -g wrangler`） | 迁移、部署、`wrangler types`、secret 均用全局命令；Vite 插件内部另带一份锁定版本的 wrangler 用于构建 |

```text
浏览器（React SPA）
   │  /api/* → Worker（assets.run_worker_first）
   ▼
Hono Worker（src/worker）
   ├── Workers 静态资源（构建产物 dist/client）：HTML/CSS/JS + SPA 回退 + _headers
   ├── D1（binding DB）：users / sessions / trips（Drizzle 访问）
   └── KV（binding SESSIONS）：会话缓存 + 限流
```

## 3. 数据模型（`src/db/schema.ts`）

| 表 | 关键列 | 说明 |
| --- | --- | --- |
| `users` | `id`、`username`（唯一，归一化小写）、`display_name`、`pwd_algo`、`pwd_salt`、`pwd_hash`、`pwd_iterations` | 迭代次数按用户存储，便于将来升级算法而不影响存量账号 |
| `sessions` | `id`、`user_id`、`token_hash`（唯一）、`created_at`、`last_seen_at`、`extended_at`、`expires_at`、`user_agent` | 服务端会话；`extended_at` 把滚动续期限制为每天最多一次写入 |
| `trips` | `id`、`user_id`、`date`、`nodes`(JSON)、`legs`(JSON `{from,to,km\|null}`)、`total_km`(可空)、`note`、`source`、`created_at`、`updated_at` | 一次“当天的一条行程”；同一天可多条 |

约定：`total_km` 是统计口径、允许为空；若总里程为空且分段齐全，服务端按分段求和补齐；`legs[].from/to` 一律由 `nodes` 派生。

### 迁移工作流

1. 改 `src/db/schema.ts`；
2. `bun run db:generate` → 在 `migrations/` 生成时间戳前缀 SQL（`migrations/meta/` 是 drizzle 的快照与日志，需入库）；
3. `bun run db:migrate:local` / `bun run db:migrate:remote`（Wrangler 应用，记录在 D1 的 `d1_migrations`）。

`migrations/0001_init.sql` 是 v0.1 的基线（线上/本地均已应用）；`migrations/meta/` 中的首个快照与之等价，因此 `db:generate` 目前不会产生任何变更。不使用 `drizzle-kit migrate`（迁移执行统一交给 Wrangler）。

## 4. API 契约

统一前缀 `/api`；请求与响应均为 JSON；错误响应形如 `{"error":{"code","message","details?"}}`。

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
| POST | `/api/trips/bulk` | 是 | 批量导入（≤500 条），按 `日期+节点链+总里程` 去重 |

路由与中间件：`src/worker/index.ts` 依次挂 `securityHeaders` →（`/api/*`）`attachDb` → `authRoutes`/`tripRoutes`；受保护路由逐条挂 `...authedHandlers`（`requireSession` + `refreshSessionCookie`），避免中间件按路径前缀误伤兄弟路由。写操作另做 CSRF 防护（`Sec-Fetch-Site`/`Origin` 校验）。路径存在但方法不匹配时返回 404 JSON（Hono `notFound`）。

## 5. 鉴权与会话

- 密码：PBKDF2-SHA256 + 每用户 16 字节随机盐，默认 100000 次迭代（`vars.PBKDF2_ITERATIONS` 可调，按用户存储）。workerd 对迭代次数有 10 万次硬上限；本账号为 Workers Standard（付费额度，默认 30s CPU），10 万次迭代安全。处置见 [troubleshooting/0001](../troubleshooting/0001-auth-and-session-ops.md)。
- 会话令牌：32 字节随机数 → base64url，Cookie 值 `v1.<userId>.<token>`，D1 只存 `sha256(token)`。
- Cookie：`HttpOnly; SameSite=Lax; Path=/; Max-Age=34560000`（400 天），HTTPS 下附加 `Secure`（属性策略集中在 `sessionCookieOptions()`）。
- 长期不失效：会话 400 天，活跃时每天最多滚动续期一次并重发 Cookie；多设备互不影响；改密清理其它会话。
- 一致性：KV 命中即视为有效（缓存只在 D1 校验通过后写入）；登出/改密/手动清理都会删除对应 KV 键。
- 限流（KV 计数）：同 IP 登录 30 次/15 分钟；同用户名 10 次/15 分钟；注册同 IP 10 次/小时。登录失败时对不存在的用户也执行一次同等开销的 PBKDF2，避免时序探测账号。

## 6. 前端结构与“智能建议”

```text
src/app/
├── main.tsx / App.tsx        # 挂载、会话与数据编排、标签页路由
├── api.ts / types.ts         # API 封装、跨端类型
├── lib/format.ts             # 日期与里程格式化
├── lib/suggest.ts            # 建议引擎（纯函数，见下）
├── lib/importText.ts         # 历史文本解析器
├── lib/entry.ts              # 表单纯函数逻辑（节点链、分段、总里程自动/手动）
├── lib/tripList.ts           # 本地列表更新
├── components/               # TopBar / NavTabs / Toasts / PasswordDialog / NodeSuggestionInput
├── views/                    # AuthScreen / EntryView / RecordsView / StatsView / ImportView
└── styles.css                # 设计令牌 + 组件样式 + 响应式媒体查询
```

建议引擎（输入是登录后一次性拉取的行程数组，`buildIndex` 建索引）：

- 节点名：按使用次数 + 最近使用排序，前缀优先、其次包含；聚焦即展示，键盘 ↑↓/回车可用。
- 分段里程：同方向历史取“出现次数最多（同次数取最近）”；无同方向时退回反方向并标注“反向”。
- 整条路线：节点链完全一致时提示“历史路线：<日期> · <里程> · 沿用这条”，并自动补齐空白分段（已手填的不覆盖）。
- 总里程：默认按分段自动合计（徽标「自动合计」）；手改后转「手动填写」并提示与分段合计的差额；可一键切回自动。

### 响应式布局（移动优先）

| 断点 | 布局 |
| --- | --- |
| 默认（手机） | 单列；顶部工具栏 + **底部固定导航**（4 项，含安全区适配）；触摸目标 ≥ 42px |
| ≥ 900px | `layout` 转为「左侧竖排导航 + 内容区」；卡片密度提高；Toast 落到底部 |
| ≥ 1180px | 填报页左右双栏（表单 / 常用路线 + 当日记录）；导入页双栏；汇总页两列（年度汇总跨列） |

CSP 为 `script-src 'self'; style-src 'self'`（无 inline），因此样式只能走 CSS 类或 CSSOM（React 的 `style` 属性即 CSSOM 赋值，安全）；`public/_headers` 给静态资源兜底安全头，Worker 对 `/api/*` 再补一次。

## 7. 部署

| 资源 | 名称 | 标识 |
| --- | --- | --- |
| Worker | `triptrace` | https://triptrace.1731865922.workers.dev |
| D1 | `triptrace-db` | `52a9d143-2cb4-4888-b158-4dfb36adb6c4` |
| KV | `triptrace-sessions` | `aa2cda7e62da49c7bb8449ec6150d888` |
| 账号 | 1731865922@qq.com's Account | `ece132b98267492c057accef6a60fe05` |

```bash
bun install                 # 安装依赖（wrangler 另需全局安装：bun add -g wrangler）
bun run check               # wrangler types → 版本一致性 → 三个 tsconfig 类型检查
bun run dev                 # Vite + Workers 运行时（本地 D1/KV，http://127.0.0.1:5173）
bun run db:migrate:local    # 本地应用迁移（先于 dev 首次使用）
bun run build               # 构建 dist/client 与 dist/triptrace
bun run preview             # 用构建产物本地跑一遍（最接近线上）
bun run deploy              # 构建 + wrangler deploy（使用构建输出的 wrangler.json）
```

首次使用：访问线上地址 → 注册（开放注册；如需收敛，`wrangler secret put SIGNUP_CODE`）→ 在「导入」页粘贴历史文本、选择年份、解析预览、确认导入。

## 8. 已知限制与设计取舍

- 前端产物 257 kB（gzip ≈ 80 kB，含 React）；如需进一步压缩可按路由/视图做代码分割。
- 行程列表一次性拉全量（个人量级：数年数百条）；数据量到数千条以上时需要加范围查询与分页。
- 无密码找回：以管理员身份在 D1 侧重置（见 troubleshooting）。
- 无离线写入：断网只能读已加载页面，不能提交（无 Service Worker/本地队列）。
- 本地 `vite dev`/`vite preview` 偶发首个请求 500（dev server 内部 fetch 抖动），复测即恢复；线上连续 20 次请求实测 20/20 正常。
- `total_km` 与分段合计不一致是允许的（用户可能只知道总里程），前端提示差额但不阻拦保存。
