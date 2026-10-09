---
name: 途迹 TripTrace
description: 出差行程的节点链与里程台账 —— 手机单手录入，桌面核对汇总
colors:
  highway-blue: "#2F6DF6"
  highway-blue-deep: "#1E4FCB"
  highway-blue-soft: "#E8EFFF"
  highway-blue-night: "#8AB4FF"
  highway-blue-night-soft: "#1C2740"
  paper-white: "#FFFFFF"
  page-slate: "#F4F6FB"
  ink: "#1B2231"
  ink-muted: "#5C6579"
  rule-slate: "#D7DEEA"
  night-paper: "#171B24"
  night-page: "#0F1218"
  night-ink: "#E9EDF6"
  night-ink-muted: "#A8B2C6"
  night-rule: "#2A3242"
  alert-red: "#B3261E"
  alert-red-soft: "#FDECEA"
  caution-amber: "#8A5606"
  caution-amber-soft: "#F7EDDD"
  confirm-green: "#0F7A57"
  confirm-green-soft: "#E4F5EE"
  notice-blue: "#0B6BCB"
  notice-blue-soft: "#E7F0FB"
typography:
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Hiragino Sans GB, Microsoft YaHei, Noto Sans SC, Roboto, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 700
    lineHeight: 1.3
  headline:
    fontSize: "1.125rem"
    fontWeight: 650
    lineHeight: 1.35
  section:
    fontSize: "1rem"
    fontWeight: 650
    lineHeight: 1.4
  body:
    fontSize: "1rem"
    lineHeight: 1.6
  label:
    fontSize: "0.875rem"
    lineHeight: 1.55
  caption:
    fontSize: "0.8125rem"
    lineHeight: 1.45
  button:
    fontSize: "0.9375rem"
    fontWeight: 600
rounded:
  icon: "10px"
  inner: "12px"
  control: "14px"
  field: "16px"
  content: "20px"
  floating: "22px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "14px"
  xl: "16px"
  section: "24px"
components:
  button-primary:
    backgroundColor: "{colors.highway-blue}"
    textColor: "{colors.paper-white}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.highway-blue-deep}"
  button-outlined:
    backgroundColor: "transparent"
    textColor: "{colors.highway-blue}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "40px"
  chip-node:
    backgroundColor: "transparent"
    textColor: "{colors.highway-blue}"
    rounded: "{rounded.pill}"
    height: "36px"
  card-outlined:
    backgroundColor: "{colors.paper-white}"
    rounded: "{rounded.content}"
    padding: "{spacing.lg}"
  input-outlined:
    backgroundColor: "transparent"
    rounded: "{rounded.field}"
    height: "48px"
  nav-tab:
    textColor: "{colors.ink-muted}"
    typography: "{typography.button}"
    height: "48px"
  save-bar:
    backgroundColor: "{colors.paper-white}"
    padding: "{spacing.lg}"
---

# Design System: 途迹 TripTrace

## Overview

**Creative North Star: "路口台账"（The Route Ledger）**

这是把「跑客户的路书」和「记账本」叠在一起的东西：一条节点链就是一趟路，一串数字就是这趟路的账。设计不为表达服务，为**在厂区、车间、客户楼下用一只手把这一笔记完**服务——字要大、对比要高、主操作要落在拇指够得到的地方。

视觉语言是克制的：页面底色是冷灰（浅色 `#F4F6FB` / 深色 `#0F1218`），内容放纸白卡片上，卡片用 1px 描边而不是阴影分层，唯一的彩色是「国道蓝」。颜色不是装饰，是状态：蓝＝可操作与选中，绿＝已保存，琥珀＝缺东西，红＝危险或出错。

语气务实清晰、微微冷：界面文案动词开头、直白说明（「添加节点」「保存」「补齐分段后自动合计」），不解释实现、不劝进、不寒暄。

**Key Characteristics:**
- 单手可完成全流程：加节点 → 分段（默认带出历史值）→ 保存，保存条常驻拇指区。
- 一屏一个主任务：卡片按「日期 → 节点 → 分段 → 总里程 → 备注」的录入顺序纵向排列。
- 浅色/深色两套令牌同源，全部走主题；组件里不出现裸色值。
- 数字是读数：里程一律等宽数字（`tabular-nums`）右对齐，千分位不跳动。
- 空白态只写一句现状（「还没有节点」「这一年还没有记录」），不写操作指导。

## Colors

冷调、低刺激的实用palette：中性灰承担全部布局，蓝色只标记「可操作 / 已选中」，四个状态色只在状态出现时出现。

### Primary
- **国道蓝 Highway Blue**（浅色 `#2F6DF6` / 深色 `#8AB4FF`）：主按钮、标签页指示条、选中态、链接、焦点环。深色模式下它是亮蓝，配深墨字（`#0B0F16`）而不是白字。
- **国道蓝·深 Highway Blue Deep**（浅色 `#1E4FCB`）：按钮按下态，以及软底上的文字。
- **国道蓝·软 Highway Blue Soft**（浅色 `#E8EFFF` / 深色 `#1C2740`）：选中项底色、轻量强调块。

### Neutral
- **纸白 Paper White**（`#FFFFFF`）· **夜色纸 Night Paper**（`#171B24`）：卡片与浮层表面。
- **页灰 Page Slate**（`#F4F6FB`）· **夜色页 Night Page**（`#0F1218`）：页面底色，与纸面形成唯一的分层。
- **墨 Ink**（`#1B2231`，对纸白 15.9:1）· **夜色墨 Night Ink**（`#E9EDF6`，14.7:1）：正文与标题。
- **次级墨 Muted Ink**（`#5C6579`，5.85:1）· **夜色次级墨**（`#A8B2C6`，8.08:1）：说明、单位、次要信息——**仍然 ≥4.5:1**，因为它要承载真实信息（日期、里程单位）。
- **分界灰 Rule Slate**（`#D7DEEA` / `#2A3242`）：1px 分隔线与卡片描边。

### State（状态色只表达状态）
- **警告红 Alert Red**（`#B3261E` / 深色 `#FF8A85`）：错误、删除、危险操作确认。
- **提醒琥珀 Caution Amber**（`#8A5606` / 深色 `#F0B95C`）：缺失项（如「未填里程」）、需要注意但不阻断。
- **确认绿 Confirm Green**（`#0F7A57` / 深色 `#5FD3A3`）：已保存、操作成功。
- **信息蓝 Notice Blue**（`#0B6BCB` / 深色 `#7CC0FF`）：中性提示、历史数据说明。

### Named Rules
**The One Voice Rule.** 一屏里国道蓝只出现在「能点的东西」和「当前选中」上，占比不超过约 10%；它的稀缺就是它的含义。
**The State-Only Rule.** 红/琥珀/绿永远只在真实状态上出现（保存成功、里程缺失、删除确认），不用来表示层级、分类或装饰。

## Typography

**Body / Display Font:** 系统字体栈（`-apple-system` → `PingFang SC` / `Microsoft YaHei` → `Roboto`），不加载网络字体。
**Character:** 读数是主角：数字必须清晰、稳、不跳；中文用系统字体保证在手机与桌面上都与操作系统同调，代价是没有品牌字样——这是刻意的取舍（零字体加载成本，正文即时可读）。

### Hierarchy
- **Title**（700，1.375rem / 1.3）：页面级标题与全站唯一的 `h1`（品牌「途迹」）。
- **Headline**（650，1.125rem / 1.35）：卡片主标题，如「路线节点（按顺序添加）」。
- **Section**（650，1rem / 1.4）：卡片内小节标题（「分段里程」「总里程」「常用路线」）。
- **Body**（400，1rem / 1.6）：节点名、备注、表单内容。
- **Label**（400–600，0.875rem / 1.55）：说明文字、里程单位、日期、按钮大号文案。
- **Caption**（400，0.8125rem / 1.45）：页脚版本号这类极次要信息。

### Named Rules
**The 14px Floor Rule.** 界面文字不得小于 0.875rem（14px）。MUI 默认的 Chip（13px）与 helperText（13px）都不合格，必须抬到 `body2` 档——户外光线下小字等于不存在。
**The Tabular Numerals Rule.** 一切里程、数量、日期时间用 `font-variant-numeric: tabular-nums`；数字在刷新时不得左右跳动。
**The Reading-Not-Pill Rule.** 里程这类**读数**用文字承担：墨色（`text.primary`）+ 650 + 等宽数字，跟汇总页的行读数同一套写法；**不要用蓝色胶囊**把读数包起来——蓝色只表示「可操作 / 已选中」，胶囊留给标签与筛选。只有真的出状态时才用状态色（如「未填里程」用琥珀文字），并把状态写出来。

## Layout

移动优先的单列结构，桌面只是变宽而不是重排语义。

- **容器**：页面 `maxWidth 1240`，水平内边距 16px（`px: 2`）；卡片之间 12px（Stack `spacing: 1.5`），卡片内边距 14px。
- **导航**：四个分组（填报 / 记录 / 汇总 / 导入）内联在顶部标题栏，移动端与桌面端同形态；账号与管理员入口放在标题栏的账号菜单里。
- **录入顺序**：日期 → 路线节点（链式芯片 + 输入）→ 分段里程（每段必填）→ 总里程（只读合计）→ 备注 → 保存。
- **断点**：默认单列；≥900px 内容居中、密度提高、保存按钮回到表单内；≥1180px 填报页两列（表单 + 常用路线/当日记录）。汇总与记录**保持单列**（查询条件在上、结果在下）——宽屏把结果列表拉宽比并排更好扫。
- **移动端固定层**：填报页底部常驻「总里程 + 保存」条（`position: fixed`，含 `env(safe-area-inset-bottom)`），内容区为其预留 96px。
- **节奏**：组内 4–8px，组间 12–16px，标题上方留白大于下方。

## Elevation & Depth

**扁平为主，阴影只给浮层。** 分层靠色调与 1px 描边：页面底色 → 纸白卡片（`rule-slate` 描边）→ 软色块（`*-soft`）。阴影不是装饰手段，只用于「真的浮在内容之上」的层：底部固定保存条（MUI elevation 8）、Snackbar 提示、对话框遮罩。卡片在任何状态下都不带阴影。

### Shadow Vocabulary
- **固定层**（`elevation 8`）：底部保存条——它必须与滚动内容明确分离，因为它始终在拇指下。
- **浮层**（MUI Snackbar / Dialog 默认）：提示与确认对话框，靠遮罩建立层级，不额外加自定义阴影。

### Named Rules
**The Flat-By-Default Rule.** 静止状态没有阴影；阴影只回答一个问题：「这一层是否浮在内容之上？」

## Shapes

圆角是一条**语言**，不是一串数值：**曲率一致，而不是半径相等**。半径随「层的大小」递增，但整站共享同一条曲线族。

### Shape Tokens（`apps/web/src/theme.ts` 的 `radius`）

| 令牌 | 值 | 用在哪 |
| --- | --- | --- |
| `icon` | 10px | 品牌图标（26 / 30px 的小方块，约 38%） |
| `inner` | 12px | 嵌在浮层里的项（菜单项、自动完成选项）；提示气泡 Tooltip 用 10px |
| `control` | 14px | 按钮、图标按钮、列表行、卡片里的软色块行、节点行、分段行、ToggleButton |
| `field` | 16px | 输入框、Alert、Snackbar、Skeleton |
| `content` | 20px | 卡片、表格容器（AdminView 的用户表） |
| `floating` | 22px | 对话框、菜单 / Popover / 自动完成纸面（浮层的 `paper`） |
| `pill` | 999px | 芯片、进度条（真胶囊，保持真圆） |

**档位是按「感知半径」定的**：超椭圆曲线下同半径的角看起来比圆弧更小（Apple 的连续圆角要放大 1.2–1.5 倍才与圆弧等感），所以这组值比「纯圆弧时代」的常用值大一档——按钮 14/40px ≈ 35%、字段 16/48px ≈ 33%，与 iOS 连续圆角的区间相符。

**嵌套规则：** 内层不超过外层；**贴边**（inset ≈ 0）时内层必须 ≤ 外层，否则它的圆角会探出外层的曲线——菜单项与自动完成选项取「外层 − 内边距」的同心值（浮层 22 − 内边距 10 = **12**），所以菜单列表与自动完成纸面有 10px 内边距。留有足够内边距（≥ 外层半径的约一半）时按各自的层级取值即可，不必小于外层：节点行（14）里的输入框（16）就是这样，实测不探出。整宽 chrome（顶部导航、底部保存条）**不吃圆角**，保持直角贴边。

**两个坑（都实测踩过）：**
1. `sx` 里的 `borderRadius: <number>` 会被 MUI 乘上 `shape.borderRadius`（`borderRadius: 2` = 24px）。视图里一律用字符串令牌（`radius.control`），theme 的 `styleOverrides` 里才用数字。
2. **不要广谱覆盖 `MuiPaper.root`**：它的选择器（`.MuiPaper-root.MuiPaper-rounded`）比 `MuiCard.root` 多一个类，会把卡片从 14px 顶成 16px，也会盖掉 `square` 纸面（底部保存条一度变成 16px 圆角浮条）。浮层圆角要**逐组件**声明在 `MuiDialog / MuiMenu / MuiPopover / MuiDrawer / MuiAutocomplete` 的 `paper` 上；以后新增浮层记得点一下 `radius.floating`。整宽 chrome 保持直角。

### 连续曲率（continuous curvature）

`border-radius` 画的是**圆弧**：弧与直边之间只有 G1 接续；Apple 那种连续曲率是**超椭圆**（G2）。所以本项目的做法是两层：

- **半径与层级**（上面那张表 + 嵌套规则）：所有浏览器一致，这是形状语言的主体。
- **曲线**（增强层）：在 `MuiCssBaseline` 里用一条 `@supports (corner-shape: squircle)` 规则把全站的角换成超椭圆——`corner-shape: squircle` 即 `superellipse(2)`（曲线 x²ᴷ + y²ᴷ = 1，K=2；K 越大越方，K=2.5 更接近 Apple 的五次超椭圆）。**一处声明覆盖全站**（含 MUI 内部结构与以后新增的组件），组件不必各写一份。CSS 的边框、外轮廓、阴影、背景、`overflow` 会跟随角形，所以描边与焦点环自动同形。
- **例外保持真圆**：芯片（999px）、进度条、头像、删除图标标记为 `corner-shape: round`——超椭圆会把胶囊的端帽改形，Apple 也保留正圆头像与胶囊芯片。
- **支持面（MDN BCD 实测）**：Chrome / Edge **139+** 已支持；Safari 与 Firefox 目前仅在预览版（Technology Preview）里。因此这是**纯增强**：不支持的浏览器继续画圆弧，半径、层级、布局、状态完全一致；本项目支持基线（Chrome ≥117 / Safari ≥17）不变。在这套 8–16px 的半径下，两者的差别很细微——曲率语言主要由层级与半径差承载，超椭圆是收尾那一层。
- **没有采用的做法**：用 SVG 蒙版/`clip-path` 画每尺寸的超椭圆——蒙版会随元素尺寸拉伸而改变圆角几何，要按尺寸逐个生成才正确，且会裁掉阴影与焦点环；属于不可维护的一类，已放弃。

## Components

### Buttons
- **Shape:** 圆角 14px，`minHeight 40px`（`pointer: coarse` 下 44px），横向内边距 16px，无阴影（`disableElevation`），文案 15px/600。
- **Primary:** 国道蓝底 + 白字（4.53:1）；悬停/按下走 `primary.dark`。
- **Outlined / Ghost:** 透明底 + 国道蓝字，用于次级动作（「修改密码」「取消」）；危险动作用 `error` 色文字按钮（「删除」）。
- **States:** 禁用时降低不透明度而非改成灰色；加载中文案替换为「保存中…」。

### Chips
- **Style:** 胶囊形（999px），`36px` 高（coarse 44px），描边或软底；节点链上的芯片用「国道蓝描边 + 蓝字」。
- **State:** 已选/未选通过底色与描边区分；删除图标把可点区域从约 20px 放大到约 38px（删一个节点不可逆，不能让它难按）。

### Cards / Containers
- **Corner Style:** 20px。
- **Background:** 纸白 / 夜色纸；软色块只用于卡片内部的选中行。
- **Border:** 1px `rule-slate`；不使用阴影。
- **Internal Padding:** 14px（`CardContent` 上下一致）。

### Inputs / Fields
- **Style:** outlined、48px 高、圆角 16px、1px 描边；标签常驻（不靠 placeholder 充当标签）。
- **Focus:** 描边转为国道蓝（MUI 默认 2px），不使用发光/阴影。
- **Error:** 描边与 helperText 转 `error`，文案指出现状与后果（「必填」「还有 1 段里程没填」）。
- **日期字段（只读显示）：** 日期只选不敲（`readOnly` + 整块可点打开选择器），字段宽度贴合日期（约 132px）、日期在框内**居中**、等宽数字；不使用右侧图标按钮——装饰性图标在这种「显示型」字段里是冗余，位置让给读数本身。

### 路线节点编辑区（可改名 + 拖动排序）
- **Shape:** 每个节点一行：`拖动手柄` + `站号` + `行内输入框` + `移除`；行底色软色块（`action.hover`）、圆角 14px、行内 8px 内边距，行间 8px。站号是等宽数字的次要读数（`text.secondary`），输入框占满剩余宽度（长中文节点名不截断）。
- **Drag:** 拖动**只挂在手柄上**（dnd-kit 的 listeners 只给手柄那个 IconButton）——点进输入框改名永远不会误触发拖动；手柄用 `@mui/icons-material` 的拖动手柄图标，`cursor: grab/grabbing`，触屏 `touch-action: none`（否则一拖页面就跟着滚）。拖动中：原行降到 40% 透明、其余行自动让位（放置位置反馈），被拿起的那一行以**浮层**跟随手指（纸白底 + 主色描边 + `elevation 8`——只有真的浮在内容之上的层才用阴影）。
- **Keyboard:** 手柄可 Tab 聚焦；空格/回车拿起 → 上下方向键移动 → 空格/回车放下，Esc 取消；朗读文案是中文（「已拿起节点「家」，当前第 1 站。」/「…放到了第 2 站，路线与分段已按新顺序重算。」），不使用 dnd-kit 的英文默认。
- **Order is the route:** 顺序是路线的唯一依据；**改名、增删、拖动之后分段与总里程立刻按新顺序重算**。里程跟着「端点对」走（同一条路往返同值，不分方向）：仍然相邻的端点对保留原里程，新出现的相邻对留空再由历史默认值补齐——不会把某个数字留在它没填过的路段上。
- **Empty:** 无节点时只写一句现状 + 示例（「还没有节点，例如：家 → 圣润 → 天九」）。

### Navigation
- **Style:** 标题栏内联 `Tabs`，48px 高、15px/600 文案，选中项用国道蓝指示条；移动端不做底部导航，分组不离开标题栏。
- **Account menu:** 标题栏右侧 ⋯ 菜单承载「账号 / 管理（仅管理员）/ 修改密码 / 导出数据（JSON）/ 退出登录」。

### 查询条件（胶囊组 + 时间范围）
- **Style:** 单选组用**胶囊**（`components/PillGroup.tsx`，MUI `Chip` clickable）：高 36px（coarse 44px）、999px 圆角、14px/600 文案，横向可换行——窄屏不出现横向滚动；选中＝国道蓝软底 + 主色描边 + 主色深色字，未选＝透明底 + `text.secondary` 描边与文字（描边 ≥3:1，是**控件边界**而不是装饰线）；选中用 `aria-pressed` 表达，容器 `role="group"` 且带组名。
- **Groups:** 时间范围（本月 / 本年 / 去年 / 全部 / 自定义）· 统计维度（按月份 / 按路线 / 按分段 / 按节点）· 排序（按维度变化：按里程 / 按次数 / 按合计 / 按行程）· 里程（全部 / 只看未填里程）· 排序（最新在前 / 里程从高到低）。每行左侧用 14px `text.secondary` 小标签起头（维度 / 排序 / 里程），标签常驻，不靠 placeholder 承担。
- **自定义范围:** 选中「自定义」后就地展开两个 `DateField`（起始 / 至 / 截止），不弹对话框。
- **共用:** 汇总页与记录页共用同一个 `components/RangeControl.tsx`；加范围能力就改它，不要两页各写一份（口径必须同源）。

### 查询结果（行列表 / 降序榜单）
- **行列表（汇总页）:** 一行 = 标签 + 主读数（右对齐、等宽数字）+ 一行右对齐的次要读数（次数 / 单次 / 合计 / 最近日期）；月度维度在标签下多一条占比进度条。整行可点（`ListItemButton`，`aria-label` 写「…：查看明细」）→ 带着该行条件跳到记录页；标签可换行、读数不换行，长副标题不得挤压标签列（读数与副标题右缘对齐）。
- **降序榜单（记录页「里程从高到低」）:** 这时**不再按月/日分组**——分组会把排序藏起来；改成一条榜单，每条自带日期头。
- **空态:** 只写现状（「这一范围还没有记录」）；有记录但被条件筛空时给「清空条件」这一条出路。
- **摘要行:** 结果上方一行写「范围 · 共 N 条 · 合计 X 公里」，有缺里程时补「· N 条未填里程」——汇总页读数带与它必须对得上（同一个 `lib/query.ts`）。

### 保存条（Signature Component）
- **Shape:** 贴底整宽，上边界 1px 分居线 + elevation 8，内部 14px 内边距并让出 `env(safe-area-inset-bottom)`。
- **Content:** 左「总里程 + 合计数字」（数字 1.125rem/等宽），右「保存」主按钮（48px 高）。
- **Behavior:** 只在移动端出现；总里程未凑齐时显示 `—`，点击保存给出缺口数量而不是静默失败。

### Toasts / Dialogs
- **Toast:** 底部居中 Snackbar，位置抬到保存条之上；用四档语义色（成功/信息/警示/错误），错误停留 6s 且带可操作动作（「撤销」「重试」）。
- **Dialog:** 圆角 22px，只用于需要确认或受保护输入的操作（删除、重置密码、恢复草稿），打开时焦点进入对话框、Esc 关闭。

## Do's and Don'ts

### Do:
- **Do** 一切颜色、圆角、间距走主题令牌（`apps/web/src/theme.ts`），组件里只写令牌路径。
- **Do** 里程、数量、日期时间用 `tabular-nums`，字号不低于 0.875rem。
- **Do** 移动端关键操作（加节点、填里程、保存）放在拇指区，`pointer: coarse` 下命中区 ≥44px。
- **Do** 状态色只在状态上出现，并配套真实文案（「已保存：10月9日 · 25 公里」）。
- **Do** 空白态只写一句现状；错误态必须给出可操作出路（「重试」「补齐后才能保存」）。

### Don't:
- **Don't** 使用大色块英雄区、渐变文字、装饰性玻璃模糊、悬浮卡片阵——这套反例已被用户明确否决。
- **Don't** 用红/琥珀/绿表示分类或层级（状态色只表示状态）。
- **Don't** 给卡片加阴影，或用阴影建立层级（层级靠色调与描边）。
- **Don't** 用小于 14px 的字号承载信息，也不要用灰色把次要信息压到 4.5:1 以下。
- **Don't** 在界面里写实现细节（存储、框架、部署）或用户已知的解释性句子。
