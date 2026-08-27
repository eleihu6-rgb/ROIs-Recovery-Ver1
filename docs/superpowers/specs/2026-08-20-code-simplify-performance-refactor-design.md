# 代码 Simplify 与性能优化重构设计

## 背景

最近 PBS Portal、PBS Server、Live Server 和 Gantt 连续追功能，很多改动是为了快速交付，代码结构、职责边界和性能验证没有系统整理。本次目标不是一次性“大重构”，而是先做一次可控的 simplify：找出高收益、低风险的整理点，把组件、服务、SQL 热点拆清楚，并用测试和性能数据证明没有破坏现有行为。

## 目标

- 从性能角度检查 PBS / Gantt 相关热点路径，优先处理真实用户页面会频繁触发的查询和组件。
- 从代码结构角度拆清职责边界：route 只做入参和响应，service 负责业务，前端组件减少状态和副作用混杂。
- 简化重复逻辑，减少“每加一个 bid 条件就复制一堆 state / if / reset”的维护成本。
- 保持用户行为不变，所有重构必须通过现有或新增回归测试验证。
- 每一阶段都能单独提交、单独回滚，避免全仓库大范围改动。

## 非目标

- 不做视觉重设计，不借 simplify 顺手改 UI 风格。
- 不改业务规则、不改 bid 保存语义、不改 period 选择语义，除非单独确认发现明确 bug。
- 不直接加数据库索引。任何索引或 schema 变化必须先有 `EXPLAIN (ANALYZE, BUFFERS)` 证据，并单独确认。
- 不碰当前工作区已有的 `rule-engine-rs` 改动。
- 不把所有重复 helper 一次性跨模块抽成大公共库；先在模块边界内做小范围整理。

## 当前主要发现

### 1. Pairing bid 配置弹窗过重

文件：`pbs-portal/src/features/pairing/components/pairing-property-config-dialog.tsx`

现状：

- 一个弹窗文件承载了十几个 bid 条件的初始化、校验、状态 reset、标题和编辑器选择。
- 每新增一个 bid 条件，就要新增一组 `isXValid`、`setIsXValid`、`isXProperty`、reset 分支和 completion 判断。
- 主组件越来越像 bid 条件注册表，但实现仍是大量分散的 if / boolean state。

建议：

- 引入轻量 `PairingPropertyEditorDescriptor`，每个 bid 条件声明自己的：
  - `propertyCode`
  - dialog title
  - 默认 bid/action/operator
  - editor component
  - validation adapter
  - 是否需要额外配置查询
- 主弹窗只负责：
  - 读取 descriptor
  - 初始化 draft
  - 渲染当前 editor
  - 汇总 valid / saving 状态

验收：

- 用户看到的弹窗行为不变。
- 所有现有 pairing bid 条件仍可打开、编辑、保存、保存 favorite。
- 新增或修改 bid 条件时不再需要在主组件复制一整套 state/reset 分支。

### 2. Dashboard 日历组件职责过多

文件：`pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx`

现状：

- 一个组件同时负责日历展示、Days Off 日历编辑、Pairing 日历添加、query cache 同步、popover 状态、错误提示和布局尺寸。
- Pairing 日历动作和 Days Off 日历动作混在同一个组件里，阅读成本高，后续继续加 dashboard 行为容易互相影响。

建议：

- 抽出 `usePairingCalendarActions`：
  - 管理 pairing date action / selected event / tiers / save pending / error。
  - 封装 pairing occurrence 查询、detail 查询、保存 mutation、cache invalidation。
- `DashboardSchedulePanel` 保留：
  - 计算日历展示数据。
  - 连接 Days Off hook 和 Pairing hook。
  - 渲染 calendar / popover / event detail。

验收：

- Dashboard 页面日历展示、滚动、Days Off 添加、Pairing 从左侧日历添加都保持一致。
- 不影响 Bid 页面、Reserve 页面和 Award 页面。
- Playwright 覆盖 Dashboard 日历基本渲染、popover 打开、已有事件点击。

### 3. Live Server PBS 管理路由太厚

文件：`live-server/src/routes/pbs/period-admin.ts`

现状：

- route 文件包含时间格式化、period stage 计算、overlap 校验、create/update SQL、权限检查、接口响应。
- 这违反现有模块规则：route 应该薄，业务逻辑应该在 service 中。

建议：

- 新建 `live-server/src/services/pbs/period-admin-service.ts`。
- route 保留：
  - zod parse
  - admin check
  - 调用 service
  - success/fail response
- service 负责：
  - period row mapping
  - stage 计算
  - overlap 校验
  - create / update / generate candidates

验收：

- PBS Period Admin 页面行为不变。
- 现有 period create/update/generate 接口响应格式不变。
- 增加或更新 service 层测试，覆盖 overlap、stage、create/update 分支。

### 4. Crew Bids Viewer route/service 边界不清

文件：`live-server/src/routes/pbs/crew-bids.ts`

现状：

- route 内直接拼 SQL、查 roster period、聚合 bid group、转换 crew rows、解析 legacy pairing number label。
- 近期已经把 Crew Bids 查询改成 `rosterPeriodId`，这里需要确认没有旧 `period_code` 语义残留。

建议：

- 新建 `live-server/src/services/pbs/crew-bids-service.ts`。
- route 只负责参数解析和响应。
- service 负责：
  - period context 读取
  - crew bid 查询
  - row aggregation
  - legacy pairing id label resolution
- 同时审查 `/api/pbs/periods` 是否仍应该从 `pbs_bid.period_code` distinct 读取，还是应该基于 `roster_period.pbs_period_code`。

验收：

- Scenario > Crew Bids Viewer 搜索仍能正常返回。
- period 下拉和搜索结果不再依赖错误的旧 period identity。
- 加 regression test 覆盖 `rosterPeriodId` 查询路径。

### 5. Bidding Calendar days-off count SQL 可优化

文件：`pbs-server/src/services/calendar/bidding-calendar-service.ts`

现状：

- `loadRequestedDayOffCountsByDate` 并行执行两个 SQL。
- 两个 SQL 重复构造 `actor_identity`、`actor_scope`、`scoped_bids`。
- 该路径影响左侧日历 days-off capacity 展示，用户打开 Bid/Dashboard 时会感知。
- 当前实现里还有 `bid.period_code = $5`，需要确认是否应统一使用 `roster_period_id`。

建议：

- 在不改变返回结果的前提下，把两个查询合并为一个 SQL，共享 scope CTE。
- 先增加/保留去重逻辑：同一 crew 在多个 tier 申请同一天，只计一次。
- period identity 优先使用 `rosterPeriodId`；如果当前调用链还缺少 id，需要先补 contract，而不是继续依赖字符串 period code。

验收：

- 日历小格显示的 `requested / capacity` 数字不变。
- 同一 crew 多 tier 重复申请仍只计一次。
- 接口响应时间不能比当前更差；必须使用远端权威 PostgreSQL 真实数据执行改动前后的 `EXPLAIN (ANALYZE, BUFFERS)` 对比。

### 6. Pairing Search 需要先量化再优化

文件：`pbs-server/src/services/pairing-search/pairing-search-preview-query.ts`

现状：

- 主查询已经使用 filtered CTE、分页后再加载 page rows 的 segment，整体方向是正确的。
- 新增 filters 后，check-in/out、credit、layover count、station、redeye、DHD 等条件会引入多个 `exists` 或聚合表达式。
- 这类 SQL 是否慢，不能从代码体积判断，必须用真实数据看执行计划。

建议：

- 先建立性能基线：
  - 无 filter
  - station filter
  - layover count filter
  - credit range filter
  - redeye / DHD filter
  - 多条件组合 filter
- 对每个基线跑 `EXPLAIN (ANALYZE, BUFFERS)`。
- 只有当计划显示真实瓶颈时，才做 SQL rewrite 或索引方案。

验收：

- 不凭感觉优化。
- 每个 SQL 性能改动都有前后 explain 对比。
- Pairing Preference filter dialog 搜索结果数量和分页不变。

### 7. Schema identifier helper 重复

代表文件：

- `live-server/src/routes/base/roster-periods.ts`
- `live-server/src/routes/pbs/crew-bids.ts`
- `live-server/src/routes/pbs/period-admin.ts`
- `pbs-server/src/services/calendar/bidding-calendar-service.ts`
- `pbs-server/src/services/pairing-search/pairing-search-service.ts`

现状：

- 多个 route / service 内部各自实现 `asSafeIdentifier` 或 `validateSchemaName`。
- 正则和错误提示略有差异，后续如果 schema 安全规则变化，容易漏改。

建议：

- 只在模块内抽取，不做跨包大公共库。
- `live-server` 抽到本模块已有 utils 或新建轻量 server util。
- `pbs-server` 抽到本模块 shared util。
- 不改变校验规则，只消除重复实现。

验收：

- 所有原有非法 schema name 仍被拒绝。
- route/service 行为不变。
- 只触碰明确列出的重复 helper 使用点，不顺手整理其他工具函数。

## Period identity 决策门槛

PBS 当前 period 的业务 source of truth 应以 `roster_period.id` / `rosterPeriodId` 为主；`period_code` 只能作为展示文案或兼容字段，不能作为跨年、跨上下文查询的唯一身份。

在进入任何涉及 period 查询条件的实现前，必须先完成以下检查：

- 列出受影响接口：
  - Gantt Crew Bids Viewer 的 `/api/pbs/crew-bids`
  - Gantt Crew Bids Viewer 的 period options 接口
  - PBS Portal bidding calendar current 接口
  - PBS Server days-off requested count 查询
- 确认每个接口入参、service 参数、SQL where 条件使用的 period identity。
- 如果发现某条写路径或读路径只能拿到 `period_code`，先暂停相关 phase，补 contract 或单独写修复 spec。
- 不允许在同一个查询中用 `period_code` 代替 `roster_period_id` 解决问题，除非该查询确实只做展示列表且不会影响业务数据关联。

回归测试要求：

- 至少覆盖同一年不同月份。
- 至少覆盖跨年同月份，例如 `Jul 2026` 与 `Jul 2027` 不串数据。
- Crew Bids Viewer、Bidding Calendar requested count 都要覆盖 `rosterPeriodId` 查询路径。

## 分阶段方案

### Phase 0：基线与保护

- 记录当前工作区状态，明确不触碰 `rule-engine-rs`。
- 跑现有 touched-area 测试，确认当前基线。
- 对 pairing search 和 bidding calendar 准备最小性能基线脚本或手动 SQL。
- 完成 Period identity 决策门槛检查；未通过时暂停后续涉及 period 查询条件的 phase。
- 不做功能改动。

### Phase 1：低风险边界整理

- 抽取重复 schema identifier 校验 helper，优先在同一模块内复用。
- Dashboard pairing calendar action 抽 hook。

### Phase 2：Pairing config dialog gated simplify

- 先只抽 descriptor 骨架，不改各 editor 内部 UI 和业务逻辑。
- 每次迁移一组条件，迁移后立即跑对应 smoke / save regression。
- 若任一 bid 条件保存 payload 或展示 summary 发生变化，暂停继续迁移。

### Phase 3：服务边界整理

- 拆 `live-server` PBS crew bids service。
- 拆 `live-server` PBS period admin service。
- 为 service 添加 focused tests。

### Phase 4：性能优化

- 合并 days-off calendar count SQL。
- 根据 explain 决定是否优化 pairing search SQL。
- 如果需要新增索引，单独出数据库 migration spec，不和普通重构混在一起。

## 测试策略

前端：

- `pbs-portal` touched components 的 typecheck / test。
- Playwright 覆盖：
  - Dashboard 日历渲染。
  - Dashboard 左侧日历 Days Off / Pairing 入口不坏。
  - Pairing Preference 各类配置弹窗至少 smoke 打开。
  - Pairing filter dialog 搜索结果分页不坏。

后端：

- `live-server` 针对 extracted service 的 focused tests。
- `pbs-server` 针对 bidding calendar requested day-off counts 的 regression test。
- 对 SQL 性能项补远端权威 PostgreSQL 真实数据的 `EXPLAIN (ANALYZE, BUFFERS)` 记录；本地 explain 只能辅助排查，不能作为验收依据。

通用：

- 改动 UI 样式时运行 `npm run check:ui`。
- 最小测试先跑，跨模块 contract 改动再扩大测试范围。
- 每阶段完成后检查 `git diff`，确认没有无关文件。

## 风险与控制

- Pairing config dialog 风险最高，因为影响所有 pairing bid 条件。控制方式是单独 gated phase，先抽 descriptor 骨架，每次迁移一组条件，不改各 editor 内部。
- Dashboard 日历风险在 query cache 同步。控制方式是把现有逻辑整体搬进 hook，先不重写状态机。
- Period Admin route 拆分风险在接口响应格式。控制方式是保留 route schema 和 response wrapper 不变。
- SQL 优化风险在结果一致性。控制方式是先写结果一致性测试，再看 explain。
- `period_code` 与 `rosterPeriodId` 混用可能隐藏历史问题。控制方式是把 Period identity 决策门槛作为 Phase 0 的硬门槛，未通过时暂停相关实现。

## Multi-Agent Parallelism Assessment

- Recommendation: Yes
- Rationale: 该任务可以拆成前端组件职责整理、后端 route/service 拆分、SQL 性能基线三条相对独立的线。
- Suggested split:
  - Agent A：PBS Portal 前端结构审计与 hook/descriptor 拆分方案。
  - Agent B：Live Server PBS route/service 拆分。
  - Agent C：PBS Server calendar / pairing search SQL explain 基线。
- Write boundaries:
  - Agent A 只写 `pbs-portal/src/features/...` 和对应测试。
  - Agent B 只写 `live-server/src/routes/pbs`、`live-server/src/services/pbs` 和对应测试。
  - Agent C 优先只读；若要写，只能写测试或 docs，不写生产 SQL 逻辑。
- Conflict risk: Medium。主要风险是 period identity contract 横跨 pbs-server、live-server、portal，需要主 agent 统一整合。
- Execution gate: 只有在用户确认本 spec 后，才允许启动实现或多 agent 并行开发。

## 执行门槛

- 本文档只是设计和审计范围确认，不代表可以开始改代码。
- 用户确认后，先写实施计划，再进入 Phase 0。
- 每个 phase 开始前都要明确目标文件、测试命令、预期行为不变点。
