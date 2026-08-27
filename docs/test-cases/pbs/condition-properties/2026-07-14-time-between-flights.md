# PBS Pairing「Time Between Flights」QA 用例

## 前置条件

- 已部署 `sql/migration/2026-07-14-pbs-time-between-flights.sql`。
- 当前 bid period 内，当前登录用户可见的 pairing pool 至少有一条同一 duty 的相邻航段间隔；已记录服务端返回的最大值。
- 使用可编辑的 PBS crew 帐号进入 `Pairing` 页面。

## 正常流程

1. 在 `ALL PROPERTIES` 打开 `Time Between Flights`。
2. 确认新建时 Tier 未选中，弹窗内部按统一 Pairing 条件样式显示 `PREFERENCE`、`MATCH`、`TIME BETWEEN FLIGHTS` 三段。
3. 确认 `Award` 与 `Any` 为默认选中，比较符为 `>`，时间输入为空。
4. 确认输入 placeholder 仅显示动态有效范围（例如 `00:45 – 04:20`），输入框右侧显示 `hours : min`，没有额外的说明性小字。
5. 选择 `T1`，输入范围内的 `01:30`，选择 `=` 与 `Every`，确认 `ADD BID` 变为可用并保存。
6. 打开已保存规则和 `Search Pairings`，确认名称为 `Time Between Flights`，且 `Every · = · 01:30` 完整回显。

## 边界与语义

1. 输入 `00:44`，确认不能保存，并显示范围错误。
2. 输入大于动态上限的值，确认不能保存，并显示范围错误。
3. 分别使用 `<`、`=`、`>` 保存规则，确认三个比较符都能保存和回显。
4. 对包含两个相邻 interval 的 pairing 验证：`Any` 在任一 interval 命中时匹配；`Every` 仅在全部 interval 命中时匹配。
5. 对每个 duty 只有一段航班的 pairing 验证：`Any`、`Every` 都不视为正向匹配；`Avoid` 依照页面其他 Pairing 条件的反向规则处理。
6. 将两个航段放在不同 duty 中，确认它们之间的休息时间不会被当作 `Time Between Flights`。
7. 在 `Search Pairings` 新增条件入口中确认不显示 `Time Between Flights`；只能通过已保存 bid / favorite 的编辑路径回显该条件。

## 上线数据检查

1. 查询 `property_code=129`，确认目录名为 `Time Between Flights`，operator 为 `<`、`=`、`>`，Any/Every 可用。
2. 确认旧 129 bid condition、关联 group 与 pairing favorite 已清空；只有无其他 group/favorite 的 bid container 才会被删除。
3. 确认 `f8.dictionary` 中存在 `SYS_PARAM / PBS_TIME_BETWEEN_FLIGHTS_MIN_MINUTES`，值为 `45`。
