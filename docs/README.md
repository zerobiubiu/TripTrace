# 文档中心

本目录是途迹 TripTrace 的文档入口，负责三件事：**索引**、**规范**、**要求**。

## 一、文档索引

| 目录 | 文档 | 类型 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| `architecture/` | [0001-triptrace-architecture.md](architecture/0001-triptrace-architecture.md) | 架构说明 | 已执行 | 部署拓扑（Pages + Worker 路由，同域名两路径）、workspace 结构、数据模型、API 契约、鉴权、响应式布局、部署命令 |
| `changes/` | [0001-triptrace-mvp.md](changes/0001-triptrace-mvp.md) | 变更记录 | 已执行 | 首个可用版本（0.1.0）：背景、方案、实施清单、验证记录 |
| `changes/` | [0002-stack-refactor.md](changes/0002-stack-refactor.md) | 变更记录 | 已执行 | 技术栈重构（0.2.0）：bun + Hono + Drizzle + React、移动优先响应式布局 |
| `changes/` | [0003-pages-workers-split.md](changes/0003-pages-workers-split.md) | 变更记录 | 已执行 | 前后端分离与 Pages + Workers 双部署（0.3.0） |
| `changes/` | [0004-mui-frontend-migration.md](changes/0004-mui-frontend-migration.md) | 变更记录 | 已执行 | 前端迁移到 MUI v9（0.3.0）：设计令牌体系、九项审计问题修复（触摸目标 / 对比度 / 草稿 / 启动失败屏 / 导入去重等） |
| `changes/` | [0005-single-worker-topology.md](changes/0005-single-worker-topology.md) | 变更记录 | 已执行 | 部署拓扑合并为单 Worker（0.4.0）：静态资源 + API 一个部署物，Pages 项目停用，旧地址改前端跳转 |
| `changes/` | [0006-entry-rules-nav-and-picker.md](changes/0006-entry-rules-nav-and-picker.md) | 变更记录 | 已执行 | 填报规则收紧与界面清理（0.5.0）：分段必填 + 反向推导默认值、导航并入标题栏、日期控件 x-date-pickers、文案清理 |
| `changes/` | [0007-user-management.md](changes/0007-user-management.md) | 变更记录 | 已执行 | 用户管理（0.5.0）：管理员后台（列表/重置密码/启停/删除级联）+ 个人账号自助（显示名/设备会话） |
| `changes/` | [0008-design-system-and-polish.md](changes/0008-design-system-and-polish.md) | 变更记录 | 已执行 | 设计系统文档化与 polish 收口（0.5.1）：14px 地板落到主题、键盘焦点环、清理重复覆盖 |
| `changes/` | [0009-init-adapt-harden.md](changes/0009-init-adapt-harden.md) | 变更记录 | 已执行 | 产品上下文刷新 / 管理页双形态 / 会话失效加固 / 日期只选不敲（0.6.0） |
| `changes/` | [0010-nav-records-nodes-avatar.md](changes/0010-nav-records-nodes-avatar.md) | 变更记录 | **已回退** | 分组收敛/记录查询区/节点每段一行/头像（0.7.0）——0.7.1 已整体回退到 0.6.2，文件保留作可复用参考 |
| `changes/` | [0011-query-center.md](changes/0011-query-center.md) | 变更记录 | 已执行 | 汇总页升级为查询中心（时间范围 + 四维聚合 + 下钻）、记录页做明细查询（0.8.0）；两页共用 `lib/query.ts` 口径 |
| `changes/` | [0012-node-editor-dnd.md](changes/0012-node-editor-dnd.md) | 变更记录 | 已执行 | 路线节点就地改名 + dnd-kit 拖动排序（0.9.0）；节点改按 id 身份、结构变化统一按端点对重建分段；附带 Range Picker 结论 |
| `changes/` | [0013-shape-language.md](changes/0013-shape-language.md) | 变更记录 | 已执行 | 统一形状语言（0.9.1）：形状令牌、补齐浮层/容器层级、嵌套圆角规则、`corner-shape` 连续曲率增强（含支持面与两处实测缺陷） |
| 同目录 | [../apps/web/DESIGN.md](../apps/web/DESIGN.md) | 设计系统 | 已执行 | 视觉系统的规范来源（令牌 frontmatter + 八节）；侧车在 `apps/web/.impeccable/design.json` |
| `troubleshooting/` | [0001-auth-and-session-ops.md](troubleshooting/0001-auth-and-session-ops.md) | 排查手册 | 参考 | PBKDF2 迭代上限与 CPU 额度取舍；手动删用户后的会话缓存清理步骤 |
| `troubleshooting/` | [0002-workspace-tooling-gotchas.md](troubleshooting/0002-workspace-tooling-gotchas.md) | 排查手册 | 参考 | workspaces 拆分后的工具链坑：shim 残留、全局 vite 抢占、Pages 项目创建与自定义域 DNS、TS7 baseUrl |

阅读顺序建议：先 `architecture/` 了解全貌，再看 `changes/` 了解本次做了什么、怎么验证的，遇到运维问题查 `troubleshooting/`。

## 二、文档规范

- 文档一律放 `docs/`，不放业务代码；按类型分子目录组织（`architecture/`、`changes/`、`troubleshooting/` 等）。
- 编号只在目录内局部递增（`0001-`、`0002-`），不做跨目录全局编号。
- 每个分类目录的文档清单在本文件中维护；新增文档必须回来补索引。
- 文档头部写必要元数据（状态、影响范围、前置文档、替代文档、生效版本）。
- 治理分类不混淆：
  - **现状文档**（如架构说明）描述系统当前有效状态，随系统演进更新；
  - **不可变变更文档**（`changes/`）记录一次已执行的变更，定稿后不重写；后续变化另建文档并标注替代关系。
- 状态词：已执行 / 待执行 / 参考 / 已过期 / 已废弃。

## 三、要求

- **源码变更随行写文档**：改动源码（功能、修复、优化、模块增删）时同步写变更文档，不等提醒；小改可并入同一份并说明合并了哪些变更。
- 变更文档须含：背景、方案、实施（改动文件清单）、执行验证记录、后续验证建议；文末附执行验证记录（执行环境 / 验证命令 / 实际输出 / 验证结论 / 已知限制）。
- **长期、可复现的问题**连同排查过程进 `troubleshooting/`；一次性的问题只留当前任务，不入库。
- 定期归并：累积到一定数量或一个阶段结束时，按主题或时间线精简浓缩，防止文档膨胀。

## 四、与项目其它规则的关系

- 执行规则（Git、项目版本、验证命令、部署）写在项目根 [AGENTS.md](../AGENTS.md)，细节留在本目录，不整篇复制进 AGENTS.md。
- 版本号唯一事实来源是 `package.json`；`wrangler.jsonc` 的 `vars.APP_VERSION` 由 `bun run check` 门禁校验一致性。
