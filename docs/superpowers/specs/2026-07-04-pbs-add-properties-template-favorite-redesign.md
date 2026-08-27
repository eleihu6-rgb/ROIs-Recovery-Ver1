# PBS Add Properties 模板 / 收藏语义重设计

## 背景

PBS Portal 的 `Days Off`、`Pairing`、`Line` 等条件页右侧都有 `ADD ... PROPERTIES` 区域。当前实现把三类不同语义混在同一个表格里：

1. `ALL PROPERTIES`：所有可添加的 property 模板。
2. 系统按历史使用率推荐的高频 property。
3. 用户保存过的 favorite property。

这导致页面出现明显误导：

- `ALL PROPERTIES` 里展示 `BID`，例如 `2`、`5`、`Work 3-5 days...`。这些值来自 catalog 的 `defaultBid`，不是用户已经申请的内容。
- `FAVORITED PROPERTIES` 里混入了系统推荐 property。系统推荐只是“高频模板”，不是用户保存过的完整配置。
- `TIERS` 在 Add 区提前展示，用户会以为这里就是设置 tier 的地方，但实际应该在点击 `+` 后的配置弹窗里设置。
- `BID` 当前用 input 样式展示，即使是只读摘要，也像可编辑输入框。
- 字段命名 `defaultFavoritePropertyCodes` / `default_favorite_order` 本身不准确，会持续污染后端、contract、前端 mapper 和测试理解。

## 核心结论

需要把三个概念严格拆开：

| 概念 | 含义 | UI 位置 | 是否显示 Bid | 是否显示 Tiers |
|---|---|---|---|---|
| Template property | 可添加的条件模板 | `ALL PROPERTIES` | 否 | 否 |
| Recommended property | 系统按历史使用率推荐的模板 | `ALL PROPERTIES` 排序靠前 | 否 | 否 |
| Favorite property | 用户保存过的完整配置快照 | `FAVORITED PROPERTIES` | 是，完整只读摘要 | 是，作为摘要 chip |
| Existing property | 当前 draft 已经添加的申请 | `EXISTING ... PROPERTIES` | 是 | 是 |

系统推荐不再叫 favorite。它只影响 `ALL PROPERTIES` 的排序，不进入 `FAVORITED PROPERTIES`。

## 目标

1. `ALL PROPERTIES` 只作为 property 模板目录，不显示 `BID` / `TIERS` 列。
2. 系统推荐的高频 property 只在 `ALL PROPERTIES` 中排前，并可显示轻量 `Recommended` 标识。
3. `FAVORITED PROPERTIES` 只展示用户保存过的完整配置快照。
4. Favorite 的配置内容必须完整可读，不能用 input 样式伪装成可编辑字段。
5. Favorite 摘要需要展示：
   - property 名称；
   - 完整 bid 条件内容；
   - 已保存 tiers；
   - AON / Min N 等 modifier；
   - 删除 favorite 操作。
6. 点击 `ALL PROPERTIES` 的 `+`：打开配置弹窗，让用户填写 bid / tiers 后再添加。
7. 点击 `FAVORITED PROPERTIES` 的 `+`：直接把保存过的 favorite 快照加入 `EXISTING ... PROPERTIES`。
8. 清理 `defaultFavorite...` 命名，改为 `recommended...`。

## 非目标

本次不处理：

- 不重做左侧 `BIDDING CALENDAR`。
- 不改 bid 保存业务规则。
- 不改配置弹窗的字段含义。
- 不重新设计 `EXISTING ... PROPERTIES` 区域。
- 不新增复杂的 favorite 编辑功能；如果用户要改 favorite，仍按现有“重新配置并保存 favorite”的路径处理。
- 不引入新的 UI 依赖。

## 当前实现问题

### `ALL PROPERTIES` 的 `BID` 不合理

`ALL PROPERTIES` 是模板目录。当前 `BID` 列展示的是后端 catalog 返回的 `defaultBid`：

- `Prefer Off` 显示 `--`
- `Max Consecutive Days On` 显示 `5`
- `Min Consecutive Days Off` 显示 `2`
- `Days Off / Days On Pattern` 显示 `Work 3-5 days...`

这些值不是用户填写的申请，也不是已经进入 draft 的 bid。把它们放在表格里会让用户误以为系统已经替他填好了条件。

### `FAVORITED PROPERTIES` 的语义被污染

用户真正的 favorite 不是“收藏一个筛选条件模板”，而是“收藏一个已经设置好的筛选条件”。所以 favorite 必须有可读内容。

当前系统推荐 property 也进入了 `FAVORITED PROPERTIES`，但它们没有用户配置值。这让 `FAVORITED` 既像推荐列表，又像收藏列表，语义不成立。

### `TIERS` 提前出现不合理

Add 区不是最终申请列表。Tier 应该属于配置结果：

- 从 `ALL PROPERTIES` 新增时，在配置弹窗里选择 tiers。
- 从 `FAVORITED PROPERTIES` 新增时，使用 favorite 快照里保存的 tiers。
- 只有 `EXISTING ... PROPERTIES` 才展示当前 draft 的真实 tiers。

## 推荐方案

### 1. `ALL PROPERTIES` 改成模板列表

`ALL PROPERTIES` 行展示：

- property 名称；
- 可选的简短说明；
- `Recommended` 标识，仅用于历史高频 property；
- `+` 按钮。

不展示：

- `BID` 表头；
- `BID` 值；
- `TIERS` 表头；
- `T1-T7` toggle。

交互：

- 点击 `+` 打开当前 property 的配置弹窗。
- 弹窗里继续处理 bid、tiers、AON、Min N 等真实配置。
- 配置确认后，新增到 `EXISTING ... PROPERTIES`。

### 2. `FAVORITED PROPERTIES` 改成保存配置列表

`FAVORITED PROPERTIES` 只展示用户保存过的 configured favorite。

每条 favorite 推荐卡片结构：

```text
Prefer Off                       [+] [Delete]
Bid
2026-06-02, 2026-06-03, 2026-06-04

Tiers: T1, T2
Options: AON, Min 2
```

视觉要求：

- `Bid` 摘要使用只读文本块 / 多行 readable card。
- 不能使用 input 外观。
- 摘要必须自动换行，不截断核心内容。
- 行高可以随内容增高，列表区域滚动即可。
- tiers 用 chip 展示，不用可点击 toggle。
- modifier 用 chip 展示。

交互：

- 点击 `+` 直接把该 favorite 的完整快照加入 `EXISTING ... PROPERTIES`。
- 删除按钮只删除 favorite，不影响已经添加到 existing 的 bid。
- 系统推荐 property 不出现在这里。

空态：

```text
No saved favorite properties yet.
Configure a property from All Properties and save it as a favorite.
```

### 3. 推荐排序从 favorite 语义中剥离

当前命名需要改：

| 当前命名 | 新命名 |
|---|---|
| `defaultFavoritePropertyCodes` | `recommendedPropertyCodes` |
| `default_favorite_order` | `recommended_order` |
| `default_favorite_usage_count` | `recommended_usage_count` |
| `defaultFavoriteOrderByCode` | `recommendedOrderByCode` |
| `favoriteSortOrder` 用于系统推荐 | `recommendedSortOrder` |

推荐字段只表达：

- 这个 property 是系统推荐；
- 在 `ALL PROPERTIES` 中排序靠前；
- 使用率数据用于审计和后续调整。

它不表达：

- 用户收藏；
- 已配置 favorite；
- 可以直接添加的完整 bid。

### 4. `favoritePropertyCodes` 的展示语义

后续 UI 不应再把只有 property code、没有 bid / tiers 的旧 favorite 当成 `FAVORITED PROPERTIES` 展示。

`FAVORITED PROPERTIES` 的数据来源必须满足：

- 有 `favoriteKey`；
- 有 `propertyCode`；
- 有 `name`；
- 有完整 `bid`；
- 有 `tiers`。

缺少 `bid` / `tiers` 的旧 property-code-only favorite 不展示在 favorite tab。是否单独做数据迁移或废弃旧字段，作为实现时的清理项处理。

## 后端 / Contract 设计

### Contract

`Days Off`、`Pairing`、`Line` 当前 draft 响应中的字段改为：

```ts
recommendedPropertyCodes: number[];
favoriteProperties: ConfiguredFavoriteProperty[];
```

其中：

- `recommendedPropertyCodes`：只用于 `ALL PROPERTIES` 推荐排序。
- `favoriteProperties`：只包含用户保存过的 configured favorite 快照。

不再继续扩大 `defaultFavoritePropertyCodes` 的使用范围。

### 数据库字段

`pbs_bid_property` 字段建议重命名为：

```sql
recommended_order smallint
recommended_usage_count integer
```

字段含义：

- `recommended_order`：PBS Portal 模板推荐排序，空表示非推荐。
- `recommended_usage_count`：推荐来源报表中的使用次数，仅用于审计。

如果当前环境已经执行过 `default_favorite_*` migration，后续 migration 应执行字段 rename，而不是再新增一套并长期并存。

### 后端服务

后端 property catalog context 返回：

```ts
recommendedPropertyCodes: number[];
```

排序规则：

1. `recommended_order` 非空的 property 排前；
2. 按 `recommended_order` 升序；
3. 其余 property 保持当前 catalog 排序；
4. 不可见或当前模块不支持的 property 不进入推荐列表。

## 前端设计

### Mapper

`mapRuleBidResponseToPageData` / Pairing mapper 需要分清：

- catalog property：`source: "catalog"`，可进入 `ALL PROPERTIES`；
- configured favorite：`source: "favorite"`，只进入 `FAVORITED PROPERTIES`；
- recommended signal：只给 catalog property 添加 `recommendedSortOrder`，不设置 `favorited: true`。

### UI 组件

当前 `RuleBidAvailablePropertyRow` 同时承担 catalog 行和 favorite 行，后续建议拆成两个更清晰的渲染路径：

- `RuleBidCatalogPropertyRow`
  - 用于 `ALL PROPERTIES`
  - property name + optional recommended badge + add action
  - 无 bid / tiers

- `RuleBidFavoritePropertyRow`
  - 用于 `FAVORITED PROPERTIES`
  - property name + full bid summary + tiers chips + modifier chips + add/delete actions
  - 不使用 input 样式

Pairing 页面如果有独立 row 实现，也按同样语义调整。

### Tab 行为

- 默认打开哪个 tab 可以继续保持现有策略，但如果用户没有 configured favorite，`FAVORITED PROPERTIES` 必须展示清晰空态。
- `ALL PROPERTIES` 中推荐项排前。
- 搜索对当前 tab 内数据生效。
- 分页继续保留。

## 验收标准

### `ALL PROPERTIES`

- 不再出现 `BID` 表头。
- 不再出现 `TIERS` 表头。
- 不再显示 `2`、`5`、`Work 3-5 days...` 这类 catalog default bid。
- 推荐 property 排在普通 property 前面。
- 推荐 property 可以有 `Recommended` 标识，但不能叫 favorite。
- 点击 `+` 打开配置弹窗。
- 配置完成后，新增内容出现在 `EXISTING ... PROPERTIES`。

### `FAVORITED PROPERTIES`

- 只展示用户保存过的 configured favorite。
- 不展示系统推荐 property。
- favorite 的 bid 内容完整展示，不用 input 样式。
- 长内容自动换行，不被截断成不可读。
- tiers 用只读 chip 展示。
- AON / Min N 等 modifier 用只读 chip 或摘要文本展示。
- 点击 `+` 直接按 favorite 快照添加到 `EXISTING ... PROPERTIES`。
- 删除 favorite 不影响 existing bid。
- 没有 favorite 时展示空态，而不是系统推荐模板。

### 命名

- 前后端新增或保留的主路径不再使用 `defaultFavorite...` 表达系统推荐。
- 推荐相关代码统一使用 `recommended...`。
- favorite 相关代码只表示用户保存过的 configured favorite。

## 测试要求

### pbs-portal 单元 / 组件测试

覆盖：

- `ALL PROPERTIES` 不显示 `BID` / `TIERS`。
- `ALL PROPERTIES` 推荐 property 排序靠前。
- `FAVORITED PROPERTIES` 不包含系统推荐 property。
- configured favorite 显示完整 bid 摘要、tiers、modifier。
- configured favorite 点击 `+` 直接新增 existing bid。
- favorite 删除只删除 favorite 行。
- favorite 空态。

### pbs-server 测试

覆盖：

- draft API 返回 `recommendedPropertyCodes`。
- 推荐 property 只来自可见且模块支持的 catalog。
- 推荐排序正确。
- configured favorite 仍返回完整 bid / tiers。

### E2E

更新现有 PBS condition favorites E2E：

- Days Off / Pairing / Line 的 `ALL PROPERTIES` 不出现误导性 default bid。
- 推荐项在 `ALL PROPERTIES` 靠前。
- 保存 configured favorite 后，`FAVORITED PROPERTIES` 展示完整摘要。
- 从 favorite 直接添加后，`EXISTING ... PROPERTIES` 出现相同 bid / tiers。

### UI 标准

前端样式改动后必须运行：

```bash
npm run check:ui
```

并保持 hard violations 为 0。

## 影响范围

预计涉及：

- `packages/contracts/pbs-days-off-bids.d.ts`
- `packages/contracts/pbs-pairing-bids.d.ts`
- `packages/contracts/pbs-line-bids.d.ts`
- `pbs-server/src/services/*/property-catalog.ts`
- `pbs-server/src/services/*/*-bid-service.ts`
- `pbs-server/src/services/lineholder/property-catalog.ts`
- `pbs-server/src/models/pbs/pbs-bid-property.ts`
- `sql/schema/pbs/01-pbs.sql`
- `sql/seed/10-pbs-bid-property.sql`
- 新增 SQL migration：rename `default_favorite_*` 到 `recommended_*`
- `pbs-portal/src/features/rule-bids/*`
- `pbs-portal/src/features/days-off/*`
- `pbs-portal/src/features/line/*`
- `pbs-portal/src/features/pairing/*`
- `e2e/tests/pbs-portal/condition-default-favorites.spec.ts`
- 对应 QA 测试文档

## 风险与控制

### 风险：已有 `default_favorite_*` migration 可能已执行

控制：

- 使用 rename migration。
- 不同时保留两套字段长期并存。
- 测试覆盖 schema model 和 catalog 查询。

### 风险：旧 property-code-only favorite 不再显示

控制：

- 这是语义修正：没有 bid / tiers 的 favorite 不是完整配置快照。
- 如果业务确认需要保留旧数据，单独做迁移，把旧 favorite 转成可配置模板入口，而不是继续放在 `FAVORITED PROPERTIES`。

### 风险：Favorite 摘要过长撑高列表

控制：

- 允许行高自适应。
- Add Properties 列表区域已有滚动。
- 不用截断隐藏关键信息。

### 风险：共享组件影响多个页面

控制：

- 优先在 shared Rule Bid 组件中解决语义。
- Pairing 独立实现同步调整。
- 覆盖 Days Off / Pairing / Line 三条 E2E。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本次改动跨 SQL / contract / backend catalog / frontend mapper / shared UI / E2E，但核心是同一条语义重命名和显示规则。拆分容易造成 contract 字段、mapper 语义和测试预期不一致。
- Suggested split: 不建议拆分；由一个 agent 串联完成 spec 对应实现。
- Write boundaries: 单 agent 负责 `packages/contracts`、`pbs-server`、`pbs-portal`、`sql`、`e2e`、QA 文档。
- Conflict risk: 中高；尤其是 `defaultFavorite...` 到 `recommended...` 的命名迁移。
- Execution gate: 用户确认本 spec 后再开始实现。

## 推荐实施顺序

1. 后端 / contract 先把 `defaultFavorite...` 改为 `recommended...`。
2. SQL schema / seed / migration 同步 rename 推荐字段。
3. 前端 mapper 拆清 catalog / recommended / configured favorite。
4. Add Properties UI 拆成 catalog row 和 favorite row。
5. 更新 Days Off / Pairing / Line 测试和 E2E。
6. 更新 QA 文档。
7. 运行最小相关测试，再跑 portal build / lint / `check:ui`。
