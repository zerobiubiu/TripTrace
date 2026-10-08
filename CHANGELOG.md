# 变更记录

本项目遵循[语义化版本](https://semver.org/lang/zh-CN/)。项目版本以根 `package.json` 为唯一事实来源，
`apps/api/wrangler.jsonc` 的 `vars.APP_VERSION` 由 `bun run check` 门禁校验一致性；前端版本由 Vite 注入。

## 0.4.0

部署拓扑回到**单 Worker**：0.3.0 的「Pages 前端 + Worker 路由」合并为一个部署物——静态资源由 Worker 的 `assets` 绑定托管，`/api`、`/api/*` 交给 Hono，一次 `wrangler deploy` 完成前后端发布。API 契约与数据模型不变。

- `apps/api/wrangler.jsonc`：增加 `assets`（`directory: ../web/dist`、SPA 回退、`run_worker_first: ["/api","/api/*"]`）与自定义域 `trips.zerobiubiu.top`；移除只服务于旧地址 302 的 `WEB_APP_URL` 变量与对应代码。
- 脚本收敛：根 `bun run deploy` = 构建前端 + 部署 Worker；删除 `deploy:web`（Pages 上传）与 `apps/web` 的 `deploy` 脚本；Pages 项目 `triptrace-web` 停用（自定义域已解除，不再更新）。
- 旧 `*.workers.dev` 地址改由前端启动时按主机名跳转到正式域名（`main.tsx`），避免同一应用出现两套 Cookie 与两个登录源。
- 本地形态与生产一致：`bun run build:web && bun run dev:api` 即单进程（静态资源 + API）；`bun run dev:web`（Vite HMR + proxy）保留给前端迭代。
- 自定义域由 Worker 直接承载（`custom_domain: true`），同源关系不变，Cookie 鉴权与 CSRF 策略不变。

## 0.3.0

前后端分离：拆成 bun workspaces 三包，部署改为 Pages（前端）+ Workers（后端路由），同一域名两个路径。

- 工程结构：`apps/web`（React + Vite，构建到 `dist/`）、`apps/api`（Hono + Drizzle Worker，只提供 `/api/*`）、`packages/contracts`（只放类型的 API 契约，两端共用）。
- 部署拓扑：`https://trips.zerobiubiu.top/` 由 Cloudflare Pages 托管（项目 `triptrace-web`），`/api/*` 由 Worker 路由交给 `triptrace`；同源设计，Cookie 鉴权与 CSRF 策略不变，无需 CORS；旧 `*.workers.dev` 地址保留（`/api` 可用，其它路径 302 跳前端）。
- 本地开发：`bun run dev:api`（8787）+ `bun run dev:web`（5173，代理 `/api`）；跨源写操作白名单由 `apps/api/.dev.vars` 提供（不入库）。
- 脚本与门禁：根脚本用 `bun --filter` 在包内执行，避免全局工具抢占；`bun run check` 覆盖 api/web/node 三份 tsconfig 与版本一致性。
- 契约收敛：DTO 类型从 `packages/contracts` 引入（`import type`，零运行时耦合），API 路由与前端状态共用同一份定义。

### 同版本内的第二批：前端迁移到 MUI v9

- 前端迁移到 **MUI v9（Material Design 3）+ emotion**：删除手写 CSS（21.4 KB / 1120 行），设计令牌集中到 `apps/web/src/theme.ts`（明暗自适应、字号下限 14px、触摸目标 44px）；记录 / 汇总 / 导入视图按需懒加载。
- 可靠性修复：启动阶段接口失败改为可重试错误屏（**不再伪装成登出**）；草稿本地持久化，登录与刷新两条路径都恢复；常用路线填入与清空节点链支持撤销。
- 可访问性修复：移动端核心路径触摸目标 ≥44px、节点删除键补 `role`/`aria-label`/键盘可达、深色模式主色芯片对比度 3.93:1 → 9.19:1。
- 批量导入去重口径改为 `日期+节点链`（此前含总里程，同一条链的不同里程会重复入库）。
- CSP 调整：`style-src` 放行 `'unsafe-inline'`（emotion 运行时注入的必要代价，`script-src` 仍不允许内联）；`_headers` 移除注释行（该格式不支持注释，否则整份规则失效）。

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
