# PBS LINE_RULES 算法 Rule_ID 重映射设计

日期：2026-06-04

## 背景

当前 `LINE_RULES.csv` 使用系统内部 `property_code` 作为 `Rule_ID`。例如：

- `202` = Max Consecutive Days On
- `203` = Min Consecutive Days Off
- `205` = Days Off / Days On Pattern
- `408` = Commuter Pattern

算法侧现在要求这类“连续上班 / 连续休息 / days on/off pattern”统一按：

```text
Rule_ID = 408
Rule_Type = COMMUTER_PATTERN
Parameters_JSON = {"minDaysOn":...,"maxDaysOn":...,"minDaysOff":...,"maxDaysOff":...}
```

但如果直接把我们系统内部的 `202/203/205` 改成 `408`，导出文件会丢失原始配置类型，不方便回查 portal 配置，也容易让维护人员误以为页面上配置的就是 Line `408 Commuter Pattern`。

## 目标

1. `LINE_RULES.csv` 新增一列 `Code_ID`，保存我们系统内部原始 rule id / property code。
2. `Rule_ID` 改为算法侧使用的 rule id。
3. 对算法指定的 days-on/off/pattern 条件，导出为 `Rule_ID=408`、`Rule_Type=COMMUTER_PATTERN`。
4. `Parameters_JSON` 保持算法要求的新结构。
5. `Description` 不跟着改，继续使用原始配置类型的自然语言说明。
6. `LINE_RULES_README.md` 同步说明 `Code_ID` 与 `Rule_ID` 的区别。

## 输出表头调整

当前：

```csv
Crew_ID,Rule_ID,Rule_Type,Parameters_JSON,T1_Counter,...,T7_Counter,Description
```

调整为：

```csv
Crew_ID,Code_ID,Rule_ID,Rule_Type,Parameters_JSON,T1_Counter,...,T7_Counter,Description
```

字段含义：

| 字段 | 说明 |
| --- | --- |
| `Code_ID` | 系统内部原始 `property_code`，用于回查 portal 配置。 |
| `Rule_ID` | 算法侧解析用 rule id。 |
| `Rule_Type` | 算法侧解析用 rule type。 |

## Rule_ID 重映射规则

本次只重映射算法已经明确要求的连续上班 / 连续休息 / pattern 条件：

| Code_ID | 原配置类型 | 导出 Rule_ID | 导出 Rule_Type | Parameters_JSON |
| --- | --- | --- | --- | --- |
| `202` | Max Consecutive Days On | `408` | `COMMUTER_PATTERN` | `{"minDaysOn":n,"maxDaysOn":n,"minDaysOff":0,"maxDaysOff":0}` |
| `203` | Min Consecutive Days Off | `408` | `COMMUTER_PATTERN` | `{"minDaysOn":1,"maxDaysOn":bidMonthDays,"minDaysOff":n,"maxDaysOff":n}` |
| `205` | Days Off / Days On Pattern | `408` | `COMMUTER_PATTERN` | `{"minDaysOn":x,"maxDaysOn":y,"minDaysOff":z,"maxDaysOff":z}` |

示例：

```csv
Crew_ID,Code_ID,Rule_ID,Rule_Type,Parameters_JSON,...
383,203,408,COMMUTER_PATTERN,"{""maxDaysOff"":7,""maxDaysOn"":30,""minDaysOff"":7,""minDaysOn"":1}",...
274,408,408,COMMUTER_PATTERN,"{""maxDaysOff"":4,""maxDaysOn"":5,""minDaysOff"":4,""minDaysOn"":4}",...
```

## 不重映射范围

以下规则仍按自身原始 code 导出，除非后续算法侧明确要求：

- `204` Min Consecutive Days Off In Window：因为带日期窗口，算法示例没有要求归入 408。
- `206` Shared Days Off With Employee：语义不是 commuter pattern。
- Reserve、Pairing、AA Line、其他 Legacy Line rule：保持原样。

## Description 规则

`Description` 继续描述 portal 原始配置，不描述算法 remap 后的 `Rule_ID`。

例如：

```text
Code_ID=203, Rule_ID=408, Description=DaysOff rule: Min Consecutive Days Off is 7.
```

这样算法侧解析 `Rule_ID/Rule_Type/Parameters_JSON`，人工排查时仍能通过 `Code_ID/Description` 知道页面原配置是什么。

## 聚合与排序

聚合行粒度建议改为：

```text
Crew_ID + Code_ID + Rule_ID + Rule_Type + Parameters_JSON
```

原因：不同原始配置未来可能被算法映射到同一个 `Rule_ID=408` 且参数恰好相同，保留 `Code_ID` 可以避免语义混在同一行。

排序建议：

```text
Crew seniority scope order / Crew_ID, Code_ID numeric asc, Rule_ID numeric asc, Parameters_JSON asc
```

## 验收标准

- `LINE_RULES.csv` 包含 `Code_ID` 列。
- `202/203/205` 导出时 `Code_ID` 保留原值，`Rule_ID=408`，`Rule_Type=COMMUTER_PATTERN`。
- `408` 原 Commuter Pattern 仍为 `Code_ID=408`、`Rule_ID=408`。
- `Parameters_JSON` 符合算法提供的结构。
- `Description` 保持原始配置说明，不变成算法 remap 说明。
- `LINE_RULES_README.md` 解释 `Code_ID` 与 `Rule_ID` 差异。
- 相关单测与 TypeScript 检查通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这是单个导出文件的字段合同调整，主要集中在 `line-rules-export.ts` 和对应测试；拆分会增加协调成本。
- Suggested split: 不拆分。
- Write boundaries: `pbs-server/src/services/algorithm-export/line-rules-export.ts`、相关测试、必要说明文档。
- Conflict risk: 多 agent 同时改同一个导出 schema 和测试容易冲突。
- Execution gate: 用户确认本 spec 后开始实现。
