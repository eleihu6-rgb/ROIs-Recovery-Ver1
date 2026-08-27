# Pairing Length 摘要文案统一设计

## 1. 背景

同一个 `Pairing Length` 条件目前在两个用户界面中使用不同的摘要文案：

- `SEARCH CRITERIA`：`Award · Up to 1 days`
- `EXISTING BID PROPERTIES`：`Award pairings with length at most 1 days`

两者不仅表达不一致，还都没有正确处理 `day / days` 单复数。用户需要自行推断
`Award` 的对象以及 `Up to`、`at most` 是否表达同一规则。

## 2. 目标

- `SEARCH CRITERIA` 与 `EXISTING BID PROPERTIES` 对同一个 Pairing Length 条件显示相同的自然语言摘要。
- 摘要完整表达动作、对象和天数范围。
- 正确处理 `day / days` 单复数。
- `Award` 与 `Avoid` 使用相同句式。

## 3. 统一文案

| 条件 | Award 文案 | Avoid 文案 |
| --- | --- | --- |
| 最大 1 天 | `Award pairings up to 1 day long` | `Avoid pairings up to 1 day long` |
| 最大 N 天 | `Award pairings up to N days long` | `Avoid pairings up to N days long` |
| 最少 1 天 | `Award pairings at least 1 day long` | `Avoid pairings at least 1 day long` |
| 最少 N 天 | `Award pairings at least N days long` | `Avoid pairings at least N days long` |
| 恰好 1 天 | `Award pairings 1 day long` | `Avoid pairings 1 day long` |
| 恰好 N 天 | `Award pairings N days long` | `Avoid pairings N days long` |
| M–N 天 | `Award pairings M–N days long` | `Avoid pairings M–N days long` |

如果条件包含 `LIMIT TO PAIRING START DATE`，两个入口也使用相同的可读日期格式：

- 单个具体日期：
  `Award pairings up to 1 day long starting on Jul 2, 2026`
- 多个具体日期：
  `Award pairings up to 1 day long starting on Jul 2, 2026 or Jul 5, 2026`
- 日期范围：
  `Award pairings up to 1 day long starting from Jul 2, 2026 to Jul 5, 2026`

三个及以上具体日期使用英文自然列表，日期之间用分号分隔，最后一个日期前使用 `or`，例如：

`starting on Jul 2, 2026; Jul 5, 2026; or Jul 8, 2026`

本次只统一日期摘要格式，不改变日期选择和日期筛选语义。

## 4. 方案比较

### 方案 A：前后端分别修改字符串

改动最少，但两套格式化逻辑仍可能再次漂移，不采用。

### 方案 B：共用 Pairing Length 范围短语格式化方法（采用）

抽取一个 Pairing Length 纯格式化方法，统一处理：

- `Award / Avoid`
- `minDays / maxDays`
- `day / days`
- `specific_dates / date_range`
- ISO 日期到稳定英文可读日期的转换

Portal 的 `SEARCH CRITERIA` 和 Server 的 `EXISTING BID PROPERTIES` 都使用该方法，最终
可见句子必须完全一致。

### 方案 C：只修改 Search Criteria

无法解决两个位置不一致的问题，不采用。

## 5. 实现范围

### 5.1 共享格式化

共享方法接收合法的动作、`minDays / maxDays` 和可选的 `dateScope`，返回完整摘要：

- `Award pairings up to 1 day long`
- `Avoid pairings at least 2 days long`
- `Award pairings 1 day long`
- `Award pairings 2–4 days long starting from Jul 2, 2026 to Jul 5, 2026`

方法只格式化文案，不进行业务筛选，不修改 payload。

### 5.2 Search Criteria

前端直接使用共享完整摘要，不再显示点分隔的 `Award · Up to 1 days`，也不再单独拼接
ISO 日期后缀。

### 5.3 Existing Bid Properties

后端摘要使用同一完整摘要，不再生成 `pairings with length at most ... days`，也不再
单独格式化 Pairing Length 日期后缀。

## 6. 非目标

- 不改变 `Pairing Length` 的搜索 SQL。
- 不改变 `duration_days` 的来源或业务定义。
- 不改变保存 payload、数据库结构、导入映射或算法导出规则。
- 不修改其他 Pairing 条件的摘要文案。
- 不修改标签换行或页面布局。

## 7. 验收标准

1. 同一个 Pairing Length 条件在 `SEARCH CRITERIA` 与
   `EXISTING BID PROPERTIES` 显示完全相同的摘要。
2. 数值为 `1` 时使用 `day`，其他正整数使用 `days`。
3. 最大值、最小值、相等值、范围值及 `Award / Avoid` 均有自动化覆盖。
4. `specific_dates` 与 `date_range` 在两个入口逐字一致，并使用第 3 节定义的日期格式。
5. Pairing 搜索结果数量、保存数据和既有条件行为不发生变化。
6. 使用真实 PBS Portal 的 Playwright 流程验证两个显示入口。

## 8. 测试范围

- 共享格式化方法单元测试，覆盖动作、边界、单复数和两种日期模式。
- `pbs-portal` Pairing Length Search Criteria 文案测试。
- `pbs-server` Lineholder/Existing Bid 摘要测试。
- Playwright：建立或读取 Pairing Length 条件，分别逐字核对
  `SEARCH CRITERIA` 与 `EXISTING BID PROPERTIES`；至少覆盖一个无日期条件和一个带日期条件。
- 前端改动完成后执行 `npm run check:ui`。

## 9. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动规模小，前后端共享文案与两端测试紧密依赖同一输出契约，拆分后的协调成本高于收益。
- Suggested split: 主 agent 顺序完成共享格式化、前端接入、后端接入和验证。
- Write boundaries: 单一 agent 负责全部相关文件。
- Conflict risk: 低；需避免覆盖工作区中无关的 Line → Roster spec。
- Execution gate: 本 spec 经独立审查并由用户确认后才开始修改生产代码。
