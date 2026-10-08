# 变更记录：途迹 TripTrace 首个可用版本（0.1.0）

- 状态：已执行（不可变变更文档）
- 生效版本：0.1.0
- 影响范围：新增整站（Worker + D1 + KV + 前端单页）
- 前置文档：[architecture/0001-triptrace-architecture.md](../architecture/0001-triptrace-architecture.md)

## 1. 背景

原先用纯文本手记出差行程（日期 + 节点链 + 里程，例如 `9.28 / 家，依剑，爱克森，圣祥小镇，圣润 57 公里`），问题：里程靠手算、历史路线每次重抄、多天的账要对小计、数据只在本地文本里、多人无法共用。目标是一个打开就能填、能被历史数据“喂熟”的在线记录工具。

需求要点：日期默认今天可改；节点自由输入；分段里程可不填、只填总里程也行；历史路线要能提示以减少输入；数据持久化；按账号存储、多人使用、需要鉴权；一台设备的登录态长期有效。

## 2. 方案

- **技术栈**：Cloudflare Workers（`src/index.ts`）+ Workers 静态资源（`public/`，原生 ES 模块，无打包步骤）+ D1（账号/会话/行程）+ KV（会话缓存与限流）。
- **不用框架的理由**：单页交互量适中，原生模块 + 事件委托即可；省掉构建链与依赖，部署产物 37.52 KiB（gzip 9.68 KiB）。
- **鉴权**：PBKDF2-SHA256（10 万次迭代，workerd 上限）+ HttpOnly Cookie 400 天滚动续期 + 服务端会话（D1 为准、KV 加速）。
- **智能建议**：登录后一次拉全量行程，前端建索引：节点名补全、分段里程建议（同方向优先、可标反向）、整条历史路线一键沿用、最近路线快捷填入、总里程自动合计/手动覆盖。
- **历史导入**：文本解析器支持用户原有写法（只写日期、只写节点、写总里程、日期区间 `7.1-7.2`、`8.27-29`、`单次25km` 模板、小计行、分隔线），解析预览可勾选后再入库，按 `日期+节点链+总里程` 去重。

## 3. 实施（改动文件清单）

| 文件 | 说明 |
| --- | --- |
| `wrangler.jsonc` | Worker 名 `triptrace`、静态资源与 SPA 回退、`run_worker_first: ["/api/*"]`、D1/KV 绑定、`vars`、observability（logs + traces） |
| `package.json` / `tsconfig.json` / `.gitignore` | 脚本（dev/check/build/deploy/db:migrate:*）、依赖（wrangler、typescript）、忽略项 |
| `scripts/check-version.mjs` | 版本门禁：`package.json` 与 `wrangler.jsonc` 的 `APP_VERSION` 必须一致 |
| `migrations/0001_init.sql` | `users` / `sessions` / `trips` 三张表与索引 |
| `src/index.ts` | Worker 入口：路由分发、错误处理、安全响应头、非 API 请求交给静态资源 |
| `src/lib/http.ts` | 错误类型、JSON 响应、Cookie、同源校验、请求体解析、安全头 |
| `src/lib/crypto.ts` | base64url、随机令牌、SHA-256、PBKDF2（含迭代上限钳制）、恒定时间比较 |
| `src/lib/auth.ts` | 用户名/密码/显示名校验、密码哈希与校验、邀请码、限流、会话创建/解析/滚动续期/销毁 |
| `src/lib/store.ts` | 全部 SQL：用户、会话、行程（含批量插入分批） |
| `src/lib/trips.ts` | 行程输入校验、`legs` 由节点派生、总里程兜底求和、DTO 序列化与去重键 |
| `src/lib/router.ts` / `src/lib/util.ts` / `src/env.d.ts` | 极简路由、类型工具、补充密钥声明（`SIGNUP_CODE`） |
| `src/routes/auth.ts` | `/api/me`、注册、登录、登出、改密 |
| `src/routes/trips.ts` | 行程列表/新建/修改/删除/批量导入 |
| `public/index.html` / `styles.css` / `icon.svg` / `manifest.webmanifest` / `_headers` | 页面外壳、深浅色自适应样式、图标、清单、静态资源安全头 |
| `public/js/api.js` | API 调用封装 |
| `public/js/suggest.js` | 建议引擎与统计（纯函数） |
| `public/js/import-text.js` | 历史文本解析器 |
| `public/js/app.js` | 全部视图与交互（填报/记录/汇总/导入/账号） |
| `docs/**`、`CHANGELOG.md`、`AGENTS.md` | 文档体系、变更记录、项目规则 |

## 4. 执行验证记录

### 4.1 执行环境

- Windows 10.0.26300（x64），Node v24.21.0，npm 11.19.0，Wrangler 4.148.0（项目本地依赖）。
- 本地：`wrangler dev`（本地 D1/KV，`http://localhost:8787`）。
- 线上：Worker `triptrace` → https://triptrace.1731865922.workers.dev（D1 `triptrace-db`，KV `triptrace-sessions`）。

### 4.2 验证命令与实际输出

| 验证 | 命令 | 结果 |
| --- | --- | --- |
| 类型与门禁 | `npm run check` | `wrangler types` 生成绑定类型 → `✓ 版本一致：0.1.0` → `tsc --noEmit` 无错误 |
| 本地迁移 | `npm run db:migrate:local` | `0001_init.sql ✅`，`6 commands executed successfully` |
| 构建 | `npx wrangler deploy --dry-run --outdir dist` | `Total Upload: 37.52 KiB / gzip: 9.68 KiB`、`Read 10 files from the assets directory` |
| 本地 API 冒烟 | 29 项断言（脚本） | 全部 PASS：未登录 `user=null`、注册 201 + Cookie、`/api/me`、建行程（分段自动合计 119）、列表、只填总里程 52、修改（50）、批量导入 2 条、重复导入 `created=0/skipped=2`、非法日期 400、空节点 400、超限里程 400、跨站 Origin 403、无 Cookie 401、未知接口 404、方法不匹配 405、错误密码 401、用户名大小写不敏感、多设备会话并存、删除 200/重复删除 404、首页 200 + CSP、静态 JS 200、SPA 回退 200 |
| 浏览器 UI 验证 | Chromium 实际操作 | 登录后默认日期 `2026-10-08`；输入“圣”出现历史建议（“圣祥小镇 用过 2 次”）；回车加节点；常用路线一键填入 `家 → 圣润 → 爱克森 → 家` 并自动合计 52；分段建议按钮“25 公里”按历史出现；保存出现成功提示且表单清空；记录视图按月分组（含日合计、导入标记、分段明细）；汇总视图 4 张统计卡 + 12 个月柱状（宽度由 CSSOM 赋值，符合 CSP）+ 高频路段；导入视图解析示例文本 15 条、含“只有日期、没有记录”提示与“沿用模板”提示、导入后记录数 4 → 17（重复的 9.28/9.29 各跳过 1 条）；控制台错误 0 |
| 线上部署 | `wrangler login` → `d1 create` → `kv namespace create` → `db:migrate:remote` → `deploy` | `✨ Success! Uploaded 8 files`、`Deployed triptrace triggers`、Version ID `d0551fc1-651d-454b-b839-e4ae9ab48d0a` |
| 线上冒烟 | 16 项断言（脚本） | 全部 PASS：`/api/me` 未登录、注册（PBKDF2 10 万次迭代未触发 1102）、Cookie 含 `HttpOnly/Secure/SameSite=Lax/Max-Age=34560000`、登录态、建/列/删行程、批量导入去重、登录、登出清 Cookie、未知接口 404、首页 200 + CSP、SPA 回退、静态 JS 200 |
| 线上会话核对 | 5 项断言（脚本） | 全部 PASS：两设备会话并存、A 登出不影响 B、登出后自己失效（KV 缓存同步清理）、同一用户名连续失败第 12 次触发 429 |
| 数据清理 | `wrangler d1 execute --remote`、`wrangler kv bulk delete --remote` | 冒烟测试账号已删除（`users` 计数 0），对应 KV 会话键已清空（`kv key list --prefix "s:"` 返回 `[]`） |

### 4.3 验证结论

需求逐条对照：

| 需求 | 结论 |
| --- | --- |
| 打开自动出现本日日期，可变更 | ✅ 默认本地今天，支持前一天/后一天/今天与日期选择器 |
| 输入路径节点名称 | ✅ 节点链编辑，历史节点名自动补全 |
| 每段里程 + 汇总总里程 | ✅ 分段可填可不填；默认按分段自动合计，可手动覆盖并提示差额 |
| 只要总里程有就行 | ✅ 服务端 `total_km` 允许独立于分段存在（仅填总里程的用例已冒烟） |
| 智能带出历史距离 | ✅ 节点补全、分段建议（含反向标注）、整条路线“沿用这条”、常用路线一键填入 |
| 信息持久化 | ✅ D1 存储，前端刷新/重登后数据仍在（浏览器验证） |
| 按账号存储、多人使用、鉴权 | ✅ 账号隔离（`user_id` 过滤 + 归属校验）、注册/登录/改密/登出、限流 |
| 登录态长期不失效 | ✅ 400 天 Cookie（HttpOnly/Secure）+ 会话滚动续期，多设备独立 |

### 4.4 已知限制

- PBKDF2 迭代次数受 workerd 10 万次硬上限约束；当前账号为付费用量模型（30s CPU），若未来降级到 Free（10ms）需要下调迭代或改客户端 KDF（处置见 troubleshooting）。
- 行程列表为全量拉取，未做分页；数据量到数千条以上时需要改造。
- 无密码找回流程；忘记密码需按 troubleshooting 文档在 D1 侧重置。
- 无 Service Worker，离线只能读、不能提交。

## 5. 后续验证建议

- 真实数据导入后抽查：导入条目与原始文本逐条对齐（重点关注 `单次25km` 模板展开的日期与方向）。
- 长期登录态：隔几天从手机/电脑打开一次，确认无需重新登录；观察 `/api/me` 是否正常。
- 观察 Workers Logs（已在 `wrangler.jsonc` 开启 logs + traces）：关注 `unhandled_error` 与 CPU 时间指标。
- 若数据量增长：先加 `date >= ?` 范围查询与“仅加载最近 N 天”，再考虑分页。
