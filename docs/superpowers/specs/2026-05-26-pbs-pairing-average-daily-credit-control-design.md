# PBS Pairing Average Daily Credit 控件与搜索 SQL 设计

## 背景

`Average Daily Credit(propertyCode=109)` 当前在 Configure Pairing Bid 弹窗中显示为普通空白文本框，没有 operator 控件，也没有 credit 格式约束。

核对旧库 `init-docs/crew_bids_reference-2026-03-16-072929.xlsx` 后确认：

- `id`: `109`
- `remastered_property`: `Average Daily Credit`
- `award_or_avoid`: `["award", "avoid"]`
- `any_or_every`: 空
- `operator`: `["<", "=", ">", "Between"]`
- `validation_json`: `{"type": "credit", "format": "HH:MM", "label": "Credit", "label_from": "Min Credit", "label_to": "Max Credit"}`
- tooltip 示例包括：
  - `Award Pairings If Average Daily Credit = 004:00`
  - `Award Pairings If Average Daily Credit > 005:00`
  - `Award Pairings If Average Daily Credit Between 004:00 And 005:30`

因此当前 `text` 控件不符合旧库定义。

## 语义

`Average Daily Credit` 表示 pairing 总 credit 平均到每天的 credit：

```text
Average Daily Credit = Pairing Total Credit / Pairing Length
```

其中：

- `Pairing Total Credit` 使用 pairing segment credit minutes 汇总。
- `Pairing Length` 使用 `p.duration_days`，并用 `greatest(coalesce(p.duration_days, 1), 1)` 避免除以 0。
- 输入值使用 `HH:MM`，允许旧库样式的三位小时，例如 `004:00`、`005:30`，也允许项目现有 duration 控件接受的一到三位小时。

## 实现范围

- 将 `propertyCode=109` contract 默认 bid 从 `text` 改为 `duration`。
- 前端使用现有 duration / duration-range 控件，不再显示普通 text 输入。
- 后端 route 校验 109 只接受 `duration` / `duration-range`。
- 后端 search SQL 增加 109：
  - 计算平均 daily credit minutes。
  - 支持 `<`, `=`, `>`, `Between`。
  - `avoid` 沿用现有 `not (...)`。
- 补自动化测试和 QA 人工测试案例。

## 非目标

- 不改 `Pairing Total Credit(propertyCode=105)` 的含义。
- 不改 `Average Daily Block Time(propertyCode=121)`。
- 不兼容 109 的任意自由文本值。

## 验收标准

- `Average Daily Credit` 弹窗显示 operator + credit duration 控件。
- `Between` 显示两个 credit duration 输入。
- 空值 / 非法分钟值不能保存。
- 后端拒绝 109 的旧 `text` bid。
- Search Pairings / Current Rules 能按平均 daily credit 过滤。

