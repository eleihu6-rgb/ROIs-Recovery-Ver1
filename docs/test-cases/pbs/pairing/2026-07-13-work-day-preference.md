# Work Day Preference QA 用例

## 目标

验证 Pairing property `110` 使用新的 Award-only Work Day Preference 语义：按 Duty 起飞机场当地 Check-In 事件匹配 weekday、独立时间窗和可选 Event Date。

## 用例 1：默认状态

1. 在 Pairing 页面打开 `Work Day Preference`。

预期：

- 不显示 Award/Avoid，也不显示 Any/Every。
- Tier 与 weekday 默认均未选择，`ADD BID` disabled。
- `LIMIT TO EVENT DATE` 默认关闭，表示 Any date。

## 用例 2：weekday 与独立 Check-In window

1. 选择 T1、Mon 和 Wed。
2. Mon 输入 `06:00–10:00`，Wed 保持两个时间为空。

预期：

- Mon 表示包含边界的本地 Check-In 窗口。
- Wed 未完成时，`ADD BID` 与 `SAVE FAVORITE` 均 disabled。
- 聚焦并离开 Wed 空时间输入后，该输入显示错误状态；刚选择 Wed 时不立即报红。

3. Wed 补全为 `12:00–16:00`。

预期：

- 两个 weekday 都完整后才允许保存。
- 保存 payload 的 `action` 固定为 `award`、`quantifier` 为 `null`，bid 为：

```json
{
  "type": "work-day-preference",
  "days": [
    { "dayOfWeek": "MON", "checkInFrom": "06:00", "checkInTo": "10:00" },
    { "dayOfWeek": "WED", "checkInFrom": "12:00", "checkInTo": "16:00" }
  ],
  "dateScope": null
}
```

## 用例 3：跨午夜与无效窗口

1. Mon 输入 `22:00–04:00`。
2. 再改为 `06:00–06:00`。

预期：

- `22:00–04:00` 合法，按跨午夜窗口匹配。
- 起止时间相等时 `ADD BID` disabled。
- 只填写 From 或 To 任一端时 `ADD BID` 与 `SAVE FAVORITE` 均 disabled。

## 用例 4：Limit to Event Date

1. 选择至少一个 weekday。
2. 打开 `LIMIT TO EVENT DATE`。
3. 分别验证 `Specific Dates` 多日期与 `Date Range`。
4. 关闭开关。

预期：

- 开关打开但未完成日期时不能保存。
- 日期仅匹配同一 Duty 的起飞机场当地 Check-In 日期。
- Event Date、weekday、Check-In time 必须由同一个 Duty 同时满足。
- 关闭后 `dateScope` 为 `null`，隐藏日期不再参与匹配。

## 用例 5：Search、编辑和收藏回显

1. 保存一个包含两个 weekday、不同时间窗和 Date Range 的规则。
2. 从 Pairing 列表、Search Pairings 和 Favorite 分别重新打开。

预期：

- Tier、weekday、每个时间窗和 date scope 完整回显。
- Search 与两个 PAIRING_SCORE 路径采用同一 Duty Check-In event 定义。

## 用例 6：不完整数据与其他属性隔离

预期：

- migration 删除 property `110` 中缺端点、空白、无效格式、同值或坏 JSON 的 bids/configured favorites，不转换或补默认时间。
- property `110` 作为 AND condition 时，删除同一 `property_group_key` 的全部 Tier 副本，不能只删除一个 condition。
- 完整合法的 Work Day Preference、普通 Pairing favorites 和其他 property 保持不变。
- 旧 `date-or-dow-list`、通用 `date-range`、Avoid、Any/Every 请求被拒绝。
- 旧库 `Any/Every Duty On ...` 因无法提供完整 weekday Check-In window 而产生明确导入诊断。
- `Departure Date / Day` 等其他继续使用 `date-or-dow-list` 的属性行为不变。
