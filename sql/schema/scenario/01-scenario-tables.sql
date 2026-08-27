-- ============================================================
-- 机组排班系统 — Scenario 数据存储优化
-- 仅包含 6 张表：roster_flight / pairing / pairing_segment /
--              pairing_composition / flight / flight_composition
--
-- 硬性约束：这 6 张表的字段结构必须与 live 保持一致。
-- 每次针对这些表的字段变化，必须两边同步修改。
-- ============================================================

-- 使用说明：
--   set search_path to CA;
--   \i 01-scenario-tables.sql
-- ============================================================

-- ============================================================
-- flight
-- ============================================================

create table flight (
    id                        bigint        generated always as identity primary key,
    created_by                varchar(30)   not null default 'system',
    created_at                timestamp   not null default now(),
    updated_by                varchar(30)   not null default 'system',
    updated_at                timestamp   not null default now(),
    scenario_id             bigint       not null check (scenario_id > 0),
    airline                   varchar(3)    not null,  -- 航空公司代码（IATA 2位或ICAO 3位）
    flt_dt                    date          not null,  -- 航班日期（本地日期）
    flt_num                   varchar(50)   not null,  -- 航班号
    dep_arp                   varchar(3)    not null,  -- 出发机场（IATA 3位）
    arv_arp                   varchar(3)    not null,  -- 到达机场
    sch_dep_dt_utc            timestamp   not null,  -- 计划起飞时间（UTC）
    sch_arv_dt_utc            timestamp   not null,  -- 计划落地时间（UTC）
    act_dep_dt_utc            timestamp   not null,  -- 实际起飞时间（UTC）
    act_arv_dt_utc            timestamp   not null,  -- 实际落地时间（UTC）
    est_dep_dt_utc            timestamp,             -- 预计起飞时间（UTC，滚动更新）
    est_arv_dt_utc            timestamp,             -- 预计落地时间（UTC）
    act_taxi_in_utc           timestamp,             -- 实际滑入时间（UTC）
    act_taxi_out_utc          timestamp,             -- 实际滑出时间（UTC）
    act_take_off_utc          timestamp,             -- 实际离地时间（UTC）
    act_touch_down_utc        timestamp,             -- 实际接地时间（UTC）
    act_dep_arp               varchar(3)    not null,  -- 实际起飞机场（备降时与 dep_arp 不同）
    act_arv_arp               varchar(3)    not null,  -- 实际落地机场
    flight_flag               varchar(1)    not null default 'A', -- 航班标志：A=实际 S=计划 C=取消
    flight_assignment         varchar(10),             -- 航班任务类型
    blk_min                   integer       not null,  -- 飞行时间 Block Time（分钟）
    fleet                     varchar(10)   not null,  -- 执飞机队
    onward_flt_num            varchar(5),              -- 后续联程航班号
    register                  varchar(30),             -- 飞机注册号
    ac_owner                  varchar(6),              -- 飞机所有者航司
    pilot_owner               varchar(6),              -- 负责飞行员的航司
    cabin_owner               varchar(6),              -- 负责客舱的航司
    airmarshal_owner          varchar(6),              -- 负责空中安全员的航司
    commute_id                bigint,                  -- 关联通勤安排 id
    seg_type                  varchar(1),              -- 航段类型：D=国内 I=国际
    flt_type                  varchar(8)    not null,  -- 航班类型（PAX=客机 FRT=货机 TRN=训练）
    flt_sts                   varchar(3),              -- 航班运行状态
    flt_vr                    varchar(1),              -- 飞行规则：I=仪表 V=目视
    voyage_status             smallint,                            -- 航程状态：0=正常 1=取消 2=备降
    is_locked                 smallint      not null default 0, -- 是否锁定（锁定后不可修改机组）
    sch_id                    bigint        not null default 0, -- 关联计划排班 id
    vr_add                    numeric,                          -- VR 附加值
    live_id                   bigint,                  -- 对应 live 系统内部 id
    etd_chg_tm                timestamp,             -- 最后一次 ETD 变更时间
    interface_flt_id          varchar(40),             -- 外部接口航班 id（运控系统）
    apis_stage                smallint,                -- APIS（旅客预报）阶段
    price                     numeric(10,2),           -- 票价（用于成本分析）
    service_type              varchar(5),              -- 服务类型
    flt_last_delay_etd_utc    timestamp,             -- 最新延误预计起飞时间（UTC）
    flt_delay_notify_utc      timestamp,             -- 延误通知发出时间（UTC）
    device_code               varchar(50),             -- 设备编码
    flight_key                varchar(30),             -- 航班唯一业务键（航班号+日期+出发机场）
    flt_dt_utc                date,                    -- 航班日期（UTC）
    suffix                    varchar(20),             -- 航班后缀（用于区分同日同号航班）
    pay_fly_hours             smallint,                -- 付薪飞行小时
    act_door_closed_utc       timestamp,             -- 舱门关闭时间（UTC）
    act_door_open_utc         timestamp,             -- 舱门开启时间（UTC）
    course_code               varchar(30),             -- 培训课程代码（训练航班使用）
    remark                    varchar(512),            -- 备注
    sub_fleet                 varchar(64),             -- 子机队
    origin_flt_dt_utc         date,                    -- 原始航班日期（改期前）
    origin_interface_flt_id   varchar(40),             -- 原始接口航班 id（改期前）
    is_deleted                smallint      not null default 0, -- 软删除标记：1=已删除
    manual_comp_flag          smallint,                         -- 是否手动配置编组：1=是
    leg_no                    integer                  -- 航段序号（一个旅程中的第几段）
);
create index idx_flight_flt_dt    on flight (flt_dt, flt_dt_utc);
create index idx_flight_flag      on flight (id, flight_flag);
create index idx_flight_interface on flight (interface_flt_id);
create index idx_flight_str_end   on flight (sch_dep_dt_utc, sch_arv_dt_utc);

comment on table  flight                  is '航班主表，存储所有航班计划和实际运行数据';
comment on column flight.flight_flag      is '航班标志：A=实际执行 S=仅计划 C=取消';
comment on column flight.blk_min          is 'Block Time 飞行时间，从关舱门到开舱门，单位分钟';
comment on column flight.is_locked        is '锁定标记：1=锁定后排班人员不可修改该航班的机组';
comment on column flight.flight_key       is '业务唯一键，通常为 航班号+日期+出发机场 组合';
comment on column flight.is_deleted       is '软删除：1=已删除但保留记录 0=正常';

-- ------------------------------------------------------------
-- flight_composition — 航班各职级编组需求
-- 定义该航班需要几名各职级机组成员
-- ------------------------------------------------------------

-- ============================================================
-- flight_composition
-- ============================================================

create table flight_composition (
    id           bigint       generated always as identity primary key,
    created_by   varchar(30)  not null default 'system',
    created_at   timestamp  not null default now(),
    updated_by   varchar(30)  not null default 'system',
    updated_at   timestamp  not null default now(),
    scenario_id             bigint       not null check (scenario_id > 0),
    flt_id       bigint       not null,  -- 关联航班 id
    division     varchar(2)   not null,  -- 机组类型
    acting_rank  varchar(20),            -- 职级代码（如 CA/FO/PU/FA）
    plan         integer,                -- 计划需要人数，法规引擎和 PO 优化引擎参考此值
    fill         integer      not null default 0,    -- 已被环引用的人数（来自 pairing_composition.plan 汇总）
    open         integer      generated always as (plan - fill) stored
);
create index idx_flight_comp_flt on flight_composition (flt_id, acting_rank);

comment on table  flight_composition            is '航班编组需求，定义每个航班需要哪些职级各几名机组';
comment on column flight_composition.acting_rank is '职级代码：CA=机长 FO=副驾驶 PU=乘务长 FA=乘务员';
comment on column flight_composition.plan        is '计划需要人数，法规引擎和 PO 优化引擎参考此值';
comment on column flight_composition.fill        is '已被环引用的人数（来自 pairing_composition.plan 汇总）';
comment on column flight_composition.open        is '剩余未分配人数（plan - fill），PostgreSQL 自动计算';

-- ============================================================
-- section 5: pairing 完全单表化（仅保留 2 张表）
-- ============================================================

-- ------------------------------------------------------------
-- pairing_composition — 环编组需求（独立表，不冗余进 segment）
-- 定义该环需要哪些职级各几名机组
-- ------------------------------------------------------------

-- ============================================================
-- pairing_composition
-- ============================================================

create table pairing_composition (
    id           bigint       generated always as identity primary key,
    created_by   varchar(30)  not null default 'system',
    created_at   timestamp  not null default now(),
    updated_by   varchar(30)  not null default 'system',
    updated_at   timestamp  not null default now(),
    scenario_id             bigint       not null check (scenario_id > 0),
    pairing_id   bigint       not null,  -- 环业务标识（由后端序列生成）
    division     varchar(2)   not null,  -- 机组类型
    is_deleted   smallint     not null default 0, -- 软删除：1=已删除
    acting_rank  varchar(30),            -- 职级代码
    plan         integer,                -- 该职级在此环中需要的人数，RO 引擎分配时使用
    fill         integer      not null default 0,    -- 已分配机组人数（来自 roster_flight DISTINCT crew_id 计数）
    open         integer      generated always as (plan - fill) stored
);
create index idx_pair_comp_pair_id on pairing_composition (pairing_id);
create index idx_pair_comp_cover   on pairing_composition (pairing_id, acting_rank, is_deleted);

comment on table  pairing_composition            is '环级编组需求，独立存储不冗余进 segment 行';
comment on column pairing_composition.pairing_id is '环业务标识，由后端序列生成，非数据库外键约束';
comment on column pairing_composition.plan       is '该职级在此环中需要的人数，RO 引擎分配时使用';
comment on column pairing_composition.fill       is '已分配机组人数（来自 roster_flight DISTINCT crew_id 计数）';
comment on column pairing_composition.open       is '剩余未分配人数（plan - fill），PostgreSQL 自动计算';

-- ============================================================
-- 机组排班系统 — Pairing 双表结构（最终版）
-- ============================================================
-- 设计决策：
--   原 4 层结构（Pairing / PairingDuty / PairingDutyNode / PairingSegment）
--   调整为 2 张表：
--
--   pairing         — 环头表，1行=1个环，存环级属性
--   pairing_segment — 环行宽表，1行=1个航班段，
--                     将 PairingDuty / PairingDutyNode / PairingSegment
--                     三层信息合并内嵌，duty_前缀字段冗余存储
--
-- 两表关系：
--   pairing.id  ←  pairing_segment.pairing_id（外键，可 ON DELETE CASCADE）
--   一个 pairing 对应多条 pairing_segment 行
--
-- pairing_segment 的 duty 冗余设计说明：
--   - 同一 duty 内的所有 seg 行，duty_ 前缀字段值完全相同
--   - 单行自洽：任意一行损坏不影响其他行的读取
--   - 修改 duty 级属性需更新该 duty 所有 seg 行（应用层保证）
--   - 修改环级属性只需更新 pairing 表的 1 行
-- ============================================================

-- ------------------------------------------------------------
-- pairing — 环头表
-- 1 行 = 1 个环，存环级别的所有属性
-- 环内的 duty/seg 详情见 pairing_segment 表
-- ------------------------------------------------------------

-- ============================================================
-- pairing
-- ============================================================

create table pairing (
    id                           bigint        generated always as identity primary key,
    created_by                   varchar(30)   not null default 'system',  -- 创建人
    created_at                   timestamp   not null default now(),      -- 创建时间（UTC）
    updated_by                   varchar(30)   not null default 'system',  -- 最后修改人
    updated_at                   timestamp   not null default now(),      -- 最后修改时间（UTC）
    scenario_id             bigint       not null check (scenario_id > 0),

    -- ── 环标识 ──────────────────────────────────────────────
    pairing_label                varchar(200),            -- 环标签/名称（如 T450 / E4154）
    filiale                      varchar(6),              -- 所属航司二字码
    division                     varchar(2)   not null,   -- 机组类型（P=飞行员 C=客舱 A=空管）
    base                         varchar(3)   not null,   -- 环所属基地机场三字码
    fleet                        varchar(10)  not null,   -- 执飞机队代码
    assignment_group             varchar(20)  not null,   -- 任务分组代码
    assignment                   varchar(20)  not null,   -- 任务类型代码

    -- ── 环时间 ──────────────────────────────────────────────
    sch_str_dt_utc       timestamp  not null,   -- 计划开始时间（UTC，第一个PickUp开始时间）
    sch_end_dt_utc       timestamp  not null,   -- 计划结束时间（UTC，最后一个DropOff结束时间）
    act_str_dt_utc       timestamp  not null,   -- 实际开始时间（UTC）
    act_end_dt_utc       timestamp  not null,   -- 实际结束时间（UTC）
    pairing_dt           date,                    -- 环日期（计划开始日，sch_str_dt_utc 的 UTC 日历日）

    -- ── 环统计 ──────────────────────────────────────────────
    duration_days                smallint     not null,   -- 环跨越的自然天数
    tafb                         smallint     not null,   -- 离基地时间 TAFB（分钟）
    duty_count                   smallint     not null default 1,  -- 环内 duty 总数
    seg_count                    smallint     not null default 1,  -- 环内航班段总数

    -- ── 津贴与工时统计 ──────────────────────────────────────
    per_diem_mins                numeric(10,2),           -- 津贴时长（分钟）
    per_diem_mins_adjustment     numeric(10,2),           -- 津贴调整量
    wp_mins                      numeric(10,2),           -- 实际工作时间（分钟）
    wp_mins_adjustment           numeric(10,2),           -- 工作时间调整量
    sch_per_diem_mins            numeric(8,2),            -- 计划津贴时长
    sch_lh_per_diem_mins         numeric(8,2),            -- 计划长途津贴
    sch_wp_mins                  numeric(8,2),            -- 计划工作时间
    lh_per_diem_mins             numeric(8,2),            -- 长途津贴时长
    fm_per_diem_mins             numeric(8,2),            -- 货机津贴时长
    fm_lh_per_diem_mins          numeric(8,2),            -- 货机长途津贴
    sch_fm_per_diem_mins         numeric(8,2),            -- 计划货机津贴
    sch_fm_lh_per_diem_mins      numeric(8,2),            -- 计划货机长途津贴
    ggy_blh                      integer,                 -- 高高原飞行时间（分钟）

    -- ── 状态与扩展 ──────────────────────────────────────────
    ver                          integer      not null default 1,  -- 乐观锁版本号，每次修改递增
    preference                   varchar(1)   check (preference in ('L','P') or preference is null), -- 偏好：L=喜欢 P=不喜欢（机组申请标记）
    is_deleted                   smallint     not null default 0,  -- 软删除：1=已删除 0=正常
    live_id                      bigint,                  -- 对应 live 系统（M1 Gantt）中的记录 id
    interface_id                 varchar(100),            -- 外部接口系统 id（如 OPS 系统）
    source                       varchar(12),             -- 数据来源：MANUAL=手动 OPT=优化生成 IMPORT=导入
    tags                         varchar(100),            -- 标签列表（逗号分隔，快速过滤用）
    comments             		 varchar(120)             -- 环级备注
);

-- 核心查询索引
create index idx_pairing_base_fleet   on pairing (base, fleet, act_str_dt_utc);
create index idx_pairing_str_end      on pairing (act_str_dt_utc, act_end_dt_utc);
create index idx_pairing_label        on pairing (pairing_label) where pairing_label is not null;
create index idx_pairing_deleted      on pairing (is_deleted);
create index idx_pairing_live_id      on pairing (live_id) where live_id is not null;

comment on table  pairing                          is '环头表，1行=1个环，存环级属性；环内duty/seg详情见 pairing_segment';
comment on column pairing.pairing_label            is '环名称/编号，如 T450 / E4154，来自生产系统或人工命名';
comment on column pairing.tafb                     is '离基地时间（Time Away From Base），单位分钟';
comment on column pairing.ver                      is '乐观锁版本号，每次修改环时递增，并发更新时做版本校验';
comment on column pairing.preference               is '机组偏好标记：L=Like喜欢 P=Prefer not不喜欢，PBS申请时使用';
comment on column pairing.is_deleted               is '软删除标记：0=正常 1=已删除（不物理删除，保留历史）';
comment on column pairing.source                   is '数据来源：MANUAL=排班员手动创建 OPT=优化引擎生成 IMPORT=外部系统导入';
comment on column pairing.live_id                  is '关联 M1 Gantt live 系统的记录 id，用于跨系统数据关联';

comment on column pairing.duty_count               is '环内 duty 总数（冗余统计字段，避免频繁 count 查询）';
comment on column pairing.seg_count                is '环内航班段总数（冗余统计字段）';


-- ------------------------------------------------------------
-- pairing_segment — 环行宽表（duty/seg 三层合并）
--
-- 合并了原 PairingDuty / PairingDutyNode / PairingSegment 三张表
-- 设计原则：
--   每行 = 1个航班段（原 PairingSegment 的粒度）
--   duty_ 前缀字段来自原 PairingDuty，冗余内嵌
--   进退场字段（pickup/brief/debrief/dropoff + double_*）来自原 PairingDutyNode，冗余内嵌
--   同一 duty 的所有 seg 行，duty_ 字段值完全相同
--   单行自洽：任意一行损坏不影响其他行，系统永远可以打开
--   修改 duty 属性时，需更新该 duty 所有 seg 行（应用层保证原子性）
--   支持首次+第二次进退场（pickup/brief/debrief/dropoff + double_pickup/brief/debrief/dropoff）
--   第1次必填，第2/3次无则为 null
-- ------------------------------------------------------------

-- ============================================================
-- pairing_segment
-- ============================================================

create table pairing_segment (
    id                           bigint        generated always as identity primary key,
    created_by                   varchar(30)   not null default 'system',  -- 创建人
    created_at                   timestamp   not null default now(),      -- 创建时间（UTC）
    updated_by                   varchar(30)   not null default 'system',  -- 最后修改人
    updated_at                   timestamp   not null default now(),      -- 最后修改时间（UTC）
    scenario_id             bigint       not null check (scenario_id > 0),

    -- ── 归属 ──────────────────────────────────────────────
    pairing_id                   bigint        not null,  -- 关联 pairing.id（本表与 pairing 表的关联键）

    -- ── duty 层信息（冗余内嵌，来自原 PairingDuty 表）──────
    -- 同一 duty 的所有 seg 行，以下 duty_ 字段值完全相同
    duty_seq                     smallint      not null,  -- 环内第几个 duty（从 1 开始）
    duty_str_arp                 varchar(3)    not null,  -- duty 签到机场三字码
    duty_end_arp                 varchar(3)    not null,  -- duty 签出机场三字码
    duty_sch_str_dt_utc          timestamp   not null,  -- duty 实际开始时间（UTC Brief开始）
    duty_sch_end_dt_utc          timestamp   not null,  -- duty 实际结束时间（UTC DeBrief结束）
	duty_act_str_dt_utc          timestamp   not null,  -- duty 实际开始时间（UTC）
    duty_act_end_dt_utc          timestamp   not null,  -- duty 实际结束时间（UTC）
    duty_hotel_id                bigint,                  -- duty 结束后过夜酒店 id（关联 hotel 表）
    duty_assignment              varchar(20),             -- duty 级任务类型（如 DH=调机 SBY=待命）
    duty_brief_min               integer,                 -- 签到提前时间（分钟，法规要求在起飞前 N 分钟签到）
    duty_debrief_min             integer,                 -- 签出后等待时间（分钟，debrief 时间）

	duty_sch_duty_min         	 integer,                 -- 计划 duty 总时长（分钟）
	duty_sch_fdp_min             integer,                 -- 计划 FDP（分钟）
    duty_sch_flt_min         	 integer,                 -- 计划飞行时间（分钟）
	duty_sch_dp_min              integer,                 -- 计划 DP（Duty Period，分钟）
	duty_sch_rest_min            integer,                 -- 与上一 duty 间法规要求的最小休息时间（分钟）
	duty_sch_wp_min              numeric(10,2),           -- 计划工作时间（分钟）
	duty_sch_fm_credited_minutes numeric(8,2),            -- 计划货机信用积分
	duty_sch_credited_minutes    numeric(8,2),            -- 计划信用积分

    duty_act_duty_min         	 integer,                 -- 实际 duty 总时长（分钟）
    duty_act_fdp_min             integer,                 -- 实际 FDP（分钟）
    duty_act_flt_min          	 integer,                 -- 实际飞行时间（分钟）
    duty_act_dp_min              integer,                 -- 实际 DP（Duty Period，分钟）
    duty_act_rest_min            integer,                 -- 与上一 duty 间实际休息时间（分钟）
	duty_act_wp_min              numeric(10,2),           -- 实际工作时间（分钟）
	duty_act_fm_credited_minutes     numeric(8,2),        -- 实际货机信用积分（分钟）
    duty_act_credited_minutes        numeric(6,2),        -- 实际信用积分（分钟）

    duty_ref_tz                  integer,                 -- 参考时区偏移（分钟，用于昼夜节律计算）
    duty_etr_tz                  integer,                 -- ETR 时区偏移（分钟）
    duty_acc_state               varchar(1)    not null default 'D', -- 签入状态：D=草稿可修改 A=已确认锁定
    duty_layover_nits            integer,                 -- 过夜夜数（用于津贴计算）

    duty_fdp_discretion_min      integer,                 -- FDP 酌情延长分钟数（机长授权延伸）
    duty_max_fdp_min             integer,                 -- 该 duty 的最大 FDP 上限（分钟，法规计算结果）
    duty_wp_adjustment           numeric(10,2),           -- 工作时间调整量
    duty_training_add_time       integer,                 -- 培训附加时间（分钟，训练任务额外计入）
    duty_is_manual_modify        smallint,                -- duty 是否被手动修改：1=是 0=否
    duty_is_manual_max_fdp       smallint      check (duty_is_manual_max_fdp in (0,1)), -- 是否手动设定最大 FDP：1=是
    duty_discretion_type         varchar(100),            -- 酌情延伸类型（记录 FDP 延伸原因）
    duty_comments                varchar(255),            -- duty 级备注

    -- ── 进退场信息（冗余内嵌，来自原 PairingDutyNode 表）──
    -- 首次进退场（Duty 内的主签到/签出，可空）
    pickup_start_utc             timestamp,             -- 首次Pickup坐车开始时间（UTC），Duty内第一段赋值
    pickup_end_utc               timestamp,             -- 首次Pickup坐车结束时间（UTC）
    brief_start_utc              timestamp,             -- 首次Brief签到开始时间（UTC），Duty内第一段赋值
    brief_end_utc                timestamp,             -- 首次Brief签到结束时间（UTC）
    debrief_start_utc            timestamp,             -- 首次Debrief签出开始时间（UTC），Duty内最后段赋值
    debrief_end_utc              timestamp,             -- 首次Debrief签出结束时间（UTC）
    dropoff_start_utc            timestamp,             -- 首次Dropoff坐车开始时间（UTC），Duty内最后段赋值
    dropoff_end_utc              timestamp,             -- 首次Dropoff坐车结束时间（UTC）
    -- 第二次进退场（带休息的 Duty 或大过站场景，可空）
    double_pickup_start_utc      timestamp,             -- 第二次Pickup开始时间（UTC），带休息Duty或大过站场景使用
    double_pickup_end_utc        timestamp,             -- 第二次Pickup结束时间（UTC）
    double_brief_start_utc       timestamp,             -- 第二次Brief签到开始时间（UTC）
    double_brief_end_utc         timestamp,             -- 第二次Brief签到结束时间（UTC）
    double_debrief_start_utc     timestamp,             -- 第二次Debrief签出开始时间（UTC）
    double_debrief_end_utc       timestamp,             -- 第二次Debrief签出结束时间（UTC）
    double_dropoff_start_utc     timestamp,             -- 第二次Dropoff开始时间（UTC）
    double_dropoff_end_utc       timestamp,             -- 第二次Dropoff结束时间（UTC）

    -- ── 航班段信息（来自原 PairingSegment 表）────────────
    seg_seq                      smallint      not null,  -- duty 内第几个航班段（从 1 开始）
    flt_id                       bigint,                  -- 关联 flight 表 id，null=地面任务段
    flt_dt                       date,                    -- 航班日期（UTC 起飞日期）
    flt_num                      varchar(100)  not null,  -- 航班号（冗余，避免 join flight 表）
    airline                      varchar(3)    not null,  -- 航空公司代码
    dep_arp                      varchar(3)    not null,  -- 出发机场三字码
    arv_arp                      varchar(3)    not null,  -- 到达机场三字码
    fleet_seg                    varchar(10)   not null,  -- 该段实际执飞机队（可能与环头 fleet 不同，如调机）
    act_str_dt_utc               timestamp   not null,  -- 航班实际起飞时间（UTC）
    act_end_dt_utc               timestamp   not null,  -- 航班实际落地时间（UTC）
	sch_str_dt_utc               timestamp   not null,  -- 航班实际起飞时间（UTC）
    sch_end_dt_utc               timestamp   not null,  -- 航班实际落地时间（UTC）
    seg_assignment               varchar(20)   not null,  -- 该航段任务类型代码（FLT=正常飞行 DH=调机）
    is_deleted               	 smallint      not null default 0, -- 该航班段是否被移除：1=已移除 0=正常
    is_long_transit              smallint,                -- 是否长时间中转（超过标准中转时限）：1=是
    wp_mins_seg                  numeric(10,2),           -- 该段工作时间（分钟）
    act_credited_minutes_seg     numeric(8,2),            -- 该段实际信用积分（分钟）
    act_fm_credited_minutes_seg  numeric(8,2),            -- 该段实际货机信用积分
    sch_credited_minutes_seg     numeric(8,2),            -- 该段计划信用积分
    sch_fm_credited_minutes_seg  numeric(8,2)             -- 该段计划货机信用积分
);

-- 唯一约束：同一个环内，duty_seq + seg_seq 组合不重复
create unique index uq_pair_seg on pairing_segment (pairing_id, duty_seq, seg_seq);

-- 核心查询索引
create index idx_pair_seg_pair_id     on pairing_segment (pairing_id);
create index idx_pair_seg_pair_duty   on pairing_segment (pairing_id, duty_seq);
create index idx_pair_seg_flt_id      on pairing_segment (flt_id);
create index idx_pair_seg_dep_arv     on pairing_segment (dep_arp, arv_arp, act_str_dt_utc);

comment on table  pairing_segment                    is '环行宽表，1行=1个航班段；合并了原 PairingDuty/PairingDutyNode/PairingSegment 三层；duty_字段冗余内嵌，单行自洽';
comment on column pairing_segment.pairing_id         is '关联 pairing.id，是真正的外键（与旧版独立设计不同）';
comment on column pairing_segment.duty_seq           is '环内 duty 序号，从1开始；相同 duty_seq 的所有行属于同一个 duty';
comment on column pairing_segment.seg_seq            is '同一 duty 内的航班段序号，从1开始';
comment on column pairing_segment.duty_brief_min     is '签到提前时间（分钟），法规要求在航班起飞前 N 分钟完成签到（如60分钟）';
comment on column pairing_segment.duty_max_fdp_min   is '该 duty 的法规计算最大 FDP 上限（分钟），由法规引擎计算写入';
comment on column pairing_segment.duty_acc_state     is 'D=草稿可修改 A=已确认锁定，确认后不允许排班员直接修改';
comment on column pairing_segment.seg_assignment     is '航段任务类型：FLT=正常执飞 DH=Deadhead调机 TRN=训练';
comment on column pairing_segment.is_deleted     is '该航班段软删除标记，1=此段已从 duty 中移除（保留记录但不参与计算）';
comment on column pairing_segment.fleet_seg          is '该段实际执飞机队，可能与环头 fleet 不同（如环内含调机段）';

-- ============================================================
-- 说明：以下配套表结构不变
--   pairing_composition  — 环编组需求（独立表，关联 pairing.id）
--   pairing_template     — 环模板
--   pairing_memo         — 环备注
-- ============================================================

-- ------------------------------------------------------------
-- pairing_template — 环模板（供 PO 优化引擎参考）
-- ------------------------------------------------------------

-- ============================================================
-- roster_flight
-- ============================================================

create table roster_flight (
    id                           bigint        generated always as identity primary key,
    created_by                   varchar(30)   not null default 'system',
    created_at                   timestamp   not null default now(),
    updated_by                   varchar(30)   not null default 'system',
    updated_at                   timestamp   not null default now(),
    scenario_id             bigint       not null check (scenario_id > 0),

    -- ── 公共字段（飞行任务和地面任务都有）──────────────────
    crew_id                      varchar(30)   not null,  -- 机组工号
	pairing_id                   bigint,                           -- 环业务 id，null=地面任务
    live_id                      bigint,                  -- 来源 live roster_flight.id，由 optimizer output old_id 回填
    ver                          integer       not null default 1, -- 版本号
	base                         varchar(3)    not null,  -- 环所属基地机场三字码
    label                        varchar(200),            -- 排班标签
    assignment_group             varchar(20)   not null,  -- 任务分组代码
    assignment                   varchar(20),             -- 任务类型代码
    role                         varchar(20),             -- 角色（如 CAPTAIN/FO/PIC）
    sub_role                     varchar(100),            -- 子角色
    source                       varchar(12)   not null,  -- 排班来源（PA=从Live提取/lead-in / MA=人工 / CR=优化器）
    is_requested                 smallint      not null default 0, -- 是否为机组主动申请：1=是
    is_deleted                   smallint      not null default 0, -- 软删除：1=已删除
    is_swapped                   smallint      not null default 0, -- 是否为换班产生：1=是
    preference                   varchar(1),              -- 偏好标记（L=喜欢 P=不喜欢）
    comments                     varchar(180),            -- 备注
    score                        integer,                 -- 优化引擎评分
	working_hour                 numeric(8,2),            -- 工作小时

	sch_credited_minutes         numeric(8,2),            -- 计划信用积分
    sch_fm_credited_minutes      numeric(8,2),            -- 计划货机信用积分
    sch_per_diem_mins            numeric(8,2),            -- 计划津贴
    sch_lh_per_diem_mins         numeric(8,2),            -- 计划长途津贴
    sch_fm_per_diem_mins         numeric(8,2),            -- 计划货机津贴
    sch_fm_lh_per_diem_mins      numeric(8,2),            -- 计划货机长途津贴

	act_credited_minutes         numeric(8,2),        	  -- 信用积分（分钟）
	act_fm_credited_minutes      numeric(8,2),        	  -- 货机信用积分
    act_per_diem_mins            numeric(8,2),        	  -- 津贴时长（分钟）
    act_lh_per_diem_mins         numeric(8,2),        	  -- 长途津贴时长
    act_fm_per_diem_mins         numeric(8,2),        	  -- 货机津贴时长
    act_fm_lh_per_diem_mins      numeric(8,2),        	  -- 货机长途津贴

    -- ── 飞行任务字段（pairing_id > 0 时有值）───────────────
    flt_id                       bigint,                  -- 关联 flight 表 id（地面任务为 null）
    duty_seq                     smallint,                -- duty 序号（地面任务为 null）
    seg_seq                      smallint,                -- 航班段序号（地面任务为 null）
    duty_ref_tz                  integer,                 -- crew-specific 7500 duty-start 参考时区偏移（分钟）
    duty_end_ref_tz              integer,                 -- crew-specific 7500 duty-end/rest-start 参考时区偏移（分钟）
    flt_dt                       varchar(10),             -- 航班日期字符串（地面任务为 null）
    sch_str_dt_utc           	 timestamp,             -- 计划开始时间（UTC 航班和地面任务共用）
    sch_end_dt_utc           	 timestamp,             -- 计划结束时间（UTC 航班和地面任务共用）
	act_str_dt_utc           	 timestamp,             -- 实际开始时间（UTC）
    act_end_dt_utc           	 timestamp,             -- 实际结束时间（UTC）
    division                     varchar(2),              -- 机组类型
	flight_acting_rank           varchar(10)   not null,  -- 在该航班上实际担任的职级（可能与环槽位不同）
    roster_acting_rank           varchar(10),             -- 对应 pairing_composition 的职级槽位，同一环内所有航段一致
    active_rank                  varchar(20),             -- 实际担任职级（本职级）
	position                     varchar(10),             -- 席位
    seq_order                    smallint,                -- 同航班机组排序序号
    check_type                   varchar(40),             -- 签到类型
    ts_flag                      varchar(50),             -- TS 标志
    send_flag                    smallint,                -- 推送标志：1=已推送给机组 app
    resource_code                varchar(100),            -- 资源代码
    tm_program_course_id         bigint,                  -- 训练计划课程 id
    group_id                     varchar(200),            -- 分组 id（批量操作）
    tag_set                      varchar(50),             -- 标签集
    parent_tm_program_course_id  bigint,                  -- 父训练课程 id
    course_code                  varchar(30),             -- 课程代码
    is_extra_course              smallint      not null default 0, -- 是否额外培训：1=是
    sub_tm_program_course_id     bigint,                  -- 子训练课程 id
    sub_parent_tm_program_id     bigint,                  -- 子父训练课程 id
    sub_course_code              varchar(30),             -- 子课程代码
    seq_order_source             varchar(20),             -- 排序来源
    sub_group_id                 varchar(200),            -- 子分组 id
    request_source               varchar(20),             -- 申请来源
    request_id                   bigint,                  -- 关联申请单 id
    is_publish                   smallint,                -- 是否已发布给机组：1=已发布
    exception_code               varchar(50),             -- 异常代码
    act_rest_min                 integer                  -- 实际休息时长（分钟），地面任务从 assignment.rest_time 填充，飞行任务为 null
);

comment on table  roster_flight                     is '排班宽表，融合原 roster + roster_flight，飞行和地面任务共用';
comment on column roster_flight.pairing_id          is '环业务 id；0=地面任务；>0=飞行任务，对应 pairing_segment.pairing_id';
comment on column roster_flight.sch_str_dt_utc      is '计划开始时间：飞行任务=航班计划起飞，地面任务=任务开始时间';
comment on column roster_flight.sch_end_dt_utc      is '计划结束时间：飞行任务=航班计划落地，地面任务=任务结束时间';
comment on column roster_flight.flight_acting_rank  is '在该航班上实际担任的职级（可能与环槽位不同）';
comment on column roster_flight.roster_acting_rank  is '对应 pairing_composition 的职级槽位，同一环内所有航段一致';
comment on column roster_flight.source              is '排班来源：PA=预分配/外部接口或文件导入，MA=Gantt人工分配或批量创建，CR=优化器计算结果';
comment on column roster_flight.is_requested        is '是否机组主动通过 PBS 申请得到此排班：1=申请 0=系统分配';
comment on column roster_flight.exception_code      is '法规违规代码，法规引擎检测到违规时写入，正常为 null';

-- ------------------------------------------------------------
-- roster_publish — 已发布排班（推送给机组 app 查看）
-- ------------------------------------------------------------

-- ============================================================
-- 外键约束（仅 scenario 内 6 张表之间的 FK）
-- ============================================================

alter table pairing_segment
  add constraint fk_ps_pairing foreign key (pairing_id) references pairing(id) on delete restrict,
  add constraint fk_ps_flight  foreign key (flt_id)     references flight(id)  on delete restrict;

alter table pairing_composition
  add constraint fk_pc_pairing foreign key (pairing_id) references pairing(id) on delete restrict;

alter table flight_composition
  add constraint fk_fc_flight  foreign key (flt_id)     references flight(id)  on delete restrict;

alter table roster_flight
  add constraint fk_rf_pairing foreign key (pairing_id) references pairing(id)  on delete restrict,
  add constraint chk_roster_flight_source_scenario check (source in ('PA', 'MA', 'CR'));

-- ============================================================
-- 性能索引（与 live 同步）
-- ============================================================

-- pairing 表过滤字段（排除已删除行）
create index idx_pairing_fleet on pairing (fleet) where is_deleted = 0;
create index idx_pairing_base on pairing (base) where is_deleted = 0;
create index idx_pairing_tafb on pairing (tafb) where is_deleted = 0;
create index idx_pairing_division on pairing (division) where is_deleted = 0;

-- pairing_segment 表过滤字段（排除已删除行）
create index idx_pairing_segment_flt_num on pairing_segment (flt_num) where is_deleted = 0;
create index idx_pairing_segment_dep_arp on pairing_segment (dep_arp) where is_deleted = 0;

-- flight 表过滤字段（排除已删除行）
create index idx_flight_flt_num on flight (flt_num) where is_deleted = 0;
create index idx_flight_dep_arp on flight (dep_arp) where is_deleted = 0;
create index idx_flight_arv_arp on flight (arv_arp) where is_deleted = 0;

-- pairing occurrence 查询性能索引
create index idx_pairing_label_upper_active on pairing (upper(pairing_label)) where is_deleted = 0 and pairing_label is not null;
create index idx_pairing_segment_pair_active on pairing_segment (pairing_id, is_deleted);

-- roster_flight 滚动历史查询性能索引
create index idx_rf_crew_str_dt on roster_flight (crew_id, sch_str_dt_utc) where is_deleted = 0 and assignment_group in ('FLT', 'DHD');

-- flight / pairing 接口 upsert 唯一索引
create unique index uq_flight_interface_flt_id on flight (interface_flt_id) where interface_flt_id is not null;
create unique index uq_pairing_interface_id on pairing (interface_id) where interface_id is not null;

-- roster_flight 查询性能索引（R3）
create index idx_roster_flight_crew_sch on roster_flight (crew_id, sch_str_dt_utc) where is_deleted = 0;
create index idx_roster_flight_pairing on roster_flight (pairing_id, duty_seq, seg_seq);
create index idx_scenario_roster_flight_live_id on roster_flight (scenario_id, live_id) where live_id is not null;
-- 8072/8030 Live∪Scenario COF fills by physical flt_id
create index idx_roster_flight_flt_fly
    on roster_flight (flt_id)
    where is_deleted = 0
      and assignment_group = 'FLY'
      and pairing_id is not null
      and flt_id is not null;


-- ============================================================
-- crew_manday_fd_daily — 飞行员每日累计工时（近 N 个月）
-- 按天存储，每条记录代表某机组某天的累计工时汇总
-- ------------------------------------------------------------
create table crew_manday_fd_daily (
    id                    bigint        generated always as identity primary key,
    created_by            varchar(30)   not null default 'system',
    created_at            timestamp   not null default now(),
    updated_by            varchar(30)   not null default 'system',
    updated_at            timestamp   not null default now(),
    scenario_id             bigint       not null check (scenario_id > 0),
    crew_id               varchar(30)   not null,  -- 机组工号
    crew_base_dt          date          not null,  -- 统计日期（本地日期）
    ft                    integer       not null default 0,  -- 飞行时间（分钟）
    augument_ft           integer       not null default 0,  -- 增强机组飞行时间
    double_ft             integer       not null default 0,  -- 双机组飞行时间
    blh                   integer       not null default 0,  -- 飞行小时（Block Hour，分钟）
    augument_blh          integer       not null default 0,  -- 增强机组 BLH
    double_blh            integer       not null default 0,  -- 双机组 BLH
    fdp                   integer       not null default 0,  -- 飞行执勤时间 FDP（分钟）
    dp                    integer       not null default 0,  -- 执勤时间 DP（分钟）
    night_dp              integer       not null default 0,  -- 夜间执勤时间（分钟）
    travel                integer       not null default 0,  -- 旅途时间（分钟）
    credit                numeric(6,2)  not null default 0,  -- 信用积分（小时）
    fatigue               integer       not null default 0,  -- 疲劳指数
    is_leave              integer       not null default 0,  -- 当日是否有假期：1=是
    is_day_off            integer       not null default 0,  -- 当日是否为休息日：1=是
    standby               integer       not null default 0,  -- 待命时间（分钟）
    act_take_offs         smallint      not null default 0,  -- 实际起飞次数
    act_landings          smallint      not null default 0,  -- 实际落地次数
    ground                smallint      not null default 0,  -- 地面值勤时间（分钟）
    acting_rank           varchar(10),                       -- 代飞职级
    fleet                 varchar(4),                        -- 所飞机队
    per_diem              integer       not null default 0,  -- 日津贴（分钟，用于计算金额）
    normal_wp             integer       not null default 0,  -- 正常工作时间（分钟）
    extend_wp             integer       not null default 0,  -- 延伸工作时间（分钟）
    csb                   smallint      not null default 0,  -- 短程待命天数
    hsb                   smallint      not null default 0,  -- 本场待命天数
    asb                   smallint      not null default 0,  -- 机场待命天数
    is_al                 smallint      not null default 0,  -- 当日是否为年假：1=是
    updowns               integer       not null default 0,  -- 起落次数（高高原）
    cat2_updowns          integer       not null default 0,  -- CAT II 起落次数
    exp_blh               integer       not null default 0,  -- 经验飞行小时
    quarantine            smallint      not null default 0,  -- 隔离天数
    cust_data1            numeric(6,2),                      -- 自定义数据1（各航司自定义）
    cust_data2            numeric(6,2),                      -- 自定义数据2
    high_plateau          integer       not null default 0,  -- 高高原飞行时间（分钟）
    operating_fleets      varchar(100),                      -- 当日飞过的机队列表
    operating_airports    varchar(100),                      -- 当日飞过的机场列表
    takeoff               integer       not null default 0,  -- 起飞次数
    landing               integer       not null default 0,  -- 落地次数
    is_position           smallint      not null default 0,  -- 是否有接送机：1=是
    working_hour          numeric(8,2),                      -- 工作小时数
    pnc_credit            numeric(8,2),                      -- PNC 信用积分
    sim_credit            numeric(8,2),                      -- 模拟机信用积分
    al_credit             numeric(8,2),                      -- 年假信用积分
    ol_credit             numeric(8,2),                      -- 其他假期信用积分
    freighter_credit      numeric(8,2),                      -- 货机信用积分
    layover_day           integer,                           -- 过夜天数
    lh_per_diem           numeric(8,2),                      -- 长途津贴
    sby_dp                numeric(8,2)  not null default 0,  -- 待命执勤时间
    dhd_dp                numeric(8,2)  not null default 0,  -- 调机执勤时间
    fleet_takeoff         varchar(32),                       -- 各机队起飞次数（JSON格式）
    fleet_landing         varchar(32),                       -- 各机队落地次数
    night_takeoff         varchar(32),                       -- 夜间起飞次数
    night_landing         varchar(32),                       -- 夜间落地次数
    sch_credit            numeric(8,2),                      -- 计划信用积分
    sch_per_diem          numeric(8,2),                      -- 计划日津贴
    sch_lh_per_diem       numeric(8,2),                      -- 计划长途津贴
    sch_pnc_credit        numeric(8,2),                      -- 计划 PNC 积分
    sch_sim_credit        numeric(8,2),                      -- 计划模拟机积分
    sch_al_credit         numeric(8,2),                      -- 计划年假积分
    sch_ol_credit         numeric(8,2),                      -- 计划其他假期积分
    sch_freighter_credit  numeric(8,2),                      -- 计划货机积分
    attributes            varchar(100),                      -- 扩展属性（JSON格式）
    int_blh               integer,                           -- 国际航线飞行小时
    flt_num               integer,                           -- 当日航班架次
    cross_tz_duty_count   integer,                           -- 跨时区执勤次数
    layover_times         integer,                           -- 外站过夜次数
    layover_duration      integer                            -- 外站过夜总时长（分钟）
);
create unique index uq_manday_fd_daily on crew_manday_fd_daily (scenario_id, crew_id, crew_base_dt);
create index idx_manday_fd_daily_dt   on crew_manday_fd_daily (crew_base_dt);

comment on table  crew_manday_fd_daily           is '飞行员每日累计工时，近 N 个月（N 由 MANDAY_DAILY_KEEP_MONTHS 参数控制）';
comment on column crew_manday_fd_daily.blh       is 'Block Hour 飞行小时，单位分钟，从关舱门到开舱门的时间';
comment on column crew_manday_fd_daily.fdp       is 'Flight Duty Period，飞行执勤时间，法规校验核心字段';
comment on column crew_manday_fd_daily.cust_data1 is '各航司自定义统计字段1，具体含义由航司配置决定';

-- ------------------------------------------------------------
-- crew_manday_fd_period — 飞行员排班周期工时汇总
-- 由 daily 表按排班周期(roster_period)归档聚合而来，保留 M 年内的周期数据
-- ------------------------------------------------------------
create table crew_manday_fd_period (
    id                    bigint        generated always as identity primary key,
    created_by            varchar(30)   not null default 'system',
    created_at            timestamp   not null default now(),
    updated_by            varchar(30)   not null default 'system',
    updated_at            timestamp   not null default now(),
    scenario_id             bigint       not null check (scenario_id > 0),
    crew_id               varchar(30)   not null,  -- 机组工号
    roster_period         varchar(100)  not null,  -- 排班周期代码，对应 roster_period.roster_period，如 2026RP07
    rp_start              timestamptz   not null,  -- 排班周期开始（denormalized from roster_period）
    rp_end                timestamptz   not null,  -- 排班周期结束（denormalized from roster_period）
    ft                    integer       not null default 0,
    augument_ft           integer       not null default 0,
    double_ft             integer       not null default 0,
    blh                   integer       not null default 0,
    augument_blh          integer       not null default 0,
    double_blh            integer       not null default 0,
    fdp                   integer       not null default 0,
    dp                    integer       not null default 0,
    night_dp              integer       not null default 0,
    travel                integer       not null default 0,
    credit                numeric(8,2)  not null default 0,
    fatigue               integer       not null default 0,
    is_leave              integer       not null default 0,  -- 当月假期天数
    is_day_off            integer       not null default 0,  -- 当月休息日天数
    standby               integer       not null default 0,
    act_take_offs         integer       not null default 0,
    act_landings          integer       not null default 0,
    ground                integer       not null default 0,
    per_diem              integer       not null default 0,
    normal_wp             integer       not null default 0,
    extend_wp             integer       not null default 0,
    csb                   integer       not null default 0,
    hsb                   integer       not null default 0,
    asb                   integer       not null default 0,
    is_al                 integer       not null default 0,  -- 当月年假天数
    updowns               integer       not null default 0,
    cat2_updowns          integer       not null default 0,
    exp_blh               integer       not null default 0,
    quarantine            integer       not null default 0,
    high_plateau          integer       not null default 0,
    takeoff               integer       not null default 0,
    landing               integer       not null default 0,
    working_hour          numeric(10,2),
    pnc_credit            numeric(10,2),
    sim_credit            numeric(10,2),
    al_credit             numeric(10,2),
    ol_credit             numeric(10,2),
    freighter_credit      numeric(10,2),
    layover_day           integer,
    lh_per_diem           numeric(10,2),
    sby_dp                numeric(10,2) not null default 0,
    dhd_dp                numeric(10,2) not null default 0,
    sch_credit            numeric(10,2),
    int_blh               integer,
    flt_num               integer,
    cross_tz_duty_count   integer,
    layover_times         integer,
    layover_duration      integer,
    archived_from_daily   boolean       not null default true  -- 是否由 daily 归档而来
);
create unique index uq_manday_fd_period on crew_manday_fd_period (scenario_id, crew_id, roster_period);

comment on table  crew_manday_fd_period                  is '飞行员排班周期工时汇总，由 daily 表按 RP 归档聚合，保留约 2 年';
comment on column crew_manday_fd_period.roster_period    is '排班周期代码，对应 roster_period.roster_period，如 2026RP07';
comment on column crew_manday_fd_period.archived_from_daily is 'true=由 daily 归档任务自动生成，false=人工补录';

-- ------------------------------------------------------------
-- crew_manday_fd_yearly — 飞行员年度工时汇总
-- 由 monthly 表归档聚合而来，长期保留
-- ------------------------------------------------------------
create table crew_manday_fd_yearly (
    id                    bigint        generated always as identity primary key,
    created_by            varchar(30)   not null default 'system',
    created_at            timestamp   not null default now(),
    updated_by            varchar(30)   not null default 'system',
    updated_at            timestamp   not null default now(),
    scenario_id             bigint       not null check (scenario_id > 0),
    crew_id               varchar(30)   not null,  -- 机组工号
    year                  char(4)       not null,  -- 统计年份，格式 YYYY
    ft                    integer       not null default 0,
    augument_ft           integer       not null default 0,
    double_ft             integer       not null default 0,
    blh                   integer       not null default 0,
    augument_blh          integer       not null default 0,
    double_blh            integer       not null default 0,
    fdp                   integer       not null default 0,
    dp                    integer       not null default 0,
    night_dp              integer       not null default 0,
    travel                integer       not null default 0,
    credit                numeric(10,2) not null default 0,
    is_leave              integer       not null default 0,  -- 全年假期天数
    is_day_off            integer       not null default 0,  -- 全年休息日天数
    standby               integer       not null default 0,
    act_take_offs         integer       not null default 0,
    act_landings          integer       not null default 0,
    per_diem              integer       not null default 0,
    updowns               integer       not null default 0,
    cat2_updowns          integer       not null default 0,
    exp_blh               integer       not null default 0,
    high_plateau          integer       not null default 0,
    takeoff               integer       not null default 0,
    landing               integer       not null default 0,
    working_hour          numeric(12,2),
    pnc_credit            numeric(12,2),
    lh_per_diem           numeric(12,2),
    layover_day           integer,
    int_blh               integer,
    flt_num               integer,
    archived_from_monthly boolean       not null default true  -- 是否由 monthly 归档而来
);
create unique index uq_manday_fd_yearly on crew_manday_fd_yearly (scenario_id, crew_id, year);

comment on table  crew_manday_fd_yearly           is '飞行员年度工时汇总，由 monthly 归档聚合，长期保留';
comment on column crew_manday_fd_yearly.year      is '统计年份，固定格式 YYYY，如 2022';

-- ------------------------------------------------------------
-- crew_manday_cc_am_daily — 客舱/乘务员每日累计工时
-- ------------------------------------------------------------
create table crew_manday_cc_am_daily (
    id                   bigint        generated always as identity primary key,
    created_by           varchar(30)   not null default 'system',
    created_at           timestamp   not null default now(),
    updated_by           varchar(30)   not null default 'system',
    updated_at           timestamp   not null default now(),
    scenario_id             bigint       not null check (scenario_id > 0),
    crew_id              varchar(30)   not null,  -- 机组工号
    crew_base_dt         date          not null,  -- 统计日期
    ft                   integer       not null default 0,  -- 飞行时间（分钟）
    blh                  integer       not null default 0,  -- 飞行小时（分钟）
    fdp                  integer       not null default 0,  -- FDP（分钟）
    dp                   integer       not null default 0,  -- 执勤时间（分钟）
    cust_dp              integer       not null default 0,  -- 自定义执勤时间（分钟）
    night_dp             integer       not null default 0,  -- 夜间执勤时间（分钟）
    travel               integer       not null default 0,  -- 旅途时间（分钟）
    credit               numeric(6,2)  not null default 0,  -- 信用积分
    fatigue              integer       not null default 0,  -- 疲劳指数
    is_leave             smallint      not null default 0,  -- 当日是否有假期
    is_day_off           smallint      not null default 0,  -- 当日是否休息
    standby              smallint      not null default 0,  -- 待命时间（分钟）
    ground               smallint      not null default 0,  -- 地面值勤（分钟）
    per_diem             integer       not null default 0,  -- 日津贴
    normal_wp            integer       not null default 0,  -- 正常工作时间
    extend_wp            integer       not null default 0,  -- 延伸工作时间
    csb                  smallint      not null default 0,  -- 短程待命
    hsb                  smallint      not null default 0,  -- 本场待命
    asb                  smallint      not null default 0,  -- 机场待命
    is_al                smallint      not null default 0,  -- 是否年假
    quarantine           smallint      not null default 0,  -- 隔离天数
    cust_data1           numeric(6,2),                      -- 自定义数据1
    cust_data2           numeric(6,2),                      -- 自定义数据2
    high_plateau         integer       not null default 0,  -- 高高原时间
    operating_fleets     varchar(100),                      -- 当日飞过的机队
    operating_airports   varchar(100),                      -- 当日飞过的机场
    working_hour         integer       not null default 0,  -- 工作小时
    pnc_credit           numeric(8,2),                      -- PNC 积分
    sim_credit           numeric(8,2),                      -- 模拟机积分
    al_credit            numeric(8,2),                      -- 年假积分
    ol_credit            numeric(8,2),                      -- 其他假期积分
    freighter_credit     numeric(8,2),                      -- 货机积分
    layover_day          integer,                           -- 过夜天数
    lh_per_diem          numeric(8,2),                      -- 长途津贴
    sby_dp               numeric(5,2)  not null default 0,  -- 待命执勤时间
    dhd_dp               numeric(5,2)  not null default 0,  -- 调机执勤时间
    attributes           varchar(100),                      -- 扩展属性
    int_blh              integer,                           -- 国际飞行小时
    flt_num              integer,                           -- 航班架次
    cross_tz_duty_count  integer,                           -- 跨时区次数
    layover_times        integer,                           -- 外站过夜次数
    layover_duration     integer                            -- 外站过夜时长（分钟）
);
create unique index uq_manday_cc_daily on crew_manday_cc_am_daily (scenario_id, crew_id, crew_base_dt);
create index idx_manday_cc_daily_dt  on crew_manday_cc_am_daily (crew_base_dt);

comment on table  crew_manday_cc_am_daily        is '客舱乘务员每日累计工时，近 N 个月（N 由参数控制）';
comment on column crew_manday_cc_am_daily.cust_dp is '自定义执勤时间，各航司根据自身法规定义';

-- ------------------------------------------------------------
-- crew_manday_cc_am_period — 客舱排班周期工时汇总
-- ------------------------------------------------------------
create table crew_manday_cc_am_period (
    id                   bigint        generated always as identity primary key,
    created_by           varchar(30)   not null default 'system',
    created_at           timestamp   not null default now(),
    updated_by           varchar(30)   not null default 'system',
    updated_at           timestamp   not null default now(),
    scenario_id             bigint       not null check (scenario_id > 0),
    crew_id              varchar(30)   not null,  -- 机组工号
    roster_period        varchar(100)  not null,  -- 排班周期代码，对应 roster_period.roster_period，如 2026RP07
    rp_start             timestamptz   not null,  -- 排班周期开始（denormalized from roster_period）
    rp_end               timestamptz   not null,  -- 排班周期结束（denormalized from roster_period）
    ft                   integer       not null default 0,
    blh                  integer       not null default 0,
    fdp                  integer       not null default 0,
    dp                   integer       not null default 0,
    cust_dp              integer       not null default 0,
    night_dp             integer       not null default 0,
    travel               integer       not null default 0,
    credit               numeric(8,2)  not null default 0,
    is_leave             integer       not null default 0,
    is_day_off           integer       not null default 0,
    standby              integer       not null default 0,
    ground               integer       not null default 0,
    per_diem             integer       not null default 0,
    normal_wp            integer       not null default 0,
    extend_wp            integer       not null default 0,
    working_hour         integer       not null default 0,
    pnc_credit           numeric(10,2),
    lh_per_diem          numeric(10,2),
    layover_day          integer,
    int_blh              integer,
    flt_num              integer,
    cross_tz_duty_count  integer,
    archived_from_daily  boolean       not null default true
);
create unique index uq_manday_cc_am_period on crew_manday_cc_am_period (scenario_id, crew_id, roster_period);

comment on table crew_manday_cc_am_period is '客舱乘务员排班周期工时汇总，由 daily 按 RP 归档聚合';

-- ------------------------------------------------------------
-- crew_manday_cc_am_yearly — 客舱年度工时汇总
-- ------------------------------------------------------------
create table crew_manday_cc_am_yearly (
    id                    bigint        generated always as identity primary key,
    created_by            varchar(30)   not null default 'system',
    created_at            timestamp   not null default now(),
    updated_by            varchar(30)   not null default 'system',
    updated_at            timestamp   not null default now(),
    scenario_id             bigint       not null check (scenario_id > 0),
    crew_id               varchar(30)   not null,  -- 机组工号
    year                  char(4)       not null,  -- 统计年份，格式 YYYY
    ft                    integer       not null default 0,
    blh                   integer       not null default 0,
    fdp                   integer       not null default 0,
    dp                    integer       not null default 0,
    credit                numeric(10,2) not null default 0,
    is_leave              integer       not null default 0,
    is_day_off            integer       not null default 0,
    per_diem              integer       not null default 0,
    working_hour          integer       not null default 0,
    pnc_credit            numeric(12,2),
    lh_per_diem           numeric(12,2),
    layover_day           integer,
    int_blh               integer,
    flt_num               integer,
    archived_from_monthly boolean       not null default true
);
create unique index uq_manday_cc_yearly on crew_manday_cc_am_yearly (scenario_id, crew_id, year);

comment on table crew_manday_cc_am_yearly is '客舱乘务员年度工时汇总，由 monthly 归档聚合，长期保留';


-- end of scenario ddl
-- ============================================================
