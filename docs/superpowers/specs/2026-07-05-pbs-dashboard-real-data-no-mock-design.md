# PBS Dashboard 全页真实数据与去 mock 设计

## 状态

- 文档状态：待用户确认
- 目标模块：`pbs-portal`、`pbs-server`、`packages/contracts`
- 目标页面：PBS Portal Dashboard 与共享 `BIDDING CALENDAR`
- 设计目标：Dashboard 运行时不再展示、引用或回退到 mock 业务数据
- 实施状态：未开始实现

## 背景

AA `Flight Attendant PBS Guide` 对 Dashboard 的定义是 PBS 首页和每月 bid package 的个性化封面。它主要包含三块信息：

1. `Bid Package Information`
   - `BID START` / `BID END`
   - bid close 倒计时或 closed 状态
   - `TARGETED LINE` / `TARGETED RESERVE` / `TOTAL BIDDER`
2. `User Information`
   - `BASE`、`FLEET`、`POSITION`、`SENIORITY`、`STATUS`、`LANGUAGE`
   - `EXISTING CREDIT`、`TRAINING MONTH`、`LAST LOGIN`
3. `Message Board`
   - 当前 bid period 的 base line average
   - 管理员提示，例如 flex month
   - fleet / sub-fleet 信息

当前项目已完成 Dashboard `USER INFORMATION` 的部分真实数据接入：

- `GET /dashboard/profile` 已返回 `pbs_user` 与 live 机组资料聚合字段。
- `FLEET`、`LANGUAGE`、`SENIORITY`、`EXISTING CREDIT` 已有已确认口径。
- `STATUS`、`TRAINING MONTH` 仍因业务定义未确认而返回 `null`。

但 Dashboard 仍存在运行时 mock 数据入口：

- `pbs-portal/src/features/dashboard/pages/dashboard-page.tsx` 仍导入 `dashboardScheduleData` 和 `dashboardMessagePanelData`。
- `pbs-portal/src/app/layout/shared-bidding-workbench-layout.tsx` 仍把 `dashboardScheduleData` 传给共享 `DashboardSchedulePanel`。
- `pbs-portal/src/features/dashboard/dashboard-user-panel-profile.ts` 仍以 `dashboardUserPanelData` 为 base，再覆盖少数字段。
- `pbs-portal/src/features/dashboard/bidding-calendar-mappers.ts` 在 `periodCode` 解析失败时回退到 `dashboardScheduleData`。
- `pbs-portal/src/features/dashboard/mock.ts` 存在大量静态业务值，例如 `DEC 2024`、`NOV 2025`、`LAX`、`646/2132`、`78:16`、fleet/sub-fleet 列表和固定日历事件。

这与用户明确要求“坚决不要再出现 mock 数据”冲突，也会误导后续开发。

## 目标

- 删除 Dashboard 产品运行路径中的所有 mock 业务数据。
- Dashboard 显示的数据必须来自真实 API、真实数据库、业务计算或明确空值。
- 对 AA 文档中当前数据库没有权威来源的字段，显示 `-` 或受控空态，不允许用近似算法伪造。
- `Bid Information` 使用当前 PBS business time 解析出的 current period，不使用浏览器时间或服务器自然时间自行判断。
- 共享 `BIDDING CALENDAR` 继续复用真实 `/bidding-calendar/current` 数据，不再接受静态日历 fallback。
- 右侧 `MESSAGE CENTER` 改为真实数据模型；没有真实来源的 line average / admin message 不显示假值。
- 保持现有 Dashboard 三栏布局，不借本任务重做视觉设计。
- 补齐自动化测试和 QA 人工测试用例，明确验证“不显示旧 mock 值”。

## 非目标

- 不新增未确认的业务概念或硬编码 AA 特有规则。
- 不为了填满页面而创造 `line average`、`targeted line`、`targeted reserve` 的推导算法。
- 不修改 live schema。
- 不新增 `system_parameter` 表。
- 不把 Dashboard 展示数据塞进 auth session 或 JWT。
- 不把 AA 原文 `Layer` 术语带入代码；项目内仍统一使用 `Tier`。
- 不重做 Dashboard、Pairing、Days Off 等工作台布局。

## 强制原则：No Mock In Runtime

实现时必须满足以下约束：

- 产品运行代码不得 import `pbs-portal/src/features/dashboard/mock.ts`。
- `mock.ts` 不应继续作为 Dashboard 数据来源；如只剩 UI 标签常量，应重命名为非 mock 文件，例如 `dashboard-static-labels.ts` 或 `dashboard-view-model.ts`。
- 产品运行路径不得出现固定业务值 fallback，例如固定日期、固定 crew/base、固定 fleet、固定 credit、固定 line average、固定 calendar events。
- mapper 遇到无法解析的真实数据时返回空 view model 或错误态，不回退静态样例数据。
- 单元测试可以使用 test fixture，但 fixture 必须放在测试文件或测试专用目录中，不得被产品运行代码 import。
- E2E / QA 需要显式断言旧 mock 值不再出现，例如 `NOV 2025`、`FRI DEC 21 2024`、`LAX`、`646/2132`、`78:16`、`F80001`。

## 真实数据库核对结论

已在远端 `f8` / `f8_pbs` schema 做只读核对，结论如下。

可直接使用的真实来源：

| Dashboard 字段 | 数据来源 | 说明 |
|---|---|---|
| Current period | `f8_pbs.pbs_period` + `resolveCurrentPeriod` | 已结合 PBS Business Time 使用 |
| Bid start/end/status | `pbs_period.bid_open_at` / `bid_close_at` / computed stage | `/bidding-calendar/current` 已返回 `currentPeriod` |
| User name/email/base/rank/division | `f8_pbs.pbs_user` | 已由 Dashboard profile API 返回 |
| Fleet qualification | `f8.crew_fleet` | 当前有效记录 |
| Language qualification | `f8.crew_language` | 当前有效记录 |
| Seniority | `f8.crew.seniority_num` | 已确认显示为资历号 |
| Existing credit | `f8.crew_manday_fd_monthly` / `f8.crew_manday_cc_am_monthly` | 按 division 与 current bid month |
| Last login | `f8_pbs.pbs_user.last_login_at` | 当前 contract 未返回，需要补字段 |
| Calendar weekends | 计算值 | 已由 bidding calendar service 生成 |
| Calendar days off bids | `f8_pbs.pbs_bid*` | 已由 bidding calendar service 生成 |
| Calendar pairing bids | `f8_pbs.pbs_bid*` + `f8.pairing` | 已由 bidding calendar service 生成 |
| Fleet list | `f8.fleet` 或 current period `f8.pairing` fleet 分布 | 可真实替换右侧静态 fleet 列表 |

当前没有发现权威来源的字段：

| AA 字段 | 当前结论 | 本任务处理 |
|---|---|---|
| `TARGETED LINE` | 未发现月度/base/status target 表或配置 | 返回 `null`，UI 显示 `-` |
| `TARGETED RESERVE` | 未发现月度/base/status target 表或配置 | 返回 `null`，UI 显示 `-` |
| `BASE LINE AVERAGE` | 未发现 admin 配置或正式 line average 表 | 返回 `null`，UI 显示 `-` |
| Message Board admin text / flex month | 未发现 dashboard/message/flex 配置 | 返回空数组或 `null` |
| Training Month | 既有 profile spec 已确认暂无稳定来源 | 保持 `null` |
| Business status label | 既有 profile spec 已确认暂无稳定定义 | 保持 `null` |

重要说明：

- `pbs_bid_group.bid_type = Line / Reserve` 是用户 bid 类型统计，不等价于 AA 文档的 `TARGETED LINE / TARGETED RESERVE`。
- active crew / active pbs_user 计数可以作为 `TOTAL BIDDER` 候选，但不能冒充 lineholder/reserve target。
- `crew_manday_*_monthly.credit` 是个人 existing credit，不等价于 base line average。

## 推荐方案

推荐采用“Dashboard Summary API + 前端纯 view model”的方式。

### 方案 A：继续拼多个现有 API，仅删除 mock

前端继续请求 `/dashboard/profile` 与 `/bidding-calendar/current`，额外新建 message API 或把右侧面板置空。

优点：

- 改动较小。
- 复用现有 query。

缺点：

- 左侧 `Bid Information`、用户 profile、右侧 message 三块需要在前端拼装，边界分散。
- `TOTAL BIDDER`、`LAST LOGIN`、fleet list 等需要另找接口或扩展多个 contract。
- 容易继续留下局部 fallback。

### 方案 B：新增 `GET /dashboard/summary`（推荐）

后端新增 Dashboard 专用 summary service，聚合 current period、profile、bid package metrics、message center 数据。前端 Dashboard 页面消费 summary view model；共享 `BIDDING CALENDAR` 仍消费 `/bidding-calendar/current`。

优点：

- Dashboard 首页字段有单一真实数据契约。
- 所有缺失字段在后端集中返回 `null`，避免前端猜测。
- 能复用现有 profile service 与 current period 逻辑。
- 更容易写“不含 mock 值”的 contract、service、UI 和 E2E 测试。

缺点：

- 需要新增 contract、route、service、前端 service/hook。
- 与已有 `/dashboard/profile` 有部分字段重叠，需要明确复用而不是复制逻辑。

### 方案 C：新增配置表补齐 AA 字段

新增 dashboard/admin 配置表，手工维护 target line/reserve、base line average、message board。

优点：

- 可以严格显示 AA 文档要求的全部字段。

缺点：

- 当前用户要求是把死数据改为真实数据，不是设计后台配置流程。
- 没有业务方确认 target / line average 的维护口径。
- 涉及 schema、seed、管理入口和数据治理，超出本轮去 mock 范围。

本 spec 推荐方案 B。方案 C 可以作为后续任务，在业务确认 target / line average 来源后单独设计。

## 后端设计

### Contract

新增 contract：`packages/contracts/pbs-dashboard-summary.*`。

建议 route：

```ts
export const pbsDashboardSummaryRoutes = {
  current: "/dashboard/summary",
} as const;
```

建议响应类型：

```ts
export type PbsDashboardBidPackage = {
  periodCode: string;
  businessNow: string;
  timezoneLabel: string;
  bidStartAt: string | null;
  bidCloseAt: string | null;
  bidStartLabel: string | null;
  bidCloseLabel: string | null;
  remainingLabel: string | null;
  computedStage: "NOT_OPEN" | "OPEN" | "CLOSED" | "INCOMPLETE";
  targetedLine: number | null;
  targetedReserve: number | null;
  totalBidder: number | null;
};

export type PbsDashboardMessageCenter = {
  title: "MESSAGE CENTER";
  baseLineAverage: string | null;
  fleetItems: Array<{
    fleet: string;
    subFleet: string | null;
    pairingCount?: number;
  }>;
  messages: Array<{
    id: string;
    title: string;
    body: string;
  }>;
};

export type PbsDashboardSummary = {
  profile: PbsDashboardUserProfile;
  bidPackage: PbsDashboardBidPackage;
  messageCenter: PbsDashboardMessageCenter;
};
```

字段说明：

- `businessNow` 必须来自 `createPbsBusinessClock().getBusinessNow()`。
- `bidStartAt` / `bidCloseAt` 使用 ISO string。
- `bidStartLabel` / `bidCloseLabel` 由后端按当前项目时区口径格式化；前端只展示。
- `remainingLabel` 根据 businessNow 与 bid close 计算；closed 时显示 `Closed` 或返回 `null` 并由前端按 `computedStage` 显示。
- `targetedLine` / `targetedReserve` 第一版固定 `null`，除非后续发现权威目标数据表。
- `totalBidder` 建议按当前用户 `base + division` 统计 `pbs_user` 中可登录 PBS 的 active bidder；如果业务确认 rank 也需要参与过滤，再调整口径。
- `baseLineAverage` 第一版固定 `null`，不使用 existing credit 或 pairing credit 猜测。
- `fleetItems` 第一版从 current period 的 `live.pairing` 按 actor base/division 聚合 fleet；如果没有 pairing 分布，则回退到 `live.fleet` 的真实 fleet 列表，但不写死 sub-fleet。
- `messages` 第一版为空数组，直到有真实配置来源。

### Service

新增 `pbs-server/src/services/dashboard-summary/`：

- `dashboard-summary-service.ts`
- `types.ts`
- `dashboard-summary-service.test.ts`

服务依赖：

- `db`：Drizzle 读取 `pbs_user`、`pbs_period` 等 PBS 表。
- `pgPool`：只读查询 live schema。
- `liveSchema` / `pbsSchema`：必须复用 schema name 校验。
- `dashboardProfileService` 或同等内部 helper：复用已确认的 profile 口径，避免复制查询。
- `businessClock`：解析 current period 与 remaining。

查询策略：

- 先根据 actor 读取当前用户 profile。
- 用 `resolveCurrentPeriod(db, actor, businessNow)` 获取 current period。
- 用一个聚合 SQL 统计 `totalBidder`，避免按用户循环。
- 用一个聚合 SQL 读取 current period + actor base/division 的 fleet 分布。
- 独立数据可以 `Promise.all` 并行加载。
- 不引入缓存；Dashboard summary 是单用户、小数据量接口。后续若海外延迟明显，再基于 route metrics 决定是否加短 TTL。

错误处理：

- 未登录：沿用认证中间件 401。
- 找不到 `pbs_user`：404。
- current period fallback 存在但缺少 bid open/close：返回 `INCOMPLETE` 与 `null` 时间字段，不使用静态时间。
- fleet/message 读取失败：如果 profile 与 period 已可返回，建议返回 200 + 空 fleet/message + warning 日志；不把局部缺口变成整页不可用。

### 不做的后端行为

- 不从 `pbs_bid_group.bid_type` 推导 targeted line/reserve。
- 不从 `crew_manday_*` 平均值推导 base line average。
- 不新增硬编码 fleet/sub-fleet 映射。
- 不把 message board 文案写死在代码或 seed 里。

## 前端设计

### 数据流

新增：

- `pbs-portal/src/shared/services/dashboard-summary-service.ts`
- `pbs-portal/src/features/dashboard/hooks/use-dashboard-summary.ts`
- `pbs-portal/src/features/dashboard/dashboard-summary-mappers.ts`

Dashboard 页面：

- `DashboardPage` 使用 `useDashboardSummary()`。
- 左侧 `DashboardLeftPanel` 接收由 summary mapper 构造的 `DashboardUserPanelData`。
- 中间 `DashboardSchedulePanel` 不再从 page 传入 mock `dashboardScheduleData`；它应从真实 calendar query 构造数据。
- 右侧 `DashboardRightPanel` 接收由 summary mapper 构造的 `DashboardMessagePanelData`。

共享 Workbench：

- `SharedBiddingWorkbenchLayout` 不再 import `dashboardScheduleData`。
- `DashboardSchedulePanel` 的 `data` prop 应改成可选或替换为 `emptyScheduleData` builder，且该 builder 只能基于 current period / loading / empty state，不含固定业务值。

### View Model

保留 `DashboardLeftPanel` / `DashboardRightPanel` 的纯渲染职责，但 mapper 不得以 mock data 为 base。

建议把静态 label 与真实值分开：

- `dashboard-panel-labels.ts`：只放 UI label，例如 `BID INFORMATION-LOCAL TIME`、`USER INFORMATION`、`BASE`。
- `dashboard-empty-values.ts`：只放通用空值 `-` 和空数组 builder，不放业务样例。
- `dashboard-summary-mappers.ts`：把 `PbsDashboardSummary` 转为现有 panel data。

显示规则：

| UI 字段 | 显示规则 |
|---|---|
| Name | `summary.profile.name`，缺失显示 `-` |
| Email | `summary.profile.email`，缺失显示 `-` |
| Bid Start/End | `summary.bidPackage.bidStartLabel/bidCloseLabel`，缺失显示 `-` |
| Remaining | `remainingLabel`；closed 显示 `Closed`；缺失显示 `-` |
| Targeted Line | `targetedLine ?? "-"` |
| Total Bidder | `totalBidder ?? "-"` |
| Targeted Reserve | `targetedReserve ?? "-"` |
| Base/Fleet/Position/Language/Seniority/Status/Existing Credit/Training Month | 沿用已确认 profile 口径，缺失显示 `-` |
| Last Login | 新增 profile 字段后显示格式化值，缺失显示 `-` |
| Base Line Average | `baseLineAverage ?? "-"` |
| Fleet Items | 真实 fleetItems；为空时显示空表或 `-`，不显示静态 AA 示例 |
| Message Items | 真实 messages；为空时不显示假消息 |

### Calendar 去 fallback

`buildDashboardScheduleDataFromBiddingCalendar` 的 `periodCode` 解析失败时：

- 不得 `structuredClone(dashboardScheduleData)`。
- 应返回基于 response 的空 schedule view model，或由调用方显示 error/empty state。
- 空 schedule 可以有真实 title `BIDDING CALENDAR` 和空 rows，但不能有固定 month、固定 event、固定 tier 色块。

`useDashboardCalendarData` 在 `serverBiddingCalendar` 缺失时：

- loading 中显示 `DashboardSchedulePanelLoading`。
- error 且无真实数据时显示 error state。
- 不再用 `data` prop 的静态日历兜底。

## 性能设计

- Dashboard summary 首屏最多新增一个聚合 API；不拆成多个 waterfall 请求。
- 后端聚合必须按 actor 当前 base/division/current period 做小范围查询，不全量扫大表。
- `totalBidder` 使用 SQL `count(*)` 聚合。
- fleet 分布使用 current period 日期范围 + base/division 聚合，需确认已有 `pairing(pairing_dt/base/division/is_deleted)` 查询性能；如慢，先 `EXPLAIN`，再决定是否补索引。
- 前端继续使用 TanStack Query 和共享 query defaults，避免跨页面重复拉取。
- 不引入新依赖。

## 测试设计

### 后端自动化测试

新增或更新：

- `pbs-server/src/services/dashboard-summary/dashboard-summary-service.test.ts`
- `pbs-server/src/routes/dashboard-summary.test.ts`

覆盖：

- 未登录返回 401。
- 已登录返回 profile + bidPackage + messageCenter。
- bid start/end/remaining 来自 current period，不出现固定 Dec 2024。
- `businessNow` 使用 business clock，而不是 `Date.now()`。
- `targetedLine/targetedReserve/baseLineAverage` 在没有权威来源时返回 `null`。
- `totalBidder` 按 actor base/division 统计。
- fleetItems 来自真实查询结果；无结果返回空数组。
- unsafe schema name 被拒绝。

### 前端单元测试

更新：

- `dashboard-page.test.tsx`
- `dashboard-left-panel.test.tsx`
- `dashboard-right-panel.test.tsx`
- `bidding-calendar-mappers.test.ts`
- `shared-bidding-workbench-layout.test.tsx`

覆盖：

- Dashboard 不 import product mock data。
- summary mapper 缺字段时显示 `-`。
- Dashboard 展示 API 返回的 bid start/end/remaining/total bidder。
- Dashboard 不显示旧 mock 值：`NOV 2025`、`FRI DEC 21 2024`、`LAX`、`646/2132`、`78:16`、`F80001`。
- periodCode 解析失败时不回退静态 schedule。
- shared workbench loading/error 不显示静态日历。

### Playwright E2E

新增：

- `e2e/tests/pbs-portal/dashboard-real-data-no-mock.spec.ts`

覆盖：

- 登录真实 PBS Portal。
- 打开 `/dashboard`。
- 断言 Bid Information 来自当前 period。
- 断言 User Information 来自当前登录用户 profile。
- 断言旧 mock 值不在页面中。
- 断言共享左侧 Bidding Calendar 在 Dashboard / Days Off / Pairing 间切换时不出现静态 `NOV 2025` 或 `F80001`。

### QA 人工测试案例

新增：

- `docs/test-cases/pbs/dashboard/2026-07-05-dashboard-real-data-no-mock.md`

内容包括：

- 正常 current period。
- 缺少 target/base line average 来源。
- 无 fleetItems。
- current period incomplete。
- Dashboard、Days Off、Pairing 共享 calendar 切换。

## 验收标准

- `pbs-portal/src/features/dashboard/mock.ts` 不再被任何产品运行代码 import。
- Dashboard 页面不再展示旧 mock 业务值。
- 共享 `BIDDING CALENDAR` 不再使用静态 `dashboardScheduleData` fallback。
- Bid start/end/remaining 使用 PBS Business Time 和 current period。
- User Information 沿用真实 profile API，新增 Last Login 后来自 `pbs_user.last_login_at`。
- Message Center 不再显示静态 `78:16` 和 AA 示例 fleet/sub-fleet。
- 没有权威来源的 AA 字段显示 `-` 或空态，不使用近似算法伪造。
- 自动化测试覆盖 no-mock 回归。
- Playwright 真实 UI 流程通过。
- QA 人工测试文档已新增。
- 前端样式改动后 `npm run check:ui` 通过。
- 跨前后端实现时同步递增 `gantt/src/version.ts` 的 `FRONTEND_VERSION` 与 `BACKEND_VERSION`。

## 风险与后续

- `TARGETED LINE` / `TARGETED RESERVE` / `BASE LINE AVERAGE` 当前没有权威数据源；本任务必须接受空值，否则需要先做数据建模或业务配置设计。
- `TOTAL BIDDER` 的过滤范围需要业务确认。推荐第一版为 actor `base + division` 下可登录 PBS 的 active users。
- `fleetItems` 如果从 pairing 分布计算，会反映当前 period 实际 pairing fleet；如果从 `live.fleet` 读取，则是全局 fleet catalog。推荐第一版优先 current period pairing 分布，更贴近 Dashboard bid package。
- 右侧 Message Board 的 admin text/flex month 后续可能需要 dictionary 或新配置表，但不应在本任务中硬编码。

## Multi-Agent Parallelism Assessment

- Recommendation: Yes
- Rationale: 该任务跨 contract、pbs-server、pbs-portal、E2E/QA 文档，且可以按清晰边界拆分；并行能缩短实现和验证时间。
- Suggested split:
  - Agent A：后端 contract、summary service、route、service tests。
  - Agent B：前端 Dashboard summary service/hook/mapper、移除 runtime mock imports、组件单测。
  - Agent C：Playwright E2E 与 QA 人工测试文档。
- Write boundaries:
  - Agent A 仅写 `packages/contracts/pbs-dashboard-summary.*`、`pbs-server/src/routes/*`、`pbs-server/src/services/dashboard-summary/*`、相关 pbs-server tests。
  - Agent B 仅写 `pbs-portal/src/features/dashboard/*`、`pbs-portal/src/app/layout/shared-bidding-workbench-layout.tsx`、`pbs-portal/src/shared/services/*`、相关前端 tests。
  - Agent C 仅写 `e2e/tests/pbs-portal/*`、`e2e/pages/pbs-portal/*`、`docs/test-cases/pbs/dashboard/*`。
- Conflict risk: Medium，主要在 contract 字段命名和前端 mapper 消费新 contract 的交界处。
- Execution gate: 用户确认本 spec 后，先由主 agent 固定 contract，再分派或顺序实现；实现前需要按 GitNexus 规则对将修改的符号做 impact 分析。

## 实施门禁

Above is my understanding of the requirement/spec. Please confirm, and I will implement after your approval.
