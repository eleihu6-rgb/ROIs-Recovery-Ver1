# PBS 条件页默认收藏属性 QA 用例

## 前置条件

- 已部署包含 `pbs_bid_property.default_favorite_order` / `default_favorite_usage_count` 的数据库变更。
- `Days Off`、`Pairing`、`Line` 当前周期可访问，用户已登录 PBS Portal。
- 当前用户可以进入 `Days Off`、`Pairing`、`Line` 页面。

## 测试步骤

1. 打开 `Days Off` 页面。
2. 确认右侧 `ADD DAYS OFF PROPERTIES` 区域中，`FAVORITED PROPERTIES` 在 `ALL PROPERTIES` 左侧且处于选中状态。
3. 确认默认收藏顺序为：`Prefer Off`、`Min Consecutive Days Off`、`Max Consecutive Days On`、`Days Off / Days On Pattern`。
4. 切换到 `ALL PROPERTIES`，确认可以看到其他可见属性，例如 `Employee Schedule Preference`。
5. 打开 `Pairing` 页面。
6. 确认右侧 `ADD PAIRING PROPERTIES` 区域中，`FAVORITED PROPERTIES` 在 `ALL PROPERTIES` 左侧且处于选中状态。
7. 确认默认收藏顺序为：`Pairing Number`、`Any Landing In Airport`、`Departure Date / Day`、`Pairing Check-In / Check-Out Time`、`Pairing Total Credit`。
8. 切换到 `ALL PROPERTIES`，确认可以看到其他可见属性，例如 `Flight Legs per Duty`。
9. 打开 `Line` 页面。
10. 确认右侧 `ADD LINE PROPERTIES` 区域中，`FAVORITED PROPERTIES` 在 `ALL PROPERTIES` 左侧且处于选中状态。
11. 确认默认收藏顺序为：`Min Credit Window`、`Max Credit Window`、`No Same Day Pairings`、`Waive No Same Day Duty Starts`。
12. 切换到 `ALL PROPERTIES`，确认可以看到其他可见属性，例如 `Forget Line`。

## 预期结果

- 三个页面默认进入 `FAVORITED PROPERTIES`，不是 `ALL PROPERTIES`。
- `FAVORITED PROPERTIES` 位于左侧第一个 tab。
- 默认收藏顺序与 NPBS 报表使用率排序一致。
- 系统默认收藏行不显示删除收藏按钮。
- `ALL PROPERTIES` 不丢失原有可见属性。

## 异常 / 边界场景

- 如果某个默认收藏 property 被后台配置为 `is_visible_in_portal=0`，该 property 不应出现在默认收藏中。
- 如果某个默认收藏 property 不被当前模块 contract 支持，后端不应返回给 portal。
- 用户自己保存的 favorite 应继续显示在 `FAVORITED PROPERTIES`，并且可删除。
- Days Off 和 Line 只有 4 个有效默认收藏，不应为了凑数显示低频或无效 property。

## 回归范围

- `Days Off` 条件添加与搜索。
- `Pairing` 条件添加、搜索与 `ALL PAIRINGS` 入口。
- `Line` 条件添加与搜索。
- 用户个人 favorite 的保存和删除。
- 当前周期只读状态下，默认收藏显示仍正常，但添加动作应保持只读限制。
