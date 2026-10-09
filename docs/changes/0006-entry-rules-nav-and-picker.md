# 0006 填报规则收紧、导航并入标题栏、日期控件与文案清理

- 状态：已执行
- 影响范围：`apps/web` 全部界面；填报表单规则；`apps/web/public/_headers` 无变化
- 前置文档：[0004-mui-frontend-migration.md](0004-mui-frontend-migration.md)（0004 的审计修复在本批继续落实）
- 生效版本：0.5.0（未发布时为 0.4.0 之后的第一个版本）

## 背景

用户提出四项界面/规则调整：

1. 界面里存在「无用的废话说明」——典型是页脚的「数据存于你的 Cloudflare 账号（Workers + D1 + KV）」。
2. 节点公里需要**反向智能推导**：若历史有「家 → 圣润 = 25」，填「圣润 → 家」应自动得出 25。
3. 分段里程不要「点选按钮 + 次数」这种交互，而要**默认带出历史值、可改**；且**每段必填**，否则不允许保存。（这条覆盖了最初「只填总里程也行」的规则。）
4. 日期选择器改用 **`@mui/x-date-pickers`** 组件化实现。

随后追加：左侧分组导航与移动端底部导航合并进**标题栏**，移动端不要让分组出现在下方。

## 方案

- **填报表单模型简化**：`EntryForm` 去掉 `total` / `totalManual` / `suggestedTotal`，只保留 `date` / `nodes` / `legs` / `note` / `editingId`；总里程由 `formTotalKm()` 从分段合计得出（任一段无效即返回 `null`）。
- **历史默认值**：`withLegDefaults()` 在新增节点、删除节点、整链填入、载入编辑四条路径上补齐空白分段——同方向历史优先，其次**反方向**（`suggestLegKm()` 不再区分方向、不再返回「反向」标记）；用户手填的值不覆盖。
- **必填校验**：`formKmIssues()` 区分 `missingLegIndexes`（空白）与 `invalidLegIndexes`（不合规）；顶部保存按钮与底部固定条都走 `handleSaveClick()`，没填齐就就地高亮「必填」并弹提示，不发送请求。
- **去掉点选与手动总里程**：删除每段的「历史 X 公里」按钮与次数、历史路线横幅（「沿用这条 / 已走 N 次」）、「手动填写 / 自动合计」芯片与「按分段合计」按钮、差额告警；「常用路线」改为整链填入并按历史补齐分段（`withChainApplied()`）。
- **日期控件**：`LocalizationProvider`（`AdapterDayjs` + `adapterLocale="zh-cn"` + `zhCN` localeText）包裹应用，`EntryView` 用 `<DatePicker format="YYYY/MM/DD">`，保留「前一天 / 后一天 / 今天」按钮。
- **导航**：`TopBar` 内联 `Tabs`（填报/记录/汇总/导入），删除 `NavTabs.tsx`（左侧竖排导航与底部 `BottomNavigation` 一并移除）；App 去掉 flex 侧栏容器；`app.css` 与 `EntryView`/`Toasts` 的底部避让高度改为「保存条 + 安全区」。
- **文案清理**：页脚只留版本号；删掉登录页产品说明句（脚注保留「在这台设备上保持登录」）；删掉节点输入框的键盘提示与候选里的「用过 N 次」；统计页空态去掉操作指引；空态/错误态保留可操作信息。
- 顺带把 `ToastMessage.kind` 从 `info | error` 放宽到 `success | info | warning | error`（MUI Alert 原生支持），供新视图复用。

## 实施（改动文件清单）

| 文件 | 变更 |
| --- | --- |
| `apps/web/src/lib/entry.ts` | 表单模型简化；新增 `withLegDefaults` / `withChainApplied` / `formTotalKm`；`formKmIssues` 区分 blank 与 invalid；`tripToForm` 接收索引并补齐空白分段 |
| `apps/web/src/lib/suggest.ts` | `suggestLegKm` 同方向优先、反方向同值，去掉 `reversed` 字段 |
| `apps/web/src/lib/draft.ts` | 草稿结构去掉 total/totalManual；旧草稿仍可加载 |
| `apps/web/src/views/EntryView.tsx` | 分段卡片（必填、错误提示、无点选按钮）、总里程只读合计、`DatePicker`、保存拦截、文案与布局调整 |
| `apps/web/src/components/TopBar.tsx` | 品牌 + 内联 `Tabs` + 账号菜单（新增「账号」「管理」入口） |
| `apps/web/src/components/NavTabs.tsx` | **删除** |
| `apps/web/src/App.tsx` | 去掉侧栏容器；`tabTitle` 复用 `TAB_ITEMS`；页脚文案；保存拦截提示；登录后补拉 `/api/me` 取 `isAdmin` |
| `apps/web/src/components/Toasts.tsx`、`src/types.ts` | 轻提示支持四种严重级别 |
| `apps/web/src/main.tsx` | `LocalizationProvider`（dayjs + zh-cn + 中文 localeText） |
| `apps/web/vite.config.ts`、`package.json`、`bun.lock` | 新增依赖 `@mui/x-date-pickers@9.15.0`、`dayjs@1.11.23` |
| `apps/web/src/app.css` | 底部避让改为固定保存条高度 |
| `apps/web/src/views/AuthScreen.tsx`、`StatsView.tsx` | 文案清理 |
| `AGENTS.md` | 前端 UI 规则补充：导航在标题栏、日期统一用 x-date-pickers、文案只写可操作信息 |

## 执行验证记录

### 执行环境

Windows 10 / bun 1.4.2 / wrangler 4.148.0；本地单 Worker `wrangler dev --port 8790`（本地 D1/KV + `env.ASSETS`）；浏览器 iPhone 12 设备模拟（390×844）。

### 验证命令与实际输出

| 验证 | 手段 | 实际输出 |
| --- | --- | --- |
| 类型与版本 | `bun run check` | 三份 tsc 通过；`✓ 版本一致：0.5.0` |
| 构建 | `bun run build:web` | `✓ built`；主包 530.33 kB（gzip 165.35 kB），账号/管理视图为懒加载分块 |
| 反向推导 | 先加「家→圣润」再加「圣润→家」 | 两次分段输入框都是 `25`；总里程都显示 `25 公里` |
| 必填拦截 | 清空一段后点保存 | toast「还有 1 段里程没填，补齐后才能保存」；该段显示「必填」；总里程区显示「补齐分段后自动合计」；未发起请求 |
| 补齐保存 | 填入 25 后保存 | toast「已保存：2026年10月9日 · 25 公里」；API 落库 `圣润→家:25`（total=leg=25） |
| 日期控件 | 点开日期 | 弹层为中文（「十月 2026」+ 一二三四五六日），`dayjs` 适配器生效；关掉后表单日期不变 |
| 导航形态 | 移动端 390×844 | 底部导航 DOM 不存在；`.MuiAppBar` 内含 4 个 `role=tab`（填报/记录/汇总/导入），顶部高度 53px |
| 页脚文案 | 读取 `.tt-footer` | `途迹 TripTrace v0.5.0`（无 Cloudflare/存储说明） |
| 控制台 | 三张页面巡查 | 0 错误 |

### 验证结论

四项要求全部落地并有实测证据；「每段必填」在 UI 与 API 两层都成立（UI 拦截 + `formToPayload` 只发有效分段合计）；旧数据（只有总里程的记录）展示不受影响。

### 已知限制

- 依赖新增使主包从 458 kB 升到 530 kB（gzip 141→165 kB）：`@mui/x-date-pickers` 与 dayjs 在填报视图主路径上，未做懒加载（懒加载会造成首屏交互等待）。
- 旧记录（只有总里程、没有分段）在编辑时必须补齐分段才能保存；这是规则收紧的直接结果。
- SSR 无法覆盖交互（对话框、日期弹层手势、移动端表格滚动），交互均在真实浏览器中验证。

## 后续验证建议

1. 真机确认日期弹层在 iOS Safari 的手势与安全区表现。
2. 观察一段时间后，评估是否把「只填总里程」作为导入专用路径保留（当前导入仍支持只有总里程的文本）。
