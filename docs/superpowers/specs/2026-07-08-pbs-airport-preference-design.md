# PBS Airport Preference 条件设计

日期：2026-07-08  
状态：待用户 review  
范围：PBS Portal Pairing 页面新增 `Airport Preference` 复合条件，并下线旧机场 / layover 分散条件。

## 背景

Jen 在 `init-docs/Jenife_Bidding_Type_Clarification_20260707.docx` 中对 Pairing bids 提出合并建议，其中机场相关反馈的核心是：

- `Landing in any airport` 不应继续作为一个孤立、偏窄的入口。
- 新入口应表达更宽泛的 `Airport Preference`。
- 用户应能选择关心的是 landing、layover / overnight，或后续可扩展的组合语义。
- 新入口应支持 specific dates、date ranges、minimum / maximum requirement。
- 如果选择 layover，还应允许设置 layover duration。

用户确认本轮先处理这一组，不处理 Jen 文档里的其他 Pairing 合并项。

## 当前状态

当前 DB / contract / Portal 中机场相关能力分散在多个 Pairing property：

| code | 当前条件 | 当前语义 |
|---:|---|---|
| 101 | `Any Landing In Airport` | pairing 内任意航段落地到指定机场，当前实现匹配 `pairing_segment.arv_arp`。 |
| 104 | `Any/Every Layover In Airport` | pairing 内任意 / 每个 layover 位于指定机场，当前实现匹配 `duty_layover_nits > 0` 且 `duty_end_arp`。 |
| 119 | `Any/Every Layover Duration` | layover/rest 时长条件，当前实现匹配 `duty_sch_rest_min` / `duty_act_rest_min`。 |
| 123 | `Any/Every Layover On Date / Day` | layover 发生日期 / 星期 / 日期范围条件。 |

这些条件能覆盖 Jen 需求的一部分，但用户需要通过多个 property 手动组合，理解成本高，而且和 Jen 希望的“以后合并成更少入口”的方向不一致。

## 目标

1. 新增一个真正的 `Airport Preference` Pairing 条件，而不是简单把 `101` 改名。
2. `Airport Preference` 支持基础事件：
   - `Landing`
   - `Layover`
3. `Airport Preference` 支持逐个累加的附加条件：
   - `Date Condition`
   - `Matching Count`
   - `Layover Duration`
4. `Date Condition` 内部只能选择一种时间类型：
   - `Specific Date`
   - `Day`
   - `Date Range`
5. 下线并清理旧的 `101 / 104 / 119 / 123` 数据，不做旧数据兼容。
6. 保持 Pairing 页面现有弹窗视觉和交互骨架，不重做 UI 风格。
7. 后端 preview / current rules count / algorithm export 必须理解新条件。

## 非目标

- 不处理 Jen 文档中的其他 Pairing 合并项，例如 `Pairing Preference`、`Check-In/Check-Out Time`、`Flight Legs per Duty`、`Work Day Preference` 等。
- 不设计新的 landing + layover 同时匹配模式；本轮只做 `Landing` 和 `Layover` 二选一。
- 不把旧 `101 / 104 / 119 / 123` 自动转换成新 `Airport Preference`。
- 不保留旧数据展示兼容；旧数据将通过 migration 清理。
- 不改变 Pairing Number、Departure Date / Day、Line / Days Off / Reserve 的业务语义。
- 不引入新的 UI 视觉系统；员工端 PBS Portal 继续使用现有白色轻量弹窗风格。

## 方案对比

### 方案 A：只把 `101` 重命名为 `Airport Preference`

优点：

- 改动小。

缺点：

- 仍只能表达 landing airport。
- 无法覆盖 layover airport、layover date、layover duration、matching count。
- UI 名称与实际能力不一致，会误导用户。

结论：不采用。

### 方案 B：新增 `Airport Preference`，但把所有字段一次性展开

优点：

- 单个表单能完整配置所有能力。

缺点：

- 和现有 `Configure Pairing Bid` UI 结构不一致。
- 用户一进弹窗会看到过多空字段。
- `Date / Day / Date Range` 同时展示会造成“能否同时选择”的误解。
- 之前设计图已被用户明确否定。

结论：不采用。

### 方案 C：新增 `Airport Preference`，使用现有弹窗 + 独立折叠条件

设计：

- `BID` 第一行只表达基础事件：`Landing / Layover` + airport。
- 下方用多个箭头折叠项逐个追加限制：
  - `Date Condition`
  - `Matching Count`
  - `Layover Duration`
- `Date Condition` 展开后用 `Time Type` 下拉选择一种类型，只显示对应控件。

优点：

- 符合用户确认的“先选 YYZ layover，再增加 15-21，再增加 count / duration”的累加思路。
- 保留现有 PBS Portal 弹窗结构。
- 每个附加条件语义清晰，适合后续继续扩展。
- 后端可以把它建模为“基础 airport event + AND conditions”，与当前 Pairing search 条件构建思路一致。

缺点：

- 需要新增 contract bid type、前端控件、后端 SQL condition builder 和算法导出支持。

结论：推荐并采用。

## 推荐设计

新增 Pairing property：

| 字段 | 值 |
|---|---|
| `property_code` | `168` |
| `bid_type` | `Pairing` |
| `property_name` | `Airport Preference` |
| `award_or_avoid` | `["award","avoid"]` |
| `source_type` | `legacy` 或 `product`，以当前 seed 习惯可先用 `legacy` |
| `is_visible_in_portal` | `1` |
| `display_order` | 建议放在 `102 Pairing Number` 之后，或取代旧 `101` 的位置 |

旧 property：

- `101 Any Landing In Airport`
- `104 Any/Every Layover In Airport`
- `119 Any/Every Layover Duration`
- `123 Any/Every Layover On Date / Day`

处理方式：

- `is_visible_in_portal = 0`
- `recommended_order = null`
- 清理现有 draft / configured favorite / favorite 数据中涉及这些 code 的记录
- contract 内可保留定义用于历史代码编译和明确错误处理，但 Portal 新增列表不再返回这些 code

## Bid Payload 设计

新增 `PbsPairingBidValue` 类型：

```ts
type PbsPairingAirportPreferenceBid = {
  type: "airport-preference";
  event: "landing" | "layover";
  airports: string[];
  dateCondition?: {
    mode: "specific_dates";
    dates: string[];
  } | {
    mode: "day";
    daysOfWeek: PbsPairingDayOfWeek[];
  } | {
    mode: "date_range";
    from: string;
    to: string;
  };
  matchingCount?: {
    operator: "=" | "<" | ">" | "Between";
    value?: number;
    from?: number;
    to?: number;
  };
  layoverDuration?: {
    operator: "=" | "<" | ">" | "Between";
    value?: string;
    from?: string;
    to?: string;
  };
};
```

约束：

- `airports` 必填，至少一个 IATA 机场 / city code。
- `event = "landing"` 时不允许提交 `layoverDuration`。
- `event = "layover"` 时允许 `layoverDuration`。
- `dateCondition` 可空；为空表示不限制日期。
- `matchingCount` 可空；为空表示只要求存在至少一个匹配 airport event。
- `matchingCount.operator = "Between"` 时必须提交 `from` 和 `to`。
- `matchingCount.operator` 为 `= / < / >` 时必须提交 `value`。
- `layoverDuration.operator = "Between"` 时必须提交 `from` 和 `to`。
- `layoverDuration.operator` 为 `= / < / >` 时必须提交 `value`。

## UI 设计

保持现有弹窗结构：

```text
Configure Pairing Bid                         ×
Airport Preference

TIERS
[T1] [T2] [T3] [T4] [T5] [T6] [T7]

MODE
[Award] [Avoid]

BID ?
[ Layover ▼ ]  [ YYZ ×   Type airport or city code ]

▾ Date Condition
   Time Type
   [ Date Range ▼ ]

   From [ 2026-06-15 📅 ]   To [ 2026-06-21 📅 ]

▸ Matching Count                         > 1

▸ Layover Duration                       Not set

[CANCEL] [SAVE FAVORITE] [ADD BID]
```

交互规则：

1. `Airport Event` 下拉只显示：
   - `Landing`
   - `Layover`
2. 主 airport 输入沿用当前机场 autocomplete / multi-select 风格。
3. `Date Condition` 是独立折叠项。
4. `Date Condition` 展开后先选择 `Time Type`：
   - `Specific Date`
   - `Day`
   - `Date Range`
5. 同一时间只显示一种 Time Type 对应控件：
   - `Specific Date`：日期输入 + `Add Date`
   - `Day`：`Mon` 到 `Sun` 按钮
   - `Date Range`：`From` / `To`
6. `Matching Count` 是独立折叠项：
   - 支持 `= / < / > / Between`
   - 展开后显示 operator + number 或 number range
   - 折叠时显示摘要，例如 `> 1`；如 UI 想展示更自然的 `At least 2`，内部仍应序列化为 `> 1`
7. `Layover Duration` 是独立折叠项：
   - 仅 `event = "layover"` 时可见或可用
   - 支持 `= / < / > / Between`
   - 使用现有 duration 输入样式，格式 `HH:MM`
8. `Landing` 下如果用户此前设置了 layover duration，应在切换到 `Landing` 时清空并隐藏 duration。
9. 提交按钮遵循现有规则：Tier、Mode、Airport 必填；附加条件如果展开但不完整，不允许提交。

Jen 示例：

> “I want to go YYZ only layovers between the 15–21 and want at least 2 layovers.”

对应配置：

- Mode：`Award`
- Airport Event：`Layover`
- Airports：`YYZ`
- Date Condition：`Date Range`，`15–21`
- Matching Count：`> 1`；UI 如需自然文案可显示 `At least 2`，但 contract 不新增 `>=` operator
- Layover Duration：不设置

## 后端查询语义

`Airport Preference` 应被转换为一个 SQL 条件：

```text
存在 / 统计满足基础 event 的 matching rows
AND dateCondition 限制
AND layoverDuration 限制
AND matchingCount 限制
```

### Landing event

基础匹配：

- 来源：`pairing_segment`
- 语义：任意航段落地机场在 `airports` 中
- 字段：`upper(s.arv_arp) = any(airports)`

日期口径：

- Landing 的日期应使用该 segment 的 arrival local date 或当前项目已有 landing 口径。
- 第一版若无法可靠取 local date，可先使用 `(s.sch_end_dt_utc at time zone 'UTC')::date`，但实现前必须核对现有 pairing search 对 airport/date 的时区口径。

匹配次数：

- 统计满足 landing airport + date condition 的 segment 数。

### Layover event

基础匹配：

- 来源：`pairing_segment`
- 语义：存在 layover，且 layover airport 在 `airports` 中
- 字段：
  - `s.duty_layover_nits > 0`
  - `upper(s.duty_end_arp) = any(airports)`

日期口径：

- 沿用当前 `123 Any/Every Layover On Date / Day` 的 layover date 口径：
  - `(coalesce(s.duty_sch_end_dt_utc, s.sch_end_dt_utc) at time zone 'UTC')::date`

Layover duration：

- 沿用当前 `119 Any/Every Layover Duration` 的 rest minutes 口径：
  - `coalesce(s.duty_sch_rest_min, s.duty_act_rest_min)::numeric`

匹配次数：

- 统计满足 layover airport + date condition + duration condition 的 layover rows 数。

### Matching Count

无 `matchingCount` 时：

- 条件语义为 `exists(matching rows)`。

有 `matchingCount` 时：

- `=`：`count(*) = value`
- `>`：`count(*) > value`
- `<`：`count(*) < value`
- `Between`：`count(*) between from and to`

说明：

- 用户提到的 `>1`、`=1`、`<3`、`Between 1-3` 应归入 `Matching Count`，不是 layover duration。
- 第一版不扩展 `>=` operator；“至少 2” 统一用 `> 1` 表达，UI 如需更自然可以只在展示文案中写 `At least 2`。

## 保存与序列化设计

当前 `pbs_bid_group` 只有 `operator / param_a / param_b / param_c` 三个参数字段，`Airport Preference` 是复合 payload。推荐第一版用 JSON 存储：

- `operator = "Json"`
- `param_a = JSON.stringify(airportPreferenceBid)`
- `param_b = null`
- `param_c = null`

需要同步更新：

- `serializeRuleBid`
- `deserializeRuleBid`
- `cloneRuleBidValue`
- `normalizePbsPairingBidValueForRules`
- `serializePbsPairingBidValueForRules`
- 前端 `clonePairingBidValue`
- 前端 summary formatter

理由：

- 不强行把复合条件压进三个 param 字段。
- 后续继续扩展 `Airport Preference` 时不用改表结构。
- 当前已有 `time-condition-list` 等 bid type 使用 JSON 字符串存储，项目中已有类似模式。

## 数据迁移与清理

新增 migration：

`sql/migration/2026-07-08-pbs-airport-preference-property.sql`

迁移内容：

1. 插入或更新 `property_code = 168` 的 `pbs_bid_property`。
2. 将 `101 / 104 / 119 / 123` 设置为不可见：
   - `is_visible_in_portal = 0`
   - `recommended_order = null`
   - `recommended_usage_count = null`
3. 清理旧数据。

清理原则：

- 不做旧数据兼容。
- 不把旧数据迁成新 `Airport Preference`。
- 凡是 Pairing rule 主条件或附加条件涉及 `101 / 104 / 119 / 123`，整条 rule 删除，避免只删 AND 条件后规则变宽。

建议清理范围：

- `pbs_bid_pairing_configured_favorite` 中 `property_code in (101,104,119,123)`。
- `pbs_bid_pairing_favorite` 中 `property_code in (101,104,119,123)`。
- `pbs_bid_group` 中：
  - 主条件 `property_id in (101,104,119,123)`；这里的 `property_id` 是 legacy property code，稳定定义 id 在 `property_definition_id`。
  - 同一 `group_id` 的 `pbs_bid_condition.property_id in (101,104,119,123)`；这里同样是 legacy property code。
- 对上述命中的 `bid_id + bid_type + property_group_key`，删除对应所有 tier 的 `pbs_bid_group` 行。
- 删除这些 group 关联的 `pbs_bid_condition` 行。
- 删除后按需要重算同一 bid/tier 下 `group_seq` 与 `rowSeq`，或确认现有读取逻辑不要求连续序号。

迁移必须在删除前输出 / 可查询 counts：

- 待隐藏 property 数。
- 待删除 configured favorites 数。
- 待删除 simple favorites 数。
- 待删除 rule group 数。
- 受影响 bid 数。

## Seed / Contract 同步

需要同步更新：

- `sql/seed/10-pbs-bid-property.sql`
- `packages/contracts/pbs-pairing-bids.js`
- `packages/contracts/pbs-pairing-bids.d.ts`

Seed 要求：

- `168 Airport Preference` 幂等插入 / 更新。
- `101 / 104 / 119 / 123` 默认 `is_visible_in_portal = 0`。
- Pairing 推荐列表不再包含旧 `101`。
- 推荐列表可考虑：
  - `102 Pairing Number`
  - `168 Airport Preference`
  - `106 Departure Date / Day`
  - `103 Pairing Check-In Time`

最终推荐顺序可在实现前再确认；本 spec 建议 `Airport Preference` 替代旧 `Any Landing In Airport` 的推荐位置。

## 前端改动设计

主要文件区域：

- `pbs-portal/src/features/pairing/types.ts`
- `pbs-portal/src/features/pairing/pairing-property-catalog.ts`
- `pbs-portal/src/features/pairing/pairing-draft-mappers.ts`
- `pbs-portal/src/features/pairing/components/pairing-bid-control.tsx`
- 新增本地组件：`pairing-airport-preference-control.tsx`
- `pbs-portal/src/features/pairing/pairing-bid-summary.ts`
- `pbs-portal/src/features/pairing/pairing-existing-bid-summary.ts`
- `pbs-portal/src/features/pairing/pairing-rule-condition-summary.tsx`

UI 原则：

- 不改 `Configure Pairing Bid` 的整体布局。
- 不新增右侧 preview panel。
- 不使用卡片式大 redesign。
- 复用现有按钮、输入框、date picker、duration input、airport autocomplete 风格。
- 新增折叠项应轻量，和现有 Date / Day 控件视觉一致。

## 后端改动设计

主要文件区域：

- `pbs-server/src/services/pairing/pairing-property-validation.ts`
- `pbs-server/src/services/pairing/pairing-bid-normalization.ts`
- `pbs-server/src/services/lineholder/rule-bid-serialize.ts`
- `pbs-server/src/services/lineholder/rule-bid-value.ts`
- `pbs-server/src/services/lineholder/rule-bid-clone.ts`
- `pbs-server/src/services/lineholder/rule-bid-format.ts`
- `pbs-server/src/services/pairing-search/pairing-search-detail-conditions.ts`
- `pbs-server/src/services/algorithm-export/pairing-score-export.ts`

行为要求：

- add / patch / favorite 保存时校验 `airport-preference` payload。
- preview / current rules count 能正确生成 SQL。
- algorithm export 能用新 property 计算 matching pairings。
- 旧 `101 / 104 / 119 / 123` 在 catalog 不可见后不应被新增；如果 API 手动提交这些 property code，因 catalog 不返回或 migration 清理，第一版可返回 unsupported / validation error。

## 数据与安全

- 不新增依赖。
- 不记录机场偏好 payload 到前端 console。
- 不改变认证和权限。
- SQL 使用参数化，不拼接用户输入。
- `airports` 进入 SQL 前统一 trim / uppercase / 去重。
- date / duration / count 必须服务端校验。

## 性能

`Airport Preference` preview 会增加一个聚合子查询或 `exists` 子查询。风险点：

- `matchingCount` 需要 `count(*)`，比单纯 `exists` 更重。
- `layoverDuration` 与 date condition 组合时会在 `pairing_segment` 上过滤。

控制方式：

- 无 `matchingCount` 时优先用 `exists`。
- 有 `matchingCount` 时才计算 count。
- 复用现有 `pairing_segment.pairing_id` 过滤模式。
- 不在首屏加载时主动计算；只在用户 preview / count / export 时计算。

## 测试计划

### pbs-server 单元 / 集成测试

新增或更新：

- `pbs-server/src/services/pairing/pairing-property-validation.test.ts`
- `pbs-server/src/routes/pairing-bids.test.ts`
- `pbs-server/src/services/pairing-search/pairing-search-condition-builder.test.ts`
- `pbs-server/src/services/algorithm-export/pairing-score-export.test.ts`

覆盖：

1. `Airport Preference` landing airport 保存成功。
2. `Airport Preference` layover airport 保存成功。
3. layover + date range + matching count 保存成功。
4. layover + duration 保存成功。
5. landing + layover duration 被拒绝。
6. date range end < start 被拒绝。
7. matching count `Between` 缺 from/to 被拒绝。
8. preview SQL 参数化生成，不拼接 airport 输入。
9. algorithm export 能根据新 property 找到 matching pairings。
10. 旧 `101 / 104 / 119 / 123` 不再出现在 visible catalog。

### pbs-portal 单元测试

新增或更新：

- `pbs-portal/src/features/pairing/components/pairing-bid-control.test.tsx`
- `pbs-portal/src/features/pairing/pairing-property-catalog.test.ts`
- `pbs-portal/src/features/pairing/pairing-draft-mappers.test.ts`
- `pbs-portal/src/features/pairing/pairing-existing-bid-summary.test.ts`

覆盖：

1. `Airport Preference` 控件显示 `Landing / Layover` 下拉和机场输入。
2. `Date Condition` 展开后只显示所选 Time Type 的控件。
3. 切换 `Specific Date / Day / Date Range` 会清空其他类型的临时值。
4. `Matching Count` 折叠摘要显示正确。
5. `Layover Duration` 仅在 `Layover` 下显示 / 可用。
6. `Landing` 时切换会清空 layover duration。
7. summary 能表达 `Award · Layover YYZ · Date Range Jun 15-Jun 21 · Count > 1`。

### Playwright E2E

新增或更新：

`e2e/tests/pbs-portal/airport-preference.spec.ts`

建议覆盖：

1. 登录 PBS Portal，进入 Pairing。
2. `ADD PAIRING PROPERTIES -> ALL PROPERTIES` 中能看到 `Airport Preference`。
3. 不再看到 `Any Landing In Airport`、`Any/Every Layover In Airport`、`Any/Every Layover Duration`、`Any/Every Layover On Date / Day`。
4. 打开 `Airport Preference`。
5. 选择 `Layover`，输入 / 选择 `YYZ`。
6. 展开 `Date Condition`，选择 `Date Range`，填 `2026-06-15` 到 `2026-06-21`。
7. 展开 `Matching Count`，选择 `>`，填 `1`。
8. 选择一个 tier，保存。
9. Existing 中出现 `Airport Preference`，summary 可读。
10. 刷新页面后数据仍存在且可编辑。

### QA 人工测试用例

新增：

`docs/test-cases/pbs/pairing/2026-07-08-airport-preference.md`

内容覆盖：

- 新入口显示。
- 旧四个入口不显示。
- Landing 基础保存。
- Layover + date range + matching count 保存。
- Layover duration。
- Landing 下不允许 duration。
- Favorite 保存与复用。
- Search Pairings preview / current rules count。

## 验收标准

- `Airport Preference` 出现在 Pairing `ALL PROPERTIES`。
- `101 / 104 / 119 / 123` 不再出现在新增列表和推荐列表。
- 旧数据按 migration 清理，不在 Existing / Favorites 中残留。
- 用户可以配置 `Layover + YYZ + Date Range 15-21 + Matching Count > 1`。
- `Date Condition` 一次只能选择一种 Time Type。
- `Layover Duration` 只对 Layover 可用。
- 保存、刷新、编辑、favorite 复用均正常。
- preview / current rules count / algorithm export 均支持新 condition。
- 前端 UI 保持现有 Pairing bid 弹窗风格。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本任务同时改 contract、SQL migration、Portal 控件、后端 validation / search / export 和测试，契约耦合强；拆分会增加集成风险。
- Suggested split: 不建议拆分。若后续必须拆，可按“后端 contract/search/export”和“前端控件/E2E”分，但需先冻结 payload。
- Write boundaries: 单 agent 负责端到端，避免多个 agent 同时修改 `packages/contracts/pbs-pairing-bids.*` 和 Pairing 控件。
- Conflict risk: 高。`PairingBidValue` union、summary、preview、algorithm export 都依赖同一 payload。
- Execution gate: 用户 review 本 spec 并明确批准后，才进入 implementation plan 和代码改动；实现前需对将修改的核心 symbol 做 GitNexus impact analysis。
