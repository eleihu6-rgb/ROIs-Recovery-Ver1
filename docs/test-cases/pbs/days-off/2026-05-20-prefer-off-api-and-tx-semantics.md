# PBS Days Off - Prefer Off Tx 语义与轻量接口回归测试用例

## 覆盖目标

- `Prefer Off` 在同一 `Tx` 或不同 `Tx` 中出现重复/重叠日期时，不作为硬错误阻止保存。
- 用户只选择 `T2` 时，不应被已有 `T1` 的 `Prefer Off` 日期挡住。
- Days Off 属性新增/更新使用轻量 mutation payload，不发送 UI 展示字段或整份属性对象。
- API 错误只通过统一 message/toast 呈现，不在右侧面板额外显示重复红色 alert。
- 左侧共享小日历继续按 `Prefer Off` 生成规则渲染，并按 `date + tier` 去重后保持连续 Off 横条。

## 自动化测试

- 后端 `validateDaysOffDraftProperties`：
  - 同一 `T1` 内 `2026-04-19..2026-04-22` 与 `Between 2026-04-19 - 2026-04-22` 可通过。
  - `Monday` 与显式日期 `2026-04-06` 可通过。
  - `Between 2026-04-22 - 2026-04-19` 仍拒绝，提示日期结束时间不能早于开始时间。
- 后端 route：
  - `POST /api/days-off-bids/current/properties` 接受轻量 body：`draftVersion/propertyCode/bid/tiers/modifiers`。
  - `PUT /api/days-off-bids/current/properties/:propertyGroupKey` 接受轻量 body：`draftVersion/bid/tiers/modifiers`。
  - `DELETE /api/days-off-bids/current/properties/:propertyGroupKey?draftVersion=...` 仍可删除。
- 前端页面：
  - 已有 `T1` Prefer Off 日期时，新增 `T2` 相同日期范围可以调用保存服务，不显示 overlap 错误。
  - API 返回 `Invalid days off property payload.` 时，页面不渲染额外 `role="alert"` 红色面板。
- 前端 service：
  - Add payload 不包含 `name`、`suggestions`、`bidContext`、`draftKey`、`bidId`、`periodCode`、`property` 包装。
  - Update 使用 `request.put`，不再使用 `request.patch`。
  - Delete query 只发送 `draftVersion`。

## 手工回归步骤

1. 打开 PBS Days Off 页面，使用 3002 账号进入当前 Apr 2026 draft。
2. 在 `T1` 添加 `Prefer Off`：`2026-04-19, 2026-04-20, 2026-04-21, 2026-04-22`。
3. 在 `T2` 添加 `Prefer Off`：`Between 2026-04-19 - 2026-04-22`。
4. 预期：保存成功，不出现 `Prefer Off dates overlap...`，Network payload 不包含 `name/suggestions/bidContext/property`。
5. 编辑第 4 步保存的属性，确认 Network 使用 `PUT /api/days-off-bids/current/properties/:propertyGroupKey`。
6. 强制刷新 Days Off，再进入 Pairing/Dashboard，确认左侧共享小日历显示一致，连续 Off 仍连成横条。
7. 人为构造一个结束日期早于开始日期的 Prefer Off range，预期仍显示统一 message 错误，不出现右侧重复红色 alert。
