# 变更记录：前后端分离与 Pages + Workers 双部署

- 状态：已执行（不可变变更文档）
- 生效版本：0.3.0
- 影响范围：工程结构（单包 → bun workspaces）、部署拓扑（单 Worker → Pages 前端 + Worker 后端路由）、本地开发流程
- 前置文档：[changes/0002-stack-refactor.md](0002-stack-refactor.md)、[architecture/0001-triptrace-architecture.md](../architecture/0001-triptrace-architecture.md)（已按本变更更新为现状）

## 1. 背景

v0.2 虽然代码上已经是「React 通过 `/api/*` 调后端」，但工程与部署仍是一个整体：`src/` 单包混放前后端、一个 Worker 同时托管静态资源与 API、一次部署同时上线两端。用户反馈「前后端耦合度太强」，要求：

1. 前后端分离，前端只通过 API 访问后端；
2. 前端产物放到 assets 目录，形成 Pages + Workers 的部署架构；
3. 保持**一个 app、一个域名、两个路径**（不要拆成两个站点）；
4. 不新建、不删除线上 Worker。

## 2. 方案

拓扑（同一域名两个路径）：

```text
https://trips.zerobiubiu.top/          → Cloudflare Pages（apps/web 的 dist/ 产物，含 _headers）
https://trips.zerobiubiu.top/api/*     → Worker 路由 → 现有 Worker `triptrace`（apps/api）
https://triptrace.<sub>.workers.dev    → 保留：/api/* 可用，非 API 路径 302 跳前端
```

- **同源**：API 与前端同主机名，Cookie（HttpOnly + SameSite=Lax + 400 天）与 CSRF 校验策略完全不变，不需要 CORS。
- **Worker 路由优先于 Pages 自定义域**（官方文档「Routes can fetch Custom Domains and take precedence if configured on the same hostname」），因此 `/api/*` 稳定命中 Worker，`/` 与静态资源由 Pages 提供。
- **工程结构**（bun workspaces）：`apps/api`（Hono + Drizzle + D1/KV）、`apps/web`（React + Vite，构建到 `dist/`）、`packages/contracts`（**只放类型的 API 契约**，两端 `import type`，打包时擦除，零运行时耦合）。
- **版本单一来源**仍是根 `package.json`：后端通过 `vars.APP_VERSION`（`scripts/check-version.mjs` 门禁校验），前端通过 Vite `define` 注入 `__APP_VERSION__`。
- **本地开发**：两个进程（`bun run dev:api` 8787 / `bun run dev:web` 5173），前端用 Vite 代理 `/api` → 8787 保持同源语义；跨源写操作的 Origin 白名单由 `apps/api/.dev.vars` 的 `ALLOWED_ORIGINS` 提供（仅本地）。

## 3. 实施（改动文件清单）

| 变更 | 文件 |
| --- | --- |
| 工程拆分 | 新增 `apps/api/**`（原 `src/worker`、`src/db`、`migrations`、`drizzle.config.ts`、`wrangler.jsonc`）、`apps/web/**`（原 `src/app`、`index.html`、`vite.config.ts`、`public/`）、`packages/contracts/**`；根 `package.json` 改为 workspaces + `bun --filter` 委派脚本 |
| 契约收敛 | `packages/contracts/src/index.ts`（TripDto / TripPayload / UserDto / MeResponse / AuthResponse / TripListResponse / TripResponse / BulkImportResponse / OkResponse / ApiErrorBody / ImportEntry / TabKey）；`apps/web/src/types.ts` 改为从契约包再导出；`apps/api` 的路由与序列化按契约类型标注 |
| API 调整 | 去掉静态资源（不再是前端宿主）；新增 `routes: [{ pattern: "trips.zerobiubiu.top/api/*", zone_name: "zerobiubiu.top" }]`；`workers_dev: true` 保留旧地址；`WEB_APP_URL` 用于非 API 路径 302 跳转；`assertSameOrigin(request, env)` 支持 `ALLOWED_ORIGINS` 白名单 |
| Web 调整 | 去掉 `@cloudflare/vite-plugin`（纯 SPA 构建）；`server.proxy` 代理 `/api`；`define` 注入版本；`index.html` 入口改为 `/src/main.tsx`；`_headers` 的 CSP 增加 Cloudflare Insights 白名单 |
| 配置/清理 | `apps/api/.dev.vars`（本地 Origin 白名单，不入库）；删除根 `tsconfig*.json`、`worker-configuration.d.ts`、`dist/`、`.wrangler/deploy/`（旧插件遗留） |
| 文档 | 本文件、`docs/architecture/0001-…`、`docs/troubleshooting/0002-…`、`docs/README.md`、`CHANGELOG.md`、`AGENTS.md` |

保留不变：D1 `triptrace-db`、KV `triptrace-sessions`、Worker 名 `triptrace`、数据库结构与线上数据、API 契约与鉴权行为。

## 4. 执行验证记录

### 4.1 执行环境

- Windows 10.0.26300（x64）；bun 1.4.2；全局 wrangler 4.148.0；vite 8.3.3；react 19.3.0；hono 4.13.13；drizzle-orm 0.45.3；typescript 7.0.2。
- 本地：`bun run dev:api`（8787）+ `bun run dev:web`（5173，代理 /api）；线上：https://trips.zerobiubiu.top（Pages 项目 `triptrace-web` + Worker `triptrace` 路由）。
- 后端版本：`74fe2e98-0c62-42bc-8969-9106d949cbcc`；Pages 部署：`1ed02d39`（首次生产部署 `bccc7474`）。

### 4.2 验证命令与实际输出

| 验证 | 命令/方式 | 结果 |
| --- | --- | --- |
| 类型检查 | `bun run check` | `wrangler types` 生成绑定类型 → `✓ 版本一致：0.3.0` → api/web/node 三份 tsconfig 全部无错误 |
| 本地冒烟（前后端分离） | 15 项断言（经 5173 代理 + 直连 8787） | PASS：经代理 `/api/me`（版本 0.3.0）、注册（Origin=5173 白名单放行）、Cookie 属性、登录态、建行程（分段合计 119）、批量导入 2 条、列表 3 条、非白名单 Origin 403、`sec-fetch-site: cross-site` 403、无 Cookie 401、直连 8787 读写、带路径跳转保留 path、清理 |
| 前端构建 | `bun run build:web` | `dist/index.html` 0.95 kB、`dist/assets/index-*.css` 12.21 kB、`dist/assets/index-*.js` 257.13 kB（gzip 79.79 kB）、`_headers` 随产物 ✓ |
| Pages 部署 | `wrangler pages deploy dist --project-name triptrace-web --branch main` | `✨ Uploaded 5 files`、`✨ Uploading _headers`、部署地址 `bccc7474.triptrace-web-367.pages.dev` |
| Worker 部署 | `bun run deploy:api` | 触发路由：`trips.zerobiubiu.top/api/* (zone name: zerobiubiu.top)` 与 `https://triptrace.1731865922.workers.dev` |
| 线上拓扑 | 19 项断言（`https://trips.zerobiubiu.top`） | PASS：首页由 Pages 提供且带 `_headers` 的 CSP、无内联脚本、SPA 回退、前端产物与本地构建**逐字节一致**（255041 字节）、同源 `/api/me` 命中 Worker（83ms）、注册（同源 Origin 校验自然通过）、Cookie 属性、建行程（分段合计 119）、批量导入与去重、列表、非白名单 Origin 403、无 Cookie 401、未知接口 404、旧 workers.dev 跳转前端（`302 → https://trips.zerobiubiu.top/records?x=1`）、旧地址 `/api` 可用、连续 15 次 `/api/me` 15/15 |
| 线上 UI（含响应式） | Chromium 实际操作（390×844 与 1280×900） | 登录成功（Pages → 同域 /api → Worker）、常用路线一键填入（`家 → 圣润 → 天九 → 圣润 → 天九 → 家`，自动合计 69）、保存写入 D1；移动端底部导航 `fixed`、页宽 390；记录视图 3 张卡片（含 9 月 28 日导入）；汇总 4 卡 / 12 柱（均有宽度）/ 年度 195 公里；桌面端侧栏 `sticky`、填报双列 539/415px；页脚显示 `v0.3.0`（构建期注入生效）；控制台错误 0（补 CSP 前曾有 1 条 Cloudflare Insights 被拦） |
| 会话持久性 | 浏览器复用 Cookie 访问自定义域 | 二次打开直接进入已登录状态 ✓（400 天滚动 Cookie 在新域名下正常） |
| 数据清理 | `wrangler d1 execute --remote` + `wrangler kv bulk delete --remote` | 删除测试账号（`rows_written: 6` = 1 用户 + 3 行程 + 2 会话）并清空其 2 个 KV 会话键；**用户账号 `zerobiubiu` 及其 2 条行程保留**，`users` 计数 = 1 |

### 4.3 验证结论

| 要求 | 结论 |
| --- | --- |
| 前后端分离 | ✅ 三个包：`apps/web`（React SPA，只通过 `/api/*` 访问后端）、`apps/api`（Hono Worker，只提供 API）、`packages/contracts`（纯类型契约，零运行时耦合） |
| 前端产物放 assets 目录 | ✅ `apps/web/dist`（含 `_headers`），由 `wrangler pages deploy` 上传到 Pages 项目 `triptrace-web` |
| Pages + Workers 架构 | ✅ 前端 Pages、后端 Worker，各自独立部署；同一域名下按路径分流 |
| 一个 app / 一个域名 / 两个路径 | ✅ `trips.zerobiubiu.top/`（Pages）与 `trips.zerobiubiu.top/api/*`（Worker 路由），同源，Cookie 鉴权不变 |
| 不新建、不删除 Worker | ✅ 仍是 `triptrace`（仅去掉静态资源、加路由与变量），`workers_dev` 保留旧地址可用 |
| 数据不受影响 | ✅ D1/KV 资源与结构未动，用户账号与行程保留 |

### 4.4 已知限制

- 前端产物仍是单包 257 kB（gzip ≈ 80 kB，含 React）；导入/汇总视图可考虑懒加载。
- `trips.zerobiubiu.top` 的证书/域名状态由 Pages 管理；本次通过 API 绑定自定义域时 DNS 记录未自动创建，需手动添加 CNAME（见 troubleshooting/0002）。
- 用户此前在旧地址（workers.dev）登录的 Cookie 与自定义域不共享，需要在新站点重新登录一次（数据与账号不受影响）。
- 本地 `vite dev` 与 `wrangler dev` 是两个进程；跨源写操作依赖 `.dev.vars` 里的 `ALLOWED_ORIGINS`，新机器克隆后要补这个文件（或改走同源代理）。

## 5. 后续验证建议

- 真机（iOS/Android）用自定义域走一遍：登录 → 填报 → 保存 → 记录/汇总，确认 Pages 与 Worker 路由在国内网络下的实际表现。
- 若后续要做预览环境：Pages 支持 preview 部署（`--branch <feature>`），Worker 可加 `preview_urls`；注意预览地址与生产数据共用 D1/KV。
- 如需给 API 单独加缓存/限流策略，路由模式 `trips.zerobiubiu.top/api/*` 可直接挂 Rate limiting 规则（zone 级别），不影响 Pages 部分。
