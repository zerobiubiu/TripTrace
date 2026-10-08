# 途迹 TripTrace 架构说明

- 状态：已执行（现状文档，随系统演进更新）
- 影响范围：本项目全部组件
- 生效版本：0.1.0
- 相关文件：[wrangler.jsonc](../../wrangler.jsonc)、[migrations/0001_init.sql](../../migrations/0001_init.sql)、[src/](../../src)、[public/](../../public)

## 1. 目标与形态

单人/多人记录每日出差行程：**节点链（家 → 圣润 → 天九 → …）+ 分段里程（可选）+ 总里程**，并按日/月/年汇总。核心体验要求：

1. 打开即出现当天日期，日期可改；
2. 节点直接输入，历史节点名自动补全；
3. 分段里程可以不填，只填总里程也能保存；
4. 历史路线能自动提示/一键沿用以减少输入；
5. 数据持久化、按账号隔离、多人使用需要鉴权；
6. 登录态在一台设备上长期有效，日常使用不失效。

## 2. 组件

```text
浏览器（public/ 原生 ES 模块单页应用，无构建步骤）
   │  /api/* 由 Worker 处理（assets.run_worker_first）
   ▼
Cloudflare Worker（src/index.ts，TypeScript）
   ├── Workers 静态资源（public/）：index.html / styles.css / js/*，SPA 回退
   ├── D1（binding DB，库名 triptrace-db）：users / sessions / trips
   └── KV（binding SESSIONS，命名空间 triptrace-sessions）：会话缓存 + 限流计数
```

- **Worker**：`/api/*` 优先进入 Worker；其它路径由静态资源先处理，未命中时按 `not_found_handling: single-page-application` 回退 `index.html`。
- **D1**：唯一事实来源（账号、会话、行程）。所有 SQL 集中在 `src/lib/store.ts`。
- **KV**：只做读多写少的加速与限流，不作为事实来源。会话缓存键 `s:<userId>:<sha256(token)>`（30 天 TTL）；限流键 `rl:<scope>:<identity>`。
- **静态资源**：`public/_headers` 统一注入安全响应头（CSP、nosniff、frame-ancestors 等），Worker 侧对 `/api/*` 再注入一次同名头。

## 3. 数据模型（D1，migrations/0001_init.sql）

| 表 | 关键列 | 说明 |
| --- | --- | --- |
| `users` | `id`、`username`（唯一，归一化小写）、`display_name`、`pwd_algo`、`pwd_salt`、`pwd_hash`、`pwd_iterations` | 迭代次数按用户存储，便于将来升级算法而不影响存量账号 |
| `sessions` | `id`、`user_id`、`token_hash`（唯一）、`created_at`、`last_seen_at`、`extended_at`、`expires_at`、`user_agent` | 服务端会话；`extended_at` 用于把“滚动续期”限制到每天最多一次写入 |
| `trips` | `id`、`user_id`、`date`、`nodes`(JSON 数组)、`legs`(JSON 数组 `{from,to,km\|null}`)、`total_km`(可空)、`note`、`source`、`created_at`、`updated_at` | 一次“当天的一条行程”；同一天可多条，日合计在客户端汇总 |

约定：

- `total_km` 是统计口径，**允许为空**（表示暂未填）；分段 `legs[].km` 也允许为空。
- 若提交时 `total_km` 为空且所有分段都有值，服务端按分段求和补上（与前端“自动合计”一致）。
- `legs` 的 `from`/`to` 一律由 `nodes` 派生，客户端传什么都不影响结果（避免脏数据）。

## 4. API 契约

统一前缀 `/api`；请求与响应均为 JSON；错误响应形如 `{"error":{"code","message","details?"}}`。

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/me` | 否 | 返回 `{user\|null, signupCodeRequired, version}`；会话滚动续期时会重发 Cookie |
| POST | `/api/auth/register` | 否 | `{username, displayName?, password, signupCode?}` → 201 + 登录 Cookie；设置了 `SIGNUP_CODE` 密钥时校验邀请码 |
| POST | `/api/auth/login` | 否 | `{username, password}` → 用户信息 + 新会话 Cookie |
| POST | `/api/auth/logout` | 是 | 删除当前会话（D1 行 + KV 缓存）并清 Cookie |
| POST | `/api/auth/password` | 是 | `{currentPassword, newPassword}`，改密后清理该用户其它会话 |
| GET | `/api/trips` | 是 | 返回当前用户全部行程（按日期倒序），前端据此计算建议与统计 |
| POST | `/api/trips` | 是 | 新建行程，返回 `{trip}` |
| PUT | `/api/trips/:id` | 是 | 修改行程（校验归属），返回 `{trip}` |
| DELETE | `/api/trips/:id` | 是 | 删除行程（校验归属） |
| POST | `/api/trips/bulk` | 是 | 批量导入（≤500 条/次），按 `日期+节点链+总里程` 去重，返回 `{created, skipped}` |

写操作（POST/PUT/DELETE）额外做 CSRF 防护：`Sec-Fetch-Site: cross-site` 直接拒绝；带 `Origin` 时校验 host 与请求站点一致。

## 5. 鉴权与会话设计

- **密码**：PBKDF2-SHA256 + 每用户 16 字节随机盐，默认 100000 次迭代（`vars.PBKDF2_ITERATIONS` 可调，按用户存储）。
  - workerd 对 PBKDF2 迭代次数有 10 万次硬上限（超出直接抛错，见 [workerd#1346](https://github.com/cloudflare/workerd/issues/1346)），因此 10 万即当前上限。
  - 本账号的 Workers 用量模型为 Standard（付费额度，默认 30s CPU/请求），10 万次迭代（约数十毫秒 CPU）安全；若将来降级到 Free（10ms CPU/请求），需要下调 `PBKDF2_ITERATIONS` 或把 KDF 移到客户端 —— 处置见 [troubleshooting/0001](../troubleshooting/0001-auth-and-session-ops.md)。
- **会话令牌**：32 字节随机数（`crypto.getRandomValues`）→ base64url；Cookie 值为 `v1.<userId>.<token>`，D1 存 `sha256(token)`。服务端只存哈希，泄库不等于可直接登录。
- **Cookie**：`HttpOnly; SameSite=Lax; Path=/; Max-Age=34560000`（400 天，浏览器上限），HTTPS 下附加 `Secure`。
- **长期不失效**：会话有效期 400 天；每次活跃最多每天滚动续期一次（D1 写 `expires_at`），并顺带重发 Cookie 推后浏览器端过期时间。日常使用下不会失效；连续 400 天完全不用才会过期。
- **多设备**：同一账号可有多个独立会话，互不影响；改密会清理其它会话。
- **一致性**：KV 命中即视为有效（缓存只在 D1 校验通过后写入）；登出、改密、清理用户都会同步删除对应 KV 键（改密按 `s:<userId>:` 前缀批量删）。手动删用户时的残留清理见 troubleshooting 文档。
- **限流**（KV 计数）：同 IP 登录 30 次/15 分钟；同用户名 10 次/15 分钟；注册同 IP 10 次/小时。
- **用户名枚举**：登录失败时对不存在的用户也执行一次同等开销的 PBKDF2，避免通过响应时间探测账号。

## 6. 前端结构与“智能建议”

`public/js/` 为原生 ES 模块（无打包、无框架、无运行时依赖）：

| 文件 | 职责 |
| --- | --- |
| `api.js` | `/api/*` 调用封装，统一错误对象 `{code, message, status}` |
| `suggest.js` | 纯函数建议引擎：节点名补全、分段里程建议、整条路线匹配、最近路线、年度统计 |
| `import-text.js` | 历史文本解析器（日期/区间/模板/小计/分隔线） |
| `app.js` | 视图与交互：登录注册、填报、记录、汇总、导入；表单高频输入只做定点 DOM 更新以避免丢焦点 |

建议引擎的输入是登录后一次性拉取的行程数组，内存中索引：

- **节点名**：按使用次数 + 最近使用排序，前缀优先、其次包含；输入框聚焦即展示（可键盘上下选择、回车添加）。
- **分段里程**：同方向历史取“出现次数最多（同次数取最近）”；没有同方向时退回反方向并标注“反向”。
- **整条路线**：节点链完全一致时提示“历史路线：<日期> · <里程> · 沿用这条”；添加节点时自动把空白分段用历史值补齐（已手填的不覆盖）。
- **总里程**：默认按分段自动合计（徽标“自动合计”）；手动改动后转为“手动填写”，并显示与分段合计的差额警告；可一键切回自动。

## 7. 部署

| 资源 | 名称 | 标识 |
| --- | --- | --- |
| Worker | `triptrace` | https://triptrace.1731865922.workers.dev |
| D1 | `triptrace-db` | `52a9d143-2cb4-4888-b158-4dfb36adb6c4` |
| KV | `triptrace-sessions` | `aa2cda7e62da49c7bb8449ec6150d888` |
| 账号 | 1731865922@qq.com's Account | `ece132b98267492c057accef6a60fe05` |

```bash
npm install                # 安装依赖（wrangler、typescript）
npm run check              # 生成绑定类型 → 版本一致性校验 → tsc 类型检查
npm run dev                # 本地开发（本地 D1/KV，http://localhost:8787）
npm run db:migrate:local   # 本地应用迁移
npm run db:migrate:remote  # 线上应用迁移
npm run deploy             # 构建并部署
```

首次使用：访问线上地址 → 注册账号（开放注册；如需收敛，`wrangler secret put SIGNUP_CODE` 后注册需填邀请码）→ 在「导入」页粘贴历史文本、选择年份、解析预览、确认导入。

## 8. 已知限制与设计取舍

- 行程列表一次性拉全量（个人量级：数年数百条）。若将来数据量增大，需要加时间范围查询与分页。
- 无“重置密码/邮件找回”：账号体系不依赖邮箱。忘记密码的处置方式是以管理员身份在 D1 中重置（见 troubleshooting）。
- 无离线写入：断网时只能读取已缓存的数据页面，不能提交（没有 Service Worker / 本地队列）。
- KV 会话缓存与 D1 之间存在最长 30 天的“缓存有效期”窗口；正常撤销路径（登出/改密）都会清理 KV，只有手动改库才会出现窗口。
- `total_km` 与分段合计不一致是**允许**的（用户可能只知道总里程），前端会提示差额但不阻拦保存。
