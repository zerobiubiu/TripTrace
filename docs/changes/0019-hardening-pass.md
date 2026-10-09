# 0019 抗脆弱加固（`/impeccable harden`）

- **状态**：已执行
- **版本**：0.11.2
- **日期**：2026-10-10
- **命令**：`/impeccable harden`（web 变体）
- **影响范围**：`apps/web` 的接口边界（`api.ts`）、应用外壳（`App.tsx`）、格式化（`lib/format.ts`）、记录页行程卡 key、标题栏 Tabs，新增 `components/ViewErrorBoundary.tsx`
- **前置文档**：[0018-polish-pass.md](0018-polish-pass.md)

## 背景

按「设计只在对数据完美成立时可用，就不算生产就绪」的标准做对抗测试，命中一个 tier-1 缺陷与四处次级问题：

| 编号 | 现象（实测） |
| --- | --- |
| H1 | **畸形 API 载荷让整站白屏**：`/api/trips` 回 `date: null` / `nodes: null` / 邻居 `null` 时，`pageerror: TypeError: Cannot read properties of null (reading 'replace')`，`document.querySelectorAll('[role=tab]').length === 0`、`body.innerText === ""`——整棵组件树被卸载，用户没有任何出路 |
| H2 | 即便不白屏，**单条坏记录也没有任何兜底**：服务端返回一条异常记录就会毁掉整页 |
| H3 | 记录页**按月的行程条缺 React key**（控制台 `Each child in a list should have a unique "key"`；「里程从高到低」那条分支有 key，按月分组那条没有） |
| H4 | **里程读数没有千位分隔**：`12435 公里`、`4145 公里`——五位数要数位；i18n 维度里的数字格式问题 |
| H5 | 进入「账号 / 管理」时 MUI 报 `The value provided to the Tabs component is invalid. None of the Tabs' children match with "admin"`——看着像功能出错 |

已确认**不需要修**的部分（实测通过）：10 次连点保存 → 只有 1 个 POST；429 / 断网 / 500 各自给出可读文案且**表单不丢**；`localStorage.setItem` 抛错不影响主流程；导入粘进对抗文本被正确拒绝（「没有解析到可导入的记录，请检查格式」）；备注输入框 16px（不会触发 iOS 聚焦缩放）；服务端已有 `readJsonBody`（声明长度 + 文本长度双闸，512 KiB）。

## 方案与实施

| 编号 | 修法（最窄正确层） |
| --- | --- |
| H1 + H2 | **在接口边界把返回值洗成合法形状**（`api.ts`）：新增 `sanitizeTrip` / `sanitizeTrips` / `sanitizeMe` 与 `requireTrip`。字段类型不对就丢弃这一条（`date` 必须是 `YYYY-MM-DD`、`nodes` 必须是非空字符串数组、里程非有限数记 `null`）；单条行程的响应洗不出来时按失败处理（返回业务错误而不是把坏记录塞进列表，表单因此保留） |
| H1 | **视图错误边界**（新增 `components/ViewErrorBoundary.tsx` + `App.tsx` 接线）：任何一页渲染期抛错只影响这一页，显示可操作的兜底卡（「这一页暂时打不开 + 重试」）；`重试` = 重挂载视图 + 重新拉记录；重挂载键含当前分组（`${tab}-${viewKey}`），所以某页崩了切到别的分组不会被兜底卡粘住 |
| H3 | `RecordsView` 的 `renderTrip` 给 `TripCard` 补 `key={trip.id}` |
| H4 | `formatKm` 改用**模块级** `Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 })`（千位分隔 + 最多两位小数 + 去掉尾随零）；`kmState` 同步容忍千位分隔符与全角逗号（界面上的读数可以复制回输入框）；`normalizeName` / `formatDateLabel` 的入参放宽为 `string \| null \| undefined` 并防御性返回（第二道网） |
| H5 | `TopBar` 的 `Tabs` 只在 value 属于分组导航时传值，其余情况传 `false` |

## 执行验证记录

**执行环境**：Windows 10（10.0.26300）· Chrome 141 自动化（`isMobile/hasTouch` 模拟 coarse 指针）· `bun run dev`（Vite 8.3.3）· `/api/**` 由 puppeteer 请求拦截回放（含畸形载荷、429、请求中断、500、对抗文本）。

| 断言 | 修前 | 修后 |
| --- | --- | --- |
| 畸形 `/api/trips`（`date: null`、`nodes: null`、元素 `null`、`totalKm: "abc"`） | **白屏**：tabs=0、正文空、`TypeError … reading 'replace'` | **tabs=4**、正文正常；坏的两条被丢弃、可救的保留（「共 2 条 · 合计 12,350.5 公里」）✅ |
| 视图渲染期崩溃（`/api/me/sessions` 缺 `sessions` 数组 → `SessionsCard` 抛 `reading 'length'`） | 白屏（同类缺陷） | 账号页显示「这一页暂时打不开 + 重试」，**四个分组导航与其它分组照常可用**，切回记录页正常 ✅（控制台留一条 `[途迹] 视图渲染失败` 排查线索）✅ |
| 记录页 key 警告 | 有 | **消失**（干净运行 `cleanErrors: []`）✅ |
| 里程读数 | `12435 公里` / `4145 公里` | `12,350.5 公里` / `6,175.25 公里`（记录页摘要、汇总读数带、行程卡一致）✅ |
| 进「账号 / 管理」的 Tabs 警告 | 有 | **消失**（`aria-selected=true` 的 tab 数为 0，导航仍显示四个分组）✅ |
| 10 次连点保存 | — | 1 个 POST ✅（保持） |
| 429 / 断网 / 500 | — | 服务端文案透传、断网给「网络不可用，请检查连接后重试」、**表单都保留** ✅ |
| `localStorage.setItem` 抛错 | — | 主流程不受影响、0 报错 ✅ |
| 导入对抗文本（乱码、`1e309`、`----`、emoji、超长链） | — | 正确拒绝并提示检查格式 ✅ |
| 备注输入框字号 / 横向溢出 | — | 16px（不触发 iOS 聚焦缩放）/ 320–1680 八档 0 溢出 ✅ |
| `detect`（6 个改动文件） | — | **`[]` 0 命中** ✅ |
| `bun run check` | — | 通过（三份 tsconfig 无错误）✅ |
| `bun run build:web` | 648.72 kB | **650.76 kB**（+2.0 kB：清洗器 + 错误边界）✅ |

**验证结论**：tier-1 白屏缺陷已闭环且用两次独立实测（畸形数据、真的崩一次）证明；四处次级问题修完并各自有「消失」证据；提交路径、离线、限流、本机存储故障等既有防线经对抗测试确认有效。

## 已知限制

- **`/api/me/sessions` 与 `/api/admin/users` 没有做边界清洗**：这两处靠错误边界兜底（已实测：崩了只影响该页且有重试）。若将来要更细的降级（页面少一行而不是整页兜底），应在这两个端点补同款 `sanitize*`。
- 仍**未在真机验证**（软键盘、iOS/Android 实机），自动化只覆盖 Chromium；Safari 17 / Firefox 121 未跑。
- i18n 边界：界面只有简体中文（无 RTL、无多语言）；千位分隔按 `zh-CN` 固定，将来若支持多语言需随 locale 走。
- 错误边界的兜底文案不含错误详情（避免暴露实现细节）；排查靠控制台日志。

## 后续验证建议

1. 部署（0.11.2）后线上冒烟：登录 → 填报一笔 → 记录 / 汇总 / 账号 / 管理各看一眼；确认控制台无 key / Tabs 警告。
2. 真机复核软键盘与触控（沿用 0017/0018 的遗留项）。
3. 若线上出现「这一页暂时打不开」，按控制台的 `[途迹] 视图渲染失败` 日志定位组件，并按需给对应端点补清洗器。