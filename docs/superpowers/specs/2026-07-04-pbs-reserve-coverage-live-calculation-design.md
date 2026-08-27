# PBS Reserve Coverage 实时计算与临时表废弃设计

日期：2026-07-04  
状态：待用户确认  
范围：`pbs-server` Reserve Coverage API、PBS schema cleanup、相关测试与文档  

## 1. 背景

PBS Portal 的 Reserve 页面当前展示 `Need / Off`，但现有实现不是实时统计：

- 前端 `reserveService.getCoverage()` 调用 `GET /reserve-bids/current/coverage`。
- 后端 `reserve-coverage-service` 读取 `pbs_reserve_coverage`。
- `pbs_reserve_coverage` 是早期为了让页面先显示数字而创建的临时/seed 表。
- 旧设计文档明确写过第一阶段通过 seed / data-fix 固定写入 coverage 数据。
- 截图里的 `Need / Off` 数字符合 seed 公式，不是 live 业务数据。

这张表继续保留会误导后续开发，让开发者以为它是权威 reserve coverage 数据源。因此本设计要求废弃并删除该表，不做兼容 fallback。

## 2. 目标

1. Reserve 页面继续展示每日 `Need / Off`。
2. `Need / Off` 改为由 `pbs-server` 从 live 数据按请求实时计算。
3. 删除 `pbs_reserve_coverage` 表、Drizzle model 和读表 service 依赖。
4. 不保留旧表兼容逻辑；如果新计算无法得到数据，应返回明确 warning，而不是回退到 seed。
5. 计算必须满足性能要求，不能为了一个月日历做 N+1 查询或全量扫描。

## 3. 非目标

- 不改 Reserve bid 保存结构，`301/302/311` 等 property 语义不变。
- 不改 Live Gantt 的 RES Pairing Creator 交互。
- 不新增 websocket 或秒级自动刷新；第一版是“每次请求实时计算”。
- 不把计算结果重新落回 `pbs_reserve_coverage` 或新建替代表。
- 不支持跨航司硬编码；live schema 由 `PBS_SCHEMA` 推导，例如 `f8_pbs -> f8`。

## 4. 业务口径

### 4.1 Need

`Need` 表示当天该 base/division 的 reserve 总计划需求。

推荐计算：

```text
requiredReserveCount = SUM(pairing_composition.plan)
```

筛选条件：

- live `pairing.is_deleted = 0`
- live `pairing.assignment_group = 'RES'`
- 或 `pairing.assignment` 属于 `RES_CALL_TYPE` 解析出的 call code：`PRAM/PRPM/CRAM/CRPM/...`
- `pairing.pairing_dt` 落在当前 bid period 对应月份。
- `pairing.base = actor.base`
- `pairing.division = actor.division`
- `pairing_composition.is_deleted = 0`

说明：

- 展示的 `Need` 用 `plan`，不是 `open`。
- `plan` 是业务需求；`fill` 是已分配人数；`open = plan - fill` 是剩余未填槽位。

### 4.2 Off

`Off` 表示“还可以额外批准休息的人数额度”，不是当前已经休息的人数。

推荐计算：

```text
availableOffCount =
  max(activeCrewCount - unavailableCrewCount - openReserveNeed - safetyBuffer, 0)
```

字段定义：

- `activeCrewCount`：当天该 base/division 有效机组人数。
- `unavailableCrewCount`：当天已经不可再批准休息的人数，包括已排飞、地面任务、已休息、年假/病假、已排 reserve 等。
- `openReserveNeed`：当天 reserve 还没有填满的需求槽位，使用 `SUM(pairing_composition.open)`。
- `safetyBuffer`：安全余量。第一版为 `0`，不新增配置项；后续如业务确认需要，再通过 dictionary 参数化。

为什么 Off 使用 `openReserveNeed` 而不是 `requiredReserveCount`：

- 如果 reserve 已经分配给某些 crew，这些 crew 已经计入 `unavailableCrewCount`。
- 再减总 `plan` 会重复扣减已填 reserve。
- 减 `open` 可以表达“还需要保留多少人去填 reserve 缺口”。

## 5. 数据来源

### 5.1 当前用户范围

Reserve Coverage 必须按当前 PBS 用户定位 base/division：

- 从 `f8_pbs.pbs_user` 按 `crew_id = actor.crewId` 读取 `base` 和 `division`。
- 不再使用 `baseCode = 'F8'` 这种全航司硬编码。
- 若 `base` 或 `division` 缺失，返回空 days + warning，提示用户 profile/sync 数据不完整。

### 5.2 当前月份范围

沿用现有 `resolveCurrentPeriod()` 得到 `periodCode`。

月份边界规则：

- `Jun 2026` -> `2026-06-01 <= date < 2026-07-01`
- 若 periodCode 无法解析，返回 warning，不回退旧表。

### 5.3 Need / openReserveNeed 来源

从 live schema 查询：

- `pairing`
- `pairing_composition`
- `dictionary`（读取 `RES_CALL_TYPE`，避免硬编码 call code）

按日期聚合：

```text
date
SUM(plan) as requiredReserveCount
SUM(open) as openReserveNeed
```

### 5.4 activeCrewCount 来源

从 live schema 查询：

- `crew`
- `crew_base`

按日期和用户 base/division 匹配有效 crew：

```text
crew.division = actor.division
crew_base.base = actor.base
crew_base.eff_dt <= date
crew_base.exp_dt is null or crew_base.exp_dt >= date
```

实现时应复用或对齐现有 crew/base 有效期判断，不重新发明不同规则。

### 5.5 unavailableCrewCount 来源

优先使用 live manday daily 表，因为它已经是按 crew/day 聚合后的可用性结果，避免扫描 `roster_flight` 明细：

- Pilot：`crew_manday_fd_daily`
- Cabin：`crew_manday_cc_am_daily`

按 division 选择对应表。

建议不可用判断：

```text
is_day_off = 1
or is_leave = 1
or is_al = 1
or standby > 0
or ground > 0
or credit > 0
or blh > 0
```

说明：

- 对 FD 表使用 `is_al`；对 CC 表使用 `is_leave`。
- `standby/ground/credit/blh` 覆盖已排工作、reserve、地面任务等。
- 如果某 crew 当天没有 manday row，则默认不计入 unavailable；是否应视为可用由 active crew 计算承担。

## 6. 推荐技术方案

### 方案 A：按请求实时聚合 live 数据（推荐）

`pbs-server` 的 `getCurrentCoverage()` 不再读 `pbs_reserve_coverage`，而是执行一次聚合查询：

1. 解析 current period 和 actor scope。
2. 用 `generate_series(month_start, month_end - 1 day)` 生成日历天。
3. CTE 计算 active crew。
4. CTE 计算 unavailable crew。
5. CTE 计算 reserve plan/open。
6. 最终 left join 到 calendar，返回 28-31 行。

优点：

- 没有临时表和同步延迟。
- 数据口径直接来自 live 排班和 RES pairing。
- 删除旧表后不会误导开发。

缺点：

- 每次请求会查 live 数据，需要严格控制 SQL 和索引。

### 方案 B：后台同步生成 coverage 快照（不推荐）

定时或事件触发把 live 统计写入一张新 coverage 表。

优点：

- 页面读取快。

缺点：

- 又引入一张容易误解为权威来源的表。
- 需要解决同步延迟、失效、重算和修复。
- 与用户“不保留误导表”的方向冲突。

### 方案 C：继续旧表 + 新计算 fallback（不采用）

新计算失败时回退旧 `pbs_reserve_coverage`。

不采用原因：

- 保留旧表会继续误导开发。
- 数据口径不一致，用户会看到不可解释的数字跳变。

## 7. 性能设计

### 7.1 查询原则

- 禁止按天循环查询。
- 禁止按 crew 循环查询。
- 禁止在 `pbs-server` 中拉全量数据到 JS 再过滤。
- 单次请求最多执行少量聚合 SQL，返回 28-31 行。
- 只查当前 actor 的 `base + division + month`，不查全航司。

### 7.2 SQL 形态

推荐单 SQL / 少 SQL CTE：

```text
calendar(date)
actor_scope(base, division)
res_call_codes(code)
reserve_need(date, required_reserve_count, open_reserve_need)
active_crew(date, active_crew_count)
unavailable_crew(date, unavailable_crew_count)
final(date, requiredReserveCount, availableOffCount)
```

### 7.3 索引与 EXPLAIN

实现前先用远端库 `EXPLAIN (ANALYZE, BUFFERS)` 验证查询计划。

预期优先利用现有索引：

- `pairing`：按 `pairing_dt/base/division/is_deleted/assignment` 过滤。
- `pairing_composition`：按 `pairing_id/is_deleted` 连接。
- `crew_base`：按 `base/crew_id/eff_dt/exp_dt` 有效期过滤。
- `crew_manday_*_daily`：按 `crew_base_dt` 过滤，并按 `crew_id` join。

若 EXPLAIN 证明现有索引不足，再新增最小必要索引。不要预先加一组猜测索引。

### 7.4 响应 SLA

目标：

- 远端开发库单次 coverage 请求 p95 < 500ms。
- 返回 payload 固定 28-31 行。
- 不影响 PBS Portal 首屏其他请求。

### 7.5 缓存策略

第一版不在服务端增加缓存。

原因：

- 用户明确希望实时变化。
- live roster / RES pairing / manday 更新来源多，跨服务精准失效复杂。
- 计算范围很小，优先用 SQL 优化解决。

前端可保留当前 TanStack Query 行为：`staleTime = 60_000`。这表示页面不是秒级自动刷新，但每次重新请求都会按 live 数据实时计算。

## 8. API 契约

保持现有 response shape，不改前端组件契约：

```ts
type PbsReserveCoverageResponse = {
  periodCode: string;
  baseCode: string;
  days: Array<{
    date: string;
    requiredReserveCount: number;
    availableOffCount: number;
  }>;
  warnings: string[];
};
```

变化：

- `baseCode` 从当前用户 `pbs_user.base` 来，不再固定为 `F8`。
- `days[].requiredReserveCount` 由 live RES pairing plan 计算。
- `days[].availableOffCount` 由实时可批准休息额度计算。
- 若没有 RES pairing，`Need = 0`；不是错误。
- 若 actor scope 缺失或 period 无法解析，返回 warning。

## 9. 删除旧表范围

需要删除或替换：

- `pbs-server/src/models/pbs/pbs-reserve-coverage.ts`
- `pbs-server/src/models/index.ts` 中对应 export
- `pbs-server/src/services/reserve/reserve-coverage-service.ts` 中读表逻辑
- `sql/schema/pbs/01-pbs.sql` 中 `pbs_reserve_coverage` 建表段
- 新增 migration：`drop table if exists <pbs_schema>.pbs_reserve_coverage`
- 更新测试中“DB-backed reserve coverage counts”这类旧表假设

不做：

- 不保留旧 model。
- 不保留旧 table fallback。
- 不新增 replacement table。

## 10. 测试策略

### 10.1 后端自动化

新增/更新 focused tests：

1. actor 有 base/division 时，coverage service 使用 actor scope 查询 live schema。
2. `Need` 使用 `SUM(plan)`。
3. `Off` 使用 `active - unavailable - openReserveNeed - buffer`，并下限归零。
4. 已填 reserve 不被重复扣减：`openReserveNeed` 小于 `requiredReserveCount` 时，Off 按 open 计算。
5. periodCode 无法解析时返回 warning。
6. 缺少 actor base/division 时返回 warning。
7. 删除 `pbs_reserve_coverage` 后 route/service 不再引用该 model。

### 10.2 前端测试

如果 response shape 不变，Reserve 页面组件不需要大改；更新现有 mock 数字即可。

至少保留：

- Reserve 页面能显示 API 返回的 `Need / Off`。
- loading / warning 状态仍正常。

### 10.3 QA 人工测试用例

新增：

```text
docs/test-cases/pbs/reserve/<YYYY-MM-DD>-reserve-coverage-live-calculation.md
```

覆盖：

- 有 RES pairing 的 base/division 显示非零 Need。
- 修改 Live RES pairing plan 后，重新请求 Reserve coverage，Need 变化。
- 修改 roster/manday 后，重新请求 Reserve coverage，Off 变化。
- 无 RES pairing 的 base/division，Need 为 0 且页面不报错。
- 用户 base/division 缺失时显示明确 warning。

## 11. 风险与待确认

### 11.1 Off 口径风险

`availableOffCount` 是业务决策字段。当前推荐公式是：

```text
max(activeCrewCount - unavailableCrewCount - openReserveNeed, 0)
```

这表示“还能额外批准休息的人数”。如果业务希望展示“当天总休息容量”，则公式应改为：

```text
max(activeCrewCount - unavailableCrewCount_without_existing_off - openReserveNeed, 0)
```

本设计默认采用“还能额外批准休息的人数”。

### 11.2 manday 数据新鲜度

`unavailableCrewCount` 依赖 manday daily。Live 保存/导入后 manday 应同步更新；若某些写入路径没有触发 manday recompute，Off 会短暂不准。

实现时需要确认：

- Live roster mutation 后 manday daily 已刷新。
- RES pairing 分配/取消后 `pairing_composition.fill/open` 已刷新。

### 11.3 跨 schema 查询

`pbs-server` 需要从 `f8_pbs` 查询 PBS 用户/period，同时 schema-qualified 查询 live `f8` 表。必须校验 schema identifier，禁止拼接未校验字符串。

## 12. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这是单条后端数据链路改造，核心风险在业务口径和 SQL 性能；拆给多个 agent 会增加口径不一致风险。
- Suggested split: 不拆。必要时可以把 EXPLAIN/性能验证作为只读辅助任务。
- Write boundaries: `pbs-server` service/model/tests、`sql/schema/pbs`、`sql/migration`、`docs/test-cases/pbs/reserve`。
- Conflict risk: 中等。会删除旧表和模型，影响测试和文档引用。
- Execution gate: 用户确认本 spec 后再进入 implementation plan 和代码修改。

## 13. 验收标准

1. `GET /api/reserve-bids/current/coverage` 不再引用 `pbs_reserve_coverage`。
2. `pbs_reserve_coverage` 从 schema/model 中删除，并有 drop migration。
3. `Need` 来自 live RES pairing plan 聚合。
4. `Off` 来自实时可批准休息额度公式。
5. 服务端无 N+1 查询，EXPLAIN 证明查询范围限制在 current month + actor base/division。
6. 自动化测试覆盖公式和异常路径。
7. QA 测试用例文档完成。
8. 最终交付报告包含实际验证命令和 PASS/FAIL 结果。

