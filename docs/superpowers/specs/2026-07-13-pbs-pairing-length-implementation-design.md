# PBS Pairing Length 产品实现设计

日期：2026-07-13
状态：待用户确认后实施

## 1. 目标

将 Jen 文档中的 `Pairing Length` 落入 PBS Portal 正式产品，实现一个面向机组的 Pairing 条件编辑器：

- 按 pairing 持续天数表达 `Award / Avoid`。
- 支持 `Min days`、`Max days`。
- 支持可选 `Limit to Pairing Start Date` 日期范围。
- 视觉与交互对齐已经验收的 Pairing 条件 UI，而不是继续使用通用 operator + stepper 行内控件。

Jen 文档依据来自 `init-docs/Bidding Options V1(2).xlsx`，`Sheet1` 第 9 行：

| 字段 | 内容 |
| --- | --- |
| Final Bid Option | `Pairing Length` |
| Purpose | `Crew bids for pairing duration by number of days.` |
| Required Fields / Inputs | `Min days, max days, date range, award/avoid` |
| Rules / Defaults | `Add date range.` |
| Notes for Developers | `Keep.` |

## 2. 已确认业务语义

- 继续使用可见旧库 property `112 Pairing Length` 作为唯一产品入口。
- 不新建用户可见 property，不把隐藏 AA property `132 Prefer Pairing Length on Date` 暴露出来。
- `Pairing Length` 判断对象是整个 pairing 的持续天数，对应现有 SQL 字段 `p.duration_days`。
- `Min days` / `Max days` 是闭区间语义：
  - 只填 `Min days = 3`：pairing length >= 3。
  - 只填 `Max days = 3`：pairing length <= 3。
  - 同时填 `Min days = 1`、`Max days = 3`：pairing length between 1 and 3，包含 1 和 3。
- `Limit to Pairing Start Date` 默认关闭；打开后按 pairing start date 判断，start date 落在 From / To 闭区间内才命中。
- 例如：`Award + T1 + Min 1 + Max 3 + From Jun 3, 2026 + To Jun 18, 2026` 表示在 T1 优先分配 1 至 3 天长度、且开始日期在 2026-06-03 到 2026-06-18 之间的 pairings。

## 3. 现状与约束

### 3.1 当前可复用能力

- `packages/contracts/pbs-pairing-bids.js` 已有 `propertyCode=112`，名称为 `Pairing Length`，当前 default bid 是 `stepper`。
- `pbs-server/src/services/pairing-search/pairing-search-core-conditions.ts` 已对 `112 / 131` 使用 `p.duration_days` 构造 SQL。
- `propertyCode=132` 当前是隐藏 AA-style `Prefer Pairing Length on Date`，支持 `stepper-date` / `stepper-range-date`，但它是“某一天落在 pairing span 内 + length 条件”，不是本轮确认的“pairing start date range”。
- Portal 已有 `PbsDialogFrame`、`TierToggleGroup`、`AwardAvoidSegmentedControl`、`PairingPropertyDialogFooter` 和 `PbsDatePicker`，并已被 `Pairing Preference`、`Airport Preference`、`Pairing Check-In / Check-Out Time`、`Work Day Preference` 使用。

### 3.2 不适合直接沿用的旧结构

旧通用 `stepper` operator 是 `= / < / > / Between`：

- `>` / `<` 是严格比较，不等同于 Jen 文档的 `Min days` / `Max days` 闭区间。
- 通用 `stepper-range` 只能表达长度范围，不能表达 start date range。
- `stepper-date-range` 只有单一 `value + from/to`，适合 Long Stretch 类“连续 N 天 + 日期窗口”，不适合 Pairing Length 的 Min / Max。
- `stepper-range-date` 是一个 specific date，不是 date range。

因此正式实现需要为 `112` 新增专用 bid shape / editor，而不是继续用通用 operator shell。

## 4. 方案对比

### 方案 A：继续使用通用 `stepper` / `stepper-range`

优点：改动最少，现有 SQL 可继续使用。

缺点：无法表达 Jen 的 date range；`Min days` / `Max days` 也会被迫映射到严格 `>` / `<`，容易产生业务误解。

结论：不采用。

### 方案 B：直接展示 / 复用隐藏 `132 Prefer Pairing Length on Date`

优点：已有部分 date + length SQL。

缺点：`132` 是隐藏 AA property，产品不应新增第二个 Pairing Length 入口；且当前 `132` 是 specific date 命中 pairing span，不是本轮确认的 pairing start date range。

结论：不采用。

### 方案 C：扩展 `112` 为专用 Pairing Length editor 与专用 bid shape

新增只供 `112` 使用的专用编辑器和 bid shape，继续保留旧 `stepper` / `stepper-range` 的读取和搜索兼容。新 UI 保存时写入新 shape；旧数据打开时尽量转换到新 UI 表达。

优点：符合 Jen 文档、符合已验收 UI 基线、语义清晰，且不会暴露隐藏 property。

结论：采用。

## 5. 正式 payload 设计

为 `propertyCode=112` 新增专用 bid shape：

```json
{
  "type": "pairing-length-preference",
  "minDays": 1,
  "maxDays": 3,
  "dateScope": {
    "mode": "date_range",
    "from": "2026-06-03",
    "to": "2026-06-18"
  },
  "min": 1,
  "max": 7
}
```

字段语义：

- `minDays`: 正整数或 `null`；表示 inclusive lower bound。
- `maxDays`: 正整数或 `null`；表示 inclusive upper bound。
- 至少一个 of `minDays` / `maxDays` 必填。
- 同时存在时必须 `minDays <= maxDays`。
- `dateScope`: `null` 或 `{ mode: "date_range", from, to }`。
- `dateScope=null` 表示不限 pairing start date。
- `from` / `to` 必须是 ISO date，且 `from <= to`。
- `min/max` 是 UI / validation range 元数据，默认 `1..7`，不参与搜索语义。

### 5.1 旧数据兼容

后端和前端继续接受已有 `112` 的 legacy shapes：

- `stepper` with `operator="="`：编辑时回填为 `minDays=value`、`maxDays=value`。
- `stepper-range`：编辑时回填为 `minDays=from`、`maxDays=to`。
- `stepper` with `operator=">"`：由于旧语义是严格大于，编辑时可显示为 `minDays=value+1`。
- `stepper` with `operator="<"`：由于旧语义是严格小于，编辑时可显示为 `maxDays=value-1`，若结果小于 1，则视为不可完成并要求用户重新填写。

保存新 UI 后，统一写入 `pairing-length-preference`，不再写回 legacy `stepper`。

## 6. Portal 行为与视觉

新增 `PairingLengthEditor`，只在 `PairingPropertyConfigDialog` 中为 `propertyCode=112` 分支渲染。

正式 UI 必须复用前面已验收的 Pairing 条件基线：

- `PbsDialogFrame`
- `TierToggleGroup`
- `AwardAvoidSegmentedControl`
- `PairingPropertyDialogFooter`
- `PbsDatePicker`

弹窗标题：`Configure Pairing Length`。

字段顺序：

1. `TIERS · REQUIRED`
2. `PREFERENCE`: `Award | Avoid`
3. `PAIRING LENGTH · REQUIRED`
   - `Min days`
   - `Max days`
4. `LIMIT TO PAIRING START DATE`
   - 开关默认关闭。
   - 关闭时不显示 From / To，提交 `dateScope=null`。
   - 打开时显示 From / To date range，使用和 `Prefer Off`、`Long Stretch Off / Compressed Flying`、`Pairing Preference`、`Airport Preference`、`Pairing Check-In / Check-Out Time` 一致的日期选择方式。
5. footer：`CANCEL | SAVE FAVORITE | ADD BID`

默认新增状态：

- Tier 全部未选。
- `Award` 默认。
- `Min days` / `Max days` 为空。
- date range 开关关闭。
- footer 主操作禁用。

不显示：

- 技术 operator。
- `RULE PREVIEW`。
- 实时自然语言结果句。
- payload/debug 文案。
- 浏览器原生 `input[type=date]`。

## 7. 后端与 SQL

`pairing-search-core-conditions` 对 `propertyCode=112` 增加 `pairing-length-preference` 分支：

```sql
p.duration_days >= :minDays
p.duration_days <= :maxDays
```

当 `dateScope` 存在时追加：

```sql
(p.sch_str_dt_utc at time zone 'UTC')::date between :from::date and :to::date
```

说明：

- 本轮使用当前 Pairing Search 已有的 pairing start date SQL 基准；如实现时发现模块已有更权威的 start-date helper，应复用该 helper，但结果必须仍表达“pairing start date 落在 From / To 内”。
- `112` legacy `stepper` / `stepper-range` 搜索逻辑继续保留，避免历史草稿、favorite 或导入数据失效。
- `132` 逻辑不删除、不重写；它仍作为隐藏 AA property 保留，但不作为 Portal 可见入口。

## 8. 数据、seed 与 migration

- `packages/contracts/pbs-pairing-bids.js`：将 `112` default bid 调整为 `pairing-length-preference`，名称仍为 `Pairing Length`，actions 仍为 `award/avoid`。
- `sql/seed/10-pbs-bid-property.sql`：将 `112` 的 `value_schema` 更新为专用结构，例如 `{"type":"pairing_length_preference","label":"Days","min":1,"max":7,"dateScope":true}`，tooltip 更新为包含 date range 的描述。
- 新增幂等 migration 更新 F8 `pbs_bid_property` 中 `112` 的 `value_schema` / tooltip；不修改已保存 bids。
- 不执行远端 migration，除非用户单独授权。

## 9. 测试与 QA

### 9.1 Portal Vitest

1. Catalog / draft：`112` 新增时使用 `pairing-length-preference`，Min/Max 为空，date range 关闭，Award 默认，Tier 空选，footer 禁用。
2. `PairingPropertyConfigDialog`：`112` 走 `PairingLengthEditor`，不显示通用 operator select。
3. `PairingLengthEditor`：
   - 只填 Min 时完成。
   - 只填 Max 时完成。
   - Min + Max 合法时完成。
   - Min > Max 时未完成。
   - date range 关闭时不要求日期。
   - date range 打开后 From / To 必填且顺序合法。
4. 编辑回填：
   - 新 shape 完整回填。
   - legacy `stepper` / `stepper-range` 尽量回填为 Min/Max。
5. 其他 `stepper` property 仍走通用控件，不受影响。

### 9.2 pbs-server / contracts Vitest

1. Validation 接受 `112 pairing-length-preference`。
2. Validation 拒绝：
   - Min/Max 都为空。
   - 非正整数。
   - `minDays > maxDays`。
   - date range 缺一端。
   - date range 反向。
3. Search SQL：
   - Min only -> `p.duration_days >= $1`。
   - Max only -> `p.duration_days <= $1`。
   - Min + Max -> 同时包含 `>=` 和 `<=` 或等价 closed range。
   - Min/Max + dateScope -> 同时包含 duration_days 条件和 pairing start date between。
4. Legacy `112 stepper` / `stepper-range` 仍能通过 validation 与 search。
5. `132` 原有 SQL 回归不变。

### 9.3 Playwright E2E

通过真实 PBS Portal Pairing 页面操作，不直接调用保存 API：

1. 打开 `Pairing Length`，验证默认 Award、Tier 空、Min/Max 空、date range 关闭、footer 禁用。
2. 选择 Tier + Min/Max，保存 bid，再编辑回显。
3. 打开 date range，选择 From / To，保存 bid，再编辑回显。
4. 验证 `SAVE FAVORITE` 路径：保存 favorite 后重新打开，Min/Max、date range 和 action 完整回填。
5. 验证通用 stepper 条件仍可正常打开，避免 `112` 专用化影响其他 property。

### 9.4 手工 QA

新增 `docs/test-cases/pbs/pairing/<date>-pairing-length.md`，覆盖：

- Min only。
- Max only。
- Min + Max。
- date range off。
- date range on。
- date range 不完整 / 反向。
- 保存、favorite、编辑回显。
- 旧 Pairing Length bid 的回填兼容。

## 10. 验证命令

```bash
cd pbs-portal && npx vitest run <pairing-length-related-tests>
cd pbs-server && npm test -- <pairing-length-related-tests>
cd e2e && npx playwright test --config=config/playwright.config.ts --project=pbs-portal --no-deps <pairing-length-test> --reporter=list
cd pbs-portal && npm run build
npm run check:ui
git diff --check
```

## 11. 非目标

- 不展示 `132 Prefer Pairing Length on Date`。
- 不删除或重写 `132` 的隐藏 AA 能力。
- 不改变 `108 Total Legs In Pairing`、`107 Flight Legs per Duty`、`113 TAFB`。
- 不把 date range 改为 pairing span overlap。
- 不新增 rule preview、解释卡片或实时自然语言句。
- 不执行远端 migration。

## 12. Multi-Agent Parallelism Assessment

- Recommendation: Yes。
- Rationale: 前端专用 editor、后端 contract/SQL validation、E2E/QA 可以拆成清晰边界；但要等当前 Work Day Preference 实施线程完成或合并后再动同一区域，避免冲突。
- Suggested split:
  - Agent A：`pbs-portal/**`，实现 `PairingLengthEditor`、dialog 分支、Portal tests。
  - Agent B：`packages/contracts/**`、`pbs-server/**`、`sql/**`，实现 bid shape、validation、SQL、seed/migration、server tests。
  - 主 agent：E2E、QA 文档、整合冲突、UI gate、最终验证。
- Write boundaries: Agent A 不改 server/contracts/sql；Agent B 不改 Portal UI；主 agent 只做整合和测试。
- Conflict risk: Medium。`PairingPropertyConfigDialog`、contracts 和当前 Work Day Preference 实施可能有重叠，必须先检查最新工作树并避免覆盖未提交改动。
- Execution gate: 用户审阅并确认本 spec 后，才开始实施；远端 migration 另需单独授权。
