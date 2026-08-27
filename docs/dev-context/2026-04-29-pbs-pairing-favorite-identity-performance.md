# PBS Pairing favorite property identity 读取优化记录

时间：2026-04-29
范围：`pbs-server`

## 本批目标

- 优化 `PUT /api/pairing-bids/current/favorites/:propertyCode` 的服务端保存路径。
- 减少重复读取 `pbs_bid_property` 的 DB round trip。
- 不改变 API 响应结构、favorite key、property id、draft identity 或写入语义。

## 已处理项

修改文件：

- `pbs-server/src/services/pairing/pairing-bid-service.ts`

处理内容：

- `getPropertyCatalog()` 已经通过 `resolveLineholderPropertyCatalog` 加载 `propertyIdentityByCode`。
- `saveFavoriteProperty` 原先在确认 `catalogByCode` 支持 property code 后，又调用 `loadPairingPropertyIdentity` 再查一次同一张表。
- 现在改为复用 `propertyIdentityByCode`，通过 `requireLineholderPropertyIdentity` 获取稳定 property definition id。
- 删除不再需要的 `loadPairingPropertyIdentity` 私有 helper。

## 不变项

- 不支持的 `propertyCode` 仍先由 `ensureSupportedPropertyCode` 返回 400。
- favorite 写入仍使用 `pbs_bid_pairing_favorite.property_id` 和 `property_code`。
- 返回的 `favoriteKey`、`propertyId`、`propertyCode` 仍来自 DB `returning`。
- draft identity、`bumpDraftVersion: false` 和 transaction 边界不变。

## 验证

本批应至少运行：

```bash
cd /Users/lei/Codehub/rois-ai/pbs-server
node --import tsx --test src/routes/pairing-bids.test.ts
npm run build
```

最终仍需运行：

```bash
cd /Users/lei/Codehub/rois-ai
PATH="/Users/lei/.nvm/versions/node/v22.21.1/bin:$PATH" npm run verify:pbs
```
