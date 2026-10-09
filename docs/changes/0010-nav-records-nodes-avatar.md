# 0010 分组收敛、记录查询区、节点每段一行、用户头像（0.7.0）

- 状态：已执行
- 影响范围：`apps/web` 导航与三个页面、`apps/api`（头像接口与存储）、`packages/contracts`、数据库
- 前置文档：[0009-init-adapt-harden.md](0009-init-adapt-harden.md)
- 生效版本：0.7.0
- 说明：本文件同时是 shape brief（`/impeccable shape`）落地的记录——brief 在对话中确认后才开工。

## 背景

用户在 src 上提出五项改造，经 shape 确认后实施：

1. **分组收组**：填表 / 记录 / 汇总 / 导入 四个分组合并——导入并入填报（页内展开），记录与汇总合成一个查询区；
2. **记录页**：用 `StaticDatePicker` 做「像日历一样」的单日筛查；
3. **节点与分段**：输入的节点可**拖动调整顺序**，展示形式要优化——此前「芯片链」与「分段里程」是同一信息的两种表述；
4. **用户模块**：可上传头像，未上传时按显示名首字自动生成；
5. 头像压缩目标：**最长边 ≤1000px**（用户明确要求，不要压到 256px 那么小）。

## 方案

- **导航**：`TAB_ITEMS` 从四项收敛为 **填报 / 记录** 两项（账号、管理仍在账号菜单）；`TabKey` 收敛为 `entry | records | account | admin`。
- **导入页内展开**：`ImportView` 改为 `ImportSection`（具名导出），由 `EntryView` 新增的「导入历史文本」卡片承载，按钮 `aria-expanded/aria-controls` 控制展开，不用模态框（设计底线：不需要中断或保护专注的任务不上模态）；`EntryView` 新增 `onImport / existing / notify` 三个 props。
- **记录查询区**：`RecordsView` 重写为三块——① 日历（`StaticDatePicker`，默认展开可收起、即选即用、带「回到今天」）② 当天明细（只显示选中日期那天的行程，卡片沿用原有写法与 aria-label）③ 可折叠的独立汇总区（原 `StatsView` 原样嵌入，保留自己的年份选择）。单日视图不再需要月份分组与 60 条分页。
- **节点每段一行**：`EntryView` 把「芯片链」与「分段里程」两张卡合并为一张「路线（每段一行，可拖动调整顺序）」——每行 = `起点 → 终点` + 里程输入（默认带出历史值、仍必填）+ 行首拖动手柄 + 末节点删除键；第一个节点没有自己的行，因此不可拖动/删除。
- **拖动排序（不引依赖）**：手柄用 pointer events 实现（`touch-action: none`、44×44 命中区），拖动中以 `elementFromPoint` 思路按行矩形命中目标行并**实时换位**；手柄可键盘聚焦，**↑/↓ 换位**，`aria-label` 说明「第几段、共几段」。里程规则：`withNodesReordered` 保留**仍相邻**的端点对里程（`from→to` 键，重复同名节点以首次出现为准），其余空白段按历史默认值补齐（含反向推断），不再相邻的手填值丢弃。
- **头像**：客户端 `fileToAvatarDataUrl` 等比缩放到**最长边 ≤1000px**（不裁剪），JPEG 质量 0.85→0.6 自适应直到解码后 ≤700KB；PNG 且带透明优先保 PNG，超限则铺白底转 JPEG。存储：`users.avatar`（data URL）+ `users.avatar_updated_at`（版本）。**头像本体不进任何 JSON**：`UserDto` 只带 `avatarUpdatedAt`，图片走 `GET /api/me/avatar?v=<版本>`（`private, max-age=31536000, immutable`，换图即 URL 变化）。接口 `PUT/DELETE /api/me/avatar`（请求体上限 1.5MB，解码后 ≤700KB，超限给可操作文案）。
- **会话热路径瘦身**：`users` 新增头像列后，`findUserByUsername / findUserById / listUsers / findSessionWithUser` 改为显式列集（`UserSummary`，**不含 avatar**），头像只由 `findUserAvatar` 按需取——否则每次鉴权与 KV 会话缓存都会带上几百 KB。
- **设计系统**：`DESIGN.md` 增补三段规则（日期字段只读显示、路线每段一行、头像与默认首字），`AGENTS.md` 的前端 UI 规则同步「两个分组」。

## 实施（改动文件清单）

| 文件 | 变更 |
| --- | --- |
| `packages/contracts/src/index.ts` | `UserDto` 加 `avatarUpdatedAt`；新增 `AvatarPayload`；`TabKey` 收敛 |
| `apps/api/src/db/schema.ts` + `migrations/20261009065110_odd_klaw.sql` | `users.avatar`、`users.avatar_updated_at`（本地与远端均已应用） |
| `apps/api/src/lib/store.ts` | `userColumns` 显式列集 + `UserSummary`；`updateUserAvatar`、`clearUserAvatar`、`findUserAvatar` |
| `apps/api/src/lib/auth.ts` | `SessionUser.avatarUpdatedAt`；KV 会话缓存载荷加 `a` 字段；两处用户构造补齐 |
| `apps/api/src/routes/auth.ts` | `toUserDto` 统一对外用户表示；`PUT/DELETE/GET /api/me/avatar`；`readJsonBody` 头像路径放宽到 1.5MB |
| `apps/api/src/routes/admin.ts` | 目标用户类型改为 `UserSummary` |
| `apps/web/src/components/TopBar.tsx` | 分组收敛为两项；用户名左侧加头像 |
| `apps/web/src/components/AvatarBadge.tsx`（新增） | 头像/默认首字徽标（圆形、软底、字号地板 14px） |
| `apps/web/src/lib/avatar.ts`（新增） | 客户端压缩（≤1000px、质量自适应 ≤700KB） |
| `apps/web/src/lib/entry.ts` | 新增 `withNodesReordered`（纯函数，里程保留规则） |
| `apps/web/src/views/ImportView.tsx` | 导出改为 `ImportSection`（供填报页内嵌） |
| `apps/web/src/views/EntryView.tsx` | 一卡多行 + 拖动/键盘换位 + 导入区块 + 三个新 props |
| `apps/web/src/views/RecordsView.tsx` | 重写为查询区（日历 + 当天明细 + 可折叠汇总） |
| `apps/web/src/views/AccountView.tsx` | 新增头像卡片（上传/更换/移除） |
| `apps/web/src/api.ts`、`App.tsx` | `uploadAvatar/removeAvatar`；去掉 stats/import 渲染并接线新 props |

## 执行验证记录

### 执行环境

Windows 10 / bun 1.4.2 / wrangler 4.148.0；本地单 Worker `wrangler dev --port 8790`；浏览器 iPhone 12 设备模拟（390×844/900）。

### 验证命令与实际输出

| 验证 | 手段 | 实际输出 |
| --- | --- | --- |
| 类型与门禁 | `tsc -p apps/api` / `tsc -p apps/web` / `bun run check` | 均 0 错误；`✓ 版本一致：0.7.0` |
| 构建 | `bun run build:web` | `✓ built`（记录/账号/管理视图各自成块） |
| 头像接口 | curl（本地） | PUT 小 PNG → 200 且 `avatarUpdatedAt` 有值；GET → 200 + `Content-Type: image/png` + `private, max-age=31536000, immutable`；DELETE → null、再 GET → 404 + `no-store`；非 data URL → 400；800KB 载荷 → 400 `头像过大（800KB），请压缩到 700KB 以内`；三个接口未登录均 401 |
| 会话缓存一致性 | PUT 后 `GET /api/me` | 版本立即变化（KV 缓存已清，从 D1 回源） |
| 头像客户端压缩 | 上传 1200×800 PNG | 落地图 `naturalWidth×Height = 1000×667`；截图确认左上白块完整（未裁切） |
| 导航 | 顶栏 | `填报/记录` 两项；头像出现在用户名左侧（默认「拆」） |
| 每段一行 | 加 家→圣润→家 | 两行：`家 → 圣润 25`、`圣润 → 家 25`（反向推断），合计 50 公里 |
| 里程保留规则 | 指针拖动第 1 行向下 | 链变为 家→家→圣润：`家 → 家`（无历史，留空）+ `家 → 圣润 25`（相邻对保留） |
| 键盘换位 | 第 2 段手柄按 ↑ | 顺序变化（`家→家,家→圣润,…` → `家→圣润,圣润→家,家→家,…`） |
| 导入页内展开 | 点「展开」 | `aria-controls=entry-import-section` 区块出现且含粘贴框；再点收起 |
| 记录页 | 打开记录 | 日历（选中 9）、「10月9日 的记录」、汇总默认收起；展开后 年度汇总/月度分布/高频路段 均在 |
| 记录页换天 | 点日历 28 | 标题变「10月28日 的记录」，该日空态 |
| 控制台 | 全部页面 | 0 错误 |
| 线上 | 部署后 | `/api/me` = 0.7.0、首页正常、0 控制台错误；远端迁移 `20261009065110_odd_klaw` 已应用 |

### 验证结论

五项要求全部落地并有实测证据：分组收到两项、导入在填报页内展开、记录页成为「日历选日 → 当天明细 → 可折叠汇总」的查询区、节点每段一行且拖动/键盘均可换位（里程保留规则实测正确）、头像从上传到显示（含 1000px 压缩与服务端上限）端到端可用；线上 0.7.0 已发布。

### 已知限制

- **拖动的手感只在 Chromium 设备模拟下验证**：真机长按拖动与列表滚动的冲突、iOS 上 pointer capture 的表现需要真机确认；键盘路径已可用作兜底。
- 拖动换位时**同名重复节点**（家→…→家）的里程归并按「首次出现的端点对」处理，极端情况下可能与直觉略有差异（已写进 `withNodesReordered` 注释）。
- 头像为中文字节直接入库（D1 TEXT），单用户约 30–400KB；未做图片变体/缩略图，列表页未展示他人头像（管理员列表刻意无头像）。
- 记录页的日历在手机上一屏占比较高（默认展开）；已提供收起，但首屏仍以日历为主——这是「像日历一样选日」的直接代价。
- `StatsView` 仍是独立文件（作为记录页内的区块渲染），未进一步拆分为更细的组件。

## 后续验证建议

1. 真机（iOS Safari / Android Chrome）过一遍：拖动排序、日历点选、头像上传（含从相册选 4000px 大图）。
2. `PRODUCT.md` 里仍登记两条「已确认未实现」的方向：管理员查看任一用户行程明细、出差台账——动它们前先 `/impeccable shape`。
3. 想再收一轮设计与实现质量时跑 `/impeccable audit` 与 `/impeccable polish`。