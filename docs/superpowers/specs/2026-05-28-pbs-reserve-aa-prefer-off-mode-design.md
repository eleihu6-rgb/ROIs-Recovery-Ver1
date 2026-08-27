# PBS Reserve AA Prefer Off 模式设计

日期：2026-05-28  
状态：待用户确认  
范围：Reserve 页面从 Legacy-only 升级为 Legacy / AA 双模式；本文件只定义需求和方案，不包含实现改动。

## 背景

当前 Reserve 第一阶段已经完成旧库优先链路：

- `Legacy Reserve` 使用旧库语义。
- `301 Short Call Type` 表示想要的 reserve call type。
- `302 Reserve Day On` 表示“我想这天上 reserve / on duty”。
- Reserve coverage 从数据库 `pbs_reserve_coverage` 读取，页面展示 `Need` 和 `Off`。
- 顶部已有 `Legacy Reserve` / `AA Prefer Off` 两个视觉标签，但 `AA Prefer Off` 目前不能真正切换。

用户现在确认：需要把 `AA Prefer Off` 也开发出来，按钮可以来回切换。

关键产品决定：

```text
AA Prefer Off 不复用旧库 302，也不复用 Days Off 201。
AA Prefer Off 作为 Reserve 模块自己的 AA 属性保存，新增 propertyCode=311。
```

## 语义定义

### Legacy Reserve 模式

面向旧库兼容：

- 点击 coverage 日期：添加 `302 Reserve Day On`。
- 含义：我希望这一天上 reserve / 备勤。
- 右侧属性列表只展示 Legacy Reserve 属性：
  - `301 Short Call Type`
  - `302 Reserve Day On`

### AA Prefer Off 模式

面向 AA Reserve 语义：

- 点击 coverage 日期：添加 `311 Reserve Prefer Off`。
- 含义：我希望这一天不要 reserve / 想休息。
- 右侧属性列表只展示 AA Reserve 属性：
  - `311 Reserve Prefer Off`

两种模式共享同一份 coverage 数据：

- `required_reserve_count`：当天公司需要多少 reserve 人手。
- `available_off_count`：当天可批准休息名额 / 请假空间。

在 Legacy 模式里，coverage 用来辅助判断“哪天适合请求上 reserve”。  
在 AA 模式里，coverage 用来辅助判断“哪天请假更难或更容易”。

## 不做范围

- 不实现 AA Reserve 完整 pattern / work block award 算法。
- 不实现 `Reserve Day of Week Off`。
- 不实现 `Reserve Work Block Size`。
- 不实现 `Waive to Allow Carry over to be Days Off`。
- 不改 Submit / Award engine。
- 不把 AA Prefer Off 写入 Days Off `201 Prefer Off`。
- 不把 `302 Reserve Day On` 改名或改语义。

## 方案比较

### 方案 A：AA Prefer Off 复用 Days Off 201

优点：

- 少建一个属性。
- 可复用 Days Off 的日期控件和部分逻辑。

缺点：

- Reserve 页面会写入 Days Off bid，模块边界混乱。
- Tier 总结、Submit、Award 后续很难解释“这个 Days Off 是 Reserve 页面来的”。
- 以后 AA Reserve 的专属规则会越来越难挂载。

结论：不采用。

### 方案 B：AA Prefer Off 复用旧库 302

优点：

- 改动最小。

缺点：

- 语义相反：`302` 是想上 reserve，AA Prefer Off 是想休息。
- 会再次造成旧库和 AA 文档冲突。

结论：明确禁止。

### 方案 C：AA Prefer Off 使用 Reserve 专属新属性 311

优点：

- Legacy 和 AA 语义彻底隔离。
- 仍属于 Reserve 模块，后续 AA Reserve 扩展自然落在同一域。
- 前端可以用同一个页面底座、同一个 coverage、同一套 draft mutation。
- 后端校验清晰：Legacy 属性和 AA 属性都属于 `bid_type='Reserve'`，但按 `mode` 分组展示和快捷添加。

缺点：

- 需要新增 property catalog、校验和 seed / migration。
- 前端需要支持 mode state 和按 mode 过滤右侧属性。

结论：采用。

## 数据设计

### 新增属性

新增 Reserve AA 属性：

```text
property_code = 311
bid_type = Reserve
property_name = Reserve Prefer Off
source_type = aa
is_visible_in_portal = 1
display_order = 311
```

建议 validation：

```json
{
  "type": "date",
  "format": "YYYY-MM-DD",
  "label": "Dates",
  "multi": true
}
```

保存映射：

```text
bid_type = Reserve
property_code = 311
operator = In
param_a = YYYY-MM-DD 日期列表
```

### Draft 存储

继续复用现有 Reserve draft 存储：

- `pbs_bid`
- `pbs_bid_tier`
- `pbs_bid_group`
- `property_group_key`
- `draft_version`

同一个 Reserve draft 可以同时保存 Legacy 和 AA 属性，但页面按当前 mode 过滤展示：

- Legacy mode 展示 `301/302`。
- AA mode 展示 `311`。

这样切换模式不会丢数据，也不需要为两个 mode 建两份 draft。

## Contract / API 设计

### Contract

在 `packages/contracts/pbs-reserve-bids.*` 中新增：

```text
pbsReserveAaPropertyCodes.preferOff = 311
pbsReserveAaPropertyCatalog = [311 Reserve Prefer Off]
pbsSupportedReservePropertyCatalog = legacy + aa
PbsReserveMode = "legacy" | "aa-prefer-off"
```

`PbsReserveDraftDocument.mode` 从仅支持 `"legacy"` 扩展为：

```text
"legacy" | "aa-prefer-off"
```

说明：

- `mode` 用于前端当前编辑视角和保存 payload。
- 后端不因为当前 mode 删除另一种 mode 的属性。

### API

现有接口继续使用：

```text
GET /api/reserve-bids/current
GET /api/reserve-bids/current/coverage
POST /api/reserve-bids/current/properties
PATCH /api/reserve-bids/current/properties/:propertyGroupKey
DELETE /api/reserve-bids/current/properties/:propertyGroupKey
PUT /api/reserve-bids/current
```

后端返回的 `propertyCatalog` 包含 `301/302/311`，前端按 mode 过滤。

新增接口不是第一选择；当前接口足够支撑按钮切换和 AA Prefer Off 添加。

## 后端校验

Reserve 后端校验扩展为：

- `301 Short Call Type`
  - bid type 必须是 `select`
  - value 必须在 `CRAM/CRPM/PRAM/PRMM/PRPM/RESA/RESB`
- `302 Reserve Day On`
  - bid type 必须是 `tag-list`
  - values 必须是非空 `YYYY-MM-DD`
  - 同一 property 内日期去重或拒绝重复，保持当前实现即可
- `311 Reserve Prefer Off`
  - bid type 必须是 `tag-list`
  - values 必须是非空 `YYYY-MM-DD`
  - 含义是“想休息”，不能被 mapper 转成 `302`

重复策略：

- 同一个 `propertyCode + same date list + same tier set` 重复添加，后端继续返回 `409`。
- 前端在快捷点击时先做本地重复拦截，避免用户连续点击造成红色控制台错误。

性能要求：

- property catalog 仍走 TTL cache。
- coverage 查询继续使用 `period_code + base_code` 索引。
- 保存 / 更新只操作当前 bid 的 Reserve rows，不全表扫描。

## 前端交互设计

### Mode Toggle

`ReserveModeToggle` 从静态标签改为真正 segmented control：

```text
[Legacy Reserve] [AA Prefer Off]
```

行为：

- 点击 `Legacy Reserve`：切到 legacy mode。
- 点击 `AA Prefer Off`：切到 aa-prefer-off mode。
- 当前 mode 用 active 样式。
- 切换 mode 不刷新页面、不丢 draftMeta。
- coverage calendar 保持同一个月同一组数据。

### Calendar 点击

Legacy mode：

```text
点击日期 -> 添加 302 Reserve Day On
toast: Reserve Day On added to Tn.
```

AA Prefer Off mode：

```text
点击日期 -> 添加 311 Reserve Prefer Off
toast: Reserve Prefer Off added to Tn.
```

重复点击：

- 同 mode、同 date、同 tier 已存在时，不发 POST。
- 显示 warning。

### 右侧属性列表

Legacy mode：

- existing properties 只显示 `301/302`
- available properties 只显示 `301/302`
- 标题可保持 `EXISTING RESERVE PROPERTIES`

AA Prefer Off mode：

- existing properties 只显示 `311`
- available properties 只显示 `311`
- Add 按钮仍为 `ADD RESERVE BID`

### 数据保留

用户先在 Legacy 添加 `302`，再切到 AA 添加 `311`，再切回 Legacy：

- Legacy 仍能看到之前的 `302`。
- AA 仍能看到之前的 `311`。
- 两者都在同一个 Reserve draft 中保存。

## 文件边界

预计修改：

- `packages/contracts/pbs-reserve-bids.js`
- `packages/contracts/pbs-reserve-bids.d.ts`
- `pbs-server/src/services/reserve/reserve-validation.ts`
- `pbs-server/src/services/reserve/reserve-mappers.ts`
- `pbs-server/src/services/reserve/reserve-property-catalog.ts`
- `pbs-server/src/routes/reserve-bids.test.ts`
- `pbs-portal/src/features/reserve/pages/reserve-page.tsx`
- `pbs-portal/src/features/reserve/components/reserve-mode-toggle.tsx`
- `pbs-portal/src/features/reserve/reserve-draft-mappers.ts`
- `pbs-portal/src/shared/services/reserve-service.ts` 如需要
- `pbs-portal/src/features/reserve/pages/reserve-page.test.tsx`
- `sql/migration/<date>-pbs-reserve-aa-prefer-off.sql`
- `sql/seed/10-pbs-bid-property.sql`

不应修改：

- Days Off `201 Prefer Off` 保存语义。
- Pairing / Line 过滤条件。
- Award engine。

## 测试计划

后端：

1. `GET /api/reserve-bids/current` 返回 catalog 包含 `301/302/311`。
2. `POST /api/reserve-bids/current/properties` 接受 `311 Reserve Prefer Off`。
3. `POST` 拒绝 `311` 的非法日期。
4. `POST` 拒绝未知 Reserve property。
5. 现有 `301/302` 测试继续通过。

前端：

1. Reserve 页面默认 Legacy mode。
2. 点击 AA Prefer Off 后，active 样式切换。
3. Legacy mode 点击日期提交 `302`。
4. AA mode 点击日期提交 `311`。
5. Legacy / AA 切换时，各自 existing properties 独立显示。
6. 同一 mode、同一 date、同一 tier 重复点击不发第二个 POST。

构建验证：

```bash
pnpm --dir pbs-server build
pnpm --dir pbs-portal build
pnpm --dir pbs-server exec node --import tsx --test src/routes/reserve-bids.test.ts
pnpm --dir pbs-portal exec vitest run src/features/reserve/pages/reserve-page.test.tsx
```

浏览器烟测：

- 打开 `/fpqe/pbs/reserve`。
- 切换两个按钮。
- 在 Legacy 添加一个日期，确认右侧是 `Reserve Day On`。
- 切到 AA 添加一个日期，确认右侧是 `Reserve Prefer Off`。
- 再切回 Legacy，确认 Legacy 数据仍在。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本次实现跨 contract、后端、前端、SQL，但核心 contract 和 mode 过滤强耦合，多个 agent 并行容易改到同一批文件。
- Suggested split: 不建议并行。由一个实现者按 contract -> backend -> frontend -> SQL -> test 顺序完成。
- Write boundaries: 如果后续强行拆分，最多可拆成 SQL/文档与前后端实现，但收益不大。
- Conflict risk: Medium，高风险文件包括 `pbs-reserve-bids.*`、`reserve-page.tsx`、`reserve-validation.ts`。
- Execution gate: 只有用户确认本 spec 后开始实现。

## 验收标准

1. 顶部 `Legacy Reserve` / `AA Prefer Off` 可以来回切换。
2. Legacy 点击日期保存 `302 Reserve Day On`。
3. AA 点击日期保存 `311 Reserve Prefer Off`。
4. 两种模式的数据互不污染、切换不丢。
5. Coverage 仍从数据库读取，不回退前端 mock。
6. 后端校验明确支持 `311`，并继续保护 `301/302` 旧库语义。
7. 前后端 build 和 Reserve 相关测试通过。

