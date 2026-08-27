# PBS Preference Condition 行为统一标准设计

## 背景

PBS Portal 近期新增或改造了以下 bid condition：

- Prefer Off
- Long Stretch Off / Compressed Flying
- Pairing Preference
- Airport Preference
- Pairing Check-In / Check-Out Time
- Flight Legs per Duty
- Work Day Preference
- Pairing Length

这些条件已经复用了部分底层组件，例如 `PbsDialogFrame`、`TierToggleGroup`、`AwardAvoidSegmentedControl`、`PbsDatePicker`、`PbsInputNumber` 和 `PairingPropertyDialogFooter`。但各 editor 的内部行为仍存在差异：默认值、optional switch 展开、隐藏字段清理、date range 有效性、footer disabled、favorite 保存和编辑回显规则没有形成统一契约。

本设计目标是制定一套可执行的行为标准，并把上述 8 组新条件逐步迁移到同一套交互、校验和回显规则下，避免后续新增条件继续出现“每个条件一套做法”的问题。

`Month-End Carryover` 是后续新增条件，不属于本设计最初 8 组迁移范围；它复用本文的 `Numeric Comparison` UI 标准，但其 payload、server validation、SQL search 和 property rename 以独立 Month-End Carryover spec 为准。

## 目标

1. 为 8 组新条件建立统一的 behavior contract。
2. 保留每个条件的业务字段和 payload 语义，不为了统一 UI 改变业务规则。
3. 统一默认态、可选限制、mode 切换、校验、footer 行为、favorite 行为和编辑回显。
4. 将已存在的视觉 primitives 作为后续 UI 收敛的基础：
   - `PreferenceConditionSection`
   - `PreferenceSectionTitle`
   - `PreferenceInlineSwitch`
   - `PreferenceNumberRange`
   - `PreferenceComparisonValueControl`
5. 明确分批迁移策略和测试验收标准。

## 非目标

- 不做通用 form engine 或 schema-driven form。
- 不一次性重写所有 editor 的业务逻辑。
- 对上述 8 组迁移条件，不改变 server validation、SQL search、数据库 schema 或 bid property code。
- 不引入新的 UI 依赖。
- 不把 Portal 员工端业务弹窗迁移到 `AppDialog` 后台工具风格。
- 不新增解释性文案、rule preview 或技术 operator，除非产品文档明确要求。
- 数字比较类条件例外：当用户必须选择 `<` / `=` / `>` / `Between` 作为规则本身时，统一用符号下拉展示，不用长文案按钮。

## 推荐方案

采用“行为标准 + 轻量视觉 primitives 统一”的方案。

每个 condition 继续保留自己的 feature editor，因为这些条件的业务字段差异很大：Prefer Off 有多日期、星期、time window 和 fulfilment；Airport Preference 有 airport/city/event/layover；Check-In / Check-Out Time 有时间类型和比较逻辑；Work Day Preference 有 weekday 与日期范围；Pairing Length 有 min/max days 和 optional pairing start date range。

因此不抽象成一个大型通用表单引擎，只统一这些稳定横切行为：

- dialog shell
- tier selection
- segmented mode control
- optional switch
- date/date range
- numeric range
- footer validity
- payload clearing
- favorite/edit/search rehydration
- accessibility 和测试断言

## 适用范围

本标准覆盖以下条件：

| 条件 | 模块 | 迁移原则 |
| --- | --- | --- |
| Prefer Off | Days Off | 保留复杂业务模式，统一 section、switch、footer validity 和隐藏字段清理 |
| Long Stretch Off / Compressed Flying | Days Off | 统一 number、date range、preference 和 optional range 行为 |
| Pairing Preference | Pairing / Search Pairings | 统一 action、date limit、quantity 和 editor validity |
| Airport Preference | Pairing / Search Pairings | 统一 action、location、event/date/layover optional 规则 |
| Pairing Check-In / Check-Out Time | Pairing / Search Pairings | 统一 time type、operator、date scope 和回显 |
| Flight Legs per Duty | Pairing / Search Pairings | 统一 preference、符号 operator select、value 和 validity |
| Work Day Preference | Pairing / Search Pairings | 统一 mode、weekday/date range 和隐藏字段清理 |
| Pairing Length | Pairing / Search Pairings | 作为当前标准样本，保持并补齐行为标准断言 |

## 字段级契约矩阵

### Prefer Off

| 字段 | 默认值 | 必填 / 可选 | 保存规则 | 回显规则 |
| --- | --- | --- | --- | --- |
| `tiers` | 新增为空 | 必填 | 至少一个 active tier，否则 footer disabled | 从 existing/favorite payload 回显 |
| selectable mode | 新增 `specific_dates` | 必填 | 只保存当前 mode 对应的 date/weekend values | 根据 tag-list 解析为 `specific_dates` / `date_range` / `days_of_week` / `weekends` |
| `specificDates` | `[]` | mode 为 `specific_dates` 时必填 | 保存 ISO date tag list | 回显所有 ISO date values |
| `rangeFrom/rangeTo` | `"" / ""` | mode 为 `date_range` 时必填 | 保存 `Between from - to` | 回显 parsed range |
| `weekdays` | `[]` | mode 为 `days_of_week` 时必填 | 保存 weekday tags | 回显 parsed weekdays |
| weekends | off | mode 为 `weekends` 时有效 | 保存 `Weekends` | 解析到 `weekends` mode |
| time window | disabled；默认草稿 `18:00-23:59` | 可选 | enabled 且 from/to 合法时保存 `Window from-to` | 现有 Window tag 打开 switch 并回显 from/to |
| fulfilment | `all` | 可选 | `all` 保存 all-or-nothing；`flexible` 保存 `minimumN/maximumN` | `allOrNothing=false` 或 min/max 存在时回显 flexible |

Prefer Off 的 required invalid 不能被清理后提交；例如当前 mode 没有任何日期、weekday 或 weekend 值时，footer 必须 disabled。

### Long Stretch Off / Compressed Flying

| 字段 | 默认值 | 必填 / 可选 | 保存规则 | 回显规则 |
| --- | --- | --- | --- | --- |
| `tiers` | 新增为空 | 必填 | 至少一个 active tier，否则 footer disabled | 从 existing/favorite payload 回显 |
| `action` | `award` | 必填 | 保存 `award` / `avoid` | existing `avoid` 回显 Avoid，否则 Award |
| minimum consecutive days off | property bid 的 `value` | 必填 | 保存 `stepper-date-range.value`，且在 min/max 内 | 回显现有 value |
| date range limit | whole-month 视为关闭 | 可选 | 关闭时保存当前 bid period 的 whole-month `from/to`；开启时保存用户选定 range | 非 whole-month range 回显为开启 |

Long Stretch limited range 的有效性：`from/to` 必须为当前 bid period 内的完整 ISO range，`from <= to`，且 inclusive range 天数必须大于等于 minimum consecutive days off 的 `value`。

### Pairing Preference

| 字段 | 默认值 | 必填 / 可选 | 保存规则 | 回显规则 |
| --- | --- | --- | --- | --- |
| `tiers` | 新增为空 | 必填 | 至少一个 active tier，否则 footer disabled | 从 existing/favorite/search criteria 回显 |
| `action` | `award` | 必填 | 保存 action | 回显 payload action |
| `pairingIds/pairingLabels` | `[]` | 必填 | 至少一个 pairing id；labels 仅作为展示辅助 | 支持 `pairing-preference`、旧 `pairing-id-list`、`pairing-occurrence-list` 转换回显 |
| run date limit | disabled | 可选 | disabled 保存 `dateScope: null` | `dateScope` 存在时开启 |
| specific run date | `""` | date limit + specific mode 时必填 | 保存 `{ mode: "specific_date", date }` | 回显 saved date |
| run date range | `"" / ""` | date limit + range mode 时必填 | 保存 `{ mode: "date_range", from, to }` | 回显 saved range |
| fulfilment min/max | matching runs >= 2 时显示 | 条件必填 | 非 single run 时至少填 min 或 max；`min <= max`，且不能超过 matching run count | 回显 existing min/max；single matching run 自动规范为 `1/1` |

Pairing Preference 必须显式通过 `onValidityChange` 报告 validity，外层 footer 不再只根据 bid shape 推断。

### Airport Preference

| 字段 | 默认值 | 必填 / 可选 | 保存规则 | 回显规则 |
| --- | --- | --- | --- | --- |
| `tiers` | 新增为空 | 必填 | 至少一个 active tier，否则 footer disabled | 从 existing/favorite/search criteria 回显 |
| `action` | `award` | 必填 | 保存 action | 回显 payload action |
| event | `landing` | 必填 | 保存 `landing` / `layover` / `landing_or_layover` | 回显 saved event |
| locations | `[]` | 必填 | 至少一个 airport/city；event 切换后清理不支持的 location | 回显 saved locations |
| event date limit | disabled | 可选 | disabled 保存 `dateScope: null` | `dateScope` 存在时开启 |
| event specific dates | `[]` | date limit + specific mode 时必填 | 保存 `{ mode: "specific_dates", dates }` | 回显 saved dates |
| event date range | `"" / ""` | date limit + range mode 时必填 | 保存 `{ mode: "date_range", from, to }` | 回显 saved range |
| minimum layover duration | disabled | event 为 `layover` / `landing_or_layover` 时可选 | disabled 保存 `null`；enabled 保存合法 duration string | payload 存在时开启并回显 |
| fulfilment min/max | disabled | 可选 | flexible 时保存 min/max；all matching 时保存 `null/null` | min/max 任一存在时回显 flexible |

Airport Preference 迁移后必须显式报告 validity：locations 为空、enabled date scope 不完整、layover duration 非法、flexible min/max 非法时 footer disabled。

### Pairing Check-In / Check-Out Time

| 字段 | 默认值 | 必填 / 可选 | 保存规则 | 回显规则 |
| --- | --- | --- | --- | --- |
| `tiers` | 新增为空 | 必填 | 至少一个 active tier，否则 footer disabled | 从 existing/favorite/search criteria 回显 |
| `action` | `award` | 必填 | 保存 action | 回显 payload action |
| time type | `check_in` | 必填 | 保存 `check_in` / `check_out` | 回显 saved timeType |
| operator | `Between` | 必填 | 保存 `Between` 或 `=` / `<` / `>` | 回显 saved operator |
| time value | `""` | 必填 | `Between` 保存 from/to；其他 operator 保存 value；均为合法 `HH:mm` | 回显 saved time |
| date mode | `any_date` | 可选 | `any_date` 保存 `dateScope: null` | `dateScope` 为空回显 Any date |
| specific date | `""` | specific mode 时必填 | 保存 `{ mode: "specific_date", date }` | 回显 saved date |
| date range | `"" / ""` | range mode 时必填 | 保存 `{ mode: "date_range", from, to }` | 回显 saved range |

Pairing Check-In / Check-Out Time 迁移后必须显式报告 validity：time 缺失、range 不完整、date scope 不完整时 footer disabled。

### Flight Legs per Duty

| 字段 | 默认值 | 必填 / 可选 | 保存规则 | 回显规则 |
| --- | --- | --- | --- | --- |
| `tiers` | 新增为空 | 必填 | 至少一个 active tier，否则 footer disabled | 从 existing/favorite/search criteria 回显 |
| `action` | `award` | 必填 | 保存 action | 回显 payload action |
| quantifier | `any` | 必填 | 保存 `any` / `every` | 回显 payload quantifier |
| operator | catalog/operator 默认或用户选择 | 必填 | 保存 `=` / `<` / `>` | 回显 saved operator |
| legs value | 新增为空 | 必填 | 保存 safe integer，且在 bid min/max 内 | existing/search criteria 回显 saved value |

Flight Legs 的 required invalid 由 editor 显式 `onValidityChange` 控制；空值或超范围时 footer disabled。operator/value UI 使用统一数字比较控件：左侧 select 显示 `<` / `=` / `>`，右侧 number input 显示 `Enter legs` 和 `legs` suffix。

### Work Day Preference

| 字段 | 默认值 | 必填 / 可选 | 保存规则 | 回显规则 |
| --- | --- | --- | --- | --- |
| `tiers` | 新增为空 | 必填 | 至少一个 active tier，否则 footer disabled | 从 existing/favorite/search criteria 回显 |
| quantifier | `any` | 必填 | 保存 `any` / `every` | 回显 payload quantifier |
| mode | existing `date-range` 则 range，否则 specific dates/weekdays | 必填 | 只保存当前 mode 的 bid type | 按 bid type 回显 mode |
| specific dates | `[]` | specific mode 下与 weekdays 二选一至少有一个 | 保存 `date-or-dow-list.dates` | 回显 saved dates |
| weekdays | `[]` | specific mode 下与 dates 二选一至少有一个 | 保存 `date-or-dow-list.daysOfWeek` | 回显 saved weekdays |
| date range | `"" / ""` | range mode 时必填 | 保存 `date-range.from/to` | 回显 saved range |

Work Day Preference 迁移后必须显式报告 validity：specific mode 下 dates 和 weekdays 都为空、range mode 不完整时 footer disabled。mode 切换必须继续清理旧 draft 字段。

### Pairing Length

| 字段 | 默认值 | 必填 / 可选 | 保存规则 | 回显规则 |
| --- | --- | --- | --- | --- |
| `tiers` | 新增为空 | 必填 | 至少一个 active tier，否则 footer disabled | 从 existing/favorite/search criteria 回显 |
| `action` | `award` | 必填 | 保存 action | 回显 payload action |
| min days | 空 | 与 max days 至少填一个 | 保存 safe integer 或 `null` | 回显 saved `minDays` |
| max days | 空 | 与 min days 至少填一个 | 保存 safe integer 或 `null` | 回显 saved `maxDays` |
| pairing start date limit | disabled | 可选 | disabled 保存 `dateScope: null` | `dateScope` 存在时开启 |
| pairing start date range | `"" / ""` | limit enabled 时必填 | 保存完整 `{ mode: "date_range", from, to }` | 回显 saved range |

Pairing Length 的有效性：至少一个 days 字段存在，days 在 min/max 范围内，`minDays <= maxDays`，date scope 为空或为完整合法 range。

## 统一行为标准

### 1. Dialog Shell

- Pairing 条件使用 `PbsDialogFrame` + `PairingPropertyDialogFooter`。
- Days Off 条件可以暂时保留 Days Off footer，但按钮语义必须与 Pairing footer 一致。
- 弹窗顺序固定为：
  1. title
  2. `TIERS`
  3. condition mode / preference
  4. condition-specific fields
  5. optional limits
  6. footer
- 弹窗标题已经表达 condition 名称时，内部 section 不重复显示同名大标题。例如 Pairing Length 不再显示 `PAIRING LENGTH · REQUIRED`。

### 2. Tiers

- 新增 bid 时 tiers 默认空。
- 编辑已有 bid、favorite 或 search criteria 时按 payload 回显。
- 保存 bid / favorite 时至少选择一个 tier；未选 tier 时 footer disabled。
- `TierToggleGroup` 是唯一标准控件。
- tier 选中态、`aria-pressed` 和保存 payload 必须由同一份 state 派生。

### 3. Segmented Mode

适用于 `Award / Avoid`、`Any / Every`、`Specific Dates / Days of Week / Date Range`、`All or Nothing / Minimum N` 等二选一或多选一模式。

- 模式控件的视觉选中态、`aria-pressed` 和 payload 必须由同一份 state 派生。
- 有明确业务默认值的 mode 可以默认选中，例如 Pairing Length 的 Award/Avoid。
- 没有明确业务默认值的 mode 不为了控件方便而自动猜测默认。
- mode 切换时必须清理不再适用的隐藏字段。
  - 例如从 Date Range 切到 Specific Dates 时，不提交旧 range。
  - 从 Minimum N 切到 All or Nothing 时，不提交旧 min/max。

### 4. Optional Switch

- 默认关闭，除非编辑已有 payload 中该 optional 字段已经存在。
- 开启后只展开必要字段。
- 关闭后保存 payload 不带隐藏字段。
- `PreferenceInlineSwitch` 是标准 switch 视觉和语义控件。
- switch 必须使用 `role="switch"` 和准确的英文 `aria-label` / accessible name。

典型 optional 场景：

- `Limit to date range`
- `Limit to pairing start date`
- `Time Window`
- `Layover duration`
- `Compressed Flying` 子条件

### 5. Date / Date Range

- 所有日期输入统一使用 `PbsDatePicker`。
- 日期必须受当前 bid period 限制。
- 不自动填入今天、bid month 第一天或任意默认日期，除非需求明确指定。
- `Any date` 状态不提交 date payload。
- `Specific date` 必须选择一个有效日期。
- `Date range` 必须选择完整 start/end 才有效。
- date range 使用单一 range picker，不使用两个独立日历入口。
- 编辑已有 bid、favorite 和 search criteria 时必须正确回显。

### 6. Number / Min-Max

- 范围型输入优先使用 `PreferenceNumberRange`。
- 单个 stepper 输入继续使用 `PbsInputNumber`，但 label、spacing 和 required 标记遵守统一视觉标准。
- 空值在初始状态不显示红色错误。
- 用户输入非法值后才展示错误状态。
- `min > max` 时 invalid。
- required number 为空时 footer disabled。
- optional number 关闭时不提交隐藏 number 值。

### 6.1 Numeric Comparison

适用于用户需要明确选择比较符号并输入数字的条件，例如 `Flight Legs per Duty` 和 `Month-End Carryover`。

- 默认使用统一的 `PreferenceComparisonValueControl`。
- 控件布局为左侧 operator select、右侧 number input；select 只显示允许的符号，例如 `<` / `=` / `>` / `Between`。
- `<` / `=` / `>` 的 option 必须提供无障碍语义：`Less than` / `Equal to` / `More than`。
- `Between` 只在业务允许范围时出现；出现时右侧切换为 `From` / `To` 两个 number input。
- 输入框 suffix 固定在右侧，例如 `legs` / `days`。
- placeholder 使用中性的业务输入提示，例如 `Enter legs` 或 `Enter days`；不要用 `1-5` 这类范围提示，除非需求明确要求员工端直接展示硬边界。
- 非 `Between` 时只保存单值；`Between` 时只保存 from/to；切换 operator 必须清理隐藏字段。
- 这个控件不替代日期、weekday、time 或业务 mode 选择；这些仍然使用各自标准控件。

### 7. Time

- 时间输入统一使用 24 小时 `HH:mm`。
- 不完整或非法时间不进入 payload。
- `from > to` 的处理必须按具体业务要求定义；若无跨午夜语义，则视为 invalid。
- 关闭 time window 后不提交旧 time values。
- 编辑已有 bid 时完整回显 time window enabled、from 和 to。

### 8. Footer

- `Cancel`：关闭弹窗，不保存，不修改外部 draft。
- `Save Favorite`：使用同一份 editor validity；invalid 时 disabled。
- `Add Bid` / `Update Bid`：使用同一份 editor validity；invalid 时 disabled。
- pending 时禁用 `Save Favorite` 和 `Add/Update Bid`，防止重复提交。
- `Add Bid` 和 `Save Favorite` 不允许使用两套不同校验。
- footer disabled 由统一条件组成：
  - tiers valid
  - editor valid
  - no pending submit
  - no required hidden/visible field invalid

### 9. Payload 清理

每个 editor 输出 payload 前必须做 normalization：

- trim 字符串。
- 删除 disabled optional 字段。
- 删除当前 mode 不再适用的字段。
- 对 hidden / disabled optional 字段，空数组、空字符串、非法日期和非法 number 不进入 payload。
- 对当前可见且 required 的字段，非法值不能被 normalization 静默删除后继续提交；必须让 editor validity 为 false，并让 footer disabled。
- 输出 payload 不依赖 UI 文案。
- 不保留旧模式残留字段来“方便下次切回来”；可在内部 state 保留草稿，但保存 payload 必须干净。

### 10. 回显和复用路径

- 新增 bid、编辑 existing bid、保存/加载 favorite、Search Pairings criteria 编辑必须尽量复用同一 editor 和 mapper。
- 同一个 property 不允许 Pairing 页面和 Search Pairings 页面分别解释 payload。
- 旧数据或导入数据需要兼容时，兼容逻辑放在 mapper / value factory 中，不散落在 UI handler 里。
- 回显优先保留用户已保存的 business intent，而不是按当前默认值重算。

### 11. Accessibility

- 所有可点击项使用语义化 `button`。
- segmented option 提供 `aria-pressed`。
- switch 提供 `role="switch"` 和 `aria-checked`。
- input 使用稳定、可测试的英文 accessible name。
- 禁用控件不可点击，并有明确 disabled 状态。
- Playwright 和 Testing Library 测试优先依赖 role/name，不依赖脆弱 CSS selector。

## 各条件迁移口径

### Prefer Off

保持现有业务能力：

- Specific Dates
- Days of Week
- Date Range
- Time Window
- Fulfilment / minimum / maximum

标准化要求：

- mode 切换时清理不适用字段。
- Time Window 用标准 optional switch 行为。
- minimum/maximum 遵守 number validity。
- tiers、favorite、edit existing bid 回显遵守统一 footer validity。
- 不改变允许相同日期跨 tier 重复的现有业务规则。

### Long Stretch Off / Compressed Flying

标准化要求：

- preference 使用 `AwardAvoidSegmentedControl`。
- date range limit 使用标准 optional switch。
- range 关闭时按 whole-month 业务语义保存，不提交旧 limited range。
- compressed flying 子条件如为 optional，必须遵守 optional payload 清理。
- limited range 太短时 footer disabled，并有测试覆盖。

### Pairing Preference

标准化要求：

- action / preference 选中态与 payload 同源。
- pairing selection、date limit、quantity 的 required/optional 关系明确。
- date scope 关闭或切为 Any 时不提交旧日期。
- Search Pairings 选择结果生成 Pairing Preference 时走同一 mapper。

### Airport Preference

标准化要求：

- Award/Avoid 选中态与 payload 同源。
- airport/city/location selection 为空时 invalid。
- event/date/layover optional 字段关闭后不进入 payload。
- layover min/max 遵守 number range 标准。
- airport picker 可点击区域和 accessible name 保持稳定。

### Pairing Check-In / Check-Out Time

标准化要求：

- check-in/check-out type 与 operator/value 由同一 state 输出。
- time value 必须为合法 `HH:mm`。
- date scope 切换后清理不适用 date/date range。
- 编辑 existing/search criteria 时回显 time type、operator、time 和 date scope。
- 增加 editor-level validity，不再只依赖通用 `isPairingBidComplete`。

### Flight Legs per Duty

标准化要求：

- Award/Avoid 使用标准 segmented control。
- operator/value 使用统一符号下拉 + number input。
- operator/value 必填关系明确。
- value 非法或为空时 footer disabled。
- Search Pairings criteria 编辑回显 operator/value。
- 迁移到标准 section spacing，不再自定义一套标题和布局。

### Work Day Preference

标准化要求：

- mode 切换时清理 weekday/date range 残留。
- weekday 选择、specific date 和 date range 的有效性分别定义。
- date range 必须完整才 valid。
- 编辑 existing/search criteria 时正确回显 mode 和选择值。
- 保留前次已修复的 mode draft clearing 行为。
- 增加 editor-level validity，不再只依赖通用 `isPairingBidComplete`。

### Pairing Length

当前作为基准样本，保持：

- 不显示重复 `PAIRING LENGTH · REQUIRED`。
- Award/Avoid 使用标准 segmented control。
- Min/Max days 使用 `PreferenceNumberRange`。
- `Limit to Pairing Start Date` 使用 `PreferenceInlineSwitch`。
- date range 默认关闭，开启后必须完整选择。

需要补齐：

- 把 behavior standard 中的 payload 清理、favorite 和 search criteria 回显加入测试矩阵。

## 实施分批

### Batch 1：标准基础和低风险 Pairing 条件

- 补充/调整 shared preference primitives。
- 保持 Pairing Length 作为样本。
- 迁移 Flight Legs per Duty。
- 迁移 Work Day Preference。

原因：字段较少，能先把标准落到真实条件中，风险可控。

### Batch 2：中等复杂 Pairing 条件

- 迁移 Pairing Preference。
- 迁移 Airport Preference。
- 迁移 Pairing Check-In / Check-Out Time。

原因：涉及 search criteria 回显和 picker/time/date scope，需要在 Batch 1 稳定后推进。

### Batch 3：Days Off 条件

- 迁移 Prefer Off。
- 迁移 Long Stretch Off / Compressed Flying。

原因：Days Off 条件已有较多业务测试和特殊规则，应该在 Pairing 标准稳定后迁移，避免一次性扩大风险。

## 测试计划

### Unit / Component Tests

每个迁移 condition 至少覆盖：

- 初始态。
- required field missing 时 invalid。
- tier 选择影响 footer validity。
- mode 切换清理隐藏字段。
- optional switch 开/关影响 payload。
- date/date range 完整性。
- number/time invalid 状态。
- edit existing bid 回显。

### Search Pairings Tests

适用于 Pairing 条件：

- 已保存 criteria 编辑回显。
- 修改后保存 payload 不包含旧隐藏字段。
- Pairing 页面和 Search Pairings 页面 summary 一致。

### Playwright

至少覆盖真实用户路径：

- 打开 condition dialog。
- 配置最小有效 bid。
- Add Bid 成功。
- 保存 favorite 并回显。
- 编辑 existing bid 并确认回显。
- optional switch 按行为族覆盖，不只按批次抽样：
  - date range limit：Long Stretch Off / Pairing Length。
  - run/event date scope：Pairing Preference / Airport Preference / Pairing Check-In-Out。
  - time window：Prefer Off。
  - layover duration：Airport Preference。
  - compressed flying 子条件：Long Stretch Off / Compressed Flying。
- 每个行为族至少有一个真实 UI 路径断言关闭 optional 后 payload/summary 不残留旧字段。

### QA 人工测试案例

每个 batch 完成时必须新增或更新 QA 人工测试文档，默认路径：

- `docs/test-cases/pbs/pairing/<YYYY-MM-DD>-preference-condition-standard-batch-<N>.md`
- Days Off batch 可放在 `docs/test-cases/pbs/days-off/`

QA 文档至少包含：

- 前置条件和测试账号/period。
- 每个迁移 condition 的最小有效保存路径。
- optional switch 开启、填写、关闭、再保存的预期结果。
- edit existing bid 和 favorite 回显路径。
- Search Pairings 回显路径，适用于 Pairing 条件。
- 无效输入阻止保存的边界场景。

### UI Gate

每批交付前运行：

- `cd pbs-portal && npx vitest run <focused tests>`
- `cd pbs-portal && npm test`，如果本批只触达局部 editor 且 focused tests 已覆盖变更面，可以说明未全量运行原因
- `cd e2e && npx playwright test --config=config/playwright.config.ts --project=pbs-portal <focused tests>`
- `cd pbs-portal && npm run lint -- --quiet`
- `cd pbs-portal && npm run build`
- `cd /Users/lei/Codehub/rois-ai && npm run check:ui`
- `git diff --check`

## 验收标准

1. 8 组新条件遵守同一套默认态、optional switch、date/range、number/time、footer validity 和 payload 清理规则。
2. Pairing 页面和 Search Pairings 页面不出现同一 property 两套行为。
3. Days Off 条件的特殊业务规则保留，但交互、校验和保存行为与标准一致。
4. 不因为统一行为改变现有已验收 payload 契约。
5. 可访问名称稳定，测试不依赖临时 CSS。
6. 每批迁移都有 focused unit/component 测试、`npm test`、真实 UI Playwright 回归和 QA 人工测试文档。
7. Optional switch 的 Playwright 覆盖按行为族完成，不允许只抽一个条件代表全部 optional 行为。
8. `npm run check:ui` hard violations 为 0。

## 风险与处理

- 风险：Prefer Off 和 Long Stretch Off 已有复杂业务和测试，批量改动容易引入回归。
  - 处理：放到 Batch 3，先迁移 Pairing 条件稳定标准。
- 风险：过度抽象成 form engine 后难以表达业务差异。
  - 处理：只抽稳定 primitives 和 behavior contract，不抽 condition business schema。
- 风险：清理隐藏字段可能改变历史 payload 兼容。
  - 处理：mapper 层兼容历史输入；保存输出遵守新标准。
- 风险：Search Pairings 与 Pairing 页面回显路径不同。
  - 处理：迁移时明确共享 editor/value factory/mapper，测试覆盖两处。

## 关键假设

- UI 文案继续使用英文。
- 当前 8 组条件是本轮标准化范围；其他旧条件不纳入本轮。
- Pairing Length 当前视觉和行为可作为第一版标准样本。
- 业务 payload code、server validation 和数据库结构保持不变。
- 已存在未提交的 `AGENTS.md`、`CLAUDE.md` 和 Flight Number spec 不属于本任务，不在本 spec 中处理。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 8 组条件共享 dialog、preference primitives、mapper 和 E2E 文件，多个 agent 同时写容易冲突；标准化还需要连续判断每个条件的业务例外。
- Suggested split: 不并行实现。按 Batch 1 / 2 / 3 串行推进。
- Write boundaries: `pbs-portal/src/shared/components/preferences/`、`pbs-portal/src/features/pairing/components/`、`pbs-portal/src/features/days-off/components/`、相关 tests、`docs/modules/pbs/pairing-condition-ui-standard.md`、`docs/test-cases/pbs/...`。
- Conflict risk: Medium。主要风险在 shared primitives、Pairing dialog 和 E2E condition tests。
- Execution gate: 本 spec 经用户确认后，再进入实施计划和代码迁移。
