# 0005 部署拓扑合并：单 Worker（静态资源 + API）

- 状态：已执行
- 影响范围：部署拓扑、`apps/api/wrangler.jsonc`、根/前端脚本、旧地址跳转
- 前置文档：[0003-pages-workers-split.md](0003-pages-workers-split.md)（本次变更合并其拓扑；0003 的其余内容仍然有效）
- 生效版本：0.4.0

## 背景

0.3.0 把前后端拆成两个部署物：Pages 托管前端、Worker 只挂 `trips.zerobiubiu.top/api/*` 路由。实际使用更希望回到 Cloudflare 模板形态——**一个 Worker 同时提供静态前端与后端 API**：一次部署、一个自定义域、一套配置。拆分带来的工具链解耦有限，代价却是两个部署目标与两套发布步骤。

## 方案

- Worker `triptrace` 增加 `assets` 绑定：`directory: ../web/dist`、`not_found_handling: single-page-application`、`run_worker_first: ["/api", "/api/*"]`；自定义域改为 `trips.zerobiubiu.top`（`custom_domain: true`），不再使用 `zone_name` 路由。
- 发布收敛为一条命令：`bun run deploy` = `build:web` + `wrangler deploy`；删除 `deploy:web`（Pages 上传）与 `apps/web` 的 `deploy` 脚本；解除自定义域后**删除** Pages 项目 `triptrace-web`（历史部署一并清除）。
- 旧地址（`*.workers.dev`）：资产优先模式下 Worker 不再处理非 `/api` 路径，因此移除服务端 302 分支，改为前端启动时按主机名跳转（`main.tsx`，`__CANONICAL_URL__` 由 Vite `define` 注入），避免旧地址形成第二套 Cookie。
- 变量清理：`WEB_APP_URL` 失去用途，从代码、`wrangler.jsonc`、`env.d.ts` 一并删除。

## 实施（改动文件清单）

| 文件 | 变更 |
| --- | --- |
| `apps/api/wrangler.jsonc` | 新增 `assets` 绑定；路由改为 `custom_domain: true`；删除 `WEB_APP_URL`；`APP_VERSION` → 0.4.0 |
| `apps/api/src/index.ts` | 删除旧地址 302 分支；`notFound` 只返回接口 404；更新头注释说明单部署物 |
| `apps/api/src/env.d.ts` | 删除 `WEB_APP_URL` 声明 |
| `apps/web/src/main.tsx` | 启动时按主机名跳到正式域名（`location.replace`），常量异常不阻塞渲染 |
| `apps/web/vite.config.ts` | 注入 `__CANONICAL_URL__`；注释改为单 Worker 形态 |
| `apps/web/src/vite-env.d.ts` | 声明 `__CANONICAL_URL__` |
| `package.json` | 版本 0.4.0；新增 `deploy`（build:web + 部署 Worker）；删除 `deploy:web` |
| `apps/web/package.json` | 删除 Pages `deploy` 脚本 |
| `docs/architecture/0001`、`AGENTS.md`、`CHANGELOG.md` | 拓扑、部署链路、版本记录同步 |

## 执行验证记录

### 执行环境

Windows 10（win32 10.0.26300）/ bun 1.4.2 / wrangler 4.148.0；本地 `wrangler dev --port 8788`（`env.ASSETS` 已挂载）；生产账号 `ece132b98267492c057accef6a60fe05`（zone `zerobiubiu.top`）。

### 验证命令与实际输出

| 验证 | 命令 / 手段 | 实际输出 |
| --- | --- | --- |
| 类型与版本门禁 | `bun run check` | 三份 tsconfig 与版本一致性通过；`✓ 版本一致：0.4.0` |
| 本地单进程路由 | `curl`（8788） | `/` → 200 HTML + CSP；`/assets/index-uo-9miqY.js` → `public, max-age=31536000, immutable`；`/records` → 200 HTML（SPA 回退）；`/api/me` → `0.4.0`；`/api/nope` → 404 JSON；`/api` → 404 |
| 本地单进程 UI | 浏览器（8788，390×844） | MUI 105 个类 + 6 个 emotion `<style>`、登录成功、记录页渲染 119 公里条目、控制台 0 错误 |
| 解除 Pages 自定义域 | Cloudflare API | `DELETE …/pages/projects/triptrace-web/domains/trips.zerobiubiu.top` → success；对应 Pages CNAME DNS 记录已删除；该主机名剩余记录 0、Pages 剩余自定义域 0 |
| 删除 Pages 项目 | Cloudflare API | 项目列表 `[triptrace-web, zerobiubiu-github-io]` → `[zerobiubiu-github-io]`；zone 内剩余的 `pages.dev` DNS 记录属个人站（`zerobiubiu.top`），未触碰；删除后复核线上无影响（浏览器加载 200、`/api/me` = 0.4.0、advanced 证书 active） |
| 单 Worker 部署 | `bun run deploy` | `Uploaded triptrace`（272.61 KiB / gzip 58.15 KiB）；triggers：`https://triptrace.1731865922.workers.dev` 与 `trips.zerobiubiu.top (custom domain)`；版本 ID `0fbb6a47-0c48-42e7-b023-92a4312914bc` |
| 线上路由 | `curl`（域名切换后重试 3 次，前两次为切换过渡） | `/` → 200 + CSP（含 `style-src 'self' 'unsafe-inline'`）；`/api/me` → `0.4.0`；`/records` → 200 HTML;旧地址 `/api/me` → `0.4.0` |
| 线上真实浏览器 | 暗色设备模拟 | 正式域名：MUI 类 31、emotion `<style>` 4、`body` 背景 `rgb(15,18,24)`、登录表单可见、控制台 0 错误 |
| 旧地址跳转 | 浏览器打开 `triptrace.1731865922.workers.dev` | `location.href` → `https://trips.zerobiubiu.top/` |

### 验证结论

单 Worker 形态在生产生效：正式域名与 `/api/*` 由同一个 Worker 提供，旧地址自动跳到正式域名；Pages 项目已停用且不再持有域名；同域同源关系不变，账号、数据与 Cookie 策略未受影响。

### 已知限制

- 旧地址跳转依赖前端 JS（服务端不再 302）：禁用 JS 时用户会停留在旧地址的应用上（功能可用，只是另有一套 Cookie 作用域）。
- Pages 项目 `triptrace-web` 已在同日删除（含历史部署）；删除后复核：Worker 自定义域与 advanced 证书仍 active（覆盖 `trips.zerobiubiu.top`）、浏览器加载 200、页面内 `/api/me` 返回 0.4.0。
- 自定义域切换瞬间出现过短暂的 302/证书过渡（约数秒），属正常现象。
- 本机 `curl`（Windows schannel）对 `*.zerobiubiu.top` 整条 zone 的 HTTPS 请求偶发 `http=000`（同 zone 其它站同样复现，openssl 握手正常、浏览器正常），属本机网络/TLS 栈环境问题，与本变更无关。

## 后续验证建议

1. 真机访问正式域名确认登录态延续（同一主机名与 Cookie，理论上无需重新登录）。
2. 删除项目 `triptrace-web` 并同步文档 —— **已完成**（2026-10-08）：Pages 项目已删除，架构现状、`AGENTS.md`、CHANGELOG 与本文档均已同步为「本站不再使用 Pages」。
