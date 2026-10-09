# 变更记录

本项目遵循[语义化版本](https://semver.org/lang/zh-CN/)。项目版本以根 `package.json` 为唯一事实来源，
`apps/api/wrangler.jsonc` 的 `vars.APP_VERSION` 由 `bun run check` 门禁校验一致性；前端版本由 Vite 注入。

## 0.5.0

填报规则收紧与界面清理：**每一段里程都必须填**（默认带出历史值，可改），总里程由分段合计得出；日期控件换成 `@mui/x-date-pickers`；四个分组收进标题栏；删除说明性废话文案。API 契约与数据模型不变。

- **分段里程必填**：任一段为空即不可保存（就地高亮 + 顶部提示还差几段）；总里程不再手填，恒为分段合计。历史数据里「只有总里程、没有分段」的旧记录仍可正常展示，编辑时才需要补齐分段。
- **默认带出历史值**：新增节点时，每段自动填入历史里程——同方向优先，没有同方向时按**反方向推断**（同一条路往返里程相同，界面不再区分方向），已手填的值不会被覆盖；「常用路线」一键填入改为整链覆盖并可按历史补齐分段。
- 去掉每段旁边的「历史 X 公里」点选按钮与计数、历史路线横幅，去掉「手动填写 / 按分段合计」开关与差额告警。
- **日期控件**：改用 `@mui/x-date-pickers`（dayjs 适配器 + 中文文案），保留「前一天 / 后一天 / 今天」快捷按钮。
- **导航**：填报 / 记录 / 汇总 / 导入四个分组并入标题栏（移动端也在顶部），删除 ≥900px 的左侧竖排导航与移动端底部导航；底部固定保存条下移到屏幕底部，内容与提示的避让同步调整。
- **文案清理**：删除页脚的「数据存于你的 Cloudflare 账号（Workers + D1 + KV）」、登录页的产品说明句、节点输入的键盘提示、统计页空态里的操作指引等说明性文字，只保留可操作信息。

### 同版本内的第二批：用户管理（管理员后台 + 个人账号自助）

- **管理员后台**（新增「管理」入口，仅管理员可见；管理员由 `ADMIN_USERNAMES` 环境变量按用户名指定）：用户列表（用户名、显示名、行程数、合计里程、最近活跃、状态）、重置密码、启用/禁用、删除用户（级联清理其行程、会话与 KV 会话键）。禁止操作自己，全部 `/api/admin/*` 需管理员身份（403）。
- **个人账号自助**（账号菜单「账号」）：改显示名、查看登录设备（会话）列表并逐个登出、修改密码入口、退出登录。
- **禁用即失效**：被禁用用户的既有会话立即失效（含 KV 缓存），登录被拒（403 `disabled`）；重置密码/删除/禁用都会即时清理该用户的会话缓存。
- 数据库新增 `users.disabled_at`（迁移 `20261009014732_charming_madripoor.sql`）；`/api/me` 增加 `isAdmin`。
- 契约新增：`AdminUserRow`/`AdminUserListResponse`/`AdminUserPatch`/`AdminSetPasswordPayload`/`SessionRow`/`SessionListResponse`/`ProfilePatch`，`TabKey` 扩展 `account`/`admin`。

## 0.4.0

部署拓扑回到**单 Worker**：0.3.0 的「Pages 前端 + Worker 路由」合并为一个部署物——静态资源由 Worker 的 `assets` 绑定托管，`/api`、`/api/*` 交给 Hono，一次 `wrangler deploy` 完成前后端发布。API 契约与数据模型不变。

- `apps/api/wrangler.jsonc`：增加 `assets`（`directory: ../web/dist`、SPA 回退、`run_worker_first: ["/api","/api/*"]`）与自定义域 `trips.zerobiubiu.top`；移除只服务于旧地址 302 的 `WEB_APP_URL` 变量与对应代码。
- 脚本收敛：根 `bun run deploy` = 构建前端 + 部署 Worker；删除 `deploy:web`（Pages 上传）与 `apps/web` 的 `deploy` 脚本；Pages 项目 `triptrace-web` 解除自定义域后删除（历史部署一并清除），本站不再使用 Pages。
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
