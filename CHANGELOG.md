# 变更记录

本项目遵循[语义化版本](https://semver.org/lang/zh-CN/)。项目版本以根 `package.json` 为唯一事实来源，
`apps/api/wrangler.jsonc` 的 `vars.APP_VERSION` 由 `bun run check` 门禁校验一致性；前端版本由 Vite 注入。

## 0.3.0

前后端分离：拆成 bun workspaces 三包，部署改为 Pages（前端）+ Workers（后端路由），同一域名两个路径。

- 工程结构：`apps/web`（React + Vite，构建到 `dist/`）、`apps/api`（Hono + Drizzle Worker，只提供 `/api/*`）、`packages/contracts`（只放类型的 API 契约，两端共用）。
- 部署拓扑：`https://trips.zerobiubiu.top/` 由 Cloudflare Pages 托管（项目 `triptrace-web`），`/api/*` 由 Worker 路由交给 `triptrace`；同源设计，Cookie 鉴权与 CSRF 策略不变，无需 CORS；旧 `*.workers.dev` 地址保留（`/api` 可用，其它路径 302 跳前端）。
- 本地开发：`bun run dev:api`（8787）+ `bun run dev:web`（5173，代理 `/api`）；跨源写操作白名单由 `apps/api/.dev.vars` 提供（不入库）。
- 脚本与门禁：根脚本用 `bun --filter` 在包内执行，避免全局工具抢占；`bun run check` 覆盖 api/web/node 三份 tsconfig 与版本一致性。
- 契约收敛：DTO 类型从 `packages/contracts` 引入（`import type`，零运行时耦合），API 路由与前端状态共用同一份定义。

## 0.2.0

技术栈重构：bun + Hono + Drizzle + React，前端移动优先响应式。**API 契约与数据模型不变，既有数据与账号不受影响。**

- 包管理改用 bun（`bun.lock`），wrangler 改为全局安装（`bun add -g wrangler`），不再作为项目依赖。
- 后端改用 Hono：路由、中间件（安全头 / D1 注入 / 会话校验与滚动续期）、统一错误响应；行为与 0.1.0 一致。
- 数据访问改用 Drizzle ORM：`src/db/schema.ts` 为 schema 唯一来源；迁移由 `drizzle-kit generate` 产出、Wrangler 应用（`migrations/meta/` 首个快照与 `0001_init.sql` 对齐）。
- 前端改用 React 19（Vite 8 + `@cloudflare/vite-plugin`）：视图拆分为组件与纯函数模块（建议引擎、文本解析器、表单计算）。
- 移动优先响应式：手机单列 + 底部固定导航；≥900px 左侧竖排导航；≥1180px 填报/导入双栏、汇总两列。
- 部署改为构建产物部署：`vite build` 产出前端与 Worker，`wrangler deploy` 使用构建输出的配置。

## 0.1.0

首个可用版本：

- 账号体系：用户名 + 密码注册/登录，PBKDF2-SHA256（10 万次迭代，workerd 上限）加盐存储。
- 持久登录：HttpOnly Cookie（400 天，滚动续期）+ 服务端会话（D1 为准，KV 缓存加速），长期使用不失效。
- 行程填报：日期可改（默认今天）、节点链（家 → 圣润 → 天九 …）、分段里程可选、总里程兜底。
- 智能建议：节点名自动补全、分段里程按历史同路段提示、整条历史路线一键沿用、最近路线快捷填入。
- 记录与统计：按月分组的行程列表（日合计、月合计）、年度/月度汇总、高频路段排行。
- 历史导入：粘贴文本记录（如“家，依剑，…，圣润 57 公里”）解析预览后批量入库。
- 数据导出：整库 JSON 导出，便于备份与迁移。
