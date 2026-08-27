# PBS Pairing Any/Every Duty On Date / Day 控件与搜索回归测试

## 背景

旧库定义 `Any/Every Duty On Date / Day(propertyCode=110)` 为 `date_or_dow`，支持 `In` 和 `Between`。本次回归确认页面不再使用旧的 `tag-list-date` 控件，并确认后端按 duty 维度去重搜索。

## 人工测试步骤

1. 打开 PBS Pairing Bid 页面，进入 `Configure Pairing Bid`。
2. 选择 `Any/Every Duty On Date / Day`。
3. 确认弹窗中有 `Mode`、`Quantifier`、`Bid` operator。
4. operator 选择 `In`：
   - 确认没有 “Type code and press Enter” 的 tag 输入框。
   - 添加一个日期，例如 `2026-04-03`。
   - 点选一个星期几，例如 `Fri`。
   - 确认可以保存。
5. operator 选择 `Between`：
   - 确认只显示 from/to 日期范围。
   - 输入 `2026-04-03` 到 `2026-04-10`。
   - 确认可以保存。
6. 选择 `Any` 和 `Every` 分别保存，确认页面 summary 能正常显示。
7. 输入非法日期范围，例如 from 晚于 to，确认不能保存或后端拒绝。

## API 回归

`propertyCode=110` 接受：

```json
{
  "type": "date-or-dow-list",
  "dates": ["2026-04-03"],
  "daysOfWeek": ["FRI"]
}
```

`propertyCode=110` 接受：

```json
{
  "type": "date-range",
  "from": "2026-04-03",
  "to": "2026-04-10"
}
```

`propertyCode=110` 拒绝旧结构：

```json
{
  "type": "tag-list-date",
  "values": ["MON"],
  "date": "2026-04-03"
}
```

预期错误：

```text
Any/Every Duty On Date / Day requires date-or-dow bid.
```

## 搜索语义验收

- `Any`：任意 duty 的 duty date / day 命中即匹配。
- `Every`：至少存在一个 duty，且所有 duty 的 duty date / day 都命中才匹配。
- `Avoid`：对正向条件取反。
- SQL 按 `pairing_id + duty_seq` 去重，不能按 segment 重复计算。
- Duty date 使用 `coalesce(duty_sch_str_dt_utc, brief_start_utc, sch_str_dt_utc)` 的 UTC 日期。
