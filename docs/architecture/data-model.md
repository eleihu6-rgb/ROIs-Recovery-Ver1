# 数据模型与表关系图（Data Model & Relationships）

> ROIS-AI 核心表关系图。**AI 在推理任何"表 A 怎么关联表 B"之前，先读本文件。**
>
> 本文件的关系全部从 `sql/schema/**.sql` 的 `foreign key ... references` 与 `comment on` 提取、**对照 SQL 验证**，不是凭记忆编写。改动 schema 的 FK / 新增核心表时，同步更新本文件。
>
> 字段级语义见 schema 文件里的 `comment on column`（中文，质量很高）；本文件只讲**实体之间怎么连**。

---

## 0. 三套 Schema 的关系

| Schema 文件 | 用途 | 与 live 的关系 |
|---|---|---|
| `sql/schema/live/*.sql` | 实时运行库（真实排班） | 权威来源 |
| `sql/schema/scenario/01-scenario-tables.sql` | 优化场景快照 | `flight` / `pairing` / `pairing_segment` / `roster_flight` / `crew_manday_*` 是 live 同名表的**结构镜像**，按场景隔离。关系图与 live 完全一致 |
| `sql/schema/pbs/01-pbs.sql` | PBS 投标/分配 | **独立子系统**，自有 `pbs_*` 表；只通过 `crew` / `pairing` 业务编号（非 FK）与 live 弱关联 |

> scenario 库不要被当成新模型——它就是 live 的核心排班链按 `scenario` 切片。下面第 1 节的关系对 live 和 scenario **都成立**。

---

## 1. 核心排班链（你最常问的部分）

这是"pairing 怎么映射 flight、crew 怎么挂上去"的权威答案。

```
                    ┌─────────────┐
                    │   flight    │  航班主表 (id)
                    │  航班计划/实际 │
                    └──┬───────┬──┘
        flt_id         │       │  flt_id（roster_flight.flt_id，**非 FK 约束**，
     (fk_ps_flight)    │       │   按值关联；地面任务为 null）
                       │       └──────────────────────────┐
                ┌──────┴───────────┐                       │
   pairing_id   │ pairing_segment  │  环行宽表：1 行=1 航段   │
 (fk_ps_pairing)│  排班计划侧        │  (合并旧 Duty/Node/Seg) │
          ┌──┤  └──────────────────┘                       │
          │  └──────┐                                       │
   ┌──────┴──────┐  │ pairing_id (fk_rf_pairing)            │
   │   pairing    │  │   NULL = 地面任务（无环）              │
   │ 环头表 (id)   │  ▼                                       │
   │ 1环=多segment│ ┌────────────────┐                       │
   └─────────────┘ │ roster_flight   │  排班宽表（执行侧）     │
                   │ **1 行 = 1 机组  │←──────────────────────┘
                   │  × 1 航段**       │   每行存"这名机组在这个航班上"的
                   │ 飞行+地面共用     │   信息：flight_acting_rank/position/
                   └──────┬─────────┘   seq_order/起降时间/积分/津贴/起降站
                          │ crew_id (fk_rf_crew)
                   ┌──────┴──────┐
                   │    crew      │  机组主表 (crew_id)
                   └─────────────┘
```

> **两条到 flight 的路径，不要混淆：**
> - **计划侧**：`pairing → pairing_segment.flt_id → flight`（环的航段构成，FK 约束 `fk_ps_flight`）。
> - **执行侧**：`roster_flight.flt_id → flight`（某机组实际飞了哪个航班）。这是**按值关联、无 FK 约束**——`roster_flight` 只声明了 `fk_rf_crew` / `fk_rf_pairing` 两个 FK，`flt_id` 不在其中。
>
> 把一个环派给机组时，系统把它**炸开成每航段一行 `roster_flight`**（外加地面任务行）。所以 `roster_flight` 的粒度是 **crew × 航段**，不是 crew × 环。

### 关键 FK / 关联（对照 `02-crew-roster.sql` / `scenario/01-...`）

| 关系 | 约束名 | 从 → 到 | 含义 |
|---|---|---|---|
| 环 → 航段 | `fk_ps_pairing` | `pairing_segment.pairing_id` → `pairing.id` | 一个环包含多个航段 |
| 航段 → 航班 | `fk_ps_flight` | `pairing_segment.flt_id` → `flight.id` | **每个航段对应一个具体航班** |
| 排班 → 环 | `fk_rf_pairing` | `roster_flight.pairing_id` → `pairing.id` | 机组被派到某个环 |
| 排班 → 机组 | `fk_rf_crew` | `roster_flight.crew_id` → `crew.crew_id` | 这条排班属于哪个机组 |
| 排班 → 航班 | **（无 FK 约束）** | `roster_flight.flt_id` → `flight.id` | **某机组实际飞了哪个航班；按值关联，未声明 FK** |
| 发布排班 → 环 | **无 FK 约束** | `roster_publish.pairing_id` → `pairing.id` | 发布快照中的弱引用；允许源 `pairing` 被导入清理后保留发布记录 |

### `roster_flight` 的 flight 级字段（为什么"机组也挂在 flight 上"）

`roster_flight` 一行 = **一名机组在一个航段上**，这一行存的就是 pairing/segment 级放不下的、属于"这名机组×这个航班"的信息：

| 字段 | 含义 |
|---|---|
| `flt_id` | 关联的 flight id（地面任务为 null） |
| `live_id` | Scenario 优化结果来源回溯字段；由 optimizer output `ROSTER.old_id` 回填，指向 live `roster_flight.id` |
| `flight_acting_rank` | 在该航班上实际担任的职级，**可能与环槽位 `roster_acting_rank` 不同** |
| `position` / `seq_order` | 席位 / 同航班机组排序序号 |
| `duty_seq` / `seg_seq` / `flt_dt` | duty 序号 / 航段序号 / 航班日期 |
| `sch/act_str/end_dt_utc` | 该航段的计划/实际起降时间 |
| `*_credited_minutes` / `*_per_diem_mins` | 该航段的信用积分 / 津贴 |
| `dep_arp` / `arv_arp` | 该航段出发/到达机场 |
| `check_type` / `ts_flag` / `exception_code` | 签到类型 / TS 标志 / 法规违规代码 |

### ⚠️ 必读陷阱（否则会走"最省事但错误"的路径）

1. **pairing ↔ flight 是 N:M，物化在 `pairing_segment` 上。** 没有 `pairing.flight_id` 这种直连字段——要拿一个环的所有航班，必须 `pairing → pairing_segment(flt_id) → flight`。
2. **机组到航班有两条路径，按场景选对：**
   - **计划侧**（环长什么样）：`pairing → pairing_segment → flight`。
   - **执行侧**（谁实际飞了这个航班、在上面是什么职级/席位/时间）：直接读 `roster_flight.flt_id`。机组×航班的执行级信息只在 `roster_flight` 上，pairing 拿不到。
3. **`roster_flight.flt_id` 是按值关联、无 FK 约束**——`roster_flight` 只声明了 `fk_rf_crew` / `fk_rf_pairing`。写代码/迁移时别假设数据库会替你保证 `flt_id` 引用完整性。
   - ⚠️ schema 与 API 可能脱节：某些 roster/pairing 接口的 DTO 里 `fltId` 可能为 null（per-航班机组数要后端 join），**但库里 `flt_id` 对飞行任务是有值的**（见记忆 `flight-pairing-crew-linkage-server-only`）。需要时确认服务端是否 select 了该列。
4. **地面任务标记 = `pairing_id IS NULL`**（培训/待命/休假等），同时 `flt_id` 也为 null。
   - ⚠️ 注意 schema 注释自相矛盾：列定义注释写 `null=地面任务`，而 `comment on column` 写 `0=地面任务`。列可空且有 `fk_rf_pairing` FK，**以 `NULL` 为准**（`0` 无法满足 FK）；那条 `0` 注释是陈旧的。
5. **`pairing_segment` 是宽表**：`duty_*` 字段是冗余内嵌的，单行自洽——不要再去找 PairingDuty / PairingDutyNode 表，它们已被合并掉。
6. **`pairing_composition` vs `flight_composition`**：编制需求有两级——环级（`pairing_composition.pairing_id → pairing`）和航班级（`flight_composition.flt_id → flight`，约束 `fk_fc_flight`）。环级独立存储，**不**冗余进 segment 行。

---

## 2. 法规 / 资质 / 工时（围绕排班链）

| 表 | 连到核心链 | 用途 |
|---|---|---|
| `rule_check_result_pairing` | `pairing_id → pairing(id)` | 环级法规校验结果（`03-rule-check.sql`） |
| `rule_check_result_roster` | 按 crew/roster 维度 | roster 级法规校验结果 |
| `calc_result` | 一个环 / 一条 roster 一条记录，JSONB 存多层结构 | 法规引擎计算结果落库 |
| `crew_manday_fd_*` (daily/monthly/yearly) | 按 `crew` | 飞行员累计工时，daily→monthly→yearly 逐级归档 |
| `crew_manday_cc_am_*` | 按 `crew` | 客舱乘务员累计工时，同样三级归档 |
| `fatigue_result` | 按值勤 | FRMS 疲劳模型输出 |
| `rule_violation`（分区表） | 按月分区 `rule_violation_YYYY_MM` | 违规记录，PARTITION OF |

工时表三级归档链：`*_daily`（近 N 月，参数 `MANDAY_DAILY_KEEP_MONTHS`）→ `*_monthly`（约 2 年）→ `*_yearly`（长期）。归档执行日志见 `manday_archive_log`。

---

## 3. 机组档案（crew 卫星表）

`crew (crew_id)` 是主键，下列表都以 `crew_id` 外挂历史/明细（多为"按时间段"的历史记录）：

| 表 | 内容 |
|---|---|
| `crew_base` | 驻地基地历史（注意：crew 的 Base 来自这里，**不是** `roster_flight.base`，见记忆 `live-server-hot-reload...`） |
| `crew_rank` | 职级历史（`rank` 直接存代码 `CA`/`FO`/`PU`/`FA`，无 rank_id） |
| `crew_fleet` | 可飞机队资质历史 |
| `crew_qualification` | 资质记录（法规引擎核心依赖） |
| `crew_certificate` / `crew_license` / `crew_lic_instructor` | 证件 / 执照 / 教员资质 |
| `crew_language` | 语言能力（国际航线派遣校验） |
| `crew_status` | 停飞/休假/停职状态历史 |
| `crew_team` | 所属小组历史 |
| `crew_entitlement` | 年假/病假/培训假配额 |
| `crew_seniority` | 资历积分（PBS 优先级排序用） |
| `crew_memo` | Gantt 机组备注，可关联具体排班 |
| `crew_profile` | 关联的权限档案 |

---

## 4. 配置 / 编制 / 标签（影响排班链的主数据）

- **编制模板**：`composition` → `composition_rank`（各职级人数）；`composition_load`（按条件自动套模板）。
- **任务类型**：`assignment` + `assignment_group`（多对多经 `assignment_group_map`）——决定 `roster_flight` 里地面任务的种类、颜色、固定信用积分兜底等属性。地面任务 credit 不做比例折算；只使用 roster 行 credit，缺失时用 `assignment.fixed_credit_min` 兜底。
- **职级席位**：`rank` / `rank_position`（驾驶舱/客舱席位）/ `rank_acting`（代飞映射）。
- **标签体系**：`tag_definition` → `tag_assignment`（挂到对象）；过滤条件按粒度分表 `tag_flight` / `tag_pairing` / `tag_duty` / `tag_roster_ground` / `tag_flight_composition`，均经 `tag_group` 组织；`tag_opt_filter` 给 PO/RO 缩小求解范围。
- **优化工作集**：`workset` ←(`rule_set` / `cqf_set`)→ 关联完整的法规与资质检查体系。

---

## 5. 法规引擎配置（rule_* 体系）

```
rule_template (算法模板, 代码实现逻辑)
   └─ rule_instance (基于模板的具体法规, params JSONB)
         ├─ rule_parameter (数值参数: 最大FDP=14h 等)
         └─ rule_group_instance ──→ rule_group (法规集合)
rule_set ──→ workset            (集合绑定到优化工作集)
live_config                     (实时合规检查绑定哪套规章)
```

关键 FK：`rule_group_instance.group_id → rule_group(id)`、`rule_group_instance.instance_id → rule_instance(id)`。

---

## 6. PBS 子系统（pbs/01-pbs.sql，独立）

PBS 自成体系，FK 都在 `pbs_*` 内部闭环，**不跨表引用 live 的 pairing/flight**（靠业务编号弱关联）：

```
pbs_bid (机组每周期每上下文一条申请)
  ├─ pbs_bid_tier   (优先级层, 层号越小优先级越高)
  ├─ pbs_bid_group  (条件分组 = 一条完整规则, 组间 OR)
  │     └─ pbs_bid_condition  (附加条件, 与组内 AND)
  ├─ pbs_bid_day_off / pbs_bid_pairing_occurrence
  └─ pbs_bid_*_favorite (收藏: pairing / property / days_off / line, 用稳定 property_id)

pbs_award_result (分配结果主记录, 每机组每周期一条)
  └─ pbs_award_item ──→ matched_group_id → pbs_bid_group(id)   (分到的 pairing/休息日)

pbs_bid_property (45 条申请条件属性定义, 系统配置)
pbs_user         (PBS 用户投影表, 与 live 的 users 分开管理)
```

PBS 申请周期配置不再有独立 `pbs_period` 表；周期代码、开关时间、最大层数和发布信息统一挂在 live schema 的
`roster_period.pbs_*` 字段上。`pbs_bid.roster_period_id` 和 `pbs_award_result.roster_period_id`
按值指向 `roster_period.id`，不建立跨 schema FK。

Reserve Coverage 的 `Need / Off` 不再落 PBS 表；由 `pbs-server` 按当前用户 base/division 和 bid period 从 live
`pairing` / `pairing_composition` / `crew` / `crew_base` / `crew_manday_*_daily` 实时只读聚合。

> 注意：系统里有**两套用户**——`users`（排班管理员，live）与 `pbs_user`（机组 PBS 账号）。`crew` ≠ `users` ≠ `pbs_user`。

---

## 7. 快照不落库的对象（别去找表）

按 CLAUDE.md 约定，以下是**文件/快照**而非历史表，找不到对应表是正常的：

- 优化场景数据 → `.scenario.gz` 文件（元数据才在 `scenario` 表）。
- 发布排班数据 → `roster_publish`；发布成功事实与批次范围 → `schedule_publish_record`。后者的
  `file_path/file_size/checksum` 仅为历史兼容字段，当前 record-only 流程保持 null。
- 不存在 `schedule_*` 历史快照表系列，不存在 `system_parameter` 表（用 `dictionary` 替代）。

---

## 维护说明

- 本文件覆盖 `sql/schema/` 全部三套 schema 的**实体关系**；字段细节以 schema 内 `comment on column` 为准。
- 新增/修改核心表 FK 时，更新第 1～6 节对应小节。
- 关系存疑时，**以 `sql/schema/**.sql` 里的 `foreign key ... references` 为唯一权威**，不要以本文件或记忆为准——本文件是导航，SQL 是事实。
