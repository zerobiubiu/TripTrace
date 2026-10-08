# 0004 前端迁移到 MUI v9（Material Design 3）

- 状态：已执行
- 影响范围：`apps/web` 全部 UI；`apps/api` 批量导入去重口径；部署头 `_headers`
- 前置文档：[0003-pages-workers-split.md](0003-pages-workers-split.md)
- 生效版本：0.3.0

## 背景

0.3.0 拆分后，对移动端主路径做了一轮体验审计（impeccable critique + audit），确认 9 项问题：

| 级别 | 问题 | 证据 |
| --- | --- | --- |
| P0 | 固定操作条在窄屏溢出并压住「备注」输入区；滚动到底时页面 footer 被底部导航完全遮挡 | 390×844 截图 + 元素矩形（footer 807→844 vs 导航顶 781） |
| P0 | 启动阶段接口不可用时被渲染成**登录页**，用户会以为自己被登出 | 断网启动实测 |
| P0 | 失败写操作（401）后草稿未保留；草稿也不跨页面刷新 | 代码路径 + 刷新实测 |
| P1 | 触摸目标 34–40px（< 44px）；节点删除键 38×38 且缺 `role`/`aria-label` | `pointer: fine` 下实测 |
| P1 | 深色模式主色芯片文字对比度 3.93:1（< 4.5:1） | 渲染色计算 |
| P1 | 慢网下建议/记录区直接显示「还没有记录」，与真空白无法区分 | 网络节流实测 |
| P1 | `.MuiChip` 默认 13px 字号低于可读下限（14px） | 主题系数换算 |
| P2 | 导入去重键含总里程：同一天同一条链分两次导入（一次带里程一次不带）会产生重复行 | API 实测 |
| P2 | 手写 CSS 21.4 KB / 1120 行，无令牌体系、组件重复实现、单包偏大 | 代码盘点 |

## 方案

- **UI 框架**：迁移到 **MUI v9（Material Design 3）+ emotion**，删除手写 `styles.css`；设计令牌集中到 `src/theme.ts`（明暗自适应色板、形状、字号下限 14px、触摸目标 44px）。
- **可访问性**：颜色一律走主题令牌；移动端核心路径触摸目标 ≥44px；可交互元素带 `role`/`aria-label`/`tabIndex`；表单字段带 `label`。
- **可靠性三修**（与 UI 迁移同批，都服务「填报不丢数据」）：
  1. 启动阶段任何失败 → 可重试错误屏（「网络不可用，请检查连接后重试」），**绝不伪装登出**；
  2. 草稿本地持久化（`lib/draft.ts`，按用户隔离）：新登录与「刷新 / 被系统回收后重开」两条路径都恢复；401 或网络失败时保留并提示；
  3. 撤销：常用路线一键填入、清空节点链都可撤销（toast 动作 6 秒）。
- **性能与体验**：记录/汇总/导入三视图按需懒加载；慢网显示骨架与「正在载入记录」；离线启动错误屏带「重试」。
- **CSP**：`style-src` 增加 `'unsafe-inline'`（emotion 运行时注入样式的必要代价：静态托管无法按请求下发 nonce；应用无用户可控 HTML，`script-src` 仍不允许内联）。
- **导入去重口径**：去重键由 `日期+节点链+总里程` 改为 `日期+节点链`。

## 实施（改动文件清单）

| 文件 | 变更 |
| --- | --- |
| `apps/web/src/theme.ts`（新增） | 设计令牌与 MUI 主题：明暗自适应色板、形状、字号下限、组件默认值 |
| `apps/web/src/app.css`（新增，极薄） | 仅全局基线（`html/body`、安全区变量），其余全部走 MUI |
| `apps/web/src/lib/draft.ts`（新增） | 草稿读写与清除（localStorage，按 userId 隔离） |
| `apps/web/src/main.tsx` | `ThemeProvider` + `CssBaseline` + 明暗自适应 |
| `apps/web/src/App.tsx` | MUI 外壳（容器 / 标签页 / 固定操作条）；启动失败错误屏；草稿恢复（登录 + 启动两条路径）；撤销动作 |
| `apps/web/src/components/*` | `TopBar`、`NavTabs`、`Toasts`、`PasswordDialog` 迁到 MUI；删除 `NodeSuggestionInput`（改用 MUI Autocomplete） |
| `apps/web/src/views/*` | 五视图全部迁到 MUI：AuthScreen（ToggleButtonGroup + Alert）、EntryView（Autocomplete / 芯片链 / 粘性保存条）、RecordsView（客户端分组 + 分页 60 条 + 14px 芯片）、StatsView（LinearProgress + tabular-nums）、ImportView（textarea label / aria-live 计数 / 桌面双栏） |
| `apps/web/src/styles.css` | 删除 |
| `apps/web/src/lib/entry.ts`、`lib/format.ts`、`types.ts`、`api.ts` | 配合 MUI 的纯函数与类型调整（API 契约不变） |
| `apps/web/vite.config.ts` | `preview` 增加 `/api` 代理，便于在构建产物上验证 |
| `apps/web/public/_headers` | `style-src` 放行 `'unsafe-inline'`；**移除注释行**（该格式不支持注释，注释会导致整份规则解析失败） |
| `apps/api/src/lib/trips.ts`、`src/routes/trips.ts` | 批量导入去重键改为 `日期+节点链` |
| `apps/web/package.json`、`bun.lock` | 新增 `@mui/material`、`@mui/icons-material`、`@emotion/react`、`@emotion/styled` |
| `apps/web/PRODUCT.md`、`apps/web/.impeccable/`（新增） | impeccable 设计上下文与项目配置 |

## 执行验证记录

### 执行环境

Windows 10（win32 10.0.26300）/ bun 1.4.2 / wrangler 4.148.0 / Chromium（浏览器工具，iPhone 12 设备模拟）/ 本地后端 `wrangler dev --port 8788`、前端 `vite dev` 5173。

### 验证命令与实际输出

| 验证 | 命令 / 手段 | 实际输出 |
| --- | --- | --- |
| 类型 + 版本门禁 | `bun run check` | api/web/node 三份 tsconfig 与版本一致性均退出码 0；`✓ 版本一致：0.3.0` |
| 构建 | `bun run build:web` | `✓ built in 394ms`；主包 458.54 kB（gzip 141.35 kB）+ 视图懒加载分块（Import 18.70 / Stats 9.24 / Records 3.66 kB） |
| 设计检测器 | `impeccable detect apps/web/src apps/web/index.html` | 0 发现 |
| 触摸目标 | 设备模拟（pointer: coarse，390×844） | 按钮高 44、图标按钮 44×44、导航项 98×61、输入框 56 |
| 深色对比度 | 渲染后实际取色 | 主色芯片文字 9.19:1、次级文字 8.08:1、警告芯片 9.68:1（均 ≥4.5:1） |
| footer 遮挡 | 滚到底测量矩形 | footer 底 772 < 导航顶 782（此前 807→844 被完全盖住） |
| 横向溢出 | 320 / 768 / 1180 / 1280 四档 | 各档 `scrollWidth == clientWidth`（0 溢出） |
| 启动失败 | 拦截 `/api/me` 使其失败后刷新 | 出现「网络不可用，请检查连接后重试」+「重试」，**未**出现登录页；恢复后重试回到已登录态 |
| 草稿 | 输入链 → 刷新 / 401 | 刷新后自动恢复并提示「已恢复上次未保存的草稿」+「丢弃」；401 后草稿保留、重新登录自动恢复 |
| 撤销 | 点常用路线 / 清空 | 均出现「撤销」并恢复到操作前状态 |
| 导入去重 | `POST /api/trips/bulk` 两次（同链，一次带里程一次不带） | 第一次 `{created:1,skipped:0}`，第二次 `{created:0,skipped:1}`，库内仅 1 条 |
| 懒加载与语义 | 切三个视图 + 键盘操作 | 三视图均渲染成功；菜单 Esc 可关；控制台 0 错误 |
| SSR 冒烟（子代理执行） | 临时 bun + `react-dom/server` | 登录态、空态、130 条分页、Chip 字号等断言通过 |

### 线上验证（部署后）

| 验证 | 手段 | 实际输出 |
| --- | --- | --- |
| 响应头 | `curl -I https://trips.zerobiubiu.top/` | `content-security-policy: … script-src 'self' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; …`、`x-frame-options: DENY` |
| API 版本 | `curl /api/me`（新域名与旧 workers.dev 各一次） | 两处均返回 `{"user":null,…,"version":"0.3.0"}`；旧地址非 API 路径 302 → 新站点 |
| 真实 CSP 下样式 | 线上暗色模式加载首页 | 4 个 emotion `<style>` 注入、31 个 MUI 类、`body` 背景 `rgb(15,18,24)`；无 CSP 违规报错 |
| 注册 / 登录 | 线上注册一次性账号 | 创建成功并进入登录态（`me` 返回用户与显示名），Cookie 为 HttpOnly（JS 读不到） |
| 线上行程读写 | API 写入 → 列表可见 → 删除 | `{created:true, listed:["家→圣润→家:50"], afterDelete:0}`；「记录」页回到空态 |
| 冒烟数据清理 | 远端 D1 + KV | 该账号 users/sessions/trips 均为 0；KV 会话键残留 0（命名空间其余 6 个键未动） |

### 验证结论

9 项问题全部修复并有实测证据；类型门禁、构建、设计检测器全绿；本地与构建产物未发现回归；0.3.0 已部署，线上（真实 CSP + Pages + Worker 路由）注册、登录、行程读写、暗色渲染均验证通过，冒烟数据已清理。

### 已知限制

- `vite preview` **不解析** `_headers`，CSP 只能在 `wrangler dev` 或生产上验证；本次头部机制已在 `wrangler dev` 侧确认，生产复核见「后续验证建议」。
- API 侧响应头仍是严格 CSP（`style-src 'self'`）：API 只返回 JSON、不承载文档，保持严格；前端文档的 CSP 以 Pages 的 `_headers` 为准。
- 触摸目标与安全区仅在 Chromium 设备模拟下验证，未在真机 iOS Safari 上验证 `env(safe-area-inset-*)`。
- 明暗两套色板只验证了关键组合对比度，未做全组合扫描。
- 类型同步（Worker 绑定类型 ↔ `packages/contracts`）本轮未做。

## 后续验证建议

1. 部署后在 `https://trips.zerobiubiu.top/` 复核：`Content-Security-Policy` 含 `style-src 'self' 'unsafe-inline'`，首页样式正常渲染（emotion 未被拦）、控制台无 CSP 违规；登录 → 填报 → 保存 → 记录/汇总可见。
2. 真机（iOS Safari / Android Chrome）确认底部导航安全区与 44px 触摸目标、深色模式观感。
3. 多设备并发：同一账号手机 + 桌面同时登录，验证会话互不影响与滚动续期。
