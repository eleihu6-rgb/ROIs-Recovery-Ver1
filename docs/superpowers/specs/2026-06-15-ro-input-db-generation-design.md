# RO Input 文件由 PostgreSQL 生成 — 设计文档

> 状态：设计已确认，待评审
> 日期：2026-06-15
> 模块：engine-server（LegacyRO 流程）
> 关联：替换 `engine-server/src/utils/legacy_java_client.py` 的 `fetch_ro_input`（临时从 Java server 抓取）

## 1. 背景与目标

当前 `LegacyRO` 优化流程通过临时方案获取优化器输入：`task_manager._fetch_input_legacy_java()`
登录旧 Java server（`http://localhost:8011`），调用 `/api/orengine/ro/comptxt`（传 `javaScenarioId`，
默认固定 `114`），把返回的 `ro_input.gz` 直接落到优化器工作目录。

目标：**改为直接从 PostgreSQL（航司 schema，如 `f8`）提取数据，构造出内容等价的 `ro_input.gz`**，
不再依赖 Java server。

### 交付物边界（重要）

- 本项目**只负责产出 `ro_input.gz`**（其解压即主文件 `ro_input.txt`，约 23.6k 行、~60 个 section）。
- 其余产物（`ro_input_pairing.txt` / `ro_input_crew.txt` 等可读 dump、`output/`、`output.gz`）
  **由优化器运行本身产生**，不在本项目范围内。

## 2. 已确认的关键决策

| 决策点 | 选择 |
|---|---|
| **保真度** | **功能等价**：生成文件能被 RO 优化器正确解析并产出合理结果即可。Java golden 文件用作**字段级参照**，**不要求**逐字节/排序/派生字段完全一致。 |
| **集成方式** | **加开关，保留 Java 路径**：新增 `parameters.inputSource = 'db' \| 'java'`。`db` 走 Postgres 构造，`java` 走现有 `_fetch_input_legacy_java`。bring-up 期间两路并存、并排 diff，确认后再把默认值切到 `db`。 |
| **section 范围** | **全部 ~60 个 section 完整复现**（与 golden 同名、同列、同顺序）。部分无优化器消费方的 section 只能靠 golden 字段比对验证，无法靠运行验证。 |
| **架构** | **声明式 section registry**（方案 A）。 |

## 3. 现状事实（已核对）

- **目标格式**：`ro_input.gz` 解压为单一 `ro_input.txt`，由 ~60 个 section 顺序拼接。
  每个 section：
  - 头行：`------SectionName(rowCount)[(variant)]:col1,col2,...`（列名为 camelCase 旧命名）
  - 数据行：`^` 分隔的字段值
  - variant 标记示例：`(COF)` `(Client)` `(Read)` `(ALL)`（同名 section 的不同子集）
- **优化器入口**：`engine-server/F8/legacy_ro.sh <working_dir> <input_gz_path>`：
  1. `zcat input.gz > ro_input.txt`
  2. 跑外部 PBS column-based 优化器（`/home/piercrew/software/rostering_algorithm/PBS_column_based_algorithm/run_solver.py`，
     conda env `flair-pbs-env`，`data=ro_input.txt`）
  3. `legacy_ro_converter.py` 把旧格式 txt 转新 `##` CSV gz
  → 故**优化器实际消费的是 `ro_input.txt`**，本项目产出 gz 即可。
- **格式参照**：`engine-server/F8/legacy_ro_converter.py` 已实现旧格式解析逻辑，是各 section 字段结构的精确参照。
- **golden 参照**：`engine-server/complete/F8/6_*/ro_input.txt` 为历史从 Java 抓取的 scenario 6 输入，作字段级基线。
- **scenario 映射**：新系统 scenario 6 ↔ Java workset 114。

## 4. 架构（方案 A：声明式 section registry）

新建包 `engine-server/F8/ro_input_builder/`，两种调用方式：

- **CLI**（独立验证用）：
  `python -m F8.ro_input_builder --airline f8 --scenario 6 --out ro_input.txt [--gz input.gz]`
- **task_manager 开关**：`parameters.inputSource = 'db'` 时调用新 `_generate_input_from_db()`，
  构造 `ro_input.txt` → gzip 为工作目录下 `input.gz`；`'java'` 维持现状。默认 `'java'`，bring-up 通过后切 `'db'`。

模块组成：

| 文件 | 职责 |
|---|---|
| `emitter.py` | 通用发射器：接收 section spec，运行其数据源，写出 `------Name(count)[(variant)]:cols` 头行 + `^` 拼接数据行。**集中**所有格式化：日期→`YYYY-MM-DDThh:mm:ss`、null→空串、小数、bool→0/1。 |
| `registry.py` | 60 个 section spec 的**有序**列表（顺序 = golden 顺序，精确一致）。 |
| `sections/` | 各 section 的 SQL 字符串 / 自定义构造函数，按域分组。 |
| `db.py` | 按航司 schema 建立 psycopg2 连接（复用 `Database_connection.txt` / 环境变量，与 converter 一致）。 |
| `mapping.py` | 各 section 的 camelCase(旧) ← snake_case(DB) 列名映射。 |

每个 section spec 声明：section 名、variant、输出列（有序）、数据源（SQL 查询或自定义构造函数）。
简单 section 用纯 SQL + 列映射；难 section（pairing 层、manday）用自定义构造函数。

## 5. Section 分类与数据来源（全 60 个）

- **直接映射的参照类**（~25）：`Airport×2, City, Fleet, Base, Rank, RankActing, RankPosition,
  Composition, CompositionRank, RankCombinationCriteria, RankCombination, Team, Dictionary,
  SystemParameter, Assignment×2, AssignmentGroup, AssignmentGroupMap, AssignmentOverlappable,
  GuaranteeFlyHours, CalculationManday, PaneHeader, RosterPeriod, Workset`
  → 单表 → 列改名。
- **Crew 域**（scenario 子集 + `(COF)` 变体）：`Crew, CrewRank, CrewBase, CrewFleet,
  CrewQualification, CrewStatus, CrewCertificate, CrewOnFlight`。golden 中存在两套 crew
  （scenario 26 人 / COF 124 人）——其**圈选规则**在 P2 阶段确定。
- **Flight**：`Flight, FlightComposition`。
- **Rules**（已确认来源）：`RuleSet, Rule×2（scenario + ALL）, RuleParameter×2, Cqf, CqfParameter`
  ← `rule_set / rule / rule_parameter`（+ cqf 相关表）。
- **Pairing 层（变化部分，核心难点）**：
  - `Pairing` ← `pairing` 表
  - `PairingComposition` ← `pairing_composition` 表
  - `PairingDuty` ← `pairing_segment` 上 `DISTINCT ON (pairing_id, duty_seq)`（每 duty 一行；`duty_*` 字段已内嵌冗余）
  - `PairingDutySegment` ← `pairing_segment` 逐行（seg 级字段）
  - `PairingDutyNode` ← 由 `pairing_segment` 内嵌的 `pickup/brief/debrief/dropoff_*_utc`
    及 `double_*` 列**炸开重建**为离散 node 行（type + 段关联）
  > 新 schema 把旧 `PairingDuty / PairingDutyNode / PairingSegment` 三层合并为宽表 `pairing_segment`，
  > 同 `duty_seq` 行的 `duty_*` 值完全相同；node 信息以列形式内嵌。三个旧 section 均可由此表重建。
- **Roster 层**：`Roster, RosterFlight ← roster_flight, RosterGround`。
- **计算/聚合类**：`CrewMandayFd ← crew_manday_fd_daily, CrewMonthManday ← crew_manday_fd_monthly,
  CalculationManday, FatigueResult（空，count=0）, Scenario`。

## 6. 验证策略（遵守 §No-Illusion）

1. **section 比对 harness**：对每个 section，与 scenario 6 golden 比对：section 存在、列头完全一致、
   行数在合理范围、对稳定键（id / label）做字段级抽查。每阶段运行。
2. **端到端**：把生成的 `input.gz` 喂给真实优化器（`legacy_ro.sh`），断言能解压、能解析、
   产出非空 `ro_output.txt`。**这是验收闸门**。
3. 本项目为后端（无 UI），测试用 `engine-server/tests/` 下 pytest，不用 Playwright。

## 7. 分阶段计划（每阶段 = 独立可验证里程碑）

- **P0** 脚手架：包结构、`emitter`、`registry` 框架、`db.py`、CLI、task_manager 开关接线、section diff harness。
- **P1** 直接映射参照类（~25 个）。
- **P2** Crew 域 + COF 变体 + 圈选规则确定。
- **P3** Flight + FlightComposition。
- **P4** Rules（RuleSet / Rule / RuleParameter / Cqf）。
- **P5** Pairing 层（含 PairingDutyNode 重建）——最难。
- **P6** Roster 层。
- **P7** 计算/聚合类（mandays、Scenario、Workset、FatigueResult）。
- **P8** 按 golden section 顺序整文件组装 → 端到端优化器运行 → 默认值切到 `db`。

## 8. 待规划阶段解决的开放项（显式标记，避免静默）

- Crew 域 26 人 vs 124 人（COF）两套子集的精确圈选规则。
- `PairingDutyNode` 优化器期望的 node `type` 代码与 `sequence` / 段关联（`fromSegmentId` / `toSegmentId`）的精确构造。
- 各 manday 列与 `crew_manday_fd_*` 列的 1:1 映射确认（哪些可直接取、哪些需计算或可置零）。
- 同名 section 多 variant（`(COF)` / `(Client)` / `(Read)` / `(ALL)`）各自的数据范围定义。

## 9. 不在范围内

- 不产出优化器运行副产物（dump txt、output.gz）。
- 不改动 `legacy_ro_converter.py` 的输出格式。
- 不改 `sql/schema/`（只读取）。
- Java server 路径（`_fetch_input_legacy_java`）保留，仅在默认切换后可考虑后续清理。

## 10. 版本号影响

engine-server 属后端模块，落地实现时 `gantt/src/version.ts` 的 `BACKEND_VERSION` +1。
