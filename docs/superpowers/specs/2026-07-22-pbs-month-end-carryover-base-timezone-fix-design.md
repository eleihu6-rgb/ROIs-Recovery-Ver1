# PBS Month-End Carryover Base 时区修复设计

## 1. 背景

`Month-End Carryover`（Pairing property `163`）当前使用 Pairing 结束时间的 UTC 日历日期计算跨月天数：

```text
carry_out_days = UTC 结束日期 - bid month 最后一天
```

这会把 Base 当地仍在本月结束的 Pairing 错判为跨月。例如 `T4582`：

- Pairing Base：`YYZ`（`America/Toronto`）
- 当地结束时间：2026-06-30 20:40
- UTC 结束时间：2026-07-01 00:40
- 当前结果：`carry_out_days = 1`
- 正确结果：`carry_out_days = 0`

因此 Search Pairings 会错误地把 `T4582` 放入 `Award Carryover = 1 day`，而 Pairing 小日历只高亮当地实际 Duty 日期 6 月 30 日。两个界面信息使用了不同日期口径。

## 2. 目标

将 `Month-End Carryover` 全链路统一为：

```text
carry_out_days = Pairing Base 当地结束日期 - bid month 最后一天
```

修复后：

- `T4582` 的 carryover 为 `0`，不再出现在 `Award Carryover = 1 day` 中。
- Search Pairings PREVIEW、Current Tier counts 和算法导出使用相同条件判定；若算法输入包含月份前后扩展窗口，总行数不要求与 Portal 月内候选池相等。
- Pairing 小日历继续只高亮实际 Duty 覆盖日期，不增加虚拟 carryover 日期。

## 3. 范围

### 3.1 包含

- 修正 property `163` 的共享 SQL 条件。
- 使用 `pairing.base -> airport.zone_id` 解析 Pairing Base 的 IANA 时区。
- 同步修改当前两套独立的 Pairing condition builder：
  - `pbs-server/src/services/pairing-search/**`：Portal Search PREVIEW 与 Current Rules counts。
  - `live-server/src/services/pairing-search/**`：生产算法导出使用的条件构建器。
- 同步影响以下运行入口：
  - 单条件 Search Pairings PREVIEW。
  - 自由 Criteria PREVIEW。
  - Current Rules 结果 PREVIEW。
  - Current Rules / Tier pool counts。
  - `live-server` 生成的 `PAIRING_SCORE.csv`。
- 更新相关缓存版本，避免部署后继续返回旧结果。
- 增加后端自动化测试、算法导出回归、真实 Portal Playwright、远端 PostgreSQL 只读校验和 QA 测试案例。

### 3.2 不包含

- 不修改 Pairing 小日历的高亮含义。
- 不新增 7 月 1 日之类的虚拟 carryover 日历占位。
- 不修改数据库表、字段或 migration。
- 不改变 property `163` 的 payload、比较符、Award/Avoid 或 summary 文案。
- 不修改其他 Pairing 条件的时区口径。

## 4. 业务规则

### 4.1 Pairing 结束时间

继续使用现有结束时间优先级：

```text
coalesce(pairing.sch_end_dt_utc, pairing.sch_str_dt_utc)
```

数据库中的 `*_utc` 字段是 `timestamp without time zone`，内容表示 UTC 时间。计算当地日期时必须先将其解释为 UTC 时刻，再转换到 Pairing Base 时区。

### 4.2 Base 时区

根据 `pairing.base` 匹配 live schema 的 `airport.airport`，读取并校验 `airport.zone_id`：

```text
pairing.base -> airport.airport -> airport.zone_id -> pg_timezone_names.name
```

匹配 Base code 时忽略首尾空格与大小写差异。

### 4.3 时区回退

当 Pairing Base 缺失、机场不存在或 `zone_id` 无效时，继续回退 `UTC`。本次不因历史数据质量问题让整个 PREVIEW 或算法导出失败。

### 4.4 Carryover 比较

当地结束日期转换完成后，保留现有比较规则：

- 只有 `carry_out_days >= 1` 才属于 Month-End Carryover。
- 支持 `<`、`=`、`>` 和 `Between`。
- `Award` 匹配正向集合。
- `Avoid` 是正向集合在 crew 可申请 Pairing 池内的补集。

## 5. 技术设计

### 5.1 共享 Base 时区表达式

在 Pairing Search 条件模块内增加可复用的 SQL 表达式，不能依赖调用方已经声明 `base_airport` 或 `base_tz` 别名。建议结构：

```sql
coalesce(
  (
    select pairing_base_tz.name
    from <live_schema>.airport pairing_base_airport
    join pg_timezone_names pairing_base_tz
      on pairing_base_tz.name = nullif(btrim(pairing_base_airport.zone_id), '')
    where upper(btrim(pairing_base_airport.airport)) = upper(btrim(p.base))
    limit 1
  ),
  'UTC'
)
```

该表达式需要在 `pbs-server` 与 `live-server` 的两套 builder 中保持同样语义。当前生产算法导出已经迁移到 `live-server`；`pbs-server` 的旧 algorithm-export route 只返回 `410`，不能把旧 route 或旧 service 测试当作生产算法导出验证。

### 5.2 当地结束日期表达式

将 UTC 字段解释为 UTC 时刻，再转换到 Base 当地 timestamp：

```sql
(
  (
    coalesce(p.sch_end_dt_utc, p.sch_str_dt_utc)
    at time zone 'UTC'
  ) at time zone <pairing_base_zone_expression>
)::date
```

最终计算：

```sql
greatest(0, <pairing_local_end_date> - <period_end_date>)
```

条件 SQL 必须让 Base 时区解析、当地结束日期和 `carry_out_days` 对每个 Pairing 只计算一次，再通过别名完成 `>= 1` 与用户比较符判断。不能把同一个相关子查询分别展开到基础条件和比较条件中。

推荐使用一个引用外层 `p` 的 correlated/lateral 子查询，产出单一 `carry_out_days` 值，再在其外层应用比较条件。`pbs-server` 与 `live-server` 应采用相同 SQL 结构和参数顺序。

### 5.3 缓存

同时提升 `pbs-server` 的两个缓存版本：

- `PAIRING_SEARCH_CACHE_VERSION`：覆盖自由 Criteria PREVIEW、Current Rules 结果 PREVIEW、Current Rules counts 和 tier pools 等通用缓存。
- `SINGLE_PROPERTY_PREVIEW_CACHE_VERSION`：覆盖 Pairing 行级单条件 PREVIEW。

缓存 key 的业务输入没有变化，但同一输入的结果集合发生变化，不能等待旧 TTL 自然过期作为正确性保障。`live-server` 算法导出若无结果缓存则不新增缓存机制。

### 5.4 Portal

Portal 请求结构和渲染逻辑不变。后端返回修正后的结果后：

- `T4582` 不再出现在 `Award Carryover = 1 day`。
- 小日历仍只高亮 `activeDates` 中的真实 Duty 日期。

### 5.5 两套 Builder 一致性

本次不进行跨 `pbs-server` / `live-server` 的大规模共享包重构。为控制变更范围，分别修改两套现有实现，并用一致的 fixture、SQL 断言和远端结果校验锁定语义。

必须保留 `live-server` 当前对历史 `stepper` / `stepper-range` Carry-Out Days 数据的读取兼容；兼容 payload 也使用修正后的 Base 当地日期计算。

## 6. 方案比较

### 方案 A：Pairing Base 当地日期（采用）

- 优点：符合机组月度归属；和小日历的当地日期口径一致；搜索与算法可统一。
- 缺点：SQL 需要解析 Base 时区。

### 方案 B：继续使用 UTC 日期

- 优点：实现不变。
- 缺点：已证实会把当地本月结束的 Pairing 错判为跨月，不采用。

### 方案 C：只修改 Portal 高亮

- 优点：视觉上可以让 7 月 1 日亮起。
- 缺点：掩盖错误业务结果，算法导出仍错误，不采用。

## 7. 测试设计

### 7.1 SQL 条件单元测试

- 断言 Month-End Carryover 使用 Pairing Base 时区表达式。
- 断言 UTC 7 月 1 日、YYZ 当地 6 月 30 日的 Pairing 得到 carryover `0`。
- 断言 Base 当地确实在 7 月 1 日结束的 Pairing 得到 carryover `1`。
- 覆盖 `Award`、`Avoid`、`<`、`=`、`>` 和 `Between` 现有语义。
- 分别覆盖 Base 为空、机场不存在、`zone_id` 为空、`zone_id` 无效时回退 UTC。
- 在 `pbs-server` 与 `live-server` 两套 builder 中执行等价断言。
- 断言 SQL 对每个 Pairing 只生成一次 carryover 计算，而不是在 `>= 1` 和用户比较中重复展开 Base 时区子查询。

### 7.2 Service 与算法导出

- 单条件 PREVIEW、自由 Criteria PREVIEW、Current Rules 结果 PREVIEW、Current Rules counts 和 tier pools 使用相同修正条件。
- `live-server` Pairing score 算法导出生成相同的 Base 当地日期条件。
- 验证实际 `PAIRING_SCORE.csv` 入口，不使用已返回 `410` 的 `pbs-server` deprecated route 代替。
- `T4582` 类 fixture 不再进入 carryover `1` 的正向集合。

### 7.3 动态 SQL 安全门禁

- 运行 generated SQL fixture/coverage。
- 对远端 PostgreSQL 执行只读 `EXPLAIN` preflight。
- 使用远端 F8 数据做最小只读核对：`YYZ + IFD + Jun 2026 + Award Carryover = 1` 不包含 `T4582`。
- 修改前后分别对代表性远端数据执行只读 `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`，覆盖 Search counts 和 `live-server` Pairing score 查询。
- 每个代表性查询预热后执行至少 3 次，比较执行时间中位数；修复后中位数不得比修改前基线增加超过 20%，planner total cost 不得增加超过 15%。若远端环境抖动导致阈值失败，必须保留执行计划并定位具体节点，不能静默跳过。
- 执行计划必须证明 Base 时区/carryover 相关子查询每个 Pairing 只计算一次，不在 `>= 1` 与用户比较中重复执行。
- 输出一次只读数据质量审计结果，分别统计空 Base、机场不存在、空 `zone_id` 和无效 `zone_id` 的 Pairing 数量；热路径不逐行记录日志。

### 7.4 Playwright

通过真实 PBS Portal 操作 `Month-End Carryover`：

1. 配置 `Award Carryover = 1 day`。
2. 打开 PREVIEW。
3. 验证返回结果不包含当地 6 月 30 日结束的 `T4582`。
4. 验证真正按 Base 当地日期跨到 7 月 1 日的 Pairing仍可返回。
5. 将动作切换为 `Avoid`，验证 `T4582` 位于 eligible pool 的补集中。

### 7.5 QA 文档

新增 `docs/test-cases/pbs/pairing-search/2026-07-22-month-end-carryover-base-timezone.md`，覆盖：

- UTC 跨日但 Base 当地未跨日。
- Base 当地真实跨月。
- Award/Avoid 互补。
- Search PREVIEW、Tier count 和算法导出一致性。

## 8. 验收标准

1. `T4582` 在 `YYZ + Jun 2026` 下的 carryover 由 `1` 修正为 `0`。
2. `Award Carryover = 1 day` 不再返回 `T4582`。
3. 真正按 Pairing Base 当地日期延伸到 7 月 1 日的 Pairing仍返回。
4. PREVIEW、Current Tier counts 和算法导出对同一 Pairing 的条件判定一致；候选窗口不同导致的集合范围差异不算条件不一致。
5. Pairing 小日历继续只显示真实 Duty 日期。
6. 在同一 eligible Pairing pool 中，`Award Carryover = 1` 与 `Avoid Carryover = 1` 无交集，二者并集等于 eligible pool；`T4582` 必须位于 Avoid 集合。
7. 单条件 PREVIEW、自由 Criteria PREVIEW、Current Rules 结果 PREVIEW、counts 和 tier pools 均使用修正后的结果。
8. `PAIRING_SEARCH_CACHE_VERSION` 与 `SINGLE_PROPERTY_PREVIEW_CACHE_VERSION` 均已升级，部署后不会复用旧结果。
9. `pbs-server` 与 `live-server` 两套 builder 生成等价的 Base 当地日期语义。
10. Search counts 和 Pairing score 查询满足远端 `EXPLAIN (ANALYZE, BUFFERS)` 性能阈值，且 carryover 每行只计算一次。
11. 所有相关自动化测试、远端 SQL preflight 和 Playwright 通过。

## 9. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 虽然存在 `pbs-server` 与 `live-server` 两套 builder，但语义、SQL 结构和远端验收必须锁步，拆开实现容易再次产生口径漂移。
- Suggested split: 由一个实现者同步完成两套条件、缓存和回归测试。
- Write boundaries: `pbs-server` Pairing Search、`live-server` Pairing Search/算法导出、PBS E2E 与 QA 文档。
- Conflict risk: 分给不同实现者可能得到不同 SQL、参数顺序或 fallback 行为。
- Execution gate: 本 spec 经用户批准后再实施。
