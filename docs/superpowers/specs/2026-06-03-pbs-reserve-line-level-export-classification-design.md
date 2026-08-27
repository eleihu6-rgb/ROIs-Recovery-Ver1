# PBS Reserve 宽泛条件导出归集设计

## 背景

当前算法导出包已经包含：

- `RESERVE_SCORE.csv`：用于给 reserve pairing / reserve assignment 计分。
- `LINE_RULES.csv`：用于表达最终 awarded line 的结构性约束。

用户确认：Reserve 页面的部分条件如果不是“具体某一天 reserve”，而是在表达整条 line 的 reserve 结构，例如 `Only AM reserve`，应归入 `LINE_RULES.csv`，不应只展开成 `RESERVE_SCORE.csv` 里的 pairing 命中。

## 目标

1. `Reserve Short Call Type` 在宽泛日期范围下导出到 `LINE_RULES.csv`。
2. `Reserve Short Call Type` 在具体日期 / 具体日期范围下继续导出到 `RESERVE_SCORE.csv`。
3. 避免同一个宽泛 reserve 条件同时出现在 `LINE_RULES.csv` 和 `RESERVE_SCORE.csv`，导致算法重复理解。
4. 不修改页面保存结构，不改数据库 schema，不重置用户当前 bid 数据。

## 分类规则

### 归入 `LINE_RULES.csv`

Reserve `Short Call Type` (`propertyCode=301`) 且 `dateScope.mode` 为：

- `whole_month`

这些语义表达的是最终 line 的 reserve call type 结构，例如：

- 整月 `PRAM`：Only AM reserve。
- 整月 `PRPM`：Only PM reserve。
前半月 / 后半月这类二分之一月份条件暂时不归入 `LINE_RULES.csv`，继续沿用原来的 reserve pairing 匹配逻辑。

导出格式：

```csv
Crew_ID,Rule_ID,Rule_Type,Parameters_JSON,T1_Counter,...,T7_Counter,Description
```

建议使用：

- `Rule_ID=301`
- `Rule_Type=RESERVE_SHORT_CALL_TYPE`
- `Parameters_JSON={"action":"award|avoid","callType":"PRAM","dateScope":{"mode":"whole_month"}}`

### 保留在 `RESERVE_SCORE.csv`

Reserve `Short Call Type` (`propertyCode=301`) 且 `dateScope.mode` 为：

- `first_half`
- `second_half`
- `specific_dates`
- `date_range`

以及现有具体日期型 reserve 条件：

- `Reserve Day On` (`302`)
- `Reserve Prefer Off` (`311`)

这些条件可以被展开到具体 reserve pairing / reserve assignment，因此继续进入 `RESERVE_SCORE.csv`。

## 不做范围

- 不把 Reserve 页面条件迁移到 Line 页面。
- 不修改 UI 文案、表单字段、保存逻辑。
- 不新增独立导出文件。
- 不重写历史 bid 数据。

## 验收标准

1. `Short Call Type = PRAM + whole_month` 输出到 `LINE_RULES.csv`。
2. `Short Call Type = PRAM + whole_month` 不再输出到 `RESERVE_SCORE.csv`。
3. `Short Call Type = PRPM + specific_dates` 仍输出到 `RESERVE_SCORE.csv`。
4. `Short Call Type = PRPM + first_half` 仍输出到 `RESERVE_SCORE.csv`。
5. `LINE_RULES_README.md` 包含 Reserve `301` 的 Rule ID 说明。
6. 现有 DaysOff rule-level 归集、Line `Reserve` (`427`)、`Reserve / Flying Date Pattern` (`410`) 行为不变。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在算法导出两个 service 和对应测试，拆分会增加协调成本。
- Suggested split: 不拆分。
- Write boundaries: `pbs-server/src/services/algorithm-export/*` 与本设计文档。
- Conflict risk: 低到中；主要风险是 `301` 宽泛条件在两个 CSV 中重复导出。
- Execution gate: 用户已确认分类规则后实施。
