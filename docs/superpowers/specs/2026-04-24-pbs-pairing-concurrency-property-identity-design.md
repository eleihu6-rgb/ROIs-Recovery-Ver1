# PBS Pairing 并发安全与 Property 身份标识设计

日期：2026-04-24
状态：待确认

## 背景

`/pairing` 页面已经新增了轻量添加/删除接口：

- `POST /api/pairing-bids/current/properties`
- `DELETE /api/pairing-bids/current/properties/:rowSeq?periodCode=...`

这两个接口让添加/删除 property 的性能明显提升，但当前接口仍有两个设计隐患：

1. 删除接口使用 `rowSeq` 作为路径参数。`rowSeq` 是页面顺序，不是稳定数据库身份；并发、多标签页、重复点击或列表被其他请求改动后，可能删除到错误的 property。
2. 添加接口只返回 `{ saved: true }`，没有返回新增 property 的持久身份，前端只能继续使用本地临时 id 和顺序推导。

用户预计会有大约 100 个用户同时操作。不同 crew 的 current draft 彼此独立，主要风险不是全系统 100 人互相抢，而是同一个 crew / 同一个 current bid 在多个请求中被同时修改。

## 目标

- 同一个 current pairing bid 被并发添加/删除时，后端结果保持一致。
- 删除 property 不再依赖列表位置 `rowSeq`，改用稳定后端身份。
- 添加 property 后，接口返回新 property 的稳定 key，前端后续删除使用该 key。
- 继续保持当前轻量接口的性能优势，不回退到全量保存。
- 兼容现有 `PUT /api/pairing-bids/current` 全量保存/autosave 路径。
- 尽量控制改造范围，避免引入过大的数据模型重构。

## 非目标

- 本次不重构 Days Off、Line、Reserve 的 bid 存储模型。
- 本次不把所有 `periodCode` API 一次性替换为 `periodId` 或 `bidId`。
- 本次不新增复杂的 property group 父表，除非实现阶段发现现有表无法安全承载。
- 本次不改变 pairing property 的业务含义、AA 映射规则或搜索页筛选逻辑。

## 当前问题分析

### `rowSeq` 不适合作为删除身份

当前删除路径示例：

```http
DELETE /api/pairing-bids/current/properties/3?periodCode=Apr%202026
```

这里的 `3` 表示页面上的第 3 条 pairing property。它只适合展示顺序，不适合作为接口身份。

典型风险：

- 用户打开两个标签页。
- 标签页 A 删除第 2 条 property。
- 标签页 B 仍以旧列表为准，删除第 3 条 property。
- 后端按最新数据库顺序删除 `rowSeq = 3`，可能删到用户没有想删的那条。

### 不能只加 `(bid_id, bid_type, group_seq)` 唯一键

`pbs_bid_group` 的一条页面 property 可能被添加到多个 layer。数据库会为每个 layer 插入一行 `pbs_bid_group`，这些行在页面上属于同一个 property。

如果简单加：

```sql
unique (bid_id, bid_type, group_seq)
```

同一个 property 跨多个 layer 时就会冲突，因此这个唯一键不符合当前模型。

### `periodCode` 不应作为 property 操作主身份

`periodCode` 是业务周期编码，例如 `Apr 2026`。它适合展示和兼容旧接口，但它不是具体 draft 或具体 property 的稳定身份。

对于 `current` 语义的接口，后端应基于当前登录用户、current period、`bid_context = Current` 定位当前 draft。删除具体 property 时，应额外使用 property 的稳定 key，而不是依赖 `periodCode + rowSeq`。

## 方案比较

### 方案 A：只加 layer 维度唯一键，继续使用 rowSeq

做法：

- 增加唯一键：`(bid_id, bid_type, layer_id, group_seq)`。
- 添加时遇到冲突则失败或重试。
- 删除接口仍用 `rowSeq`。

优点：

- 改动最小。
- 能防止同一个 layer 内重复插入同一个顺序的 group。

缺点：

- 没有解决删除身份不稳定的问题。
- 并发下两个逻辑 property 仍可能抢到同一个 `rowSeq`，只是冲突更早暴露。
- 前端仍无法拿到后端持久 key。

结论：不推荐作为最终方案。

### 方案 B：在 `pbs_bid_group` 上增加 property 实例 key，并对同一个 bid 串行化写入

做法：

- 在 `pbs_bid_group` 增加 `property_group_key` 字段。
- 页面上的一条 pairing property 对应一个 `property_group_key`。
- 如果该 property 选中多个 layer，则多个 `pbs_bid_group` 行共享同一个 `property_group_key`。
- 添加接口返回该 key。
- 删除接口改为按该 key 删除。
- 添加/删除同一个 bid 时使用事务级锁，让同一个 bid 的结构性写入排队执行。
- 增加唯一约束，防止同一个 property key 在同一个 layer 下重复插入。

优点：

- 解决 `rowSeq` 删除错对象的问题。
- 支持同一个 property 跨多个 layer。
- 并发时同一个 bid 的添加/删除不会互相踩顺序。
- 改造范围比新增父表小，能复用现有 `pbs_bid_group`。

缺点：

- 需要 migration、Drizzle model、contract、route、service、前端和测试同步更新。
- `pbs_bid_group` 会同时承载展示顺序和逻辑 property 身份，模型仍不是最干净的长期形态。

结论：推荐采用。

### 方案 C：新增 `pbs_bid_property_group` 父表

做法：

- 新建父表保存页面上的 property 实例：`id/key`、`bid_id`、`group_seq`、property 主信息。
- `pbs_bid_group` 变成 layer 维度子表或执行规则表。
- 添加/删除都基于父表 id。

优点：

- 数据模型最清晰。
- 后续支持复杂 AND 条件、排序、跨 layer 编辑会更自然。

缺点：

- 改动最大，当前已有 service、AA 映射和 draft mapper 都需要较大调整。
- 对当前“先解决并发和错误删除”的目标来说偏重。

结论：作为后续长期演进方向，本次不优先。

## 推荐方案

采用方案 B。

核心思路：

1. `rowSeq` 继续作为展示顺序，但不再作为 API 删除身份。
2. 新增 `propertyGroupKey` 作为一条页面 property 的稳定后端身份。
3. 添加接口返回 `propertyGroupKey`。
4. 删除接口通过 `propertyGroupKey` 删除。
5. 同一个 bid 的添加/删除在数据库事务内串行执行，避免并发抢 `group_seq`。
6. 通过数据库唯一约束兜底，防止重复插入。

## 数据库设计

新增 migration，不修改已确认的 `sql/schema/03-pbs_pg.sql` 建表脚本。

建议给 `pbs_bid_group` 增加字段：

```sql
alter table pbs_bid_group
add column if not exists property_group_key varchar(36);
```

历史数据回填：

```sql
update pbs_bid_group
set property_group_key = md5(bid_id::text || ':' || coalesce(bid_type, 'UNKNOWN') || ':' || group_seq::text)
where property_group_key is null;
```

约束与索引：

```sql
alter table pbs_bid_group
alter column property_group_key set not null;

create unique index if not exists uq_pbs_bid_group_property_layer
on pbs_bid_group (bid_id, bid_type, property_group_key, layer_id);

create index if not exists idx_pbs_bid_group_property_key
on pbs_bid_group (bid_id, bid_type, property_group_key);
```

说明：

- 不使用 `(bid_id, bid_type, group_seq)` 唯一键，因为同一条页面 property 可以跨多个 layer。
- `property_group_key` 可使用 `crypto.randomUUID()` 生成。
- 历史回填 key 只需要保证同一个 bid 下同一 `group_seq` 的多 layer rows 共享同一个 key。

## API 设计

### 添加 property

保留路径：

```http
POST /api/pairing-bids/current/properties
```

请求体暂时保留 `periodCode`，用于兼容现有前端和当前 draft 定位：

```ts
export type PbsAddPairingCurrentPropertyRequest = {
  periodCode?: string;
  bidContext: "Current";
  remarks?: string;
  property: Omit<PbsPairingDraftProperty, "rowSeq" | "propertyGroupKey">;
};
```

响应从轻量保存扩展为：

```ts
export type PbsPairingDraftPropertyMutationResponse = {
  saved: true;
  propertyGroupKey: string;
  rowSeq: number;
};
```

说明：

- `propertyGroupKey` 是后续删除和前端 existing property id 的主身份。
- `rowSeq` 仅用于前端本地排序和测试断言，不作为删除身份。

### 删除 property

新增或替换路径：

```http
DELETE /api/pairing-bids/current/properties/:propertyGroupKey
```

查询参数：

```ts
periodCode?: string;
```

行为：

- 后端定位当前用户的 current pairing bid。
- 按 `propertyGroupKey` 删除该 bid 下所有对应 `pbs_bid_group` 和 `pbs_bid_condition`。
- 删除后对更靠后的 `group_seq` 做前移，保持展示顺序连续。
- 如果 key 不存在，按幂等删除处理，返回 `{ saved: true }`。

兼容策略：

- 实现阶段可以保留旧的 `currentPropertyByRowSeq` contract 一小段时间，但前端 `/pairing` 页面改为只调用 key 版本。
- 旧 rowSeq 路径后续应删除，避免继续被误用。

## 并发控制

添加/删除 property 属于同一个 bid 的结构性写入，需要保证同一个 bid 内顺序一致。

推荐在添加/删除的 SQL 或事务中加入 PostgreSQL advisory transaction lock：

```sql
select pg_advisory_xact_lock(<bid_id>);
```

语义：

- 同一个 bid 的 add/delete 请求排队执行。
- 不同 bid 的请求互不影响。
- 事务结束后锁自动释放。

这样 100 个不同用户同时操作不会被一个全局锁拖慢；只有同一个 crew 同一个 current draft 的并发修改会被串行化。

## 前端设计

- `PairingExistingProperty` 增加 `propertyGroupKey` 或让现有 `id` 直接使用后端 key。
- `mapPairingDraftResponseToPageData` 从后端 draft 读取 key。
- 添加成功后，前端用接口返回的 `propertyGroupKey` 更新刚新增的本地 existing property。
- 删除时传 `propertyGroupKey`，不再传 `propertyIndex + 1`。
- pending 禁用逻辑保持现状：接口真正完成后再恢复按钮。
- 如果添加失败，保持当前回滚/错误处理语义。

## 与 `periodCode` 的关系

短期：

- `periodCode` 可以继续保留在请求体或查询参数里，作为兼容字段。
- 后端仍然应该校验它与当前 period/current bid 的关系。

中期：

- current 语义接口不应依赖 `periodCode` 作为主身份。
- 可以让 `GET /api/pairing-bids/current` 返回 `draftKey` 或 `bidId`，后续结构性写入基于该 key。

本次推荐只完成 property 身份和并发保护，避免把 period/bid 身份体系一次性扩大改造。

## 测试计划

后端：

- migration 能在已有数据上回填 `property_group_key`。
- 添加接口返回 `propertyGroupKey` 和 `rowSeq`。
- 删除接口按 `propertyGroupKey` 删除，不再按 `rowSeq` 删除。
- 同一 property 跨多个 layer 时，多个 `pbs_bid_group` 共享同一个 `propertyGroupKey`。
- 同一 key + 同一 layer 重复插入会被唯一约束拦住。
- 并发测试：同一个 bid 同时添加两条 property，最终 `group_seq` 不重复且顺序连续。
- 并发测试：删除与添加交错执行后，最终数据不出现错删和断序。

前端：

- 添加后使用接口返回的 key 保存 existing property id。
- 删除时调用 key 版本接口。
- 原有 pending 状态和失败回滚测试继续通过。
- pairing 页面单测覆盖添加/删除调用参数变化。

回归：

- `pbs-server npm run build`
- `pbs-server npm test`
- `pbs-portal` pairing 页面相关测试
- `pbs-portal npm run build`

## 验收标准

- `/pairing` 页面删除 existing property 不再调用 rowSeq 删除接口。
- 添加接口返回稳定 key，前端刷新前后同一条 property 都能用该 key 表示。
- 同一个 bid 的并发添加不会产生重复 `group_seq` 或重复 layer row。
- 同一个 bid 的并发删除不会因列表顺序变化删错 property。
- 不同用户/不同 bid 同时操作不会被全局串行化。
- 添加/删除性能仍保持轻量接口路径，不退回全量 draft 保存。

## 风险与注意事项

- 原始 `pbs_bid_group.group_seq` 注释是“分组在层内的序号”，但当前 pairing UI 已经把它当成页面 property 的顺序使用。本次不改变这个事实，只把“身份”从 `group_seq` 中剥离出来。
- 如果未来支持一条 property 下多组 AND 条件链，`property_group_key` 仍可作为父级逻辑身份；届时可再评估是否升级为独立父表。
- migration 回填必须保证历史同一 `bid_id + bid_type + group_seq` 的多 layer rows 共享同一个 key，否则旧数据刷新后会被拆成多条 property。
- advisory lock 必须只锁定单个 bid，不能做全局锁，否则会影响多用户同时操作体验。
