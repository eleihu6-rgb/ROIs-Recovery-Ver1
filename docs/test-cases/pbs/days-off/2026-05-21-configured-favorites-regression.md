# PBS Days Off 已配置收藏回归测试用例

日期：2026-05-21  
范围：PBS Portal Days Off 右侧 `ADD DAYS OFF PROPERTIES`、`FAVORITED PROPERTIES`、Days Off favorite API、收藏持久化。

## 前置条件

- 使用开发环境账号进入 PBS Portal。
- 当前 bid period 有可编辑的 Days Off draft。
- 已执行 `2026-05-21-configured-days-off-favorites.sql` migration，旧 DaysOff 模板收藏已清理，`pbs_bid_days_off_favorite` 专用配置收藏表可用。

## 用例 1：弹窗内保存配置收藏，不新增 Existing

1. 进入 Days Off 页面。
2. 在 `ADD DAYS OFF PROPERTIES` 中点击 `Prefer Off` 的加号。
3. 在弹窗中选择 `T2`，添加日期 `2026-04-10`；确认不显示 `FULFILMENT`、`All selected periods`、`Flexible quantity`、`Minimum required`、`Maximum required`。
4. 点击 `SAVE FAVORITE`。
5. 预期：弹窗关闭，`EXISTING DAYS OFF PROPERTIES` 不新增该 bid。
6. 预期：切到 `FAVORITED PROPERTIES` 后能看到刚保存的 `Prefer Off` 收藏。
7. 预期：浏览器 Network 中请求为 `POST /api/days-off-bids/current/favorites`，payload 包含 `propertyCode`、`bid`、`tiers`，并标准化为 `allOrNothing=true`、`minimumN=null`、`maximumN=null`；不再使用 `PUT /favorites/:propertyCode`。

## 用例 2：点击配置收藏直接新增 Existing

1. 进入 `FAVORITED PROPERTIES`。
2. 点击刚保存的收藏项加号。
3. 预期：不打开 Configure 弹窗。
4. 预期：`EXISTING DAYS OFF PROPERTIES` 直接新增一条相同配置的 `Prefer Off`。
5. 预期：左侧小日历和 Tier 页面相关数据刷新保持正常。

## 用例 3：同一 property 支持多条不同收藏

1. 分别保存两条 `Prefer Off` 收藏，例如 `2026-04-10 / T2` 和 `2026-04-12 / T3`。
2. 预期：`FAVORITED PROPERTIES` 中两条都存在。
3. 分别点击两条收藏加号。
4. 预期：Existing 中新增的 bid 配置分别保持原日期和 Tx。

## 用例 4：旧外部红心入口已移除

1. 查看 `ALL PROPERTIES` 列表。
2. 预期：每行只保留新增入口，不再展示外部红心收藏按钮。
3. 预期：Pairing / Line 页面原有收藏行为不受本次 Days Off 改动影响。

## 自动化覆盖

- `pbs-server/src/routes/days-off-bids.test.ts`
- `pbs-server/src/services/days-off/days-off-draft-mappers.test.ts`
- `pbs-server/src/services/days-off/days-off-mutation-response.test.ts`
- `pbs-portal/src/shared/services/days-off-service.test.ts`
- `pbs-portal/src/features/days-off/days-off-draft-mappers.test.ts`
- `pbs-portal/src/features/days-off/pages/days-off-page.test.tsx`
- `pbs-portal/src/features/rule-bids/rule-bid-page-cache.test.ts`
- `pbs-portal/src/features/rule-bids/utils.test.ts`
