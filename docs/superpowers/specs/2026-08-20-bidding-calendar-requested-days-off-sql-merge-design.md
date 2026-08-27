# Bidding Calendar Requested Days Off SQL 合并优化设计

## 背景

`pbs-server/src/services/calendar/bidding-calendar-service.ts` 中的 `loadRequestedDayOffCountsByDate` 当前为了计算左侧日历的 `requestedDayOffCount`，会并行执行两段 SQL：

- 第一段读取 `pbs_bid_group` 中的 `Prefer Off` / Days Off bid group 配置，再在 TypeScript 中展开日期。
- 第二段读取 `pbs_bid_day_off` 中已落表的具体 day-off 日期。

两段 SQL 都重复构造：

- `actor_identity`
- `actor_scope`
- `scoped_bids`

上一阶段已经把过滤条件从 `bid.period_code` 修正为 `bid.roster_period_id`，period identity gate 已通过。现在可以继续做 SQL round trip 和重复 CTE 的 simplify。

## 目标

- 将 requested days-off count 的两段 SQL 合并成一段 SQL。
- 共享 `actor_identity`、`actor_scope`、`scoped_bids` CTE，减少一次 DB round trip 和重复 scope 计算。
- 保持最终 `Map<date, requestedCrewCount>` 完全一致。
- 保持同一 crew 在同一天多处申请只计一次的去重逻辑。
- 不改变 `/api/bidding-calendar/current` response contract。

## 非目标

- 不改 `loadDayOffCapacityRows` 的 capacity 主 SQL。
- 不新增数据库索引。
- 不把 TypeScript 日期展开逻辑迁入 SQL。
- 不改 days-off bid 保存逻辑。
- 不改 UI。

## 方案比较

### 方案 A：只串行复用 TypeScript 层 actor scope

做法：

- 先查询 actor scope。
- 后续两个 SQL 只接收 base/division。

优点：

- SQL 比较容易理解。

缺点：

- 仍然是三次 DB round trip。
- 没有解决 requested count 两段查询重复读取 `pbs_bid` 的问题。

结论：不推荐。

### 方案 B：单 SQL + `source_kind` union，TypeScript 继续展开日期

做法：

- 一个 SQL 内共享 `actor_identity`、`actor_scope`、`scoped_bids`。
- 用 `union all` 返回两类 rows：
  - `source_kind = 'group'`：来自 `pbs_bid_group`，返回 `operator/param_a/param_b`。
  - `source_kind = 'date'`：来自 `pbs_bid_day_off`，返回 `bid_date`。
- TypeScript 仍按现有逻辑处理：
  - group rows 使用 `extractPreferOffCalendarDates` 展开日期。
  - date rows 使用 `normalizePgDate`。
  - 最终用 `Map<string, Set<string>>` 按 date + crew 去重。

优点：

- 只改一处 SQL 和一处 row 类型。
- 保留现有业务日期展开逻辑，行为风险低。
- 真实减少一次 DB round trip 和一套重复 CTE。

缺点：

- SQL 返回 row 需要用 `source_kind` 分流。

结论：推荐。

### 方案 C：全部在 SQL 内展开并聚合

做法：

- SQL 内直接展开 group date range，按 date/count distinct crew 聚合。

优点：

- TypeScript 逻辑最少。

缺点：

- 当前 `extractPreferOffCalendarDates` 含 weekend / partial weekend config 行为，直接搬 SQL 风险高。
- 后续业务规则调整会让 SQL 更难维护。

结论：不推荐。

## 推荐设计

采用方案 B。

### 类型调整

用一个统一 row type 替换当前两个 row type：

```ts
type RequestedDayOffSqlRow = QueryResultRow & {
  source_kind: "group" | "date";
  crew_id: string | null;
  operator: string | null;
  param_a: string | null;
  param_b: string | null;
  bid_date: string | Date | null;
};
```

### SQL 结构

保留共享 CTE：

- `actor_identity`
- `actor_scope`
- `scoped_bids`

最终查询：

```sql
select
  'group'::varchar as source_kind,
  scoped_bids.crew_id::varchar as crew_id,
  bid_group.operator::varchar as operator,
  bid_group.param_a::varchar as param_a,
  bid_group.param_b::varchar as param_b,
  null::varchar as bid_date
from scoped_bids
join ...

union all

select
  'date'::varchar as source_kind,
  scoped_bids.crew_id::varchar as crew_id,
  null::varchar as operator,
  null::varchar as param_a,
  null::varchar as param_b,
  day_off.bid_date::text as bid_date
from scoped_bids
join ...
```

`bid_date` 必须统一成 text，避免 `union all` 后 PostgreSQL/pg 驱动把 `date` 列反序列化为本机时区的 `Date`
对象，导致 `normalizePgDate` 在非 UTC 本机上切到前一天。

参数保持：

```ts
[rangeStart, rangeEnd, actor.crewId, actor.userCode, rosterPeriodId]
```

### TypeScript 处理

- `source_kind === "group"`：调用 `extractPreferOffCalendarDates`。
- `source_kind === "date"`：调用 `normalizePgDate(row.bid_date)`。
- 所有写入仍通过 `addRequestedDayOffDate`，继续按 date + crew 去重。

## 测试策略

更新 `bidding-calendar-service.test.ts`：

- `queries.length` 从 3 改为 2：
  - capacity 主 SQL
  - requested day-off 合并 SQL
- 断言合并 SQL 只出现一套 `actor_scope` / `scoped_bids`。
- 断言合并 SQL 包含：
  - `union all`
  - `pbs_bid_group bid_group`
  - `pbs_bid_day_off day_off`
  - `bid.roster_period_id = $5::bigint`
- 断言 requested day-off 合并 SQL 参数仍为：
  - `[rangeStart, rangeEnd, actor.crewId, actor.userCode, rosterPeriodId]`
  - 特别确认 `$5` 传入的是 `rosterPeriodId`，不是 `periodCode`。
- mock 合并 SQL 返回必须同时包含：
  - `source_kind = 'group'` rows，用于覆盖 `extractPreferOffCalendarDates` 分支。
  - `source_kind = 'date'` rows，用于覆盖 `normalizePgDate(row.bid_date)` 分支。
- 断言 group rows 和 date rows 都参与最终 `requestedDayOffCount`。
- 保持 expected `requestedDayOffCount` 不变：
  - `2026-04-05` 仍为 2
  - `2026-04-06` 仍为 3
- 保持 `loadSafeDayOffCapacityRows` 错误降级测试。

## 性能验证

这是 SQL rewrite，除单元测试外，需要做真实数据库验证：

- 使用远端权威 PostgreSQL 真实数据。
- 对旧 SQL 两段和新 SQL 一段分别跑 `EXPLAIN (ANALYZE, BUFFERS)`。
- 记录：
  - round trip 从 2 次 requested query 降到 1 次。
  - CTE / scoped bid 计算从重复两次变成一次。
  - 返回 row 数量与 TypeScript 最终 count 对比一致。

本地 explain 只能辅助，不作为验收依据。

## 验收标准

- `/api/bidding-calendar/current` response contract 不变。
- `requestedDayOffCount` 测试结果不变。
- 同一 crew 同一天多来源、多 tier、多 row 仍只计一次。
- `loadRequestedDayOffCountsByDate` 只调用一次 `pgPool.query`。
- `pbs-server` typecheck 通过。
- 远端真实数据 explain / row diff 结果记录在最终交付说明中。

## 风险与控制

- 风险：`union all` row 分流写错导致 group/date 互相污染。
  - 控制：使用明确 `source_kind`，测试同时覆盖 group rows 和 date rows。
- 风险：SQL 合并后异常会让两类 requested rows 一起失败。
  - 控制：当前两段 SQL 是同一业务统计，任何一个失败都会影响 count；外层仍由 `loadSafeDayOffCapacityRows` 降级保护 calendar 可用。
- 风险：真实 DB 上计划没有明显收益。
  - 控制：如果 explain 显示收益很小，也仍然可以接受为 simplify；但不得声称大性能提升。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在一个函数和一个测试文件，多 agent 会增加合并成本。
- Suggested split: 不拆分。
- Write boundaries: `pbs-server/src/services/calendar/bidding-calendar-service.ts` 和 `pbs-server/src/services/calendar/bidding-calendar-service.test.ts`。
- Conflict risk: Low。
- Execution gate: 用户确认本 spec 后实施。
