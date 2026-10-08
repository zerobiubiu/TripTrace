# TripTrace 项目规则

本文件只写 agent 的执行规则；说明、记录、分析一律进 `docs/`（入口：[docs/README.md](docs/README.md)）。

## 工程结构

bun workspaces 三包，前后端分离、各自独立部署：

| 包 | 说明 |
| --- | --- |
| `apps/api` | Hono + Drizzle 的 Cloudflare Worker，**只提供 `/api/*`**；D1/KV 绑定、迁移、drizzle 配置都在这里 |
| `apps/web` | React 19 + Vite 的纯静态 SPA，构建到 `apps/web/dist/`，由 Cloudflare Pages 托管 |
| `packages/contracts` | 前后端共享的 **API 契约类型**（只放类型，`import type` 引入，不引入运行时代码） |

部署拓扑：`https://trips.zerobiubiu.top/` → Pages（项目 `triptrace-web`）；`https://trips.zerobiubiu.top/api/*` → Worker 路由（Worker 名 `triptrace`）。旧 `https://triptrace.1731865922.workers.dev` 保留：`/api` 可用，其它路径 302 跳前端。

## Cloudflare 与部署

- Cloudflare 操作一律用 **bun 全局安装的 wrangler**（`bun add -g wrangler`，当前 4.148.0）；wrangler 不列入任何包的依赖。若脚本报「找不到 node_modules 里的 wrangler/vite」，是旧 shim 残留，按 [docs/troubleshooting/0002](docs/troubleshooting/0002-workspace-tooling-gotchas.md) 清理。
- 资源固定：Worker `triptrace`、Pages `triptrace-web`、D1 `triptrace-db`（`52a9d143-2cb4-4888-b158-4dfb36adb6c4`）、KV `triptrace-sessions`（`aa2cda7e62da49c7bb8449ec6150d888`）、域名 `trips.zerobiubiu.top`（zone `zerobiubiu.top`）。改绑定必须同步 `apps/api/wrangler.jsonc` 并重新生成类型。
- 部署链路：`bun run check` → `bun run deploy:api`（后端）/ `bun run deploy:web`（前端，先构建再上传 Pages）。线上变更后必须做一次线上冒烟（首页、`/api/me`、登录、行程读写、旧地址跳转）。
- 密钥（如 `SIGNUP_CODE`）用 `wrangler secret put`；本地变量放 `apps/api/.dev.vars`（不入库）。

## 数据库与迁移

- schema 唯一来源是 `apps/api/src/db/schema.ts`（Drizzle）。改表：`bun run db:generate` 生成时间戳前缀 SQL 到 `apps/api/migrations/`，再由 `bun run db:migrate:local` / `db:migrate:remote`（wrangler）应用；**不要**使用 `drizzle-kit migrate`。
- `apps/api/migrations/meta/` 是 drizzle 快照与日志，必须入库；`0001_init.sql` 是已应用的基线，不要改动。
- 查询统一写在 `apps/api/src/lib/store.ts`；批量写入注意 D1 单语句 100 个绑定参数上限（`insertTrips` 已按 8 行分批）。

## 验证

- 静态检查：`bun run check`（生成绑定类型 → 版本一致性 → api/web/node 三份 tsconfig）。
- 本地：`bun run dev:api`（8787，首次先 `bun run db:migrate:local`）+ `bun run dev:web`（5173，代理 `/api`）；跨源写操作需要 `apps/api/.dev.vars` 里的 `ALLOWED_ORIGINS`。
- 改了前端或接口，必须用浏览器真实走一遍受影响流程；移动端（窄视口）与桌面端（宽视口）各看一次。
- 前端受 CSP 约束（`default-src 'none'; script-src 'self'` 等，见 `apps/web/public/_headers`），不要引入内联脚本/样式；React 的 `style` 属性是 CSSOM 赋值，可用。

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
