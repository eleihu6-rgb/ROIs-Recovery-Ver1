# PBS Reserve Date-Scoped Short Call Type 设计

日期：2026-05-29  
状态：待用户确认  
范围：只设计第 6 条 PBS Reserve 条件的实现方式。本文件只定义需求和方案，不包含代码实现。

## 背景

用户原始条件：

```text
6. ½ of the month AM reserve – ½ the month PM reserve
```

经过讨论，业务语义明确为：

- `AM reserve` 对应旧库 Reserve `Short Call Type` 中的 `PRAM`。
- `PM reserve` 对应旧库 Reserve `Short Call Type` 中的 `PRPM`。
- 用户不一定只想按“前半月 / 后半月”切分，也可能希望按任意日期集合配置，例如 `1,3,5,7,9` 是 AM reserve，`2,4,6,8,10` 是 PM reserve。
- `First Half`、`Second Half` 只是快捷填充，不是唯一支持方式。

因此，第 6 条不新增一个只能表达半月的专属条件，而是增强现有旧库 Reserve 右上角 `Short Call Type` 添加按钮：在 `call type + Tx` 之外增加日期适用范围。

第 7 条以及 AA 文档页面的“想飞 / 想休息”语义不进入本轮范围，不在本 spec 中设计或实现。

## 目标

1. 增强 Reserve 页面右上角 `Short Call Type` 添加弹窗。
2. 让用户可以选择 `call type + Tx + 日期适用范围`。
3. 支持 `Whole Month`、`First Half`、`Second Half`、`Date Range`、`Specific Dates` 五种日期输入方式。
4. 通过两个 date-scoped `Short Call Type` 条件完整表达第 6 条。
5. 保持旧库 Reserve 语义清晰：`PRAM / PRPM / CRAM / CRPM...` 都是 reserve call type，不表示 flying。
6. 继续沿用 `pbs_bid_property.is_visible_in_portal` 控制条件是否在 Portal 可见。

## 非目标

- 不新增 AA/Line `Prefer Flying Dates`。
- 不修改 AA 文档页面。
- 不处理第 7 条。
- 不把 `flying` 语义放入 Reserve 模块。
- 不新增一个只能表达“前半月 AM、后半月 PM”的死板 property。
- 不做任意复杂多段策略编辑器，例如无限多个区段、权重、嵌套规则。
- 不在第一阶段承诺 optimizer 完整 award 逻辑；本阶段先完成 bid 表达、保存、校验、展示和旧库按钮增强。
- 不移除现有 `Reserve Day On`、`Reserve Prefer Off` 行为。

## 条件表达

第 6 条：

```text
½ of the month AM reserve – ½ the month PM reserve
```

推荐通过两个 Reserve 条件表达：

```text
Short Call Type = PRAM, Dates = First Half, Tx = T1
Short Call Type = PRPM, Dates = Second Half, Tx = T1
```

也可以表达更细的用户选择：

```text
Short Call Type = PRAM, Dates = 2026-06-01, 2026-06-03, 2026-06-05, Tx = T1
Short Call Type = PRPM, Dates = 2026-06-02, 2026-06-04, 2026-06-06, Tx = T1
```

这个方案让第 6 条既能覆盖“半月”模板，也能覆盖用户指定奇偶日期、连续区间、单日集合等真实需求。

## UI 设计

现有 Reserve 右上角 `Short Call Type` 弹窗文案：

```text
Select the reserve call type and Tx to apply.
```

建议改为：

```text
Select the reserve call type, Tx, and dates to apply.
```

弹窗字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `Call Type` | select | 继续使用现有 `CRAM / CRPM / PRAM / PRMM / PRPM / RESA / RESB`。 |
| `Apply To Tx` | checkbox group | 沿用现有 `T1` 到 `T7`。 |
| `Date Scope` | segmented / radio | `Whole Month`、`First Half`、`Second Half`、`Date Range`、`Specific Dates`。 |
| `Date Range` | start/end date | 仅当 `Date Scope = Date Range` 时显示。 |
| `Specific Dates` | date picker + tag list | 仅当 `Date Scope = Specific Dates` 时显示。 |

快捷语义：

- `Whole Month`：应用到整个 bid period。
- `First Half`：应用到当月前半段。
- `Second Half`：应用到当月后半段。
- `Date Range`：用户选择起止日期。
- `Specific Dates`：用户逐个添加日期，支持 `1,3,5,7,9` 这类集合。

`First Half / Second Half` 的具体日期应根据当前 bid period 计算，不硬编码为固定月份。若当月天数为奇数，建议 `First Half` 包含 `1` 到 `ceil(daysInMonth / 2)`，`Second Half` 包含剩余日期。例如 31 天月份中，`First Half = 1-16`，`Second Half = 17-31`。

## Bid Value 建议

为避免把日期范围拆成大量零散条件，建议新增共享 date scope 结构。

```ts
type DateScope =
  | { mode: "whole_month" }
  | { mode: "first_half" }
  | { mode: "second_half" }
  | { mode: "date_range"; from: string; to: string }
  | { mode: "specific_dates"; dates: string[] };
```

Reserve `Short Call Type` 建议从简单 `select` bid 扩展为：

```json
{
  "type": "reserve-call-type-date-scope",
  "callType": "PRAM",
  "dateScope": {
    "mode": "specific_dates",
    "dates": ["2026-06-01", "2026-06-03", "2026-06-05"]
  }
}
```

Tx/Tier 仍沿用 property 外层 `tiers` 字段，不放进 bid value 内。

## 数据库配置

继续使用现有 Reserve property：

```text
property_code = 301
bid_type = Reserve
property_name = Short Call Type
```

不新增新的第 6 条 property。只扩展 `301 Short Call Type` 支持 date scope。

`validation_json` 建议扩展为：

```json
{
  "type": "reserve_call_type_date_scope",
  "label": "Short Call Type",
  "options": ["CRAM", "CRPM", "PRAM", "PRMM", "PRPM", "RESA", "RESB"],
  "dateScope": ["whole_month", "first_half", "second_half", "date_range", "specific_dates"]
}
```

显示控制继续依赖：

- `is_active = 1`：后端支持并参与 catalog。
- `is_visible_in_portal = 1`：Portal 页面可见。
- contract 中必须支持 `301 Short Call Type`，否则后端不会把它返回给前端。

## 保存与展示

Existing summary 示例：

```text
PRAM on First Half
PRPM on Second Half
PRAM on Jun 1, Jun 3, Jun 5
PRPM on Jun 2-Jun 10
```

添加后的行为：

- `Short Call Type` 添加后进入 Reserve Existing 列表。
- 相同 `callType + dateScope + Tx` 的重复添加应提示重复或合并，避免无意义重复行。
- 不同 call type、不同 date scope 或不同 Tx 应允许共存。
- Existing 中支持编辑，编辑时回填 `callType`、Tx、date scope。
- 删除沿用现有 Reserve property 删除行为。

收藏行为：

- 如果 Reserve 模块已有 configured favorite 机制，应保存完整 bid value 快照，包括 `dateScope`。
- 从 favorite 再次添加时，应按保存时的 date scope 回填。
- Favorite summary 应显示日期范围，不能只显示 `Short Call Type`。

## 校验规则

Reserve `reserve-call-type-date-scope`：

- `callType` 必须属于现有 reserve call type 白名单。
- `dateScope.mode` 必须属于允许值。
- `date_range.from` 与 `date_range.to` 必须是有效 `YYYY-MM-DD` 日期，且 `to >= from`。
- `specific_dates.dates` 至少一项，必须去重，必须为有效 `YYYY-MM-DD` 日期。
- 日期应在当前 bid period 内；若现有模块暂时缺少 period-aware validation，可先在前端限制并在后端逐步补强。
- `tiers` 至少一个，且只能为 Reserve 支持的 `T1-T7`。

为了兼容历史草稿与当前简单 `select` 结构，后端反序列化应支持两种形态：

```json
{ "type": "select", "value": "PRAM", "options": ["PRAM", "PRPM"] }
```

以及：

```json
{
  "type": "reserve-call-type-date-scope",
  "callType": "PRAM",
  "dateScope": { "mode": "whole_month" }
}
```

历史简单 `select` 可视为 `dateScope = whole_month`。

## 测试建议

后端测试：

1. Reserve validation 接受 `PRAM + first_half`。
2. Reserve validation 接受 `PRAM + specific_dates`。
3. Reserve validation 接受历史 `select` 结构，并视为 whole month。
4. Reserve validation 拒绝非法 call type。
5. Reserve validation 拒绝非法日期、重复日期、反向 date range。
6. 序列化 / 反序列化 `reserve-call-type-date-scope` 保持字段完整。

前端测试：

1. Reserve `Short Call Type` 弹窗显示 date scope 控件。
2. 选择 `First Half` 添加后 Existing summary 正确。
3. 选择 `Specific Dates` 添加 `1,3,5` 后保存 payload 正确。
4. 编辑已有 date-scoped `Short Call Type` 时正确回填。
5. 历史 simple `Short Call Type` 仍可显示和编辑。

## 验收标准

1. 用户能用 Reserve 右上角入口配置 `PRAM + First Half` 和 `PRPM + Second Half`，完整表达第 6 条。
2. 用户能用 Reserve 右上角入口配置任意日期集合，例如 `1,3,5,7,9` AM reserve。
3. 用户能用同一入口配置 `PRPM + Date Range` 或 `PRPM + Specific Dates`。
4. 添加、保存、回读、编辑、删除都能保留 `callType + dateScope + Tx`。
5. 历史 `Short Call Type` 数据不丢失，并按 whole month 兼容展示。
6. 条件可见性仍由数据库字段控制，方便后续按航司配置化。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本轮范围已收窄到 Reserve `Short Call Type` 一个入口，主要涉及同一条 contract/backend/frontend 链路，拆分多 agent 的协调成本高于收益。
- Suggested split: 不建议拆分。
- Write boundaries: 若进入实现，应集中修改 Reserve contracts、Reserve backend validation/serialization、Reserve frontend dialog 与对应测试。
- Conflict risk: 中等，当前工作树已有其他 PBS 改动，实现前需要先确认未提交变更边界。
- Execution gate: 只有用户确认本 spec 并批准实现后，才开始改代码。

## 推荐结论

第 6 条作为旧库 Reserve `Short Call Type` 的增强实现：

```text
Short Call Type + Date Scope + Tx
```

不新增专属 property，不修改 AA 页面，不处理第 7 条。这样既能满足“半个月 AM reserve、半个月 PM reserve”，也能支持用户自由选择 `13579 AM reserve / 246810 PM reserve`，同时保持旧库语义清楚、实现范围可控。
