# PBS Property Catalog 展示规则统一设计

日期：2026-04-30
作者：Codex
状态：待用户确认

## 背景

当前 PBS 前端里有两个容易混乱的问题：

1. 页面表头 `PRIORITY` 实际展示的是 bid property / rule 名称，不是业务优先级。
2. Days Off、Pairing 主页面、Search Pairings 使用的 property 清单来源不完全一致。

其中 Pairing 的混乱最明显：

- 旧库参考 `crew_bids_reference-2026-03-16-072929` 中，`102` 是 `Pairing Number`，语义上就是 Pairing ID / specific bid。
- 当前代码中曾临时使用 `128 Pairing ID`。
- 但旧库里 `128` 实际是 `Deadhead Day`。
- Search Pairings 为了支持 specific bid，临时把 `128 Pairing ID` 单独注入，导致小眼睛入口看到的 property 比 Pairing 主页面多。

用户确认的新方向：

- 业务规则以旧库 property 为主。
- AA 文档里的 property 也要保留在数据库里，但默认不展示。
- 展示与否由数据库开关控制。
- Pairing 主页面与 Search Pairings 必须统一，不再各自维护不同清单。
- `Pairing ID` 不应作为特殊例外；应回归旧库编号 `102 Pairing Number / Pairing ID`。
- 所有 `PRIORITY` 表头改为 `PROPERTY`。

## 目标

1. 统一 PBS property catalog 的来源和展示规则。
2. 旧库 property 与 AA property 都进入 `pbs_bid_property`。
3. 通过数据库字段控制某个 property 是否在 PBS Portal 展示。
4. 默认展示旧库 property，默认隐藏 AA property。
5. Pairing 主页面和 Search Pairings 使用同一套可见 Pairing property。
6. `Pairing ID` 使用旧库 `property_code=102`，不再使用当前临时 `128 Pairing ID`。
7. 旧库 `128` 恢复为 `Deadhead Day`。
8. 将页面表头 `PRIORITY` 改为 `PROPERTY`，避免业务语义误导。

## 不做范围

- 不删除 AA property，只控制默认隐藏。
- 不删除旧库 property。
- 不在本轮完成所有旧库 property 的完整搜索 SQL 能力；但 visible property 不应进入 Search Pairings 后直接造成前端列表不一致。
- 不改变 `pbs_bid_group` / `pbs_bid_condition` 的稳定关系设计，仍保留 `property_definition_id`。
- 不做 AA 文档最终完整业务闭环，只为后续可配置切换打基础。

## 推荐方案

采用“统一数据库 catalog + 单一展示开关 + 前后端统一映射”的方案。

### 1. 数据库字段

在 `pbs_bid_property` 增加展示和来源字段：

```sql
source_type varchar(20) not null default 'legacy'
is_visible_in_portal smallint not null default 1
display_order integer
```

字段语义：

- `source_type='legacy'`：来自旧库 / `crew_bids_reference` 的 property，默认展示。
- `source_type='aa'`：来自 AA 文档的 property，默认不展示。
- `is_visible_in_portal=1`：PBS Portal 可见。
- `is_visible_in_portal=0`：保留在数据库，但页面默认不展示。
- `display_order`：展示顺序；优先使用旧库 `property_code` 顺序。

第一阶段不拆成 `show_in_pairing_page`、`show_in_search_pairings` 等多个开关，因为用户已确认 Pairing 外面和小眼睛入口要统一。后续如果某个 property 真有页面级差异，再加更细 scope。

### 2. Seed / Migration 规则

`pbs_bid_property` 要同时包含两组 property：

- 旧库 property：
  - Pairing：`101-130`
  - DaysOff：`201-206`
  - Reserve：`301-302`
  - Line：`401-407`
  - 默认 `source_type='legacy'`
  - 默认 `is_visible_in_portal=1`
- AA property：
  - 当前已实现的 AA Days Off：`211-217`
  - 当前代码中 AA 风格的 Pairing 扩展项可保留为 AA source
  - 默认 `source_type='aa'`
  - 默认 `is_visible_in_portal=0`

关键迁移：

- 当前临时 `128 Pairing ID` 要迁回 `102 Pairing Number / Pairing ID`。
- 旧库 `128` 恢复为 `Deadhead Day`。
- 当前已保存的 Pairing ID bid 如果使用 `property_id/property_code=128`，应迁移为 `102`。
- `property_definition_id` 需要同步指向 `property_code=102` 对应的 `pbs_bid_property.id`。

### 3. 后端 catalog 查询

当前 `resolveLineholderPropertyCatalog` 已经查 `pbs_bid_property` 的 active property。需要扩展为：

- 只返回 `is_active=1 and is_visible_in_portal=1` 的 property。
- 名称、source、展示顺序来自数据库。
- Contract catalog 只负责告诉前端/后端某个 property 用什么输入控件、默认 bid、支持 action/operator/quantifier。
- 如果数据库 visible 但 contract 不支持，应在服务端过滤并记录为不可展示，避免前端拿到无法渲染的 property。

### 4. Pairing 编号回归旧库

Pairing property 必须回归旧库编号：

- `102` = `Pairing Number / Pairing ID`
- `128` = `Deadhead Day`

因此以下位置需要统一：

- `packages/contracts/pbs-pairing-bids.js/.d.ts`
- `pbs-portal/src/features/pairing/pairing-id-autocomplete.ts`
- `pbs-server/src/services/pairing-search/pairing-search-core-conditions.ts`
- Pairing draft mapper / rule validation / conflict logic
- 所有测试里涉及 `128 Pairing ID` 的断言

### 5. Pairing 主页面与 Search Pairings 统一

统一后：

- Pairing 主页面的 `ADD PAIRING PROPERTIES` 从后端返回的 visible Pairing catalog 生成。
- Search Pairings 的 picker 也从同一份 visible Pairing catalog 生成。
- 不再在前端硬编码注入 `Pairing ID`。
- 不再维护一份 Search-only supported list，除非它只是“搜索 SQL 已支持”的内部能力表。

如果某个 visible Pairing property 暂时没有搜索 SQL 支持，Search Pairings 里有两种处理：

- 第一阶段推荐：Search Pairings picker 只展示 `visible && search_supported` 的 property，并且主页面仍展示所有 `visible` property。
- 如果用户要求完全一致，则必须同步补齐所有 visible property 的搜索 SQL。

本轮用户要求“pairing 里面跟外面统一”，推荐实现为：

- 两边都从同一个 visible catalog 来。
- `Pairing ID(102)` 两边都可见。
- 对于 Search Pairings 暂不支持 SQL 的旧库 property，先不要开放为 search criterion，避免点进去报错；但要在代码里用显式 `searchSupported` 标记，而不是另写一套人工清单。

### 6. Days Off 展示规则

Days Off 改为以旧库 `201-206` 默认展示。

AA Days Off `211-217` 保留在数据库，默认隐藏。

也就是说：

- 默认页面显示旧库 DaysOff 规则，比如 `201 Prefer Off` 等。
- AA property 未来只要把 `is_visible_in_portal` 改成 `1`，就能展示。
- 当前 `filterVisibleDaysOffPropertyCatalog` 不应再只按 AA 白名单过滤。

### 7. UI 文案

所有当前表示 property 列的表头：

```text
PRIORITY
```

改为：

```text
PROPERTY
```

适用范围：

- Days Off / RuleBid property table
- Pairing Search criteria table
- 其他 PBS Portal 中展示 property 名称但误写成 priority 的位置

真正表示 award priority、tier priority、seniority priority 的地方不改。

## 备选方案

### 方案 A：只加一个展示开关

优点：最简单，能快速解决“AA 保留但默认不展示”。

缺点：如果未来某个 property 只想在 Search Pairings 显示、不想在主页面显示，会不够灵活。

结论：作为第一阶段可以采用，但需要搭配 `source_type` 和显式代码边界。

### 方案 B：按页面加多个展示开关

例如：

- `show_in_pairing_page`
- `show_in_search_pairings`
- `show_in_days_off_page`

优点：页面级控制最灵活。

缺点：当前用户已经要求 Pairing 内外统一，过早加多个开关容易继续制造差异。

结论：暂不采用。

### 方案 C：统一 catalog + 单一可见开关 + source 标记

优点：

- 符合“旧库为主，AA 保留”的目标。
- Pairing 主页面和 Search Pairings 不再分裂。
- 后续想启用 AA property，只改数据库。
- 接手的人能看懂 property 来源。

缺点：需要一次迁移当前 `128 Pairing ID` 的历史临时设计。

结论：推荐采用。

## 验收标准

1. 页面表头不再把 property 列叫 `PRIORITY`，统一改为 `PROPERTY`。
2. `pbs_bid_property` 中可区分 legacy 和 AA property。
3. legacy property 默认 `is_visible_in_portal=1`。
4. AA property 默认 `is_visible_in_portal=0`。
5. Days Off 默认展示旧库 `201-206`，不再默认展示 AA `211-217`。
6. Pairing ID 使用 `property_code=102`。
7. 旧库 `128` 恢复为 `Deadhead Day`。
8. Pairing 主页面可以看到 `Pairing Number / Pairing ID`，不再只在小眼睛入口出现。
9. Search Pairings 不再手工注入 `Pairing ID`。
10. Pairing 主页面和 Search Pairings 的 property 来源统一。
11. 已保存的临时 `128 Pairing ID` 数据迁移后能继续显示为 `102 Pairing Number / Pairing ID`。
12. `npm run verify:pbs` 通过。

## 测试计划

后端：

- catalog service 测试：
  - 只返回 `is_visible_in_portal=1` 的 property。
  - AA property 默认隐藏。
  - legacy property 默认展示。
- migration 测试或 SQL 手测：
  - `128 Pairing ID` 历史数据迁到 `102`。
  - `128` 定义恢复为 `Deadhead Day`。
- pairing search condition 测试：
  - `102 Pairing Number / Pairing ID` 查询真实 pairing。
  - `128` 不再走 Pairing ID 查询逻辑。
- Days Off service 测试：
  - 默认返回 `201-206`。
  - 不默认返回 `211-217`。

前端：

- Pairing 页面：
  - `Pairing Number / Pairing ID` 出现在 ADD PAIRING PROPERTIES。
  - 不再依赖 mock seed 控制 property 全量。
- Search Pairings：
  - picker 从统一 catalog 派生。
  - `Pairing Number / Pairing ID` 可以作为 criteria。
  - 不再使用 `128 Pairing ID`。
- Days Off 页面：
  - 默认展示旧库 Days Off property。
- 文案测试：
  - property 表头显示 `PROPERTY`。
  - 不误改真正 priority 语义字段。

## 风险与处理

### 风险 1：property code 迁移影响已保存 bid

处理：

- 对当前应用临时产生的 `128 Pairing ID` 数据执行迁移到 `102`。
- 同步更新 `property_definition_id`。
- 在迁移文档里明确：旧库导入的真实 `128 Deadhead Day` 数据不能按 Pairing ID 迁移；如未来导入旧库历史数据，应在导入前完成 code 语义统一。

### 风险 2：旧库 property 比当前搜索 SQL 多

处理：

- 页面 catalog 可以统一。
- Search Pairings 必须只开放已支持 SQL 的 criteria，或同步补齐 SQL。
- 第一阶段推荐先支持核心旧库 property：`102 Pairing Number`、时间、长度、机场、layover、credit 等高频项。

### 风险 3：AA property 隐藏后现有测试假设变化

处理：

- 更新测试断言，以旧库 visible 默认规则为准。
- 保留 AA property 的数据与 contract 支持，便于后续打开开关。

## 实施顺序建议

1. 增加数据库字段和 migration。
2. 更新 `pbs_bid_property` seed：legacy + AA 同库共存。
3. 迁移 `128 Pairing ID` 到 `102 Pairing Number / Pairing ID`。
4. 更新 contracts：Pairing 回归旧库 code；Days Off 默认旧库。
5. 更新后端 catalog 过滤和 Search Pairings condition builder。
6. 更新前端 Pairing / Search Pairings / Days Off 数据映射。
7. 改 UI 文案 `PRIORITY -> PROPERTY`。
8. 补测试并运行 `npm run verify:pbs`。

