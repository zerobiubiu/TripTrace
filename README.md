# 途迹 TripTrace

出差行程的「**节点链 + 里程**」台账：打开就是今天，节点名按历史补全，分段里程默认带出历史值，总里程由分段合计得出——月末不用再手算。

## 它解决什么

- **记一笔要快**：默认今天、常用路线一键带出全部分段与总里程、**同一条路往返同值**（只需一侧有数据，反向也能带出）、节点名先选后输（移动端不弹软键盘）。
- **账要经得起核对**：每一段里程都要有数，总里程 = 分段合计；缺里程的记录会被标出来，而不是默默算成 0。
- **路上录、桌面核**：手机（含横屏）/ 平板单列单手录入，桌面 ≥1024 分两栏（表单 + 当日记录；查询栏 + 结果列表）。
- **存量能进来**：解析手写风格的历史文本（`9.28`、`7.1-7.2` 区间、`单次25km`、`203 公里` 小计、`------` 分隔线）并去重导入；也能整体导出 JSON。
- **数据是用户的**：可导入、可导出、不做锁定；密码与登录态自管，不接第三方登录。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 部署 | **单个 Cloudflare Worker**：静态资源（`assets` 绑定）+ `/api/*` 同源，一次 `wrangler deploy` 发布全部 |
| 前端 | React 19 · Vite · TypeScript · MUI v9（含 `@mui/x-date-pickers`、dnd-kit），无路由、无状态库 |
| 后端 | Hono · Drizzle ORM · D1（数据）· KV（会话缓存与限流） |
| 鉴权 | 自建账号体系：PBKDF2-SHA256（迭代受 workerd 10 万次上限约束）+ 长期登录态（滚动续期、多设备独立；D1 为准，KV 只做缓存） |
| 共享契约 | `packages/contracts` 只放类型（`import type` 打包时完全擦除，零运行时耦合） |

前端支持基线：Chrome ≥117 / Edge ≥121 / Firefox ≥121 / Safari ≥17（由 MUI v9 决定）。

## 目录

```text
apps/web/              前端（React SPA；DESIGN.md 是设计系统，PRODUCT.md 是产品上下文）
apps/api/              Worker（Hono 路由 + Drizzle schema/migrations + 鉴权与限流）
packages/contracts/    前后端共享的 API 契约类型（只放类型）
docs/                  文档中心：docs/README.md（架构 / 变更记录 / 排查手册）
scripts/               版本一致性门禁等
```

## 本地运行

```bash
bun install
bun run dev:web                 # 前端开发服务器（Vite）
bun run dev:api                 # Worker 本地开发（wrangler，自带本地 D1/KV）
bun run check                   # 类型检查 + 版本一致性门禁（提交前必过）
```

## 部署到自己的 Cloudflare 账号

1. 建资源并把 id 填进 `apps/api/wrangler.jsonc`：一个 D1 数据库、一个 KV namespace；自定义域与 `ADMIN_USERNAMES` 也在同一文件里。
2. 首次建表：`bun run db:migrate:remote`（本地开发用 `bun run db:migrate:local`）。
3. 发布：`bun run deploy`（= 构建前端 + `wrangler deploy` 单 Worker）。
4. 管理员由 `ADMIN_USERNAMES` 按用户名指定；注册默认开放，需要收紧时设置 `SIGNUP_CODE` 邀请码（无需改代码）。

> 注意：本仓库的 `wrangler.jsonc` 里带着作者自己的域名、D1/KV 绑定 id 与管理员用户名——**自建部署前请先换成你自己的**。

## 设计上的几个硬约束

- 填报页的分段与节点必须对齐：`legs.length === max(0, nodes.length - 1)`，结构一变就整条重建。
- 服务端是唯一可信来源：客户端把返回值洗成合法形状再用（畸形记录被丢弃，而不是炸掉页面）。
- 会话以 D1 为准、KV 只做缓存：登出 / 改密 / 禁用 / 删除账号都必须同时清 KV，否则缓存命中会让旧会话继续可用。
- 界面文字不小于 14px，`pointer: coarse` 下命中区 ≥44px；读数一律千位分隔 + 等宽数字。

## 文档

`docs/README.md` 是文档中心：架构现状、逐次变更记录（含验证证据与已知限制）、鉴权与会话运维手册、工具链排查手册。

## 许可

[MIT](LICENSE) © 2026 zerobiubiu