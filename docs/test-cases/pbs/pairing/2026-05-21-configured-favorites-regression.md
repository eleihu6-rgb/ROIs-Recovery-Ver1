# PBS Pairing 配置化收藏回归测试用例

## 背景

本轮调整将 Pairing 页面的收藏语义从“收藏属性模板”改为“收藏已经配置好的 bid 快照”，并让 `ADD PAIRING PROPERTIES` 的交互与 Days Off 对齐。

## 覆盖范围

- Pairing 页右侧 `ALL PROPERTIES` 加号打开配置弹窗。
- 配置弹窗底部包含 `CANCEL / SAVE FAVORITE / ADD BID`。
- `SAVE FAVORITE` 只保存收藏，不新增到 `EXISTING PAIRING PROPERTIES`。
- `FAVORITED PROPERTIES` 展示已配置好的收藏 bid，包括 bid 值和 tiers。
- 收藏项加号直接新增到 Existing，不再二次确认。
- 收藏项删除需要二次确认。
- Pairing Number 仍保留 pairing run 选择逻辑，并支持从弹窗保存收藏。
- Pairing 关键新增、编辑、删除、收藏接口目标响应时间 `< 2s`。

## 人工回归步骤

1. 打开 PBS Portal，进入 `/pairing`。
2. 在 `ALL PROPERTIES` 点击任意非 Pairing Number 条件的加号。
3. 确认弹窗显示当前条件名、bid 配置、tiers，以及底部三个按钮。
4. 修改 bid 值和 tiers，点击 `SAVE FAVORITE`。
5. 确认页面只提示 `Favorite saved.`，Existing 区域没有新增该条件。
6. 切换到 `FAVORITED PROPERTIES`，确认刚收藏的条件展示了保存时的 bid 值和 tiers。
7. 点击收藏项加号，确认条件直接新增到 Existing，并显示 `Pairing property added.`。
8. 点击收藏项删除图标，确认先出现二次确认，再点击 `Remove` 后收藏项消失。
9. 回到 `ALL PROPERTIES`，点击 `Pairing Number` 加号，确认先进入配置弹窗，再点击 `ADD BID` 后进入 pairing run 选择弹窗。
10. 对 `Pairing Number` 点击 `SAVE FAVORITE`，确认保存的是选择后的 Pairing Number bid 快照。

## 接口检查

- `POST /api/pairing-bids/current/favorites`
  - 请求体只包含当前 draft identity 与单个配置好的 `property`。
  - 不应发送整个页面、整个 draft、UI-only 列表或无关字段。
- `DELETE /api/pairing-bids/current/favorites/by-key/:favoriteKey`
  - 使用稳定 `favoriteKey` 删除。
  - query 中带 `draftKey` / `bidId` / `periodCode` 用于定位当前 bid。
- `POST /api/pairing-bids/current/properties`
  - 从收藏项加号新增时，使用收藏快照中的 bid 与 tiers。

## 自动化覆盖

- `pbs-server`:
  - Pairing favorite mutation response 包含完整 bid 快照。
  - `POST /pairing-bids/current/favorites` 接收配置化收藏 payload。
  - legacy `PUT /favorites/:propertyCode` 保持兼容。
- `pbs-portal`:
  - `pairingService.saveConfiguredFavoriteProperty` 使用轻量配置快照 payload。
  - Pairing 页加号弹窗、保存收藏、收藏项直接新增、删除确认均有组件级回归覆盖。
  - `pairing-property-list` 区分 catalog 与 favorite 数据源。
