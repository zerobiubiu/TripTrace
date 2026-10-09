# 0018 polish 终检与部署（`/impeccable init` + `/impeccable polish`）

- **状态**：已执行
- **版本**：0.11.1
- **日期**：2026-10-10
- **命令**：`bun run deploy` → `/impeccable init` → `/impeccable polish`
- **影响范围**：`apps/web` 的主题与布局层（`theme.ts`、`app.css`、`views/EntryView.tsx`、`components/Toasts.tsx`）、设计台账（`DESIGN.md`）、产品台账（`PRODUCT.md`）
- **前置文档**：[0017-responsive-forms.md](0017-responsive-forms.md)

## 背景

适配（0.11.0）完成后按顺序执行三件事：部署到线上、用 `init` 刷新产品台账、用 `polish` 做上线前终检。

**部署**：Worker Version ID `83ef9e37-f428-4c7d-b56a-805e7a620bf1`，`APP_VERSION` 0.11.0。部署后发现**首页 HTML 被边缘缓存**（无 `cache-buster` 的请求命中旧外壳、指向 0.10.0 的 chunk），排查确认该 zone（Free 计划）**没有任何缓存规则或 Page Rule**、开发模式关闭，于是按 URL 精确 purge 根路径；复核：首页已指向新 chunk、线上 CSS 含 `.tt-query-grid`、ETag 更新、`/api/me` 回 `version: 0.11.0`。

**init**：PRODUCT.md 已存在，故只刷新陈旧/缺失的事实（不重开已确认字段）：线上实测数据（1 个账号 / 4 条行程 / 232 公里 / 4 个活跃会话，`wrangler d1 execute --remote` 只读查询）、首屏体积（748 kB → **831 kB**，差额来自 0.9–0.10 而非适配）、线上版本与 Version ID；并复核两条「已确认、尚未实现」的方向——用户确认**都保留**、注册策略**保持开放**。

**polish**：读到 2026-10-08 的 critique 快照（P0×1 + P1×7）。该快照以 `apps/web/src/App.tsx` 为 file 目标，指纹已变（`238f6ae5…` → `bbaf4eb3…`）→ 按规则其 backlog 已关闭，**不复用、也不 close**，只作输入；逐条实测确认 8 条全部闭环，包括最后一条「一键覆盖无确认无撤销」——实测「填入常用路线」与「清空」都带 **撤销** 动作（"已填入「家 → 圣润」撤销" / "已清空节点链撤销"）。随后做独立巡检（下述状态矩阵）。

## 方案与实施

只修真缺陷，按**最窄正确层**修，不动无关领域：

| # | 缺陷（证据） | 修法 |
| --- | --- | --- |
| 1 | 状态徽标被撑成圆点：管理页「正常」实测 **44×44**，元素类为 `MuiChip-sizeSmall`、**不可点**（无 `MuiChip-clickable`），却继承全站 `pointer: coarse` → 44px 的规则 | 主题 `MuiChip.root` 把 coarse 高度限定到 **`&.MuiChip-clickable, &.MuiChip-deletable`**——只有可交互胶囊才需要触摸目标；纯状态徽标回到 36px。修后实测 44×36 / 58×36（正经胶囊）。`DESIGN.md` Chips 节同步 |
| 2 | 底部固定条高度没有单一来源：横屏实测条高 **55px**，但填报页让位仍是 **88px**（多留 33px）、提示条仍浮在 **96px**（比条顶高 41px） | 新增 CSS 变量 `--tt-savebar-h`（手机 80px / 矮视口 `max-height: 480px` 时 56px），填报页让位改为 `calc(var(--tt-savebar-h) + 8px + 安全区)`、提示条改为 `calc(var(--tt-savebar-h) + 16px + 安全区)`。修后：横屏 64 / 72，竖屏 88 / 96（不变）。`DESIGN.md` Layout 节记录 |
| 3 | 「日期字段键盘焦点不可见」——**假发现，已更正**：焦点落进日期字段内部 section 时根节点确实带 `Mui-focused`、外框实测 `rgb(47,109,246) 2px`。误判原因是我把 `.MuiOutlinedInput-notchedOutline` 当成它的外框，而 MUI X 的类名是 `MuiPickersOutlinedInput-notchedOutline`（该主题覆盖因此也不会生效——已删除这条死代码） | 不改代码；把这条类名差异写进 `DESIGN.md`，避免下次再误判 |

## 执行验证记录

**执行环境**：Windows 10（10.0.26300）· Chrome 141 自动化（`isMobile/hasTouch` 模拟 coarse 指针，客户端 UA 与设备尺寸）· `bun run dev`（Vite 8.3.3）· `/api/**` 由 puppeteer 请求拦截回放桩数据（含超长节点名与超长备注、缺里程、跨年记录、超长用户名/显示名）。

| 断言 | 结果 |
| --- | --- |
| 日期字段键盘焦点（真实按 Tab：填报 → 更多操作 → 前一天 → 年份） | 第 4 次 Tab 落在 `SPAN:年份`，根节点 `Mui-focused=true`，外框 **rgb(47,109,246) 2px** ✅ |
| 其余可聚焦控件焦点环（14 次 Tab 序列） | 全部 **2px solid rgb(30,79,203)**（`primary.dark`）+ `Mui-focusVisible` ✅；顺序 日期 → 添加节点 → 备注 → 常用路线 → 保存 → 回绕 ✅ |
| 状态徽标（coarse） | 「正常」44×36、「已禁用」58×36 ✅（此前 44×44） |
| 可点胶囊（coarse） | 54×44 / 68×44 ✅（触摸目标保持） |
| 横屏（740×360）让位 / 提示 / 条高 | 64px / 72px / 55px ✅（此前 88 / 96 / 55） |
| 竖屏（390×844）让位 / 提示 / 条高 | 88px / 96px / 80px ✅（无回归） |
| 慢网加载态 | 3 个骨架 + 「正在载入记录…」✅（未把「还没到」断言成「没有」） |
| 空态 | 记录：「共 0 条 · 合计 0 公里」+「还没有行程记录，去「填报」添加第一条吧。」；汇总：「0 项」+「这一范围还没有记录」✅ |
| 错误态 | 「记录暂时读不到，请检查网络后重试。」+ 可点的「重试」✅ |
| 深色模式（1280） | 无横向溢出；查询栏 `rgb(23,27,36)` 与页面 `rgb(15,18,24)` 分层正确 ✅ |
| 控制台错误 | 0 条 ✅ |
| 无横向溢出（320/390/430/740/768/1024/1280/1680 × 四页） | 0 处 ✅ |
| 检测器 `detect`（改动文件） | **`[]`（0 命中）** ✅ |
| `bun run check` | 通过（版本一致 + 三份 tsconfig 无错误）✅ |
| `bun run build:web` | 通过（入口 chunk 648.72 kB，polish 三项合计 +85 字节）✅ |
| 线上（purge 后） | 首页指向 `index-KfcGyBqK.js`、CSS 含 `.tt-query-grid`、`/api/me` → `version: 0.11.0` ✅ |

**截图产物**（`%TEMP%/tt-adapt/`）：`polish-dark-1280-记录.png`、`polish-740x360-填报.png`、`polish-740x360-管理.png`（另有适配轮的 6 张）。

**验证结论**：两处真缺陷已修且有量化前后对照；一处假发现已更正并留下类名依据；8 条历史 critique 发现全部闭环；门禁与检测器全绿。

## 已知限制

- **未在真机验证**：软键盘挤压、iOS/Android 实机字号与触控体验未实测；桌面触屏的 `pointer: coarse` 只有模拟证据。
- 自动化只覆盖 Chromium；支持基线里的 Safari 17 / Firefox 121 未跑。
- 浏览器缩放（200%）未测；深色模式只做目视与令牌核对（对比度沿用 0.4–0.8 轮的实测数据）。
- 状态徽标的 44px 命中区规则依赖 MUI 的 `MuiChip-clickable` / `MuiChip-deletable` 类名；若将来 MUI 大版本改类名，需要回归这条规则（`DESIGN.md` 已写明）。

## 后续验证建议

1. 线上冒烟（0.11.1 部署后）：320/390/768/1024/1440 各看填报页与记录页；横屏手机核对保存条与提示的间距。
2. 真机各一台复核软键盘场景。
3. 下次部署若再遇首页旧外壳，直接用 URL purge（本 zone 无缓存规则，属边缘留存）。