# PBS Days Off 接口性能优化设计

日期：2026-04-28
作者：Codex
状态：已确认并实现

## 背景

用户在浏览器 Network 中看到 `/api/days-off-bids/current`、favorite、delete 等 Days Off 接口耗时在 2-8 秒之间，理想目标是常用接口稳定在 2 秒以内。

当前系统已经给 Days Off property 和 favorite 增加了稳定 `propertyGroupKey / favoriteKey / propertyId`。这些稳定身份解决的是“操作哪一条数据不会错”，但不自动解决接口慢的问题。实际排查显示，慢主要来自远程 PostgreSQL 往返成本：单次 SQL 往返常见 300-800ms，冷连接可超过 2 秒；一个接口如果串行执行多次 DB round trip，就容易超过 2 秒。

## 目标

1. 降低 Days Off 常用接口的数据库往返次数。
2. 保持现有 API contract、前端调用和业务语义不变。
3. 暖连接下把常见 Days Off GET / delete / favorite / unfavorite 压到 2 秒以内。
4. 保留现有 validation、draftVersion 更新、layer totals 同步和稳定 key 语义。

## 不做范围

- 不改 UI。
- 不改 Days Off AA 业务规则。
- 不做 Clear Bids。
- 不做 Layer 页面展示。
- 不迁移数据库到本地或改部署拓扑。
- 不新增第三方依赖。

## 方案

采用“减少 round trip”的保守优化方案：

### 1. `GET /days-off-bids/current`

当前已有 period/catalog cache，但找到 current bid 后，draft properties 与 favorites 仍按顺序读取。

优化为：

- existing bid 存在时，用 `Promise.all` 并行读取 `loadDraftProperties` 与 `loadFavoriteProperties`。
- 不改变 response shape。

### 2. `DELETE /days-off-bids/current/properties/:propertyGroupKey`

当前 Days Off delete 仍是多条顺序 SQL：

- 查询 target groups。
- 删除 conditions。
- 删除 groups。
- 前移 groupSeq。
- `syncBidLayers` 删除空 layer、更新 layer totals、更新 bid totals。
- 更新 `pbs_bid.draft_version`。

优化为一条 CTE SQL，参考 Pairing delete 的成熟实现，在单次 DB round trip 中完成：

- 删除目标 groups 和 conditions。
- 后续 groups 前移。
- 删除空 layer。
- 更新 layer `total_groups/is_active`。
- 更新 bid `total_layers/draft_version/last_modified_at`。
- 返回新的 draft identity。

### 3. Favorite / Unfavorite

如果前端已传 `draftKey`，则后端可以直接使用稳定 bid id。

优化为：

- favorite 保留 ensure/create draft 能力，但避免额外 property identity 查询，继续使用 catalog cache 中的 `propertyIdentityByCode`。
- unfavorite 当 `draftKey` 存在时，用 CTE/单条 delete 路径直接按 `favoriteKey + bidId + bidType` 删除，不再先查 current bid。
- 保持删除 favorite 不 bump draftVersion 的现有语义。

### 4. 测试与验证

后端测试覆盖：

- delete property 仍按 `propertyGroupKey` 删除并返回 draft identity。
- favorite/unfavorite 仍使用稳定 favorite key。
- GET current response 不变。

验证命令：

- `cd pbs-server && npm test -- src/routes/days-off-bids.test.ts`
- `cd pbs-server && npm run build`
- 必要时根目录 `npm run verify:pbs`

性能验证：

- 用 3002 测试 JWT 对本地 `localhost:3002` 调用 `/api/days-off-bids/current`。
- 暖连接下观察常见请求是否低于 2 秒。

## 风险与回滚

- CTE SQL 写错会影响 delete property 的 rowSeq/layer totals/draftVersion。通过 route 测试和 build 验证。
- 远程 DB 网络冷启动仍可能超过 2 秒，本轮只优化服务端 round trip 数，不能消除跨地域网络延迟。
- 保持 API contract 不变，前端不需要调整。
