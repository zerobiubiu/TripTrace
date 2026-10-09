# 0012 路线节点：就地改名 + dnd-kit 拖动排序（0.9.0）

- 状态：已执行
- 影响范围：`apps/web`（表单节点模型、节点编辑区、依赖新增）、`AGENTS.md`（一条实现规则）、文档
- 前置文档：[0006-entry-rules-nav-and-picker.md](0006-entry-rules-nav-and-picker.md)（分段必填与反向推导）、[0010-nav-records-nodes-avatar.md](0010-nav-records-nodes-avatar.md)（已回退，其「每段一行 + 拖动」思路与本篇无关：那版把**分段**做成行，本版做的是**节点**行）
- 生效版本：0.9.0
- 不涉及：接口、数据库、部署拓扑（表单结构变化只在内存与 `localStorage` 草稿里）

## 背景

用户提出：

1. 自定义时间范围为什么用两个选择框而不是 Date Range Picker 组件？
2. 用 dnd-kit 改进路线节点编辑区：节点可编辑、顺序可拖动调整，并**严格按照当前节点排列顺序**计算路线；新增/删除/编辑/重排后节点列表与计算结果保持一致；不要用数组下标当节点身份；结合现有设计系统做手柄、编辑态、拖动中态、放置反馈与窄屏适配。

改造前的现状（先取证再动手）：

- `EntryForm.nodes: string[]`，`legs: string[]` 与节点**按下标耦合**（`legs[i]` = `nodes[i] → nodes[i+1]`）。
- 节点只能「加 / 删」，**不能改名**（想改要删掉重加，重加会丢掉已经算好的分段）；渲染用 `key={`${name}-${index}`}`，即**下标参与身份**。
- `withNodeRemoved` 用 `legs.splice(nodeIndex, 1)` 删段：删中间节点时，**前一段的里程会被留在一个它没填过的相邻对上**（本次实测复现：家→圣润→天九 删 圣润 后显示 家→天九 = 25，正确答案应是留空/按历史补 12）。
- 无任何排序能力。

### 关于 Date Range Picker 的答复（写进 PRODUCT.md 约束）

免费包 `@mui/x-date-pickers@9.15.0` **没有 range 组件**：安装目录里没有任何 `*Range*` 导出，`DateRangePicker` 只出现在 CHANGELOG 与类型注释的上下文里，实际组件属于 `@mui/x-date-pickers-pro`（npm 上标注 “The Pro plan edition”，商业许可）。所以「两个只读日期字段」是免费包下的等价做法，且与既有「日期只选不敲、框内居中、等宽数字」的字段语言一致，不引入第二套日期交互。要换成真正的 Range Picker 需要引入 Pro 许可——留给用户决定。

## 方案

### 节点身份：id 而不是下标

- `EntryForm.nodes` 改为 `NodeDraft[] = { id, name }[]`，`newNodeId()` 用 `crypto.randomUUID()`（无 crypto 时退化）。
- 增删/改名/拖动**全部按 id 定位**：`withNodeAdded` / `withNodeRenamed` / `withNodeRemoved(form, nodeId, index)` / `withNodeMoved(form, nodeId, toIndex, index)`。
- React 渲染键与 dnd-kit 的 items 都用 id，拖动重排不再让身份错位。

### 顺序即路线：一条重建规则

新增 `legsForNodes(nodes, previousNodes, previousLegs)`：按新顺序遍历相邻对，**仍然相邻的端点对**（同一条路往返同值，所以按无序对比较）按出现先后取用原值，**新出现的相邻对留空**，随后统一交给既有的 `withLegDefaults` 用历史默认值补齐。新增 / 删除 / 拖动三种结构变化都走这一条规则，所以：

- 不该留的不会留：删掉中间节点后，前一段 25 不会跑到 家→天九 上（实测改为留空/按历史补 12）。
- 该跟的会跟：拖动后 圣润↔家 的 37 会跟着**这一对端点**走到新下标上。
- 拖动只改结构：`withNodeMoved` 只重排 + 重建分段，`withNodeRenamed` 不动任何里程。

### 编辑区（`components/NodeEditor.tsx`）

- 每个节点一行：`拖动手柄` + `站号` + `行内输入框` + `移除`（行底色软块、圆角 12px、8px 行距；站号等宽数字）。
- dnd-kit：`PointerSensor`（`activationConstraint.distance = 4`，轻触不误拖）+ `KeyboardSensor`（`sortableKeyboardCoordinates`）+ `closestCenter` + `restrictToVerticalAxis` / `restrictToParentElement`；**listeners 只挂在手柄那个 IconButton 上**，所以输入框里编辑永远不触发拖动；触屏手柄 `touch-action: none`。
- 反馈：拖动中原行 40% 透明、其余行让位（放置位置提示）、被拿起的那一行走 `DragOverlay` 浮层（纸白底 + 主色描边 + `elevation 8`——只有真的浮在内容之上的层用阴影）。
- 无障碍：手柄带 `aria-label="拖动排序：第 N 站 …"`，dnd-kit 的 `aria-roledescription`/`aria-describedby` 原样保留；**朗读文案改为中文**（自定义 `announcements` 与 `screenReaderInstructions`），键盘路径为 空格/回车拿起 → 方向键移动 → 空格/回车放下、Esc 取消。
- 空态与提示保留既有语气：无节点时「还没有节点，例如：家 → 圣润 → 天九」；有节点时「拖左侧手柄调整顺序；改动顺序会立刻重算分段与总里程。」
- 保存前置检查补一条：**空节点名**（就地改名可能出现空名）——「第 2 站还没填节点名」，不再靠 `filter(Boolean)` 静默丢节点（那会让节点与分段错位）。

### 草稿格式不变

`StoredDraft.nodes` 仍是**名字数组**：id 只存在于内存，落盘不写 id，旧草稿不用迁移，磁盘格式不随实现变化。

## 实施（改动文件）

| 文件 | 改动 |
| --- | --- |
| `apps/web/package.json` | 新增 `@dnd-kit/core` `^6.3.1`、`@dnd-kit/sortable` `^10.0.0`、`@dnd-kit/modifiers` `^9.0.0`、`@dnd-kit/utilities` `^3.2.2`（均 MIT） |
| `apps/web/src/lib/entry.ts` | `NodeDraft` + `newNodeId` + `nodeNames`；四个节点操作改为按 id；新增 `legsForNodes` 统一重建规则；`withNodeMoved`；`formNodeNameIssues`；`formToPayload` 不再 `filter(Boolean)` |
| `apps/web/src/lib/draft.ts` | 落盘取名字数组、读回生成新 id（格式不变） |
| `apps/web/src/components/NodeEditor.tsx` | 新增：DndContext + SortableContext + 行 + DragOverlay + 中文朗读 |
| `apps/web/src/views/EntryView.tsx` | 芯片链 → NodeEditor；`lastNode` 取名字；分段行读 `nodes[i].name`；保存前拦空节点名；「撤销上一个」按 id |
| `AGENTS.md` | 新增规则：节点认 id 不认下标；结构变化走 `legsForNodes`；拖动激活器只能是手柄 |
| `apps/web/DESIGN.md` | 新增「路线节点编辑区（可改名 + 拖动排序）」一节 |
| `apps/web/PRODUCT.md` | 填报能力更新；新增 dnd-kit 与「不用 Range Picker」两条技术与许可约束 |
| `docs/architecture/0001` | 前端结构与节点模型；体积条目（首屏闭包 800 kB）与 dnd-kit 依赖 |

## 执行验证记录

- 执行环境：Windows 10.0.26300；`wrangler dev`（8787，与生产同形态）；本地 D1 中测试账号 `qa761118` 已有 17 条可核算数据
- 验证命令与实际输出：

| 检查 | 操作 | 实测结果 |
| --- | --- | --- |
| 静态检查 / 构建 | `bun run check`、`bun run build:web` | 通过；入口 chunk 636.52 kB、**首屏闭包 799.43 kB**（0.8.0 为 747.77，差 ~52 kB 即 dnd-kit） |
| 行内改名 | 建链 家→圣润→天九，改第 2 站 家 → 家里 | 节点名变为「家里」，分段标签跟着变成 `圣润 → 家里`、`家里 → 天九`，**里程 25 / 37 原样保留** |
| 鼠标拖动 | 拖第 1 站手柄到第 3 站之后 | 顺序变 `圣润 / 天九 / 家`；分段重建为 `圣润→天九 = 12`（保留）、`天九→家 = (空)`（新相邻对，无历史）；总里程由 37 → **—**（不再拿旧数凑） |
| 键盘排序 | 聚焦第 3 站手柄：空格 → ↑ → 空格 | 顺序变 `圣润 / 家 / 天九`；`圣润→家 = 25`（历史默认值补上）、`家→天九 = 37`（**37 跟着端点对从 天九⇄家 走到 家⇄天九**）；live region 朗读「节点「家」移到第 3 站。」 |
| 删除中间节点 | 建链 家→圣润→天九（25 / 12）后删 圣润 | 分段只剩 `家 → 天九 = (空)`——**修复了改造前会显示 25 的错位**（该端点对无历史，故留空） |
| 删除后历史补齐 | 拖动/改名后删除 家里 | 新相邻对 `圣润 ⇄ 天九` 无原值 → 按历史补 **12** |
| 撤销上一个 / 清空 | 点两次 | 分别回到 `[家]`（无分段）与空态文案「还没有节点，例如：家 → 圣润 → 天九」 |
| 常用路线一键填入 | 点「圣润 → 天九 25 公里」 | 生成 2 行节点，分段带出 25，总里程 25 |
| 编辑已有行程 | 当日记录「编辑」→ 表单载入 → 保存修改 | 保存按钮文案为「保存修改」；条数 **18 → 18**（改而不增） |
| 落库正确性 | 上述流程保存后读 `/api/trips` | 落库 `nodes: ["圣润","天九"]`、`legs: [{圣润→天九, km:25}]`、`totalKm: 25`——与界面顺序、分段完全一致 |
| 其他页面回归 | 记录 / 汇总 / 导入 逐页打开 | 控制台 **0** 错误 |
| 排版 | 390px 移动、1280px 桌面、深色 | 拖动浮层跟随手指且下方行让位；放置后站号重排；无横向溢出（`scrollWidth == innerWidth`）；深色令牌整体翻转正常；移除键收敛为 `text.secondary` |
| 无障碍 | 读 DOM | 手柄：`role="button"` + `tabindex=0` + `aria-label="拖动排序：第 N 站 …"` + `aria-roledescription="sortable"` + `aria-describedby`；行内输入 `aria-label="第 N 站的节点名称"`；分段输入 `aria-label="A 到 B 的里程"` |

- 验证结论：六条功能要求与五条验收标准逐条实测通过；里程归属规则（端点对）在**改名、拖动、删除**三条路径上一致且不会错位；草稿格式未变（旧草稿仍可恢复）；其他视图无回归。
- 已知限制：
  1. 首屏闭包从 748 → 799 kB（+52 kB，dnd-kit 必须在首屏——节点编辑区就在填报页；懒加载会给主任务加一次等待，得不偿失）。
  2. 真机长按拖动与页面滚动的冲突只在 Chromium 触屏模拟下验证过；手柄已设 `touch-action: none` 且键盘路径可兜底。
  3. 同名节点重复出现时，里程按「端点对」依次对应；若同一对路在一条链里出现两次且两侧里程不同，重排后按出现先后配对（顺序稳定但可能与用户直觉的某一次不同）。
  4. Range Picker 仍是待用户决定项（引入 MUI X Pro 许可）；当前用两个只读日期字段。

## 后续验证建议

1. 真机（iOS Safari / Android Chrome）走一遍：长按手柄拖动、拖动时页面不跟着滚、键盘排序（带外接键盘）。