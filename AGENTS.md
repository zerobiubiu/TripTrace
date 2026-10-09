# TripTrace 项目规则

本文件只写 agent 的执行规则；说明、记录、分析一律进 `docs/`（入口：[docs/README.md](docs/README.md)）。

## 工程结构

bun workspaces 三包，前后端分离、各自独立部署：

| 包 | 说明 |
| --- | --- |
| `apps/api` | Hono + Drizzle 的 Cloudflare Worker，**只提供 `/api/*`**；D1/KV 绑定、迁移、drizzle 配置都在这里 |
| `apps/web` | React 19 + Vite 的纯静态 SPA，构建到 `apps/web/dist/`，由 Worker 的 `assets` 绑定托管（不单独部署） |
| `packages/contracts` | 前后端共享的 **API 契约类型**（只放类型，`import type` 引入，不引入运行时代码） |

部署拓扑：**单 Worker**。`https://trips.zerobiubiu.top/` 是 Worker `triptrace` 的静态资源（`apps/api/wrangler.jsonc` 的 `assets.directory = ../web/dist`），`https://trips.zerobiubiu.top/api/*` 是同一个 Worker 的 Hono 路由（`run_worker_first`）；旧 `https://triptrace.1731865922.workers.dev` 也指向该 Worker，前端启动时会跳到正式域名。Pages 项目 `triptrace-web` 已删除（0.4.0）。

## 前端 UI

- UI 一律用 MUI v9 组件与 `sx`；不新增手写 CSS 文件，`apps/web/src/app.css` 只放全局基线（`html/body`、安全区变量）。视觉规范以 [apps/web/DESIGN.md](apps/web/DESIGN.md) 为准（令牌、14px 地板、焦点环、深度立场）；改主题时同步该文件与 `apps/web/.impeccable/design.json`。
- 颜色、圆角、间距一律走 `apps/web/src/theme.ts` 的令牌；组件里不写死颜色；字号下限 14px（MUI 默认的小字号已在主题里统一抬升：InputLabel / FormHelperText / Chip / caption / 日期弹层；新组件若带更小的默认值，改主题，不要在视图里逐处打补丁）。
- 图标用 `@mui/icons-material`，不用 emoji 或 unicode 字符当图标；移动端核心路径触摸目标 ≥44px；可交互元素必须带 `role` / `aria-label` 且可键盘聚焦。
- 分组导航内联在标题栏（移动端与桌面端同形态）；不要另起侧栏或底部导航。日期/时间选择统一用 `@mui/x-date-pickers`（dayjs 适配器 + 中文 `localeText`），不要用原生 `input[type=date]`。
- 界面文案只写可操作信息：不写实现细节（存储、框架、部署），不写用户已知的解释性句子。
- **筛选与聚合只走 `apps/web/src/lib/query.ts`**：汇总页（集中查询）与记录页（明细查询）必须共用同一套时间范围、筛选与聚合函数——同一范围下两页的条数与合计里程要对得上。加查询能力改这个模块，不要在视图里另写一份；时间范围控件同理复用 `components/RangeControl.tsx`。
- **路线节点认 id，不认下标**：表单里节点是 `{ id, name }`（`lib/entry.ts`），增删/改名/拖动一律按 id 定位——拖动重排后下标会整体错位。**顺序是路线的唯一依据**：任何结构变化后按新顺序重建分段（`legsForNodes`），里程只跟着「端点对」走（不分方向），新出现的相邻对留空再由历史补齐。拖动排序的激活器只能是手柄（`components/NodeEditor.tsx`），输入框内编辑不得触发拖动。
- 交互不得无声吞掉用户输入：失败写操作要保留草稿（`apps/web/src/lib/draft.ts`）；批量或破坏性操作要可撤销。
- 启动阶段接口失败一律给**可重试的错误屏**，绝不降级成登录页（否则用户会误判为被登出）。

## Cloudflare 与部署

- Cloudflare 操作一律用 **bun 全局安装的 wrangler**（`bun add -g wrangler`，当前 4.148.0）；wrangler 不列入任何包的依赖。若脚本报「找不到 node_modules 里的 wrangler/vite」，是旧 shim 残留，按 [docs/troubleshooting/0002](docs/troubleshooting/0002-workspace-tooling-gotchas.md) 清理。
- 资源固定：Worker `triptrace`（含静态资源与自定义域 `trips.zerobiubiu.top`）、D1 `triptrace-db`（`52a9d143-2cb4-4888-b158-4dfb36adb6c4`）、KV `triptrace-sessions`（`aa2cda7e62da49c7bb8449ec6150d888`）、域名 `trips.zerobiubiu.top`（zone `zerobiubiu.top`）。改绑定必须同步 `apps/api/wrangler.jsonc` 并重新生成类型。Pages 项目 `triptrace-web` 已删除（0.4.0），本站不再使用 Pages。
- 部署链路：`bun run check` → `bun run deploy`（先构建前端，再由 `wrangler deploy` 发布 Worker 与静态资源，**一条命令发布全部**）。线上变更后必须做一次线上冒烟（首页静态资源与 CSP 头、`/api/me`、登录、行程读写、旧地址跳转）。
- 密钥（如 `SIGNUP_CODE`）用 `wrangler secret put`；本地变量放 `apps/api/.dev.vars`（不入库）。

## 数据库与迁移

- schema 唯一来源是 `apps/api/src/db/schema.ts`（Drizzle）。改表：`bun run db:generate` 生成时间戳前缀 SQL 到 `apps/api/migrations/`，再由 `bun run db:migrate:local` / `db:migrate:remote`（wrangler）应用；**不要**使用 `drizzle-kit migrate`。
- `apps/api/migrations/meta/` 是 drizzle 快照与日志，必须入库；`0001_init.sql` 是已应用的基线，不要改动。
- 查询统一写在 `apps/api/src/lib/store.ts`；批量写入注意 D1 单语句 100 个绑定参数上限（`insertTrips` 已按 8 行分批）。

## 验证

- 静态检查：`bun run check`（生成绑定类型 → 版本一致性 → api/web/node 三份 tsconfig）。
- 本地：`bun run build:web && bun run dev:api`（8787，与生产同形态：静态资源 + `/api`；首次先 `bun run db:migrate:local`）；前端迭代可用 `bun run dev:web`（5173，代理 `/api`），跨源兜底靠 `apps/api/.dev.vars` 的 `ALLOWED_ORIGINS`。
- 改了前端或接口，必须用浏览器真实走一遍受影响流程；移动端（窄视口）与桌面端（宽视口）各看一次。
- 前端受 CSP 约束（见 `apps/web/public/_headers`）：`script-src 'self'`（无内联脚本）、`style-src 'self' 'unsafe-inline'`（MUI/emotion 运行时注入样式的必要代价）。**`_headers` 文件不支持注释行**，加注释会让整份规则解析失败。

## Git

- 一次逻辑变更一个提交；提交信息用简体中文写清「做了什么、为什么」。
- 未经明确要求不提交、不推送、不切分支、不打标签；对外操作先问。
- 提交前确保 `bun run check` 通过；不提交密钥/凭据、构建产物、`.wrangler/`、`node_modules/`、`worker-configuration.d.ts`。

## 项目版本

- 唯一事实来源：根 `package.json` 的 `version`；`apps/api/wrangler.jsonc` 的 `vars.APP_VERSION` 必须同步，由 `bun run check` 门禁校验；前端版本由 Vite `define` 注入（页脚展示）。
- 只在**被发布程序的行为**变更时递增：破坏性 → major，兼容新功能 → minor，兼容修复 → patch；纯文档/注释/配置改动不递增。
- 递增时同步更新 `CHANGELOG.md`。

## 文档

- 源码变更随行写文档：在 `docs/changes/` 记一份（背景 / 方案 / 实施清单 / 执行验证记录），并回 `docs/README.md` 补索引。
- 架构现状写 `docs/architecture/`，长期可复现的问题写 `docs/troubleshooting/`；变更文档定稿后不重写，后续变化另建并标注替代关系。
