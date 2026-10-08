# TripTrace 项目规则

本文件只写 agent 的执行规则；说明、记录、分析一律进 `docs/`（入口：[docs/README.md](docs/README.md)）。

## 项目概况

途迹 TripTrace：记录每日出差行程节点与里程的 Web 应用。Cloudflare Workers（`src/`，TypeScript）+ Workers 静态资源（`public/`，原生 ES 模块、无打包步骤）+ D1（账号/会话/行程）+ KV（会话缓存与限流）；SQL 迁移在 `migrations/`。

## Cloudflare 与部署

- 本项目有 `wrangler.jsonc`，Cloudflare 操作一律用**项目本地 Wrangler**（`npx wrangler` 或 `npm run` 脚本），不用 cf CLI。
- 资源固定：Worker `triptrace`（https://triptrace.1731865922.workers.dev）、D1 `triptrace-db`（`52a9d143-2cb4-4888-b158-4dfb36adb6c4`）、KV `triptrace-sessions`（`aa2cda7e62da49c7bb8449ec6150d888`）。改绑定必须同步 `wrangler.jsonc` 并重新生成类型。
- 部署前先 `npm run check`；线上变更后必须做一次线上冒烟（注册/登录/行程读写/登出）。
- 密钥（如 `SIGNUP_CODE`）用 `wrangler secret put`，不写进配置或源码。

## 验证

- 静态检查：`npm run check`（生成绑定类型 → 版本一致性 → `tsc --noEmit`）。
- 本地运行：`npm run dev`（本地 D1/KV，端口 8787）；迁移：`npm run db:migrate:local` / `npm run db:migrate:remote`。
- 改了前端或接口，必须用浏览器真实走一遍受影响流程；类型通过不等于功能可用。

## Git

- 一次逻辑变更一个提交；提交信息用简体中文写清「做了什么、为什么」。
- 未经明确要求不提交、不推送、不切分支、不打标签；对外操作先问。
- 提交前确保 `npm run check` 通过；不提交密钥/凭据、构建产物、`.wrangler/`、`node_modules/`。

## 项目版本

- 唯一事实来源：`package.json` 的 `version`；`wrangler.jsonc` 的 `vars.APP_VERSION` 必须与之同步，由 `npm run check` 门禁校验。
- 只在**被发布程序的行为**变更时递增：破坏性 → major，兼容新功能 → minor，兼容修复 → patch；纯文档/注释/配置改动不递增。
- 递增时同步更新 `CHANGELOG.md`。

## 文档

- 源码变更随行写文档：在 `docs/changes/` 记一份（背景 / 方案 / 实施清单 / 执行验证记录），并回 `docs/README.md` 补索引。
- 架构现状写 `docs/architecture/`，长期可复现的问题写 `docs/troubleshooting/`；变更文档定稿后不重写，后续变化另建并标注替代关系。
