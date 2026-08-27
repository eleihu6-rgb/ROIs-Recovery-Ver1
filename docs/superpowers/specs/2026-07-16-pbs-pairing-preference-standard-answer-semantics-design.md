# PBS Pairing Preference 标准答案语义收口设计

## 1. 背景

`Pairing Preference`（`propertyCode=102`）已经升级为可搜索、可筛选、可分页和可多选的 Pairing picker。当前产品仍在 picker 下方保留：

- `LIMIT TO RUN DATE`
- `FULFILMENT`
- `Minimum required`
- `Maximum required`

参考项目的最终定义只包含 `Award/Avoid`、Tier 和明确选中的 `pairing_id`。参考实现还明确说明：手选的 `pairing_id` 已经固定该 pairing 的日期；日期条件只能排除一个已选 pairing，不能增加任何 pairing，因此日期只应作为候选表格的筛选条件，不能成为 bid scope。

项目尚未上线。本次不兼容旧 Pairing Preference 数据，不保留旧 Run Date 或 Fulfilment 语义。

本 spec 覆盖并取代 `2026-07-16-pbs-pairing-preference-filterable-picker-implementation-design.md` 中要求保留 Run Date / Fulfilment 的条款；picker 搜索、筛选、分页和多选设计继续有效。

## 2. 目标

- Pairing Preference 的最终业务语义与参考项目一致。
- 用户勾选哪些 stable `pairing_id`，最终 bid 就只表达这些 Pairing。
- 保留 `Award/Avoid` 和 Tier。
- Date、Days、Credit、Base、Route、Rank 继续用于筛选候选表格，但不进入 bid payload。
- 删除 Run Date 和 Fulfilment 的 UI、contract、validation、summary、search 和 export 语义。
- 清理全部旧 `propertyCode=102` existing bids 和 favorites，不实现兼容读取。

## 3. 不在范围内

- 不改变 `propertyCode=102`。
- 不改变 `Pairing Preference` 名称。
- 不改变 picker 的搜索、筛选、分页、多选和跨页保留选择行为。
- 不移除其他 Pairing 条件的 date scope 或 fulfilment。
- 不修改参考项目。
- 不新增 property 或新 bid type。

## 4. 最终产品行为

### 4.1 弹窗结构

`Configure Pairing Preference` 最终只包含：

1. `TIERS · REQUIRED`
2. `PREFERENCE`：Award / Avoid
3. `PAIRINGS · REQUIRED`
4. quick search、Filters、Pairing 表格、pagination、selected strip
5. Footer：Cancel / Save Favorite / Add Bid 或 Update Bid

删除以下整块 UI：

- `LIMIT TO RUN DATE`
- Specific Date / Date Range run-date editor
- `FULFILMENT`
- matching-run count
- `Minimum required`
- `Maximum required`

### 4.2 Picker filters

以下条件仅缩小候选 Pairing 表格：

- Search pairing/base/route/rank
- Pairing start date From/To
- Check-in time From/To
- Check-out time From/To
- Pairing days Min/Max
- Pairing credit Min/Max

Apply/Clear filters、分页和搜索不能修改或清除已选 Pairing。任何 picker filter 都不能写入 bid、favorite、summary、Search Pairings criteria 或算法导出。

### 4.3 完整性

新增、保存 Favorite 和更新 Existing 使用同一份 validity：

- 至少选择一个 Tier。
- 至少选择一个 Pairing。
- 每个选择必须使用 stable `pairingId`；`pairingNumber` 只作为显示 label。

不再请求 occurrences 来计算 matching runs，也不再以 run date 或 quantity 决定 footer 是否可用。

## 5. Contract

保留现有 discriminated type 名称，但收窄字段：

```ts
type PairingPreferenceBid = {
  type: "pairing-preference"
  pairingIds: string[]
  pairingLabels?: string[]
}
```

删除：

- `dateScope`
- `minimumRequired`
- `maximumRequired`

规则：

- `pairingIds` 至少一个，去空白并去重。
- `pairingLabels` 可选；存在时与 `pairingIds` 保持同序。
- 不接受带已删除字段的 API payload。
- `propertyCode=102` 不再接受或转换旧 `pairing-id-list`、`pairing-occurrence-list` discriminant；只能接受精简后的 `pairing-preference`。
- contracts、Portal types、route Zod schema、server parsing/clone/format/serialize 以及 live-server 对应共享 union 必须同步。

## 6. Portal 修改

### 6.1 PairingPreferenceEditor

- 删除 date scope state、date touched、date error、occurrence matching 和 quantity state。
- 删除 occurrences/details 中只服务于 run-date/fulfilment 校验的批量请求。
- picker selection 直接更新 `pairingIds / pairingLabels`。
- editor validity 只检查 pairing selection。

### 6.2 Dialog 和 summary

- Dialog 宽度和 picker 布局保持不变。
- Footer validity 继续由 Pairing Preference editor 上报。
- Existing/Favorite/Search Pairings summary 只展示 Award/Avoid、Tier 和选择的 Pairing labels/count，不展示日期或 Exact/Minimum/Maximum 文案。

### 6.3 Favorite 和 Existing edit

- Favorite 保存与 Existing 保存使用相同精简 payload。
- 编辑时从 `pairingIds / pairingLabels` 恢复 selected map。
- 当前不可查询但已有 label 的 ID 仍可显示；本次 migration 会清理旧数据，因此不实现旧字段兼容。

## 7. Server 修改

- route schema 严格拒绝已删除字段。
- property validation 只验证 stable Pairing IDs、labels 对齐和至少一个 selection。
- 删除 Pairing Preference 的 date-scope normalization、matching-run availability 校验和 fulfilment bounds 校验。
- 保存 draft、favorite、existing patch、crew-bid import 等入口只能生成精简 payload。
- Search Pairings criteria builder 对 Pairing Preference 只按选中的 stable Pairing IDs 过滤。
- 算法导出只输出选中的 Pairing IDs 及 Tier/Award-Avoid counter，不输出 run date 或 quantity。
- live-server 的 rule-bid clone/format/value parser 同步精简 shape，避免构建或 algorithm export 失败。

### 7.1 Crew-bid import

现有 legacy TXT `Pairing Number ...` 使用可读 pairing number，并可携带 `Limited to N`；它不能无歧义地转换为参考项目要求的 current-period stable `pairing_id`。本次不兼容旧数据，因此不做猜测式转换：

- property 102 的 legacy `Pairing Number ...` clause 标记为不可导入，并返回明确原因：必须在 Portal Pairing picker 中重新选择 stable Pairing IDs。
- 带 `Limited to N` 的 property 102 clause 同样不可导入，不能忽略后静默改变用户语义。
- import 不再为 property 102 写 `pairingReferences`、`pbs_bid_pairing_occurrence`、`limit_n` 或 relational `operator=In` payload。
- 其他 property 的 crew-bid import 行为不变。
- 后续若需要文件导入，必须另行设计包含 stable Pairing IDs 的新格式，不在本次范围内。

## 8. 数据迁移

新增幂等、破坏性 migration，目标为三个 PBS schema：

- `f8_pbs`
- `f8_sit_pbs`
- `f8_uat_pbs`

迁移先解析 property 102 的 stable definition ID，并同时按 legacy `property_id=102` 与 stable `property_definition_id` 命中。清理所有包含 property 102 的数据：

- property 102 作为主 group 的 property group。
- property 102 作为 secondary condition 的整条 property group；不能只删 condition 后保留一个被改义的 group。
- `pbs_bid_pairing_occurrence`：由 FK cascade 删除或显式删除，并记录数量。
- `pbs_bid_pairing_configured_favorite`。
- `pbs_bid_pairing_favorite`。
- 可能遗留的 `pbs_bid_property_favorite`。
- 清理后没有 group 的空 `pbs_bid_tier`。
- 重算保留 tier 的 `total_groups` 和保留 bid 的 `total_tiers`。
- 仅当所有 group、favorite 和其他子对象都为空时删除 `pbs_bid` container；mixed bid 必须保留其他 property group。

迁移同时更新 property 102 catalog metadata：

- 保持 code、name、active、visibility 和 display order 不变。
- `validation_json` 只描述可多选 Pairing IDs/labels。
- tooltip 只描述 Award/Avoid selected Pairings，不再提 run date、required quantity、minimum 或 maximum。
- 同步更新 `sql/seed/10-pbs-bid-property.sql`，避免新环境初始化恢复旧描述。

执行前后输出每类清理数量，并在每个 schema 的单独 transaction 中运行。

项目尚未上线，因此不提供旧数据回填、转换或兼容读取。

## 9. 测试与验收

### 9.1 Portal unit tests

- 弹窗不显示 `LIMIT TO RUN DATE`、`FULFILMENT`、Minimum/Maximum。
- picker filter 变化不改变 selection payload。
- selection 只生成 IDs/labels。
- 无 Tier或无 Pairing 时 footer disabled。
- Favorite 和 Existing edit 使用精简 payload 回显。

### 9.2 Server tests

- route 接受精简 payload。
- route 拒绝包含 `dateScope / minimumRequired / maximumRequired` 的 payload。
- route/property validation 对 property 102 拒绝 `pairing-id-list`、`pairing-occurrence-list`。
- validation、clone、format、serialize、import 和 export 只消费 Pairing IDs。
- Pairing search SQL 只按 selected stable IDs 匹配。
- crew-bid import 对 legacy `Pairing Number ...` 和 `Limited to N` 返回明确不可导入原因，且不写 occurrence/reference/limit 数据。
- migration 覆盖主 group、secondary condition、mixed bid、三类 favorite、occurrence、空 tier、计数重算和重复运行。
- migration 在空数据和有旧 102 数据时均可重复安全执行。

### 9.2.1 共享行为防误伤

必须增加或保留显式回归，证明共享 union/helper 收窄后以下条件自己的 date scope / fulfilment 仍按既有 contract 工作：

- Airport Preference
- Flight Number Preference
- Pairing Check-In / Check-Out Time
- Pairing Length
- Redeye Preference

回归至少覆盖 route schema 和一个 search/export 或 format/serialize 路径；不得用 Pairing Preference 的字段删除扩大为全局字段删除。

### 9.3 Playwright

真实员工端流程必须覆盖：

1. 打开 Pairing Preference。
2. 确认 Run Date 和 Fulfilment 不存在。
3. 使用日期等 picker filter 缩小候选。
4. 跨筛选/分页选择 Pairing。
5. 保存并检查 request payload 只有 IDs/labels，不含 picker filters 或已删除字段。
6. 编辑 Existing 和 Favorite，确认选择正确回显。

### 9.4 QA 与门禁

- 更新 `docs/test-cases/pbs/pairing/` 下 Pairing Preference QA。
- 更新旧 QA 中关于 Run Date/Fulfilment 的描述，或明确标记历史废弃。
- 运行 Portal focused Vitest、Server focused tests、Playwright、Portal/Server/live-server build、lint、`npm run check:ui` 和 `git diff --check`。

## 10. 验收标准

- Pairing Preference 员工端只表达 Tier、Award/Avoid 和选中的 Pairing IDs。
- 日期等 picker filters 只影响候选列表，不进入最终 bid。
- 产品代码和 API 中不再存在 Pairing Preference 专属 Run Date/Fulfilment 行为。
- 所有旧 property 102 bids/favorites 已从三个 PBS schema 清理。
- property 102 catalog/seed 不再宣称 Run Date 或 quantity 能力。
- legacy Pairing Number TXT import 和旧 property 102 payload types 被明确拒绝，不会静默转换。
- contracts、Portal、pbs-server、live-server 和 algorithm export 构建通过。
- Playwright 证明实际 UI 和 request payload 与参考项目语义一致。

## 11. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 共享 bid union、Portal editor、server validation/export 和 destructive migration 紧密耦合；当前共享工作区并行修改容易产生交叉覆盖。
- Suggested split: 单 agent 顺序完成 contract → Portal → Server/live-server → migration → tests。
- Write boundaries: contracts、pbs-portal、pbs-server、live-server、sql/migration、E2E 和 QA。
- Conflict risk: Medium；主要风险是共享 `RuleBidValue` union 和 property 102 数据清理。
- Execution gate: spec 经用户确认后才可实施；migration 需在代码与测试通过后由用户明确授权执行。
