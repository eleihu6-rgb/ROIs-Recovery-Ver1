# PBS Flight Number Preference 航班类型范围过滤器设计

## 背景

`Flight Number Preference` 当前是 Pairing 条件 `propertyCode=116`。员工在弹窗里选择 `Award / Avoid`，然后在 `FLIGHT NUMBERS` 搜索框中搜索并选择一个或多个具体 flight number，最后可选 `LIMIT TO FLIGHT DATE`。

用户提供的 flight number range 表说明：表格中的 range 是“航班号去掉字母后的数字”。不同数字范围代表不同业务类型。用户这次要的不是新增一个可单独保存的 Charter bid，而是在现有 flight number 搜索前增加一个可清空的 Type 下拉选择，让下面的 flight number 搜索候选只显示所选 Type 对应范围内的航班号。

## 已确认需求

在 `PREFERENCE` 与 `FLIGHT NUMBERS` 之间增加一个可清空下拉：

```text
PREFERENCE
[ Award ] [ Avoid ]

TYPE
[ Select type... v ] [clear]

FLIGHT NUMBERS
Search Flight Number
```

下拉选项按用户截图和标准答案 range 表保留三项：

| UI Type | From | To | STC Code |
|---|---:|---:|---|
| Charter | 7000 | 7999 | C |
| Positioning Flights - Charter Network | 9900 | 9949 | P |
| Recovery Flights - Charter Network | 9950 | 9999 | C |

当用户选择其中一个 Type 时：

- 下面的 flight number autocomplete 只返回该 Type 对应数字范围内的 flight numbers。
- 用户仍然必须从搜索结果中选择一个或多个实际 flight number。
- 最终保存的 bid 仍然是具体 flight number list，不保存 Type 本身作为 bid 条件。
- 下拉必须可清空；清空后 flight number autocomplete 恢复全量搜索。

本次不再把三段 Charter 相关范围合并成一个 checkbox。它们必须是三个独立 Type；用户选哪个，就只搜哪个范围。

明确不包含：

- `8000-8999 ACMI out`，虽然 STC Code 是 `C`，但 Type 不包含 Charter。
- `9000-9399 Recovery Flights - Scheduled...`，属于 scheduled recovery，不是 Charter。
- `9400-9799 Positioning Flights...` 的非 Charter network 段。

## 当前代码事实

- Contract 默认值在 `packages/contracts/pbs-pairing-bids.js`，`116 Flight Number Preference` 当前 payload 为：

```json
{
  "type": "flight-number-preference",
  "flightNumbers": [],
  "dateScope": null
}
```

- Portal editor 在 `pbs-portal/src/features/pairing/components/flight-number-preference-editor.tsx`。
- Flight number autocomplete 使用 `GET /api/pairing-search/flight-numbers`。
- Autocomplete server query 在 `pbs-server/src/services/pairing-search/flight-number-search-query.ts`。
- 当前 autocomplete 只按 actor base、query、limit 过滤；没有 rank 过滤，也没有 `seg_assignment in ('FLT','FLY')` 限制。
- 当前工作树中已经存在上一版未提交的 checkbox / `category=charter` 实现草稿。最终实现必须替换掉这套旧语义：
  - 前端不再使用 `charterOnly` checkbox state。
  - Portal service / route / contract 不再暴露单一 `category=charter`。
  - Server loader 不再把所有 `CHARTER_%` 字典行聚合成一个 category。
  - 相关测试要从 checkbox/category 断言改为 clearable Type select / `type` 断言。
- Search Pairings 对 `116` 的最终匹配在 `pbs-server/src/services/pairing-search/pairing-search-detail-conditions.ts`，当前语义是：
  - 只看 `pairing_segment`
  - `s.is_deleted = 0`
  - `seg_assignment` 只接受 `FLT/FLY`
  - `upper(btrim(s.flt_num)) = any(...)`
  - 可选 date scope 用 `s.flt_dt`
- 参考项目当前 `Flight Number Preference` 也是具体 flight number 多选，没有 Charter 独立 bid。
- 远端 `f8.pairing_segment` 只读抽样确认，当前有 `7001/7002/7011/...` 等 flight number，Charter range 过滤可以命中真实候选。

## 目标

1. 在 `Flight Number Preference` UI 中新增可清空 `TYPE` 下拉。
2. 下拉选择只影响下面的 flight number 搜索候选，不单独成为保存条件。
3. 保存 payload 保持当前标准答案语义：只保存具体 `flightNumbers` 和 `dateScope`。
4. Search Pairings 与 `PAIRING_SCORE.csv` 导出继续使用具体 flight number 精确匹配，因此不会因为新增 UI filter 改变最终算法输入语义。
5. Flight number type range 需要可配置，不把业务范围硬编码在前端。

## 非目标

- 不新增新的 visible property，继续使用 `116 Flight Number Preference`。
- 不新增 `presets:["charter"]`、`selectedType` 这类保存字段。
- 不允许只选择 Type 就提交；仍必须选择至少一个具体 flight number。
- 不改变 Search Pairings 里 `116` 的最终精确匹配语义。
- 不改变 `PAIRING_SCORE.csv` schema。
- 不改变 `ACMI out` 的业务归属。
- 不删除手动 flight number 搜索能力。

## 方案对比

### 方案 A：Type 作为保存 preset

选择 Type 后保存为语义 preset，后端 search 再按 range 过滤。

优点：

- 用户不用选择具体 flight number。

问题：

- 这会改变 `Flight Number Preference` 的 bid 语义，从“具体 flight number”变成“类别筛选”。
- 需要改最终 search、algorithm export、rule-bid persistence。
- 和用户现在说明的“限制下面搜索框”不一致。

不推荐。

### 方案 B：Type 下拉作为 autocomplete 过滤器

选择 Type 后，只限制下面搜索框候选；用户仍然选择具体 flight numbers。下拉可清空，清空后恢复全量候选。

优点：

- 符合当前用户修正后的理解。
- 保存 payload 不变，旧 bid / favorite / Search Pairings / algorithm export 风险低。
- 最终 pairing 过滤仍按现有具体航班号精确匹配，容易验证。
- 后续可增加其它类型过滤，例如 `Scheduled`、`ACMI out`，不影响已保存 bid。
- 三个 Charter 相关 type 不会被合并，用户选择的范围更明确。

推荐。

### 方案 C：前端本地过滤 autocomplete 结果

前端先请求所有 flight numbers，再按 range 本地过滤。

优点：

- 后端改动少。

问题：

- autocomplete 当前是后端分页/limit 搜索，本地过滤会遗漏后端未返回的候选。
- 不能保证 Search by query 的结果完整。
- range 配置会被迫进入前端。

不推荐。

## 推荐设计

采用方案 B：`TYPE` 下拉是 autocomplete 过滤器，不是 bid preset。

### UI 行为

在 `PREFERENCE` 和 `FLIGHT NUMBERS` 之间增加一个轻量 section，遵守现有 preference condition 视觉标准：

```text
TYPE
[ Select type... v ] [x]
```

行为：

- 默认空值，placeholder 使用 `Select type...` 或项目内同等短文案。
- 下拉选项为：
  - `Charter`
  - `Positioning Flights - Charter Network`
  - `Recovery Flights - Charter Network`
- 选择任一 Type 后，`FLIGHT NUMBERS` autocomplete 只显示该范围内的候选。
- 下拉必须可清空；清空后 autocomplete 恢复显示全部可用 flight numbers。
- 已经选中的 flight number tag 不因为切换或清空 Type 自动删除。
- 如果已选 tag 不属于当前 Type 范围，切换 Type 后也不强制移除；Type 只限制“后续搜索候选”，不清理用户已选值。
- `ADD BID` 的有效性仍由已选 `flightNumbers` 决定：没有具体 flight number 时禁用。
- 编辑已有 bid 时，已选 flight numbers 正常回显；Type filter 默认空值。该 filter 不写入持久化 payload。
- UI 可新增小型 shared primitive，例如 `PreferenceClearableSelect`，但不引入 Ant 依赖；视觉上模仿 Ant Select 的清空 affordance 即可。

### Payload

保持不变：

```ts
type FlightNumberPreferenceBid = {
  type: "flight-number-preference";
  flightNumbers: string[];
  dateScope: FlightNumberPreferenceDateScope | null;
};
```

保存例子：

```json
{
  "type": "flight-number-preference",
  "flightNumbers": ["7001", "9950"],
  "dateScope": null
}
```

不新增：

```json
{
  "selectedType": "charter"
}
```

### Autocomplete API

扩展现有 flight number autocomplete API，增加可选参数：

```http
GET /api/pairing-search/flight-numbers?query=70&limit=10&type=charter
```

规则：

- `type` 可选。
- 不传 `type` 时保持现有行为。
- `type=charter` 时，只返回 normalized numeric flight number 落在 `7000-7999` 的候选。
- `type=positioning-charter-network` 时，只返回 normalized numeric flight number 落在 `9900-9949` 的候选。
- `type=recovery-charter-network` 时，只返回 normalized numeric flight number 落在 `9950-9999` 的候选。
- 未知 type 返回 400，避免前端传错后静默返回全量。

Autocomplete search contract 必须显式从上一版 `category` 迁到 `type`：

- `packages/contracts/pbs-search-pairings.js` 导出 `pbsFlightNumberSearchTypes`。
- `packages/contracts/pbs-search-pairings.d.ts` 导出 `PbsFlightNumberSearchType`。
- 旧 `PbsFlightNumberSearchCategory` / `pbsFlightNumberSearchCategories` 不再保留，除非有其它已提交调用方需要兼容；当前目标是不保留旧 category API。

前端 cache / query key 必须包含 type。当前 `TagListControl` 的 query key 是：

```ts
[...autocomplete.queryKey, normalizedQuery]
```

因此 `FlightNumberPreferenceEditor` 需要传入一个按 filter 派生的 autocomplete config：

```ts
queryKey: ["pairing-search", "flight-numbers", "type", selectedType ?? "all"]
search: (query) => pairingService.searchFlightNumbers(query, 20, selectedType ?? undefined)
```

这样切换 Type 后不会复用其它 Type 或全量 autocomplete 缓存。`PairingBidAutocompleteConfig` 可以扩展 search options，让 editor 将 `type` 传入 autocomplete service；query key 仍必须区分 type。

### Range 配置

新增字典配置，放在 live schema 的 `dictionary`。当前 `dictionary.code_value` 是 `varchar(50)`，不能存整段 JSON；本次不扩 `dictionary` schema，使用多行短值配置。

新增父节点：

```sql
parent_code = null
code = 'PBS_FLIGHT_NUMBER_CATEGORY_RANGE'
name = 'PBS Flight Number Category Range'
```

子节点：

| parent_code | code | name | code_value |
|---|---|---|---|
| `PBS_FLIGHT_NUMBER_CATEGORY_RANGE` | `CHARTER_MAIN` | `Charter` | `7000-7999` |
| `PBS_FLIGHT_NUMBER_CATEGORY_RANGE` | `CHARTER_POSITIONING_NETWORK` | `Positioning Flights - Charter Network` | `9900-9949` |
| `PBS_FLIGHT_NUMBER_CATEGORY_RANGE` | `CHARTER_RECOVERY_NETWORK` | `Recovery Flights - Charter Network` | `9950-9999` |

实现要求：

- 新增共享配置 loader，例如 `flight-number-category-range-config.ts`。
- 从 live schema `dictionary` 读取 `parent_code='PBS_FLIGHT_NUMBER_CATEGORY_RANGE'` 的行。
- `code` 映射到 API type：
  - `CHARTER_MAIN` -> `charter`
  - `CHARTER_POSITIONING_NETWORK` -> `positioning-charter-network`
  - `CHARTER_RECOVERY_NETWORK` -> `recovery-charter-network`
- `code_value` 按 `from-to` 解析。
- `from/to` 必须是正整数，且 `from <= to`。
- 字典缺失或配置非法时，对应 Type 搜索返回明确错误，不静默退回全量。
- 可用缓存，TTL 可参考其它 pairing search 字典配置，避免每次输入都查字典。
- 如果本地未提交 SQL artifact 中已存在旧单一 category 聚合写法，实现时要改成上述一行一 type 的 mapping；不允许继续通过 `CHARTER_%` 汇总成一个 `charter` type。

### Flight number numeric normalizer

按用户说明，range 判断基于“去掉字母后的数字”。服务端 autocomplete query 对 `s.flt_num` 做 normalized numeric 判断：

```sql
nullif(regexp_replace(upper(btrim(s.flt_num)), '[^0-9]', '', 'g'), '')::integer
```

然后判断：

```sql
between 7000 and 7999
-- selected type 决定具体 between 范围
```

仍然保留现有候选来源约束：

- `pairing_segment`
- `is_deleted = 0`
- actor base scope 不变；本次不新增 rank filter
- 只返回当前搜索 query 命中的 flight numbers

同时，本次应把 autocomplete 候选和最终 `Flight Number Preference` search 语义对齐，新增：

- `upper(btrim(coalesce(s.seg_assignment, ''))) in ('FLT', 'FLY')`

这是当前 autocomplete 的新增行为，不是已有事实。原因是最终保存后的 `116` 条件本来只匹配 `FLT/FLY`；autocomplete 如果返回 DHD-only flight number，会导致用户可以选择但最终 Search Pairings / 导出没有命中。

如果实际数据以后出现 `F8` 航司前缀且业务希望把 airline code 中的数字也去掉，本 normalizer 需要调整；本次按用户描述采用“去掉非数字字符后转整数”。

### Search Pairings 与导出

最终保存仍然是具体 flight numbers，因此 Search Pairings 和 `PAIRING_SCORE.csv` 导出不需要新增 Charter range 条件。

必须保持：

- Search Pairings 继续用 `upper(btrim(s.flt_num)) = any(...)` 精确匹配已选 flight number。
- `Award / Avoid` 语义不变。
- `LIMIT TO FLIGHT DATE` 仍用 `s.flt_dt`。
- `PAIRING_SCORE.csv` 继续基于最终命中的具体 pairing 输出。

这也解释了为什么这个方案对 pairing CSV 是安全的：Charter 只帮助用户找到正确的具体航班号；真正进入保存和导出的仍是具体 flight number。

## 影响范围

预计会涉及：

- `pbs-portal/src/features/pairing/components/flight-number-preference-editor.tsx`
- `pbs-portal/src/features/pairing/components/flight-number-preference-editor.test.tsx`
- `pbs-portal/src/features/pairing/types.ts`
- `pbs-portal/src/shared/services/pairing-service.ts`
- `pbs-portal/src/shared/services/pairing-service.test.ts`
- `packages/contracts/pbs-search-pairings.js`
- `packages/contracts/pbs-search-pairings.d.ts`
- `e2e/pages/pbs-portal/bid-workbench-page.ts`
- `pbs-server/src/routes/pairing-search.ts`
- `pbs-server/src/routes/pairing-search.test.ts`
- `pbs-server/src/services/pairing-search/flight-number-search-query.ts`
- `pbs-server/src/services/pairing-search/flight-number-category-range-config.ts`
- `pbs-server/src/services/pairing-search/pairing-search-service.ts`
- `pbs-server/src/services/pairing-search/pairing-search-service.test.ts`
- `sql/seed`
- `sql/migration`
- `e2e/tests/pbs-portal/condition-default-favorites.spec.ts`
- `docs/test-cases/pbs/pairing`

不应涉及：

- `packages/contracts/pbs-pairing-bids.js`
- `pbs-server/src/services/pairing-search/pairing-search-detail-conditions.ts`
- `pbs-server/src/services/algorithm-export/pairing-score-export.ts`
- lineholder `rule-bid-value` serialize / deserialize

除非实现时发现当前 autocomplete config 类型必须扩展到 contract 层；如果出现这种情况，需要先停下来重新评估。

## 测试与验收

自动化测试：

- Portal component:
  - 默认 Type 为空。
  - 选择 `Charter` 后 autocomplete 请求带 `type=charter`。
  - 选择 `Positioning Flights - Charter Network` 后 autocomplete 请求带 `type=positioning-charter-network`。
  - 选择 `Recovery Flights - Charter Network` 后 autocomplete 请求带 `type=recovery-charter-network`。
  - 切换 Type 后 autocomplete query key 区分各 Type 与 `all`，不复用旧候选缓存。
  - 清空 Type 后 autocomplete 请求不带 type。
  - 只选择 Type 但没有 flight number 时 `ADD BID` 仍禁用。
  - 切换 Type 或清空 Type 不会删除已选 flight number tag。
  - 选择具体 flight number 后 payload 仍只有 `flightNumbers/dateScope`。
- Portal service:
  - `searchFlightNumbers` 支持可选 `type`。
  - 所选 type 正确进入 query string。
- Server route:
  - 接受三个已知 type。
  - 未知 type 返回 400。
- Server query:
  - 传入 type 时 SQL 包含该 type 对应 normalized numeric range 条件。
  - 不传 type 时 SQL 不包含 range 条件。
  - 仍保留 actor base 约束。
  - 新增并覆盖 `FLT/FLY` 候选约束，避免 DHD-only flight number 出现在候选中。
- Playwright:
  - Flight Number Preference 弹窗中 Type 下拉可见。
  - 选择每个 Type 后搜索结果只显示 mock 中该范围 flight number。
  - 清空 Type 后搜索恢复全量 mock 候选。
  - 保存 payload 不包含 `type` / `selectedType` / `presets`，只包含具体 `flightNumbers`。
- UI gate:
  - `npm run check:ui` hard violations 为 0。

人工 QA：

- 新增 `docs/test-cases/pbs/pairing/<date>-flight-number-charter-filter.md`。
- 覆盖：
  - Type 默认空值。
  - 选择任一 Type 后候选收窄到对应范围。
  - 清空 Type 后候选恢复。
  - 切换或清空 Type 不自动清除已选 tag。
  - 保存、编辑、Search Pairings 和导出仍按具体 flight number 工作。

## 风险与处理

- Autocomplete query 中对 `flt_num` 做 `regexp_replace` 可能影响性能。该过滤只在用户选择 Type 时启用；后续如性能不足，应考虑增加 normalized flight number 字段或物化列。
- `dictionary.code_value` 长度只有 50，因此不能使用大 JSON；本 spec 采用多行短值配置。
- 如果未来业务决定 `ACMI out` 也要出现在 Type 下拉，只改字典配置和 type mapping，新增 `acmi-out` 即可。
- 如果用户希望某个 Type 本身也能作为可提交条件，那将变成另一个需求，需要重新扩展 payload 和 search/export 语义。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这是单一 editor + autocomplete route/query 的小范围变更，拆分会增加协调成本。
- Suggested split: 不拆。
- Write boundaries: 单 agent 顺序修改 Portal editor/service、Server autocomplete route/query、dictionary seed/migration、tests/docs。
- Conflict risk: Low to Medium。主要风险是 autocomplete 服务和 E2E mock 需要同步。
- Execution gate: 先确认本修订版 spec，再实现；实现前对要修改的核心 symbol 跑 GitNexus impact。
