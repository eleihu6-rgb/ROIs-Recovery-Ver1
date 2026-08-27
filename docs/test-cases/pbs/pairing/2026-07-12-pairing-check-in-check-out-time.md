# Pairing Check-In / Check-Out Time 手工测试用例

关联设计：`docs/superpowers/specs/2026-07-12-pbs-pairing-check-in-check-out-time-jen-aligned-design.md`

## 前置条件

- 已部署 `Pairing Check-In / Check-Out Time` 的 Portal 与 PBS Server。
- 已在目标 PBS schema 执行 `2026-07-12-pbs-pairing-check-time-unified-condition.sql`。
- 当前 bid period 允许编辑，测试账号可访问 Pairing 页面。
- 如需验证 Preview，准备至少一条 report time 和一条 release time 落在不同时间段的 pairing。

## 用例 1：新增默认状态

1. 进入 `Pairing` 页面，在 `ADD PAIRING PROPERTIES` 切到 `ALL PROPERTIES`。
2. 点击 `Pairing Check-In / Check-Out Time`。

预期：

- 弹窗标题为 `Configure Pairing Check-In / Check-Out Time`。
- T1-T7 均未选，标题显示 `APPLY TO TIERS · REQUIRED`。
- `Award` 默认选中，`Avoid` 未选。
- `Check-In` 默认选中，`Check-Out` 未选。
- Time Window 默认 `Between`，起止时间均为空。
- `LIMIT TO PAIRING DATE` 默认关闭，不出现日期值。
- `ADD BID` 与 `SAVE FAVORITE` 均不可点击。

## 用例 2：Check-Out、AM/PM 和自定义时间

1. 延续用例 1，选择一个 tier，例如 T2。
2. 选择 `Check-Out`。
3. 点击 `PM 14:00–22:00`。
4. 将起止时间修改为 `15:00` 和 `21:30`。
5. 再分别选择 `AM 03:00–11:00`、`Custom`。

预期：

- PM 填入 `14:00` 到 `22:00`，并允许继续编辑为 `15:00` 到 `21:30`。
- AM 填入 `03:00` 到 `11:00`。
- Custom 清空时间，但保留已选 `Check-Out`、tier 和 Award/Avoid。
- 仅当已选 tier 且时间窗口完整时，`ADD BID` 可点击。

## 用例 3：比较符与日期范围

1. 选择 `Exactly at`、`Before`、`After`，分别填写合法 `HH:MM` 时间。
2. 打开 `LIMIT TO PAIRING DATE`。
3. 在 `Specific Date` 中选择一个日期。
4. 切换到 `Date Range`，选择起止日期。

预期：

- `Exactly at` / `Before` / `After` 只显示一个时间输入；`Between` 显示两个。
- 开启日期限制前不会有任何日期默认值。
- Specific Date 和 Date Range 可互相切换；未填完整日期范围时不能提交。
- 日期范围的结束日期不得早于开始日期。

## 用例 4：保存、摘要与 Search Pairings Preview

1. 保存一条 `Avoid · Check-Out · Between 14:00 - 22:00`，并限制到一个日期范围的 bid。
2. 在 `EXISTING PAIRING PROPERTIES` 和 `VIEW RULES` 查看该条件。
3. 进入 `SEARCH PAIRINGS`，查看 current-rules preview；再单独添加同一类 Search Criteria。

预期：

- 摘要清楚显示 `Check-Out`、操作符、时间和日期范围。
- Preview 使用 pairing 最后一个 segment 的 release/debrief 时间和日期；不使用 report time。
- Check-In 版本使用首个 segment 的 report/brief 时间和日期。
- 同一 tier 的多条 103 条件保持现有 multi-use 的 OR 行为；不同 property group 仍按 AND 组合。

## 用例 5：退役与数据清理

1. 打开 Pairing 的 `ALL PROPERTIES`、收藏列表和 `Search Pairings` 可选条件。
2. 检查 `pbs_bid_property` 中 property 103 与 111 的状态，并抽查执行 migration 前含 103/111 的 bid group。

预期：

- Portal 只显示 `Pairing Check-In / Check-Out Time`，不显示单独的 `Pairing Check-Out Time`（111）。
- property 103 为 active / visible，111 为 inactive / hidden。
- 含旧 103 或 111 的整个 `property_group_key` 已删除；其他 group 仍保留。
- 103/111 的 configured/simple favorites 已删除；不相关 favorite 仍保留。
- 空的 `pbs_bid` 容器才会删除。

## 自动化覆盖

- PBS Server：`rule-bid-value`、`lineholder-summary-formatters`、`pairing-search-condition-builder`、`pairing-property-validation`、`pairing-rule-validation`、`crew-bid-txt-parser`、`pairing-bids`。
- PBS Portal：`pairing-bid-control-logic`、`pairing-bid-control`。
- Portal 浏览器：`e2e/tests/pbs-portal/condition-default-favorites.spec.ts` 的 `PBS-3514`。
