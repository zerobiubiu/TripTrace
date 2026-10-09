# 0017 多形态适配：手机/平板/桌面三分与断点词汇统一（`/impeccable adapt`）

- **状态**：已执行
- **版本**：0.11.0
- **日期**：2026-10-10
- **命令**：`/impeccable adapt`（web 变体）
- **影响范围**：`apps/web` 的布局层（`app.css`、`theme.ts`、`App.tsx`、`TopBar`、`EntryView`、`AdminView`、`RecordsView`、`StatsView`）与设计台账（`DESIGN.md`、`.impeccable/design.json`）
- **前置文档**：[0001-triptrace-architecture.md](../architecture/0001-triptrace-architecture.md)（响应式布局一节）、[0016-route-editor.md](0016-route-editor.md)

## 背景

`/impeccable adapt` 的规则是：**适配是按下文重新想一遍体验，不是缩放像素**。改造前逐形态实测（Chrome 141 自动化 + 接口桩，见下文证据）暴露的问题：

1. **桌面只「变宽」**：单列结构下横向空间基本闲置；填报页两栏门槛是 `1180px`，`1024–1179` 的笔记本停在单列；记录页与汇总页在任何宽度都是整宽单列，查询条件一滚就看不见。
2. **平板（768–1023）从未定形**：既非手机也非桌面的过渡带，靠 `md(900)` 来回切换，语义不明。
3. **320px 窄屏导航被裁**：顶栏 `Tabs` 内容 208px、可视 182px，最后一个分组「导入」落在横向滚动区外（`scrollButtons` 关闭，只能靠滑动发现）。
4. **移动端底部双份留白**：`.tt-main` 的 96px 与填报页 `.tt-entry-grid` 的 88px 叠加，记录/汇总/导入/账号四页各有 **96px 整块空白**（实测 `bottomPad=96`），填报页则多留一份。
5. **横屏手机**：360px 高的视口里，80px 的固定保存条吃掉 22% 高度，路线编辑区被压。
6. **断点词汇漂移**：JS 用 MUI 默认 `lg=1200`，CSS 用 `1180`，两套数说同一件事（`design.json` 里还存着 `1180`）。

用户在本轮明确选择的目标形态：手机竖屏 320–430、手机横屏、平板 768–1023（**与手机同形，只放宽宽度**）、桌面 1024–1440（**允许两栏/多栏 + 更密读数**）、大屏 ≥1600（内容不被拉散）。

## 方案

**形态三分，一套语义**（信息架构不变，两栏只是把「查询/表单」与「结果/记录」并排）：

| 形态 | 判定 | 版式 |
| --- | --- | --- |
| 手机 / 平板 | `< 1024` | 单列；`768–1023` 与手机同形，只是容器变宽；填报页保留底部固定保存条 |
| 桌面 | `≥ 1024` | 填报页两栏（`1.3fr : 1fr`）；记录/汇总两栏（左查询栏 22rem 吸顶 + 右结果列表）；管理页表格形态 |
| 横屏手机 | 高度 `≤ 480px` | 保存条收成约 56px，把高度让给路线编辑区 |

**断点词汇单一来源**：`theme.breakpoints.values = { xs:0, sm:600, md:900, lg:1024, xl:1536 }`（把 MUI 默认的 `lg=1200` 收到 `1024`），`app.css` 的媒体查询用同一组数——JS 与 CSS 不再各说各话。大屏容器 `≥1024` 收 1240、`≥1536` 放 1320，再宽不放开。

## 实施

| 文件 | 改动 |
| --- | --- |
| `apps/web/src/theme.ts` | 新增 `breakpoints.values`（`lg` 1200 → 1024），并写明理由（与 `app.css` 同源） |
| `apps/web/src/app.css` | `.tt-main` 底部留白 96px → `24px + 安全区`（保存条的空间由填报页自己让）；`.tt-entry-grid` 两栏门槛 1180 → **1024**；新增 `.tt-query-grid` / `.tt-query-rail`（左查询栏吸顶 `top:72px`，其余内容自动落第 2 列）；新增 `.tt-brand-word` 与 `≤359px` 规则 |
| `apps/web/src/App.tsx` | 主容器 `maxWidth: { lg:1240, xl:1320 }`、`px: { xs:2, lg:3 }` |
| `apps/web/src/components/TopBar.tsx` | 品牌文字加 `className="tt-brand-word"`（窄屏由 CSS 收进无障碍树，`h1` 仍在） |
| `apps/web/src/views/EntryView.tsx` | `isDesktop` 判定 `md` → `lg`；保存条在 `≤480px` 高时收紧（隐藏「总里程」小标签、读数降到 16px、`py` 0.5） |
| `apps/web/src/views/AdminView.tsx` | 表格/卡片形态切换 `md` → `lg`（平板沿用卡片形态） |
| `apps/web/src/views/RecordsView.tsx` | 外层 `Stack` → `Box.tt-query-grid`，查询卡加 `tt-query-rail`（两处返回分支都改） |
| `apps/web/src/views/StatsView.tsx` | 同上（查询卡含读数带，因此「读数带与结果列表并排」） |
| `apps/web/DESIGN.md` | Layout 一节重写：形态三分、断点词汇、容器、横屏、窄屏导航；保存条 Behavior 改为「手机/平板形态出现」 |
| `apps/web/.impeccable/design.json` | `extensions.breakpoints` 更新为 sm/md/lg(1024)/xl/容器/短视口/窄屏/coarse |

## 执行验证记录

**执行环境**：Windows 10（10.0.26300）· Chrome 141（自动化，headless，`isMobile/hasTouch` 模拟 coarse 指针）· `bun run dev`（Vite 8.3.3）· `/api/**` 由 puppeteer 请求拦截回放桩数据（14 条行程含 1 条缺里程、1 个超长节点名、3 个用户含 1 个超长用户名/显示名）。

**验证命令/手段**：`bun run check`（tsc + 版本门禁）· `impeccable.cmd detect --json <8 个改动文件>` · 浏览器逐形态实测（每形态遍历 填报/记录/汇总/管理，读 `scrollWidth/clientWidth`、`gridTemplateColumns`、`padding`、`position`、叶子元素最小字号、底部留白）。

| 断言 | 改造前 | 改造后 |
| --- | --- | --- |
| 320px 顶栏分组完整可见 | 208 / 182（末组被裁） | **208 / 208** ✅（品牌文字收进无障碍树） |
| 记录 / 汇总页移动端底部留白 | 96px | **24px** ✅ |
| 填报页移动端底部留白（`.tt-main` + 网格） | 96 + 88 = 184px | **88px**（仅网格让位） ✅ |
| 横屏手机保存条高度 | 80px | **55px** ✅ |
| 1024 填报页列 | 单列 | **544.86px / 419.14px**（两栏）✅ |
| 1024 / 1280 / 1680 记录与汇总 | 整宽单列 | **352px / 612–908px 两栏**，查询栏 `position: sticky` ✅ |
| 横向溢出（320 / 390 / 430 / 740 / 768 / 1024 / 1280 / 1680） | 0 处 | **0 处** ✅ |
| 小于 14px 的可见文字 | 0 处 | **0 处** ✅（含深色模式与 MUI X 弹层） |
| `pointer: coarse` 下 < 44px 的命中区 | 0 处 | **0 处** ✅（细指针下 40px 按钮为桌面刻意密度） |
| 平板 768：形态归属 | 不确定（`md` 边界） | 与手机同形 + 保存条 + 单列（用户选择）✅ |
| 检测器 `detect` | — | **`[]`（0 命中）** ✅ |
| `bun run check` | — | **通过**（版本一致 + 三份 tsconfig 无错误）✅ |

**截图产物**（`%TEMP%/tt-adapt/`）：`320x568-管理.png`、`390x844-填报.png`、`740x360-填报.png`、`1024x768-记录.png`、`1024x768-管理.png`、`1680x1050-汇总.png`；已目视核对 320 管理（图标品牌 + 四分组全可见 + 卡片形态）与 1024 记录（左查询栏 + 右分组列表，查询栏吸顶）。

**验证结论**：五类目标形态全部达到用户选择的要求，且未引入横向溢出与字号/命中区回归；检测器与类型门禁全绿。

## 已知限制

- **未在真机验证**：软键盘挤压可视区（安卓/iOS 实机）与桌面触屏设备的 `pointer: coarse` 表现未实测；`NodeNameField` 的弹层高度上限（`min(264px, 34vh)`）属既有实现，本轮未改。
- 自动化仅覆盖 Chromium；Safari 17 / Firefox 121（支持基线）未跑。
- 横屏紧凑保存条按 **高度** 触发，与宽度无关：极窄又极矮的窗口也会收紧（符合预期，但未逐机型枚举）。
- coarse 指针下 2 字标签的胶囊（`Chip` 44px + 999px 圆角）视觉上接近圆形——是既有令牌组合的结果，本轮未动（建议后续在 `polish` 里单独定夺）。
- `.impeccable/design.json` 的 `generatedAt` 未更新（仅在 `extensions` 内同步了断点），如跑 `/impeccable doctor` 可能提示刷新。

## 后续验证建议

1. `bun run deploy` 后线上冒烟：320/390/768/1024/1440 五档宽度各看填报页与记录页；确认自定义域 `trips.zerobiubiu.top` 下的两栏版式与吸顶查询栏。
2. 真机各一台（iPhone + Android）复核：软键盘弹出时路线编辑区、保存条与候选弹层的相互位置。
3. 交接 `/impeccable polish` 做上线前终检（检测器 + 一轮确认）。