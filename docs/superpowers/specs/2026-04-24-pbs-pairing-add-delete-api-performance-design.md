# PBS Pairing 添加/删除接口性能优化设计

日期：2026-04-24
状态：已实现

## 背景

当前 `/pairing` 页面里，`EXISTING PAIRING PROPERTIES` 删除和 `ADD PAIRING PROPERTIES` 添加都已经改成“等保存接口成功后再恢复按钮”。这个交互是正确的，但用户反馈这两个接口调用很慢，希望单次添加/删除在 1 秒内完成。

## 当前定位

这两个动作前端看起来是“添加”和“删除”两个操作，但现在实际都调用同一个接口：

- `PUT /api/pairing-bids/current`
- 前端入口：`pbs-portal/src/shared/services/pairing-service.ts` 的 `saveCurrentDraft`
- 后端入口：`pbs-server/src/routes/pairing-bids.ts`
- 后端服务：`pbs-server/src/services/pairing/pairing-bid-service.ts` 的 `saveCurrentDraft`

当前慢的主要原因不是按钮状态，而是后端保存策略过重：

1. 每次添加/删除都会保存整份 pairing draft，而不是只写入新增/删除的那一条 property。
2. `saveCurrentDraft` 会重新查当前 PBS period 和 pairing property catalog。
3. 写入事务里会先查出当前 pairing groups，再删除旧 groups 和 conditions，然后按整份草稿重建所有 groups。
4. 写完后还会返回完整 `PbsPairingCurrentDraftResponse`，包含完整 draft、property catalog、favoritePropertyCodes；但前端保存调用并不使用这些返回数据。
5. `syncBidLayers` 会重新扫描 bid 下的 groups/dayOff rows，并逐层更新 layer 汇总。这个逻辑安全，但对一次简单增删来说偏重。

因此，添加/删除越多、网络/数据库延迟越高，这个接口越容易超过 1 秒。

## 目标

- `/pairing` 页面添加 property 和删除 property 的等待时间目标：单次请求 1 秒内完成。
- 按钮仍保持当前语义：请求未完成前不可重复点击，请求成功后本地列表才变化。
- 继续保证刷新页面后数据与数据库一致。
- 不影响 `/pairing/search` 已经实现的添加体验。
- 不改动已确认的建表脚本；如后续需要索引，单独走 migration 讨论。

## 方案比较

### 方案 A：只瘦身现有全量保存接口

做法：

- `PUT /api/pairing-bids/current` 仍保存整份 draft。
- 后端保存成功后只返回轻量 `{ saved: true }`，不再返回完整 draft/catalog/favorites。
- pairing property catalog 增加服务内短期缓存，避免每次保存都查配置表。

优点：

- 改动最小。
- 前端几乎不用变。
- 可以减少一次 favorite 查询和较大的 response 序列化。

缺点：

- 核心写入仍然是“删旧全量重建”，本质上还是重。
- 数据库往返次数仍较多，不一定稳定达到 1 秒内。

### 方案 B：为添加/删除新增轻量结构性接口

做法：

- 保留 `PUT /api/pairing-bids/current`，继续用于普通编辑和 autosave。
- 新增添加接口：`POST /api/pairing-bids/current/properties`
- 新增删除接口：`DELETE /api/pairing-bids/current/properties/:rowSeq`
- 添加时只插入新增 property 对应的 pairing groups。
- 删除时只删除指定 `rowSeq` 对应的 pairing groups/conditions，并把后续 pairing `group_seq` 前移。
- 返回轻量 `{ saved: true }`，前端继续用本地 snapshot 更新 UI。
- pairing property catalog 增加服务内短期缓存。

优点：

- 命中当前最慢路径：添加/删除不再全量删除和重建。
- 更符合用户动作语义，也更容易稳定压到 1 秒内。
- 保留原全量保存接口作为普通编辑/autosave 的安全兜底。

缺点：

- 需要新增 contract、route、service 方法和前端 service 方法。
- 需要更新 route 测试和 pairing 页面测试。

### 方案 C：继续用全量保存，但前端提前解锁

做法：

- 前端点击后先本地更新并解锁，后台继续保存。

优点：

- 体感最快。

缺点：

- 违背刚刚确认的“接口真正完成之后才恢复正常”语义。
- 请求失败时需要回滚，刷新页面仍可能看到旧数据。
- 不推荐。

## 推荐方案

推荐采用方案 B，并附带方案 A 中的轻量 response 和 catalog 缓存。

也就是：

1. 添加/删除使用新的轻量增删接口。
2. `PUT /api/pairing-bids/current` 保存成功后也改成轻量响应，避免无意义返回完整 draft/catalog/favorites。
3. pairing property catalog 做服务内短期缓存，减少重复配置查询。
4. 普通 bid/layer 编辑仍沿用现有 autosave 全量保存，避免本次把所有编辑路径一起扩大改动面。

这个方案的收益最大、风险可控，也符合现在页面里“添加/删除是结构性操作，普通字段编辑是草稿编辑”的交互边界。

## 接口设计

### 保存响应

新增轻量响应类型：

```ts
export type PbsPairingDraftMutationResponse = {
  saved: true;
};
```

`PUT /api/pairing-bids/current`、`POST /api/pairing-bids/current/properties`、`DELETE /api/pairing-bids/current/properties/:rowSeq` 都返回该类型。

### 添加 property

路由：

```http
POST /api/pairing-bids/current/properties
```

请求：

```ts
export type PbsAddPairingCurrentPropertyRequest = {
  periodCode: string;
  bidContext: "Current";
  remarks?: string;
  property: Omit<PbsPairingDraftProperty, "rowSeq">;
};
```

行为：

- 校验 `bidContext` 必须为 `Current`。
- 校验 `propertyCode` 必须在 pairing property catalog 中。
- 按当前 pairing groups 的最大 `group_seq + 1` 作为新增 rowSeq。
- 按 property 选中的 layers 插入对应的 `pbs_bid_group` 行。
- 更新 bid/layer 汇总。

### 删除 property

路由：

```http
DELETE /api/pairing-bids/current/properties/:rowSeq?periodCode=Apr%202026
```

行为：

- 找到当前用户、当前 period、Current bid。
- 删除 `bid_type = 'Pairing'` 且 `group_seq = rowSeq` 的 groups。
- 删除这些 groups 对应的 conditions。
- 将同一 bid 下 `bid_type = 'Pairing'` 且 `group_seq > rowSeq` 的 groups 序号减 1，保持刷新后顺序连续。
- 更新 bid/layer 汇总。
- 如果 bid 或 rowSeq 不存在，按幂等删除处理，返回 `{ saved: true }`。

## 前端设计

- `handleAvailableAction("add")` 不再调用全量 `saveCurrentDraft`，改调用 `pairingService.addCurrentDraftProperty`。
- `handleExistingDelete` 不再调用全量 `saveCurrentDraft`，改调用 `pairingService.removeCurrentDraftProperty`。
- 当前 `pendingDraftMutationKey`、禁用按钮、成功后更新本地和 query cache 的体验保持不变。
- 普通 existing layer toggle/autosave 保持当前全量保存路径。
- `/pairing/search` 的添加逻辑先不改，避免影响已经确认好的搜索页体验。

## 测试计划

后端：

- 更新 `pbs-server/src/routes/pairing-bids.test.ts`
  - `PUT /api/pairing-bids/current` 返回轻量保存结果。
  - `POST /api/pairing-bids/current/properties` 校验并调用 service 添加方法。
  - `DELETE /api/pairing-bids/current/properties/:rowSeq` 校验并调用 service 删除方法。
- 更新 `pbs-server/src/app.test.ts` 对应路由覆盖。
- 跑 `npm test` 和 `npm run build`。

前端：

- 更新 `pbs-portal/src/features/pairing/pages/pairing-page.test.tsx`
  - 添加按钮等待新增接口完成后恢复。
  - 删除按钮等待删除接口完成后恢复。
  - 添加/删除不再调用全量 `saveCurrentDraft`。
- 跑 pairing 页面测试、search pairing 页面测试、全量 `npm test`、`npm run lint`、`npm run build`。

## 验收标准

- 添加 property 和删除 property 都走新增轻量接口。
- 添加/删除请求 pending 时按钮不可重复点击；请求完成后恢复。
- 添加/删除成功后刷新页面，数据库里的 pairing draft 与页面一致。
- 保存接口不再返回完整 catalog/favorites 等前端不用的数据。
- 本地测试全部通过。
- 如能连接本地运行服务，使用浏览器或 API 观察单次添加/删除请求，目标响应时间小于 1 秒。

## 风险与后续

- 已将 `syncBidLayers` 从逐层循环更新改为 set-based SQL：批量删除无用 layer、批量刷新 `total_groups`、批量刷新 `pbs_bid.total_layers`，减少远程数据库往返。
- 已将 pairing 当前 period 增加短期缓存，并将 `ensureCurrentBid` 对已有 draft 的路径改成 `UPDATE ... RETURNING id`，减少一次先查再改的 round trip。
- 在实际浏览器观察到仍高于 1 秒后，已进一步将 pairing add/delete 的轻量接口压缩为单条 CTE SQL：添加用一条 SQL 完成 bid upsert、layer upsert、group insert 和汇总更新；删除用一条 SQL 完成定位、删除、序号前移和汇总更新。
- 如果未来 `/pairing/search` 的添加也需要同样性能，可以复用新增添加接口；本次先不改搜索页，降低回归风险。
- 如果 production 数据中单个 bid 的 pairing groups 很多，后续可增加 `(bid_id, bid_type, group_seq)` 索引，但这需要单独 migration。
