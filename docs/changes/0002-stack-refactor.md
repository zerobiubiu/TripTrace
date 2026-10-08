# 变更记录：技术栈重构（bun + Hono + Drizzle + React，移动优先响应式）

- 状态：已执行（不可变变更文档）
- 生效版本：0.2.0
- 影响范围：全栈重构（包管理 / 后端框架 / 数据访问 / 前端框架与布局），API 契约与数据模型不变
- 前置文档：[architecture/0001-triptrace-architecture.md](../architecture/0001-triptrace-architecture.md)（已按本变更更新为现状）、[changes/0001-triptrace-mvp.md](0001-triptrace-mvp.md)（v0.1 记录）

## 1. 背景

v0.1 已验证可用（Workers + D1 + KV，原生 ES 模块前端、手写路由与 SQL）。用户提出四项调整，目的是让工程形态更主流、更易维护，并明确「移动端为主、桌面端可用」：

1. 包管理改用 bun；
2. 后端改用 Hono；
3. ORM 改用 Drizzle；
4. 前端改用 React，并按移动优先做响应式布局；
5. wrangler 改为 bun 全局安装（不作为项目依赖）。

## 2. 方案

- **工具链**：bun 管依赖（`bun.lock`）；Vite 8 + `@vitejs/plugin-react` + `@cloudflare/vite-plugin` 负责开发（Workers 运行时跑 Worker、直连本地 D1/KV）与构建（前端 + Worker 产物）；全局 wrangler 负责迁移、部署、`wrangler types`、secret。
- **后端**：Hono 路由与中间件（安全头、D1/Drizzle 注入、会话校验、滚动续期）；`HttpError` + `onError` 统一错误响应；写操作保留同源/CSRF 校验。API 路径、请求体、响应体与 v0.1 **完全一致**，前端与既有数据不受影响。
- **数据访问**：Drizzle 定义三张表（`src/db/schema.ts` 为唯一来源），查询集中在 `src/worker/lib/store.ts`；批量写入按 D1 绑定参数上限分批（每批 8 行）。迁移由 drizzle-kit 生成时间戳前缀 SQL、Wrangler 应用；`migrations/meta` 首个快照对齐已应用的 `0001_init.sql`，因此当前 `db:generate` 无变更。
- **前端**：React 19 重写视图，样式沿用 v0.1 的设计令牌并新增响应式结构；建议引擎、文本解析器、表单计算逻辑迁为独立纯函数模块（`lib/suggest.ts`、`lib/importText.ts`、`lib/entry.ts`），便于复用与测试。
- **响应式**：默认手机单列 + 底部固定导航；≥900px 变左侧竖排导航；≥1180px 填报/导入双栏、汇总两列。

## 3. 实施（改动文件清单）

| 变更 | 文件 |
| --- | --- |
| 包管理与脚本 | `package.json`（bun、`vite`/`wrangler` 调用方式、`typecheck`/`check`/`build`/`preview`/`deploy`/`db:*`）、`bun.lock`（新增）、删除 `package-lock.json` |
| 构建与类型 | `vite.config.ts`（新增）、`tsconfig.json`（改为 references）、`tsconfig.app.json` / `tsconfig.node.json` / `tsconfig.worker.json`（新增）、`index.html`（Vite 入口，新增） |
| Drizzle | `drizzle.config.ts`（新增）、`src/db/schema.ts`（新增）、`migrations/meta/_journal.json` + `…_snapshot.json`（新增，与 0001 等价基线） |
| 后端（Hono） | `src/worker/index.ts`（新增，替代旧 `src/index.ts`）、`src/worker/lib/{context,http,crypto,auth,store,trips,db}.ts`、`src/worker/routes/{auth,trips}.ts`、`src/worker/env.d.ts`；删除旧 `src/lib/*`、`src/routes/*`、`src/env.d.ts` |
| 前端（React） | `src/app/{main.tsx,App.tsx,api.ts,types.ts,styles.css}`、`src/app/lib/{format,suggest,importText,entry,tripList,sampleText}.ts`、`src/app/components/{TopBar,NavTabs,Toasts,PasswordDialog,NodeSuggestionInput}.tsx`、`src/app/views/{AuthScreen,EntryView,RecordsView,StatsView,ImportView}.tsx`；删除 `public/{index.html,styles.css,js/*}` |
| 配置 | `wrangler.jsonc`（`main` 指向 `src/worker/index.ts`、assets 只保留路由配置、`APP_VERSION` 0.2.0） |
| 文档 | `docs/architecture/0001-…`（改写为现状）、`docs/changes/0002-…`（本文件）、`docs/README.md`、`CHANGELOG.md`、`AGENTS.md` |

保留不变：`migrations/0001_init.sql`、`public/{icon.svg,manifest.webmanifest,_headers}`、`scripts/check-version.mjs`、`docs/troubleshooting/0001-…`、D1/KV 资源与线上数据。

## 4. 执行验证记录

### 4.1 执行环境

- Windows 10.0.26300（x64）；bun 1.4.2；全局 wrangler 4.148.0（`bun add -g wrangler`）；Node v24.21.0（仅用于个别脚本）。
- 依赖版本：vite 8.3.3、@cloudflare/vite-plugin 1.63.0、react 19.3.0、hono 4.13.13、drizzle-orm 0.45.3、drizzle-kit 0.31.11、typescript 7.0.2。
- 本地：`bun run dev`（5173，Workers 运行时）与 `bun run preview`（4173，构建产物）；线上：https://triptrace.1731865922.workers.dev（版本 `e8bbc723-f399-40ca-8397-13f664cadaf6`）。

### 4.2 验证命令与实际输出

| 验证 | 命令 | 结果 |
| --- | --- | --- |
| 类型检查（三份 tsconfig） | `bun x tsc -p tsconfig.{worker,app,node}.json --noEmit` | 全部无错误；`bun run check` 输出 `✓ 版本一致：0.2.0` |
| Drizzle 基线 | `bun run db:generate` | 首次生成与 `0001_init.sql` 等价的 SQL（含 `trips_user_date_idx … date desc, created_at desc`），确认等价后删除该文件、保留 `meta/` 快照；二次执行为 `No schema changes, nothing to migrate 😴` |
| 本地迁移 | `bun run db:migrate:local` | `0001_init.sql ✅`、`6 commands executed successfully`；`wrangler d1 migrations list --local` → `No migrations to apply!`（`meta/` 被正确忽略） |
| 本地 API 冒烟 | 20 项断言（Hono + Drizzle + 本地 D1/KV） | 全 PASS：注册、登录态、建行程（分段自动合计 119）、列表、修改返回 DTO、批量导入 3 条（含未填里程）、重复导入去重、非法日期 400、空节点 400、超限里程 400、跨站 403、无 Cookie 401、未知接口 404、方法不匹配 404、错误密码 401、大小写不敏感登录、改密 403/200、登出 |
| 构建 | `bun run build`（含 check） | `dist/client`：index.html 0.95 kB、JS 257.13 kB（gzip 79.77 kB）、CSS 12.21 kB；`dist/triptrace`：index.js 231.60 kB（gzip 55.74 kB）+ 输出 `wrangler.json`（assets 指向 `../client`、`run_worker_first: ["/api/*"]`） |
| 预览环境冒烟 | `bun run preview` + 11 项断言 | API 全 PASS（注册/新建/列表/跨站 403/404）；`_headers` 生效（首页带 CSP）、首页无内联脚本、SPA 回退 200、`/_headers` 不对外暴露；首次 `GET /` 出现一次 500，复测 6/6 正常（本地 dev server 抖动，线上未复现） |
| 浏览器验证（本地） | Chromium 实际操作 | 移动端（390×844）：底部导航 `position: fixed`、单列、页面宽 390；一键常用路线填入 `家 → 圣润 → 家`、分段自动带出 25/25、总里程自动合计 50（徽标「自动合计」）、历史路线提示「已走 2 次」；保存出现 toast 且表单清空；记录/汇总/导入三视图正常（统计卡 4、柱 12 全部有宽度、导入解析 15 条并给出“只有日期”“沿用模板”提示）；桌面端（1280×900）：导航 `position: sticky` 竖排、`entry-grid` 为双列（539px/415px）、表单 4 卡 + 侧栏 2 卡；控制台错误 0 |
| 线上部署 | `bun run deploy` | `✨ Uploaded 3 files`、`Deployed triptrace`、Version ID `e8bbc723-…`；Total Upload 226.18 KiB（gzip 54.24 KiB） |
| 线上冒烟 | 19 项断言 | 全 PASS：`/api/me` 版本 0.2.0、注册（PBKDF2 10 万次未超 CPU）、Cookie 属性（HttpOnly/Secure/SameSite/Max-Age=34560000）、新建行程（分段合计 119）、批量导入 2 条与重复去重、修改、列表 3 条、跨站 403、无 Cookie 401、未知接口 404、两设备会话并存、A 登出不影响 B、B 登出后失效（KV 同步清理）、连续 20 次 `/api/me` 20/20、首页 200、首页 CSP、首页无内联脚本、SPA 回退 200 |
| 线上静态资源一致性 | 构建产物 vs 线上（sha256 比对） | `assets/index-BUNcuMan.js`（255045 字节）与 `assets/index-Bv7Zt6Bb.css`（12217 字节）逐字节一致，`icon.svg` 一致 |
| 线上 UI 验证 | Chromium 实际操作（390×844） | 登录、一键常用路线（总里程自动 50）、保存成功写入 D1、记录视图按月分组（日合计 100 公里、分段明细、导入标记）；控制台错误 0 |
| 数据清理 | `wrangler d1 execute --remote`、`wrangler kv bulk delete --remote` | 删除测试账号（`rows_written: 7` = 1 用户 + 3 行程 + 3 会话）并清空其 KV 键；**用户本人账号 `zerobiubiu`（2 条 10-08 行程）与在线会话完整保留**，`users` 计数 = 1 |

### 4.3 验证结论

需求逐条对照：

| 需求 | 结论 |
| --- | --- |
| 包管理改 bun | ✅ `bun install` / `bun run *`；`bun.lock` 入库，`package-lock.json` 已删除 |
| 后端改 Hono | ✅ 路由/中间件/错误处理均为 Hono；API 契约与 v0.1 完全一致（回归冒烟全绿） |
| ORM 改 Drizzle | ✅ 表定义与查询全部走 Drizzle；迁移由 drizzle-kit 生成、Wrangler 应用；基线快照与既有迁移对齐 |
| 前端改 React | ✅ React 19 重写全部视图；纯函数逻辑独立成模块 |
| 移动端为主 + 响应式 | ✅ 移动：底部导航/单列/大触摸目标；桌面：侧栏导航 + 填报双栏（≥1180px）；两档断点实测通过 |
| wrangler 全局安装 | ✅ 未列入 devDependencies，用 `bun add -g wrangler` 安装（4.148.0）；迁移/部署/types 均由全局命令执行 |
| 既有数据与账号不受影响 | ✅ 线上账号 `zerobiubiu` 及其 2 条行程、在线会话保留；D1 结构未变（无新迁移） |

### 4.4 已知限制

- 本地 `vite dev`/`vite preview` 偶发首请求 500（dev server 内部 fetch 抖动），复测即恢复；线上连续 20 次实测 20/20 正常。
- 前端产物 257 kB（gzip ≈ 80 kB，含 React），后续可按视图做代码分割。
- 方法不匹配（如 `GET /api/auth/login`）返回 404 JSON（Hono `notFound` 行为），不再是 v0.1 的 405。

## 5. 后续验证建议

- 手机浏览器（iOS/Android 真机）实际用几天，重点看：底部导航避开安全区、日期选择器行为、输入法唤起时的布局、桌面浏览器窗口缩放时断点切换。
- 真机导入历史文本后抽查 `单次25km` 模板展开的日期与方向。
- 若前端体积成为关注点：用 `vite build --report` 或 `rollup-plugin-visualizer` 分析，再决定是否对「导入/汇总」视图做懒加载。
