# PBS Award 发布快照 Credit 与航段 Fleet 完整性设计

日期：2026-07-28

状态：已完成需求确认，待用户审阅正式 spec 后批准实施

相关模块：`sql`、`live-server`、`pbs-server`、`pbs-portal`、`e2e`

目标页面：PBS Portal `/award`

## 1. 背景

PBS Award 页面当前能够展示已发布的整月 roster，但真实页面仍反复出现以下缺失状态：

- 月度 `Credit Hours` 显示 `Missing data`。
- Pairing 行的 `Credit` 显示缺失。
- Selected Duty 的航段 `CRD` 和底部总 `CREDIT` 显示缺失。
- Selected Duty 的航段 `Fleet` 显示缺失。
- 页面显示发布快照缺少 duty credit 和 leg equipment 的黄色警告。

本轮已核对 Portal、PBS Server、发布逻辑、tracked schema 和远端 PostgreSQL 权威库。缺失原因不是 Award 页面无法计算，而是 `roster_publish` 发布快照没有完整保存源数据：

1. `roster_publish.act_credited_minutes`、`sch_credited_minutes` 字段已经存在，但当前发布记录为 `NULL`。
2. 对应 Credit 已存在于 `pairing_segment.duty_act_credited_minutes` / `duty_sch_credited_minutes`。
3. `pairing_segment.fleet_seg` 已有真实航段机型，例如 `7M8`，但 `roster_publish` 没有航段级 `fleet_seg` 快照字段。
4. Award API 必须保持 publish-only，只能读取 `roster_publish`，不能在运行时 join live 原表补数据。
5. 除 Live Server 正式发布外，`pbs-server/src/scripts/sync-roster-publish-from-roster-flight-core.ts`
   也会 insert/upsert `roster_publish`；两条写入路径必须采用同一 Credit/Fleet 规则。

远端样例 `crew_id=19`、`Jun 2026`：

- Pairing `T4528 #10924` 的两条 `roster_publish` Credit 均为 `NULL`。
- 源表 `pairing_segment.duty_act_credited_minutes=485`，即 `8:05`。
- 源表 `pairing_segment.fleet_seg=7M8`。
- 该 crew 当月 8 个 pairing 的正确总 Credit 为 `4629` 分钟，即 `77:09`。

## 2. 目标

1. Award 页面从发布快照读取真实 Duty Credit 和航段 Fleet。
2. 当前页面所有由这两类数据引起的 `Missing data`、`Missing...` 和黄色缺失警告全部消失。
3. 保持 Award API 的 publish-only 边界。
4. 保持当前页面布局、交互和其他业务语义不变。
5. 为现有发布数据提供安全、幂等、可验证的回填方式。
6. 后续新发布的 roster 自动包含完整 Credit 和航段 Fleet，不再产生同类缺失。

## 3. 非目标

- 不实现 Reason Report。
- 不生成或发布 `pbs_award_result` / `pbs_award_item`。
- 不新增 Premium/PRM、Tier、Priority、PN/CN 或 Seat 功能。
- 不按 AA Award 页面重做布局。
- 不改变 Day Off 行中业务上不适用的 `--`。
- 不让 PBS Award API 运行时 join `pairing_segment`、`pairing`、`flight` 或 `roster_flight`。
- 不覆盖发布快照中已经存在的非空 Credit 或 Fleet 数据。

## 4. 数据语义

### 4.1 Duty Credit

Duty Credit 是一个完整 duty 按薪酬、合同或积分规则计算得到的 credited time，不等于 Block Time，也不是每个 flight leg 独立相加的时间。

一个 duty 的 Credit 会在该 duty 的多个 `pairing_segment` 行上重复保存。因此：

- 快照可以把 duty credit 复制到每个航段行。
- Award 汇总必须继续按 `pairing_id + duty_seq` 去重，每个 duty 只计算一次。

发布字段沿用现有列，不新增重复列：

```text
roster_publish.act_credited_minutes
roster_publish.sch_credited_minutes
```

### 4.2 航段 Fleet

新增字段：

```sql
fleet_seg varchar(10)
```

含义：

> 发布快照中的航段机型/子机队代码，来源 `pairing_segment.fleet_seg`，表示具体 flight leg 计划使用的 equipment/fleet，例如 `7M8`。

它与 `roster_publish.pairing_fleet` 不同：

- `pairing_fleet` 是 pairing 层级的宽泛机队类别，例如 `737`。
- `fleet_seg` 是具体航段的机型代码，例如 `7M8`。

不得用 `pairing_fleet` 伪装成航段 Fleet。

## 5. 推荐方案

采用“发布时补齐快照 + 现有数据幂等回填 + Award 继续只读快照”的方案。

不采用以下方案：

- Award API 运行时 join `pairing_segment`：违反 publish-only 边界。
- 前端隐藏 `Missing`：只遮盖数据质量问题。
- 为 Credit 新增重复字段：现有字段已经能够表达正确语义。

## 6. Schema 与 Migration

### 6.1 Tracked Schema

在 `sql/schema/live/02-crew-roster.sql` 的 `roster_publish` 中增加：

```sql
fleet_seg varchar(10)
```

增加列注释，明确字段来源和语义。

同时更新现有 Credit 列注释，准确描述新的数据血缘：

- `act_credited_minutes`：优先来自 `roster_flight.act_credited_minutes`，为空时来自
  `pairing_segment.duty_act_credited_minutes`。
- `sch_credited_minutes`：优先来自 `roster_flight.sch_credited_minutes`，为空时来自
  `pairing_segment.duty_sch_credited_minutes`，仍为空时来自
  `pairing_segment.duty_act_credited_minutes`。

注释仍须明确 PBS Award 运行时禁止 join live 原表。

### 6.2 Migration

新增幂等 migration：

- 使用 `add column if not exists` 增加 `fleet_seg`。
- 添加或更新列 comment。
- 包含幂等回填 SQL。
- 回填只处理目标字段为 `NULL` 的记录。
- 回填关联使用：

```text
roster_publish.pairing_id = pairing_segment.pairing_id
roster_publish.duty_seq   = pairing_segment.duty_seq
roster_publish.seg_seq    = pairing_segment.seg_seq
pairing_segment.is_deleted = 0
```

回填规则：

```text
fleet_seg
← pairing_segment.fleet_seg

act_credited_minutes
← pairing_segment.duty_act_credited_minutes

sch_credited_minutes
← pairing_segment.duty_sch_credited_minutes
← 若 scheduled credit 为空，则 fallback 到 duty_act_credited_minutes
```

必须保留 `roster_publish` 中已有的非空值。

### 6.3 远端执行边界

实现阶段可以创建、验证 migration 和回填脚本，但不得未经单独确认直接修改远端业务库。

远端验证必须先执行只读检查和 `EXPLAIN`/最小只读查询。实际 migration/backfill 执行需要用户明确批准。

## 7. `roster_publish` 写入流程

### 7.1 Live Server 正式发布

更新 `roster_publish` Drizzle model，增加 `fleetSeg` 映射。

更新 Roster Publish 的 `applyInsertSql()`：

```text
fleet_seg
← pairing_segment.fleet_seg
```

Credit 优先级：

```text
act_credited_minutes
← roster_flight.act_credited_minutes
← 为空时 pairing_segment.duty_act_credited_minutes

sch_credited_minutes
← roster_flight.sch_credited_minutes
← 为空时 pairing_segment.duty_sch_credited_minutes
← 仍为空时 pairing_segment.duty_act_credited_minutes
```

现有发布查询已经按 `pairing_id + duty_seq + seg_seq` join `pairing_segment`，本轮复用该关联，不增加新的运行时数据源。

发布后生成的 `roster_publish` 必须包含：

- duty/segment 稳定序号；
- duty credit；
- 航段 fleet；
- 现有 pairing-level fleet。

### 7.2 PBS Server 同步脚本

同步更新
`pbs-server/src/scripts/sync-roster-publish-from-roster-flight-core.ts`，
使脚本的 insert 和 conflict update 与 Live Server 使用相同数据语义：

- join `pairing_segment` 后写入 `fleet_seg`。
- Credit 使用第 7.1 节相同的 fallback 顺序。
- conflict update 不得用新一轮同步中的 `NULL` 覆盖快照中已有的非空
  Credit/Fleet。
- 脚本重复执行必须幂等。

该同步脚本的测试必须覆盖首次写入、重复同步、fallback，以及“已有非空值不被
`NULL` 覆盖”。两条写入路径不得各自定义不同的 Credit/Fleet 口径。

## 8. PBS Server Award API

更新 Award roster query 和内部类型：

- 从 `roster_publish` 读取 `fleet_seg`。
- 不增加任何 live 表 join。
- 将 `fleet_seg` 映射到现有 `PbsAwardLeg.equipment`。
- `equipmentMissing` 仅在快照确实仍为空时为 `true`。
- 所有 Award 消费位置统一使用 Credit 优先级：actual 优先、scheduled 其次。
- Pairing 汇总、Roster Details、Selected Duty 航段 `CRD` 和底部总 `CREDIT`
  必须使用同一优先级；需要修正当前航段 `CRD` 的 scheduled-first 行为。
- 多航段 duty 继续按 `duty_seq` 去重。

共享 contract 已存在：

```text
PbsAwardLeg.equipment
PbsAwardLeg.equipmentMissing
PbsAwardItem.creditMinutes
PbsAwardItem.creditMissingReason
```

因此本轮预计不需要增加新的 Award API 展示字段，只需正确填充现有字段。

## 9. PBS Portal

不改变现有 Award 页面结构。

数据完整后，现有 UI 应自动实现：

- 月度 `Credit Hours` 显示真实总 Credit。
- Roster Details 的 Credit 显示真实 duty credit。
- Selected Duty 底部 `CREDIT` 显示去重后的 duty credit。
- 航段 `Fleet` 显示 `7M8` 等真实值。
- 缺失数据黄色警告消失。
- 页面不再显示由 Credit/Fleet 引起的 `Missing data`。

如果源数据经过发布和回填后仍为空，页面继续保留显式数据质量状态，不能静默伪造；验收数据必须证明本轮目标样例不再触发该状态。

## 10. 错误与数据质量处理

- Migration/backfill 不得覆盖非空快照。
- 一条发布记录匹配多个 active `pairing_segment` 时必须失败或在验证中暴露，不能静默任选一条。
- 无法匹配源 segment 的发布记录必须进入验证结果，不能伪造 `pairing_fleet` 作为 `fleet_seg`。
- Credit 的 duty 去重规则保持不变。
- 不向用户暴露 SQL、异常对象或内部诊断。
- 页面缺失状态继续使用现有持久警告区域，不新增散落红字或重复 toast。

## 11. 验证计划

### 11.1 Schema / Migration

- 校验 tracked schema 和 migration 列定义一致。
- migration 重复执行不报错。
- 回填第二次执行不改变数据。
- 非空 Credit/Fleet 不被覆盖。
- 远端 PostgreSQL 执行只读匹配检查和必要的 `EXPLAIN`。

### 11.2 发布与同步写入路径

- 新发布的 flying rows 保存 `fleet_seg`。
- `roster_flight` Credit 非空时优先保留。
- `roster_flight` Credit 为空时从 `pairing_segment` 补齐。
- 多航段 duty 每行保存同一 duty credit。
- Ground rows 不被错误填入 flying fleet/credit。
- PBS Server 同步脚本使用相同 fallback，并且 upsert 不以 `NULL` 覆盖非空快照。

### 11.3 PBS Server

- Award query 只读取 `roster_publish`。
- API 返回真实 `equipment`。
- Pairing Credit 按 `duty_seq` 去重。
- 当 actual 与 scheduled 同时非空且数值不同时，Pairing、航段 `CRD` 和 Duty
  总 Credit 均选择 actual，显示结果一致。
- 不 join `pairing_segment`、`pairing`、`flight`、`roster_flight`。
- Route、时区、DO、Activity 现有行为不回归。

### 11.4 PBS Portal

- Award 页面不再显示 Credit/Fleet 的 `Missing data`。
- Summary、Roster Details、Selected Duty 的 Credit 一致。
- Fleet 显示具体航段代码。
- 页面布局保持不变。

### 11.5 Playwright / QA

Playwright 必须通过真实 UI 打开 `/award`，验证：

- `T4528 #10924` Credit 为 `8:05`。
- 两个航段 Fleet 均为 `7M8`。
- crew `19`、Jun 2026 月度 Credit 为 `77:09`。
- 页面不存在 Credit/Fleet 引起的 `Missing`。
- Day Off 的不适用字段保持当前语义。

新增 QA 测试案例：

```text
docs/test-cases/pbs/award/2026-07-28-award-published-credit-fleet-completeness.md
```

### 11.6 两阶段交付与远端验收门槛

实施与验收分为两个明确阶段：

**阶段 A：不修改远端业务库**

- 完成 schema、migration、两条发布/同步写入路径、Award API、测试和 QA 文档。
- 完成 migration 静态检查、fixture/本地结构测试、远端只读匹配检查及
  `EXPLAIN`。
- 使用测试 fixture 验证 Award API 和 Playwright 行为。
- 此阶段不得宣称远端样例已完成最终验收。

**阶段 B：用户另行批准远端写入后**

- 执行远端 schema migration 和幂等 backfill。
- 运行远端数据核对。
- 通过真实 UI 对 crew `19`、Jun 2026、`T4528 #10924` 执行最终
  Playwright/人工验收。
- 只有阶段 B 的远端样例检查通过后，才能宣称本 spec 的最终验收完成。

## 12. 验收标准

1. `roster_publish` 新增 `fleet_seg varchar(10)`。
2. Credit 使用现有字段，不新增重复 Credit 列。
3. 新发布数据自动包含 Credit 和航段 Fleet。
4. 已有发布数据可通过幂等 migration/backfill 补齐。
5. `T4528 #10924` 显示 Credit `8:05`、Fleet `7M8`。
6. crew `19`、Jun 2026 显示月度 Credit `77:09`。
7. Award 页面不再出现由 Credit/Fleet 引起的任何 `Missing`。
8. Award API 仍然只读取 `roster_publish`。
9. 不改变 Reason Report、AA Tier/Priority/Premium 等后续功能。
10. 自动化测试、Playwright 和 QA 测试案例均有明确 PASS 记录。
11. 未获远端写入批准时，交付状态只能是“代码与非远端验证完成，等待远端
    migration/backfill 验收”；不得宣称样例页面已经最终修复。

## 13. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: schema、发布映射、回填、Award API 和 UI 验收围绕同一字段契约强耦合，拆分容易造成字段来源和回填口径不一致。
- Suggested split: 不拆；主 agent 按 schema/migration → publish → Award API → Portal/tests 的顺序单线完成。
- Write boundaries: `sql`、`live-server` Roster Publish、`pbs-server` Award、`pbs-portal` Award、`e2e` 和对应 QA 文档。
- Conflict risk: Medium。当前工作区存在与本任务无关的未提交改动，提交时必须只 stage 本任务文件。
- Execution gate: 用户审阅并明确批准本正式 spec 后，才能进入实施计划与代码修改。
