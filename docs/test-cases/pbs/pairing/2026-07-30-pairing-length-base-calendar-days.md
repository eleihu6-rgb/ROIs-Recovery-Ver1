# PBS Pairing Length — Base 当地日历日口径测试

## 前置条件

- 目标环境已执行 `2026-07-30-pbs-pairing-calendar-days.sql`。
- Live Server 和 PBS Server 已部署本次版本。
- 准备以下 FLY Pairing：
  - A：Base 当地时间同日 Brief / Debrief。
  - B：Base 当地时间跨午夜 Brief / Debrief，但实际时长小于 24 小时。
  - C：`duration_days` 与 `pbs_calendar_days` 明确不一致。
  - D：缺少 Pairing 级 Brief、Debrief 或合法 Base 时区。

## 用例 1：同一日历日

1. 打开 PBS Portal 的 Pairing Bid。
2. 配置 Award Pairing Length `< 2 days`。
3. 打开 Search Pairings。

预期：Pairing A 出现在结果中；数据库 `pbs_calendar_days = 1`。

## 用例 2：跨当地午夜

1. 使用相同规则查询 Pairing B。
2. 确认 Brief 和 Debrief 的实际时间差可以小于 24 小时。

预期：Pairing B 不出现在 `< 2 days` 结果中；数据库 `pbs_calendar_days = 2`。

## 用例 3：新旧字段冲突

1. 确认 Pairing C 的 `duration_days = 1`、`pbs_calendar_days = 2`。
2. 查询 `< 2 days`。
3. 生成 `PAIRING_SCORE.csv`。

预期：

- PBS 查询不匹配 Pairing C。
- `PAIRING_SCORE.csv` 不为 Pairing C 写入该 Award 命中。
- 算法输入 `Pairing.durationDays` 仍为原始值 `1`。

## 用例 4：缺少计算数据

1. 检查 Pairing D 的 `pbs_calendar_days`。
2. 分别配置 Award 和 Avoid Pairing Length。

预期：字段为 `NULL`；Pairing D 在 Award 和 Avoid 两种长度规则中均不参与匹配。

## 用例 5：Current Rules 与 Tier Pool 一致性

1. 在 T1 添加 Pairing Length 规则。
2. 记录 Search Pairings 结果数量。
3. 返回主页面，查看 Current Rules matched 数量及 T1 pool。

预期：三个入口使用相同 Pairing Length 口径，数量一致。

## 用例 6：重新导入与人工 Duty Node 修改

1. 重新导入一个现有 Pairing，令 Brief / Debrief 跨越当地午夜。
2. 确认导入后 `pbs_calendar_days` 在同一事务结果中更新。
3. 通过 Duty Node 编辑功能将 Brief / Debrief 调整回同一当地日期。

预期：导入后值为 `2`；人工调整后自动刷新为 `1`，无需额外批处理。

## 回归范围

- Pairing Length Property 112、131、132。
- Search Pairings、Current Rules、Tier pool、`PAIRING_SCORE.csv`。
- Average Daily Credit 等仍使用原始 `duration_days` 的功能不改变。
- Pairing 原始 `duration_days` 和算法 `Pairing.durationDays` 不改变。
