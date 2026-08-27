# PBS Bidding Calendar Days Off 容量 SQL 性能优化设计

日期：2026-08-13
状态：待用户确认实施
范围：`GET /api/bidding-calendar/current` 中新增的 `dayOffCapacity` 聚合 SQL；不改变 calendar contract、前端展示样式、Days Off / Pairing bid 保存逻辑、算法导出 CSV。

## 1. 背景

新增 Days Off 容量显示后，用户反馈 `GET /api/bidding-calendar/current` 不稳定，左侧 `BIDDING CALENDAR` 会退化成空壳，月份标题显示 `-`，日历格子不出来。

排查结果：

- 前端 HTTP timeout 是 `10s`。
- 远端 DEV DB 下，YYZ crew `762` 的 `bidding-calendar/current` 约 `13.9s`，会打穿前端 timeout。
- 慢点不是原有日历 events，而是新加的 `dayOffCapacity` 计算。
- `EXPLAIN ANALYZE` 显示旧 capacity SQL 执行约 `15.9s`。
- 拆分后确认真正瓶颈是 `pre_assigned_day_off` 这段：
  - `active_crew_by_day`：约 `0.29s`
  - `pairing_windows`：约 `0.36s`
  - `pairing_days`：约 `0.45s`
  - `pairing_composition` demand：约 `0.41s`
  - `pre_assigned_day_off`：约 `11.3s`

结论：这是我们新增功能引入的性能回归。修复目标必须是让新增 capacity 不再拖坏原来的 bidding calendar 主功能，不能只靠增大前端 timeout。

## 2. 根因

当前 `pre_assigned_day_off_by_day` 的 SQL 形态是：

1. 先生成 period 内每天。
2. 每天找 active crew。
3. 对每天每个 active crew 去 join `live.roster_flight`。
4. 再过滤 `source`、`assignment`、时间 overlap。

YYZ 这种 base 下，`active_crew_by_day` 会生成约 `8130` 行。旧写法相当于把 `roster_flight` 查询放在“日期 × crew”的循环里，导致大量重复扫描。

同时旧 SQL 使用：

```sql
upper(btrim(roster_flight.source)) = 'IMP'
upper(btrim(coalesce(roster_flight.assignment, ''))) = 'DO'
```

这会让过滤条件更难利用普通索引。远端 DEV 数据验证：

- `roster_flight.source` 当前 active 行全部为 `IMP`。
- `assignment` 中 DO 行全部精确等于 `DO`，没有大小写或空格变体。
- `source_not_exact = 0`
- `assignment_not_exact = 0`
- `source` 在 schema 中已有 check 约束：`source in ('IMP', 'MA', 'CR')`

因此这两个条件可以改为直接等值：

```sql
roster_flight.source = 'IMP'
roster_flight.assignment = 'DO'
```

如果未来担心导入脏值，应在导入/同步层标准化，而不是让热查询承担字符串清洗成本。

## 3. 推荐方案

推荐先做代码级 SQL 等价优化，不先上数据库 migration。

核心变化：

1. 保持原 capacity 业务公式不变：

```text
maxDaysOffCount =
  totalCrewCount
  - pairingDemandCount
  - reserveDemandCount
  - preAssignedDayOffCount
```

2. 保持原时间 overlap 语义不变，不改成本地日期展开近似。

3. 把 `pre_assigned_day_off_by_day` 改成两阶段：

- `active_crew_ids`：先从 `active_crew_by_day` 提取本 period 涉及的 distinct crew。
- `pre_assigned_day_off_windows`：先按整个月窗口、`source='IMP'`、`assignment='DO'`、active crew 过滤 `roster_flight`。
- `pre_assigned_day_off_by_day`：再把这些已缩小的 DO roster rows 和每天做 overlap 匹配，按日期 count distinct crew。

4. 保留 `loadSafeDayOffCapacityRows` 的错误降级：capacity 查询失败时，不让整个 calendar 接口 500。

5. 本次不改变前端 fallback；接口恢复到 10 秒内后，左侧日历应正常渲染。若后续仍希望“接口失败时不显示 `-` 空壳”，另开前端错误态 hardening。

## 4. 已验证性能数据

远端 DEV DB，`2026-06-01` 到 `2026-06-30`，旧 SQL 与优化 SQL 做 byte-level row compare，5 个 base 的每日结果全部一致。

| Base | Crew | 旧 SQL | 优化 SQL | 提升 | 结果 |
| --- | --- | ---: | ---: | ---: | --- |
| YYZ | 762 | `11824ms` | `588ms` | `20.1x` | `mismatches: 0` |
| YVR | 900 | `5904ms` | `464ms` | `12.7x` | `mismatches: 0` |
| YYC | 997 | `2505ms` | `381ms` | `6.6x` | `mismatches: 0` |
| YUL | 1012 | `1095ms` | `416ms` | `2.6x` | `mismatches: 0` |
| YEG | 606 | `3272ms` | `407ms` | `8.0x` | `mismatches: 0` |

优化版 `EXPLAIN ANALYZE` 热缓存结果：

- execution time：约 `364ms`
- 主要剩余成本在 `roster_flight_crew_id_sch_str_dt_utc_idx` 上按 crew + date range 找 roster rows。
- 当前每个 YYZ crew 平均先取约 `452` 行，再过滤到约 `14` 行 DO；说明未来如果数据继续增大，partial index 仍有价值。

## 5. 是否需要数据库 migration

推荐本次不先做数据库 migration。

理由：

- 仅 SQL 改写已经把 YYZ 从 `>10s` 压到 `<1s`。
- 不需要变更 schema 就能恢复接口稳定性。
- 避免在当前 hotfix 中引入远端索引创建、SIT/UAT/DEV 同步执行、并发建索引风险。

可选后续索引：

```sql
create index concurrently if not exists idx_roster_flight_imp_do_crew_sch
on roster_flight (crew_id, sch_str_dt_utc)
include (sch_end_dt_utc)
where is_deleted = 0
  and source = 'IMP'
  and assignment = 'DO';
```

如果后续生产数据量或冷缓存下仍有明显 tail latency，再补：

- `sql/migration/YYYY-MM-DD-*.sql`
- `sql/schema/live/02-crew-roster.sql`
- 远端环境用 `CREATE INDEX CONCURRENTLY` 执行
- 前后 `EXPLAIN ANALYZE, BUFFERS` 对比

## 6. 实施范围

预计修改：

- `pbs-server/src/services/calendar/bidding-calendar-service.ts`
  - 改写 `pre_assigned_day_off_by_day` 相关 CTE。
  - 把 `roster_flight.source/assignment` 过滤改为直接等值。

- `pbs-server/src/services/calendar/bidding-calendar-service.test.ts`
  - 更新或新增 SQL shape 测试，防止回退到按天按人 join `roster_flight`。
  - 覆盖 direct equality 条件。

可选新增：

- `docs/test-cases/pbs/days-off/2026-08-13-bidding-calendar-capacity-performance.md`
  - 给 QA 记录回归范围：左侧 calendar 正常渲染、capacity badge 正常、接口不超时。

不修改：

- `packages/contracts/pbs-bidding-calendar.*`
- `pbs-portal` UI
- Days Off bid 保存 contract
- Pairing bid 保存 contract
- DAYSOFF.csv / 算法导出逻辑
- 数据库 schema / migration

## 7. 测试与验证

实施后需要验证：

1. 后端单测：

```bash
npm --prefix pbs-server test -- src/services/calendar/bidding-calendar-service.test.ts src/routes/bidding-calendar.test.ts
```

2. 后端 build：

```bash
npm --prefix pbs-server run build
```

3. 远端 DB 只读等价性验证：

- 对 YYZ / YVR / YYC / YUL / YEG 各取一个 crew。
- 同 period 跑旧 SQL 和新 SQL。
- `JSON.stringify(rows)` 或逐字段比较必须完全一致。

4. 远端 DB 性能验证：

- `EXPLAIN (ANALYZE, BUFFERS)` 新 SQL。
- YYZ 样本目标：capacity SQL `<2s`，理想 `<1s`。
- `GET /api/bidding-calendar/current` 整体目标：低于前端 `10s` timeout，理想 `<3s`。

5. UI 回归：

- 通过真实 PBS Portal 打开包含左侧 `BIDDING CALENDAR` 的页面。
- 期望显示 `Jun 2026` 和日期格子，而不是 `-` 空壳。
- Days Off capacity badge 继续显示 `requested/max`，例如 `23/33`。

## 8. 风险与约束

- `roster_flight` 是 crew × 航段/地面任务粒度；pre-assigned DO 必须按日期 `count(distinct crew_id)`，不能 count roster rows。
- 本设计保持旧的 overlap 时间判断，不改成简单本地日期展开；之前实测本地日期展开虽然更快，但部分日期会多算，不能采用。
- `source='IMP' and assignment='DO'` 基于当前远端数据和 schema 约束。若未来导入层出现小写或带空格值，应修导入标准化，或另行评估函数索引/规范化字段。
- 本次不解决所有 current 接口性能问题，只修 `bidding-calendar/current` 里新增 capacity SQL 的回归。

## 9. 验收标准

- `GET /api/bidding-calendar/current` 不再因为 `dayOffCapacity` 超过前端 10 秒 timeout。
- YYZ crew `762` 样本 capacity SQL 从十秒级降到秒级以内或接近秒级。
- 新旧 SQL 每日 capacity 数据完全一致。
- 左侧 `BIDDING CALENDAR` 正常显示月份和日期格子，不再出现只有 `-` 的空壳。
- `requestedDayOffCount/maxDaysOffCount` 展示值不因 SQL 改写改变。
- 不引入 DB migration，不影响 CSV 保存和算法导出。

## 10. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本次是一个窄范围 SQL 性能修复，主要修改单个 service 里的一个 CTE；并行开发的协调成本高于收益。
- Suggested split: 不拆分。主 agent 串行完成 SQL 改写、测试更新、远端 DB 等价性验证和 UI smoke。
- Write boundaries: 预计只写 `pbs-server` service/test，最多补一份 QA 测试文档。
- Conflict risk: 低。风险主要来自 SQL 语义等价性，需要用旧/新 SQL 行级对比控制。
- Execution gate: 用户确认本 spec 后再进入实现。
