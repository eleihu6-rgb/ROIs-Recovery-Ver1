# PBS Days Off 员工同步 / 错开偏好设计

## 背景

CLASS bid report 中仍有一类未支持条件：

```text
Set Condition Days Off Opposite Employee 762 Minimum 8
```

当前导入结果会把它归类为 `unsupported_set_condition`。这不是机场或 pairing 数据缺失，而是系统尚未表达“与某个员工的排班同步 / 错开偏好”。

现有 PBS Portal 已有 `206 Shared Days Off With Employee`，只能表达“跟某员工同休至少 N 天”。用户希望把这个条件扩展为更完整、更人性化的偏好：

- 跟某员工一起休息 / 不一起休息。
- 跟某员工一起上班 / 不一起上班。
- Portal 只负责存条件；具体如何判定同休、错休、同 pairing、不同 pairing 交给算法处理。

## 目标

- 将现有 Days Off 条件 `206 Shared Days Off With Employee` 改造为通用的 `Employee Schedule Preference`。
- 支持两个独立维度：
  - `Relationship`: `Together` / `Apart`
  - `Schedule Type`: `Work` / `Days Off`
- 支持阈值：
  - `Minimum N`
  - `Maximum N`
- 支持导入 CLASS 文本 `Set Condition Days Off Opposite Employee 762 Minimum 8`。
- 保持旧 `Shared Days Off With Employee` 数据兼容，不破坏已保存的 draft / favorite / summary。

## 非目标

- 不在 Portal 或导入器中计算两名员工是否真的同休、错休、同 pairing 或不同 pairing。
- 不在本阶段实现算法侧求解逻辑。
- 不把这个条件拆成四个独立 property，避免 Days Off property catalog 膨胀。
- 不删除旧 `206` 数据，也不强制迁移用户历史 draft。

## 现有能力

当前系统有：

```text
206 Shared Days Off With Employee
```

当前 bid payload：

```json
{
  "type": "crew-days-off-share",
  "employeeNumber": "817",
  "minimumDays": 12
}
```

该语义等价于新模型中的：

```json
{
  "type": "employee-schedule-preference",
  "employeeNumber": "817",
  "relationship": "together",
  "scheduleType": "days_off",
  "thresholdType": "minimum",
  "days": 12
}
```

因此推荐保留 `propertyCode 206`，只更新展示名、默认 payload、UI 控件和导入映射。

## 新语义模型

### UI 维度

配置弹窗中展示：

- `Employee Number`
- `Relationship`: `Together` / `Apart`
- `Schedule Type`: `Work` / `Days Off`
- `Threshold`: `Minimum` / `Maximum` + day count stepper

组合语义：

| Relationship | Schedule Type | 内部 mode | 业务语义 |
|---|---|---|---|
| Together | Days Off | `same_days_off` | 希望与该员工同休至少 / 最多 N 天 |
| Apart | Days Off | `opposite_days_off` | 希望与该员工休息不同至少 / 最多 N 天 |
| Together | Work | `same_pairing` | 希望与该员工同 pairing / 同上班至少 / 最多 N 次或 N 天 |
| Apart | Work | `different_pairing` | 希望与该员工不同 pairing / 不一起上班至少 / 最多 N 次或 N 天 |

说明：

- Portal 只存 `relationship`、`scheduleType`、`thresholdType`、`days`。
- `mode` 是派生值，便于导入报告、summary 和算法导出阅读。
- `Work` 的具体判断口径，例如是否必须同一个 pairing occurrence，由算法决定，不在 Portal 固化。

### 推荐 payload

```json
{
  "type": "employee-schedule-preference",
  "employeeNumber": "762",
  "relationship": "apart",
  "scheduleType": "days_off",
  "thresholdType": "minimum",
  "days": 8
}
```

字段约束：

- `employeeNumber`: 非空字符串。
- `relationship`: `together` 或 `apart`。
- `scheduleType`: `work` 或 `days_off`。
- `thresholdType`: `minimum` 或 `maximum`。
- `days`: 1 到 31 的整数。

## Property Catalog

推荐继续使用 `propertyCode 206`。

```text
206 Employee Schedule Preference
```

默认值：

```json
{
  "type": "employee-schedule-preference",
  "employeeNumber": "",
  "relationship": "together",
  "scheduleType": "days_off",
  "thresholdType": "minimum",
  "days": 1,
  "min": 1,
  "max": 31
}
```

SQL metadata 需要更新：

- `property_name`: `Employee Schedule Preference`
- `validation_json`: 标记为 employee schedule preference 类型。
- `tooltip`: `Set a schedule preference relative to another employee.`
- `is_visible_in_portal`: 保持 `1`
- `is_active`: 保持 `1`

## 存储与兼容

### 新数据序列化

`pbs_bid_group` 仍使用现有 `operator` / `param_a` / `param_b` / `param_c` 字段，不新增表字段。

建议映射：

| 字段 | 值 |
|---|---|
| `operator` | `Minimum` 或 `Maximum` |
| `param_a` | employee number |
| `param_b` | mode，例如 `opposite_days_off` |
| `param_c` | days |

反序列化时由 `param_b` 还原出：

- `relationship`
- `scheduleType`

### 旧数据兼容

旧 payload / old serialized rows：

```json
{
  "type": "crew-days-off-share",
  "employeeNumber": "817",
  "minimumDays": 12
}
```

读取时继续接受，并规范化显示为：

```text
Together · Days Off · Employee 817 · Minimum 12
```

保存后可以写为新 payload；不需要批量迁移旧 draft。

## 导入映射

CLASS 文本：

```text
Set Condition Days Off Opposite Employee 762 Minimum 8
```

导入结果：

```text
Employee Schedule Preference
Relationship: Apart
Schedule Type: Days Off
Employee Number: 762
Threshold: Minimum 8
```

序列化结果：

```json
{
  "type": "employee-schedule-preference",
  "employeeNumber": "762",
  "relationship": "apart",
  "scheduleType": "days_off",
  "thresholdType": "minimum",
  "days": 8
}
```

导入报告中不应再出现：

```text
unsupported_set_condition: Days Off Opposite Employee 762 Minimum 8
```

## Portal UI

在 Days Off 的 `Configure Days Off Bid` 中，`Employee Schedule Preference` 使用专用控件：

```text
TIERS
T1 T2 T3 T4 T5 T6 T7

BID
Employee Number [        ]

Relationship
[Together] [Apart]

Schedule Type
[Work] [Days Off]

Threshold
[Minimum] [Maximum] [ 8 ]
```

表格展示建议：

```text
Apart · Days Off · Employee 762 · Minimum 8
Together · Work · Employee 817 · Maximum 4
```

文案使用英文：

- `Employee Schedule Preference`
- `Employee Number`
- `Together`
- `Apart`
- `Work`
- `Days Off`
- `Minimum`
- `Maximum`

## 算法导出

该条件属于 rule-level Days Off constraint，应进入 `LINE_RULES.csv` 或当前算法规则导出链路，而不是按具体日期展开到 `DAYSOFF.csv`。

推荐 `Parameters_JSON`：

```json
{
  "employeeNumber": "762",
  "relationship": "apart",
  "scheduleType": "days_off",
  "mode": "opposite_days_off",
  "thresholdType": "minimum",
  "days": 8
}
```

旧 `crew-days-off-share` 数据导出时也应转换成同一结构：

```json
{
  "employeeNumber": "817",
  "relationship": "together",
  "scheduleType": "days_off",
  "mode": "same_days_off",
  "thresholdType": "minimum",
  "days": 12
}
```

## 错误处理

保存 / 导入时需要校验：

- Employee Number 为空：`Employee Schedule Preference must include an employee number.`
- Relationship 不合法：`Employee Schedule Preference relationship is invalid.`
- Schedule Type 不合法：`Employee Schedule Preference schedule type is invalid.`
- Threshold Type 不合法：`Employee Schedule Preference threshold type is invalid.`
- Days 小于 1 或大于 31：`Employee Schedule Preference days must be between 1 and 31.`

导入时如果员工号解析不到，不作为数据匹配失败处理；该条件只存 employee number，由算法后续处理是否存在。

## 方案比较

### 方案 A：改造现有 206 为 Employee Schedule Preference

推荐。

优点：

- 不新增重复条件，页面上只有一个员工相关 schedule preference。
- 与现有 `Shared Days Off With Employee` 自然兼容。
- 旧数据可以映射为 `Together + Days Off + Minimum`。
- 导入 CLASS `Days Off Opposite Employee` 语义清晰。

代价：

- 需要为旧 `crew-days-off-share` 做兼容读取和格式化。
- `line-rules` metadata 里 206 的名称和参数说明需要更新。

### 方案 B：新增 207 Employee Schedule Preference，保留 206

不推荐。

优点：

- 不碰旧 206 定义。

问题：

- Days Off catalog 会同时出现 `Shared Days Off With Employee` 和 `Employee Schedule Preference`，用户容易困惑。
- 两个条件表达重叠语义，导入和算法导出更难统一。

### 方案 C：拆成四个 property

不推荐。

优点：

- 每个 property 名称直观。

问题：

- property catalog 膨胀。
- UI、导入 mapper、validation、算法参数重复。
- 后续如果再加 “same reserve day”等模式会继续膨胀。

## 实现范围

预计需要修改：

- `packages/contracts/pbs-days-off-bids.*`
  - 新增 bid type `employee-schedule-preference`。
  - 将 `206` 默认 bid 改成新类型，展示名改为 `Employee Schedule Preference`。
  - 保留 `crew-days-off-share` 类型用于兼容旧数据。
- `pbs-portal`
  - 新增专用控件：employee number、relationship、schedule type、threshold。
  - 更新 bid formatting / is-complete 判断 / tests。
- `pbs-server`
  - Days Off validation 支持新 bid type。
  - rule bid serialize / deserialize 支持新 payload。
  - lineholder summary / formatter 支持新文案。
  - algorithm export / `LINE_RULES.csv` 参数输出支持新 JSON。
- `live-server` / `pbs-server` crew bid import mapper
  - 支持 `Set Condition Days Off Opposite Employee <id> Minimum <n>`。
- SQL
  - 更新 `pbs_bid_property` 中 `206` 的名称、tooltip、validation。
  - 更新 seed，保证新环境初始化一致。
- 测试与文档
  - 补充 mapper、validation、serialization、UI 控件、导出参数、dry-run 失败分类测试。
  - 补充人工测试案例。

## 验收标准

- Days Off 页面能新增 / 编辑 / 保存 `Employee Schedule Preference`。
- UI 支持 `Together/Apart`、`Work/Days Off`、`Minimum/Maximum N`。
- 旧 `Shared Days Off With Employee` 数据能正常读取，并显示为 `Together · Days Off · Employee X · Minimum N`。
- 导入以下文本成功：

```text
Set Condition Days Off Opposite Employee 762 Minimum 8
```

- dry-run 不再把该文本归为 `unsupported_set_condition`。
- 导入报告展示具体条件，而不是只显示 unsupported。
- 算法导出中出现结构化 `Parameters_JSON`。
- 现有 Days Off 条件：`Prefer Off`、`Max Consecutive Days On`、`Min Consecutive Days Off`、`Days Off / Days On Pattern` 不受影响。

## 风险与注意事项

- `Work` 的算法语义不能在 Portal 里提前写死；Portal 只能存结构化条件。
- 206 名称改变后，旧测试和帮助文档可能仍使用 `Shared Days Off With Employee`，需要同步更新或保留兼容说明。
- 如果算法已有 206 旧参数解析，需要同步确认是否接受新 `Parameters_JSON`。
- 导入器只解析 CLASS 明确出现的 `Days Off Opposite Employee`；其他文本变体应先记录为 unsupported，避免猜错。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 该任务跨 contract、Portal 控件、server validation、serialization、import mapper 和 algorithm export，但这些文件围绕同一个 bid payload 强耦合；并行写容易导致 payload 字段不一致。
- Suggested split: 不拆分；可以在实现完成后单独让 review agent 做只读 review。
- Write boundaries: `packages/contracts`、`pbs-portal` Days Off 控件、`pbs-server` Days Off / lineholder / import / export、SQL seed / migration、测试文档。
- Conflict risk: Medium，主要风险在旧 206 数据兼容和算法导出参数格式。
- Execution gate: 本 spec 经用户确认后再进入实现。
