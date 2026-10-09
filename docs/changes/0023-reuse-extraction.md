# 0023 复用模式提取（`/impeccable extract`）

- **状态**：已执行
- **版本**：0.11.5（**patch**：提取本身是等价重构，但顺带修好了空态/错误提示动作按钮 36px → 44px 的命中区，属用户可见变化）
- **日期**：2026-10-10
- **命令**：`/impeccable extract`
- **影响范围**：新增 `apps/web/src/components/Notice.tsx`、`components/FilterRow.tsx`；`theme.ts` 新增导出；迁移 `RecordsView`、`StatsView`、`AccountView`、`AdminView`、`App.tsx`、`ViewErrorBoundary.tsx`
- **前置文档**：[0022-design-ledger-refresh.md](0022-design-ledger-refresh.md)

## 背景

`extract` 的判据是「**同意图且出现 3 次以上**才抽」（明确写了「过早抽象比重复更糟」）。先数，再决定，数出来的结果决定抽与不抽：

| 候选 | 实测出现次数 | 决定 |
| --- | --- | --- |
| `Alert` + 至多一个动作按钮（提示条 + 单一出路） | **7 处**（记录页 ×2、汇总页、账号页、管理页、App ×2、视图错误边界） | **抽** → `Notice.tsx` |
| 「小标签 + 胶囊组」的条件行（`minWidth: 3rem`） | **4 处**（记录页 2、汇总页 2） | **抽** → `FilterRow.tsx` |
| 行内动作按钮的 44px 触摸地板 | **2 处定义 / 14 处使用**（`AccountView`、`AdminView` 各写一份同名常量） | **抽** → `theme.ts` 导出 `touchTargetSx` |
| 桌面判定 `useMediaQuery(theme.breakpoints.up("lg"))` | **2 处** | 不抽（< 3，按规则不动；将来第三处出现时再收成一个 hook） |
| `Suspense fallback={<ViewSkeleton />}` | **5 处** | 不抽——只省三行，却把「加载/错误/已加载」的语义藏进一个包装器，得不偿失（已在此记录理由） |

Toasts 里的 `Alert + action`（撤销）**没有**一起收进 `Notice`：它是浮层里的瞬时反馈，与页面内提示条的意图不同（规则明确说「意图不同的不要硬抽」）。

## 实施

| 文件 | 改动 |
| --- | --- |
| `components/Notice.tsx`（新） | 唯一实现：`severity` + 一句现状 + 至多一个 `action`（`label` / `run` / 可选 `ariaLabel`）；动作按钮自带 `touchTargetSx` |
| `components/FilterRow.tsx`（新） | `label` + 控件；标签列宽 3rem 写在这一处 |
| `theme.ts` | 新增导出 `touchTargetSx = { minHeight: 44 }`（附「MUI size=small 是 36px，低于地板」的依据） |
| `RecordsView` | 2 处提示条 → `Notice`；2 行条件 → `FilterRow`；移除未用的 `Alert` 导入 |
| `StatsView` | 1 处提示条 → `Notice`；2 行条件 → `FilterRow`；移除未用的 `Alert` 导入 |
| `App.tsx` | 2 处读不到数据的提示条 → `Notice`（保留 `Alert`：启动失败屏仍在用） |
| `ViewErrorBoundary` | 兜底卡 → `Notice`；移除 `Alert` / `Button` 导入 |
| `AccountView` / `AdminView` | 各自的加载失败提示条 → `Notice`（`ariaLabel` 原样透传）；删除两份本地 `TOUCH_SX` 与随之孤立的注释；14 处使用改为共享导出 |

台账同步：`DESIGN.md` 在「提示条与单一出路」与「查询条件」两节写明唯一实现（`components/Notice.tsx` / `components/FilterRow.tsx`）；侧车 `alert-info` 条目的描述同步。

## 执行验证记录

**执行环境**：Windows 10（10.0.26300）· Chrome 141（自动化，390×844）· `bun run dev` · `/api/**` 桩数据（空 / 有数据 / 500 / 缺 `sessions`）。

| 断言 | 结果 |
| --- | --- |
| 记录页空态 | 「还没有行程记录。+ 去填报」，动作按钮 **44px** ✅ |
| 汇总页空态 | 同上 ✅；条件行标签为「维度 / 排序」✅ |
| 记录页条件行 | 标签「排序 / 里程」✅；输入不存在的关键词 → 「没有匹配的记录…+ 清空条件」，点它后 **0 个提示条、摘要回到「共 2 条」**✅ |
| 记录页读不到数据（500） | 「记录暂时读不到，请检查网络后重试。+ 重试」，按钮 44px ✅ |
| 视图错误边界（桩数据缺 `sessions`/`users` → 真崩） | 「这一页暂时打不开…+ 重试」，账号页与管理页都走了兜底而不是白屏 ✅ |
| 浏览器报错 | **0 条** ✅ |
| `impeccable detect`（9 个文件） | **`[]` 0 命中** ✅ |
| `bun run check` | 通过（三份 tsconfig 无错误）✅ |
| 生产构建 | 通过；入口 chunk **650.78 → 641.19 kB（−9.6 kB）** ✅ |
| 未用导入 | 记录页 / 汇总页 / 边界已去掉 `Alert`（与 `Button`）；App / 账号 / 管理仍在用故保留 ✅ |

**附带修好的缺陷**：空态与「读不到数据」的提示条动作按钮此前用 MUI `size="small"`（36px），**低于 44px 触摸地板**；现在统一由 `Notice` 施加 `touchTargetSx`，实测 44px。这是本轮唯一的用户可见变化，也是版本递增的原因。

## 已知限制

- **账号页与管理页自身的加载失败提示条**在本轮浏览器取证里没被单独覆盖：桩数据故意让这两页走了兜底卡。它们的 `ariaLabel` 透传只在代码层确认（类型强制 + 一行传递），未做实测。
- 桌面判定仍是 2 处各写一份（`useMediaQuery`）；第三处出现时应收成 `useIsDesktop()`。
- 侧车没有为 `FilterRow` 单独建条（参考明确说「跳过工具型组件，除非视觉上有辨识度」），只在 `Notice` 条目里写了唯一实现。
- 入口 chunk 掉 9.6 kB 是实测结果，未逐项归因（去重后打包器的模块归并变化是原因之一）。

## 后续验证建议

1. 下次出现第三处桌面判定时收成 hook，并顺带核对三处断点是否都写 `lg`。
2. 若管理页将来要加「查看他人行程明细」，新页面的空态/错误态直接用 `Notice`，不要再写 `Alert + Button`。
3. 交接 `/impeccable polish` 做上线前终检。