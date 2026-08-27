# PBS Pairing 126「Any Enroute Check-Out Time」补齐设计确认

## 背景

用户确认 `propertyCode=126` 也要按旧库补齐，不只保留当前页面里看到的单时间 `<` 输入，而是要完整对齐旧库语义。

当前代码里，`126` 已经有基础显示和单时间比较能力，但还没有按旧库补齐 `Between`，后端 SQL 与前端控件也没有完全对齐旧库。

## 旧库对照

旧库参考：

- `init-docs/crew_bids_reference-2026-03-16-072929.xlsx`
- `init-docs/crew_bids_reference-2026-03-16-072929.md`
- `sql/seed/10-pbs-bid-property.sql`

旧库 `126` 定义：

- 名称：`Any Enroute Check-Out Time`
- 分类：`Pairing`
- quantifier：`any`
- operator：`<, Between`
- input type：`time_of_day`
- label：`Enroute Check-Out Time`
- action：`award / avoid`

结论：

- `126` 不是 `Any/Every`，而是固定 `Any`
- `126` 不是日期条件，也不是 duration 条件
- `126` 应当支持 `Between`

## 当前问题

当前实现已经有 `126` 的基础 SQL 分支，但只覆盖了单个时间比较，没有完整支持旧库中的 `Between`。

因此现在的状态是：

- 前端能看到 `Any Enroute Check-Out Time`
- 但控件和后端都还没完全按旧库补齐
- 如果继续只保留单时间输入，会和旧库语义不一致

## 设计目标

1. 保持 `126` 的 quantifier 为 `Any`
2. 保持输入类型为 `HH:MM`
3. 支持 `operator = <` 和 `operator = Between`
4. 前端、后端、合同类型、测试全部对齐旧库
5. 不影响其他 Pairing 条件

## 方案

### 前端

- `126` 只允许 `Any`
- operator 下拉保留 `<`，并补上 `Between`
- 当选择 `<` 时，显示单个时间输入
- 当选择 `Between` 时，显示起止两个时间输入
- summary 能展示：
  - `< 22:30`
  - `Between 20:00 - 23:30`

### 后端

- `126` 的校验允许 `time` 和 `time-range`
- `time` 对应 `<` 比较
- `time-range` 对应 `Between`
- SQL 仍然只对 `duty_seq > 1` 的 enroute 段做 `exists` 判断
- 比较字段继续使用 `debrief_end_utc at time zone 'UTC'`

### 合同与类型

- 不新增新的 bid 类型
- 直接复用现有 `time` / `time-range`
- 只在 `126` 的 property 定义里补齐 operator 和默认值

## SQL 语义

### `<`

对任一 enroute leg：

```sql
exists (
  select 1
  from pairing_segment s
  where s.pairing_id = p.id
    and s.is_deleted = 0
    and s.duty_seq > 1
    and (s.debrief_end_utc at time zone 'UTC')::time < :time_value
)
```

### `Between`

对任一 enroute leg：

```sql
exists (
  select 1
  from pairing_segment s
  where s.pairing_id = p.id
    and s.is_deleted = 0
    and s.duty_seq > 1
    and (s.debrief_end_utc at time zone 'UTC')::time between :from_time::time and :to_time::time
)
```

## 测试范围

- 前端：
  - 126 的 property catalog
  - 126 的控件切换
  - summary 文案
  - 完整性校验
- 后端：
  - 126 的保存校验
  - 126 的 preview SQL
  - `Between` 回归测试
- 回归：
  - 相关 build
  - `pbs-server` / `pbs-portal` 定向测试

## 验收标准

1. `126` 页面默认仍是 `Any`
2. operator 能在 `<` 和 `Between` 间切换
3. `Between` 能正确保存并通过校验
4. preview SQL 能正确生成 `exists + between`
5. 旧库中 `126` 的语义不再只剩单时间比较

## Multi-Agent Parallelism Assessment

- Recommendation: Yes
- Rationale: 前端控件、后端 SQL、测试可以拆开做，边界相对清楚
- Suggested split: 前端补控件与 summary；后端补校验与 SQL；测试补回归
- Write boundaries: 每个分支只改对应模块，不碰其他条件
- Conflict risk: 中等，主要集中在 contract 和共享类型
- Execution gate: 等用户确认本设计后再进入实施

Above is my understanding of the requirement/spec. Please confirm, and I will implement after your approval.
