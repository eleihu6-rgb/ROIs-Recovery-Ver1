# 机组排班系统重建项目技术文档

> 本文档供 Claude Code 快速理解项目背景、架构决策和数据库设计，直接上手开发使用。

---

## 1. 项目概述

### 背景

本项目是对现有航空机组排班系统的**全栈重建**，将原有的 Oracle + MySQL 混合技术栈迁移到现代化的全 PostgreSQL 方案，并同步进行架构升级和表结构优化。

### 目标

- 替换遗留 Oracle 系统，解决授权成本和运维复杂度问题
- 消除历史遗留的设计缺陷（冗余表、过度耦合的层级结构）
- 统一多航司数据隔离方案（schema 隔离）
- 为后续 5 个功能模块提供清晰、可维护的数据基础

---

## 2. 技术选型（已确认，不再讨论）

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端 | React 19 + Vite + TypeScript | |
| 后端 | Node.js + Hono + TypeScript | 轻量高性能框架 |
| ORM | Drizzle ORM | 类型安全，与 PG 集成良好 |
| 数据库 | PostgreSQL 16 | 单 schema per 航司 |
| 缓存/队列 | Redis 7 + BullMQ | |
| 部署 | Docker + Docker Compose | |

---

## 3. 多航司数据隔离方案

采用 **PostgreSQL Schema 隔离**：每个航司对应一个独立 schema，schema 名为航司二字码。

```sql
-- 新增航司时执行：
CREATE SCHEMA CA;
SET search_path TO CA;
\i base_pg.sql
\i crew_roster_pg.sql
\i pbs_pg.sql
```

- 所有建表脚本**无 schema 前缀**，通过 `search_path` 切换
- 同一套脚本可复用于所有航司
- 航司间数据完全隔离，查询时不会跨库

---

## 4. 五大功能模块

| 模块 | 代号 | 功能描述 |
|------|------|----------|
| Gantt 实时排班界面 | M1 | 排班员手动操作界面，实时法规检查 |
| 法规引擎 | M2 | CCAR-121 等规章的自动合规校验 |
| PO 组环优化 | M3 | 自动生成最优 Pairing（飞行环） |
| RO 分配优化 | M4 | 将 Pairing 自动分配给合适机组 |
| PBS 机组申请 | M5 | 机组通过 App 提交排班偏好申请 |

---

## 5. 数据库文件清单

| 文件名 | 表数量 | 说明 |
|--------|--------|------|
| `base_pg.sql` | 56 张 | 基础数据（机场/机型/法规/权限等） |
| `crew_roster_pg.sql` | 53 张 | 机组/排班/Pairing/Manday 核心业务表 |
| `pbs_pg.sql` | 10 张 | PBS 机组申请模块（新模块） |

**合计：119 张表**

---

## 6. 核心设计决策

### 6.1 三层数据分离架构

```
Live 实时数据（数据库表）
  ├── 随时可增删改
  ├── pairing / roster / flight / manday 等表
  └── 无 scenario_id 字段

Schedule 发布快照（文件）
  ├── 每次发布排班时生成 .schedule.gz 压缩文件
  ├── 元数据存 schedule_publish_record 表（含 file_path / checksum）
  └── 永远只读，用于与 live 数据做差异对比

Scenario 优化场景（文件）
  ├── 优化引擎生成 .scenario.gz 压缩文件
  ├── 元数据存 scenario 表（含 file_path / filter_params jsonb）
  └── 多个场景可并存，不影响生产数据
```

**关键原则**：数据库只存轻量元数据，大体量历史快照全部走文件，彻底解决数据库膨胀问题。

**比对流程**：
1. 从 `schedule_publish_record` 拿到 `file_path`
2. 解压 `.schedule.gz` 得到发布时的完整数据
3. 查询当前 live 表同范围数据
4. 应用层做 diff，高亮展示发布后的所有变更

### 6.2 Pairing 双表设计（最终版）

原来 4 层结构（Pairing → PairingDuty → PairingDutyNode → PairingSegment）调整为 **2 张表**：

```
pairing            ← 环头表，1行=1个环，存环级属性
pairing_segment    ← 行宽表，1行=1个航班段
                     合并了原 PairingDuty / PairingDutyNode / PairingSegment
                     duty_ 前缀字段冗余内嵌，同一 duty 的所有 seg 行值相同
```

**设计要点**：
- `pairing.id` 是真正的外键，`pairing_segment.pairing_id` 关联它
- `pairing_id` 由**后端序列生成**（不是前端），新建环时后端分配唯一 id
- 同一 duty 内所有 seg 行的 `duty_*` 字段值完全相同（冗余换简单）
- 修改 duty 属性需 `WHERE pairing_id = X AND duty_seq = N` 批量更新
- 修改环级属性只更新 `pairing` 表的 1 行
- `pairing_composition`（环编组需求）**保留独立表**，关联 `pairing.id`
- 唯一约束：`uq_pair_seg (pairing_id, duty_seq, seg_seq)`

**进退场字段**：最多支持 3 次进退场（checkin_1/2/3、checkout_1/2/3），第 1 次必填，第 2/3 次无则为 null。

### 6.3 Roster 融合宽表设计

`roster` + `roster_flight` 合并为一张 `roster` 融合宽表：

```
pairing_id > 0  →  飞行任务，flt_id / duty_seq 等有值
pairing_id = 0  →  地面任务，flt_id / duty_seq 为 null，grd_* 字段记录地面任务信息
```

时间范围统一用 `sch_str_dt_utc` / `sch_end_dt_utc`：
- 飞行任务：代表计划起落时间
- 地面任务：代表任务时间范围

### 6.4 Manday 三级归档体系

工时表不再是单张大表，改为按时间粒度三级归档：

| 表 | 保留范围 | 配置参数 |
|----|----------|----------|
| `crew_manday_fd_daily` / `crew_manday_cc_am_daily` | 近 N 个月按天 | `MANDAY_DAILY_KEEP_MONTHS`（默认 6） |
| `crew_manday_fd_monthly` / `crew_manday_cc_am_monthly` | 前 N 月 ~ 前 M 年月度汇总 | `MANDAY_MONTHLY_KEEP_YEARS`（默认 2） |
| `crew_manday_fd_yearly` / `crew_manday_cc_am_yearly` | M 年以前年度汇总 | `MANDAY_YEARLY_KEEP_YEARS`（默认 10） |

- 归档参数从 `dictionary` 表读取（`parent_code = 'SYS_PARAM'`），各航司独立配置
- `manday_archive_log` 表记录归档任务执行日志
- `crew_base_dt` 字段类型为 `date`（原 Oracle 是 `timestamptz`，已修正）

### 6.5 Dictionary 统一替代 system_parameter

`system_parameter` 表已废弃，功能合并入 `dictionary` 表。

`dictionary` 支持 `parent_code` 树形结构，三种使用方式：

| 用途 | parent_code | code | code_value |
|------|-------------|------|------------|
| 系统参数 | `SYS_PARAM` | 参数名（如 `MANDAY_DAILY_KEEP_MONTHS`） | 参数值（如 `6`） |
| 下拉选项 | 分类代码（如 `GENDER`） | 选项值（如 `M`） | 存储值（如 `1`） |
| 分类树顶级 | `null` | 分类代码 | — |

---

## 7. 已废弃的表（共 16 张，不要生成）

| 废弃表 | 原因 | 替代方案 |
|--------|------|----------|
| `schedule_pairing` / `schedule_pairing_duty` / `schedule_pairing_duty_node` / `schedule_pairing_duty_segment` | 快照改用文件 | `.schedule.gz` 文件 |
| `schedule_roster` / `schedule_roster_flight` | 同上 | 同上 |
| `schedule_crew_manday_fd` / `schedule_crew_manday_cc_am` | 同上 | 同上 |
| `pairing_export` / `flight_export` / `roster_export` / `roster_flight_export` | 触发器机制废弃 | 应用层事件 |
| `system_parameter` | 冗余 | `dictionary` 表（`parent_code='SYS_PARAM'`） |

---

## 8. PBS 模块（新模块，M5）

基于客户提供的样例数据（`crew_bids_reference.xlsx`）全新设计，共 10 张表：

### 8.1 核心业务概念

PBS（Preferential Bidding System）是机组优先申请排班系统，机组在每个排班周期开始前提交偏好申请，系统按资历自动分配。

### 8.2 申请数据结构（4 级）

```
pbs_bid          ← 申请主记录（每机组每周期每上下文一条）
  └── pbs_bid_layer     ← 申请层（layer=1最优先，最多24层）
        └── pbs_bid_group     ← 条件分组（每组是一条完整规则，组间OR）
              └── pbs_bid_condition  ← 附加AND条件（node_id >= 2 的行）
```

### 8.3 申请上下文

- `Default`：机组的默认偏好，每月复用
- `Current`：针对当前周期的特定申请，优先级高于 Default

### 8.4 属性类型（bid_type）

| 类型 | ID 范围 | 说明 |
|------|---------|------|
| Pairing | 101-130 | 飞行环相关偏好（30 种） |
| DaysOff | 201-206 | 休息日偏好（6 种） |
| Reserve | 301-302 | 备勤偏好（2 种） |
| Line | 401-407 | 排班线偏好（7 种） |

### 8.5 安全设计

- `pbs_user` 与内部 `users` 表**完全分开**，机组 App 账号独立管理
- 密码前端 RSA 加密传输，后端解密后 bcrypt 哈希存储
- `token_version` 字段用于修改密码后使旧 JWT 失效
- `pbs_login_log` 记录所有登录行为，`pbs_operation_log` 记录所有申请操作

---

## 9. 重要字段规范

### 9.1 审计字段（每张表统一）
```sql
id          bigint  GENERATED ALWAYS AS IDENTITY PRIMARY KEY
created_by  varchar(30)  NOT NULL DEFAULT 'system'
created_at  timestamptz  NOT NULL DEFAULT now()
updated_by  varchar(30)  NOT NULL DEFAULT 'system'
updated_at  timestamptz  NOT NULL DEFAULT now()
```

### 9.2 时间字段规范
- 所有时间字段统一使用 `timestamptz`（含时区）
- 命名规范：`*_dt_utc` 后缀表示 UTC 时间
- `crew_base_dt` 使用 `date` 类型（不是 timestamptz）

### 9.3 crew 表主键
- `id`：`bigint` 自增主键（内部使用，关联效率高）
- `crew_id`：`varchar` 业务唯一键（`UNIQUE` 约束，对外接口使用）

### 9.4 软删除
- 使用 `is_deleted smallint NOT NULL DEFAULT 0` 字段
- `1 = 已删除`，`0 = 正常`
- 所有查询默认加 `WHERE is_deleted = 0`

---

## 10. 数据库表清单速查

### base_pg.sql（56 张）

基础配置数据，覆盖：
- 飞机、机场、航线、机队
- 任务类型、任务分组、编制模板
- 资质/证件/语言类型定义
- 法规（rule）、资质函数（cqf）、工作集（workset）
- 权限体系（profile / menu / user）
- 预警体系（warn）
- 数据字典（dictionary，含系统参数）
- 疲劳计算（fatigue_result / fatigue_colour）

### crew_roster_pg.sql（53 张，7 个 section）

| Section | 表组 | 张数 |
|---------|------|------|
| 1 | 补充基础数据（department / holiday / hotel / tag 系列等） | 13 |
| 2 | 机组（crew / crew_base / crew_certificate / crew_rank 等） | 16 |
| 3 | Manday 三级归档（fd + cc_am 各3级 + 归档日志） | 8 |
| 4 | 航班（flight / flight_composition） | 2 |
| 5 | Pairing（pairing / pairing_segment / composition / template / memo） | 5 |
| 6 | Roster（roster / roster_publish / roster_publish_adjust） | 3 |
| 7 | 发布记录与场景元数据（schedule_publish_record / scenario / scenario_group / scenario_kpi） | 6 |

### pbs_pg.sql

| 分组 | 表 | 张数 |
|------|-----|------|
| 配置 | pbs_bid_property | 1 |
| 申请 | pbs_bid / pbs_bid_layer / pbs_bid_group / pbs_bid_condition / pbs_bid_error | 5 |
| 结果 | pbs_award_result / pbs_award_item | 2 |
| 安全 | pbs_user / pbs_login_log / pbs_operation_log | 3 |

PBS 申请周期配置统一放在 live schema 的 `roster_period.pbs_*` 字段；`f8_pbs` 不再维护独立 `pbs_period`。

---

## 11. 开发注意事项

### 11.1 不要做的事
- **不要**重新生成或修改已有 SQL 文件中已确认的表结构，除非被明确要求
- **不要**在 live 业务表中加 `scenario_id` 字段（已明确废弃）
- **不要**创建 `system_parameter` 表（已废弃，用 `dictionary` 替代）
- **不要**创建 schedule_* 系列历史快照表（已废弃，用文件替代）

### 11.2 Oracle 到 PostgreSQL 的关键转换
- `NUMBER(n,0)` → `bigint` / `integer` / `smallint`（按范围选择）
- `NUMBER(n,2)` → `numeric(n,2)`
- `VARCHAR2(n)` → `varchar(n)`
- `DATE` → `timestamptz`（Oracle DATE 含时分秒）
- `SYSDATE` → `now()`
- `SEQUENCE` + `TRIGGER` → `GENERATED ALWAYS AS IDENTITY`
- `NUMBER(1,0)` 布尔值 → `smallint`（保持 0/1，不用 boolean）

### 11.3 所有触发器不迁移
Oracle 系统中的触发器（主要用于同步到 export 表）全部废弃，改为**应用层事件机制**（BullMQ 消息队列）。

### 11.4 Schema 使用方式
```typescript
// Drizzle ORM 连接时通过 search_path 指定 schema
const db = drizzle(pool, {
  // 连接字符串中指定 search_path
  // postgresql://user:pass@host/dbname?options=-c%20search_path%3DCA
})
```

---

## 12. 部署环境

- GCP VM（asia-southeast1-a）
- 实例名：`instance-20260307-093349`
- 用户：`eleihu6`
- 通过 `gcloud compute ssh` 连接
- 使用 `tmux` 保持后台 session（session 名：`claude-mac` / `claude-windows`）

---

## 13. 待完成工作（当前状态）

- [x] `base_pg.sql` - 56 张表，含完整中文注释
- [x] `crew_roster_pg.sql` - 53 张表，含完整中文注释
- [x] `pbs_pg.sql` - 10 张表，含完整中文注释
- [x] `pairing_redesign.sql` - Pairing 双表最终设计（pairing + pairing_segment）
- [ ] 将 `base_pg.sql` 和 `crew_roster_pg.sql` 合并为完整初始化脚本
- [ ] Drizzle ORM schema 定义文件生成
- [ ] 后端 API 接口开发（Hono + Node.js）
- [ ] 前端 Gantt 界面开发（React 19）
- [ ] 法规引擎集成（M2）
- [ ] PO/RO 优化引擎集成（M3/M4）
- [ ] PBS App 前端（M5）
