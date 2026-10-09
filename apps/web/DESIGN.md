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
  icon: "8px"
  button: "10px"
  input: "12px"
  card: "14px"
  dialog: "16px"
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
    rounded: "{rounded.button}"
    padding: "0 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.highway-blue-deep}"
  button-outlined:
    backgroundColor: "transparent"
    textColor: "{colors.highway-blue}"
    rounded: "{rounded.button}"
    padding: "0 16px"
    height: "40px"
  chip-node:
    backgroundColor: "transparent"
    textColor: "{colors.highway-blue}"
    rounded: "{rounded.pill}"
    height: "36px"
  card-outlined:
    backgroundColor: "{colors.paper-white}"
    rounded: "{rounded.card}"
    padding: "{spacing.lg}"
  input-outlined:
    backgroundColor: "transparent"
    rounded: "{rounded.input}"
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

## Layout

移动优先的单列结构，桌面只是变宽而不是重排语义。

- **容器**：页面 `maxWidth 1240`，水平内边距 16px（`px: 2`）；卡片之间 12px（Stack `spacing: 1.5`），卡片内边距 14px。
- **导航**：四个分组（填报 / 记录 / 汇总 / 导入）内联在顶部标题栏，移动端与桌面端同形态；账号与管理员入口放在标题栏的账号菜单里。
- **录入顺序**：日期 → 路线节点（链式芯片 + 输入）→ 分段里程（每段必填）→ 总里程（只读合计）→ 备注 → 保存。
- **断点**：默认单列；≥900px 内容居中、密度提高、保存按钮回到表单内；≥1180px 填报页两列（表单 + 常用路线/当日记录），汇总页两列。
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

圆角随「层的大小」递增，形成一致的形式语言：**品牌图标 8px**（26px 图标 ≈ 31%，接近系统图标的超椭圆比例，是品牌资产的固定处理）→ 按钮 10px → 输入/提示 12px → 卡片 14px → 对话框 16px；胶囊（默认里程芯片、进度条）用 999px 全圆。所有边界都是 1px 实线（`rule-slate` / `night-rule`），输入框描边对比度 ≥3:1（浅 4.55:1 / 深 3.87:1）。不用虚线、不用双层边框、不用锐角。

## Components

### Buttons
- **Shape:** 圆角 10px，`minHeight 40px`（`pointer: coarse` 下 44px），横向内边距 16px，无阴影（`disableElevation`），文案 15px/600。
- **Primary:** 国道蓝底 + 白字（4.53:1）；悬停/按下走 `primary.dark`。
- **Outlined / Ghost:** 透明底 + 国道蓝字，用于次级动作（「修改密码」「取消」）；危险动作用 `error` 色文字按钮（「删除」）。
- **States:** 禁用时降低不透明度而非改成灰色；加载中文案替换为「保存中…」。

### Chips
- **Style:** 胶囊形（999px），`36px` 高（coarse 44px），描边或软底；节点链上的芯片用「国道蓝描边 + 蓝字」。
- **State:** 已选/未选通过底色与描边区分；删除图标把可点区域从约 20px 放大到约 38px（删一个节点不可逆，不能让它难按）。

### Cards / Containers
- **Corner Style:** 14px。
- **Background:** 纸白 / 夜色纸；软色块只用于卡片内部的选中行。
- **Border:** 1px `rule-slate`；不使用阴影。
- **Internal Padding:** 14px（`CardContent` 上下一致）。

### Inputs / Fields
- **Style:** outlined、48px 高、圆角 12px、1px 描边；标签常驻（不靠 placeholder 充当标签）。
- **Focus:** 描边转为国道蓝（MUI 默认 2px），不使用发光/阴影。
- **Error:** 描边与 helperText 转 `error`，文案指出现状与后果（「必填」「还有 1 段里程没填」）。

### Navigation
- **Style:** 标题栏内联 `Tabs`，48px 高、15px/600 文案，选中项用国道蓝指示条；移动端不做底部导航，分组不离开标题栏。
- **Account menu:** 标题栏右侧 ⋯ 菜单承载「账号 / 管理（仅管理员）/ 修改密码 / 导出数据（JSON）/ 退出登录」。

### 保存条（Signature Component）
- **Shape:** 贴底整宽，上边界 1px 分居线 + elevation 8，内部 14px 内边距并让出 `env(safe-area-inset-bottom)`。
- **Content:** 左「总里程 + 合计数字」（数字 1.125rem/等宽），右「保存」主按钮（48px 高）。
- **Behavior:** 只在移动端出现；总里程未凑齐时显示 `—`，点击保存给出缺口数量而不是静默失败。

### Toasts / Dialogs
- **Toast:** 底部居中 Snackbar，位置抬到保存条之上；用四档语义色（成功/信息/警示/错误），错误停留 6s 且带可操作动作（「撤销」「重试」）。
- **Dialog:** 圆角 16px，只用于需要确认或受保护输入的操作（删除、重置密码、恢复草稿），打开时焦点进入对话框、Esc 关闭。

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
