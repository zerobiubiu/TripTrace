# 排查手册：workspaces 拆分后的工具链坑

- 状态：参考（长期有效）
- 关联组件：bun workspaces、全局 wrangler、Vite、Cloudflare Pages、TypeScript 7

## 1. 本项目采用「bun workspaces + 全局 wrangler」，踩过的坑都在这

### 1.1 `wrangler`/`vite` 报「找不到 node_modules 里的模块」

**现象**：`bun run dev:web` 或 `bun run check` 报
`Error: Cannot find module '...\node_modules\vite\bin\vite.js'`（或 wrangler 同理），但依赖明明装好了。

**原因**：改用 workspaces 后依赖装在各包自己的 `node_modules`，而仓库根目录的 `node_modules/.bin` 里还留着**上一版扁平安装**的 shim（bun 生成的 `xxx.bunx` / `xxx.exe`），它们指向已经不存在的老路径；脚本执行时 PATH 里先命中了这些坏 shim。

**处置**：

```bash
rm -f node_modules/.bin/wrangler* node_modules/.bin/vite* node_modules/.bin/cf-vite*
bun install     # 会按当前依赖图重建正确的 shim
```

验证：`bun --filter @triptrace/web dev` 打印的应是 `VITE v8.x`（本项目要求 8.x）。

### 1.2 脚本里 `vite` 跑成了别的版本（本机全局 pnpm 版）

**现象**：`bun run dev:web` 启动的是 VITE v5.4.21（本机 `AppData\Local\pnpm\vite.cmd`），不是依赖里的 8.x。

**原因**：根脚本用 `cd apps/web && vite`，bun 注入的是**根** `node_modules/.bin`（里面没有 vite），于是落到系统 PATH，命中了全局 pnpm 版。

**处置**：用 bun workspaces 的 `--filter` 在包内执行脚本，bun 会把该包自己的 `.bin` 加到 PATH 前面：

```jsonc
// 根 package.json
"dev:web": "bun --filter @triptrace/web dev"
```

### 1.3 `wrangler pages project create` 在 workspace 根目录失败

**现象**：在仓库根执行报
`The Cloudflare application detection logic has been run in the root of a workspace instead of targeting a specific project.`；
换到 `apps/web` 再执行又报 `npm error Unsupported URL Type "workspace:"`（wrangler 的新流程会调用 npm，读不懂 `workspace:*`）。

**处置（本次实际采用）**：用 API 建项目，再用 wrangler 部署：

```bash
# 建 Pages 项目（也可用 dashboard）
curl -X POST "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/pages/projects" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"triptrace-web","production_branch":"main"}'

# 上传产物
cd apps/web && wrangler pages deploy dist --project-name triptrace-web --branch main
```

（也可以用 `wrangler pages project create --force` 走旧版 Pages 流程，但新流程/旧流程的产物结构不同，本次未采用。）

### 1.4 通过 API 绑定 Pages 自定义域后，DNS 记录不会自动创建

**现象**：`POST /accounts/{id}/pages/projects/{project}/domains` 返回 `success: true`，但域名状态一直 `pending`，`verification_data.error_message = "CNAME record not set"`，访问返回 **522**。

**处置**：在对应 zone 手工补 CNAME（Pages 项目子域在项目信息里）：

```bash
curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"type":"CNAME","name":"trips.zerobiubiu.top","content":"triptrace-web-367.pages.dev","proxied":true,"ttl":1}'
```

建好后立即生效（本项目实测：加完记录后首页 200，`/api/*` 依旧由 Worker 路由接管）。

### 1.5 TypeScript 7 移除了 `baseUrl`

**现象**：`tsc` 报 `error TS5102: Option 'baseUrl' has been removed.`。

**处置**：删掉 `baseUrl`，`paths` 直接写相对 tsconfig 的相对路径（TS 5+ 本就支持）：

```jsonc
"paths": { "@triptrace/contracts": ["../../packages/contracts/src/index.ts"] }
```

### 1.6 旧 Cloudflare Vite 插件遗留的部署重定向

**现象**：`wrangler dev` 报
`There is a deploy configuration at "..\..\.wrangler\deploy\config.json" ... does not exist`。

**原因**：上一版用 `@cloudflare/vite-plugin` 时，插件在仓库根写了一个「部署配置重定向」文件；改用 Pages 后产物目录被删，重定向悬空。

**处置**：`rm -rf .wrangler/deploy`（`.wrangler/` 本就不入库）。

## 2. 本地跨源写操作被 403（bad_origin）

前端（5173）通过 Vite 代理访问后端（8787）时，浏览器发出的 `Origin: http://127.0.0.1:5173` 与请求主机不一致，Worker 的 CSRF 校验会拒绝。处置：在 `apps/api/.dev.vars` 里配置白名单（该文件不入库）：

```dotenv
ALLOWED_ORIGINS="http://127.0.0.1:5173,http://localhost:5173"
```

生产环境同源（0.4.0 起为单 Worker：静态资源 + `/api/*`，见 [changes/0005](../changes/0005-single-worker-topology.md)），不需要这个变量；`ALLOWED_ORIGINS` 仅用于不走 Vite 代理的跨源场景。

> 与时序有关的过时内容：Pages 项目 `triptrace-web` 已在 0.4.0 停用并删除，本文中与它相关的 DNS/域名步骤只在回溯 0.3.0 历史时还有意义。
