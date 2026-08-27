# PBS Pairing Search 添加与收藏统一优化设计

日期：2026-04-24
状态：待确认

## 背景

`/pairing` 和 `/pairing/search` 操作的是同一个 current pairing draft。此前已经把 `/pairing` 页面的添加/删除优化成轻量接口，并为 property 添加了稳定的 `propertyGroupKey`，但 `/pairing/search` 页面添加 search criteria 时仍然走完整保存：

```ts
pairingService.saveCurrentDraft(nextExistingProperties, currentData.rightPanel.draftMeta)
```

这会导致两个问题：

1. 性能没有复用轻量添加接口。
2. 并发上仍可能用旧的完整 draft 覆盖另一个页面刚刚添加/删除后的结果。

另外，收藏操作虽然 `/pairing` 和 `/pairing/search` 都调用同一组 `favoriteProperty` / `unfavoriteProperty` service，但后端当前会在写入后重新查询并返回完整 `favoritePropertyCodes`。前端两个页面实际上已经用乐观更新维护收藏状态，返回完整列表不是必要数据。

用户进一步指出：如果未来 `propertyCode` 需要修改，那么它不能作为长期关系身份。当前数据库里 `pbs_bid_property` 已经有自增 `id`，但 `pbs_bid_group.property_id`、`pbs_bid_condition.property_id` 和 `pbs_bid_pairing_favorite.property_code` 实际都在存业务 code。这个设计需要修正：业务 code 可以展示和兼容，数据库关系应优先使用稳定 id/key。

## 目标

- `/pairing/search` 添加条件时也走轻量 `POST /api/pairing-bids/current/properties`。
- 添加成功后，将接口返回的 `propertyGroupKey` 写回 pairing page query cache 中新增的 existing property。
- `/pairing` 和 `/pairing/search` 的收藏接口契约保持一致，避免一个页面优化、另一个页面遗漏。
- 收藏接口后端改为稳定 favorite 身份 + 轻量 mutation response，减少无意义的全量 favorite list 查询。
- 收藏关系不再只依赖 `propertyCode`，后端保存稳定 `propertyId`，并用唯一键约束一条 bid 不能重复收藏同一个 property。
- 对 `propertyCode` 未来可变做设计：新增/迁移时用 `pbs_bid_property.id` 作为稳定关系字段，`propertyCode` 作为兼容输入和显示输出。
- 两个页面继续保持当前体验：点击后立即反馈，失败时回滚。

## 非目标

- 本次不改 favorite 的业务定义：收藏仍按 `propertyCode` 持久化。
- 本次不改收藏按钮 UI。
- 本次不引入全局实时同步机制；同一浏览器内继续通过 React Query cache 同步。
- 本次不解决完整 `PUT /pairing-bids/current` 的乐观锁问题；那应作为后续 draft version 设计处理。
- 本次不把所有 Line / DaysOff / Pairing 条件表一次性完全切换到 `pbs_bid_property.id`，但必须在设计里明确后续迁移路径，并避免新增接口继续扩大 code 依赖。

## 当前问题

### Search 添加仍走全量保存

当前路径：

- 文件：`pbs-portal/src/features/pairing/pages/search-pairings-page.tsx`
- 方法：`handleCriteriaAdd`
- 当前调用：`pairingService.saveCurrentDraft(...)`

这会把当前缓存里的 existing properties 拼成完整 draft 后提交。若缓存不是最新，就存在覆盖风险。

### 收藏接口返回数据偏重

当前后端：

- `saveFavoriteProperty` 写入收藏后调用 `loadFavoritePropertyCodes`
- `removeFavoriteProperty` 删除收藏后也调用 `loadFavoritePropertyCodes`
- 返回 `{ favoritePropertyCodes: number[] }`

当前前端：

- `/pairing` 页面在成功前已经乐观更新本地和 query cache。
- `/pairing/search` 页面也乐观更新 criteria 和 query cache。
- 两个页面都没有依赖接口返回的完整 favorite list 来决定 UI。

因此收藏接口可以改为 `{ saved: true }`，保留失败回滚即可。

### `propertyCode` 不应作为数据库关系身份

当前 `pbs_bid_property` 有两个容易混淆的字段：

- `id`：数据库自增主键，适合做稳定关系身份。
- `property_code`：业务编码，当前前后端大量使用，未来可能调整。

如果 favorite 表只存 `property_code`，未来 code 改动时就需要批量更新 favorite 历史数据。更稳的做法是：

- favorite 表新增 `property_id bigint`，关联 `pbs_bid_property.id`。
- 创建唯一键 `(bid_id, property_id)`。
- 继续保留 `property_code` 作为兼容字段，或者在过渡期由后端按 `property_id` join 出当前 code。
- API 创建收藏时可以继续接收 `propertyCode`，但后端必须先解析成 `propertyId` 再写入。

同理，`pbs_bid_group.property_id` 和 `pbs_bid_condition.property_id` 当前名字叫 id，但注释和实际使用都是 property code。长期也应新增稳定的 `property_definition_id` 或类似字段，逐步把规则保存和读取切到 `pbs_bid_property.id`。

## 方案比较

### 方案 A：只改 `/pairing/search` 添加

做法：

- Search 页添加改用 `addCurrentDraftProperty`。
- 收藏接口不动。

优点：

- 改动最小。

缺点：

- 没有回应“两个页面同一接口必须一起检查”的问题。
- 收藏接口仍做不必要查询。

结论：不够完整。

### 方案 B：统一 search 添加与收藏轻量化，并为收藏加稳定关系身份

做法：

- Search 页添加改用 `addCurrentDraftProperty`。
- 添加成功后把返回的 `propertyGroupKey` 写入 query cache。
- 收藏表新增稳定关系字段 `property_id`，并用 `(bid_id, property_id)` 做唯一约束。
- 收藏接口返回 `favoriteKey`，取消收藏优先按 `favoriteKey` 删除。
- 前端缓存中不再只有 `favoritePropertyCodes`，还要有 `favoriteProperties: { favoriteKey, propertyId, propertyCode }[]`。
- 前端 service 类型从 `PbsPairingFavoritePropertiesResponse` 改为 favorite mutation response。
- `/pairing` 和 `/pairing/search` 两边测试同步更新。

优点：

- 两个页面对同一操作走同一接口语义。
- 添加不再全量保存，减少覆盖风险。
- 收藏接口少一次全量 favorites 查询，响应更轻。
- 收藏关系不会因为未来 property code 变化而丢失身份。
- 数据库唯一键能阻止重复收藏，性能查询也更明确。

缺点：

- 需要新增 migration，并同步改 contract、route/service 测试、两个页面测试。
- 需要保留 `propertyCode` 兼容一段时间，因为前端 property catalog 仍以 code 作为业务配置入口。

结论：推荐。

### 方案 C：收藏也加 propertyGroupKey

做法：

- 收藏从按 `propertyCode` 改为按具体 property instance key。

优点：

- 可以收藏某一条具体配置。

缺点：

- 当前业务收藏的是 property 类型，不是具体条件实例。
- 会改变产品语义，范围过大。

结论：不推荐。

### 方案 D：一次性把所有条件引用从 property code 改为 property id

做法：

- `pbs_bid_group` 新增 `property_definition_id bigint`，关联 `pbs_bid_property.id`。
- `pbs_bid_condition` 新增 `property_definition_id bigint`。
- Pairing / Line / DaysOff 所有保存和读取都改为用 `property_definition_id`。
- `property_id` 旧字段保留兼容或后续重命名为 `property_code`。

优点：

- 从根上解决 property code 可变问题。
- 数据模型命名会更准确。

缺点：

- 影响范围明显大于本次 search 添加和收藏优化，会触达多个 bid 模块。
- 需要仔细验证 AA 映射、旧数据回填、所有 draft mapper。

结论：作为正式数据模型加固方向，但不建议和本次 favorite/search 小修混在同一批实现里一次做完。可以在本次 favorite 先按稳定 `property_id` 落地后，紧接着单独开一份“property definition id 迁移”设计。

## 推荐方案

采用方案 B，并把方案 D 写入后续数据模型加固路线。

这次先把 favorite 做对：收藏关系用稳定 `favoriteKey` + `propertyId`，不再只靠 `propertyCode`。同时把 search 添加切到轻量接口。

条件表 `pbs_bid_group` / `pbs_bid_condition` 的 `property_id` 语义修正范围更大，建议单独设计和实现，避免在当前 pairing 页面修复里一次触发 Line / DaysOff 的大回归。

## API 设计

### Search 添加

继续复用：

```http
POST /api/pairing-bids/current/properties
```

响应：

```ts
{
  saved: true;
  propertyGroupKey: string;
  rowSeq: number;
}
```

Search 页添加成功后：

- 使用 preview/search criteria 构造新增 existing property。
- 将接口返回的 `propertyGroupKey` 作为新增 property 的 `id`。
- 更新 `pairingPageDataQueryKey`。
- invalidate `layerPageDataQueryKey`。

### 收藏/取消收藏

路径保持不变：

```http
PUT /api/pairing-bids/current/favorites/:propertyCode
DELETE /api/pairing-bids/current/favorites/:propertyCode
```

响应改为：

```ts
{
  saved: true;
  favoriteKey: string;
  propertyId: number;
  propertyCode: number;
}
```

说明：

- 创建收藏仍可按 `propertyCode` 入参，因为收藏前前端只有 property catalog 的 code。
- 后端解析 `propertyCode` 为 `pbs_bid_property.id` 后写入。
- 删除收藏优先使用 `favoriteKey`。如果为了兼容保留按 `propertyCode` 删除，也只作为过渡路径。
- 前端继续乐观更新；失败时回滚。
- 不再为了返回列表而额外查询所有 favorite codes。

GET current draft 建议补充：

```ts
favoriteProperties: Array<{
  favoriteKey: string;
  propertyId: number;
  propertyCode: number;
}>;
```

短期兼容：

```ts
favoritePropertyCodes: number[];
```

前端新逻辑优先用 `favoriteProperties`，旧字段只保留给还没迁移的调用点。

## 数据库设计

### Favorite 表

新增 migration，不修改已确认建表脚本。

建议：

```sql
alter table pbs_bid_pairing_favorite
  add column if not exists property_id bigint;

update pbs_bid_pairing_favorite favorite
set property_id = property.id
from pbs_bid_property property
where favorite.property_id is null
  and favorite.property_code = property.property_code
  and property.bid_type = 'Pairing';

alter table pbs_bid_pairing_favorite
  alter column property_id set not null;

create unique index if not exists uq_pbs_bid_pairing_favorite_property_id
  on pbs_bid_pairing_favorite (bid_id, property_id);

create index if not exists idx_pbs_bid_pairing_favorite_property_id
  on pbs_bid_pairing_favorite (property_id);
```

如果当前数据库已有外键策略，本次可继续补：

```sql
alter table pbs_bid_pairing_favorite
  add constraint fk_pbs_bid_pairing_favorite_bid
  foreign key (bid_id) references pbs_bid(id);

alter table pbs_bid_pairing_favorite
  add constraint fk_pbs_bid_pairing_favorite_property
  foreign key (property_id) references pbs_bid_property(id);
```

说明：

- `property_code` 可以暂时保留，用于兼容和排查。
- 唯一约束以 `property_id` 为准，不再以 `property_code` 为准。
- 删除 favorite 时用 favorite 表主键 `id` 作为 `favoriteKey`，或者额外增加 UUID key；推荐先用现有 `id`，因为表内已经有稳定主键。

### 条件表后续加固

后续单独 migration：

```sql
alter table pbs_bid_group
  add column if not exists property_definition_id bigint;

alter table pbs_bid_condition
  add column if not exists property_definition_id bigint;
```

回填逻辑按旧 `property_id = property_code` join `pbs_bid_property.property_code`。完成后，后端读写优先使用 `property_definition_id`。

这个设计可以让未来 `property_code` 改动时，历史 bid 条件仍然指向同一个 property 定义。

## 前端设计

### `/pairing/search`

- `handleCriteriaAdd` 从 `saveCurrentDraft` 改为 `addCurrentDraftProperty`。
- 新增 property 先用临时 id 构造本地对象。
- 接口成功后用 `propertyGroupKey` 替换临时 id 后写入 query cache。
- pending 状态仍保持 add 按钮不可重复点击。

### `/pairing`

- 收藏/取消收藏调用仍保持当前 service，但 service 返回类型改成 `{ saved: true }`。
- 本地和 query cache 乐观更新逻辑不变。

### 共享 service

- `favoriteProperty` / `unfavoriteProperty` 返回 `PbsPairingDraftMutationResponse`。
- `favoriteProperty` 返回 favorite mutation response，包含 `favoriteKey/propertyId/propertyCode`。
- `unfavoriteProperty` 返回 `{ saved: true }`，前端按已知 key/code 回滚即可。
- `addCurrentDraftProperty` 继续返回 `PbsPairingDraftPropertyMutationResponse`。

## 后端设计

- `saveFavoriteProperty` 解析 `propertyCode -> propertyId`，写入 favorite，并返回 favorite row 的 `id` 作为 `favoriteKey`。
- `removeFavoriteProperty` 优先按 `favoriteKey` 删除；兼容期可保留按 `propertyCode` 删除。
- 仍保留 property catalog 校验，避免收藏不支持的 property code。
- 保留 `ensureCurrentBid` 行为，因为收藏需要挂到 current bid 上。
- 添加数据库唯一键 `(bid_id, property_id)`，并在 service 层用 upsert 处理重复点击。

## 测试计划

后端：

- 更新 `pbs-server/src/routes/pairing-bids.test.ts`
  - 收藏接口返回 `favoriteKey/propertyId/propertyCode`。
  - 取消收藏接口支持按 `favoriteKey` 删除。
- 更新 `pbs-server/src/app.test.ts` 对应断言。
- 跑 `pbs-server npm run build`、`pbs-server npm test`。

前端：

- 更新 `/pairing/search` 页面测试：
  - 添加 criteria 调用 `addCurrentDraftProperty`，不再调用 `saveCurrentDraft`。
  - query cache 中新增 existing property 使用返回的 `propertyGroupKey`。
- 更新 `/pairing` 页面收藏测试：
  - service mock 返回 favorite mutation response。
  - 乐观更新和失败回滚仍有效。
- 跑 pairing 相关测试、`pbs-portal npm test`、`pbs-portal npm run build`。

## 验收标准

- `/pairing/search` 添加不再调用 `saveCurrentDraft`。
- `/pairing` 和 `/pairing/search` 添加 current property 都走轻量添加接口。
- 添加成功后的新增 existing property 有后端返回的稳定 `propertyGroupKey`。
- 收藏接口不再返回完整 `favoritePropertyCodes`，而是返回当前收藏关系的稳定 key。
- 取消收藏接口优先按稳定 `favoriteKey` 删除。
- favorite 表有稳定 `property_id` 和唯一键 `(bid_id, property_id)`。
- 两个页面收藏状态仍通过同一个 query cache 保持一致。
- 回归测试全部通过。
