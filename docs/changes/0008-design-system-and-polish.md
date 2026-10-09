# 0008 设计系统文档化与 polish 收口（0.5.1）

- 状态：已执行
- 影响范围：`apps/web`（主题令牌、四个视图的局部样式）；新增设计系统文档
- 前置文档：[0006-entry-rules-nav-and-picker.md](0006-entry-rules-nav-and-picker.md)、[0007-user-management.md](0007-user-management.md)
- 生效版本：0.5.1

## 背景

用户在本项目上依次跑了 impeccable 的 `document`（沉淀设计系统）与 `polish`（上线前终检）。`polish` 的独立巡检在代码与真实渲染两侧都发现了「与设计系统不一致」的问题——全部集中在 **MUI 默认小字号**与**残留覆盖项**上，另有一处键盘焦点缺失。

审计（`audit`）在同一轮渲染里取证，结论见交付说明（0.5.1 的修复由 polish 落地）。

## 方案

- **新增 `apps/web/DESIGN.md`**（DESIGN.md 规范：YAML frontmatter 令牌 + 八节正文）与 `apps/web/.impeccable/design.json`（schemaVersion 2 侧车：色阶、阴影、动效、断点、8 个可渲染组件、叙事）。北星「路口台账 The Route Ledger」，主色命名「国道蓝」，控件气质「克制精确」，深度立场「扁平为主，阴影只给浮层」，明确反例「营销页那套不要」。
- **14px 地板落到主题层**（此前只是视图级约定）：
  - `MuiInputLabel`：静止 16px、收缩 14px（MUI 收缩态是 `16px × scale(0.75)` = 12px）；
  - `MuiFormHelperText` 13px → 14px；`MuiChip.label` 13px（`size="small"` 时 12px）→ 14px；`caption` 13px → 14px；
  - MUI X 日期弹层：overline 13.7px 与星期标签 12px → 14px（同时挂 `popper` 与 `dialog` 两个插槽，窄屏走 dialog 变体）。
- **删除重复与死代码**：三个视图里各自维护的 `CHIP_FONT_SX` 全部删除（值已进主题）；删除 0.5.0 移除底部导航后遗留的 `MuiBottomNavigation` / `MuiBottomNavigationAction` 主题覆盖。
- **键盘焦点可见**：`MuiButtonBase` 统一 `&.Mui-focusVisible` 为 2px 主色描边（`outline-offset: 2`）；节点芯片的删除控件（可 Tab 到的自定义控件）补同款焦点环。
- **管理页表格**：表头 `white-space: nowrap`（「行程数」「合计里程」在窄屏会被拆行），行程数与合计里程右对齐并启用等宽数字。

## 实施（改动文件清单）

| 文件 | 变更 |
| --- | --- |
| `apps/web/DESIGN.md`（新增） | 设计系统：令牌 frontmatter + Overview/Colors/Typography/Layout/Elevation/Shapes/Components/Do's and Don'ts |
| `apps/web/.impeccable/design.json`（新增） | 设计系统侧车（色阶/阴影/动效/断点/组件片段/叙事） |
| `apps/web/src/theme.ts` | 14px 地板四项 + 键盘焦点环；删除底部导航死覆盖 |
| `apps/web/src/views/EntryView.tsx` | `PICKER_TEXT_SX`（弹层文字 14px，popper/dialog 双挂） |
| `apps/web/src/views/AdminView.tsx` | `HEAD_SX` / `NUM_SX`；删除 `CHIP_FONT_SX` |
| `apps/web/src/views/AccountView.tsx`、`RecordsView.tsx` | 删除 `CHIP_FONT_SX`（含误留注释） |
| `AGENTS.md`、`docs/README.md`、`CHANGELOG.md` | 记录设计系统位置与本次变更 |

## 执行验证记录

### 执行环境

Windows 10 / bun 1.4.2 / wrangler 4.148.0；本地单 Worker `wrangler dev --port 8790`；浏览器 iPhone 12 设备模拟（390×844）与桌面 1280×900，浅色与深色。

### 验证命令与实际输出

| 验证 | 手段 | 实际输出 |
| --- | --- | --- |
| 类型与构建 | `tsc -p apps/web` + `bun run build:web` | rc=0；`✓ built` |
| 可见文字 14px 地板 | 遍历叶子元素过滤「自身可见且祖先不含 hidden」 | 入口页 0 处、日期弹层 0 处、管理页 0 处；收缩标签实测 16px→14px（`transform: matrix(1,0,0,1,14,-9)` 置 1）；早期报告的三处 12px 经核实是 `legend` 内的**隐藏 notch 占位**（假阳性） |
| 键盘焦点环 | Tab 到标题栏按钮 | `outline: 2px solid rgb(30, 79, 203)` |
| 作用域对比度 | 账号页次要文字 / 深色状态芯片 / 行内文字按钮 | 5.85:1（14px）、8.97:1（深色「正常」芯片）、4.53:1（浅色「重置密码」） |
| 表格与触摸 | 手机 390 | 表头 7 列不折行、行按钮实测 44px、表格滚动 780/356（设计如此） |
| 状态覆盖 | 拦截 `GET /api/admin/users` 返回 500 | 错误态「请求失败（HTTP 500）」+「重试」；`role=dialog` 的确认框有 `aria-labelledby`（指向「重置密码」）、初始焦点在框内、Esc 可关 |
| 语义 | 账号页 / 管理页 | 登录设备是真实 `<ul>`（1 个列表、重排按钮 aria 形如「登出该设备：Chrome · Windows」）；管理页 7 个 `<th>`、行按钮全部带 aria-label |
| 桌面 | 1280×900 深色 | 顶栏四分组内联、无侧栏、填报双列、保存按钮在表单内、页脚 v0.5.1、无横向溢出、0 控制台错误 |
| 检测器 | `impeccable detect --json src public` | `[]`（0 命中） |

### 验证结论

设计系统已文档化并在代码层落定（令牌即规范）；polish 发现的问题全部修复且有实测证据；可见文字满足自定的 14px 地板、键盘焦点可见、残留覆盖项清理完毕；`audit` 在本轮渲染上给出 19/20（Excellent），两条 P2 已登记为后续动作。

### 已知限制

- `DESIGN.md` 的组件片段（侧车）是**渲染用快照**，与 `theme.ts` 需人工保持一致；改主题时同步侧车。
- 管理页表格在手机上仍需横向滚动（780px 最小宽度），最右「操作」列需要横划可见（P2）。
- 账号页会话接口返回 401 时只呈现错误态，不会把整个应用切回登录页（P2）。
- `PRODUCT.md` 已与 0.5.0 之后的实际规则脱节（仍写「分段可选」「总里程可独立填写」「严格 CSP 无内联样式」），本次按 impeccable 规则**只报告不擅自改写**。

## 后续验证建议

1. 用真机确认日期弹层的 dialog 变体在手势与安全区下的表现（本轮只覆盖 Chromium 设备模拟）。
2. 下一轮 `/impeccable adapt`（管理页表格手机形态）与 `/impeccable harden`（账号页 401）落地后，再跑一次 `/impeccable audit` 对比分数。
3. 想刷新产品上下文时跑 `/impeccable init`，把 `PRODUCT.md` 更新到 0.5.x 的真实规则。
