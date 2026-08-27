# PBS Line Jen-only Catalog Cleanup 设计确认

## 背景

用户希望 Line 页面只展示 Jen Excel `Bidding Options V1(2).xlsx` 中列出的 Line 条件。项目还未上线，因此不需要兼容旧 Line 数据；旧条件后续不再使用，应从员工端隐藏，并清理相关旧草稿 / 收藏数据。

本次盘点以 Excel 的 `Final Bid Option` 为准。

## Jen Excel Line 清单

Jen 文档中 `Line` 类一共 6 个条件：

| 顺序 | Final Bid Option | 当前项目对应 |
|---:|---|---|
| 1 | `Credit Window Preference` | `429 Credit Window Preference` |
| 2 | `Minimum Base Layover` | `407 Minimum Base Layover` |
| 3 | `Commuter Pattern` | `408 Commuter Pattern` |
| 4 | `Efficient Flying First` | `428 Efficient Flying First` |
| 5 | `Mixed Block Pattern` | 当前 `410 Reserve / Flying Date Pattern`，需要改名 |
| 6 | `Reserve Avoidance` | `427 Reserve Avoidance` |

结论：Line 条件功能层面按 Jen Excel 已有 6/6 对应实现；本次重点是 catalog 收口、命名收口、旧数据清理和测试同步。

## 当前问题

当前 `f8_pbs` 的 Line 可见 property 是 10 个，其中 4 个不在 Jen Excel 中：

| property_code | 当前名称 | 处理 |
|---:|---|---|
| 403 | `Clear Schedule and Start Next Bid Group` | 隐藏并清理旧 Line 数据 |
| 404 | `No Same Day Pairings` | 隐藏并清理旧 Line 数据 |
| 405 | `Waive No Same Day Duty Starts` | 隐藏并清理旧 Line 数据 |
| 406 | `Forget Line` | 隐藏并清理旧 Line 数据 |

`401 Max Credit Window`、`402 Min Credit Window`、`409 Most Flying In Least Working Days (Configured)` 已经隐藏，但数据库里仍可能存在旧 Line group；本次一并按“非 Jen Line 条件”清理。

`410 Reserve / Flying Date Pattern` 功能与 Jen 的 `Mixed Block Pattern` 对应，但员工端展示名、测试和 Help 文案还停留在旧名，需要统一改为 `Mixed Block Pattern`。

## 目标

1. Line 页面新增入口、推荐入口、收藏入口只显示 Jen Excel 的 6 个 Line 条件。
2. Existing Line Properties 不再显示非 Jen Line 条件；项目未上线，旧数据直接清理。
3. `410` 保持 property code 和底层 payload 不变，但员工端名称统一改为 `Mixed Block Pattern`。
4. 后端 catalog、前端兜底过滤、seed、migration、测试和 Help 文案保持一致，避免后续“DB 显示一套、前端兜底另一套”。

## 保留清单

最终 Line 可见条件只保留：

| display_order | property_code | property_name |
|---:|---:|---|
| 1 | 429 | `Credit Window Preference` |
| 2 | 407 | `Minimum Base Layover` |
| 3 | 408 | `Commuter Pattern` |
| 4 | 428 | `Efficient Flying First` |
| 5 | 410 | `Mixed Block Pattern` |
| 6 | 427 | `Reserve Avoidance` |

`recommended_order` 本次明确设置为上表 6 个全部推荐。原因是 Jen Line 条件总量只有 6 个，Recommended 区和 All 区都只显示这 6 个，避免旧 `404/405` 继续作为推荐项露出。

## 隐藏 / 清理规则

正式规则不是按某个历史来源字段判断，而是按 keep list 判断：

```text
Line keep list = 429, 407, 408, 428, 410, 427
Obsolete Line property = bid_type = 'Line' AND property_code NOT IN keep list
```

所有 obsolete Line property 都要隐藏、inactive，并清理对应旧数据。已知覆盖范围包括：

| 范围 | property_code |
|---|---|
| 旧 legacy Line | `401, 402, 403, 404, 405, 406, 409` |
| 旧 AA 扩展 Line | `411, 412, 413, 414, 415, 416, 417, 418, 419, 420, 421, 422, 423, 424, 425, 426` |

如果未来数据库里出现其他 `bid_type='Line'` 且不在 keep list 的 property，也按 obsolete 处理。

## 非目标

1. 不重新设计 `Commuter Pattern` / `Mixed Block Pattern` 的表单交互。
2. 不改变 `410` 的底层 bid payload：仍使用现有 `reserve-flying-date-pattern`。
3. 不实现新的算法语义。
4. 不保留旧 Line 条件的员工端兼容入口。
5. 不迁移旧数据到新条件；旧数据直接清理。

## 实施设计

### 1. SQL seed

更新 `sql/seed/10-pbs-bid-property.sql`：

- 将 Line 的可见清单改为 Jen 6 个。
- `410 property_name` 改为 `Mixed Block Pattern`。
- 非 Jen Line property 设置：
  - `is_visible_in_portal = 0`
  - `is_active = 0`
  - `recommended_order = null`
  - `recommended_usage_count = 0`
- Jen 6 个设置：
  - `is_visible_in_portal = 1`
  - `is_active = 1`
  - `display_order` 按 Excel 顺序
  - `recommended_order` 按 Excel 顺序

### 2. SQL migration

新增 migration，例如：

`sql/migration/2026-07-15-pbs-line-jen-only-catalog-cleanup.sql`

迁移逻辑复用 Pairing Jen-only cleanup 的模式：

1. 建临时 keep 表，保留 `429, 407, 408, 428, 410, 427`。
2. 更新 `pbs_bid_property`：
   - keep codes 可见并 active。
   - 非 keep Line codes 隐藏并 inactive。
   - `410` 改名为 `Mixed Block Pattern`。
   - display/recommended 顺序按 Excel Line 顺序。
3. 找出所有非 keep Line property：
   - `bid_type='Line'`
   - `property_code NOT IN (429, 407, 408, 428, 410, 427)`
4. 清理旧 Line favorites：
   - 只删除 `pbs_bid_line_favorite.property_code` / `property_id` 命中 obsolete property 的记录。
   - 只删除 `pbs_bid_property_favorite` 中 `bid_type='Line'` 且 `property_code` / `property_id` 命中 obsolete property 的记录。
   - 保留 keep list 6 个条件的 favorite。
5. 清理旧 Line bid 数据：
   - 只清理 `pbs_bid_group.bid_type='Line'` 且 `property_id` / `property_definition_id` 命中 obsolete property 的 group。
   - 只清理 `pbs_bid_condition` 中 `property_id` / `property_definition_id` 命中 obsolete property 的 condition，并通过所属 group 限定到 Line bid。
   - 保留 keep list 6 个条件已有数据。
   - 删除命中的 `pbs_bid_condition`
   - 删除命中的 `pbs_bid_group`
   - 删除已经没有任何子记录的空 `pbs_bid`
6. migration 输出 notice，包含隐藏 property 数、删除 group 数、删除 favorite 数、删除空 bid 数。

### 3. Contract

更新 `packages/contracts/pbs-line-bids.js` 和 `.d.ts`：

- `410` 展示名从 `Reserve / Flying Date Pattern` 改为 `Mixed Block Pattern`。
- 底层 code key 可以先保留 `reserveFlyingDatePattern`，避免大范围重命名；若后续要彻底改代码语义名，再单独规划。
- 建议新增一个 Line 可见白名单常量，例如 `pbsLineJenVisiblePropertyCodeList`，供前后端和测试共享，减少各处重复手写。

### 4. pbs-server

更新 Line catalog / 校验 / formatter：

- catalog 仍以 `pbs_bid_property.is_visible_in_portal=1` 为主要来源。
- 内部 supported catalog 保留当前可解析能力，但员工端返回 catalog 只包含 DB 可见且 contract 支持的 Jen 6 个。
- 当前 Line 员工端新增、patch、保存 draft、保存 configured favorite 时，都要拒绝非 keep list 的 `propertyCode`，避免前端过滤遗漏时旧条件重新写回。
- `410` 的用户可见 label、错误信息、summary 文案统一使用 `Mixed Block Pattern`。
- 不改变 `reserve-flying-date-pattern` 的 payload 校验规则。

### 5. pbs-portal

更新 Line 页面：

- 在 `LinePage` 或共享 mapper 处增加 Line Jen whitelist 兜底过滤：
  - `availableProperties`
  - `recommendedPropertyCodes`
  - `available` 中的 configured favorite / simple favorite
  - `existingProperties`
- 过滤位置不能只在渲染层完成；加载后的页面状态、编辑状态、保存 draft 入参都不得继续携带非 Jen Line property。
- 即使 DB 迁移暂未执行，页面也不展示非 Jen Line 条件。
- `410` 弹窗标题、Add 按钮、Existing summary、aria label 均显示 `Mixed Block Pattern`。

### 6. Help / QA 文档

更新 Portal Help 中 Line 相关文案：

- `Reserve / Flying Date Pattern` 改为 `Mixed Block Pattern`。
- Line 可配置示例只列 Jen 6 个条件。

新增或更新 QA 文档：

`docs/test-cases/pbs/line/2026-07-15-line-jen-only-catalog-cleanup.md`

覆盖：

1. Line Add Properties 只显示 Jen 6 个。
2. 不显示 `Clear Schedule and Start Next Bid Group`、`No Same Day Pairings`、`Waive No Same Day Duty Starts`、`Forget Line`。
3. `Mixed Block Pattern` 能打开原 `410` 配置弹窗并保存。
4. `Credit Window Preference`、`Minimum Base Layover`、`Commuter Pattern`、`Efficient Flying First`、`Reserve Avoidance` 仍可新增。
5. 旧 Line 数据清理后，Existing 中不再出现非 Jen 条件。

## 验收标准

1. Line 页面可见条件数量为 6。
2. 可见名称完全匹配：
   - `Credit Window Preference`
   - `Minimum Base Layover`
   - `Commuter Pattern`
   - `Efficient Flying First`
   - `Mixed Block Pattern`
   - `Reserve Avoidance`
3. 页面不显示旧 Line 条件：
   - `Max Credit Window`
   - `Min Credit Window`
   - `Clear Schedule and Start Next Bid Group`
   - `No Same Day Pairings`
   - `Waive No Same Day Duty Starts`
   - `Forget Line`
   - `Most Flying In Least Working Days (Configured)`
   - AA 旧扩展 Line 条件
4. `410 Mixed Block Pattern` 的保存 payload 仍是现有 `reserve-flying-date-pattern`，服务端能校验和持久化。
5. migration 在目标 PBS schema 上幂等执行。
6. 旧 Line group/favorite 被清理，不再回显到员工端。

## 测试计划

开发侧验证：

- `npm --prefix pbs-server test -- src/routes/line-bids.test.ts src/services/line/line-validation.test.ts`
- `npm --prefix pbs-server run build`
- `npm --prefix pbs-portal test -- src/features/line/pages/line-page.test.tsx`
- `npm --prefix pbs-portal run build`
- `npm run check:ui`
- Help 内容验证：
  - `cd e2e && npx playwright test --config=config/playwright.config.ts --project=pbs-portal tests/pbs-portal/help/help-content-rule-bids.spec.ts`
- Playwright Line catalog 回归，优先复用：
  - `cd e2e && npx playwright test --config=config/playwright.config.ts --project=pbs-portal tests/pbs-portal/long-stretch-commuter-pattern.spec.ts`

新增 / 更新自动化测试必须明确覆盖：

1. Add Properties 只显示 Jen 6 个，不显示 obsolete Line property。
2. Recommended 也只显示 Jen 6 个，并按 Excel 顺序。
3. Favorite tab / configured favorite 过滤掉 obsolete Line property。
4. Existing 过滤掉 obsolete Line property。
5. `410` 前端显示为 `Mixed Block Pattern`。
6. `410` 保存到后端的 payload 仍为 `reserve-flying-date-pattern`。
7. 服务端拒绝员工端提交非 keep list 的 Line property。
8. migration 幂等；只清非 keep 数据，保留 keep list 6 个条件的数据和收藏。

数据库验证：

```sql
select property_code, property_name, is_visible_in_portal, is_active, display_order, recommended_order
from pbs_bid_property
where bid_type = 'Line'
order by display_order, property_code;
```

预期只有 Jen 6 个 `is_visible_in_portal=1 and is_active=1`。

## 风险与处理

| 风险 | 处理 |
|---|---|
| `410` 改名影响测试和 Help 文案 | 统一更新测试、Help 和 QA 文档 |
| DB migration 未执行时前端仍拿到旧 catalog | 前端增加 Jen whitelist 兜底过滤 |
| 旧 Line 数据仍在 Existing 中回显 | migration 清理旧 group/favorite，前端 existing 也做兜底过滤 |
| supported catalog 移除过多导致内部 formatter/import 断裂 | 不做大范围删除，只控制员工端可见和旧数据清理 |

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本任务集中在 Line catalog、命名、迁移和测试，多个 agent 容易同时改同一批文件。
- Suggested split: 不拆分。
- Write boundaries: `packages/contracts`、`pbs-server`、`pbs-portal`、`sql`、`docs/test-cases`。
- Conflict risk: Medium。主要风险是 `410` 改名涉及测试、Help、formatter 文案。
- Execution gate: 用户确认本 spec 后再实施。
