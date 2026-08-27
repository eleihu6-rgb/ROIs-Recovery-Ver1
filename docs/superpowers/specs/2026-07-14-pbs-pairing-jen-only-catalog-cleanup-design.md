# PBS Pairing 条件按 Jen Excel 收口并清理旧数据设计

## 背景

Jen 的 `Bidding Options V1(2).xlsx` 里 Pairing 分类只保留 11 个最终 bid option。当前系统里 Pairing catalog 仍包含历史旧库拆分条件和 AA retained 条件，例如 `Any Landing In Airport`、`Pairing Total Credit`、`Departure Date / Day`、`TAFB`、`Total Legs In First Duty`、`Any/Every Enroute Check-In Time` 等。

用户已确认：这些 Jen 清单外的 Pairing 条件后续都不用，需要与入口隐藏一起清理旧数据。

## 目标

- 员工端 Pairing 页面和 Search Pairings picker 只展示 Jen Excel 明确的 Pairing 条件。
- Jen 清单外的 Pairing 条件在数据库 catalog 中隐藏并停用。
- 清理已保存的旧 Pairing 条件数据，避免废弃条件继续影响草稿、收藏、搜索预览或算法导出。
- 保留 `pbs_bid_property` 定义行作为历史 property code 记录，不物理删除 property definition。

## Jen Pairing 保留清单

只保留以下 `property_code` 可见且 active：

| Code | Final Bid Option |
| ---: | --- |
| 102 | Pairing Preference |
| 168 | Airport Preference |
| 103 | Pairing Check-In / Check-Out Time |
| 107 | Flight Legs per Duty |
| 110 | Work Day Preference |
| 112 | Pairing Length |
| 116 | Flight Number Preference |
| 117 | Redeye Preference |
| 163 | Month-End Carryover |
| 129 | Time Between Flights |
| 122 | Deadhead Flying |

## 废弃范围

Pairing 下除上述 11 个 code 以外的 property 均视为废弃，例如：

- 旧拆分机场/layover：`101`, `104`, `119`, `123`, `150-156`
- 旧拆分时间/日期：`106`, `111`, `114`, `120`, `126`, `134-141`, `164`, `166`, `167`
- 旧拆分 legs/credit/block/TAFB：`105`, `108`, `109`, `113`, `118`, `121`, `124`, `125`, `127`, `130`, `131`, `132`, `138`, `142-146`
- 旧 deadhead：`128`, `147`, `148`
- 其他 AA retained / legacy Pairing 条件：`115`, `133`, `137`, `149`, `157-162`, `165`

最终实现不依赖这份示例枚举，而使用 whitelist：`bid_type='Pairing' and property_code not in (...)`。

## 推荐方案

方案 A：只隐藏入口，不清数据。
- 优点：风险最低。
- 缺点：旧数据仍可能通过已有草稿、favorite、算法导出、搜索条件继续存在。
- 不符合用户“后面都不用、一块清数据”的确认。

方案 B：隐藏并停用废弃 property，同时删除旧 Pairing 草稿和收藏数据。
- 优点：与 Jen 清单彻底收口；不会继续出现废弃条件影响业务。
- 缺点：迁移会删除旧数据，不可逆，需要在 migration 中写清楚。
- 推荐采用。

方案 C：物理删除废弃 `pbs_bid_property` 定义。
- 优点：数据库最干净。
- 缺点：风险高；历史 code、测试、import/format 代码和潜在 FK/审计引用容易断裂。
- 不推荐。

## 数据清理策略

采用方案 B。新增 migration，执行范围只针对 `bid_type='Pairing'` 且不在 Jen whitelist 的 property。

清理规则：

1. 更新 `pbs_bid_property`
   - whitelist：`is_visible_in_portal=1`, `is_active=1`
   - 非 whitelist Pairing：`is_visible_in_portal=0`, `is_active=0`

2. 找出需要删除的 Pairing group
   - `pbs_bid_group.bid_type='Pairing'`
   - 主 property 是废弃 property：通过 `property_id` 或 `property_definition_id` 命中
   - 或任一 `pbs_bid_condition` 附加条件命中废弃 property
   - 一旦 group 中含废弃 property，删除整条 group，因为该条件链不再可解释

3. 删除关联数据
   - `pbs_bid_pairing_occurrence`：删除目标 group 的 specific pairing run 记录
   - `pbs_bid_condition`：删除目标 group 下的 AND 条件
   - `pbs_bid_group`：删除目标 group
   - `pbs_bid_pairing_configured_favorite`：删除废弃 property 的 configured favorite
   - `pbs_bid_pairing_favorite`：删除废弃 property 的 simple favorite
   - `pbs_bid_property_favorite`：删除 `bid_type='Pairing'` 的废弃 property favorite
   - `pbs_bid`：如果删除后 bid 容器没有任何 group 和 Pairing favorite，再删除空容器

4. 不清理非 Pairing 数据
   - Days Off / Line / Reserve 不在本次范围内。

## 代码影响

- `sql/seed/10-pbs-bid-property.sql`
  - 删除/覆盖之前“keep older split ... visible”的反向更新。
  - 增加 whitelist 收口 update，保证重新 seed 后仍只有 Jen Pairing 条件可见。

- `sql/migration/YYYY-MM-DD-pbs-pairing-jen-only-catalog-cleanup.sql`
  - 一次性执行隐藏、停用和数据清理。
  - 使用 temporary tables + `raise notice` 输出删除计数，便于执行后核查。

- `packages/contracts/pbs-pairing-bids.*`
  - 不物理删除旧 definition；后端 catalog 由数据库可见性控制。
  - 仅当测试需要明确可见清单时，补充/调整测试，不做大面积 contract 删除。

- `pbs-server` / `pbs-portal`
  - 正常情况下不需要在前端加硬编码过滤。
  - 需要更新 catalog/route/E2E 测试中 mock 的可见 Pairing property 清单。

## 验收标准

- 后端返回给 Portal 的 Pairing catalog 只包含 11 个 Jen Pairing 条件。
- Pairing 页面 All Properties 和 Search Pairings picker 不再显示 Jen 清单外条件。
- 废弃 Pairing 条件相关草稿、simple favorite、configured favorite 被 migration 清理。
- 保留的 11 个条件不被清理，已有新条件能力继续可用。
- `npm run check:ui` 无 hard violation。
- 相关 pbs-server / pbs-portal focused tests 通过。
- 新增或更新 Playwright 覆盖：验证 Pairing 可见条件收口和旧条件不可见。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 主要是 catalog seed/migration/test 的一致性改动，拆分后协调成本高于收益。
- Suggested split: 不拆。
- Write boundaries: 单线修改 SQL seed/migration、catalog tests、Pairing E2E。
- Conflict risk: 当前工作树已有 Deadhead Flying 未提交改动，单线处理更安全。
- Execution gate: 用户确认本 spec 后再开始实现。

## 待确认

请确认本 spec 是否按方案 B 执行：**只保留 Jen Excel 的 11 个 Pairing 条件；其他 Pairing 条件全部隐藏、停用，并清理旧草稿/favorite 数据。**
