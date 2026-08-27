# PBS 稳定身份与数据库约束治理路线图

日期：2026-04-24
状态：待确认

## 背景

当前 PBS 模块已经暴露出一类共性问题：部分接口和表字段把“业务编码 / 展示顺序”当成了“稳定身份”使用。

已经发现的例子：

- `/pairing` 删除 property 曾经用 `rowSeq`，这是页面顺序，不是稳定身份。
- `pbs_bid_group.property_id` 和 `pbs_bid_condition.property_id` 字段名叫 `property_id`，但实际存的是 `pbs_bid_property.property_code`。
- `pbs_bid_pairing_favorite` 当前用 `(bid_id, property_code)` 做唯一键，如果未来 `propertyCode` 调整，历史收藏关系会被 code 变化牵连。
- 多个 current draft 接口仍带 `periodCode`，这适合显示和兼容，但不是最稳的内部关系身份。

用户明确要求：整个 PBS 都要朝“稳定 id/key + 数据库约束 + 可扩展”的方向治理。可以分多轮做，但每一类问题都要处理到位，避免以后出现大问题。

## 核心原则

1. 业务 code 可以保留，但不作为长期关系身份。
2. 页面顺序可以保留，但不作为 API 删除/修改身份。
3. 数据库已有自增 `id` 的表，关系引用优先使用 `id`。
4. 对跨多行表达的 UI 实例，使用额外稳定 key，例如 `propertyGroupKey`。
5. 能通过唯一键、索引、外键表达的数据规则，优先落到数据库。
6. API 对外可以兼容旧 code，但 service 内部要尽早解析成稳定 id。
7. 每一轮 migration 必须幂等、可回填、可验证。

## 现状盘点

### 已开始修正

`pbs_bid_group` 已新增 `property_group_key`：

- 解决 pairing 页面一条 property 跨多个 layer 的稳定身份问题。
- 删除 property 按 key，不再按 `rowSeq`。
- 已加唯一键 `(bid_id, bid_type, property_group_key, layer_id)`。

### 仍需治理

#### Property 定义引用

当前：

- `pbs_bid_property.id` 是稳定主键。
- `pbs_bid_property.property_code` 是业务编码。
- `pbs_bid_group.property_id` 实际存 `property_code`。
- `pbs_bid_condition.property_id` 实际存 `property_code`。
- `pbs_bid_pairing_favorite.property_code` 直接存 code。

风险：

- 如果未来 `propertyCode` 调整，历史 bid、condition、favorite 都需要批量跟随。
- 字段名和实际语义不一致，后续开发容易误判。

#### Period / Bid 身份

当前：

- `pbs_period.id` 是稳定主键。
- `pbs_period.period_code` 是业务周期编码。
- `pbs_bid` 已有 `pbs_period_id`，但很多接口和查询仍以 `periodCode` 为主要输入。

风险：

- `periodCode` 格式或航司维度变化时，接口和查询更容易出错。
- current draft 接口语义上应该定位当前 period/current bid，而不是让前端反复传 code 作为身份。

#### Award 匹配引用

当前：

- `pbs_award_item.matched_group_seq` 存匹配到的分组序号。

风险：

- `group_seq` 是顺序，不是稳定分组身份。
- 如果 bid 发生修改或重新排序，award item 的匹配解释会变弱。

#### 并发版本控制

当前：

- pairing add/delete 已通过同 bid advisory lock 改善结构性写入并发。
- 但完整 `PUT /pairing-bids/current` 仍可能后写覆盖先写。

风险：

- 多标签页或多设备同时编辑时，完整草稿保存可能覆盖对方变更。

## 分阶段治理方案

### 第 0 轮：当前 pairing 补救

范围：

- `/pairing/search` 添加改用轻量 add property 接口。
- favorite 表增加稳定 `property_id`。
- favorite 创建返回 `favoriteKey`。
- favorite 删除优先按 `favoriteKey`。
- favorite 表增加唯一键 `(bid_id, property_id)` 和必要索引。

目标：

- 立即消除 search 添加仍全量保存的问题。
- favorite 不再只依赖 `propertyCode`。
- `/pairing` 和 `/pairing/search` 两个入口统一。

验收：

- search 添加不再调用 `saveCurrentDraft`。
- favorite 删除不再只按 `propertyCode`。
- favorite 数据库唯一约束以稳定 `property_id` 为准。

### 第 1 轮：Property Definition ID 迁移

范围：

- `pbs_bid_group` 新增 `property_definition_id bigint`。
- `pbs_bid_condition` 新增 `property_definition_id bigint`。
- 通过旧 `property_id = property_code` 回填。
- 增加索引和 FK：
  - `pbs_bid_group.property_definition_id -> pbs_bid_property.id`
  - `pbs_bid_condition.property_definition_id -> pbs_bid_property.id`
- 后端 Pairing / Line / DaysOff 保存时写入 `property_definition_id`。
- 后端读取时优先用 `property_definition_id` join property 定义；对旧数据保留 code fallback。

目标：

- 让历史 bid 条件不受未来 `propertyCode` 改动影响。
- 保留 `property_code` 用于前端展示、AA 兼容和过渡。

验收：

- 新保存的 group/condition 都有 `property_definition_id`。
- 旧数据回填后空值为 0。
- 修改某个 property 的 `property_code` 不影响已保存 bid 指向同一 property 定义。

### 第 2 轮：Period / Bid 身份收敛

范围：

- current draft GET 返回稳定 `bidId` 或 `draftKey`。
- current draft mutation 优先使用 server resolved current bid，减少前端传 `periodCode` 作为身份。
- service 层查询优先使用 `pbs_period_id` / `bid_id`。
- 保留 `periodCode` 作为显示字段和兼容入参。

目标：

- 把 `periodCode` 从“身份”降级为“展示/兼容 code”。
- 降低 period code 格式变化带来的风险。

验收：

- 新增/删除/收藏等 current 操作不依赖 `periodCode` 才能定位具体 property/favorite。
- `pbs_bid` 与 `pbs_period` 的关系通过 `pbs_period_id` 可完整追溯。

### 第 3 轮：完整草稿保存并发保护

范围：

- `pbs_bid` 增加 `draft_version` 或使用 `updated_at` 作为乐观锁版本。
- `GET current draft` 返回版本。
- `PUT current draft` 必须带版本。
- 版本不一致时返回 409，前端提示刷新或合并。

目标：

- 解决多标签页/多设备完整保存覆盖问题。

验收：

- 旧版本保存不会覆盖新版本。
- add/delete/favorite 仍保持轻量接口和同 bid 串行保护。

### 第 4 轮：Award 匹配引用稳定化

范围：

- `pbs_award_item` 增加 `matched_group_id` 或 `matched_property_group_key`。
- 分配结果生成时写稳定引用。
- `matched_group_seq` 保留为展示/兼容字段。

目标：

- award 结果解释不再只依赖当时的顺序号。

验收：

- award item 可以追溯到具体 bid group 或 property group key。
- 顺序变化不影响历史解释。

### 第 5 轮：旧字段清理与命名修正

范围：

- 对误导性字段做兼容重命名或注释修正，例如：
  - `property_id` 当前存 code 的旧字段，明确改为 legacy/code 字段。
  - 新字段统一命名为 `property_definition_id`。
- contract 里逐步减少只暴露 code 的 mutation。
- 删除不再使用的旧 route，例如 rowSeq 删除路径。

目标：

- 让数据库字段名和真实语义一致。
- 减少后续开发误用。

## 数据库约束原则

每轮新增或调整表时都要检查：

- 主键：是否已有稳定主键或 key。
- 唯一键：业务上不能重复的组合必须建唯一键。
- 外键：稳定关系字段可以加 FK 的要加 FK。
- 索引：高频查询条件必须有索引。
- 幂等 migration：使用 `if not exists` 或可重复执行的 DO block。
- 回填验证：migration 后提供空值/重复值检查 SQL。

## API 设计原则

- 创建操作可以接受业务 code，因为前端常常只有 code。
- 后端创建后必须返回稳定 key/id。
- 删除/修改操作优先使用稳定 key/id。
- code 入参只作为过渡兼容，不作为长期主路径。
- 响应里可以同时返回：
  - 稳定身份：`id` / `key`
  - 业务 code：`propertyCode` / `periodCode`
  - 展示字段：`name` / `rowSeq`

## 实施顺序建议

推荐顺序：

1. 先完成第 0 轮，因为它直接影响当前 pairing 开发。
2. 立刻进入第 1 轮，解决 property code 可变的核心数据模型问题。
3. 第 2、3 轮处理 period/bid 身份和并发完整保存。
4. 第 4 轮在 award 结果链路成熟时处理。
5. 第 5 轮作为兼容期后的清理。

## 风险控制

- 不修改已确认建表脚本，只新增 migration。
- 每一轮只处理一个身份主题，避免大范围回归。
- 旧字段先保留，读写双轨过渡。
- 新字段回填完成并通过验证后，后端新写入优先使用新字段。
- 每轮都补测试，不依赖人工记忆。

## 当前下一步

如果确认本路线图，下一步先实施第 0 轮：

- `/pairing/search` 添加改轻量接口。
- favorite 表加 `property_id`、唯一键、索引/FK。
- favorite 返回并使用 `favoriteKey`。
- 两个页面测试一起更新。

第 0 轮完成并回归通过后，再写第 1 轮详细设计并实施 property definition id 迁移。
