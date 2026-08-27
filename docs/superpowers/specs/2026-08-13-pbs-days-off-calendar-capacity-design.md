# PBS 左侧日历 Days Off 容量显示设计

日期：2026-08-13
状态：已确认，按 `申请人数/容量` 方案实施
范围：PBS Portal 左侧 `BIDDING CALENDAR` 每日 Days Off 容量展示；扩展 `pbs-server` 当前 bidding calendar 接口；不改变 bid 保存、算法导出、已有 Days Off / Pairing 日历编辑行为。

## 1. 背景

用户希望在左侧日历上看到“每天已有多少人申请 Days Off / 当天最多允许多少人 Days Off”。这个指标用于辅助 crew 在 PBS 里判断某天 Days Off 申请压力和剩余空间。

确认后的业务口径使用“岗位 / 覆盖需求人数”，不是“当前已经排给人的人数”。

公式：

```text
每天最多 Days Off =
  总人数
  - 当天 pairing 岗位需求人数
  - 当天 reserve 岗位需求人数
  - 当天 pre-assigned days off 人数
```

最终展示值小于 0 时按 0 显示。

## 2. 关键口径

### 2.1 为什么扣岗位需求，不扣已排人数

“已排人数”只反映当前 `roster_flight` 已经分配出去多少 crew。如果当天还有未覆盖的 pairing / reserve 需求，按已排人数扣会高估可放假的人数。

本需求要回答的是“最多还能给多少人放 Days Off，同时仍能满足当天生产需求”，所以应扣当天业务需求人数。

### 2.2 字段定义

后端新增每日容量数组，建议 contract 字段：

```ts
type PbsBiddingCalendarDayOffCapacity = {
  date: string;
  requestedDayOffCount: number;
  totalCrewCount: number;
  pairingDemandCount: number;
  reserveDemandCount: number;
  preAssignedDayOffCount: number;
  maxDaysOffCount: number;
};
```

`PbsBiddingCalendarCurrentResponse` 新增：

```ts
dayOffCapacity?: PbsBiddingCalendarDayOffCapacity[];
```

字段含义：

- `date`：bid period 内日期，`YYYY-MM-DD`。
- `requestedDayOffCount`：当天已经申请 Days Off 的 crew 人数，按同一日期同一 `crew_id` 去重；同一个 crew 在 T1/T2 同时申请同一天只算 1 人。
- `totalCrewCount`：当前 PBS 用户所属 base + division 下，当天有效 crew 总数。
- `pairingDemandCount`：当天 flying pairing 的岗位需求人数，按 `pairing_composition.plan` 汇总。
- `reserveDemandCount`：当天 reserve pairing 的岗位需求人数，按 `pairing_composition.plan` 汇总。
- `preAssignedDayOffCount`：当天已经预分配 Days Off 的 crew 数。
- `maxDaysOffCount`：按公式计算后的容量值，最小为 0。

### 2.3 暂定数据来源

当前已有 `Reserve Coverage` SQL 可以复用部分口径，但不能直接复用最终结果。它已经实现了：

- 从当前 actor 找 base / division。
- 按日期找 active crew。
- 识别 reserve pairing。
- 按 `pairing_composition` 汇总 reserve need。

本需求应在 `pbs-server/src/services/calendar/bidding-calendar-service.ts` 的当前日历服务中新增聚合，优先复用同类 SQL 口径。

初始数据来源建议：

- actor scope：
  - `pbs_user.division`
  - live `crew_base` 当前 prime base
- active crew：
  - live `crew`
  - live `crew_base`
  - 按日期判断 `empl_dt` / `term_dt` / `retire_dt` 和 base effective range
- pairing / reserve demand：
  - live `pairing`
  - live `pairing_composition`
  - `pairing.is_deleted = 0`
  - `pairing_composition.is_deleted = 0`
  - `pairing.base = actor base`
  - `pairing.division = actor division`
  - reserve 判断沿用 Reserve Coverage 口径：`pairing.assignment_group = 'RES'` 或 `pairing.assignment` 命中 `dictionary parent_code = 'RES_CALL_TYPE'`
  - 非 reserve 的 flying pairing 计入 `pairingDemandCount`
- pre-assigned days off：
  - live `roster_flight`
  - `is_deleted = 0`
  - `source = 'IMP'`
  - `assignment = 'DO'`
  - 按当天 distinct `crew_id` 计数
- requested days off：
  - PBS `pbs_bid`
  - PBS `pbs_bid_group`
  - PBS `pbs_bid_day_off`
  - 仅统计同 period、`bid_context='Current'`、状态为 `DRAFT/SUBMITTED/LOCKED` 的 bid
  - crew 范围按当前 actor 所属 base + division 过滤
  - `pbs_bid_group` 使用现有 Prefer Off 日期解析器展开 `In`、`Between`、`Weekends`
  - `pbs_bid_day_off` 作为具体日期明细合并
  - 最终按 `date + crew_id` 去重

> 风险说明：真实数据中近 120 天 `roster_flight` 的 `DO/FLY/RES/VAC/...` 都来自 `source='IMP'`。因此 `source='IMP' and assignment='DO'` 是当前最符合“pre-assigned days off”的实现候选；实施前如果产品另有 source / assignment 口径，应以产品口径覆盖。

## 3. 后端设计

### 3.1 Contract

更新：

- `packages/contracts/pbs-bidding-calendar.d.ts`
- `packages/contracts/pbs-bidding-calendar.js` 如需要运行时导出字段则同步

新增 `PbsBiddingCalendarDayOffCapacity` 类型，并把 `dayOffCapacity` 加入 `PbsBiddingCalendarCurrentResponse`。字段必须包含 `requestedDayOffCount` 和 `maxDaysOffCount`，供前端直接展示 `requested/max`。

### 3.2 Service

在 `pbs-server/src/services/calendar/bidding-calendar-service.ts` 中新增容量聚合逻辑。

建议新增内部函数：

```ts
loadDayOffCapacityRows({
  actor,
  periodCode,
  rangeStart,
  rangeEnd,
  preferOffConfig,
})
```

返回整个 bid period 每一天的容量明细。即使某天没有 pairing / reserve / pre-assigned DO，也返回一行，保证前端可以稳定按日期 lookup。

计算建议使用一个 SQL：

1. `calendar`：`generate_series(rangeStart, rangeEnd, interval '1 day')`
2. `actor_scope`：当前用户 base / division
3. `active_crew_rows`：每天可用 base/division crew 集合
4. `active_crew`：每天总人数
5. `res_call_codes`：reserve call type 字典
6. `pairing_demand`：
   - 找当天覆盖的非 reserve pairing
   - 按 `pairing_composition.plan` 汇总
7. `reserve_demand`：
   - 找当天 reserve pairing
   - 按 `pairing_composition.plan` 汇总
8. `pre_assigned_day_off`：
   - live `roster_flight`
   - `assignment = 'DO'`
   - `source = 'IMP'`
   - distinct crew
9. 读取当前周期所有同 base/division crew 的 Current Days Off 申请，展开日期后按 `date + crew_id` 去重，得到 `requestedDayOffCount`
10. 最终 select 计算 `maxDaysOffCount`，再合并 `requestedDayOffCount`

`pairing` 的日期覆盖应按 pairing 的本地日期范围处理。若当前已有 pairing period 查询使用 `pairing.pairing_dt`，实现可先按 `pairing.pairing_dt` 归属当天；若需要覆盖多日 pairing，则用 pairing start/end 本地日期展开。实施时必须在 spec/代码注释里明确最终采用哪一种，避免“跨日 pairing 只扣第一天”的误差。

### 3.3 Error / Warnings

如果 actor base / division 缺失：

- 当前日历接口已有 `currentPeriod` 和 events；不建议整个接口 409。
- 推荐返回空 `dayOffCapacity`，并追加 warning：`Days off capacity is unavailable because current user base or division is missing.`

如果 live roster / pairing source 查询失败：

- 当前接口应继续返回基础日历 events。
- 推荐追加 warning，并返回空 `dayOffCapacity`。

这样左侧日历不会因为容量统计失败而整块不可用。

## 4. 前端设计

### 4.1 数据映射

更新：

- `pbs-portal/src/features/dashboard/bidding-calendar-mappers.ts`
- `pbs-portal/src/shared/components/schedule/types.ts`

给 `ScheduleCalendarCell` 增加可选字段：

```ts
dayOffCapacity?: {
  requestedDayOffCount: number;
  maxDaysOffCount: number;
  totalCrewCount: number;
  pairingDemandCount: number;
  reserveDemandCount: number;
  preAssignedDayOffCount: number;
};
```

mapper 根据 `dayOffCapacity.date` 建 map，把当前 period 的日期格子补上容量信息。

### 4.2 UI 展示

更新：

- `pbs-portal/src/shared/components/schedule/schedule-event-calendar.tsx`

每个非 muted 日期格子底部居中显示一个小型只读指标。文案：

```text
23/33
```

视觉位置：

- 日期格子底部左右居中。
- 使用现有 Days Off `Off` event 的绿色。
- 不显示 `DO` 前缀。
- 使用紧凑 badge，尽量不遮挡现有 `Off` / pairing event bar。
- 不影响现有日期点击热区；badge 自身不做按钮。
- `aria-label` / `title` 使用完整说明，例如：
  `Days off requests for 2026-06-01: 23 of 33. Total crew 120, pairing demand 69, reserve demand 8, pre-assigned days off 10.`

如果容量缺失：

- 不显示 badge。
- 不显示错误红字。
- 顶层 warning 是否展示维持现有日历 warning 策略；本次不新增单独 popup。

### 4.3 交互不变

不能改变：

- `/bid` 和 `/days-off` 左侧日历点击日期添加 Days Off 的行为。
- `/bid` 和 `/pairing` 左侧日历点击日期添加 Pairing bid 的行为。
- 现有 `Off` / pairing event bar 的展示和点击编辑。
- 当前 tier 选择、collapse / expand 状态、calendar draft overlay。

## 5. 影响文件

预计修改：

- `packages/contracts/pbs-bidding-calendar.d.ts`
- `packages/contracts/pbs-bidding-calendar.js`
- `pbs-server/src/services/calendar/bidding-calendar-service.ts`
- `pbs-server/src/services/calendar/bidding-calendar-service.test.ts`
- `pbs-server/src/routes/bidding-calendar.test.ts`
- `pbs-portal/src/features/dashboard/bidding-calendar-mappers.ts`
- `pbs-portal/src/features/dashboard/bidding-calendar-mappers.test.ts`
- `pbs-portal/src/shared/components/schedule/types.ts`
- `pbs-portal/src/shared/components/schedule/schedule-event-calendar.tsx`
- `pbs-portal/src/shared/components/schedule/schedule-event-calendar.test.tsx`
- `pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx`
- 可能新增 / 更新 `e2e/tests/pbs-portal/...` 覆盖真实日历展示

不修改：

- Days Off bid 保存 contract
- Days Off algorithm export CSV
- Pairing bid 保存 contract
- Reserve Coverage 页面交互
- `sql/schema`

## 6. 验收标准

1. 左侧 `BIDDING CALENDAR` 的 bid period 日期格子显示 Days Off 申请人数 / 最大容量，例如 `23/33`。
2. `requestedDayOffCount` 和 `maxDaysOffCount` 都来自后端 `dayOffCapacity`，不是前端根据 visible event 猜算。
3. 公式使用岗位需求人数：
   - flying pairing demand
   - reserve demand
   - pre-assigned DO
4. 同一 crew 在多个 tier 申请同一天，只计 1 个申请人。
5. 容量数字最小显示 0，不显示负数。
6. 容量缺失时日历仍可用，不影响添加 / 编辑 Days Off 和 Pairing bid。
7. 现有日历事件条、tier 矩阵、日期点击、weekday 批量 Days Off、collapse / expand 不回归。

## 7. 验证计划

后端：

- `pnpm --dir pbs-server test -- --runTestsByPath src/services/calendar/bidding-calendar-service.test.ts`
- `pnpm --dir pbs-server test -- --runTestsByPath src/routes/bidding-calendar.test.ts`
- 如果 test runner 不支持 `--runTestsByPath`，使用项目现有 focused node test 命令替代。

前端：

- `pnpm --dir pbs-portal exec vitest run src/features/dashboard/bidding-calendar-mappers.test.ts`
- `pnpm --dir pbs-portal exec vitest run src/shared/components/schedule/schedule-event-calendar.test.tsx`
- `pnpm --dir pbs-portal exec vitest run src/app/layout/shared-bidding-workbench-layout.test.tsx`
- `pnpm --dir pbs-portal run build`
- `npm run check:ui`
- `git diff --check`

E2E：

- 新增或更新 PBS Portal Playwright：打开共享 workbench 左侧日历，断言某个日期显示 `requested/max`，例如 `23/33`，并继续验证点击日期添加 Days Off / Pairing bid 仍可操作。

数据库只读验证：

- 使用远端 live schema，对新增容量 SQL 做最小只读执行或 `EXPLAIN`，确认能在当前 bid period 返回每日行，且不会全表无界扫描。

## 8. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 该需求核心是一个后端聚合口径和一个共享日历展示点，contract 会同时牵动前后端；单人顺序实现更容易保证口径一致。
- Suggested split: 不拆。
- Write boundaries: contract、pbs-server calendar service/test、pbs-portal mapper/calendar UI/test、E2E。
- Conflict risk: 中等。当前工作区已有 Bid Feedback 相关未提交改动，实施时必须只 stage 本需求文件。
- Execution gate: 用户确认本 spec 后再实施。
