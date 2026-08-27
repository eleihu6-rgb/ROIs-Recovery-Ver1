# 标签体系重新设计

## 现有问题

### 待废弃旧表（6张）

| 旧表 | 问题 |
|------|------|
| `tag_category` | 标签定义与显示配置混在一起 |
| `tag_group` | 树形 AND/OR 条件过度复杂 |
| `tag_flight` | 固定列，加过滤条件要加列 |
| `tag_duty` | 同上 |
| `tag_pairing` | 同上 |
| `tag_roster_ground` | 同上 |
| `tag_flight_composition` | 同上 |
| `attribute` | 与标签功能重叠 |

### 核心缺陷

Pairing/Duty 的标签需要依赖法规引擎的**计算结果**才能打：

```
例：标签"高强度环"
  条件：FDP > 10h 且 航段数 ≥ 4
  问题：FDP 是计算类法规算出来的值，当前标签系统不知道怎么拿到这个值
```

---

## 新设计方案

### 核心思路

1. **标签分两种**：静态标签（基于数据字段匹配）+ 计算标签（依赖法规引擎输出）
2. **条件用 JSONB** 表达，不再为每种对象建独立条件表
3. **标签打在哪**：统一关联表，支持 Flight / Pairing / Duty / Roster / Crew

### 标签类型

| 类型 | 说明 | 条件来源 | 举例 |
|------|------|---------|------|
| **STATIC** | 基于数据字段直接匹配 | 航班/环/机组的字段值 | 国际航班、红眼航班、A320机队 |
| **COMPUTED** | 依赖法规计算类输出 | 法规引擎 calc_results | 高强度环(FDP>10h)、疲劳风险环 |
| **MANUAL** | 人工手动打标 | 排班员操作 | 重点关注、特殊安排 |

---

### 表结构

#### 1. tag_definition — 标签定义

```sql
create table tag_definition (
    id               bigint          generated always as identity primary key,
    created_by       varchar(30)     not null default 'system',
    created_at       timestamptz     not null default now(),
    updated_by       varchar(30)     not null default 'system',
    updated_at       timestamptz     not null default now(),

    code             varchar(50)     not null,
    name             varchar(100)    not null,
    description      text,
    target_type      varchar(20)     not null,
    tag_type         varchar(20)     not null default 'STATIC',
    category         varchar(30),
    conditions       jsonb,
    priority         integer         not null default 0,
    color_hex        varchar(7),
    icon             varchar(30),
    is_visible       boolean         not null default true,
    is_warning       boolean         not null default false,
    requestable      boolean         not null default false,
    filiale          varchar(6)      not null,
    division         varchar(1),
    owner            varchar(1)      not null default 'S',
    is_deleted       smallint        not null default 0
);

create unique index uq_tag_definition_code on tag_definition (code, filiale) where is_deleted = 0;
```

字段说明：

| 字段 | 说明 |
|------|------|
| `code` | 标签编码，如 `intl_flight`, `high_intensity_pairing` |
| `target_type` | 标签打在什么对象上：`FLIGHT` / `PAIRING` / `DUTY` / `ROSTER` / `CREW` |
| `tag_type` | `STATIC` = 静态匹配 / `COMPUTED` = 依赖法规计算 / `MANUAL` = 人工打标 |
| `category` | 标签分类，如 `FLIGHT_ATTR` / `DUTY_INTENSITY` / `CREW_SKILL` / `OPT_FILTER` |
| `conditions` | 匹配条件 JSONB（STATIC 和 COMPUTED 用，MANUAL 为 null） |
| `priority` | 优先级（多个标签命中时的展示排序） |
| `color_hex` | Gantt 显示颜色，如 `#FF6B6B` |
| `is_warning` | 是否触发告警提示 |
| `requestable` | PBS 机组是否可按此标签申请 |

#### 2. tag_assignment — 标签挂载记录

对象实际被打上标签的记录（计算标签由系统自动打，手动标签由用户操作打）。

```sql
create table tag_assignment (
    id               bigint          generated always as identity primary key,
    created_by       varchar(30)     not null default 'system',
    created_at       timestamptz     not null default now(),
    updated_by       varchar(30)     not null default 'system',
    updated_at       timestamptz     not null default now(),

    tag_id           bigint          not null,
    target_type      varchar(20)     not null,
    target_id        bigint          not null,
    source           varchar(20)     not null default 'AUTO',
    calc_snapshot    jsonb,
    valid_from       timestamptz,
    valid_to         timestamptz,
    is_deleted       smallint        not null default 0
);

create index idx_tag_assignment_target on tag_assignment (target_type, target_id) where is_deleted = 0;
create index idx_tag_assignment_tag on tag_assignment (tag_id) where is_deleted = 0;
```

字段说明：

| 字段 | 说明 |
|------|------|
| `tag_id` | 关联 tag_definition.id |
| `target_type` | `FLIGHT` / `PAIRING` / `DUTY` / `ROSTER` / `CREW` |
| `target_id` | 对应对象的 id（flight.id / pairing.id / crew.id 等） |
| `source` | `AUTO` = 系统自动匹配/计算 / `MANUAL` = 排班员手动 / `IMPORT` = 外部导入 |
| `calc_snapshot` | 计算标签时法规引擎的输出快照，如 `{"fdp_minutes": 745, "segment_count": 4}` |
| `valid_from/to` | 标签有效期（如季节性标签），null = 永久有效 |

#### 3. tag_opt_filter — 优化引擎过滤集

将标签组合成过滤集，PO/RO 优化时用于缩小求解范围。

```sql
create table tag_opt_filter (
    id               bigint          generated always as identity primary key,
    created_by       varchar(30)     not null default 'system',
    created_at       timestamptz     not null default now(),
    updated_by       varchar(30)     not null default 'system',
    updated_at       timestamptz     not null default now(),

    filter_code      varchar(50)     not null,
    name             varchar(100)    not null,
    description      text,
    usage            varchar(20)     not null,
    filter_logic     jsonb           not null,
    filiale          varchar(6)      not null,
    is_deleted       smallint        not null default 0
);

create unique index uq_tag_opt_filter_code on tag_opt_filter (filter_code, filiale) where is_deleted = 0;
```

字段说明：

| 字段 | 说明 |
|------|------|
| `filter_code` | 过滤集编码 |
| `usage` | `PO` / `RO` / `BOTH` |
| `filter_logic` | 过滤逻辑 JSONB（见下方示例） |

---

### conditions JSONB 示例

#### 静态标签（STATIC）— 基于数据字段匹配

```json
// 国际航班
{
  "target_type": "FLIGHT",
  "match": {
    "flight_type": { "in": ["international", "regional"] }
  }
}

// 红眼航班（起飞时间在 22:00-06:00）
{
  "target_type": "FLIGHT",
  "match": {
    "std_local": { "between_time": ["22:00", "06:00"] }
  }
}

// A320 机队航班
{
  "target_type": "FLIGHT",
  "match": {
    "aircraft_type": { "in": ["A320", "A321", "A319"] }
  }
}

// 多天环（≥3天）
{
  "target_type": "PAIRING",
  "match": {
    "pairing_days": { "gte": 3 }
  }
}

// 新机长（总飞行小时 < 500）
{
  "target_type": "CREW",
  "match": {
    "total_flight_hours": { "lt": 500 },
    "rank": { "eq": "captain" }
  }
}
```

#### 计算标签（COMPUTED）— 依赖法规引擎输出

```json
// 高强度环（FDP > 10h 且 航段数 ≥ 4）
{
  "target_type": "PAIRING",
  "computed_from": ["fdp_calculator", "segment_count"],
  "match": {
    "and": [
      { "calc.fdp_calculator.value": { "gt": 600 } },
      { "calc.segment_count": { "gte": 4 } }
    ]
  }
}

// 疲劳高风险环
{
  "target_type": "PAIRING",
  "computed_from": ["fatigue_risk_calculator"],
  "match": {
    "calc.fatigue_risk_calculator.value": { "gt": 70 }
  }
}

// 长执勤 Duty（duty > 12h）
{
  "target_type": "DUTY",
  "computed_from": ["duty_period_calculator"],
  "match": {
    "calc.duty_period_calculator.value": { "gt": 720 }
  }
}

// 高工时环（环总飞行时间 > 30h）
{
  "target_type": "PAIRING",
  "computed_from": ["flight_hour_calculator"],
  "match": {
    "calc.flight_hour_calculator.value": { "gt": 1800 }
  }
}

// 体检即将过期（≤ 30天）
{
  "target_type": "CREW",
  "computed_from": ["qualification_calculator"],
  "match": {
    "calc.qualifications.medical_days_remaining": { "lte": 30 }
  }
}

// 近期经历不足（90天着陆 < 5次）
{
  "target_type": "CREW",
  "computed_from": ["recency_calculator"],
  "match": {
    "calc.recency.landings_90d": { "lt": 5 }
  }
}

// 高累计工时机组（月飞行 > 80h）
{
  "target_type": "CREW",
  "computed_from": ["flight_hour_calculator"],
  "match": {
    "calc.cumulative.flight_hours_28d": { "gt": 4800 }
  }
}

// 高疲劳风险机组
{
  "target_type": "CREW",
  "computed_from": ["fatigue_calculator"],
  "match": {
    "calc.fatigue.avg_fatigue_7d": { "gt": 65 }
  }
}

// 需要增编机组的航班（block > 8h 或跨时区 > 4h）
{
  "target_type": "FLIGHT",
  "computed_from": ["flight_calculator"],
  "match": {
    "or": [
      { "calc.block_minutes": { "gt": 480 } },
      { "calc.timezone_diff_hours": { "gt": 4 } }
    ]
  }
}

// 特殊机场航班
{
  "target_type": "FLIGHT",
  "computed_from": ["flight_calculator"],
  "match": {
    "or": [
      { "calc.special_airport_dep": { "eq": true } },
      { "calc.special_airport_arr": { "eq": true } }
    ]
  }
}
```

`computed_from` 指明依赖哪些计算类法规，系统在法规引擎执行完计算后，自动用结果匹配条件并打标。

#### 优化过滤集 filter_logic 示例

```json
// PO 优化：只处理国内短途 A320 航班
{
  "include_tags": ["domestic_flight", "a320_fleet", "short_haul"],
  "exclude_tags": ["training_flight", "charter_flight"],
  "logic": "AND"
}

// RO 分配：只分配给有国际资质的机组
{
  "crew_must_have": ["intl_qualified", "english_level_4_plus"],
  "pairing_tags": ["international_pairing"],
  "logic": "AND"
}
```

---

---

## 计算结果存储（calc_result）

### 问题

一个环有多个 Duty，每个 Duty 有独立的计算值（FDP、疲劳、航段数等），环本身也有汇总值。`tag_assignment.calc_snapshot` 不适合存储这种多层结构。

### 解决方案：独立的 calc_result 表

```sql
create table calc_result (
    id               bigint          generated always as identity primary key,
    created_by       varchar(30)     not null default 'system',
    created_at       timestamptz     not null default now(),
    updated_by       varchar(30)     not null default 'system',
    updated_at       timestamptz     not null default now(),

    target_type      varchar(20)     not null,   -- PAIRING / ROSTER
    target_id        bigint          not null,   -- pairing.id / roster.id
    calc_data        jsonb           not null,   -- 完整计算结果（多层结构）
    computed_at      timestamptz     not null default now(),  -- 计算时间
    rule_group_code  varchar(50),                -- 使用的法规集合
    version          integer         not null default 1       -- 版本号（每次重算+1）
);

create unique index uq_calc_result_target on calc_result (target_type, target_id);
create index idx_calc_result_computed on calc_result (computed_at);
```

### calc_data JSONB 结构

#### Pairing 的计算结果

```json
{
  "pairing": {
    "total_flight_minutes": 1110,
    "total_block_minutes": 1080,
    "pairing_days": 3,
    "total_segments": 7,
    "total_duty_count": 2,
    "layover_airports": ["SHA", "CAN"],
    "manday_hours": 24.5,
    "pay_hours": 28.0
  },
  "duties": [
    {
      "duty_seq": 1,
      "fdp_minutes": 745,
      "duty_period_minutes": 800,
      "flight_minutes": 555,
      "segment_count": 3,
      "report_time_utc": "2026-03-23T06:00:00Z",
      "release_time_utc": "2026-03-23T18:25:00Z",
      "fatigue_score": 52,
      "fatigue_risk": "LOW",
      "checkin_airport": "PEK",
      "checkout_airport": "CAN",
      "is_night_duty": false,
      "segments": [
        { "flight_no": "CA101", "dep": "PEK", "arr": "SHA", "block_minutes": 135 },
        { "flight_no": "CA102", "dep": "SHA", "arr": "CAN", "block_minutes": 150 },
        { "flight_no": "CA103", "dep": "CAN", "arr": "PEK", "block_minutes": 180 }
      ]
    },
    {
      "duty_seq": 2,
      "fdp_minutes": 680,
      "duty_period_minutes": 720,
      "flight_minutes": 495,
      "segment_count": 4,
      "report_time_utc": "2026-03-24T08:00:00Z",
      "release_time_utc": "2026-03-24T19:20:00Z",
      "fatigue_score": 68,
      "fatigue_risk": "MEDIUM",
      "checkin_airport": "PEK",
      "checkout_airport": "PEK",
      "is_night_duty": false,
      "segments": [
        { "flight_no": "CA201", "dep": "PEK", "arr": "CTU", "block_minutes": 150 },
        { "flight_no": "CA202", "dep": "CTU", "arr": "KMG", "block_minutes": 90 },
        { "flight_no": "CA203", "dep": "KMG", "arr": "CTU", "block_minutes": 90 },
        { "flight_no": "CA204", "dep": "CTU", "arr": "PEK", "block_minutes": 165 }
      ]
    }
  ],
  "rests": [
    {
      "after_duty_seq": 1,
      "before_duty_seq": 2,
      "rest_minutes": 695,
      "rest_location": "PEK",
      "is_home_base": true,
      "rest_type": "standard"
    }
  ],
  "cumulative": {
    "crew_flight_hours_7d": 2160,
    "crew_flight_hours_28d": 5400,
    "crew_flight_hours_90d": 14500,
    "crew_consecutive_duty_days": 5
  }
}
```

#### Crew 的计算结果（定期计算：每日或排班变更时）

```json
{
  "qualifications": {
    "aircraft_types": ["A320", "A321"],
    "airport_quals": ["VHHH", "RJTT"],
    "language_level": 4,
    "medical_valid_to": "2026-09-15",
    "medical_days_remaining": 176
  },
  "cumulative": {
    "flight_hours_7d": 2160,
    "flight_hours_28d": 5400,
    "flight_hours_90d": 14500,
    "flight_hours_365d": 52000,
    "duty_days_this_month": 18,
    "off_days_this_month": 13,
    "consecutive_duty_days": 5
  },
  "recency": {
    "last_landing_date": "2026-03-20",
    "landings_90d": 12,
    "landings_90d_by_type": { "A320": 10, "A321": 2 },
    "last_flight_date": "2026-03-20"
  },
  "fatigue": {
    "current_sleep_pressure": 35,
    "avg_fatigue_7d": 48
  }
}
```

#### Flight 的计算结果（航班数据变更时计算）

```json
{
  "block_minutes": 135,
  "flight_type": "domestic",
  "is_night_flight": false,
  "is_red_eye": false,
  "special_airport_dep": false,
  "special_airport_arr": false,
  "min_crew_required": { "captain": 1, "fo": 1, "cc": 4 },
  "augmented_crew_required": false,
  "timezone_diff_hours": 0
}
```

#### Roster 的计算结果

```json
{
  "roster": {
    "crew_id": "C001",
    "period_start": "2026-03-01",
    "period_end": "2026-03-31",
    "total_flight_minutes": 4800,
    "total_duty_days": 18,
    "total_off_days": 13,
    "manday_hours": 156.5,
    "pay_hours": 172.0,
    "overtime_hours": 12.5
  },
  "weekly_summary": [
    {
      "week_start": "2026-03-01",
      "flight_minutes": 1200,
      "duty_days": 5,
      "off_days": 2,
      "max_fdp": 745,
      "min_rest": 600
    }
  ]
}
```

### 计算结果与标签的关系

`tag_assignment.calc_snapshot` 改为只存**命中该标签时的关键值**（轻量），完整计算结果在 `calc_result` 中。

```
calc_result（完整计算结果，一个环一条记录）
  ↓ 标签匹配引擎读取
tag_assignment（标签挂载 + 轻量 calc_snapshot）
  calc_snapshot: {"fdp_minutes": 745, "matched_duty_seq": 1}  ← 只存命中原因
```

### 数据用途

| 使用方 | 读取 target_type | 用途 |
|--------|-----------------|------|
| Gantt 界面 | PAIRING / CREW | 展示 FDP/休息/疲劳/工时、机组状态 |
| 标签引擎 | ALL | 匹配 COMPUTED 标签条件（所有对象类型） |
| PO/RO | PAIRING + CREW | 环计算值 + 机组累计值构建约束 |
| 薪酬模块 | PAIRING + ROSTER | 工时计薪、月度汇总 |
| 资质管理 | CREW | 体检过期预警、近期经历不足预警 |
| 报表 | ALL | 统计分析 |

### calc_result 更新时机

| target_type | 触发时机 |
|-------------|---------|
| PAIRING | 环新建/修改/航段变更时 |
| CREW | 每日定时 + 排班变更时 + 资质变更时 |
| FLIGHT | 航班数据导入/变更时 |
| ROSTER | 排班发布/变更时 + 月度汇总定时任务 |

---

### 计算标签的执行流程

```
1. 排班数据变更（新增/修改 Pairing、Roster）
       ↓
2. live-server 调用法规引擎（@rois/rule-engine）
       ↓
3. 法规引擎执行计算类法规，输出完整 calc_results（环级+Duty级+休息）
       ↓
4. 写入/更新 calc_result 表（完整计算结果，version+1）
       ↓
5. 标签引擎读取 calc_result，匹配所有 COMPUTED 类标签的 conditions
       ↓
6. 命中 → 写入 tag_assignment（source='AUTO', calc_snapshot=命中关键值）
   未命中 → 删除已有的 AUTO 标签
       ↓
7. Gantt 界面：
   - 从 calc_result 读取计算值展示（FDP/休息/疲劳/工时）
   - 从 tag_assignment 读取标签展示（颜色/图标/告警）
```

```
┌──────────┐    排班变更    ┌──────────────┐
│   Gantt  │ ──────────→  │ live-server   │
└──────────┘               └──────┬───────┘
                                  │
                        ① 调法规引擎（@rois/rule-engine）
                                  ↓
                           ┌──────────────┐
                           │ rule-engine   │
                           │ 计算类法规:   │
                           │  fdp/rest/    │
                           │  fatigue/...  │
                           └──────┬───────┘
                                  │
                        ② 写入 calc_result（完整多层结构）
                                  ↓
                           ┌──────────────────────────┐
                           │ calc_result               │
                           │ pairing#123:              │
                           │  pairing: {total_flt:18h} │
                           │  duties: [{fdp:745}, ...] │
                           │  rests: [{rest:600}, ...] │
                           └──────────┬───────────────┘
                                      │
                        ③ 标签匹配引擎（读 calc_result）
                                      ↓
                           ┌──────────────┐
                           │ tag engine    │
                           │ COMPUTED标签: │
                           │  高强度环? ✓  │
                           │  疲劳风险? ✓  │
                           └──────┬───────┘
                                  │
                        ④ 写入 tag_assignment（轻量快照）
                                  ↓
                           ┌──────────────────────────┐
                           │ tag_assignment             │
                           │ pairing#123 → 高强度环     │
                           │   calc_snapshot: {fdp:745} │
                           │ pairing#123 → 疲劳风险     │
                           │   calc_snapshot: {score:68} │
                           └──────────────────────────┘
```

### PO/RO 如何使用标签

```
1. PO/RO 优化开始前
       ↓
2. 读取 tag_opt_filter 获取过滤集配置
       ↓
3. 根据 filter_logic 查询 tag_assignment
       ↓
4. 得到符合条件的 Flight/Pairing/Crew ID 列表
       ↓
5. 只用这些 ID 构建优化模型（缩小求解范围）
```

---

### 与旧设计对比

| 对比项 | 旧设计 | 新设计 |
|--------|--------|--------|
| 条件存储 | 每种对象一张固定列表 | **统一 JSONB conditions** |
| 加条件 | 加列改表 | **JSONB 直接加字段** |
| 法规计算依赖 | 无法表达 | **computed_from + calc.* 匹配** |
| 手动标签 | 无明确支持 | **MANUAL 类型 + tag_assignment** |
| 条件逻辑 | 树形 tag_group（复杂） | **JSONB and/or 表达式（简洁）** |
| 优化过滤 | tag_category.ratio | **tag_opt_filter 独立配置** |
| 表数量 | 7 张 | **3 张** |

---

### 数据关系图

```
rule-engine 计算类法规
  │
  ↓ 输出完整计算结果
calc_result (一个环/roster 一条记录，JSONB 多层结构)
  │  pairing级 + duty级 + rest级 + cumulative级
  │
  ├──→ Gantt 界面展示（FDP/休息/疲劳/工时）
  ├──→ 薪酬模块（manday/pay_hours）
  ├──→ PO/RO（累计值初始数据）
  │
  ↓ 标签匹配引擎读取
tag_definition (标签定义)
  │  STATIC: conditions 直接匹配数据字段
  │  COMPUTED: conditions 匹配 calc_result 中的值
  │  MANUAL: 无 conditions，人工打标
  │
  ├──→ tag_assignment (标签挂载记录)
  │      target_type + target_id → Flight/Pairing/Crew...
  │      calc_snapshot → 仅存命中该标签的关键值（轻量）
  │
  └──→ tag_opt_filter (优化过滤集)
         PO/RO 用标签组合缩小求解范围
```
