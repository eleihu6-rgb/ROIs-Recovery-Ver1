# AI 知识基建建设记录（2026-06-12）

> 决策快照：为什么建、建了什么、刻意没建什么。
> 起因：开发者担心"AI dev 没有数据模型映射（如 pairing 怎么对 flight），可能走最省事但错误的路径"，问如何为 AI 建立知识/记忆。

---

## 问题诊断

知识**不是缺失，是没被索引**：

- pairing↔flight 关系本就写在 `sql/schema/**.sql` 的 `comment on column`（中文，质量高），但**散在 9 个文件**，没有关系总图。
- `docs/architecture/database-design.md`（218 行）只讲约定（filiale/migration），**零实体关系内容**。
- 结果：每个 AI session 都要重新 grep 才能发现 join 方式——而"重新发现的成本 > 猜的成本"正是"最省事路径"风险的来源。

**核心结论**：让真相比猜测更便宜，AI 才会用真相。

---

## 关键原则：PUSH vs PULL（决定 AI 是否真的"知道"）

AI 只对"做决策那一刻在上下文窗口里的东西"有意识。知识进上下文只有两条路：

| 机制 | 加载方式 | 可靠性 | 容量 |
|---|---|---|---|
| **PUSH（常驻）** | 每 session 无条件注入：`CLAUDE.md`、`MEMORY.md` 索引 | 100%，不会漏 | 小 |
| **PULL（按需检索）** | 只有 AI 主动查询才加载：Memory MCP / 知识图谱 / 代码索引 | 取决于 AI 是否想起来查 | 大 |

**决策**：少数"必知"的高频陷阱用 PUSH（放进 `CLAUDE.md`，不会被漏）；大块导航资料用 PULL（doc，grep/Read 取）。不为知识图谱 / Memory MCP 付基建成本，直到规模逼迫——因为每个检索库都是一份会和 SQL 漂移的真相副本，越多越难维护（开发者已选择不加自动漂移检测）。

---

## 做了什么

### 1. `docs/architecture/data-model.md`（新建）— 数据关系总图
- 覆盖 live + scenario + pbs 三套 schema 的实体关系，**从 SQL 的 `foreign key ... references` + `comment on` 提取并核对**。
- 核心排班链 + 必读陷阱；明确"SQL 是唯一权威，doc 是导航"。
- **过程中修正了一处真实错误**（见下"教训"）。

### 2. `docs/architecture/codebase-index.md`（新建 + 当日扩展）— 代码归属索引
- §1-5：5 张核心表（flight/pairing/pairing_segment/roster_flight/crew）→ Drizzle model / service / route 文件，含跨表装配的高价值 JOIN 入口 + 缓存失效表。
- §6 scenario / §7 rule-engine / §8 pbs-server（当日按用户要求补全，覆盖原"暂未索引"缺口）。
- 由 Explore agent 调研（scenario/pbs/rule-engine 三路并行）+ **逐路径 `test -f` 核对存在**。要点：live-server 无独立 repository 层（查询写在 services/）；scenario 镜像表靠 `scenario_id` 列隔离非 search_path；pbs 读 live 核心表用裸 SQL 按业务号、无 FK、只读；live-server 经 HTTP 调 rule-engine(:3001)。
- 这是 data-model.md 的"代码侧对应物"：那份讲表怎么连，这份讲代码在哪。po/ro 引擎与 Python 法规引擎内部是黑盒，只索引到 engine-server 调用边界。

### 3. `CLAUDE.md` 数据库§设计规范（修改）— PUSH 注入
- 指向上述两份 doc。
- **内联 5 条高频陷阱**（常驻上下文，不可漏）：
  1. `pairing` 不直连 `flight`，须经 `pairing_segment`
  2. `roster_flight` 粒度 = 机组×航段
  3. `roster_flight.flt_id → flight` 是按值关联、**无 FK 约束**
  4. 机组 Base 来自 `crew_base`，非 `roster_flight.base`
  5. 地面任务 = `pairing_id IS NULL`

### 4. 跨 session 记忆（新建/更新）
- `memory/data-model-doc.md` + `MEMORY.md` 索引行：记录两份 doc 的存在与核心关系，供未来 session recall。

---

## 教训：声明式 FK ≠ 全部关系（开发者当场抓到的错）

初版 data-model.md 写了"crew attach to pairing, **not** flight"——错。原因：我只从**声明的 FK 约束**建图，而 `roster_flight` 只声明了 `fk_rf_crew` / `fk_rf_pairing`，于是漏掉了 `flt_id`。

实情：`roster_flight.flt_id → flight` 是真实关联，只是**未声明 FK**。`roster_flight` 粒度其实是**机组×航段**，存着只能在 crew×flight 粒度存的信息——最有力的证据是 `flight_acting_rank`（"在该航班实际担任的职级，可能与环槽位不同"）。

> **沉淀的规则**：只看 `foreign key` 约束会漏掉"按值关联但未建 FK"的列。判断关系要看列语义（`comment on column`）+ 用法，不能只看声明的约束。这条已写进 data-model.md 陷阱 3。

---

## 刻意没做（及触发条件）

| 没做 | 原因 | 何时再做 |
|---|---|---|
| Memory MCP | 已有文件记忆 + MEMORY.md 索引；~28 条用不上语义检索 | 记忆涨到数百条、grep 找不动时 |
| 知识图谱 | 此规模与 data-model.md 冗余；一次 Read 比查图便宜 | 关系多到 doc 撑不住，或要在图上建工具（影响分析/codegen） |
| 把 data-model.md 拆 6 个 chunk | 当前 ~250 行，单文件够用；Claude Code 是整文件 Read，拆分收益有限 | 某领域小节超 ~150 行时再拆 |
| 自动漂移检测测试 | 开发者本轮选择不加 | 维护契约改为：改核心表 FK 时手动同步两份 doc（已写进各自维护说明 + CLAUDE.md） |

---

## 给下一个 session 的契约

- 推理表关系前读 `data-model.md`；找代码入口读 `codebase-index.md`；**关系存疑以 `sql/schema/**.sql` 的 FK 为准**。
- 改核心表 FK / 加端点 → 同步更新对应 doc 的对应小节。
- codebase-index 已覆盖 live-server 核心表 + scenario + rule-engine + pbs-server；再扩展（如 connector-server、engine-server 内部）时沿用"路径 + 一句话"格式。
