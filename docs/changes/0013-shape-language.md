# 0013 统一的形状语言：形状令牌 + 连续曲率增强（0.9.1）

- 状态：已执行
- 影响范围：`apps/web/src/theme.ts`（形状令牌、组件覆盖、连续曲率规则）、四个视图/组件里的圆角写法、文档
- 前置文档：[0008-design-system-and-polish.md](0008-design-system-and-polish.md)（设计系统文档化）
- 生效版本：0.9.1
- 不涉及：功能、布局结构、配色、接口、数据库

## 背景

用户要求建立**统一的全局圆角设计语言**：参考 Apple 的连续曲率（continuous curvature）与超椭圆（superellipse）视觉特征，重新审视整站所有带圆角的元素。核心原则是**视觉曲率一致，而不是圆角半径数值一致**；要覆盖卡片、弹窗、输入框、按钮、菜单、Popover、Tooltip、浮层、标签及嵌套容器；检查嵌套圆角、边缘衔接、裁剪、边框、阴影与背景的关系；建立可复用的形状令牌；**不要借机做无关的视觉重设计**；并且**不要将普通 `border-radius` 直接等同于真正的 G2 连续曲率**。

改造前的取证（逐条查过源码）：

- 只有部分组件被显式覆盖：Button 10 / IconButton 10 / Chip 999 / Card 14 / Dialog 16 / Alert 12 / LinearProgress 999 / ListItemButton 10；**基础 `shape.borderRadius` 是 12**。
- **漏掉的**：菜单 / Popover / 自动完成纸面 / Tooltip / Snackbar / 表格容器 / Skeleton / ToggleButtonGroup —— 它们吃 MUI 默认（Paper 4px 等），与卡片 14、对话框 16 明显不属于同一套语言。
- **离群的**：`EntryView` 与 `NodeEditor` 里四处 `borderRadius: 2`——`sx` 会把数字乘上 `shape.borderRadius`，实际是 **24px**，比卡片还圆 ✗。
- **一次性实现**：品牌图标在 `TopBar` 与 `AuthScreen` 各写一遍 `"8px"`。

## 方案

### 1. 形状令牌（`theme.ts` 的 `radius`）

按**层的大小**分七档，视图里只引用令牌，不再出现魔法数字：`icon 10 · inner 12 · control 14 · field 16 · content 20 · floating 22 · pill 999`。

档位按**感知半径**定：超椭圆曲线下同半径的角看起来比圆弧更小（Apple 的连续圆角要放大 1.2–1.5 倍才与圆弧等感），所以比「纯圆弧时代」的常用值整体大一档——首版定的是 8/12/10/12/14/16，按「看着偏小」的反馈上调为现在这组（按钮 14/40px ≈ 35%、字段 16/48px ≈ 33%）。`shape.borderRadius` 兜底值同步为 14。

两部分分开写是有原因的：`sx` 的 `borderRadius: <number>` 会被 MUI 乘上 `shape.borderRadius`，所以**视图用字符串令牌**（`radius.control`），**theme 的 styleOverrides 用数字字面量**（那里不做乘法）。这条坑已写进 DESIGN.md。

### 2. 补齐缺失的层级

- `MuiDialog / MuiMenu / MuiPopover / MuiDrawer / MuiAutocomplete` 的 `paper` → 22（浮层层，**逐组件声明**）。
- `MuiAppBar` → 0（整宽 chrome 不吃圆角）；`MuiTableContainer` → 20（内容层，与卡片同层）。
- `MuiAutocomplete.paper` 顺带 10px 内边距、`.MuiAutocomplete-option` → 12；`MuiMenu.list` → 10px 内边距、`MuiMenuItem` → 12；`MuiTooltip` → 10（小浮层）；`MuiSnackbar` 的纸面 → 16；`MuiSkeleton` → 16；`MuiOutlinedInput.root` → 16；`MuiToggleButton(Group)` → 14。

**为什么不广谱覆盖 `MuiPaper`**（本轮两次迭代的教训）：给 `MuiPaper.root` 写圆角会连带影响所有纸面——先撞上 `square`（底部保存条变成 16px 圆角浮条 ✗），改成 `&.MuiPaper-rounded` 后它的选择器（`.MuiPaper-root.MuiPaper-rounded`）又比 `MuiCard.root` 多一个类，把卡片从 14px 顶成 16px（线上冒烟时抓到登录卡片 16px ✗）。最终做法是**只在真正的浮层组件上逐一声明**，并接受一条约束：以后新增浮层要自己点一下 `radius.floating`。

**嵌套圆角规则**（本轮新立的规则）：内层不超过外层；**贴边**的内层会把圆角探出外层的曲线——菜单项与自动完成选项原先 inset = 0（实测），在 16px 纸面下首/末项会探出，所以给列表/纸面加 8px 内边距，让「纸面 − 内边距 = 项」成立。

### 3. 连续曲率（增强层，不是替代 `border-radius`）

- `border-radius` 画的是**圆弧**（弧与直边只有 G1 接续）；Apple 的连续曲率是**超椭圆**（G2）。所以**没有**把圆角数值改大来“假装”：半径仍由令牌决定。
- 在 `MuiCssBaseline` 里加一条 `@supports (corner-shape: squircle)` 规则，把全站的角换成超椭圆（`squircle` ≡ `superellipse(2)`，曲线 x²ᴷ + y²ᴷ = 1）。**一处声明覆盖全站**（含 MUI 内部结构与以后新增的组件），组件不必各写一份。
- **例外保持真圆**：`.MuiChip-root`、`.MuiChip-deleteIcon`、`.MuiLinearProgress-*`、`.MuiAvatar-root`、`.MuiBadge-badge` 标为 `corner-shape: round`——超椭圆会把胶囊端帽改形，Apple 同样保留正圆头像与胶囊芯片。
- **支持面（MDN BCD 实测）**：Chrome / Edge **139+** 已支持（本地 Chromium 154 实测 `CSS.supports('corner-shape','squircle')` 为真，计算值解析为 `superellipse(2)`）；**Safari 与 Firefox 目前仅在预览版**。因此这是纯增强：不支持的浏览器继续画圆弧，半径、层级、布局、状态完全一致，项目支持基线不变。
- **放弃的做法**：SVG 蒙版 / `clip-path` 逐尺寸生成超椭圆——蒙版随尺寸拉伸会改变圆角几何，正确做法要按每个元素尺寸生成，且会裁掉阴影与焦点环，属不可维护一类。

## 实施（改动文件）

| 文件 | 改动 |
| --- | --- |
| `apps/web/src/theme.ts` | 新增 `radius` 令牌（字符串，供 sx）；补齐 Paper / AppBar / TableContainer / Menu+MenuItem / Autocomplete / Tooltip / Snackbar / Skeleton / OutlinedInput / ToggleButton(Group) 覆盖；新增 `@supports (corner-shape: squircle)` 全局曲线 + 真圆例外 |
| `apps/web/src/views/EntryView.tsx` | 两处 `borderRadius: 2` → `radius.control`；引入令牌 |
| `apps/web/src/components/NodeEditor.tsx` | 节点行与拖动浮层两处 `borderRadius: 2` → `radius.control` |
| `apps/web/src/components/TopBar.tsx` | 品牌图标 `"8px"` → `radius.icon` |
| `apps/web/src/views/AuthScreen.tsx` | 同上 |
| `apps/web/DESIGN.md` | Shapes 整节重写：令牌表、嵌套规则、两个坑、连续曲率与支持面；frontmatter `rounded` 改为令牌名 |
| `docs/architecture/0001` | 形状令牌与 `corner-shape` 支持面 |
| `apps/web/PRODUCT.md` | 技术与浏览器约束补「连续曲率是增强，不改基线」 |

## 执行验证记录

- 执行环境：Windows 10.0.26300；`wrangler dev`（8787，与生产同形态）；本地 Chromium **154**；测试账号 `qa761118`（17 条行程 + 一条 6 节点草稿）；为看管理页表格，临时把该账号加进本地 `.dev.vars` 的 `ADMIN_USERNAMES`，验证完**已恢复原值**（该文件不入库）
- 验证命令与实际输出：

| 检查 | 方式 | 实际结果 |
| --- | --- | --- |
| 静态检查 / 构建 | `bun run check`、`bun run build:web` | 通过；入口 chunk 637.36 kB（+0.8 kB） |
| 令牌生效（计算值） | 读 `getComputedStyle` | 卡片 `20px`、输入框 `16px`、按钮 `14px`、图标按钮 `14px`、**节点行 `14px`（原来是 24px）**、品牌图标 `10px` ✓ |
| 连续曲率生效 | 同一批元素读 `corner-shape` | 全部 `superellipse(2)`（`squircle` 的计算值）✓ |
| 真圆例外 | 芯片 / 进度条 | `999px / superellipse(1)` ✓（保持真胶囊） |
| 浮层 | 账号菜单、自动完成弹层、删除确认对话框、撤销提示条 | 纸面 `22px / superellipse(2)`；对话框 22；提示条 16；菜单项 `12px`、自动完成选项 `12px` ✓ |
| **嵌套圆角** | 菜单 / 自动完成实测 inset | 修前 inset = 0（贴边，首末项圆角会探出纸面曲线）→ 加 10px 内边距后 inset = 10、项 12px、`22 − 10 = 12` 同心 ✓；悬停首项截图确认圆角未探出 ✓；节点行（14）里的输入框（16）因内边距足够（8px）亦不探出 ✓ |
| 档位观感复核 | 按「看着偏小」的反馈上调一版后重测 | 首版 8/12/10/12/14/16 → 上调为 10/12/14/16/20/22；移动 390 与汇总 / 记录页截图复核，卡片、行、输入、芯片的层级关系更饱满且仍分明 ✓ |
| 整宽 chrome | 顶部导航、底部保存条 | 表头 `0px`；保存条 `0px` + 深色下实测 `rgb(23,27,36)` + 12% 白色叠加、文字/按钮配色正确（裁剪截图确认；全页缩略图曾被误判为“浅色条”，以计算值与裁剪图为准）✓ |
| **修法迭代（两处级联）** | `MuiPaper` 广谱覆盖 → `&.MuiPaper-rounded` → 逐组件声明 | 第一次让底部保存条（`square`）变成 16px 圆角浮条；第二次让卡片被顶成 16px（线上冒烟时抓到登录卡片）；最终只在 `Dialog / Menu / Popover / Drawer / Autocomplete` 的 `paper` 上声明 → 复测卡片 **14**、表头 **0**、保存条 **0**、菜单纸面 16 / 项 8 ✓ |
| 表格容器 | 1280px 管理页 | `14px / superellipse(2)`，表头单元格 `0px` ✓ |
| 桌面 / 深色 | 1280 与 390 + `colorScheme: dark` | 各页签排版与令牌均正常，深色整体翻转正确 ✓ |
| 回退面 | 页面内注入 `* { corner-shape: round !important }` | 计算值变 `superellipse(1)`，排版无位移、无破坏——Safari / Firefox 用户看到的就是圆弧版本 ✓（在这套 8–16px 半径下两者差别细微，已如实写进 DESIGN.md） |
| 检测器 | `impeccable detect --json src public` | `[]`（0 命中） |
| 控制台 | 全程 `tab.errors()` | 0 条错误 |

- 验证结论：形状语言在五个页签、移动 / 桌面 / 深色、以及菜单 / 弹层 / 对话框 / 提示条 / 表格等浮层与容器上一致；两处真实缺陷（24px 离群圆角、Paper 覆盖盖掉 `square`）与一处嵌套缺陷（贴边项探出纸面曲线）均已修复并有计算值证据。
- 已知限制：
  1. **Safari 与 Firefox 目前只画圆弧**（`corner-shape` 仅预览版）：曲率语言的主体（半径档位 + 嵌套 + 层级）在所有浏览器一致，超椭圆是收尾那一层；支持基线未变。
  2. `.impeccable/design.json` 侧车里的组件 CSS 仍是字面值（按钮 10 / 字段 12 / 卡片 14 / 芯片 999 与令牌一致，无漂移），但其组件清单尚未加入本轮新增的层级；需要重新生成时跑 `/impeccable document`。
  3. 未采用逐尺寸 SVG 蒙版方案（见方案第 3 节），这两种路径留在文档里备查。

## 后续验证建议

1. 真机（iOS Safari / Android Chrome）各看一眼：iOS 上应是圆弧版本，Android（Chrome 139+）上是超椭圆版本，确认两者都接受。
2. 以后新增带圆角的组件：先查令牌表选层级；贴边的内层记得留出等于半径差的内边距；不要在 `sx` 里写数字圆角。