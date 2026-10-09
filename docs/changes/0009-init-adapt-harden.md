# 0009 产品上下文刷新、管理页双形态、会话失效加固与日期只选

- 状态：已执行
- 影响范围：`apps/web`（填报表单的日期控件、管理页、账号页）、产品与设计文档
- 前置文档：[0008-design-system-and-polish.md](0008-design-system-and-polish.md)
- 生效版本：0.6.0

## 背景

用户在本项目上连续跑了 impeccable 的四条流程（`init` → `adapt` → `harden` → `polish`），另外提了一项交互要求：日期框不要只点右侧图标才弹、点整块就弹，且**日期只能选不能敲**。

## 方案

### 1. init（产品上下文刷新）

`PRODUCT.md` 与 0.5.x 实际规则已脱节，按流程问了三处只有用户能定的产品事实，然后重写记录：

- 分段里程**每段必填**、总里程 = 分段合计（替换原先「分段可选、总里程可独立填写」）；
- CSP 已放行 `style-src 'unsafe-inline'`（MUI/emotion 运行时注入），`script-src` 仍严格；
- 已实现清单补齐 0.4–0.5.1 的能力（单 Worker 部署、用户管理、账号自助、导入去重、设计系统文档…）；
- **管理员可见范围**：确认「还要看行程明细」——记为**已确认方向、尚未实现**（需要新接口与页面，不在本轮范围）；
- **注册准入**：确认**保持开放注册**（需要收紧时可设 `SIGNUP_CODE`，无需改代码）；
- **出差台账**（费用/客户/备注）方向仍然有效，字段与口径待定；
- 产品原则第 2 条改写为「每一段都要有数」；无障碍段落补「界面上可见文字不低于 14px」；
- 证据条目更新为实测值（`zerobiubiu`：3 条行程、合计 162 公里，2026-10-09）。
- 新建 `.impeccable/config.json`：`{"buildPath":"code"}`（用户在提问中选定 code-first，只记一次）。

### 2. adapt（管理页双形态）

原形态是 780px 最小宽的表格，在 390px 手机上只能横向滚动，最右「操作」列看不到。改成按断点分形态：**≥900px 保持表格**（表头不折行、数字右对齐），**<900px 换成卡片列表**（用户名 + 状态、显示名 + 当前账号、行程数/合计里程/最近活跃、操作按钮）。两种形态共用同一套操作按钮组件与三个确认对话框，不复制逻辑。

### 3. harden（会话失效）

`AccountView` 新增可选 `onSessionInvalid`：会话列表、改显示名、登出设备三条路径遇到 401 时通知上层；`App` 接上后**整个应用回到登录态**（此前只在该卡片里显示错误，其它区域仍显示已登录）。

### 4. 日期只选不敲（用户要求）

`EntryView` 的日期控件改为受控弹层：**点输入框任意位置**（含标签与留白）即打开选择器，键盘 Enter / 空格 / ↓ 同样打开；输入框 `readOnly`（手机上也不会唤起键盘），无法手敲日期，只能从日历里选。

### 5. polish（收口）

检测器报出两条 advisory：`TopBar`/`AuthScreen` 的品牌图标 `borderRadius: 8px` 不在圆角刻度内。按规则给的路径把 8px 作为 `rounded.icon` 记进 `DESIGN.md`（并写明 26px 图标 ≈31% 的超椭圆处理），检测器随即回到 0 命中 0 建议。

## 实施（改动文件清单）

| 文件 | 变更 |
| --- | --- |
| `apps/web/PRODUCT.md` | 按 init 流程重写（规则、能力清单、角色、证据、原则、无障碍） |
| `apps/web/.impeccable/config.json`（新增） | `buildPath: code` |
| `apps/web/src/views/AdminView.tsx` | 断点分形态：≥md 表格 / <md 卡片列表；抽出共用的行操作组件 `UserActions` 与统一的重置密码入口 |
| `apps/web/src/views/AccountView.tsx` | 新增 `onSessionInvalid?`，三条 401 路径触发（用 ref 保存最新回调，避免父组件重渲染导致重新拉取） |
| `apps/web/src/App.tsx` | 给 `AccountView` 接上 `onSessionInvalid`（回登录态） |
| `apps/web/src/views/EntryView.tsx` | 日期控件：受控 `open` + 整块点击/键盘打开 + `readOnly` 输入 |
| `apps/web/DESIGN.md` | 圆角刻度新增 `icon: 8px` 并写明品牌图标的固定处理 |
| `CHANGELOG.md`、`docs/README.md`、`package.json`、`apps/api/wrangler.jsonc` | 版本 0.6.0 与索引 |

## 执行验证记录

### 执行环境

Windows 10 / bun 1.4.2 / wrangler 4.148.0；本地单 Worker `wrangler dev --port 8790`；浏览器 iPhone 12 设备模拟（390×844）与桌面 1280×900，浅色与深色。

### 验证命令与实际输出

| 验证 | 手段 | 实际输出 |
| --- | --- | --- |
| 类型与构建 | `tsc -p apps/web` / `bun run build:web` | rc=0；`✓ built` |
| 日期只选不敲 | 点输入框**左侧**（非图标） | 选择器打开（`opened: true`）；`readOnly` 为 `true`；敲 `19991231` 后值仍为 `2026/10/09`；点 10 号后值变 `2026/10/10`，确认按钮为「确认」 |
| adapt · 手机 390 | 打开管理页 | 无 `<table>`；`<ul aria-label="用户列表">` + 1 张卡片；无横向溢出（390/390）；卡片内 0 处可见文字 <14px；状态芯片对比度 5.33:1 |
| adapt · 桌面 1280 | 打开管理页 | 表格存在、7 个表头（用户名/显示名/行程数/合计里程/最近活跃/状态/操作）、无卡片；行内「重置密码：split_muzcj95b」，对话框 `aria-labelledby=重置密码`、初始焦点在框内 |
| adapt · SSR 冒烟（子代理） | 临时脚本 | 手机形态 14 项断言全 PASS（卡片、aria-label、当前账号标记、读数、状态 Chip、按钮 aria、min-height 44）；桌面形态 4 项 PASS（表格、7 列、ARIA 一致） |
| harden · 401 | 拦截 `/api/me/sessions` 返回 401（自测确认拦截生效）后打开账号页 | 应用**回到登录页**（出现用户名/密码输入框，账号卡片消失）；控制台 0 错误 |
| polish · 检测器 | `impeccable detect src public` | 记入 `rounded.icon` 前：2 条 `design-system-radius` advisory；记入后：**0 命中 0 建议** |
| polish · 桌面深色 | 截图核对 | 顶栏四分组、双列填报、页脚 v0.6.0（本地构建）、0 控制台错误 |

### 验证结论

四条流程全部落地：产品记录与实现一致（并把两处未实现的方向显式标注）、管理页在手机与桌面各自成为合适的形态、会话失效不再出现「局部报错但整体仍显示已登录」、日期只能选不能敲且整块可点；检测器归零，无回归。

### 已知限制

- `PRODUCT.md` 记录了两条**已确认但未实现**的方向：管理员查看任一用户行程明细、出差台账（费用/客户）。它们不在本轮范围，实现前不要当作现状。
- 管理页手机形态的**真实点击与卡片换行观感**只在 Chromium 设备模拟下验证（无真机）。
- 日期控件改的是回读路径（`readOnly` 输入）：屏幕阅读器会读到「只读」文本框而不是按钮；若后续要做成完全按钮语义，需要自定义渲染。
- 注册仍为开放注册（用户确认）；地址一旦外流，任何人都能建号并消耗 Workers/D1 配额，需要时可设 `SIGNUP_CODE`。

## 后续验证建议

1. 真机（iOS Safari）过一遍日期选择器与手机管理页卡片。
2. 想推进「管理员看行程明细」或「出差台账」时，先 `/impeccable shape <面>` 定范围再实现。
3. 修完上面任一项后跑 `/impeccable audit` 对比分数（当前 AdminView/AccountView 为 19/20）。

## 追加（0.6.1）

用户追加要求：**日期框右侧的日历图标多余，只要一个完整的日期输入框**。实现与验证：

- `slotProps.textField.sx` 内加 `"& .MuiInputAdornment-root": { display: "none" }`——最初试的 `slotProps.textField.slotProps.input.endAdornment = null` 无效，因为 MUI X 会把自带的图标合并进 `endAdornment`，覆盖不住；改为隐藏整个装饰区（该方案不受内部合并顺序影响）。
- 实测：字段内可见按钮 0 个、装饰区 `display: none`、字段宽 168px 完整显示 `2026/10/09`；点字段**右半侧**同样打开选择器（左半侧此前已验证）；键盘 ↓ 仍可打开；0 控制台错误。
- 只影响填报页日期控件，无其它行为变化。
