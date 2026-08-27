# PBS Days Off 添加前配置弹窗设计

日期：2026-05-18  
状态：待确认  
范围：只调整 `/days-off` 右侧 Days Off property 添加交互，不改 Line、不改左侧共享日历、不改数据库 schema

## 背景

当前 `/days-off` 右侧 `ADD DAYS OFF PROPERTY` 列表中，点击 `+` 会立即把 property 添加到上方 Existing 列表，然后用户再展开编辑。

这个流程对无参数 property 勉强可用，但对 `Prefer Off` 这类高频条件不合理：

- 旧库 Excel `init-docs/crew_bids_reference-2026-03-16-072929.xlsx` 中，`Prefer Off` 是 DaysOff 的核心 property。
- `bid_properties` 中 `id=201`，`remastered_property=Prefer Off`。
- `validation_json` 定义主输入为 `date_or_dow` 多选，支持 `In / Between`，并可带 `Window From / Window To`。
- `crew_bids` 中 `Prefer Off` 有 2878 条记录，涉及 612 个 crew。
- 真实数据包含具体日期、多日期、星期几、`Weekends`、日期范围、时间窗口、`all_or_nothing`、`minimum_n`。

因此 `Prefer Off` 不是一个可以空着先添加的条件。用户点击 `+` 后应先配置完整条件，确认后再添加到上方。

## 目标

1. Days Off 可选 property 点击 `+` 时不再立即添加半成品。
2. 点击 `+` 打开配置弹窗 / dialog。
3. 用户在弹窗内完成 bid 参数、Tx 范围、modifier 配置后点击 `ADD BID`。
4. 只有确认后才调用 add API，并把完整 bid 添加到 Existing 列表。
5. `Prefer Off` 按旧库数据具体化为日期 / 星期 / Weekends / 日期范围输入，而不是 `Type code and press Enter`。
6. `AON / Min` 文案改得更清楚，避免用户看不懂。

## 不做范围

- 不改左侧 `BIDDING CALENDAR` 日期点选逻辑。
- 不改 `/line` 页面添加 property 的行为。
- 不改变现有 Days Off 后端 add / patch / delete API contract。
- 不改 `pbs_bid_group` 表结构。
- 不实现完整 AA `Clear Bids`。
- 不把 AA 隐藏 property 默认放出来；本轮只处理当前可见 Days Off property 的添加体验。

## 旧库 `Prefer Off` 语义

旧 Excel 中 `Prefer Off` 的关键字段：

| 字段 | 值 |
|------|----|
| property id | `201` |
| bid type | `DaysOff` |
| remastered property | `Prefer Off` |
| operators | `In`, `Between` |
| input A | `date_or_dow`, label=`Dates / Days`, `multi=true` |
| input B | `time_of_day`, label=`Window From` |
| input C | `time_of_day`, label=`Window To` |

真实使用形态：

| 类型 | 示例 | 说明 |
|------|------|------|
| 单日期 | `Dec 25, 2025` | 希望某一天休息 |
| 多日期 | `Dec 25, 2025,Dec 5, 2025` | 希望多个日期休息 |
| 星期几 | `Saturday,Sunday` | 希望某些星期休息 |
| 周末 | `Weekends` | 希望周末休息 |
| 日期范围 | `Between Dec 8, 2025 And Dec 11, 2025` | 希望一个连续日期范围休息 |
| 时间窗口 | `Dec 4, 2025` + `15:00` / `23:59` | 希望某日期某时间段休息 |
| modifier | `all_or_nothing=1` / `minimum_n=2` | 全部满足或至少满足 N 个 |

## 交互方案

### 1. Available 列表

可选 property 行继续显示：

- property 名称。
- 收藏按钮。
- 简短摘要。
- Tx 适用范围。
- `+` 添加按钮。

但点击 `+` 时：

- 不立即调用 `onAddProperty`。
- 打开 `Configure Days Off Bid` 弹窗。
- 弹窗初始化为该 property 的默认 bid、默认 Tx、默认 modifier。

### 2. 配置弹窗

弹窗结构：

```text
Configure Days Off Bid
Prefer Off

[Bid Details]
  根据 property 类型渲染具体控件

[Apply To]
  T1 T2 T3 T4 T5 T6 T7

[Options]
  All or Nothing
  Minimum required

[Cancel] [ADD BID]
```

确认按钮：

- 文案使用 `ADD BID`，与 PBS 语义一致。
- 校验通过后调用当前 Days Off add property API。
- 成功后关闭弹窗，并把返回的 property 加入 Existing。
- 失败时保留弹窗并显示错误 message。

取消按钮：

- 关闭弹窗。
- 不产生 draft mutation。

### 3. `Prefer Off` 专属输入

`Prefer Off` 不再使用 `PairingBidControl` 的自由 tag 输入作为主要 UI。

建议拆成以下控件：

| 控件 | 说明 |
|------|------|
| Mode segmented control | `Dates` / `Days of Week` / `Weekends` / `Date Range` |
| Dates multi picker | 多选具体日期 |
| Days of Week checkboxes | Mon-Sun 多选 |
| Weekends option | 快捷选择 `Weekends` |
| Date Range picker | start / end 两个日期 |
| Time window toggle | 可选启用时间窗口 |
| Window From / Window To | `HH:mm` 时间输入 |

数据映射：

- `Dates`：写入 `param_a` / bid values 为日期列表。
- `Days of Week`：写入星期列表。
- `Weekends`：写入 `Weekends`。
- `Date Range`：operator 使用 `Between`，写入 start/end。
- Time window：写入 `param_b`、`param_c` 对应的窗口开始/结束。

### 4. 其他 Days Off property 输入

按现有 `defaultBid` 类型渲染：

| bid type | 弹窗控件 |
|----------|----------|
| `flag` | 只显示说明和 Tx / Options |
| `stepper` | 数字输入 / stepper |
| `date` | 单日期选择 |
| `date-range` | 日期范围选择 |
| `stepper-range` | 数值范围输入 |
| `tag-list` | 如果不是 `Prefer Off`，短期保留 tag input |

### 5. Modifier 文案

当前 UI 的 `AON` / `Min` 应改为更清楚的文案：

| 当前 | 建议 |
|------|------|
| `AON` | `All or Nothing` / `全部满足` |
| `Min` | `Minimum required` / `至少满足` |

为了保持英文 UI 风格，建议第一版使用：

- `All or Nothing`
- `Minimum required`

并添加简短 helper text：

- `All or Nothing`: `Only add this bid if every selected day can be satisfied.`
- `Minimum required`: `The minimum number of selected days that must be satisfied.`

### 6. Existing 编辑

Existing 列表里的编辑图标继续保留。

第一版有两个可选实现：

#### 推荐：复用同一个弹窗编辑已有 bid

- 点击 Existing 的编辑图标打开同一个 `Configure Days Off Bid` 弹窗。
- 标题改为 `Edit Days Off Bid`。
- 确认按钮改为 `SAVE BID`。
- 保存调用现有 patch API。

优点：创建和编辑体验一致，减少 inline editor 复杂度。

#### 备选：第一版只改新增，Existing 继续 inline 编辑

优点：改动更小。

缺点：创建和编辑体验不一致，后续仍要再统一。

本轮推荐直接做“新增 + 编辑复用弹窗”，但如果实现风险过大，可以先只做新增弹窗。

## 数据与 API 影响

不新增 API。

继续使用现有：

- `POST /api/days-off-bids/current/properties`
- `PATCH /api/days-off-bids/current/properties/:propertyGroupKey`

前端需要在调用前把弹窗表单转换为现有 `RuleBidExistingProperty / RuleBidAvailableProperty` 结构。

如果当前通用 `PairingBidControl` 无法表达 `Prefer Off` 的 date / day / weekend / time window 结构，需要在前端先新增 Days Off 专用 form state，再在提交时映射回当前 bid value。不要为了 UI 方便改数据库。

## 组件边界建议

新增或调整：

- `pbs-portal/src/features/days-off/components/days-off-bid-dialog.tsx`
- `pbs-portal/src/features/days-off/components/prefer-off-bid-form.tsx`
- `pbs-portal/src/features/rule-bids/components/rule-bid-right-panel.tsx`
  - 增加可选 `addMode="inline" | "dialog"` 或 Days Off 专用 callback。
  - 默认保持 inline，避免影响 Line。
- `pbs-portal/src/features/days-off/pages/days-off-page.tsx`
  - 传入 Days Off 专用 add/edit dialog 行为。

原则：

- `RuleBidRightPanel` 仍作为通用面板。
- Days Off 特有的 `Prefer Off` 表单逻辑不要塞进通用 RuleBid 组件。
- Line 页面不应该因为 Days Off 弹窗改造受到行为变化。

## 校验规则

弹窗确认前至少校验：

- `Prefer Off` 必须选择至少一个日期、星期、Weekends 或有效日期范围。
- `Date Range` start/end 必须有效，且 start <= end。
- 时间窗口必须成对填写，格式为 `HH:mm`。
- `Minimum required` 必须为正整数。
- 至少选择一个 Tx。
- 继续复用现有 Days Off 业务校验，例如互斥、unique per tier、restrictive minimum days off。

## 测试计划

前端：

- 点击 `Prefer Off` 的 `+` 不调用 add API，只打开弹窗。
- `Prefer Off` 弹窗选择多个日期后点击 `ADD BID`，调用 add API 并出现在 Existing。
- `Prefer Off` 弹窗选择 weekday / Weekends / Date Range 能正确生成摘要。
- `All or Nothing` 和 `Minimum required` 能随 add 请求提交。
- 点击 Cancel 不新增 bid。
- 无有效输入时 `ADD BID` 禁用或显示错误。
- Existing 编辑图标打开弹窗并可保存修改。
- Line 页面仍保持原有添加行为。

后端：

- 不需要新增接口测试。
- 如果映射到现有 bid value 时涉及数据结构调整，补充 Days Off mapper / validation 单测。

回归：

- Days Off add / patch / delete / favorite 不回退。
- Tier summary 仍能看到新增 Days Off bid。
- 左侧 calendar day off 行为不受影响。

## 验收标准

1. Days Off 可选 property 点击 `+` 先打开配置弹窗，不再立即添加半成品。
2. `Prefer Off` 使用日期 / 星期 / Weekends / 日期范围控件，不再要求用户手动输入 code。
3. `All or Nothing`、`Minimum required` 文案清晰。
4. 点击 `ADD BID` 后才创建 bid。
5. Existing 编辑可以继续修改已创建 bid。
6. Line 页面添加 property 行为不变。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 该改动集中在 Days Off 右侧交互、通用 RuleBid 面板边界和测试，文件耦合较紧；并行容易改到同一组件。
- Suggested split: 不拆分。
- Write boundaries: `pbs-portal/src/features/days-off/`、`pbs-portal/src/features/rule-bids/`、相关测试；不动后端 schema。
- Conflict risk: 中等，主要风险是影响 Line 共用面板和现有 Days Off patch 行为。
- Execution gate: 用户确认本 spec 后再实现。
