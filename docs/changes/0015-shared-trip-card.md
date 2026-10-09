# 0015 行程卡抽成共用组件（0.9.3）

- 状态：已执行
- 影响范围：`apps/web/src/components/TripCard.tsx`（新增）、`views/RecordsView.tsx`、`views/EntryView.tsx`、`AGENTS.md`、`apps/web/DESIGN.md`
- 前置文档：[0014-quiet-mileage-reading.md](0014-quiet-mileage-reading.md)
- 生效版本：0.9.3
- 不涉及：数据逻辑、布局结构、接口

## 背景

用户指出 0014（`/impeccable quieter`）只改了记录页的里程显示，**填报页「当日记录」里的里程胶囊仍在**，并追问「这两处的显示模式不是用的同一组件吗？应该改变全动才对」，要求增强组件复用、解耦与原子化。

取证（改造前，逐处查过源码）：两处**不是**同一个组件，是两份各自内联的 JSX：

| | 记录页（`RecordsView.renderTrip`，文件内局部） | 填报页「当日记录」（`EntryView` 内联） |
| --- | --- | --- |
| 容器 | `Card variant="outlined"` + `CardContent` | `Stack` + 1px 描边 + `radius.control` |
| 标题 | `body1` 600 | `body2` 600 |
| 里程 | 胶囊（0014 才改成读数） | 仍是**胶囊**（`warning` / `primary`） |
| 备注 | 显示 | **不显示** |
| 分段明细 | 显示 | 不显示 |
| 按钮 | `ml:auto` 推右 | 用 `<Box sx={{ flex: 1 }} />` 撑开 |

这既是用户看到的「改一处漏一处」的直接原因，也是同一信息在两条路径上出现**内容差异**（备注一处有一处无）的根源。

## 方案

**先抽组件，再改样式**（把顺序倒过来就不会再漏）：

1. 新增 `components/TripCard.tsx`，导出两个东西：
   - `TripCard`：行程条目的唯一实现，`variant: "full" | "compact"` 只控制**密度**（容器/标题档/是否显示分段明细），不控制语言；
   - `MileageReading`：里程**读数原子**（墨色 + 650 + 等宽数字；缺里程时琥珀文字）——把 0014 的写法从视图里搬进原子，以后任何地方要显示里程读数都用它，胶囊不会偷偷回来。
2. 记录页改用 `<TripCard />`（`full`，删掉文件内的 `renderTrip` 与随之无用的导入）；填报页当日记录改用 `<TripCard variant="compact" />`。
3. 顺带对齐两处的内容：`compact` 也显示备注（此前只有 `full` 显示）——这是上面那张表里的一项既有漂移，与本次目标同源，已一并消除；`compact` 仍不显示分段明细（紧凑行只做速览，明细在记录页）。
4. 规则上锁：`AGENTS.md` 增一条「行程条目只有 `TripCard` 一处实现，视图里不得再内联写一份；同一模式出现在两处时先抽组件再改」；`DESIGN.md` 增「行程卡（Signature Component · 两种密度）」一节。

## 实施（改动文件）

| 文件 | 改动 |
| --- | --- |
| `apps/web/src/components/TripCard.tsx` | 新增：`TripCard`（两密度）+ `MileageReading`（读数原子） |
| `apps/web/src/views/RecordsView.tsx` | 用 `TripCard` 替换文件内 `renderTrip`；清理不再使用的导入（`DeleteOutlined` / `EditOutlined` / `chainText` / `Card` / `CardContent`） |
| `apps/web/src/views/EntryView.tsx` | 当日记录改用 `<TripCard variant="compact" />`；清理不再使用的 `Chip` 导入 |
| `AGENTS.md` | 新增「行程卡只有一处实现」规则 |
| `apps/web/DESIGN.md` | 新增「行程卡（Signature Component · 两种密度）」一节 |
| `docs/architecture/0001` | components 清单补 `TripCard` |
| `docs/README.md`、`CHANGELOG.md` | 索引与版本记录 |

## 执行验证记录

- 执行环境：Windows 10.0.26300；`wrangler dev`（8787，与生产同形态）；测试账号 `qa761118`
- 验证方式与实际输出：

| 检查 | 方式 | 实际结果 |
| --- | --- | --- |
| 两页同源 | 读 DOM（两页各取前若干条） | 填报页当日记录与记录页卡片都由同一个组件渲染；结构、按钮、读数写法一致 ✓ |
| 读数不再是胶囊 | 读 DOM / 计算样式 | 两页的卡片内 `.MuiChip-root`：无里程胶囊，只剩「导入」标记（`[]` / `["导入"]`）✓ |
| 读数写法 | 计算样式 | 记录页 `25 公里 @rgb(27,34,49) w650 16px`；填报页 `25 公里 @rgb(27,34,49) w650 14px`（密度不同、语言相同）✓ |
| 缺里程状态 | 计算样式 | 两页均为「未填里程 @rgb(138,86,6) w650」（深色下为 `rgb(240,185,92)`）✓ |
| 密度差异仍在 | 读 DOM | `compact` 无分段明细行 ✓；`full` 有（`圣润 → 天九 25`）✓ |
| 备注对齐（本次顺带消除的漂移） | 读 DOM | 填报页当日记录现在也显示备注（`21 公里 | 导入 | 客户走访`）✓ |
| 静态检查 / 构建 | `bun run check`、`bun run build:web` | 通过；入口 chunk 638.79 kB（重构后 RecordsView 分块 6.16 → 4.83 kB） |
| 控制台 | `tab.errors()` | 0 条错误 |

- 验证结论：里程读数与行程卡现在只有一处实现，填报页与记录页同时生效；两处的差异收敛为「密度」一项（明文写在组件注释与 DESIGN.md 里），备注漂移已消除。
- 已知限制：
  1. `compact` 现在会显示备注（此前不显示）——这是有意对齐的信息，不是新增字段；若不希望填报页出现备注，把组件里的 `trip.note` 一项按 `variant` 关掉即可（一处）。
  2. 汇总页的聚合行（月份/路线/分段/节点）是另一种信息形态，仍用 `StatsView` 的 `DisplayRow` 渲染，未并入 `TripCard`（它们渲染的不是 `Trip`）。
  3. `.impeccable/design.json` 侧车未重新生成（组件清单未含 `TripCard`），需要时跑 `/impeccable document`。

## 后续验证建议

1. 以后若出现第三处行程列表（例如管理页看某人的行程），直接用 `TripCard`；需要新密度就加 `variant`，不要复制 JSX。
2. 里程读数要出现在别处（例如总里程卡）时，优先复用 `MileageReading`，避免又出现胶囊。