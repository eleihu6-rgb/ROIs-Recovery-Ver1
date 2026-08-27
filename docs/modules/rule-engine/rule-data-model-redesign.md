# 法规数据模型重新设计

## 现有设计的问题

### 待废弃的旧表（7张）

| 旧表 | 问题 | 新方案替代 |
|------|------|-----------|
| `rule` | 列固定，加特性要改表 | `rule_template` + `rule_instance` |
| `rule_parameter` | 逗号分隔，无类型校验 | `rule_instance.params` (JSONB) |
| `rule_set` | 绑定 workset，不够灵活 | `rule_group` + `rule_group_item` |
| `cqf` | 与 rule 结构重复 | 合并为 `rule_template.category = 'QUALIFICATION'` |
| `cqf_parameter` | 逗号分隔，同 rule_parameter | 合并为 `rule_instance.params` (JSONB) |
| `cqf_set` | 绑定 workset，同 rule_set | 合并为 `rule_group` + `rule_group_item` |
| `workset` | 仅作为 rule_set/cqf_set 的容器 | 由 `rule_group` 直接管理 |

> 以上旧表暂保留，待新法规体系完全替换后统一删除。

当前 `rule` + `rule_parameter` 设计：

```
rule 表：一行 = 一条法规，列是固定字段
rule_parameter 表：param_names/param_values 逗号分隔存储
```

**问题：**
1. `rule` 表列有限，每增加法规特性需要加列，改表结构
2. `rule_parameter` 的 `param_names` 和 `param_values` 逗号分隔，无类型校验，容易错位
3. 法规逻辑（如"航段数≥4时FDP上限降低"）无法用参数表达，只能硬编码
4. 不同法规需要的参数结构差异很大，逗号分隔模式无法描述复杂结构
5. 缺少法规之间的依赖关系表达

---

## 新设计方案：法规模板 + JSONB 参数 + 条件表达式

### 核心思路

- 法规定义 = **模板**（引擎中的算法实现）+ **配置**（数据库中的参数）
- 参数使用 **JSONB** 存储，不同法规可以有完全不同的参数结构
- 条件型法规通过 **conditions JSONB** 表达，支持"当X条件时，Y参数生效"
- 法规引用 CCAR-121 具体条款

---

### 表结构

#### 1. rule_template — 法规模板定义

每种法规算法对应一个模板，由系统预置，代码中实现算法逻辑。

```sql
create table rule_template (
    id               bigint          generated always as identity primary key,
    created_by       varchar(30)     not null default 'system',
    created_at       timestamptz     not null default now(),
    updated_by       varchar(30)     not null default 'system',
    updated_at       timestamptz     not null default now(),

    code             varchar(50)     not null,   -- 模板编码，如 'max_fdp', 'min_rest', 'max_flight_time'
    name             varchar(200)    not null,   -- 模板名称
    category         varchar(30)     not null,   -- 分类：FDP/REST/FLIGHT_TIME/DUTY/QUALIFICATION/FATIGUE
    subcategory      varchar(30),                -- 子分类：SINGLE/CUMULATIVE/CONDITIONAL
    description      text,                       -- 详细说明
    ccar_reference   varchar(50),                -- CCAR-121 条款引用，如 'CCAR-121-R5-121.487'
    check_type       varchar(20)    not null,    -- CHECK=校验类 CALC=计算类 BOTH=校验+计算
    input_schema     jsonb          not null,    -- 该法规需要的输入数据结构定义（JSON Schema）
    param_schema     jsonb          not null,    -- 该法规支持的参数结构定义（JSON Schema）
    output_schema    jsonb,                      -- 输出结构定义
    constraint_type  varchar(20),                -- OR-Tools 约束类型：LINEAR/BOOL/TABLE/ELEMENT
    template_vars    jsonb          not null default '[]',  -- 模板变量定义，用于UI消息模板变量选择器
    owner            varchar(1)     not null default 'S'   -- S=系统内置 C=客户自定义
);

create unique index uq_rule_template_code on rule_template (code);

comment on table  rule_template              is '法规模板定义，每种法规算法一个模板，代码中实现算法';
comment on column rule_template.code         is '模板编码，引擎通过此编码调用对应算法';
comment on column rule_template.input_schema is '该法规需要的输入数据 JSON Schema，如 {crew, roster, flight}';
comment on column rule_template.param_schema is '该法规可配置参数的 JSON Schema，定义参数名/类型/默认值/取值范围';
comment on column rule_template.template_vars is '模板变量JSON数组，定义{name, label, example}用于UI变量选择器';
comment on column rule_template.constraint_type is 'PO/RO 约束建模方式：LINEAR=线性约束 BOOL=布尔变量 TABLE=查表 ELEMENT=索引';
```

#### 2. rule_instance — 法规实例（每条具体法规）

基于模板创建的具体法规实例，参数通过 JSONB 配置。

```sql
create table rule_instance (
    id               bigint          generated always as identity primary key,
    created_by       varchar(30)     not null default 'system',
    created_at       timestamptz     not null default now(),
    updated_by       varchar(30)     not null default 'system',
    updated_at       timestamptz     not null default now(),

    template_code    varchar(50)     not null,   -- 关联 rule_template.code
    instance_code    varchar(80)     not null,   -- 实例编码，如 'max_fdp_standard', 'max_fdp_extended'
    name             varchar(200)    not null,   -- 实例名称
    description      text,                       -- 说明
    ccar_reference   varchar(50),                -- CCAR-121 条款引用（可覆盖模板的引用）
    severity         varchar(10)     not null default 'ERROR',  -- ERROR=阻断 WARNING=告警 INFO=提示
    overridable      boolean         not null default false,    -- 是否可豁免（如机长签字延伸FDP）
    params           jsonb           not null default '{}',     -- 法规参数（按 template.param_schema 校验）
    conditions       jsonb,                      -- 生效条件（null=无条件生效）
    filiale          varchar(6)      not null,   -- 航司
    division         varchar(1)      not null,   -- 飞行/乘务
    owner            varchar(1)      not null default 'S',
    is_deleted       smallint        not null default 0
);

create unique index uq_rule_instance_code on rule_instance (instance_code, filiale, division) where is_deleted = 0;

-- filiale 大写约束（所有航司 schema 自动添加）
-- ALTER TABLE rule_instance ADD CONSTRAINT chk_rule_instance_filiale_upper CHECK (filiale = UPPER(filiale));

comment on table  rule_instance              is '法规实例，基于模板创建，params存储具体参数值';
comment on column rule_instance.params       is '法规参数 JSONB，结构由对应 template 的 param_schema 定义';
comment on column rule_instance.conditions   is '生效条件 JSONB，如 {"segment_count": {"gte": 4}} 表示航段≥4时生效';
comment on column rule_instance.severity     is 'ERROR=硬限制阻断 WARNING=软限制告警 INFO=信息提示';
comment on column rule_instance.filiale      is '航司代码，必须大写（如 F8），由 CHECK 约束强制';
```

> **重要：filiale 字段规范**
> - 所有含 `filiale` 字段的表都有 CHECK 约束 `filiale = UPPER(filiale)`
> - 后端查询使用 `schema.toUpperCase()` 过滤，必须匹配大写值
> - Seed 脚本必须显式提供大写值（如 `'F8'`），小写值会被拒绝

#### 3. rule_group — 法规集合

将多条法规实例组合成集合，供不同用户/模块使用。

```sql
create table rule_group (
    id               bigint          generated always as identity primary key,
    created_by       varchar(30)     not null default 'system',
    created_at       timestamptz     not null default now(),
    updated_by       varchar(30)     not null default 'system',
    updated_at       timestamptz     not null default now(),

    group_code       varchar(50)     not null,   -- 集合编码
    name             varchar(200)    not null,   -- 集合名称
    description      text,
    usage            varchar(20)     not null,   -- GANTT / PO / RO / PBS / ALL
    filiale          varchar(6)      not null,
    division         varchar(1)      not null,
    is_default       boolean         not null default false,  -- 是否默认集合
    is_deleted       smallint        not null default 0
);

create unique index uq_rule_group_code on rule_group (group_code, filiale, division) where is_deleted = 0;

-- filiale 大写约束（所有航司 schema 自动添加）
-- ALTER TABLE rule_group ADD CONSTRAINT chk_rule_group_filiale_upper CHECK (filiale = UPPER(filiale));

comment on table  rule_group         is '法规集合，将多条法规实例组合，供不同模块/用户选择使用';
comment on column rule_group.usage   is '适用模块：GANTT=排班系统 PO=组环优化 RO=分配优化 PBS=机组申请 ALL=全部';
comment on column rule_group.filiale is '航司代码，必须大写（如 F8），由 CHECK 约束强制';
```

#### 4. rule_group_item — 集合中的法规项

```sql
create table rule_group_item (
    id               bigint          generated always as identity primary key,
    created_by       varchar(30)     not null default 'system',
    created_at       timestamptz     not null default now(),
    updated_by       varchar(30)     not null default 'system',
    updated_at       timestamptz     not null default now(),

    group_id         bigint          not null,   -- 关联 rule_group.id
    instance_id      bigint          not null,   -- 关联 rule_instance.id
    enabled          boolean         not null default true,   -- 在此集合中是否启用
    severity_override varchar(10),                -- 覆盖严重级别（null=使用实例默认值）
    param_override   jsonb,                       -- 覆盖参数（null=使用实例默认值，非null则 deep merge）
    message_template text,                        -- 自定义违规消息模板（null=使用checker内置消息）
    sort_order       integer         not null default 0       -- 执行顺序
);

create unique index uq_rule_group_item on rule_group_item (group_id, instance_id);

comment on table  rule_group_item             is '法规集合项，同一法规在不同集合中可有不同的启用状态和参数覆盖';
comment on column rule_group_item.param_override is '参数覆盖 JSONB，与 instance.params deep merge，用于集合级微调';
comment on column rule_group_item.severity_override is '严重级别覆盖，如同一法规在 GANTT 中为 ERROR，在 PO 中为 WARNING';
comment on column rule_group_item.message_template is '自定义违规消息模板，支持{variable}插值，null=使用checker内置消息';
```

---

### params JSONB 示例

#### 最大飞行执勤期（max_fdp）

```json
{
  "base_limit_minutes": 780,
  "extended_limit_minutes": 840,
  "extension_requires_approval": true,
  "segment_adjustments": [
    { "min_segments": 1, "max_segments": 3, "limit_minutes": 780 },
    { "min_segments": 4, "max_segments": 5, "limit_minutes": 720 },
    { "min_segments": 6, "max_segments": 99, "limit_minutes": 660 }
  ],
  "time_of_day_adjustments": [
    { "report_after": "06:00", "report_before": "14:00", "limit_minutes": 780 },
    { "report_after": "14:00", "report_before": "22:00", "limit_minutes": 720 },
    { "report_after": "22:00", "report_before": "06:00", "limit_minutes": 660 }
  ],
  "acclimatized_only": true
}
```

#### 最小休息时间（min_rest）

```json
{
  "standard_minutes": 600,
  "reduced_minimum_minutes": 540,
  "reduced_requires_approval": true,
  "after_extended_fdp_minutes": 720,
  "home_base_bonus_minutes": 0,
  "consecutive_reduced_max": 2
}
```

#### 累计飞行时间限制（max_flight_time_cumulative）

```json
{
  "limits": [
    { "period_days": 7, "max_minutes": 3600, "label": "7天" },
    { "period_days": 28, "max_minutes": 6000, "label": "28天" },
    { "period_days": 90, "max_minutes": 16200, "label": "90天" },
    { "period_days": 365, "max_minutes": 60000, "label": "年度" }
  ],
  "count_deadhead": false,
  "count_positioning": false
}
```

#### 连续工作天数限制（max_consecutive_duty_days）

```json
{
  "max_days": 7,
  "rest_after_max_days_hours": 36,
  "exceptions": [
    { "condition": "short_haul_only", "max_days": 6 }
  ]
}
```

---

### conditions JSONB 示例

条件表达式，用于控制法规在什么情况下生效：

```json
// 仅长航线生效
{ "flight_type": { "in": ["long_haul", "ultra_long_haul"] } }

// 仅新机长生效（资历 < 500h）
{ "captain_hours": { "lt": 500 } }

// 航段数 ≥ 4 且报到时间在夜间
{
  "and": [
    { "segment_count": { "gte": 4 } },
    { "report_time": { "between": ["22:00", "06:00"] } }
  ]
}

// 无条件生效
null
```

---

### 与旧设计的对比

| 对比项 | 旧设计 | 新设计 |
|--------|--------|--------|
| 参数存储 | 逗号分隔字符串 | **JSONB**，结构化、可校验 |
| 新增参数 | 加列或改 param_names | 直接在 JSONB 中加字段，**不改表** |
| 条件型法规 | 硬编码或无法表达 | **conditions JSONB** 声明式表达 |
| 不同法规不同参数 | 勉强塞进同一格式 | 每个模板独立 **param_schema** |
| 法规集合级覆盖 | 不支持 | **param_override** 支持 deep merge |
| 类型安全 | 无（全是字符串） | **JSON Schema** 校验 |
| CCAR-121 对应 | reference 字段 | **ccar_reference** + 详细 description |
| PO/RO 约束转化 | 无 | **constraint_type** 标注约束类型 |

---

## CCAR-121 法规清单与模板映射

基于 CCAR-121-R5（第五次修订）主要法规条款：

### 飞行时间限制 (FLIGHT_TIME)

| 模板编码 | CCAR 条款 | 说明 | 约束类型 |
|---------|-----------|------|---------|
| max_flight_time_single | 121.487 | 单次飞行时间限制 | LINEAR |
| max_flight_time_cumulative | 121.487 | 累计飞行时间（7天/28天/90天/年） | LINEAR |
| max_flight_time_night | 121.487 | 夜航飞行时间限制 | LINEAR |

### 飞行执勤期 (FDP)

| 模板编码 | CCAR 条款 | 说明 | 约束类型 |
|---------|-----------|------|---------|
| max_fdp | 121.489 | 最大飞行执勤期（基于航段数和报到时间查表） | TABLE |
| fdp_extension | 121.489 | FDP 延伸（机长批准，有额外限制） | BOOL |
| split_duty_fdp | 121.489 | 分段执勤期（中间有休息的FDP计算） | LINEAR |

### 执勤时间 (DUTY)

| 模板编码 | CCAR 条款 | 说明 | 约束类型 |
|---------|-----------|------|---------|
| max_duty_period | 121.489 | 最大执勤时间（含地面任务） | LINEAR |
| max_consecutive_duty_days | 121.491 | 连续执勤天数限制 | LINEAR |
| max_duty_cumulative | 121.491 | 累计执勤时间（7天/28天） | LINEAR |

### 休息时间 (REST)

| 模板编码 | CCAR 条款 | 说明 | 约束类型 |
|---------|-----------|------|---------|
| min_rest_between_duty | 121.493 | 两个执勤期之间最小休息时间 | LINEAR |
| min_rest_weekly | 121.493 | 每7天最小连续休息时间 | LINEAR |
| min_rest_after_extended | 121.493 | 延伸FDP后的额外休息要求 | BOOL |
| reduced_rest | 121.493 | 缩短休息时间条件和限制 | BOOL |

### 增编机组 (AUGMENTED)

| 模板编码 | CCAR 条款 | 说明 | 约束类型 |
|---------|-----------|------|---------|
| augmented_fdp | 121.489 | 增编机组时的FDP上限调整 | TABLE |
| augmented_rest_onboard | 121.493 | 机上休息设施要求和休息时间 | BOOL |

### 疲劳管理 (FATIGUE)

| 模板编码 | CCAR 条款 | 说明 | 约束类型 |
|---------|-----------|------|---------|
| fatigue_risk_score | 121.495 | FRMS 疲劳风险评分 | CALC |
| circadian_disruption | 121.495 | 昼夜节律打乱评估 | CALC |
| sleep_pressure | 121.495 | 睡眠压力累计 | CALC |

### 资质要求 (QUALIFICATION)

| 模板编码 | CCAR 条款 | 说明 | 约束类型 |
|---------|-----------|------|---------|
| aircraft_type_rating | 121.453 | 机型资质匹配 | BOOL |
| airport_qualification | 121.445 | 机场资质（特殊机场） | BOOL |
| recency_check | 121.457 | 近期经历要求（90天3次起落） | LINEAR |
| medical_validity | 121.455 | 体检有效期 | BOOL |
| language_proficiency | 121.459 | 语言能力等级 | BOOL |

### 机组编制 (COMPOSITION)

| 模板编码 | CCAR 条款 | 说明 | 约束类型 |
|---------|-----------|------|---------|
| min_crew_composition | 121.463 | 最低机组配置（机长+副驾） | LINEAR |
| captain_experience | 121.463 | 新机长搭配要求 | BOOL |
| instructor_requirement | 121.465 | 带飞教员要求 | BOOL |

### 计算类法规 (CALCULATION)

| 模板编码 | 说明 | 约束类型 |
|---------|------|---------|
| fdp_calculator | 飞行执勤期计算（考虑报到/收尾时间） | CALC |
| rest_calculator | 休息时间计算 | CALC |
| flight_hour_calculator | 飞行小时累计（区分 block/air time） | CALC |
| manday_calculator | 工时计薪计算 | CALC |
| duty_period_calculator | 执勤期计算（含地面任务） | CALC |

---

## 数据关系图

```
rule_template (模板，系统预置，代码实现算法)
    │
    │  template_code
    ▼
rule_instance (实例，每条具体法规 + JSONB params)
    │
    │  instance_id
    ▼
rule_group_item (集合项，启用/禁用 + 参数覆盖)
    │
    │  group_id
    ▼
rule_group (集合，GANTT/PO/RO/PBS 分别使用)
    │
    │  group_code
    ▼
用户/模块选择使用哪个 rule_group
```

```
排班员 A 选择 rule_group = "ccar121_full"
  → rule_group_item: 50 条法规实例，全部启用

排班员 B 选择 rule_group = "ccar121_fatigue_only"
  → rule_group_item: 仅疲劳相关 8 条法规实例

PO 引擎使用 rule_group = "po_optimization"
  → rule_group_item: 约束类法规 30 条，severity 可能与 GANTT 不同
```
