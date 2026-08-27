# Pairing Length 起始日期选择 QA

日期：2026-07-16

## 前置条件

- PBS Portal 当前 period 为可编辑状态。
- Pairing 页面能加载 `Pairing Length` property。
- 测试数据中至少存在：
  - start date 为所选两个离散日期的 pairings；
  - start date 位于两者之间但未被选择的 pairing；
  - duration_days 在 Min/Max 内外的 pairings。

## 主流程：Specific Dates

1. Pairing → All Properties → 打开 `Pairing Length`。
2. 输入 `Min days = 1`、`Max days = 3`，选择至少一个 Tier。
3. 打开 `LIMIT TO PAIRING START DATE`。
4. 确认显示 `Specific Dates | Date Range`，默认选中 `Specific Dates`。
5. 选择两个不连续日期并保存。
6. 重新编辑该 bid。

预期：

- 两个日期都回显，Add/Save 在日期为空时禁用、选择日期后启用。
- 摘要显示两个离散 start dates。
- 两个选中日期且长度在 1–3 天的 pairings 命中。
- 位于两个日期之间但未选择的日期不命中。

## Date Range 与模式清理

1. 在已选择 Specific Dates 后切换到 `Date Range`。
2. 确认 Add/Save 立即禁用，旧离散日期不再生效。
3. 选择合法起止日期，确认 Add/Save 启用。
4. 切回 `Specific Dates`。
5. 确认范围被清空、Add/Save 再次禁用。
6. 关闭日期限制。

预期：

- 每次模式切换都清除上一模式的隐藏值。
- 关闭后 `dateScope = null`，仅按 Min/Max 过滤。
- Date Range 按闭区间命中起止日期。

## 边界与兼容

- Specific Dates 空数组不能保存。
- Date Range 缺一端或反向不能保存。
- UI 不允许选择当前 period 外日期；服务端收到越界日期时拒绝。
- 历史 `date_range` Pairing Length 能正常加载、编辑和重存。
- 缺少 periodCode 的历史 Favorite/草稿读取与原样重存不因本次变化失败。
- Flight Legs per Duty、Airport Preference、Check-In/Out 仍显示 `LIMIT TO EVENT DATE`，行为不变。

## Algorithm Export

- 导出 score CSV 后，两个离散 start dates 对应的 pairings 获得预期分数。
- 中间未选日期的 pairing 不得计分。
- 历史 Date Range bid 的计分不回归。
