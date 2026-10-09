# 0024 部署 0.11.5、GitHub 开源（MIT）与推送自动部署接线

- **状态**：**已完成**——部署、GitHub 开源、推送自动部署三者均已执行并端到端验证（CI 构建 + 部署成功）
- **版本**：0.11.5（部署已上线；本轮未改代码，故版本不再递增）
- **日期**：2026-10-10
- **影响范围**：线上部署、`zerobiubiu/TripTrace`（新公开仓库）、`.gitignore`、新增 `LICENSE` 与根 `README.md`
- **前置文档**：[0023-reuse-extraction.md](0023-reuse-extraction.md)

## 一、部署 0.11.5 ✅

- `bun run deploy` → Worker Version ID **`8d15a045-a61f-4494-8191-468531d70ddd`**，`APP_VERSION` 0.11.5。
- 验证：`https://trips.zerobiubiu.top/api/me` 回 `version: 0.11.5`；首页（带与不带 cache-buster 均是）引用的入口 chunk 与本地 `apps/web/dist` 产物同名，即线上与本地构建一致。
- **坑（已记）**：第一次在**后台任务**里跑 `bun run deploy` 失败（exit 1，构建阶段成功、wrangler 阶段失败），前台重跑即成功——后台环境可能缺终端/代理上下文，部署这类命令不要放后台。

## 二、GitHub 开源 ✅

仓库：**https://github.com/zerobiubiu/TripTrace**（public，默认分支 `master`，25 个提交完整保留；用户明确选择保留历史）。

| 项 | 处理 |
| --- | --- |
| 许可 | 新增 `LICENSE`（MIT，`Copyright (c) 2026 zerobiubiu`） |
| 说明书 | 新增根 `README.md`（简体中文）：定位、能力、技术栈、目录、本地运行、**部署到自己的 Cloudflare**、设计硬约束、文档入口、许可 |
| 本机产物 | 移出跟踪并加忽略：`.omp/mcp.json`（含本机绝对路径）、`apps/.wrangler-keys.json`、`apps/.wrangler-kv-delete.json`（一次性 KV 键名单，含一个用户 id 与会话 token 的 sha256 哈希）——文件保留在磁盘，只停止跟踪 |
| 凭证扫描 | 全仓库真实令牌前缀（`gho_`/`ghp_`/`github_pat_`/`sk-`/`cfut_`/`cfk_`/`cfat_`/`BEGIN * PRIVATE KEY`/`Bearer`）**零命中** |
| 远端核对 | `git status -sb` → `master...origin/master`（无 ahead/behind）；本地 `git ls-files` 113 = 远端 tree blob 113；三个产物路径经 contents API **逐个断言 404**；`LICENSE` / `README.md` 已在远端 |

**历史遗留（已告知用户并获同意）**：历史提交里仍含 `.omp/mcp.json`（本机路径 `C:\Users\wang-it-think`，即 Windows 用户名）与两个一次性运维产物。二者都不是可用凭证（KV 键里是 session token 的 sha256，无法反推令牌），但仍属账号真实产物；如需彻底清除需 `git filter-repo` 重写历史并强推（未做，属破坏性操作）。

`apps/api/wrangler.jsonc` 里的自定义域、D1/KV 绑定 id 与 `ADMIN_USERNAMES` 会随仓库公开——分别是作者自己的域与账号资源，**README 已提醒自建部署前替换**。

## 三、推送自动部署（Cloudflare Workers Builds）✅ 已打通

用户选择走 **Cloudflare 原生 Workers Builds**，且**不开分支/PR 预览**（只在 `master` 上构建与发布）。

**已完成的前置取证（API 实测）**：

| 项 | 值 |
| --- | --- |
| 账号 | `ece132b98267492c057accef6a60fe05`（`1731865922@qq.com's Account`） |
| Worker | `triptrace`，**script tag** `5597acb57dba420d83923dbacdf7d3f1`（注意：builds API 要的是 tag，不是名字） |
| GitHub 仓库 | `zerobiubiu/TripTrace`，**repo id** `1412313356`，默认分支 `master` |
| 现有状态 | `GET /builds/workers/{tag}` → `12040: No build configuration`；`PUT /builds/repos/connections` → **`8000008: This project is disconnected from your Git account`** |
| 结论 | **阻塞点**：Cloudflare 的 GitHub App（[Cloudflare Workers and Pages](https://github.com/apps/cloudflare-workers-and-pages)）尚未授权该仓库；App 授权必须由用户在浏览器完成，API 无法代做 |

**用户需要做的一次操作**：Cloudflare 仪表盘 → **Workers & Pages → triptrace → Settings → Builds → Connect**（GitHub）→ 在 GitHub 侧授权 `zerobiubiu/TripTrace`。连接过程会由 Cloudflare 自动生成 build token（`POST /builds/tokens` 需要 `build_token_name` + `build_token_secret` + `cloudflare_token_id` 三件套，因此**不手工造 token**）。

**授权完成后由我收尾**（步骤已定，届时用 API 执行）：
1. `PUT /accounts/{acct}/builds/repos/connections`（github / `zerobiubiu` / repo_id 1412313356 / TripTrace）→ 拿 `repo_connection_uuid`；
2. `POST /accounts/{acct}/builds/workers`，`script_tag` 用上面的 tag，`git_repository.branch = master`，`previews_enabled = false`，`production_settings` 与本轮一致：
   - `build_command`：`bun install`
   - `deploy_command`：`bun run deploy`（仓库脚本本身会先 `build:web` 再 `wrangler deploy`，运行时 cwd 由 `--filter @triptrace/api` 定位）
   - `root_directory`：`/`，`build_caching_enabled`：`true`
3. `GET /builds/workers/{tag}/triggers` 核对触发规则（`branch_includes: ["master"]`）；
4. 推一个空提交触发构建，再从 `GET /builds/{uuid}/logs` 读日志验证；若构建镜像缺少 bun，则改 `build_command` 为 `npm i -g bun`，或在 workflow 里退化用 `npx wrangler deploy`。

### 收尾（2026-10-10 实测：连接已建、命令已改、两次构建暴露并修掉两处真问题）

**连接已完成**：`GET /builds/workers/{tag}` 已返回配置（`auto_build_enabled: true`、`previews_enabled: false`）；trigger `e830790e-e2f7-44a0-bf0d-d2544d5e2257` 的 `branch_includes: ["master"]`；repo connection `72a4b84f-4094-4410-afc0-ab7241a37916`。仪表盘连接时复用了账号里已有的 build token（`6eec3154-…`），未新建。

**把默认命令改成对本仓库正确的命令**（仪表盘默认的 `npx wrangler deploy` 部署不了这个仓库：根目录没有 `wrangler.jsonc`，前端 `dist` 也不会被构建）——`PATCH /builds/triggers/{uuid}` 与 `PATCH /builds/workers/{tag}`，均已复读确认：

- `build_command`：`bun install && bun run build:web`
- `deploy_command`：`bun --filter @triptrace/api deploy`
- `build_caching_enabled`：`true`

**两次「推送即构建」的实测（这本身就是需求达成的证据）**：

| # | 现象（构建日志原文） | 根因 | 修法 |
| --- | --- | --- | --- |
| 1 | `Detected the following tools from environment: bun@1.2.15` → `error: Unknown lockfile version`（`bun.lock:2:22`）→ `lockfile had changes, but lockfile is frozen` → `Failed: error occurred while installing tools or dependencies` | 构建镜像自带的 bun 1.2.15 读不了本机 bun 1.4.2 写的 `bun.lock`（`lockfileVersion: 2`） | `package.json` 加 `"packageManager": "bun@1.4.2"`；下一次日志即变为 `Installing bun 1.4.2` ✅（**结论：Workers Builds 采纳 `packageManager` 字段**） |
| 2 | `Success: Build command completed`（前端构建成功，入口 `index-C6l9U9HCD`-类产物 641.19 kB 与本地一致）→ `/usr/bin/bash: line 1: wrangler: command not found` → `Exited with code 127` | **`wrangler` 从来不是本仓库的依赖**：本机一直靠全局安装才能跑，CI 里没有——照 README 克隆的人同样无法部署 | 钉成 `@triptrace/api` 的 devDependency（`wrangler@^4.148.0`）并 `bun install` 更新锁文件 |

第 2 条是**CI 才暴露出来的真实仓库缺陷**（隐藏的全局依赖），按「依赖必须落在仓库里」修掉——这也是开源自建者能用起来的前提。

**结果 ✅（端到端打通）**：第三次构建（提交 `c8562cc`，2026-10-09T19:04:28Z 起）全绿——`Detected ... bun@1.4.2` → `Success: Build command completed` → `wrangler deploy` 成功（`Current Version ID: 6a199359-7475-49e9-8ce3-385db8143f81`）→ `Success: Deploy command completed` → `✨ Success! Build completed.`；部署记录 `bbc338fd-e7fd-403f-b9f4-165a9dc102bf`（source `wrangler`，100% 流量）。线上冒烟：`/api/me` → `0.11.5`，首页入口 chunk `index-C6lU9HCD.js` 与 CI 构建产物一致。

**从此以后：任何 push 到 `master` → Workers Builds 自动构建（`bun install && bun run build:web`）并部署（`bun --filter @triptrace/api deploy`）到 `triptrace`（含自定义域 `trips.zerobiubiu.top`）。**

## 执行验证记录

**执行环境**：Windows 10（10.0.26300）· bun 1.4.2 · wrangler 4.148.0 · gh CLI（账号 `zerobiubiu`，scope 含 `repo`/`workflow`/`delete_repo`）· Cloudflare MCP（OpenAPI 查询 + 账号 API 调用）。

| 断言 | 结果 |
| --- | --- |
| 线上版本 | `/api/me` → `0.11.5` ✅ |
| 线上与本地构建一致 | 首页 chunk 名 == `apps/web/dist` 产物名 ✅ |
| 仓库可见性与分支 | `PUBLIC` / `master` ✅ |
| 远端文件与本地一致 | 113 blob = 113 跟踪文件 ✅ |
| 三个本机产物 | contents API 全部 **404** ✅；`git check-ignore -v` 逐条命中 ✅ |
| 凭证扫描 | 真实令牌前缀零命中 ✅ |
| 自动部署 | ⏳ 待授权（阻塞点与阻塞证据已记录） |

## 已知限制与后续

- 授权前，每次发布仍需手动 `bun run deploy`；CI 完成后由推送自动触发。
- 历史提交里的本机路径与运维产物未清除（需重写历史，破坏性，未做）。
- 预览构建未开：将来若要 PR 预览，需要额外为预览环境准备 D1/KV。
- 授权完成后我接着做第三节的第 1–4 步，并把结果补进本文件的执行验证记录（本文件为工程记录，可随收尾更新）。