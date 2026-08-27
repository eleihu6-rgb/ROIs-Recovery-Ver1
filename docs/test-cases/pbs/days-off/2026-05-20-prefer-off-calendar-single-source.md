# PBS Days Off Prefer Off 单一来源与左侧小日历连线测试案例

## 测试目标

验证左侧 `BIDDING CALENDAR` 的 Off 日期以 Days Off `Prefer Off` 为唯一来源；连续 Off 在共享小日历中连成横条；旧 `/api/calendar-days-off/*` 接口不再被前端调用，Tier 也不再出现 `Calendar Day Off` 旧编辑路径。

## 前置条件

- PBS Portal 可访问 Dashboard、Days Off、Tier 页面。
- 当前 bid period 为可编辑状态，且当前用户有 `T1-T7`。
- Days Off 页面可以保存 draft。
- 浏览器 DevTools Network 可查看接口请求。

## 场景 1：连续选择 3 天 Off

1. 打开 `/days-off`。
2. 在左侧小日历选择同一周内连续 3 天，例如 `2026-04-06`、`2026-04-07`、`2026-04-08`。
3. 在弹窗中保持目标 Tx，例如 `T1`，点击 `SAVE BID`。

预期结果：

- 保存请求调用 Days Off property 接口，例如 `/api/days-off-bids/current/properties` 或对应 property patch/delete 接口。
- Network 中不出现 `/api/calendar-days-off/current` 或 `/api/calendar-days-off/current/dates`。
- 右侧 Existing Days Off Properties 中出现 / 更新 `Prefer Off`。
- 左侧小日历同一周内这 3 天显示为一条连续绿色 Off 横条，中间没有断裂。

## 场景 2：取消中间一天

1. 在已有连续 3 天 Off 的基础上，再点击中间一天，例如 `2026-04-07`。
2. 在弹窗中取消目标 Tx 或保存移除结果。

预期结果：

- 右侧 `Prefer Off` 同步移除该日期或对应 Tx。
- 左侧小日历绿色条被正确断开，只保留两侧日期的 Off 显示。
- Network 中仍不出现 `/api/calendar-days-off/*`。

## 场景 3：跨周连续 Off

1. 在 `/days-off` 选择周六到周日跨行边界的连续日期，例如 `2026-04-11` 和 `2026-04-12`。
2. 保存到同一 Tx。

预期结果：

- 两个日期都写入 `Prefer Off`。
- 左侧小日历按日历行自然拆成两条，不跨周强行连接。
- 每一行内的 Off 块对齐且不重叠其他事件。

## 场景 4：Dashboard 读取同一来源

1. 保存 Days Off `Prefer Off` 后打开 `/dashboard`。
2. 查看左侧 `BIDDING CALENDAR`。

预期结果：

- Dashboard 显示与 Days Off 一致的 Off 日期。
- 同一周连续 Off 仍显示为连续绿色条。
- Dashboard 不请求 `/api/calendar-days-off/*`。

## 场景 5：Tier 不再出现 Calendar 旧来源

1. 打开 `/tier`。
2. 查找与 Prefer Off 相关的 summary item。
3. 打开详情并尝试编辑 Tx。

预期结果：

- item 类型显示为 `Days Off`，不是 `Calendar`。
- 底部操作为通用 `Edit Tx` / `Delete Bid`。
- 保存 Tx 时调用 Days Off property patch 接口。
- 不显示 `Remove Day Off`，不调用 `/api/calendar-days-off/current/dates`。

## 回归范围

- Pairing / Line / Days Off 其他 bid 的 Tier 编辑和删除仍可用。
- Pairing 日历 bid 仍可打开详情、编辑 Tx、删除。
- Pairing 与 Off 冲突提示仍有效，blocked Tx 不会被保存为 Off。
- 连续 Off 连线不应错误合并 Pairing、Leave、Training 等非 Off event。
