# PBS Bidding Calendar AA 数据源补齐设计

日期：2026-04-30
作者：Codex
状态：已确认，实施中

## 背景

用户指出 AA 文档中的左侧日历面板不只显示 Off，还会显示 DO 和 pairing，需要确认这些数据从哪里来。
后续已明确：DO 与 Off 是两个不同业务概念，`pbs_bid_day_off` 只代表用户提交的 specific day-off bid，不能派生或显示成 DO。

已核对 AA《Flight Attendant PBS Guide》：

- AA 原文 `Layer Overview Calendar`：显示 specific pairings、specific days off、planned absences、weekend 等摘要。
- AA 原文 `Lineholder Monthly Calendar`：显示同类信息但更详细，bid period open 时可以点击 day off 或 pairing 做 add/edit/delete。
- 本项目术语中 AA 原文 `Layer` 对应本项目 `Tier`，后续实现继续使用 `Tier/Tx`。

当前代码只实现了其中一部分：

- `pbs-portal` 左侧 `BIDDING CALENDAR` 由 `SharedBiddingWorkbenchLayout` 固定渲染 `DashboardSchedulePanel`。
- `DashboardSchedulePanel` 当前只调用 `/api/calendar-days-off/current`。
- `pbs-server` 的 `calendar-days-off-service` 只读取 `f8_pbs.pbs_bid_day_off`。
- 因此真实数据只覆盖具体 day-off bid；mock 中的 `F80001`、`ANNUAL LEAVE` 不是当前真实数据源。

## 目标

1. 左侧 `BIDDING CALENDAR` 对齐 AA 月历语义，能同时展示：
   - 当前 Tier 的具体 day-off bid。
   - 当前 Tier 的 specific pairing bid。
   - 计划缺勤 / 既有排班占位，若当前数据库权限和数据可用。
   - weekend 背景或标识。
2. 保持 `/calendar-days-off/current` 作为“具体 day-off bid 编辑接口”，不把它扩成含义混乱的综合接口。
3. 新增一个只读综合日历接口，供工作台左侧日历统一读取。
4. 保持 Days Off 页面现有点击日期添加/删除 day-off bid 的能力。
5. 不改变 Pairing、Days Off、Line 等右侧 bid 编辑语义。

## 不做范围

- 不实现最终 award 计算。
- 不修改 AA 原文术语，只在项目代码中继续使用 `Tier/Tx`。
- 不把 planned absence 权限问题隐藏成假数据；如果 live schema 数据不可读，应返回可展示的空数组或明确降级信息。
- 不把 `/calendar-days-off/current` 改成综合接口。
- 不新增生产依赖。

## 当前数据源判断

### 1. 具体 day-off bid

来源：

- `f8_pbs.pbs_bid_day_off`

语义：

- 用户在月历上点选的具体休息日请求。
- 当前已经通过 `/api/calendar-days-off/current` 按 `tier` 返回。
- 前端现在把这类数据映射成绿色 `Off` event。

后续综合日历中应映射为：

- `type: "day_off_bid"`
- 显示文案统一使用 `Off`；不得映射为 `DO`。
- `DO` 需要后续确认权威数据源后单独实现，不能从 `pbs_bid_day_off` 派生。
- tone 继续用绿色。

### 2. Specific pairing bid

候选来源：

- `f8_pbs.pbs_bid_group`
- `f8.pairing`
- `f8.pairing_segment`

规则：

- 只读取当前 crew、当前 period、当前 bid、当前 Tier 下 `bid_type = 'Pairing'` 的 specific pairing 规则。
- 当前已落地的 specific pairing property 是 `property_code = 128`，即 `Pairing ID`。
- `pbs_bid_group.param_a/param_b/param_c` 里保存 Pairing ID 相关条件；需要复用现有 Pairing bid value 解析逻辑，避免字符串硬拆。
- 根据 pairing label/id 到 `f8.pairing`、`f8.pairing_segment` 解析覆盖日期、起止日期和展示 label。

后续综合日历中应映射为：

- `type: "pairing_bid"`
- label 使用 `pairing_label`，无 label 时用 pairing id。
- tone 用蓝色。
- 多日 pairing 应按连续日期段渲染；跨周时拆成多段，沿用当前 `ScheduleEventCalendar` 的 `row/colStart/colSpan` 模型。

### 3. Planned absence / existing credit / training / vacation

候选来源：

- `f8.roster_publish`
- `f8.roster_flight`
- 未来若有独立 planned absence 导入表，应以该表为主。

当前库状态：

- `f8.roster_publish` 当前可读但数据为 0。
- `f8.roster_flight` 当前 `f8_pbs` 用户无 select 权限。
- `crew_manday_*_daily` 当前也无 select 权限。

设计结论：

- 综合日历接口需要预留 `planned_absence` 数据块。
- 第一阶段如果没有权限或无数据，不返回假数据。
- 如果查询 planned absence 的表出现权限错误，后端不应让整个日历 500；应记录日志并返回 `warnings`，前端仍展示 day-off bid 和 pairing bid。

### 4. Weekend

来源：

- 由 periodCode 推导当月日期即可。

语义：

- AA 月历把 weekend 作为一种视觉提示，不属于用户 bid。
- 前端可以在 cell 层标记 `isWeekend` 或映射为背景 tone，不应写入 bid 数据。

## 方案比较

### 方案 A：扩展 `/calendar-days-off/current`

做法：在现有 day-off 接口响应中加入 pairing、planned absence、weekend。

优点：

- 前端接入改动少。

缺点：

- 接口语义会从“day-off draft 编辑”变成“综合日历”，保存请求和只读展示混在一起。
- Days Off 页面编辑逻辑更容易误写 pairing/planned absence 数据。
- 后续维护者很难判断哪些字段可保存、哪些只读。

结论：不推荐。

### 方案 B：新增 `/api/bidding-calendar/current` 只读综合接口

做法：新增 contract、route、service，聚合 day-off bid、specific pairing bid、planned absence、weekend 信息；保留 `/calendar-days-off/current` 专门负责 day-off draft 的读写。

优点：

- 读写职责清晰。
- 对 AA 左侧日历语义表达完整。
- 可以对 planned absence 权限缺失做局部降级，不影响 day-off 编辑。
- 后续 Award / Reason Report 也可复用同一只读日历视图。

缺点：

- 需要新增 contract、service、前端 query 和 mapper。

结论：推荐。

### 方案 C：前端聚合多个现有接口

做法：前端继续调用 day-off、pairing current draft、lineholder summary、search pairing 等多个接口，在浏览器端拼日历。

优点：

- 后端新增较少。

缺点：

- 请求数变多，容易超过用户要求的 2 秒目标。
- 浏览器端要理解多个后端契约，职责过重。
- planned absence 权限和 SQL fallback 无法集中处理。

结论：不推荐。

## 推荐设计

采用方案 B：新增只读综合日历接口。

### API Contract

新增包文件：

- `packages/contracts/pbs-bidding-calendar.js`
- `packages/contracts/pbs-bidding-calendar.d.ts`

路由：

- `GET /api/bidding-calendar/current`

响应草案：

```ts
export type PbsBiddingCalendarEventType =
  | "day_off_bid"
  | "pairing_bid"
  | "planned_absence"
  | "weekend";

export type PbsBiddingCalendarEventTone =
  | "green"
  | "blue"
  | "yellow"
  | "muted";

export type PbsBiddingCalendarEvent = {
  id: string;
  type: PbsBiddingCalendarEventType;
  tier?: string;
  label: string;
  startDate: string;
  endDate: string;
  tone: PbsBiddingCalendarEventTone;
  source:
    | "pbs_bid_day_off"
    | "pbs_bid_group"
    | "live_pairing"
    | "live_roster"
    | "computed";
  readonly: boolean;
  metadata?: Record<string, string | number | boolean | null>;
};

export type PbsBiddingCalendarCurrentResponse = {
  periodCode: string;
  bidContext: "Current";
  activeTierRange: string[];
  events: PbsBiddingCalendarEvent[];
  warnings?: string[];
};
```

说明：

- `startDate/endDate` 使用 `YYYY-MM-DD`。
- 单日事件 `startDate === endDate`。
- `day_off_bid` 是可编辑数据，但编辑仍通过 `/calendar-days-off/current` 完成；综合接口只读。
- `weekend` 可以作为 event 返回，也可以后续改成 `calendarCells` 标记；第一阶段建议后端返回 `weekend`，前端 mapper 统一处理。

### 后端 Service

新增：

- `pbs-server/src/routes/bidding-calendar.ts`
- `pbs-server/src/services/calendar/bidding-calendar-service.ts`
- `pbs-server/src/services/calendar/bidding-calendar-mappers.ts`（如逻辑增多再拆）

聚合步骤：

1. 复用 `resolveCurrentPeriod` 和 `loadExistingBid`。
2. 从 `pbs_bid_day_off` 读取当前 bid 的具体 day-off bid。
3. 从 `pbs_bid_group` 读取当前 bid 中 `bid_type = 'Pairing'` 且代表 specific pairing 的 property。
4. 解析 pairing id/label 后查询 live schema 的 `pairing` 与 `pairing_segment`，生成日期跨度 event。
5. 尝试读取 planned absence 数据源；第一阶段如果 `roster_publish` 为空或 `roster_flight` 无权限，返回 warning，不让接口失败。
6. 由 periodCode 计算 weekend event 或 weekend cell marker。

性能要求：

- 避免每条 pairing 单独查 segment，必须批量查询。
- day-off、pairing bid、planned absence 可以并行查询。
- 没有 existing bid 时仍返回 weekend 和空业务 events。
- 目标接口耗时保持在 2 秒内；本地数据量下应远低于该值。

### 前端接入

新增：

- `pbs-portal/src/shared/services/bidding-calendar-service.ts`
- `pbs-portal/src/features/dashboard/hooks/use-bidding-calendar.ts`
- `pbs-portal/src/features/dashboard/bidding-calendar-mappers.ts`

调整：

- `DashboardSchedulePanel` 默认读取综合日历接口。
- `editableDaysOffCalendar` 仍保留当前 day-off draft 查询和保存逻辑。
- 非 `/days-off` 页面只读展示综合日历。
- `/days-off` 页面点击日期后，保存仍走 `/calendar-days-off/current`；保存成功后同时 invalidate：
  - `calendar-days-off/current`
  - `bidding-calendar/current`
  - Tier 页面 query

UI 映射：

- `day_off_bid`：绿色，label `Off`。
- `pairing_bid`：蓝色，label 使用 pairing label/id。
- `planned_absence`：黄色，label 使用 `ANNUAL LEAVE`、`VACATION`、`TRAINING` 等源数据 label。
- `weekend`：弱背景或 muted marker，不抢占业务 event 层级。

## 测试计划

### 后端

- `GET /api/bidding-calendar/current` 无 existing bid 时返回 period、weekend、空业务 events。
- 有 `pbs_bid_day_off` 时返回 `day_off_bid` events。
- 有 Pairing ID bid 时批量查询 live pairing/segment 并返回 `pairing_bid` events。
- live planned absence 数据源无权限时接口返回 200 且包含 warning。
- 旧 `Lx` 不进入新 contract；所有 tier 标签使用 `Tx`。
- `npm test`
- `npm run build`

### 前端

- 左侧日历在 Pairing/Tier/Dashboard 页面显示综合日历 events。
- Days Off 页面仍能点击日期 add/delete day-off bid。
- day-off 保存后综合日历刷新。
- `/calendar-days-off/current` 失败时展示当前错误态；`bidding-calendar/current` planned absence warning 不导致整页失败。
- `npm test`
- `npm run lint`
- `npm run build`

### 全量

- 根目录运行 `npm run verify:pbs`。

## 验收标准

1. 左侧 `BIDDING CALENDAR` 不再只依赖 day-off draft。
2. 当前 Tier 下的具体 day-off bid 能显示为 Off，且不会被误标成 DO。
3. 当前 Tier 下的 specific pairing bid 能显示 pairing label/id 和覆盖日期。
4. planned absence 数据不可用时，页面不 500，不显示假数据。
5. Days Off 编辑功能不回退。
6. 全部 PBS 验证通过。

## 关键假设

1. `property_code = 128` 是当前已实现的 specific pairing bid 主入口。
2. live schema 可由 `PBS_SCHEMA.replace(/_pbs$/i, "")` 推导，例如 `f8_pbs -> f8`。
3. planned absence 第一阶段允许只做可用则展示、不可用则降级；后续如果用户提供明确数据表或授权，再补完整映射。
4. AA 原文的 `Layer` 在代码和 UI 中继续映射为本项目 `Tier`。

## 需要确认

本设计建议第一阶段先做到：

- 显示 day-off bid。
- 显示 specific Pairing ID bid。
- weekend 视觉标识。
- planned absence 只预留和降级，不因为权限缺失阻塞。

如果后续要完整显示 planned absence，需要先确认生产/测试库中计划缺勤的权威表，以及 `f8_pbs` 服务账号是否应获得对应 select 权限。
