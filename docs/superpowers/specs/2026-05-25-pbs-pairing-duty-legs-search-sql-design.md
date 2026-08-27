# PBS Pairing Any/Every Duty Legs 搜索 SQL 设计

## 背景

`Any/Every Duty Legs(propertyCode=107)` 当前 contract / seed / 前端控件与旧库定义基本一致，但后端 pairing search 没有看到 107 的专门 SQL 处理，存在“可配置但搜索不生效 / 报 unsupported”的问题。

旧库对照来自 `init-docs/crew_bids_reference-2026-03-16-072929.xlsx`：

- `id`: `107`
- `remastered_property`: `Any/Every Duty Legs`
- `award_or_avoid`: `["award", "avoid"]`
- `any_or_every`: `["any", "every"]`
- `operator`: `["<", "=", ">"]`
- `validation_json`: `{"type": "int", "label": "Legs", "min": 1}`
- tooltip 示例包括：
  - `Award Pairings If Any Duty Legs = 2 legs`
  - `Award Pairings If Every Duty Legs = 2 legs`
  - `Award Pairings If Any Duty Legs > 1 legs`
  - `Award Pairings If Every Duty Legs > 1 legs`

## 语义

`Duty Legs` 指一个 pairing 内每个 duty 里的 leg 数量，不是整个 pairing 的总 leg 数量。

- `Any Duty Legs = 2`：存在任意一个 duty 的 leg 数等于 2。
- `Every Duty Legs = 2`：所有 duty 的 leg 数都等于 2，且 pairing 至少有一个 duty。
- `Any Duty Legs > 2`：存在任意一个 duty 的 leg 数大于 2。
- `Every Duty Legs < 3`：所有 duty 的 leg 数都小于 3，且 pairing 至少有一个 duty。

`Award / Avoid` 沿用现有 `wrapIntent`：

- `award` 使用正向条件。
- `avoid` 使用 `not (<正向条件>)`。

## SQL 设计

先按 `pairing_id + duty_seq` 聚合每个 duty 的 leg 数：

```sql
select s.duty_seq, count(*)::numeric as leg_count
from <live_schema>.pairing_segment s
where s.pairing_id = p.id
  and s.is_deleted = 0
group by s.duty_seq
```

`any` 使用 `exists`：

```sql
exists (
  select 1
  from (...) duty_counts
  where duty_counts.leg_count <operator> $value
)
```

`every` 使用 `exists + not exists`：

```sql
exists (select 1 from (...) duty_counts)
and not exists (
  select 1
  from (...) duty_counts
  where not (duty_counts.leg_count <operator> $value)
)
```

## 验收标准

- `propertyCode=107` 支持 `stepper` bid。
- 支持 `=`, `<`, `>`。
- `quantifier` 支持 `any` / `every`，缺省按旧库和 contract 默认 `any`。
- 自动化测试覆盖 any、every、avoid。
- 不改 `Total Legs In Pairing(propertyCode=108)` 的现有语义。

