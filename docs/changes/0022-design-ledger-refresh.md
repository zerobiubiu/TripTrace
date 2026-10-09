# 0022 设计台账刷新（`/impeccable document`，refresh 模式）

- **状态**：已执行
- **版本**：**不递增**（纯台账/文档改动：`DESIGN.md` 与 `.impeccable/design.json` 都不改变被发布程序的行为，按项目规则「纯文档 / 注释 / 配置改动不递增版本」）
- **日期**：2026-10-10
- **命令**：`/impeccable document`（web 变体，已存在的 DESIGN.md → 用户选择 **refresh** 模式）
- **影响范围**：`apps/web/DESIGN.md`、`apps/web/.impeccable/design.json`
- **前置文档**：[0021-onboarding-pass.md](0021-onboarding-pass.md)

## 背景

`document` 在 DESIGN.md 已存在时的规则是：**不得静默覆盖**，由用户在 refresh / overwrite / merge 之间选。本轮选 **refresh**：保留此前确认的语气与命名（北星「路口台账」、命名规则、颜色命名），只把本会话改动造成的漂移补齐。

**扫描结论（先取证再动手）**：令牌源头（`apps/web/src/theme.ts`）与 DESIGN.md 的 frontmatter 逐项核对——**23 个颜色、7 档字号、6 档圆角、8 档间距全部一致**，无颜色/字号漂移；漂移集中在三处：

| # | 漂移（实测） | 处理 |
| --- | --- | --- |
| D1 | 代码里 `caption` 已是 **0.875rem**（14px 地板），frontmatter 与正文仍写 `0.8125rem`（13px） | 两处都改到 0.875rem，并在正文注明 13px 写法已废弃 |
| D2 | 本会话新增的**错误兜底**（视图错误边界）没有入册；空态与提示条的「单一出路」也没有落成规则 | 新增 `### 提示条与单一出路（空态 / 错误兜底）` 一节 + **The Plain-Recovery Rule** |
| D3 | 本会话新增的**千位分隔读数**（`12,350.5`）与解析侧的容忍没有落成规则 | 新增 **The Grouped-Reading Rule**（并入 Typography 的命名规则） |
| D4 | 侧车 `colorMeta` 只覆盖 **10 / 23** 个颜色；侧车的 `toast` 组件引用了前端码里不存在的令牌 | `colorMeta` 补齐到 23（OKLCH 同色相 8 级色阶）；frontmatter 补 `toast` 与 `alert-info` 两个令牌 |
| D5 | 侧车的保存条片段是旧值：标签 `0.75rem`（12px，低于地板）、CTA 圆角 10px（与控件档 14px 不符），且没有矮视口规则 | 片段改成 0.875rem / 14px，并补 `@media (max-height: 480px)` |
| D6 | 侧车 `generatedAt` 停留在旧时间戳 | 更新为本次刷新时间 |

## 实施

**DESIGN.md**（八节标题与顺序保持规范：Overview → Colors → Typography → Layout → Elevation & Depth → Shapes → Components → Do's and Don'ts）
- frontmatter：`typography.caption` → 0.875rem；`components` 新增 `alert-info` 与 `toast` 两个令牌（各 ≤8 个属性）。
- Typography：`Caption` 档改值并注明废弃写法；命名规则新增 **The Grouped-Reading Rule**。
- Components：新增「提示条与单一出路（空态 / 错误兜底）」一节（形态、单一出路、错误边界只包视图区、接口边界先兜一层），内含 **The Plain-Recovery Rule**。
- Do's / Don'ts：新增 2 条 Do（读数单一产出 + 解析侧容忍；一条提示最多一个动作）与 1 条 Don't（不暴露错误详情）。

**.impeccable/design.json**（schemaVersion 2，只承载 frontmatter 放不下的东西）
- `extensions.colorMeta`：10 → **23** 项（新增的 13 项按 OKLCH 同色相、亮度 15%→95% 生成 8 级色阶，浅端收色度避免溢色）。
- `extensions.typographyMeta.caption.purpose`：补上「0.875rem，与 body2 同档」。
- `components`：8 → **9**（新增「提示条 + 单一出路 Alert」，自包含 `ds-` 前缀 HTML/CSS、含 `:hover` / `:focus-visible`）；保存条片段按当前实现修正；节点芯片说明补上 coarse 只作用于可交互胶囊。
- `narrative`：`rules` 5 → **7**（新增两条，`section` 分别标 `typography` 与 `components`——沿用「规则落在哪一节就标哪一节」的既有约定）、`dos` 5 → **7**、`donts` 5 → **6**（与 DESIGN.md 逐字一致）。
- `generatedAt` 更新。

## 执行验证记录

**执行环境**：Windows 10（10.0.26300）· Bun 1.4.2（脚本一次性，在 `%TEMP%`，不入库）· 无浏览器改动（本轮不动界面，故不触发检测器）。

| 断言 | 结果 |
| --- | --- |
| frontmatter 颜色数 = 侧车 colorMeta 数 | **23 = 23**，缺失为「无」✅ |
| 侧车每个 `refersTo` 都能在前端码里找到 | 9/9 ✅（修掉了 `toast` 悬引） |
| 八节标题与顺序 | Overview / Colors / Typography / Layout / Elevation & Depth / Shapes / Components / Do's and Don'ts ✅ |
| `caption` 13px 写法 | 仅剩一条「已废弃」的说明性引用 ✅ |
| 侧车 JSON | 合法（Bun 解析通过）、schemaVersion 2 ✅ |
| 保存条片段 | 标签 0.875rem、CTA 圆角 14px、含矮视口规则 ✅ |
| 代码侧门禁 | 本轮未改任何代码，`bun run check` 无需重跑（版本保持 0.11.4）✅ |

**验证结论**：台账与实现重新一致；用户选的 refresh 模式生效——语气与命名未动，只补齐/纠正了有实测证据的漂移点。

## 已知限制

- **色阶是程序生成的近似**：新增的 13 个 `tonalRamp` 由 OKLCH 同色相插值得到，不是设计稿里挑出来的色阶；它们只用于面板色卡条，不参与实现。若将来要做真正的色阶体系，应以设计稿为准。
- `narrative.rules` 的 `section` 取值新增了 `components`（原为 colors / typography / elevation）：schema 里该字段是自由字符串，但若 Stitch 侧有更严的枚举，需要回收成三值。
- 未跑 `impeccable doctor`（会报告台账与版本读取之间的其它漂移）；也未重跑 `document` 的 `overwrite` 全量路径——用户明确选了 refresh。
- 侧车组件仍是 9 个（上限 10）；「管理页表格」「移动端卡片列表」等形态没有单独做成组件条目。

## 后续验证建议

1. 若之后跑 `/impeccable doctor`，重点看它对 `narrative.rules[].section` 与 `generatedAt` 的判定。
2. 做 0.12 级视觉改动时，顺手把这次没入册的形态（管理页双形态、记录页降序榜单）补成侧车组件。
3. 交接 `/impeccable polish` 做上线前终检。