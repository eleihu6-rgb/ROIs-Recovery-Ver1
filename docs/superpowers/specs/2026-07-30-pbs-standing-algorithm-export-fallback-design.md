# PBS Standing Bid 算法导出兜底设计

## 1. 背景

Standing Bid 已经具备独立页面、保存、编辑、Tier 展示和 NPBS `Default Bid` 导入能力：

- 当月 `Current Bid` 保存为目标月份、`bid_context=Current`。
- 长期 `Default Bid` 保存为 `period_code=STANDING`。
- Lineholder 长期条件保存为 `StandingLineholder`。
- Reserve 长期条件保存为 `StandingReserve`。

但当前真正提供算法压缩包的
`live-server/src/services/algorithm-export/` 仍只查询
`bid_context='Current'`。因此 Standing Bid 虽然已经保存到数据库，但尚未进入算法使用的
`.tgz` 包。

当前算法包结构为：

```text
DAYSOFF.csv
PAIRING_SCORE.csv
RESERVE_SCORE.csv
LINE_RULES.csv
LINE_RULES_README.md
```

本阶段需要完成 Standing Bid 的算法兜底，但不能改变上述文件名、CSV 表头、字段顺序或算法
解析契约。

## 2. 已确认业务规则

### 2.1 Crew 级整体优先级

每个 crew 在每个目标月份只能选择一套有效来源：

1. 当月 Current 至少包含一条正式 Bid 条件时，整套只使用 Current。
2. 当月 Current 为空时，使用完整 Standing 兜底。
3. 不允许按 Days Off、Pairing、Line、Reserve 分类混合 Current 与 Standing。
4. 不允许因 Current 中某个条件暂时无法转换为算法格式，就从 Standing 补同类条件。

例如：

- Current 只有 Days Off，Standing 还有 Pairing：只使用 Current，不补 Standing Pairing。
- Current 没有正式条件，Standing 同时有 Lineholder 和 Reserve：两套 Standing 一起使用。

### 2.2 完整 Standing

`StandingLineholder` 与 `StandingReserve` 都属于同一套 Standing 兜底：

- `StandingLineholder` 提供 Days Off、Pairing、Line 条件。
- `StandingReserve` 提供 Reserve 条件。
- 两者不是按 crew 当前身份二选一。
- 某个 Standing context 不存在或为空时，只表示该部分没有条件，不影响另一 context。

### 2.3 空 Current

`pbs_bid` 主记录只是 crew、月份、context、状态和草稿版本的容器，不代表用户已经保存正式
Current Bid。

下列情况都视为空 Current，应使用 Standing：

- 只有 `pbs_bid` 主记录，没有正式条件。
- 只有 Favorite。
- 用户打开页面或填写表单后离开，但没有保存条件。
- 用户曾保存条件，后来把正式条件全部删除。

Current 是否有效必须根据正式业务子记录判断，不能只判断 `pbs_bid` 主记录是否存在。

正式 Current 的判定依据为：

- 存在至少一条属于该 Current bid 的 `pbs_bid_group`；或
- 存在至少一条属于该 Current bid 的 `pbs_bid_day_off`。

Favorite 表不参与判定。`pbs_bid_pairing_occurrence` 依附于 `pbs_bid_group`，不单独把孤立
occurrence 视为有效 Current。

## 3. 目标

1. 算法包对每个 crew 执行 Current 优先、空 Current 使用 Standing 的整体来源选择。
2. Standing-only crew 能进入正常导出范围，不再因为没有 Current 主记录而被遗漏。
3. `StandingLineholder` 与 `StandingReserve` 按各自业务类型进入现有 CSV。
4. 所有 CSV 使用同一份有效来源决策，不允许各自得出不同结果。
5. 保持现有压缩包接口、文件结构和算法 CSV 契约不变。
6. 保留现有 crew filters、YEG 14 test package 和 Scenario package 的范围语义。
7. 通过自动化、远端 PostgreSQL 只读 SQL 验证和真实压缩包 smoke 证明无遗漏、无重复。

## 4. 非目标

- 不修改 PBS Portal 页面或 Standing 编辑交互。
- 不修改 `pbs-engine` 的 CSV 解析和优化逻辑。
- 不新增或修改数据库表、字段、索引、migration。
- 不把 Standing 复制为 Current。
- 不把 Current 与 Standing 合并计数。
- 不实现按 property/bid type 的 Standing 局部补齐。
- 不改变现有条件到 CSV 的转换规则。
- 不在算法包中新增来源清单文件，避免改变现有五文件契约。
- 不在本阶段处理用户主动把 Standing 复制到 Current 的功能。

## 5. 方案比较

### 方案 A：统一解析有效 Bid 来源，再复用所有导出器（采用）

在生成 CSV 前，集中解析每个 crew 的有效来源，并把解析结果传给所有导出器。

优点：

- Current/Standing 优先级只有一处权威实现。
- 所有 CSV 保证使用同一套来源。
- 不改变数据库和算法文件契约。
- 容易独立测试空 Current、Favorite-only 和 Standing-only。

代价：

- 需要调整现有导出器的查询 scope，使其按有效 bid id/context 读取。

### 方案 B：每个 CSV 导出器独立加入 Current/Standing SQL

优点：单个文件看起来改动直接。

缺点：判断会散落到 `DAYSOFF`、`PAIRING_SCORE`、`RESERVE_SCORE`、`LINE_RULES`，容易出现某个
CSV 把空 Current 当有效、某个 CSV 又使用 Standing 的灾难性漂移。

### 方案 C：导出前把 Standing 临时复制成 Current

优点：现有导出 SQL 改动少。

缺点：会产生数据库写入、审计污染、并发覆盖和清理风险，违反 Current 与 Standing 独立的
业务规则，因此不采用。

## 6. 数据流设计

### 6.1 候选 crew

未传入显式 scope 时，候选 crew 不再只来自目标月份的 Current 主记录，而是来自以下集合：

- 目标月份存在 Current 正式条件的 crew；
- `period_code=STANDING` 且存在 `StandingLineholder` 或 `StandingReserve` 正式条件的 crew。

最终仍只保留 live schema 中真实存在、并符合现有导出资格与筛选条件的 crew。没有 Current
也没有 Standing 正式条件的 crew 不产生业务行；各 CSV 仍保留表头。

传入显式 scope 时：

- YEG 14 package 保留固定 crew scope。
- Scenario package 保留调用方传入的 crew scope。
- crew filters 继续与显式 scope 取交集。
- 有效 Bid 来源解析只在最终 crew scope 内执行，不能扩大调用方指定范围。

### 6.2 统一有效来源解析

新增一个算法导出内部来源解析单元，输入：

- 目标 `periodCode`；
- 最终候选 `crewIds`。

输出每个 crew 的有效来源：

```text
Current:
  currentBidId

或

Standing:
  standingLineholderBidId?
  standingReserveBidId?
```

解析顺序：

1. 查询目标月份 `bid_context=Current` 的 bid。
2. 使用 `pbs_bid_group` / `pbs_bid_day_off` 判断 Current 是否包含正式条件。
3. Current 非空时，选择 Current，并忽略该 crew 的全部 Standing。
4. Current 为空时，读取 `period_code=STANDING` 下的
   `StandingLineholder` 与 `StandingReserve`。
5. Standing context 只有在包含正式 `pbs_bid_group` 时才进入结果。
6. 三个目标都为空时，该 crew 的来源结果为空，不产生业务行。

来源选择必须以稳定 bid id 作为后续查询边界，而不是仅传 crew id 后在每个导出器中重新判断
context。

### 6.3 CSV 映射

| 有效来源 | DAYSOFF.csv | PAIRING_SCORE.csv | RESERVE_SCORE.csv | LINE_RULES.csv |
|---|---|---|---|---|
| Current | Current Days Off | Current Pairing | Current Reserve | Current Line、可转 Line Rule 的 Days Off / Reserve |
| Standing | StandingLineholder Days Off | StandingLineholder Pairing | StandingReserve | StandingLineholder Line / Days Off 与 StandingReserve Reserve Rule |

Standing 的数据库 period 固定为 `STANDING`，但算法转换使用调用方请求的目标月份：

- Day of Week 等长期条件按目标月份展开。
- Pairing 条件只评价目标月份的候选 pairings。
- whole-month / half-month 等相对范围按目标月份解释。
- 不把 `STANDING` 当成真实日历月份传给日期转换器。

### 6.4 导出器边界

`algorithm-export-service` 负责：

- 最终 crew scope；
- 有效来源解析；
- 把同一份来源 scope 传给四个 CSV loader；
- 打包现有五个文件。

各 CSV loader 负责：

- 只读取来源 scope 中允许的 bid id；
- 复用现有条件转换、排序、Counter 聚合和 CSV escape；
- 不再自行决定 Current/Standing 优先级。

来源解析结果不得写回数据库，也不得通过临时表或复制 Current 实现。

## 7. 筛选与范围规则

现有 division、status、base、fleet qualification filters 保持不变，但候选数据源必须覆盖
Standing-only crew。

筛选顺序固定为：

1. 取得当前导出入口允许的 crew 范围；
2. 应用现有 crew filters；
3. 对筛选后的 crew 解析 Current/Standing 来源；
4. 为有有效来源的 crew 生成 CSV。

不能继续通过 `Current pbs_bid` 与 `pbs_user` 的 inner join 决定全部筛选候选，否则
Standing-only crew 会在来源解析前就被丢弃。

## 8. 错误与可观测性

- Current 中只要存在正式条件，就必须整体选择 Current；即使某个 Current property 不受当前
  CSV converter 支持，也不能静默改用 Standing。
- property 转换失败继续使用现有明确 skip/error 语义，不改变来源优先级。
- 同一 crew 不得同时出现在 Current 与 Standing 查询结果中。
- 同一 bid id 不得被重复传给同一 CSV loader。
- 来源解析异常应使本次导出失败并返回现有管理端错误响应，不生成半套压缩包。
- 服务端可记录经过清理的聚合计数：
  - Current crew 数；
  - Standing fallback crew 数；
  - 无有效 Bid crew 数。
- 不记录具体 Bid payload、机组个人信息或原始条件文本。
- 不新增算法包文件，不向算法暴露内部 `bid_context`。

## 9. 测试与验收

### 9.1 有效来源解析测试

必须覆盖：

1. Current 有 `pbs_bid_group`，同时有 Standing：只选 Current。
2. Current 只有 `pbs_bid_day_off`，同时有 Standing：只选 Current。
3. Current 只有主记录：选择 Standing。
4. Current 只有 Favorite：选择 Standing。
5. Current 的正式条件全部删除：选择 Standing。
6. Current 包含暂不支持导出的正式 property：仍选择 Current，不补 Standing。
7. Current 为空，两个 Standing context 都有条件：两者都选择。
8. Current 为空，只有一个 Standing context：只选择存在的 context。
9. Current 与 Standing 都为空：不产生来源。
10. 五月 Current 不影响六月来源选择。

### 9.2 CSV loader 测试

- `DAYSOFF.csv`：Current 与 StandingLineholder 分别可输出，但同一 crew 不混用。
- `PAIRING_SCORE.csv`：Standing 条件只作用于目标月份 pairings。
- `RESERVE_SCORE.csv`：StandingReserve 可输出，Current 存在时不会重复。
- `LINE_RULES.csv`：StandingLineholder 与 StandingReserve 的相应规则都能进入现有格式。
- Tier Counter 保留 T1-T7，不因来源切换重新编号或压缩。
- 所有 CSV 的表头、列顺序、排序和 escape 行为保持不变。

### 9.3 整包与范围测试

- Archive 仍严格包含现有五个文件。
- 普通 Current package 包含 Standing-only crew。
- filters 能筛选 Standing-only crew。
- YEG 14 与 Scenario package 使用同一来源规则。
- 显式 Scenario crew scope 不被 Standing 候选集合扩大。
- Current/Standing 不产生重复 crew counter。

### 9.4 SQL 与真实链路门禁

本次会修改动态 SQL 查询，必须遵守
`docs/modules/database/generated-sql-safety-standard.md`：

- fixture / SQL 结构完整性测试；
- 使用远端 PostgreSQL 对关键查询执行 `EXPLAIN` 或最小只读执行；
- 从真实 HTTP 入口生成 `.tgz` smoke；
- 解压后检查五个文件、表头、代表性 Current crew、空 Current fallback crew 和
  Standing-only crew；
- 对同一 crew 证明 Current 与 Standing 没有同时计数。

不得使用本地空 schema 作为业务验收依据。

## 10. 完成标准

- Current 有正式条件时，算法包只包含该 crew 的 Current 结果。
- Current 为空时，算法包使用该 crew 的完整 Standing 结果。
- Favorite-only 不阻断 Standing。
- `StandingLineholder` 与 `StandingReserve` 在 fallback 时共同生效。
- Standing-only crew 不被普通导出或 crew filters 遗漏。
- 四个 CSV 对同一 crew 使用相同来源。
- 压缩包结构和算法 CSV 契约完全不变。
- 相关 Vitest、整包测试、动态 SQL 远端验证和真实 HTTP smoke 全部通过。
- 不修改数据库 schema、PBS Portal 或 `pbs-engine`。

## 11. 预计影响范围

主要修改范围：

- `live-server/src/services/algorithm-export/algorithm-export-service.ts`
- `live-server/src/services/algorithm-export/export-scope.ts`
- `live-server/src/services/algorithm-export/days-off-export.ts`
- `live-server/src/services/algorithm-export/pairing-score-export.ts`
- `live-server/src/services/algorithm-export/reserve-score-export.ts`
- `live-server/src/services/algorithm-export/line-rules-export.ts`
- 对应 Vitest 与算法包测试
- `docs/test-cases/pbs/algorithm-export/` 下的人工 QA 用例

不修改：

- `pbs-server`
- `pbs-portal`
- `pbs-engine`
- `sql/schema` 与 migration

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 来源选择必须成为四个 CSV 的单一权威，同一批测试夹具和 package scope 紧密耦合，拆分实现容易产生不同来源判断。
- Suggested split: 不拆分；按来源 resolver → loader scope → archive tests → 远端 smoke 顺序实施。
- Write boundaries: `live-server/src/services/algorithm-export/**`、对应测试和 PBS algorithm export QA 文档。
- Conflict risk: 中等；多个导出器共用 scope 契约，若并行修改容易发生接口冲突。
- Execution gate: 本 Spec 经用户书面确认后，才编写实施计划并开始代码修改。
