# PBS Portal 当前周期只读时间文案时区修复设计

日期：2026-08-11
状态：待用户审阅批准，批准前不实施

## 背景

用户在 PBS Portal 的 Bidding Calendar 看到：

- `Bidding not open for Oct 2026`
- `Bidding opens at 2026-09-04T04:00:00.000Z. · YYZ Local Time`

这会把 UTC ISO 原始时间和 `YYZ Local Time` 拼在一起。若原始 instant 为 `2026-09-04T04:00:00.000Z`，在 `America/Toronto` 应显示为 `Sep 04, 00:00`（EDT），不能直接展示 `Z`/UTC 字符串。

## 只读调查结论

- `pbs-server/src/services/lineholder/current-bid.ts`
  - `buildReadOnlyReason()` 对 `NOT_OPEN` / `CLOSED` 使用 `Date.toISOString()` 生成用户可见文案。
  - `resolveCurrentPeriod()` 的 SQL 仍以 crew effective base 的 `zone_id` 计算 bid window，实施不得改变 Period 选择、Bid Open/Close 判定或数据库墙上时间模型。
  - `toPbsCurrentPeriod()` 继续把 `bidOpenAt` / `bidCloseAt` 作为 ISO instant 返回，这是结构化合同，不应改成展示字符串。
- `pbs-portal/src/shared/components/current-period-status.tsx`
  - 已有 `formatDateTime(value, zoneId)`，能按 `currentPeriod.zoneId` 输出 `MMM DD, HH:mm`。
  - 当前 `detailText` 优先使用 `currentPeriod.readOnlyReason`，导致结构化时间格式化被后端原始 ISO 文案覆盖。
- `pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx`
  - Bidding Calendar header 使用 `CurrentPeriodStatus` 并追加 `timezoneLabel`。
  - 其他只读操作 warning 也会直接使用 `currentPeriod.readOnlyReason`。

## GitNexus Impact Analysis

索引状态：

- 仓库：`/Users/lei/Codehub/rois-ai`
- Indexed commit / Current commit：`9f35d05`
- 状态：up-to-date

影响面：

- `buildReadOnlyReason`：LOW
  - 直接影响：`mapCurrentPeriodRow`
  - 间接影响：`resolveCurrentPeriod`、`loadCurrentPeriodAndExistingBid`
  - 受影响模块：Lineholder
- `CurrentPeriodStatus`：HIGH
  - 直接影响：`DashboardSchedulePanel`
  - 间接影响：`SharedBiddingWorkbenchLayout`、`DashboardPage`、`AppRoutes` 流程及相关测试工具
  - 风险含义：这是共享 Bidding Calendar 状态条，必须保持最小改动并跑 Portal 真实 UI 回归。
- `formatDateTime`：HIGH
  - 直接影响：`CurrentPeriodStatus`
  - 间接影响：`DashboardSchedulePanel`、`SharedBiddingWorkbenchLayout`、`DashboardPage`

已按要求在实施前报告 HIGH 影响；本设计不开始业务代码修改。

## 目标

- `NOT_OPEN` 显示 base local 的 open time，例如 `Bidding opens at Sep 04, 00:00 · YYZ Local Time`。
- `CLOSED` 显示 base local 的 close time，例如 `Bidding closed at Sep 13, 23:59 · YYZ Local Time`。
- 任何带 `YYZ Local Time` 的当前周期状态文案都不得包含 `T04:00:00.000Z`、`.000Z`、裸 ISO UTC 字符串或误导性 UTC 原始时间。
- 保留现有 `bidOpenAt` / `bidCloseAt` ISO instant 合同，前端继续按 `zoneId` 展示。
- 不改变当前 Period 选择、Bid Open/Close stage 判定、数据库墙上时间模型、认证、草稿保存或业务写入流程。

## 非目标

- 不新增依赖。
- 不重构 PBS current period 合同。
- 不改数据库 schema、migration、seed 或 roster period 配置。
- 不改变 `readOnlyReason` 中非时间类错误文案，例如缺 prime base、缺 timezone、window incomplete。
- 不处理 Award/Standing Bid 等其他独立时间展示。

## 方案比较

### 方案 A：只改 Portal 状态条

在 `CurrentPeriodStatus` 中对 `NOT_OPEN` / `CLOSED` 忽略 `readOnlyReason`，改用 `bidOpenAt` / `bidCloseAt` + `zoneId` 格式化。

优点：改动最小，直接修复用户看到的 Bidding Calendar header。

缺点：后端仍会返回 raw ISO `readOnlyReason`，其他 warning 或 API 错误可能继续暴露原始 UTC 字符串。

### 方案 B：只改 Server `readOnlyReason`

在 `buildReadOnlyReason()` 中复用现有 server 端 `formatDashboardDateTimeLabel(value, zoneId)`，让 `readOnlyReason` 自身不再包含 ISO UTC。

优点：所有 `readOnlyReason` 消费者受益，包括 warning 和保存被拒绝的错误文案。

缺点：`CurrentPeriodStatus` 仍优先相信后端展示字符串；若旧缓存、mock 或兼容返回继续带 ISO，状态条仍可能复发。

### 方案 C：双层最小修复（推荐）

同时做两处小改动：

- Server：`buildReadOnlyReason()` 对 `NOT_OPEN` / `CLOSED` 使用 `formatDashboardDateTimeLabel()` 按 `row.zone_id` 格式化时间，不再用 `toISOString()` 拼用户文案。
- Portal：`CurrentPeriodStatus` 对 `NOT_OPEN` / `CLOSED` 优先用结构化 `bidOpenAt` / `bidCloseAt` + `zoneId` 生成详情；只有缺少对应时间时才回退 `readOnlyReason`。

推荐原因：既修复当前 header，又消除后端继续生产 raw ISO 文案的来源；同时保持结构化 API 字段、stage 判定和数据模型不变。改动范围仍集中在两个已定位文件及对应测试。

## 详细设计

### Server

目标文件：`pbs-server/src/services/lineholder/current-bid.ts`

- 引入并复用 `pbs-server/src/services/dashboard-timezone.ts` 的 `formatDashboardDateTimeLabel()`。
- `buildReadOnlyReason(row, businessNow)` 保持现有前置错误顺序：
  - 无 period code：`No bid period is configured.`
  - 无 base：`No effective prime base...`
  - 无 `zone_id`：`The base timezone is not configured...`
  - incomplete：`Bid period window is incomplete.`
- 仅替换 `NOT_OPEN` / `CLOSED` 的时间拼接：
  - `NOT_OPEN`：`Bidding opens at ${formatDashboardDateTimeLabel(bidOpenAt, row.zone_id)}.`
  - `CLOSED`：`Bidding closed at ${formatDashboardDateTimeLabel(bidCloseAt, row.zone_id)}.`
- 若格式化返回空值，回退到当前非时间类安全文案，不暴露 raw exception 或 raw ISO。
- 不改 `computePbsPeriodStage()`、`buildCurrentPeriodCte()`、`toPbsCurrentPeriod()`。

### Portal

目标文件：`pbs-portal/src/shared/components/current-period-status.tsx`

- 保留现有 `formatDateTime()` 的格式与 `timezoneSuffix` 行为。
- 新增小型 helper，例如 `getDetailText(currentPeriod, openAt, closeAt)`：
  - `OPEN`：保留现有 `Open ${openAt} · Close ${closeAt}`。
  - `NOT_OPEN`：若 `openAt` 存在，返回 `Bidding opens at ${openAt}`；否则回退 `readOnlyReason`。
  - `CLOSED`：若 `closeAt` 存在，返回 `Bidding closed at ${closeAt}`；否则回退 `readOnlyReason`。
  - `INCOMPLETE`：优先保留 `readOnlyReason`，否则回退现有 open/close 拼接。
- `timezoneSuffix` 只追加到最终 detail；最终 detail 不应包含 raw ISO。
- 不改 CSS class、布局、data-testid 或 role，降低 HIGH impact 风险。

## 错误与时区语义

- `bidOpenAt` / `bidCloseAt` 是 instant；展示必须结合 `zoneId`。
- `timezoneLabel` 是展示后缀，例如 `YYZ Local Time`，不能用来计算时间。
- 缺 base / 缺 timezone / incomplete 是配置错误或业务不可用状态，继续展示持久的只读原因，不伪装成可恢复 toast。
- 不根据 raw exception message 分支；只使用 `computedStage`、结构化时间字段和 `zoneId`。
- 不在前端 console 输出敏感数据或调试日志。

## 测试设计

### Server 单元测试

更新：`pbs-server/src/services/lineholder/current-period-bid.test.ts`

- `NOT_OPEN`：覆盖 `America/Toronto` 下 `2026-09-04T04:00:00.000Z` 显示 `Bidding opens at Sep 04, 00:00.`。
- `CLOSED`：覆盖 `America/Toronto` close instant 显示本地 `Sep 13, 23:59` 或等价本地时间。
- 断言 `readOnlyReason` 不包含 `.000Z` / `T04:00:00.000Z`。
- 保留 open / incomplete / missing base / exact close stage 判定测试。

建议命令：

```bash
cd /Users/lei/Codehub/rois-ai/pbs-server
DATABASE_URL=postgresql://test:test@localhost:5432/rois node --import tsx --test src/services/lineholder/current-period-bid.test.ts
```

### Portal 单元测试

新增或更新：`pbs-portal/src/shared/components/current-period-status.test.tsx`

- `NOT_OPEN`：即使 `readOnlyReason` 传入 raw ISO，也显示 `Bidding opens at Sep 04, 00:00 · YYZ Local Time`，且不出现 `.000Z`。
- `CLOSED`：同样覆盖 close time。
- `OPEN`：保留现有 `Open ... · Close ... · YYZ Local Time`。

建议命令：

```bash
cd /Users/lei/Codehub/rois-ai/pbs-portal
npm test -- src/shared/components/current-period-status.test.tsx
```

### Portal Playwright 回归

更新：`e2e/tests/pbs-portal/current-period-calendar-header.spec.ts`

- 增加 mocked current calendar 的真实 UI 回归：
  - `NOT_OPEN`：`bidOpenAt: 2026-09-04T04:00:00.000Z`、`zoneId: America/Toronto`、`timezoneLabel: YYZ Local Time`、raw `readOnlyReason` 仍传入，断言 header 显示 `Sep 04, 00:00 · YYZ Local Time` 且不显示 `.000Z`。
  - `CLOSED`：同样断言 close time 本地化且无 raw ISO。
- 测试继续通过浏览器打开 Portal 页面，mock API 只作为只读数据前置，不用 API 代替用户 UI 行为。

建议命令：

```bash
cd /Users/lei/Codehub/rois-ai/e2e
npm run test:pbs-portal -- --no-deps tests/pbs-portal/current-period-calendar-header.spec.ts --reporter=list
```

### 构建与门禁

实施后最小验证：

```bash
cd /Users/lei/Codehub/rois-ai/pbs-server
DATABASE_URL=postgresql://test:test@localhost:5432/rois node --import tsx --test src/services/lineholder/current-period-bid.test.ts

cd /Users/lei/Codehub/rois-ai/pbs-portal
npm test -- src/shared/components/current-period-status.test.tsx
npm run build

cd /Users/lei/Codehub/rois-ai/e2e
npm run test:pbs-portal -- --no-deps tests/pbs-portal/current-period-calendar-header.spec.ts --reporter=list

cd /Users/lei/Codehub/rois-ai
npm run check:ui
```

如实施涉及额外 touched-area tests，会补跑并在最终交付中列出 PASS/FAIL 回执。

## 验收标准

- Bidding Calendar header 在 `NOT_OPEN` 下不显示 raw ISO UTC，而显示 base local open time。
- Bidding Calendar header 在 `CLOSED` 下不显示 raw ISO UTC，而显示 base local close time。
- `YYZ Local Time` 旁边不出现 `Z`/`.000Z`/`T04:00:00.000Z`。
- `canEditBid`、`computedStage`、period 选择和保存拦截语义不变。
- 无新增依赖、无 schema/migration 改动、无无关重构。
- 相关 unit / Playwright / build / `check:ui` 均有明确回执。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 预计只触碰两个实现文件和少量 focused tests，跨 agent 协调成本高于收益。
- Suggested split: 不拆分；由同一实现者完成 server、portal、e2e 和验证。
- Write boundaries: 若实施，写入范围限定为 `pbs-server/src/services/lineholder/current-bid.ts`、相关 server test、`pbs-portal/src/shared/components/current-period-status.tsx`、相关 portal test、`e2e/tests/pbs-portal/current-period-calendar-header.spec.ts`。
- Conflict risk: 目标仓库当前已有用户未提交改动，但本任务目标文件当前未显示为 dirty；实施前仍需再次检查。
- Execution gate: 必须等用户明确批准本 spec 后才开始修改业务代码。

## 当前工作树注意事项

目标仓库 `/Users/lei/Codehub/rois-ai` 当前已有多项未提交用户改动，主要在 bid-feedback、contracts、SQL schema、`AGENTS.md` / `CLAUDE.md` 等。本任务不会回滚或重写这些改动；实施时只处理本 spec 声明的文件范围。

---

以上是本次需求/spec。请审阅并明确批准后，我再开始实施。
