-- ============================================================
-- 机组排班系统 — crew / roster / pairing / flight 数据定义
-- 版本：v4 最终设计版（含完整中文注释）
-- ============================================================
-- 使用说明：
--   set search_path to CA;   -- CA 替换为对应航司二字码
--   \i crew_roster_pg.sql
-- ============================================================
-- 核心设计说明
-- ─────────────────────────────────────────────────────────────
-- [1] pairing 完全单表化
--     废弃：pairing / pairing_duty / pairing_duty_node / pairing_duty_segment
--     新建：pairing_segment（完全独立宽表）
--     pairing_id 由后端序列生成，是业务分组标识，不是外键约束
--     每行 = 1个航班段，duty 信息以 duty_ 前缀字段冗余内嵌
--     首次+二次进退场（pickup/brief/debrief/dropoff + double_*），全部可空
--     单行自洽：任意一行损坏不影响其他行，系统始终可以打开
--     独立保留 pairing_composition 存环级编组需求（不冗余进 seg 行）
--
-- [2] roster 融合单表化
--     废弃：roster + roster_flight
--     新建：roster（融合宽表）
--     pairing_id > 0：飞行任务，flt_id/duty_seq 等字段有值
--     pairing_id = 0：地面任务，flt_id/duty_seq 为 null
--       地面任务时间范围用 sch_str_dt_utc / sch_end_dt_utc 表达
--       地面任务详情用 grd_assignment / grd_location / grd_remark
--
-- [3] manday 三级归档体系
--     daily 表：近 N 个月实时数据（按天，参数 MANDAY_DAILY_KEEP_MONTHS 默认 6）
--     monthly 表：前 N 月～前 M 年月度汇总（参数 MANDAY_MONTHLY_KEEP_YEARS 默认 2）
--     yearly 表：M 年以前年度汇总（参数 MANDAY_YEARLY_KEEP_YEARS 默认 10）
--     归档参数存于 system_parameter 表，各航司独立配置
--     归档执行记录存于 manday_archive_log
--
-- [4] 所有 live 表含 scenario_id 默认值为 0
--     scenario 数据存 .scenario.gz 文件，元数据在 scenario 表
--     roster_publish 保存发布排班，schedule_publish_record 保存发布事实与批次范围
-- ============================================================

-- ============================================================
--  crew 机组成员相关表
-- ============================================================

-- ------------------------------------------------------------
-- crew — 机组成员主表
-- 主键：id bigint 自增；crew_id varchar 为业务唯一工号
-- ------------------------------------------------------------
create table crew (
    id                    bigint       generated always as identity primary key,
    created_by            varchar(30)  not null default 'system',
    created_at            timestamptz  not null default now(),
    updated_by            varchar(30)  not null default 'system',
    updated_at            timestamptz  not null default now(),
    crew_id               varchar(30)  not null,   -- 机组工号（业务唯一键）
    first_name            varchar(100) not null,   -- 名
    middle_name           varchar(100),            -- 中间名
    last_name             varchar(100) not null,   -- 姓
    preferred_name        varchar(100),            -- 常用称呼
    birthday              timestamptz,             -- 出生日期
    gender                varchar(1)   not null check (gender in ('M','F','U')),  -- 性别：M=男 F=女 U=未知
    division              varchar(1)   not null check (division in ('P','C','A')), -- 机组类型：P=飞行员 C=客舱 A=空管
    empl_dt               timestamptz  not null,   -- 入职日期
    retire_dt             timestamptz,             -- 退休日期
    term_dt               timestamptz,             -- 离职日期
    seniority_num         numeric(10,2),           -- 资历序号（F8 seniorityNum 可达 5 位整数）
    nationality           varchar(2),              -- 国籍（ISO 2位）
    national_id           varchar(20),             -- 身份证号
    spouse_crew_id        varchar(12),             -- 配偶机组工号（用于排班回避）
    passport_first_name   varchar(100),            -- 护照名
    passport_middle_name  varchar(100),            -- 护照中间名
    passport_last_name    varchar(100),            -- 护照姓
    remarks               varchar(50),             -- 备注
    filiale               varchar(6)   not null,   -- 所属航司
    grade                 varchar(20),             -- 职级等级
    status                smallint     not null default 0, -- 状态：0=在职 1=停飞 2=离职
    branch_code           varchar(20),             -- 所属部门编码
    visa_type             varchar(40),             -- 签证类型
    birth_country         varchar(12),             -- 出生国
    birth_place           varchar(255),            -- 出生地（中文）
    birth_place_en        varchar(50),             -- 出生地（英文）
    nation                varchar(20),             -- 民族
    politics              varchar(10),             -- 政治面貌
    contract_type         varchar(40),             -- 合同类型
    avatar                varchar(100),            -- 头像文件路径
    tel                   varchar(100),            -- 联系电话
    id_card               varchar(100),            -- 身份证号（冗余，兼容老系统）
    interface_crew_id     varchar(40),             -- 外部接口系统机组 id
    employee_no           varchar(20),             -- 员工编号（HR 系统）
    email_addr            varchar(100),            -- 电子邮箱
    interface_id          varchar(40),             -- 其他接口标识
    home_address          varchar(500)             -- 家庭住址
);
create unique index uq_crew_id on crew (crew_id);

comment on table  crew                  is '机组成员主表，存储飞行员/客舱/空管的基本信息';
comment on column crew.crew_id          is '机组工号，业务唯一键，由人事系统分配';
comment on column crew.division         is '机组类型：P=飞行员 C=客舱乘务员 A=空中安全员';
comment on column crew.status           is '在职状态：0=在职 1=临时停飞 2=离职';
comment on column crew.spouse_crew_id   is '配偶机组工号，排班时可设置回避同一航班';
comment on column crew.interface_crew_id is '外部 HR/排班接口系统的机组标识，用于数据同步';

-- ------------------------------------------------------------
-- crew_base — 机组基地历史
-- 记录机组在不同时期的驻地基地（支持多基地，is_prime_base 标记主基地）
-- ------------------------------------------------------------
create table crew_base (
    id                       bigint       generated always as identity primary key,
    created_by               varchar(30)  not null default 'system',
    created_at               timestamptz  not null default now(),
    updated_by               varchar(30)  not null default 'system',
    updated_at               timestamptz  not null default now(),
    crew_id                  varchar(30)  not null,  -- 机组工号
    base                     varchar(3)   not null,  -- 基地机场代码（IATA 3位）
    eff_dt                   timestamptz  not null,  -- 生效日期
    exp_dt                   timestamptz,            -- 失效日期，null 表示当前有效
    is_prime_base            smallint     not null default 1, -- 是否主基地：1=是 0=否
    interface_base_id        varchar(40),            -- 外部接口基地 id
    interface_crew_base_id   varchar(40),            -- 外部接口机组基地记录 id
    eff_dt_utc               timestamptz,            -- 生效日期（UTC）
    exp_dt_utc               timestamptz             -- 失效日期（UTC）
);
create index idx_crew_base_crew_id on crew_base (crew_id);

comment on table  crew_base               is '机组基地历史，记录每段时期的驻地基地';
comment on column crew_base.is_prime_base is '主基地标记：1=主基地 0=辅助基地，用于法规计算';

-- ------------------------------------------------------------
-- crew_certificate — 机组证件（护照、身份证、飞行执照等）
-- ------------------------------------------------------------
create table crew_certificate (
    id                       bigint       generated always as identity primary key,
    created_by               varchar(30)  not null default 'system',
    created_at               timestamptz  not null default now(),
    updated_by               varchar(30)  not null default 'system',
    updated_at               timestamptz  not null default now(),
    crew_id                  varchar(30)  not null,  -- 机组工号
    certificate              varchar(20)  not null,  -- 证件类型代码
    certificate_no           varchar(100),           -- 证件号码
    eff_dt                   timestamptz  not null,  -- 签发/生效日期
    invalid_dt               timestamptz,            -- 作废日期
    exp_dt                   timestamptz,            -- 有效期截止日期
    tmp_issue_country        varchar(100),           -- 签发国
    tmp_issue_authority      varchar(100),           -- 签发机构
    reference_no             varchar(100),           -- 参考号
    reference_id             bigint,                 -- 关联记录 id
    is_valid                 smallint     not null default 0, -- 是否有效：1=有效 0=无效
    remarks                  varchar(70),            -- 备注
    interface_crew_cert_id   varchar(20),            -- 外部接口证件 id
    interface_cert_id        varchar(40),            -- 外部接口证件类型 id
    first_name               varchar(50),            -- 证件上的名（与 crew 主表可能不同）
    middle_name              varchar(50),            -- 证件上的中间名
    last_name                varchar(50),            -- 证件上的姓
    is_primary               smallint,               -- 是否主证件：1=是
    nationality              varchar(20),            -- 证件国籍
    surname                  varchar(40),            -- 姓（拼音）
    title_name               varchar(40),            -- 头衔称谓
    given_name               varchar(40)             -- 名（拼音）
);
create index idx_crew_cert_crew_id on crew_certificate (crew_id);

comment on table  crew_certificate            is '机组证件信息，包含护照、身份证、飞行执照等';
comment on column crew_certificate.is_valid   is '当前是否有效：1=有效 0=已过期或已作废';
comment on column crew_certificate.first_name is '证件上的名字，可能与机组主表名字格式不同';

-- ------------------------------------------------------------
-- crew_entitlement — 机组权益余额（年假、病假等假期配额）
-- ------------------------------------------------------------
create table crew_entitlement (
    id                bigint         generated always as identity primary key,
    created_by        varchar(30)    not null default 'system',
    created_at        timestamptz    not null default now(),
    updated_by        varchar(30)    not null default 'system',
    updated_at        timestamptz    not null default now(),
    filiale           varchar(6),                -- 所属航司
    crew_id           varchar(30)    not null,   -- 机组工号
    entitlement_type  varchar(10)    not null,   -- 权益类型（如 AL=年假 SL=病假）
    entitlement_year  varchar(4),                -- 权益年度
    entitlement       numeric(10,2),             -- 总配额（天或小时）
    used              numeric(10,2),             -- 已使用量
    eff_dt            timestamptz,               -- 生效日期
    exp_dt            timestamptz,               -- 失效日期
    carry_over        numeric(6,4),              -- 结转量（上期未用完部分）
    carry_over_dt     timestamptz,               -- 结转日期
    crew_team         varchar(50),               -- 记录时所在团队（快照）
    crew_base         varchar(50),               -- 记录时所在基地（快照）
    crew_rank         varchar(50),               -- 记录时职级（快照）
    crew_fleet        varchar(50),               -- 记录时所在机队（快照）
    balance           numeric(5,2),              -- 当前余额
    freezed            integer,                   -- 冻结量（已申请未批准）
    unfrozen          numeric(5,2),              -- 解冻量
    group_id          bigint,                    -- 分组 id（批量操作用）
    operator          varchar(30),               -- 操作人
    request_code      varchar(50),               -- 申请单号
    request_name      varchar(50),               -- 申请名称
    request_type      varchar(50),               -- 申请类型
    seq_order         numeric                    -- 排序序号
);
create index idx_crew_entitlement on crew_entitlement (crew_id, entitlement_type);

comment on table  crew_entitlement                 is '机组权益余额，管理年假/病假/培训假等配额';
comment on column crew_entitlement.entitlement_type is '权益类型：AL=年假 SL=病假 TL=培训假';
comment on column crew_entitlement.carry_over       is '上期未用完结转到本期的数量';
comment on column crew_entitlement.freezed           is '冻结中的数量，已申请但尚未最终批准';

-- ------------------------------------------------------------
-- crew_fleet — 机组机队资质历史
-- ------------------------------------------------------------
create table crew_fleet (
    id                        bigint       generated always as identity primary key,
    created_by                varchar(30)  not null default 'system',
    created_at                timestamptz  not null default now(),
    updated_by                varchar(30)  not null default 'system',
    updated_at                timestamptz  not null default now(),
    crew_id                   varchar(30)  not null,  -- 机组工号
    fleet_specific            varchar(20)  not null,  -- 机队代码
    eff_dt                    timestamptz  not null,  -- 生效日期
    exp_dt                    timestamptz,            -- 失效日期
    ac_type                   varchar(10),            -- 机型代码
    fleet_grp                 varchar(20),            -- 机队分组
    interface_fleet_id        varchar(40),            -- 外部接口机队 id
    interface_crew_fleet_id   varchar(40)             -- 外部接口机组机队记录 id
);
create index idx_crew_fleet_crew_id on crew_fleet (crew_id);

comment on table  crew_fleet               is '机组机队资质历史，记录各时期可飞机队';
comment on column crew_fleet.fleet_specific is '具体机队代码，对应 fleet 表的 fleet_specific 字段';

-- ------------------------------------------------------------
-- crew_kpi_adjust — 机组 KPI 手动调整记录
-- 用于对机组工时/积分进行人工修正
-- ------------------------------------------------------------
create table crew_kpi_adjust (
    id                bigint       generated always as identity primary key,
    created_by        varchar(30)  not null default 'system',
    created_at        timestamptz  not null default now(),
    updated_by        varchar(30)  not null default 'system',
    updated_at        timestamptz  not null default now(),
    crew_id           varchar(30)  not null,  -- 机组工号
    roster_flight_id  bigint,                 -- 关联排班航班 id（可选）
    flt_id            bigint,                 -- 关联航班 id（可选）
    type              smallint     not null,  -- 调整类型
    adjust_date       timestamptz,            -- 调整所属日期
    adjustment        integer      not null,  -- 调整量（正数增加，负数减少，单位分钟）
    comments          varchar(255)            -- 调整原因说明
);

comment on table  crew_kpi_adjust            is '机组 KPI 手动调整记录，用于工时积分人工修正';
comment on column crew_kpi_adjust.adjustment is '调整数量，正数为增加，负数为减少，单位分钟';

-- ------------------------------------------------------------
-- crew_language — 机组语言能力记录
-- ------------------------------------------------------------
create table crew_language (
    id               bigint       generated always as identity primary key,
    created_by       varchar(30)  not null default 'system',
    created_at       timestamptz  not null default now(),
    updated_by       varchar(30)  not null default 'system',
    updated_at       timestamptz  not null default now(),
    crew_id          varchar(30)  not null,  -- 机组工号
    crew_license_id  bigint,                 -- 关联执照 id（语言与执照挂钩时使用）
    language         varchar(20)  not null,  -- 语言代码
    eff_dt           timestamptz  not null,  -- 认定/考核通过日期
    renewed_dt       timestamptz,            -- 最近更新日期
    exp_dt           timestamptz,            -- 有效期截止日期
    language_level   varchar(10),            -- 语言等级（如 ICAO 4/5/6级）
    is_valid         smallint     not null default 0, -- 是否当前有效：1=有效 0=已过期
    remarks          varchar(70)             -- 备注
);

comment on table  crew_language              is '机组语言能力记录，用于国际航线派遣资质校验';
comment on column crew_language.language_level is '语言等级，如 ICAO 英语等级 4/5/6';

-- ------------------------------------------------------------
-- crew_license — 机组飞行执照
-- ------------------------------------------------------------
create table crew_license (
    id                      bigint       generated always as identity primary key,
    created_by              varchar(30)  not null default 'system',
    created_at              timestamptz  not null default now(),
    updated_by              varchar(30)  not null default 'system',
    updated_at              timestamptz  not null default now(),
    crew_id                 varchar(30)  not null,  -- 机组工号
    certificate             varchar(20)  not null,  -- 执照证件类型代码
    license_type            varchar(20)  not null,  -- 执照类别（如 ATPL/CPL/MPL）
    license_no              varchar(20),            -- 执照编号
    eff_dt                  timestamptz  not null,  -- 签发/生效日期
    renewed_dt              timestamptz,            -- 最近复训/更新日期
    exp_dt                  timestamptz,            -- 有效期截止日期
    ac_types                varchar(30),            -- 签注机型列表（逗号分隔）
    ref_language_id         bigint,                 -- 关联语言记录 id
    ref_instructor_id       bigint,                 -- 关联教员记录 id
    is_valid                smallint     not null default 1, -- 是否有效：1=有效 0=无效
    remarks                 varchar(70),            -- 备注
    interface_crew_lic_id   varchar(20)             -- 外部接口执照 id
);

comment on table  crew_license          is '机组飞行执照，包含 ATPL/CPL/MPL 等各类执照';
comment on column crew_license.ac_types is '签注的机型代码，逗号分隔多个，如 B738,A320';

-- ------------------------------------------------------------
-- crew_lic_instructor — 执照教员资质记录
-- ------------------------------------------------------------
create table crew_lic_instructor (
    id               bigint       generated always as identity primary key,
    created_by       varchar(30)  not null default 'system',
    created_at       timestamptz  not null default now(),
    updated_by       varchar(30)  not null default 'system',
    updated_at       timestamptz  not null default now(),
    crew_id          varchar(30)  not null,  -- 机组工号
    ac_type          varchar(30)  not null,  -- 授权机型
    crew_license_id  bigint       not null,  -- 关联执照 id
    instructor       varchar(30),            -- 教员工号（授课教员）
    eff_dt           timestamptz  not null,  -- 生效日期
    renewed_dt       timestamptz,            -- 最近更新日期
    exp_dt           timestamptz             -- 有效期截止日期
);

comment on table  crew_lic_instructor is '执照教员资质，记录机组担任某机型教员的有效期';

-- ------------------------------------------------------------
-- crew_memo — 机组备注/便签
-- 排班人员在 Gantt 界面为机组添加的临时备注，支持与 roster 关联
-- ------------------------------------------------------------
create table crew_memo (
    id          bigint       generated always as identity primary key,
    created_by  varchar(30)  not null default 'system',
    created_at  timestamptz  not null default now(),
    updated_by  varchar(30)  not null default 'system',
    updated_at  timestamptz  not null default now(),
    crew_id     varchar(30)  not null,  -- 机组工号
    str_dt_loc  timestamptz,            -- 备注关联的开始时间（本地时）
    end_dt_loc  timestamptz,            -- 备注关联的结束时间（本地时）
    memo        varchar(300),           -- 备注内容
    user_id     varchar(30)  not null default 'system', -- 创建备注的用户
    tmst        timestamptz  not null default now(),    -- 创建时间戳
    status      varchar(10)  not null default 'Y',      -- 状态：Y=有效 N=已删除
    roster_id   bigint,                 -- 关联排班记录 id（可选）
    type        smallint,               -- 备注类型：1=普通备注 2=预警备注
    name        varchar(255),           -- 备注标题
    pbs_status  varchar(20)             -- PBS 申请状态关联标识
);

comment on table  crew_memo          is 'Gantt 界面机组备注，可关联具体排班记录';
comment on column crew_memo.type     is '备注类型：1=普通备注 2=预警提示 3=系统自动生成';
comment on column crew_memo.pbs_status is 'PBS 相关状态，如 PENDING/APPROVED/REJECTED';

-- ------------------------------------------------------------
-- crew_profile — 机组关联权限档案
-- ------------------------------------------------------------
create table crew_profile (
    id          bigint       generated always as identity primary key,
    created_by  varchar(30)  not null default 'system',
    created_at  timestamptz  not null default now(),
    updated_by  varchar(30)  not null default 'system',
    updated_at  timestamptz  not null default now(),
    crew_id     varchar(30)  not null,  -- 机组工号
    profile     varchar(100) not null,  -- 权限档案名称
    type        varchar(40)  not null,  -- 档案类型
    eff_dt      timestamptz,            -- 生效日期
    exp_dt      timestamptz             -- 失效日期
);
create unique index uq_crew_profile on crew_profile (crew_id, profile, type);

comment on table  crew_profile is '机组关联的权限档案，控制机组可访问的功能范围';

-- ------------------------------------------------------------
-- crew_qualification — 机组资质记录
-- ------------------------------------------------------------
create table crew_qualification (
    id                           bigint       generated always as identity primary key,
    created_by                   varchar(30)  not null default 'system',
    created_at                   timestamptz  not null default now(),
    updated_by                   varchar(30)  not null default 'system',
    updated_at                   timestamptz  not null default now(),
    crew_id                      varchar(30)  not null,  -- 机组工号
    qualification                varchar(20)  not null,  -- 资质代码
    eff_dt                       timestamptz  not null,  -- 取得/生效日期
    renewed_dt                   timestamptz,            -- 最近复训/更新日期
    exp_dt                       timestamptz,            -- 有效期截止日期
    fleet_specific               varchar(20),            -- 适用机队
    ac_type                      varchar(10),            -- 适用机型
    rank                         varchar(10),            -- 适用职级
    position                     varchar(20),            -- 适用席位
    is_valid                     smallint     not null default 0, -- 是否当前有效：1=有效
    remarks                      varchar(255),           -- 备注
    interface_crew_qual_id       varchar(40),            -- 外部接口资质记录 id
    airport                      varchar(20),            -- 关联机场（部分资质与机场绑定）
    interface_qualification_id   varchar(40),            -- 外部接口资质类型 id
    remark_details               varchar(255),           -- 详细备注
    bases                        varchar(200),           -- 适用基地范围
    ranks                        varchar(200),           -- 适用职级范围
    fleets                       varchar(200),           -- 适用机队范围
    teams                        varchar(200),           -- 适用团队范围
    next_planned_date            timestamptz,            -- 下次计划培训日期
    display_flag                 smallint     not null default 1, -- 是否在 Gantt 头部栏显示
    status                       varchar(16),            -- 记录状态
    interface_crew_recurrent_id  varchar(50),            -- 外部复训记录 id
    project_date                 timestamptz,            -- 预计取得日期
    record_status                varchar(20),            -- 数据状态（如 ACTIVE/ARCHIVED）
    base_month                   timestamptz             -- 基准月份（用于到期计算）
);
create index idx_crew_qual_crew_id on crew_qualification (crew_id);

comment on table  crew_qualification              is '机组资质记录，法规引擎的核心依赖数据';
comment on column crew_qualification.is_valid     is '当前是否有效：1=有效 0=已过期，法规校验使用此字段';
comment on column crew_qualification.display_flag is '是否在 Gantt 界面头部信息栏显示该资质';

-- ------------------------------------------------------------
-- crew_rank — 机组职级历史
-- ------------------------------------------------------------
create table crew_rank (
    id                       bigint       generated always as identity primary key,
    created_by               varchar(30)  not null default 'system',
    created_at               timestamptz  not null default now(),
    updated_by               varchar(30)  not null default 'system',
    updated_at               timestamptz  not null default now(),
    crew_id                  varchar(30)  not null,  -- 机组工号
    rank                     varchar(10)  not null,  -- 职级代码（如 CA/FO/PU）
    eff_dt                   timestamptz  not null,  -- 晋升/调整生效日期
    exp_dt                   timestamptz,            -- 失效日期
    probation_end_dt         timestamptz,            -- 试用期截止日期
    position                 varchar(20)  not null default '1', -- 席位代码
    pre_cumulated_exp_days   numeric      not null default 0,   -- 入职前累计经历天数
    fleet_grp                varchar(20),            -- 所在机队分组
    ac_type                  varchar(10),            -- 所飞机型
    interface_crew_rank_id   varchar(40),            -- 外部接口职级记录 id
    division                 varchar(1),             -- 机组类型
    interface_rank_id        varchar(40)             -- 外部接口职级类型 id
);
create unique index uq_crew_rank on crew_rank (crew_id, ac_type, rank, position, eff_dt);

comment on table  crew_rank                      is '机组职级历史，记录每次职级变化';
comment on column crew_rank.pre_cumulated_exp_days is '入职前在其他单位积累的经历天数，用于资历计算';

-- ------------------------------------------------------------
-- crew_seniority — 机组资历积分
-- ------------------------------------------------------------
create table crew_seniority (
    id           bigint        generated always as identity primary key,
    created_by   varchar(30)   not null default 'system',
    created_at   timestamptz   not null default now(),
    updated_by   varchar(30)   not null default 'system',
    updated_at   timestamptz   not null default now(),
    crew_id      varchar(30)   not null,  -- 机组工号
    service_day  integer       not null,  -- 服务天数（入职第 N 天）
    seniority    numeric(5,2)  not null   -- 对应的资历分值
);

comment on table  crew_seniority is '机组资历积分对照表，用于 PBS 申请优先级排序';

-- ------------------------------------------------------------
-- crew_status — 机组状态历史（停飞/休假/停职等）
-- ------------------------------------------------------------
create table crew_status (
    id           bigint       generated always as identity primary key,
    created_by   varchar(30)  not null default 'system',
    created_at   timestamptz  not null default now(),
    updated_by   varchar(30)  not null default 'system',
    updated_at   timestamptz  not null default now(),
    crew_id      varchar(30)  not null,  -- 机组工号
    status       varchar(5),             -- 状态代码（如 SB=待命 GL=地面留置）
    eff_dt       timestamptz  not null,  -- 状态生效日期
    exp_dt       timestamptz,            -- 状态结束日期，null 表示持续有效
    reason       varchar(100),           -- 状态变更原因
    description  varchar(100),           -- 详细描述
    disable      smallint     not null default 0 -- 是否禁用此记录：1=禁用 0=正常
);
create index idx_crew_status_crew_exp on crew_status (crew_id, exp_dt);

comment on table  crew_status         is '机组状态历史，记录停飞/休假/停职等特殊状态';
comment on column crew_status.exp_dt  is '状态结束日期，null 表示该状态持续有效至今';
comment on column crew_status.disable is '软删除标记：1=此条记录被禁用 0=正常有效';

-- ------------------------------------------------------------
-- crew_team — 机组所属小组历史
-- ------------------------------------------------------------
create table crew_team (
    id            bigint       generated always as identity primary key,
    created_by    varchar(30)  not null default 'system',
    created_at    timestamptz  not null default now(),
    updated_by    varchar(30)  not null default 'system',
    updated_at    timestamptz  not null default now(),
    crew_id       varchar(30)  not null,  -- 机组工号
    team          varchar(50)  not null,  -- 上游团队代码（不通过 team.id 关联）
    eff_dt        timestamptz  not null,  -- 加入日期
    exp_dt        timestamptz,            -- 离开日期
    is_valid      smallint     not null default 1, -- 是否当前有效：1=是
    remarks       varchar(512),           -- 备注
    source        varchar(10),            -- 数据来源（manual=手动 interface=接口）
    team_task_id  numeric                 -- 关联团队任务 id（批量调组用）
);
create index idx_crew_team_crew_id on crew_team (crew_id);

comment on table  crew_team is '机组所属小组历史，用于团队排班和统计';

-- ============================================================
-- section 3: manday 三级归档体系
-- ============================================================
-- 归档参数（在 system_parameter 表配置，参数 key 如下）：
--   MANDAY_DAILY_KEEP_MONTHS   daily 表保留月数，默认 6
--   MANDAY_MONTHLY_KEEP_YEARS  monthly 表保留年数，默认 2
--   MANDAY_YEARLY_KEEP_YEARS   yearly 表保留年数，默认 10
-- 归档任务：每月执行一次，由调度服务触发，结果记录在 manday_archive_log
-- ============================================================

-- ------------------------------------------------------------
-- crew_manday_fd_daily — 飞行员每日累计工时（近 N 个月）
-- 按天存储，每条记录代表某机组某天的累计工时汇总
-- ------------------------------------------------------------
create table crew_manday_fd_daily (
    id                    bigint        generated always as identity primary key,
    created_by            varchar(30)   not null default 'system',
    created_at            timestamptz   not null default now(),
    updated_by            varchar(30)   not null default 'system',
    updated_at            timestamptz   not null default now(),
    scenario_id             bigint       not null default 0,
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
create unique index uq_manday_fd_daily on crew_manday_fd_daily (crew_id, crew_base_dt);
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
    created_at            timestamptz   not null default now(),
    updated_by            varchar(30)   not null default 'system',
    updated_at            timestamptz   not null default now(),
    scenario_id             bigint       not null default 0,
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
create unique index uq_manday_fd_period on crew_manday_fd_period (crew_id, roster_period);

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
    created_at            timestamptz   not null default now(),
    updated_by            varchar(30)   not null default 'system',
    updated_at            timestamptz   not null default now(),
    scenario_id             bigint       not null default 0,
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
create unique index uq_manday_fd_yearly on crew_manday_fd_yearly (crew_id, year);

comment on table  crew_manday_fd_yearly           is '飞行员年度工时汇总，由 monthly 归档聚合，长期保留';
comment on column crew_manday_fd_yearly.year      is '统计年份，固定格式 YYYY，如 2022';

-- ------------------------------------------------------------
-- crew_manday_cc_am_daily — 客舱/乘务员每日累计工时
-- ------------------------------------------------------------
create table crew_manday_cc_am_daily (
    id                   bigint        generated always as identity primary key,
    created_by           varchar(30)   not null default 'system',
    created_at           timestamptz   not null default now(),
    updated_by           varchar(30)   not null default 'system',
    updated_at           timestamptz   not null default now(),
    scenario_id             bigint       not null default 0,
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
create unique index uq_manday_cc_daily on crew_manday_cc_am_daily (crew_id, crew_base_dt);
create index idx_manday_cc_daily_dt  on crew_manday_cc_am_daily (crew_base_dt);

comment on table  crew_manday_cc_am_daily        is '客舱乘务员每日累计工时，近 N 个月（N 由参数控制）';
comment on column crew_manday_cc_am_daily.cust_dp is '自定义执勤时间，各航司根据自身法规定义';

-- ------------------------------------------------------------
-- crew_manday_cc_am_period — 客舱排班周期工时汇总
-- ------------------------------------------------------------
create table crew_manday_cc_am_period (
    id                   bigint        generated always as identity primary key,
    created_by           varchar(30)   not null default 'system',
    created_at           timestamptz   not null default now(),
    updated_by           varchar(30)   not null default 'system',
    updated_at           timestamptz   not null default now(),
    scenario_id             bigint       not null default 0,
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
create unique index uq_manday_cc_am_period on crew_manday_cc_am_period (crew_id, roster_period);

comment on table crew_manday_cc_am_period is '客舱乘务员排班周期工时汇总，由 daily 按 RP 归档聚合';

-- ------------------------------------------------------------
-- crew_manday_cc_am_yearly — 客舱年度工时汇总
-- ------------------------------------------------------------
create table crew_manday_cc_am_yearly (
    id                    bigint        generated always as identity primary key,
    created_by            varchar(30)   not null default 'system',
    created_at            timestamptz   not null default now(),
    updated_by            varchar(30)   not null default 'system',
    updated_at            timestamptz   not null default now(),
    scenario_id             bigint       not null default 0,
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
create unique index uq_manday_cc_yearly on crew_manday_cc_am_yearly (crew_id, year);

comment on table crew_manday_cc_am_yearly is '客舱乘务员年度工时汇总，由 monthly 归档聚合，长期保留';


-- ------------------------------------------------------------
-- manday_archive_log — 工时归档任务执行日志
-- ------------------------------------------------------------
create table manday_archive_log (
    id             bigint       generated always as identity primary key,
    created_by     varchar(30)  not null default 'system',
    created_at     timestamptz  not null default now(),
    updated_by     varchar(30)  not null default 'system',
    updated_at     timestamptz  not null default now(),
    table_type     varchar(10)  not null,  -- 归档来源表类型：fd=飞行员 cc_am=客舱
    archive_type   varchar(10)  not null,  -- 归档类型：monthly=日转月 yearly=月转年
    period_start   date         not null,  -- 本次归档数据的起始日期
    period_end     date         not null,  -- 本次归档数据的截止日期
    rows_archived  integer      not null default 0,  -- 归档写入行数
    rows_deleted   integer      not null default 0,  -- 原表删除行数
    status         varchar(20)  not null default 'success', -- 执行状态：success/failed/partial
    error_message  varchar(500),           -- 错误信息（status=failed 时记录）
    executed_at    timestamptz  not null default now()       -- 实际执行时间
);

comment on table  manday_archive_log              is '工时数据归档任务执行日志，用于监控和问题排查';
comment on column manday_archive_log.table_type   is '来源表类型：fd=飞行员 cc_am=客舱乘务员';
comment on column manday_archive_log.archive_type is '归档类型：monthly=daily转月度 yearly=monthly转年度';
comment on column manday_archive_log.status       is '执行状态：success=成功 failed=失败 partial=部分成功';

-- ============================================================
-- section 4: 航班表
-- ============================================================

-- ------------------------------------------------------------
-- flight — 航班主表（live 实时数据）
-- 原 Oracle 触发器 TR_FLIGHT_EXPORT_VER 不迁移，改用应用层变更事件
-- ------------------------------------------------------------
create table flight (
    id                        bigint        generated always as identity primary key,
    created_by                varchar(30)   not null default 'system',
    created_at                timestamptz   not null default now(),
    updated_by                varchar(30)   not null default 'system',
    updated_at                timestamptz   not null default now(),
    scenario_id             bigint       not null default 0,
    airline                   varchar(3)    not null,  -- 航空公司代码（IATA 2位或ICAO 3位）
    flt_dt                    date          not null,  -- 航班日期（本地日期）
    flt_num                   varchar(50)   not null,  -- 航班号
    dep_arp                   varchar(3)    not null,  -- 出发机场（IATA 3位）
    arv_arp                   varchar(3)    not null,  -- 到达机场
    sch_dep_dt_utc            timestamptz   not null,  -- 计划起飞时间（UTC）
    sch_arv_dt_utc            timestamptz   not null,  -- 计划落地时间（UTC）
    act_dep_dt_utc            timestamptz   not null,  -- 实际起飞时间（UTC）
    act_arv_dt_utc            timestamptz   not null,  -- 实际落地时间（UTC）
    est_dep_dt_utc            timestamptz,             -- 预计起飞时间（UTC，滚动更新）
    est_arv_dt_utc            timestamptz,             -- 预计落地时间（UTC）
    act_taxi_in_utc           timestamptz,             -- 实际滑入时间（UTC）
    act_taxi_out_utc          timestamptz,             -- 实际滑出时间（UTC）
    act_take_off_utc          timestamptz,             -- 实际离地时间（UTC）
    act_touch_down_utc        timestamptz,             -- 实际接地时间（UTC）
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
    voyage_status             smallint      not null default 0, -- 航程状态：0=正常 1=取消 2=备降
    is_locked                 smallint      not null default 0, -- 是否锁定（锁定后不可修改机组）
    sch_id                    bigint        not null default 0, -- 关联计划排班 id
    vr_add                    numeric       not null default 0, -- VR 附加值
    live_id                   bigint,                  -- 对应 live 系统内部 id
    etd_chg_tm                timestamptz,             -- 最后一次 ETD 变更时间
    interface_flt_id          varchar(40),             -- 外部接口航班 id（运控系统）
    apis_stage                smallint,                -- APIS（旅客预报）阶段
    price                     numeric(10,2),           -- 票价（用于成本分析）
    service_type              varchar(5),              -- 服务类型
    flt_last_delay_etd_utc    timestamptz,             -- 最新延误预计起飞时间（UTC）
    flt_delay_notify_utc      timestamptz,             -- 延误通知发出时间（UTC）
    device_code               varchar(50),             -- 设备编码
    flight_key                varchar(30),             -- 航班唯一业务键（航班号+日期+出发机场）
    flt_dt_utc                date,                    -- 航班日期（UTC）
    suffix                    varchar(20),             -- 航班后缀（用于区分同日同号航班）
    pay_fly_hours             smallint,                -- 付薪飞行小时
    act_door_closed_utc       timestamptz,             -- 舱门关闭时间（UTC）
    act_door_open_utc         timestamptz,             -- 舱门开启时间（UTC）
    course_code               varchar(30),             -- 培训课程代码（训练航班使用）
    remark                    varchar(512),            -- 备注
    sub_fleet                 varchar(64),             -- 子机队
    origin_flt_dt_utc         date,                    -- 原始航班日期（改期前）
    origin_interface_flt_id   varchar(40),             -- 原始接口航班 id（改期前）
    is_deleted                smallint      not null default 0, -- 软删除标记：1=已删除
    manual_comp_flag          smallint      not null default 0, -- 是否手动配置编组：1=是
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
create table flight_composition (
    id           bigint       generated always as identity primary key,
    created_by   varchar(30)  not null default 'system',
    created_at   timestamptz  not null default now(),
    updated_by   varchar(30)  not null default 'system',
    updated_at   timestamptz  not null default now(),
    scenario_id             bigint       not null default 0,
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
create table pairing_composition (
    id           bigint       generated always as identity primary key,
    created_by   varchar(30)  not null default 'system',
    created_at   timestamptz  not null default now(),
    updated_by   varchar(30)  not null default 'system',
    updated_at   timestamptz  not null default now(),
    scenario_id             bigint       not null default 0,
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
create table pairing (
    id                           bigint        generated always as identity primary key,
    created_by                   varchar(30)   not null default 'system',  -- 创建人
    created_at                   timestamptz   not null default now(),  -- 创建时间（UTC）
    updated_by                   varchar(30)   not null default 'system',  -- 最后修改人
    updated_at                   timestamptz   not null default now(),  -- 最后修改时间（UTC）
    scenario_id             bigint       not null default 0,
    pairing_label                varchar(200),  -- 环标签/名称（如 T450 / E4154）
    filiale                      varchar(6),  -- 所属航司二字码
    division                     varchar(2)   not null,  -- 机组类型（P=飞行员 C=客舱 A=空管）
    base                         varchar(3)   not null,  -- 环所属基地机场三字码
    fleet                        varchar(10)  not null,  -- 执飞机队代码
    assignment_group             varchar(20)  not null,  -- 任务分组代码
    assignment                   varchar(20)  not null,  -- 任务类型代码
    sch_str_dt_utc       timestamptz  not null,  -- 计划开始时间（UTC，第一个PickUp开始时间）
    sch_end_dt_utc       timestamptz  not null,  -- 计划结束时间（UTC，最后一个DropOff结束时间）
    act_str_dt_utc       timestamptz  not null,  -- 实际开始时间（UTC）
    act_end_dt_utc       timestamptz  not null,  -- 实际结束时间（UTC）
    duration_days                smallint     not null,  -- 环跨越的自然天数
    pbs_calendar_days            smallint,  -- PBS 口径：Base 当地时区 Brief 至 Debrief 覆盖的日历日数
    tafb                         smallint     not null,  -- PBS 日历日 TAFB（单位天，最小值 1）
    duty_count                   smallint     not null default 1,  -- 环内 duty 总数
    seg_count                    smallint     not null default 1,  -- 环内航班段总数
    per_diem_mins                numeric(10,2),  -- 津贴时长（分钟）
    per_diem_mins_adjustment     numeric(10,2),  -- 津贴调整量
    wp_mins                      numeric(10,2),  -- 实际工作时间（分钟）
    wp_mins_adjustment           numeric(10,2),  -- 工作时间调整量
    sch_per_diem_mins            numeric(8,2),  -- 计划津贴时长
    sch_lh_per_diem_mins         numeric(8,2),  -- 计划长途津贴
    sch_wp_mins                  numeric(8,2),  -- 计划工作时间
    lh_per_diem_mins             numeric(8,2),  -- 长途津贴时长
    fm_per_diem_mins             numeric(8,2),  -- 货机津贴时长
    fm_lh_per_diem_mins          numeric(8,2),  -- 货机长途津贴
    sch_fm_per_diem_mins         numeric(8,2),  -- 计划货机津贴
    sch_fm_lh_per_diem_mins      numeric(8,2),  -- 计划货机长途津贴
    ggy_blh                      integer,  -- 高高原飞行时间（分钟）
    ver                          integer      not null default 1,  -- 乐观锁版本号，每次修改递增
    preference                   varchar(1)   check (preference in ('L','P') or preference is null),  -- 偏好：L=喜欢 P=不喜欢（机组申请标记）
    is_deleted                   smallint     not null default 0,  -- 软删除：1=已删除 0=正常
    live_id                      bigint,  -- 对应 live 系统（M1 Gantt）中的记录 id
    interface_id                 varchar(100),  -- 外部接口系统 id（如 OPS 系统）
    source                       varchar(12),  -- 数据来源：MANUAL=手动 OPT=优化生成 IMPORT=导入
    tags                         varchar(100),  -- 标签列表（逗号分隔，快速过滤用）
    comments             		 varchar(120),  -- 环级备注
    pairing_dt           date  -- 环日期（计划开始日，sch_str_dt_utc 的 UTC 日历日）
);-- 核心查询索引
create index idx_pairing_base_fleet   on pairing (base, fleet, pairing_act_str_dt_utc);
create index idx_pairing_str_end      on pairing (pairing_act_str_dt_utc, pairing_act_end_dt_utc);
create index idx_pairing_label        on pairing (pairing_label) where pairing_label is not null;
create index idx_pairing_deleted      on pairing (is_deleted);
create index idx_pairing_live_id      on pairing (live_id) where live_id is not null;

comment on table  pairing                          is '环头表，1行=1个环，存环级属性；环内duty/seg详情见 pairing_segment';
comment on column pairing.pairing_label            is '环名称/编号，如 T450 / E4154，来自生产系统或人工命名';
comment on column pairing.tafb                     is 'PBS 口径日历日：Base 当地时区 Brief 至 Debrief 覆盖的日历日数，单位天，最小值 1';
comment on column pairing.ver                      is '乐观锁版本号，每次修改环时递增，并发更新时做版本校验';
comment on column pairing.preference               is '机组偏好标记：L=Like喜欢 P=Prefer not不喜欢，PBS申请时使用';
comment on column pairing.is_deleted               is '软删除标记：0=正常 1=已删除（不物理删除，保留历史）';
comment on column pairing.source                   is '数据来源：MANUAL=排班员手动创建 OPT=优化引擎生成 IMPORT=外部系统导入';
comment on column pairing.live_id                  is '关联 M1 Gantt live 系统的记录 id，用于跨系统数据关联';
comment on column pairing.rank_comb_c9a_p          is '飞行员编组组合代码，C9A 系统用于校验编制合规性';
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
create table pairing_segment (
    id                           bigint        generated always as identity primary key,
    created_by                   varchar(30)   not null default 'system',  -- 创建人
    created_at                   timestamptz   not null default now(),  -- 创建时间（UTC）
    updated_by                   varchar(30)   not null default 'system',  -- 最后修改人
    updated_at                   timestamptz   not null default now(),  -- 最后修改时间（UTC）
    scenario_id             bigint       not null default 0,
    pairing_id                   bigint        not null,  -- 关联 pairing.id（本表与 pairing 表的关联键）
    duty_seq                     smallint      not null,  -- 环内第几个 duty（从 1 开始）
    duty_str_arp                 varchar(3)    not null,  -- duty 签到机场三字码
    duty_end_arp                 varchar(3)    not null,  -- duty 签出机场三字码
    duty_sch_str_dt_utc          timestamptz   not null,  -- duty 实际开始时间（UTC Brief开始）
    duty_sch_end_dt_utc          timestamptz   not null,  -- duty 实际结束时间（UTC DeBrief结束）
	duty_act_str_dt_utc          timestamptz   not null,  -- duty 实际开始时间（UTC）
    duty_act_end_dt_utc          timestamptz   not null,  -- duty 实际结束时间（UTC）
    duty_hotel_id                bigint,  -- duty 结束后过夜酒店 id（关联 hotel 表）
    duty_assignment              varchar(20),  -- duty 级任务类型（如 DH=调机 SBY=待命）
    duty_brief_min               integer,  -- 签到提前时间（分钟，法规要求在起飞前 N 分钟签到）
    duty_debrief_min             integer,  -- 签出后等待时间（分钟，debrief 时间）
	duty_sch_duty_min         	 integer,  -- 计划 duty 总时长（分钟）
	duty_sch_fdp_min             integer,  -- 计划 FDP（分钟）
    duty_sch_flt_min         	 integer,  -- 计划飞行时间（分钟）
	duty_sch_dp_min              integer,  -- 计划 DP（Duty Period，分钟）
	duty_sch_rest_min            integer,  -- 与上一 duty 间法规要求的最小休息时间（分钟）
	duty_sch_wp_min              numeric(10,2),  -- 计划工作时间（分钟）
	duty_sch_fm_credited_minutes numeric(8,2),  -- 计划货机信用积分
	duty_sch_credited_minutes    numeric(8,2),  -- 计划信用积分
    duty_act_duty_min         	 integer,  -- 实际 duty 总时长（分钟）
    duty_act_fdp_min             integer,  -- 实际 FDP（分钟）
    duty_act_flt_min          	 integer,  -- 实际飞行时间（分钟）
    duty_act_dp_min              integer,  -- 实际 DP（Duty Period，分钟）
    duty_act_rest_min            integer,  -- 与上一 duty 间实际休息时间（分钟）
	duty_act_wp_min              numeric(10,2),  -- 实际工作时间（分钟）
	duty_act_fm_credited_minutes     numeric(8,2),  -- 实际货机信用积分（分钟）
    duty_act_credited_minutes        numeric(6,2),  -- 实际信用积分（分钟）
    duty_ref_tz                  integer,  -- 参考时区偏移（分钟，用于昼夜节律计算）
    duty_etr_tz                  integer,  -- ETR 时区偏移（分钟）
    duty_acc_state               varchar(1)    not null default 'D',  -- 签入状态：D=草稿可修改 A=已确认锁定
    duty_layover_nits            integer,  -- 过夜夜数（用于津贴计算）
    duty_fdp_discretion_min      integer,  -- FDP 酌情延长分钟数（机长授权延伸）
    duty_max_fdp_min             integer,  -- 该 duty 的最大 FDP 上限（分钟，法规计算结果）
    duty_wp_adjustment           numeric(10,2),  -- 工作时间调整量
    duty_training_add_time       integer,  -- 培训附加时间（分钟，训练任务额外计入）
    duty_is_manual_modify        smallint,  -- duty 是否被手动修改：1=是 0=否
    duty_is_manual_max_fdp       smallint      check (duty_is_manual_max_fdp in (0,1)),  -- 是否手动设定最大 FDP：1=是
    duty_discretion_type         varchar(100),  -- 酌情延伸类型（记录 FDP 延伸原因）
    duty_comments                varchar(255),  -- duty 级备注
    seg_seq                      smallint      not null,  -- duty 内第几个航班段（从 1 开始）
    flt_id                       bigint,  -- 关联 flight 表 id，null=地面任务段
    flt_dt                       date,  -- 航班日期（UTC 起飞日期）
    flt_num                      varchar(100)  not null,  -- 航班号（冗余，避免 join flight 表）
    airline                      varchar(3)    not null,  -- 航空公司代码
    dep_arp                      varchar(3)    not null,  -- 出发机场三字码
    arv_arp                      varchar(3)    not null,  -- 到达机场三字码
    fleet_seg                    varchar(10)   not null,  -- 该段实际执飞机队（可能与环头 fleet 不同，如调机）
    act_str_dt_utc               timestamptz   not null,  -- 航班实际起飞时间（UTC）
    act_end_dt_utc               timestamptz   not null,  -- 航班实际落地时间（UTC）
	sch_str_dt_utc               timestamptz   not null,  -- 航班实际起飞时间（UTC）
    sch_end_dt_utc               timestamptz   not null,  -- 航班实际落地时间（UTC）
    seg_assignment               varchar(20)   not null,  -- 该航段任务类型代码（FLT=正常飞行 DH=调机）
    is_deleted               	 smallint      not null default 0,  -- 该航班段是否被移除：1=已移除 0=正常
    is_long_transit              smallint,  -- 是否长时间中转（超过标准中转时限）：1=是
    wp_mins_seg                  numeric(10,2),  -- 该段工作时间（分钟）
    act_credited_minutes_seg     numeric(8,2),  -- 该段实际信用积分（分钟）
    act_fm_credited_minutes_seg  numeric(8,2),  -- 该段实际货机信用积分
    sch_credited_minutes_seg     numeric(8,2),  -- 该段计划信用积分
    sch_fm_credited_minutes_seg  numeric(8,2),  -- 该段计划货机信用积分
    pickup_start_utc             timestamptz,  -- 首次Pickup坐车开始时间（UTC），Duty内第一段赋值
    pickup_end_utc               timestamptz,  -- 首次Pickup坐车结束时间（UTC）
    brief_start_utc              timestamptz,  -- 首次Brief签到开始时间（UTC），Duty内第一段赋值
    brief_end_utc                timestamptz,  -- 首次Brief签到结束时间（UTC）
    debrief_start_utc            timestamptz,  -- 首次Debrief签出开始时间（UTC），Duty内最后段赋值
    debrief_end_utc              timestamptz,  -- 首次Debrief签出结束时间（UTC）
    dropoff_start_utc            timestamptz,  -- 首次Dropoff坐车开始时间（UTC），Duty内最后段赋值
    dropoff_end_utc              timestamptz,  -- 首次Dropoff坐车结束时间（UTC）
    double_pickup_start_utc      timestamptz,  -- 第二次Pickup开始时间（UTC），带休息Duty或大过站场景使用
    double_pickup_end_utc        timestamptz,  -- 第二次Pickup结束时间（UTC）
    double_brief_start_utc       timestamptz,  -- 第二次Brief签到开始时间（UTC）
    double_brief_end_utc         timestamptz,  -- 第二次Brief签到结束时间（UTC）
    double_debrief_start_utc     timestamptz,  -- 第二次Debrief签出开始时间（UTC）
    double_debrief_end_utc       timestamptz,  -- 第二次Debrief签出结束时间（UTC）
    double_dropoff_start_utc     timestamptz,  -- 第二次Dropoff开始时间（UTC）
    double_dropoff_end_utc       timestamptz  -- 第二次Dropoff结束时间（UTC）
);-- 唯一约束：同一个环内，duty_seq + seg_seq 组合不重复
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
comment on column pairing_segment.seg_is_deleted     is '该航班段软删除标记，1=此段已从 duty 中移除（保留记录但不参与计算）';
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
create table pairing_template (
    id                    bigint       generated always as identity primary key,
    created_by            varchar(30)  not null default 'system',
    created_at            timestamptz  not null default now(),
    updated_by            varchar(30)  not null default 'system',
    updated_at            timestamptz  not null default now(),
    template_name         varchar(200) not null,  -- 模板名称
    template_period       smallint     not null,  -- 模板周期（天数）
    fleet_group           varchar(100) not null,  -- 适用机队分组
    tolerance             integer      not null,  -- 允许偏差（分钟）
    locked_status         smallint     not null,  -- 锁定状态：0=未锁 1=已锁
    pairing_compositions  varchar(200)            -- 编组要求描述
);

comment on table  pairing_template           is 'PO 优化引擎使用的环模板，定义理想的环结构';
comment on column pairing_template.tolerance is '允许偏差分钟数，优化时匹配模板的容忍度';

-- ------------------------------------------------------------
-- pairing_template_detail — 环模板航班明细
-- ------------------------------------------------------------
create table pairing_template_detail (
    id                    bigint       generated always as identity primary key,
    created_by            varchar(30)  not null default 'system',
    created_at            timestamptz  not null default now(),
    updated_by            varchar(30)  not null default 'system',
    updated_at            timestamptz  not null default now(),
    template_id           bigint       not null,  -- 所属模板 id
    pairing_seq           smallint     not null,  -- 第几个环
    day_seq               smallint     not null,  -- 第几天
    duty_seq              smallint     not null,  -- 第几个 duty
    seg_seq               smallint     not null,  -- 第几个航班段
    flt_num               varchar(100) not null,  -- 目标航班号
    seg_assignment        varchar(20)  not null,  -- 任务类型
    seg_dep               varchar(3)   not null,  -- 出发机场
    seg_arr               varchar(3)   not null,  -- 到达机场
    dow                   varchar(20),            -- 适用星期（1234567，1=周一）
    remark                varchar(200),           -- 备注
    pairing_compositions  varchar(200)            -- 编组要求
);

comment on table  pairing_template_detail     is '环模板的具体航班段明细';
comment on column pairing_template_detail.dow is '适用星期，如 135 表示周一三五，1=周一 7=周日';

-- ------------------------------------------------------------
-- pairing_memo — 环备注
-- ------------------------------------------------------------
create table pairing_memo (
    id          bigint       generated always as identity primary key,
    created_by  varchar(30)  not null default 'system',
    created_at  timestamptz  not null default now(),
    updated_by  varchar(30)  not null default 'system',
    updated_at  timestamptz  not null default now(),
    pairing_id  bigint,                -- 关联环业务 id
    memo        varchar(300),          -- 备注内容
    user_id     varchar(30)  not null default 'system', -- 创建用户
    status      varchar(10),           -- 状态：Y=有效 N=已删除
    tmst        timestamptz  not null default now()     -- 创建时间戳
);

comment on table pairing_memo is '环的备注便签，排班人员手动添加';

-- ============================================================
-- section 6: roster_flight 融合单表
-- ============================================================

-- roster_flight — 排班宽表（融合原 roster + roster_flight）
--
-- 设计原则：
--   pairing_id > 0：飞行任务
--     flt_id / duty_seq / seg_seq / dep_arp / arv_arp 等有值
--     sch_str_dt_utc / sch_end_dt_utc 表示该航班的计划起落时间
--   pairing_id = 0：地面任务
--     flt_id / duty_seq / seg_seq 为 null
--     sch_str_dt_utc / sch_end_dt_utc 表示地面任务的时间范围
--     grd_assignment / grd_location / grd_remark 记录地面任务详情
--
-- 原 Oracle 触发器 TR_ROSTER_EXPORT_VER / TR_ROSTER_FLIGHT_EXPORT_VER 不迁移
-- 改用应用层事件处理变更追踪
-- ------------------------------------------------------------
create table roster_flight (
    id                           bigint        generated always as identity primary key,
    created_by                   varchar(30)   not null default 'system',
    created_at                   timestamptz   not null default now(),
    updated_by                   varchar(30)   not null default 'system',
    updated_at                   timestamptz   not null default now(),
    scenario_id             bigint       not null default 0,
    crew_id                      varchar(30)   not null,  -- 机组工号
	pairing_id                   bigint,  -- 环业务 id，null=地面任务
    live_id                      bigint,  -- 来源 live roster_flight.id，用于优化/发布链路回溯
    ver                          integer       not null default 1,  -- 版本号
	base                         varchar(3)    not null,  -- 环所属基地机场三字码
    label                        varchar(200),  -- 排班标签
    assignment_group             varchar(20)   not null,  -- 任务分组代码
    assignment                   varchar(20),  -- 任务类型代码
    role                         varchar(20),  -- 角色（如 CAPTAIN/FO/PIC）
    sub_role                     varchar(100),  -- 子角色
    source                       varchar(12)   not null,  -- 排班来源（IMP=外部接口导入 / MA=人工 / CR=优化器）
    is_requested                 smallint      not null default 0,  -- 是否为机组主动申请：1=是
    is_deleted                   smallint      not null default 0,  -- 软删除：1=已删除
    is_swapped                   smallint      not null default 0,  -- 是否为换班产生：1=是
    preference                   varchar(1),  -- 偏好标记（L=喜欢 P=不喜欢）
    comments                     varchar(180),  -- 备注
    score                        integer,  -- 优化引擎评分
	working_hour                 numeric(8,2),  -- 工作小时
	sch_credited_minutes         numeric(8,2),  -- 计划信用积分
    sch_fm_credited_minutes      numeric(8,2),  -- 计划货机信用积分
    sch_per_diem_mins            numeric(8,2),  -- 计划津贴
    sch_lh_per_diem_mins         numeric(8,2),  -- 计划长途津贴
    sch_fm_per_diem_mins         numeric(8,2),  -- 计划货机津贴
    sch_fm_lh_per_diem_mins      numeric(8,2),  -- 计划货机长途津贴
	act_credited_minutes         numeric(8,2),  -- 信用积分（分钟）
	act_fm_credited_minutes      numeric(8,2),  -- 货机信用积分
    act_per_diem_mins            numeric(8,2),  -- 津贴时长（分钟）
    act_lh_per_diem_mins         numeric(8,2),  -- 长途津贴时长
    act_fm_per_diem_mins         numeric(8,2),  -- 货机津贴时长
    act_fm_lh_per_diem_mins      numeric(8,2),  -- 货机长途津贴
    dp_min                       integer,  -- 地面任务 DP 分钟
    flt_id                       bigint,  -- 关联 flight 表 id（地面任务为 null）
    duty_seq                     smallint,  -- duty 序号（地面任务为 null）
    seg_seq                      smallint,  -- 航班段序号（地面任务为 null）
    duty_ref_tz                  integer,  -- crew-specific 7500 duty-start 参考时区偏移（分钟）
    duty_end_ref_tz              integer,  -- crew-specific 7500 duty-end/rest-start 参考时区偏移（分钟）
    flt_dt                       varchar(10),  -- 航班日期字符串（地面任务为 null）
    sch_str_dt_utc           	 timestamptz,  -- 计划开始时间（UTC 航班和地面任务共用）
    sch_end_dt_utc           	 timestamptz,  -- 计划结束时间（UTC 航班和地面任务共用）
	act_str_dt_utc           	 timestamptz,  -- 实际开始时间（UTC）
    act_end_dt_utc           	 timestamptz,  -- 实际结束时间（UTC）
    division                     varchar(2),  -- 机组类型
	flight_acting_rank           varchar(10)   not null,  -- 在该航班上实际担任的职级（可能与环槽位不同）
    active_rank                  varchar(20),  -- 实际担任职级（本职级）
	position                     varchar(10),  -- 席位
    seq_order                    smallint,  -- 同航班机组排序序号
    check_type                   varchar(40),  -- 签到类型
    ts_flag                      varchar(50),  -- TS 标志
    send_flag                    smallint,  -- 推送标志：1=已推送给机组 app
    resource_code                varchar(100),  -- 资源代码
    tm_program_course_id         bigint,  -- 训练计划课程 id
    group_id                     varchar(200),  -- 分组 id（批量操作）
    tag_set                      varchar(50),  -- 标签集
    parent_tm_program_course_id  bigint,  -- 父训练课程 id
    course_code                  varchar(30),  -- 课程代码
    is_extra_course              smallint      not null default 0,  -- 是否额外培训：1=是
    sub_tm_program_course_id     bigint,  -- 子训练课程 id
    sub_parent_tm_program_id     bigint,  -- 子父训练课程 id
    sub_course_code              varchar(30),  -- 子课程代码
    seq_order_source             varchar(20),  -- 排序来源
    sub_group_id                 varchar(200),  -- 子分组 id
    request_source               varchar(20),  -- 申请来源
    request_id                   bigint,  -- 关联申请单 id
    is_publish                   smallint,  -- 是否已发布给机组：1=已发布
    exception_code               varchar(50),  -- 异常代码
    act_rest_min                 integer,  -- 实际休息时长（分钟），地面任务从 assignment.rest_time 填充，飞行任务为 null
    roster_acting_rank           varchar(10),  -- 对应 pairing_composition 的职级槽位，同一环内所有航段一致
    dep_arp                      varchar(3),  -- 出发机场（地面任务填 startLocation，飞行任务为 null）
    arv_arp                      varchar(3)   -- 到达机场（地面任务填 endLocation，飞行任务为 null）
);comment on table  roster_flight                     is '排班宽表，融合原 roster + roster_flight，飞行和地面任务共用';
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
create table roster_publish (
    id                            bigint        generated always as identity primary key,
    created_by                    varchar(30)   not null default 'system',
    created_at                    timestamptz   not null default now(),
    updated_by                    varchar(30)   not null default 'system',
    updated_at                    timestamptz   not null default now(),
    filiale                       varchar(6),              -- 所属航司
    division                      varchar(1)    not null,  -- 机组类型
    flt_id                        bigint,                  -- 航班 id；ground row 为 null
    flt_dt                        varchar(10)   not null,  -- 航班日期字符串
    pairing_id                    bigint,                           -- 环业务 id，null=地面任务
    roster_flight_id              bigint,                  -- 来源 roster_flight.id
    ver                           integer       not null default 1, -- 来源 roster_flight 版本号
    base                          varchar(3),              -- 来源 roster_flight.base
    source                        varchar(12),             -- 来源 roster_flight.source
    is_requested                  smallint      not null default 0,
    is_deleted                    smallint      not null default 0,
    is_swapped                    smallint      not null default 0,
    preference                    varchar(1),
    comments                      varchar(180),
    score                         integer,
    working_hour                  numeric(8,2),
    sch_credited_minutes          numeric(8,2),
    sch_fm_credited_minutes       numeric(8,2),
    sch_per_diem_mins             numeric(8,2),
    sch_lh_per_diem_mins          numeric(8,2),
    sch_fm_per_diem_mins          numeric(8,2),
    sch_fm_lh_per_diem_mins       numeric(8,2),
    act_credited_minutes          numeric(8,2),
    act_fm_credited_minutes       numeric(8,2),
    act_per_diem_mins             numeric(8,2),
    act_lh_per_diem_mins          numeric(8,2),
    act_fm_per_diem_mins          numeric(8,2),
    act_fm_lh_per_diem_mins       numeric(8,2),
    dp_min                        integer,
    duty_seq                      smallint,
    seg_seq                       smallint,
    crew_id                       varchar(30)   not null,  -- 机组工号
    flight_acting_rank            varchar(10),             -- 来源 roster_flight.flight_acting_rank
    active_rank                   varchar(20),             -- 实际职级
    roster_acting_rank            varchar(10),             -- 来源 roster_flight.roster_acting_rank
    position                      varchar(20),             -- 席位
    assignment_group              varchar(20),             -- 任务分组代码
    assignment                    varchar(20)   not null,  -- 任务类型
    label                         varchar(200),            -- 排班展示标签
    seq_order                     smallint      not null default 0, -- 排序序号
    check_type                    varchar(40),             -- 签到类型
    ts_flag                       varchar(50),             -- TS 标志
    sch_str_dt_utc                timestamptz,             -- 通用计划开始时间
    sch_end_dt_utc                timestamptz,             -- 通用计划结束时间
    act_str_dt_utc                timestamptz,             -- 实际开始时间
    act_end_dt_utc                timestamptz,             -- 实际结束时间
    dep_arp                       varchar(3),              -- 通用起点机场/地点
    arv_arp                       varchar(3),              -- 通用终点机场/地点
    tag_set                       varchar(50),
    is_extra_course               smallint      not null default 0,
    seq_order_source              varchar(20),
    exception_code                varchar(50),
    act_rest_min                  integer,
    pairing_label                 varchar(50),             -- 发布时快照 pairing.pairing_label，PBS 禁止运行时 join pairing
    pairing_base                  varchar(3),              -- 发布时快照 pairing.base
    pairing_fleet                 varchar(20),             -- 发布时快照 pairing.fleet
    fleet_seg                     varchar(10),             -- 发布时快照 pairing_segment.fleet_seg
    tafb                          integer,                 -- 发布时快照 pairing.tafb（PBS 日历日）
    -- 签到信息（机组出行前报到）
    checking_type                 varchar(10),             -- 签到方式（APP/现场/电话）
    checking_str_tm               timestamptz,             -- 签到窗口开始时间
    checking_radius               integer       not null default 0, -- 允许签到半径（米，0=不限）
    checking_tm                   timestamptz,             -- 预计签到时间
    act_checking_tm               timestamptz,             -- 实际签到时间
    checking_user                 varchar(20),             -- 签到确认人
    -- 接送信息
    pick_up_time                  timestamptz,             -- 接机时间
    brief_time                    timestamptz,             -- 飞行简报时间
    debrief_time                  timestamptz,             -- 飞行讲评时间
    drop_off_time                 timestamptz,             -- 送机时间
    resource_code                 varchar(100),            -- 资源代码
    role                          varchar(100),            -- 角色
    tm_program_course_id          bigint,                  -- 训练课程 id
    group_id                      varchar(200),            -- 分组 id
    send_flag                     integer,                 -- 推送状态
    location_validation           smallint,                -- 是否开启位置验证：1=是
    deleted_by                    varchar(30),             -- 删除操作人
    browser_identify_id           varchar(100),            -- 浏览器指纹 id（位置验证用）
    only_validation_browser       smallint,                -- 仅允许指定浏览器签到：1=是
    -- 详细时间窗口（UTC）
    pick_up_start_utc             timestamptz,             -- 接机时间窗口开始
    pick_up_end_utc               timestamptz,             -- 接机时间窗口结束
    brief_start_utc               timestamptz,             -- 简报时间窗口开始
    brief_end_utc                 timestamptz,             -- 简报时间窗口结束
    debrief_start_utc             timestamptz,             -- 讲评时间窗口开始
    debrief_end_utc               timestamptz,             -- 讲评时间窗口结束
    drop_off_start_utc            timestamptz,             -- 送机时间窗口开始
    drop_off_end_utc              timestamptz,             -- 送机时间窗口结束
    parent_tm_program_course_id   bigint,                  -- 父课程 id
    remark                        varchar(512),            -- 备注
    checking_define_id            bigint,                  -- 签到规则定义 id
    in_flt_duty                   varchar(20),             -- 飞行中职责
    only_validation_ip            smallint,                -- 仅限指定 IP 签到：1=是
    check_in_ip                   varchar(200),            -- 实际签到 IP 地址
    em_quiz                       varchar(64),             -- 应急考核代码
    course_code                   varchar(30),             -- 课程代码
    pairing_start_utc             timestamptz,             -- 环开始时间
    duty_code_flag                smallint,                -- duty 代码标志
    sch_brief_start_utc           timestamptz,             -- 计划简报开始时间
    checking_end_tm               timestamptz,             -- 签到窗口截止时间
    lateness_type                 smallint,                -- 迟到类型
    check_in_location_for_radius  varchar(500),            -- 签到基准位置坐标（JSON）
    request_source                varchar(20),             -- 申请来源
    request_id                    bigint,                  -- 关联申请单 id
    is_publish                    smallint,                -- 是否已推送：1=是
    sub_tm_program_course_id      bigint,                  -- 子课程 id
    sub_parent_tm_program_id      bigint,                  -- 子父课程 id
    sub_course_code               varchar(30),             -- 子课程代码
    sub_role                      varchar(100),            -- 子角色
    sub_group_id                  varchar(200)             -- 子分组 id
);

create unique index uq_roster_publish          on roster_publish (flt_id, crew_id) where flt_id is not null;
create unique index uq_roster_publish_roster_flight_id on roster_publish (roster_flight_id) where roster_flight_id is not null;
create index idx_roster_pub_crew_pair          on roster_publish (crew_id, pairing_id, duty_seq, flt_id);
create index idx_roster_pub_flt_dt             on roster_publish (flt_id, flt_dt);
create index idx_roster_pub_crew_start         on roster_publish (crew_id, sch_str_dt_utc);

comment on table  roster_publish                  is '已对外发布的排班快照：roster_flight + pairing_segment 时间窗口 + PBS 展示字段，供机组 app/PBS 只读';
comment on column roster_publish.roster_flight_id is '来源 roster_flight.id';
comment on column roster_publish.duty_seq         is '来源 roster_flight.duty_seq';
comment on column roster_publish.seg_seq          is '来源 roster_flight.seg_seq';
comment on column roster_publish.flight_acting_rank is '来源 roster_flight.flight_acting_rank';
comment on column roster_publish.roster_acting_rank is '来源 roster_flight.roster_acting_rank';
comment on column roster_publish.assignment_group is '任务分组代码，用于区分 FLY/GRD/RES 等整月排班类型';
comment on column roster_publish.label            is '排班展示标签，来自 roster_flight.label';
comment on column roster_publish.sch_credited_minutes is '发布快照计划信用积分，优先来自 roster_flight.sch_credited_minutes，回退 pairing_segment.duty_sch_credited_minutes / duty_act_credited_minutes，PBS 禁止运行时 join live 原表';
comment on column roster_publish.act_credited_minutes is '发布快照实际信用积分，优先来自 roster_flight.act_credited_minutes，回退 pairing_segment.duty_act_credited_minutes，PBS 禁止运行时 join live 原表';
comment on column roster_publish.pairing_label    is '发布快照环号，来自 pairing.pairing_label，PBS 禁止运行时 join pairing';
comment on column roster_publish.pairing_base     is '发布快照环基地，来自 pairing.base，PBS 禁止运行时 join pairing';
comment on column roster_publish.pairing_fleet    is '发布快照环机队，来自 pairing.fleet，PBS 禁止运行时 join pairing';
comment on column roster_publish.fleet_seg        is '发布快照航段机型代码，来自 pairing_segment.fleet_seg，PBS 禁止运行时 join pairing_segment';
comment on column roster_publish.tafb             is '发布快照 pairing.tafb（PBS 日历日，单位天），PBS 禁止运行时 join pairing';
comment on column roster_publish.sch_str_dt_utc   is '通用计划开始时间：飞行任务=航段计划起飞，地面任务=任务开始时间';
comment on column roster_publish.sch_end_dt_utc   is '通用计划结束时间：飞行任务=航段计划落地，地面任务=任务结束时间';
comment on column roster_publish.dep_arp          is '通用起点机场/地点：飞行任务=出发机场，地面任务=开始地点';
comment on column roster_publish.arv_arp          is '通用终点机场/地点：飞行任务=到达机场，地面任务=结束地点';
comment on column roster_publish.checking_radius  is '允许签到的半径范围（米），0 表示不限制位置';
comment on column roster_publish.location_validation is '是否开启 GPS 位置验证：1=开启';

-- ------------------------------------------------------------
-- roster_publish_adjust — Publish Roster 发布任务变更记录
-- 每次发布 apply 记录 old/new 快照，用于后续定时回传发布任务数据
-- ------------------------------------------------------------
create table roster_publish_adjust (
    id int8 generated always as identity(
        increment by 1
        minvalue 1
        maxvalue 9223372036854775807
        start 1
        cache 1
        no cycle
    ) not null,
    created_by varchar(30) default 'system'::character varying not null,
    created_at timestamp default now() not null,
    updated_by varchar(30) default 'system'::character varying not null,
    updated_at timestamp default now() not null,
    batch_id int8 not null,
    rp_start timestamp null,
    rp_end timestamp null,
    published_dt timestamp null,
    filiale varchar(20) null,
    division varchar(20) null,
    action_type varchar(20) null,
    crew_id varchar(30) null,
    old_roster_flight_id int8 null,
    old_pairing_id int8 null,
    old_pair_interface_id varchar(100) null,
    old_flt_id int8 null,
    old_base varchar(3) null,
    old_sch_str_dt_utc timestamp null,
    old_sch_end_dt_utc timestamp null,
    old_act_str_dt_utc timestamp null,
    old_act_end_dt_utc timestamp null,
    old_dep_arp varchar(3) null,
    old_arv_arp varchar(3) null,
    old_assignment_group varchar(20) null,
    old_assignment varchar(20) null,
    old_roster_acting_rank varchar(10) null,
    old_flight_acting_rank varchar(10) null,
    old_active_rank varchar(10) null,
    old_position varchar(10) null,
    old_role varchar(30) null,
    old_course_code varchar(30) null,
    old_resource_code varchar(30) null,
    old_seq_order int2 null,
    old_brief_start_utc timestamp null,
    old_brief_end_utc timestamp null,
    new_roster_flight_id int8 null,
    new_pairing_id int8 null,
    new_pair_interface_id varchar(100) null,
    new_flt_id int8 null,
    new_base varchar(3) null,
    new_sch_str_dt_utc timestamp null,
    new_sch_end_dt_utc timestamp null,
    new_act_str_dt_utc timestamp null,
    new_act_end_dt_utc timestamp null,
    new_dep_arp varchar(3) null,
    new_arv_arp varchar(3) null,
    new_assignment_group varchar(20) null,
    new_assignment varchar(20) null,
    new_roster_acting_rank varchar(10) null,
    new_flight_acting_rank varchar(10) null,
    new_active_rank varchar(10) null,
    new_position varchar(10) null,
    new_role varchar(30) null,
    new_course_code varchar(30) null,
    new_resource_code varchar(30) null,
    new_seq_order int2 null,
    new_brief_start_utc timestamp null,
    new_brief_end_utc timestamp null,
    old_source varchar(12) null,                -- 旧快照 roster_flight.source（IMP/MA/CR），ADD 时为 null
    new_source varchar(12) null,                -- 当前 roster_flight.source（IMP/MA/CR），DELETE 时为 null
    published int2 default 0 not null,
    constraint chk_roster_publish_adjust_filiale_upper check (((filiale)::text = upper((filiale)::text))),
    constraint chk_roster_publish_adjust_published check (published between 0 and 2),
    constraint roster_publish_adjust_pkey primary key (id)
);

create index idx_roster_pub_adj_published on roster_publish_adjust (published);
create index idx_roster_pub_adj_batch on roster_publish_adjust (batch_id);
create index idx_roster_pub_adj_crew_created on roster_publish_adjust (crew_id, created_at);

comment on table roster_publish_adjust is 'Publish Roster old/new snapshot rows pending outbound callback';
comment on column roster_publish_adjust.batch_id is 'Shared publish apply batch id';
comment on column roster_publish_adjust.action_type is 'Publish diff action: ADD, UPDATE, DELETE';
comment on column roster_publish_adjust.published is 'Callback status: 0=pending, 1=sent to NOC, 2=IMP imported and excluded from NOC publish';

-- ------------------------------------------------------------
-- roster_publish_outbound_log — Publish Roster outbound callback attempt log
-- 每次定时任务调用外部回传接口都追加一条日志，用于后续核查请求参数、响应与错误
-- ------------------------------------------------------------
create table roster_publish_outbound_log (
    id bigint generated always as identity primary key,
    created_by varchar(30) not null default 'system',
    created_at timestamp not null default now(),
    updated_by varchar(30) not null default 'system',
    updated_at timestamp not null default now(),
    batch_id bigint not null,
    request_id varchar(80) not null,
    request_payload jsonb not null,
    response_status int,
    response_body text,
    error_message text,
    duration_ms int,
    success smallint not null default 0,
    constraint chk_roster_pub_out_log_success check (success in (0, 1))
);

create index idx_roster_pub_out_log_batch on roster_publish_outbound_log (batch_id, created_at);
create index idx_roster_pub_out_log_request on roster_publish_outbound_log (request_id, created_at);
create index idx_roster_pub_out_log_success on roster_publish_outbound_log (success, created_at);

comment on table roster_publish_outbound_log is 'Publish Roster outbound callback request/response history';
comment on column roster_publish_outbound_log.batch_id is 'roster_publish_adjust.batch_id for the callback batch';
comment on column roster_publish_outbound_log.request_payload is 'Full outbound callback JSON payload sent to the external API';
comment on column roster_publish_outbound_log.response_body is 'Raw external API response body';
comment on column roster_publish_outbound_log.success is '1=HTTP success, 0=HTTP/network failure';

-- ============================================================
-- section 7: 发布记录与场景元数据
-- ============================================================

-- ------------------------------------------------------------
-- schedule_publish_record — 排班发布事实与批次范围
-- 实际排班数据保存在 roster_publish；文件字段仅为历史兼容，可为空
-- ------------------------------------------------------------
create table schedule_publish_record (
    id                bigint        generated always as identity primary key,
    created_by        varchar(30)   not null default 'system',
    created_at        timestamptz   not null default now(),
    updated_by        varchar(30)   not null default 'system',
    updated_at        timestamptz   not null default now(),
    str_dt            timestamptz   not null,  -- 发布覆盖的排班周期开始
    end_dt            timestamptz   not null,  -- 发布覆盖的排班周期结束
    ac_type           varchar(100),            -- 涉及的机型（逗号分隔）
    division          varchar(100)  not null,  -- 涉及的机组类型
    roster_period_id  bigint,                  -- 关联排班周期 id
    published         smallint,                -- 发布状态：1=已发布 0=草稿
    crew_id           varchar(100),            -- 指定机组范围（null=全部）
    publish_type      varchar(20)   not null default 'Normal', -- 发布类型：Normal/Emergency/Correction
    base              varchar(50),             -- 涉及的基地
    batch_id          bigint,                  -- 批次 id（同一次批量发布共享）
    -- 历史兼容文件信息；当前 record-only 发布流程保持为空
    file_path         varchar(500),
    file_size         bigint,
    checksum          varchar(64)
);
create index idx_sch_pub_rec_dt on schedule_publish_record (str_dt, end_dt);
create index idx_sch_pub_rec_period_published_created
    on schedule_publish_record (roster_period_id, published, created_at desc);

comment on table  schedule_publish_record              is '排班发布成功事实与批次范围；实际排班数据读取 roster_publish';
comment on column schedule_publish_record.file_path    is '历史兼容文件路径；当前 record-only 发布流程保持 null';
comment on column schedule_publish_record.checksum     is '历史兼容校验值；当前 record-only 发布流程保持 null';
comment on column schedule_publish_record.publish_type is '发布类型：Normal=常规 Emergency=紧急 Correction=更正';
comment on column schedule_publish_record.roster_period_id is '关联 roster_period.id；Award 发布判断的周期身份';
comment on column schedule_publish_record.published is '发布结果：1=发布成功 0/null=草稿或未成功；Award 仅认可 1';

-- ------------------------------------------------------------
-- scenario — 优化场景元数据
-- 场景快照数据存 .scenario.gz 文件，此表只存元数据和文件路径
-- 原来十几个零散过滤参数字段统一合并为 filter_params jsonb
-- ------------------------------------------------------------
create table scenario (
    id               bigint       generated always as identity primary key,
    created_by       varchar(30)  not null default 'system',
    created_at       timestamptz  not null default now(),
    updated_by       varchar(30)  not null default 'system',
    updated_at       timestamptz  not null default now(),
    workset_id       bigint       not null,  -- 关联工作集 id
    name             varchar(200),  -- 场景名称
    version          smallint     not null default 0,  -- 场景版本号
    status           varchar(20)  not null,  -- 状态：DRAFT=草稿 RUNNING=运行中 DONE=完成 FAILED=失败
    process_id       varchar(9),  -- 优化进程 id
    str_dt_loc       timestamptz  not null,  -- 排班周期开始（本地时）
    end_dt_loc       timestamptz  not null,  -- 排班周期结束（本地时）
    ruleset_id       bigint       not null default 103,  -- 使用的规则集 id（workset.id）
    cqfset_id        varchar(9)   not null,  -- 使用的资质函数集 id
    pairing_scenario_id bigint,  -- 关联的 PO 场景 id（RO 场景使用）
    flight_scenario_id bigint,  -- 关联的 flight 场景 id（PO 场景使用）
    action           varchar(20),  -- 最后一次操作动作
    is_public        smallint     not null default 0,  -- 是否公开给其他用户：1=是
    is_favorite      smallint     not null default 0,  -- 是否被收藏：1=是
    leadin_live      smallint     not null default 0,  -- 是否导入 live 数据：1=是
    optimized_count  integer      not null default 0,  -- 已运行优化次数
    rank_cross       varchar(50),  -- 职级交叉设置
    comments         varchar(500),  -- 备注
    file_type        varchar(20)  not null default 'PO',  -- 场景类型：PO=组环 RO=分配
    filter_params    jsonb        not null default '{}',  -- 所有过滤参数（JSONB，按 key 读写）
    file_paths       jsonb not null default '[]'::jsonb, -- 所有优化版本文件路径及运行元数据
    file_size        bigint,  -- 文件大小（字节）
    checksum         varchar(64),  -- SHA-256 校验值
    task_id          varchar(64)  -- 飞行中 engine-server 优化任务 id
);create unique index uq_scenario_workset on scenario (workset_id);

comment on table  scenario                is '优化场景元数据，快照数据存 .scenario.gz 文件';
comment on column scenario.task_id        is '飞行中 engine-server 优化任务 id';
comment on column scenario.status         is '场景状态：DRAFT=草稿 RUNNING=优化中 DONE=完成 FAILED=失败';
comment on column scenario.filter_params  is 'JSONB 格式的过滤参数，合并原来31个零散 varchar 字段，新增参数无需加列';
comment on column scenario.file_type      is '场景类型：PO=PO引擎组环场景 RO=RO引擎分配场景';
comment on column scenario.file_paths     is 'JSONB 数组，记录场景每次优化运行的版本、执行人、时间和归档文件路径';

-- ------------------------------------------------------------
-- scenario_group — 场景分组（将多个场景组织在一起对比）
-- ------------------------------------------------------------
create table scenario_group (
    id           bigint       generated always as identity primary key,
    created_by   varchar(30)  not null default 'system',
    created_at   timestamptz  not null default now(),
    updated_by   varchar(30)  not null default 'system',
    updated_at   timestamptz  not null default now(),
    workset_id   bigint       not null,   -- 所属工作集 id
    scenario_id  bigint       not null,   -- 场景 id
    sequence     integer      not null,   -- 组内排序序号
    is_selected  varchar(1)   not null default 'Y' -- 是否选中参与对比：Y=是 N=否
);
create unique index uq_scenario_group on scenario_group (workset_id, scenario_id);

comment on table  scenario_group             is '场景分组，将多个场景组织在一起进行 KPI 对比';
comment on column scenario_group.is_selected is '是否选中参与当前对比：Y=选中 N=排除';

-- ------------------------------------------------------------
-- scenario_parameter - Scenario optimization parameter templates and values
-- ------------------------------------------------------------
create table scenario_parameter (
    id           bigint       generated always as identity primary key,
    created_by   varchar(30)  not null default 'system',
    created_at   timestamp    not null default now(),
    updated_by   varchar(30)  not null default 'system',
    updated_at   timestamp    not null default now(),
    scenario_id  bigint       not null default 0,
    code         varchar(200) not null,
    param_val    jsonb        not null default '{}',
    description  varchar(300),
    idx          integer,
    type         varchar(50)
);
create unique index uq_scenario_parameter_code on scenario_parameter (scenario_id, code);
create index ix_scenario_parameter_list on scenario_parameter (scenario_id, idx, code);

comment on table scenario_parameter is 'Scenario optimization parameter templates and per-scenario values';
comment on column scenario_parameter.scenario_id is '0 = template row; >0 = scenario-specific value row';
comment on column scenario_parameter.type is 'UI editor type: OBJ structured object, LIST list/table/CSV value';

-- ============================================================
-- 法规计算结果存储（供标签匹配、Gantt展示、薪酬计算使用）
-- 设计文档：docs/modules/gantt/tag-system-redesign.md
-- ============================================================

-- ------------------------------------------------------------
-- calc_result — 法规计算结果（一个环/roster一条记录，JSONB多层结构）
-- ------------------------------------------------------------
create table calc_result (
    id               bigint          generated always as identity primary key,
    created_by       varchar(30)     not null default 'system',
    created_at       timestamptz     not null default now(),
    updated_by       varchar(30)     not null default 'system',
    updated_at       timestamptz     not null default now(),

    target_type      varchar(20)     not null,
    target_id        bigint          not null,
    calc_data        jsonb           not null,
    computed_at      timestamptz     not null default now(),
    ruleset_id       bigint,
    version          integer         not null default 1,
    is_dirty         boolean         not null default false,
    dirty_reason     varchar(50)
);

create unique index uq_calc_result_target on calc_result (target_type, target_id);
create index idx_calc_result_computed on calc_result (computed_at);
create index idx_calc_result_dirty on calc_result (target_type, is_dirty) where is_dirty = true;

comment on table  calc_result                    is '法规引擎计算结果存储，一个环/roster一条记录，JSONB存储多层结构';
comment on column calc_result.target_type        is 'PAIRING=环计算结果 ROSTER=排班计算结果 CREW=机组计算结果 FLIGHT=航班计算结果';
comment on column calc_result.target_id          is '对应对象id（pairing.id / roster相关id）';
comment on column calc_result.calc_data          is '完整计算结果JSONB，含环级/duty级/rest级/cumulative级数据';
comment on column calc_result.computed_at        is '本次计算时间';
comment on column calc_result.ruleset_id         is '计算时使用的法规集合 id（workset.id）';
comment on column calc_result.version            is '版本号，每次重算自增，用于判断是否需要刷新';
comment on column calc_result.is_dirty           is '脏标记：true=数据已变更待重算 false=最新。变更时只标脏不立即重算，按需计算';
comment on column calc_result.dirty_reason       is '标脏原因：pairing_modified/flight_import/related_pairing_changed 等';

-- ============================================================
-- calc_data JSONB 结构示例
-- ============================================================
--
-- 【Pairing】
-- {
--   "pairing": { "total_flight_minutes": 1110, "pairing_days": 3, "total_segments": 7, "manday_hours": 24.5, "pay_hours": 28.0 },
--   "duties": [
--     { "duty_seq": 1, "fdp_minutes": 745, "fatigue_score": 52, "segment_count": 3, "is_night_duty": false, ... },
--     { "duty_seq": 2, "fdp_minutes": 680, "fatigue_score": 68, "segment_count": 4, ... }
--   ],
--   "rests": [
--     { "after_duty_seq": 1, "rest_minutes": 695, "rest_location": "PEK", "is_home_base": true }
--   ],
--   "cumulative": { "crew_flight_hours_7d": 2160, "crew_flight_hours_28d": 5400 }
-- }
--
-- 【Crew】定期计算（每日或排班变更时）
-- {
--   "qualifications": {
--     "aircraft_types": ["A320", "A321"],
--     "airport_quals": ["VHHH", "RJTT"],
--     "language_level": 4,
--     "medical_valid_to": "2026-09-15",
--     "medical_days_remaining": 176
--   },
--   "cumulative": {
--     "flight_hours_7d": 2160,
--     "flight_hours_28d": 5400,
--     "flight_hours_90d": 14500,
--     "flight_hours_365d": 52000,
--     "duty_days_this_month": 18,
--     "off_days_this_month": 13,
--     "consecutive_duty_days": 5
--   },
--   "recency": {
--     "last_landing_date": "2026-03-20",
--     "landings_90d": 12,
--     "landings_90d_by_type": { "A320": 10, "A321": 2 },
--     "last_flight_date": "2026-03-20"
--   },
--   "fatigue": {
--     "current_sleep_pressure": 35,
--     "avg_fatigue_7d": 48
--   }
-- }
--
-- 【Flight】航班数据变更时计算
-- {
--   "block_minutes": 135,
--   "flight_type": "domestic",
--   "is_night_flight": false,
--   "is_red_eye": false,
--   "special_airport_dep": false,
--   "special_airport_arr": false,
--   "min_crew_required": { "captain": 1, "fo": 1, "cc": 4 },
--   "augmented_crew_required": false,
--   "timezone_diff_hours": 0
-- }
--
-- 【Roster】月度排班汇总
-- {
--   "roster": {
--     "crew_id": "C001", "period_start": "2026-03-01", "period_end": "2026-03-31",
--     "total_flight_minutes": 4800, "total_duty_days": 18, "total_off_days": 13,
--     "manday_hours": 156.5, "pay_hours": 172.0, "overtime_hours": 12.5
--   },
--   "weekly_summary": [
--     { "week_start": "2026-03-01", "flight_minutes": 1200, "duty_days": 5, "max_fdp": 745, "min_rest": 600 }
--   ]
-- }

-- ============================================================
-- 外键约束（FK RESTRICT）
-- 在 CREATE TABLE 之后统一添加，避免循环依赖问题
-- ============================================================
alter table pairing_segment
  add constraint fk_ps_pairing foreign key (pairing_id) references pairing(id) on delete restrict,
  add constraint fk_ps_flight  foreign key (flt_id)     references flight(id)  on delete restrict;

alter table pairing_composition
  add constraint fk_pc_pairing foreign key (pairing_id) references pairing(id) on delete restrict;

alter table flight_composition
  add constraint fk_fc_flight  foreign key (flt_id)     references flight(id)  on delete restrict;

alter table roster_flight
  add constraint fk_rf_crew    foreign key (crew_id)    references crew(crew_id) on delete restrict,
  add constraint fk_rf_pairing foreign key (pairing_id) references pairing(id)  on delete restrict,
  add constraint chk_roster_flight_source_live check (source in ('IMP', 'MA', 'CR'));

alter table pairing_template_detail
  add constraint fk_ptd_template foreign key (template_id) references pairing_template(id) on delete restrict;


-- ============================================================
-- 性能索引（从 migration 合并）
-- ============================================================

-- pane search: pairing 表过滤字段（排除已删除行）
create index idx_pairing_fleet
    on pairing (fleet) where is_deleted = 0;
create index idx_pairing_base
    on pairing (base) where is_deleted = 0;
create index idx_pairing_tafb
    on pairing (tafb) where is_deleted = 0;
create index idx_pairing_division
    on pairing (division) where is_deleted = 0;

-- pane search: pairing_segment 表过滤字段（排除已删除行）
create index idx_pairing_segment_flt_num
    on pairing_segment (flt_num) where is_deleted = 0;
create index idx_pairing_segment_dep_arp
    on pairing_segment (dep_arp) where is_deleted = 0;

-- pane search: crew 维度过滤字段
create index idx_crew_rank_rank
    on crew_rank (rank);
create index idx_crew_base_base
    on crew_base (base);
create index idx_crew_fleet_fleet
    on crew_fleet (fleet_specific);

-- pane search: flight 表过滤字段（排除已删除行）
create index idx_flight_flt_num
    on flight (flt_num) where is_deleted = 0;
create index idx_flight_dep_arp
    on flight (dep_arp) where is_deleted = 0;
create index idx_flight_arv_arp
    on flight (arv_arp) where is_deleted = 0;

-- pairing occurrence 查询性能索引
create index idx_pairing_label_upper_active
    on pairing (upper(pairing_label))
    where is_deleted = 0 and pairing_label is not null;
create index idx_pairing_segment_pair_active
    on pairing_segment (pairing_id, is_deleted);

-- PBS pairing-search 热路径：base + bid-period(sch_str_dt_utc) 复合索引
-- （配合 sargable 半开区间过滤，把 base-only 过滤扫描变为 index range）
-- 详见 migration/2026-06-22-pairing-search-perf-indexes.sql
create index idx_pairing_base_sch_str
    on pairing (base, sch_str_dt_utc)
    where is_deleted = 0;
-- pairing_segment start/end rollup 覆盖索引（grouped LEFT JOIN 聚合走 index-only）
create index idx_pairing_segment_pair_rollup
    on pairing_segment (pairing_id)
    include (brief_start_utc, debrief_end_utc, sch_str_dt_utc, sch_end_dt_utc)
    where is_deleted = 0;

-- roster_flight 滚动历史查询性能索引
create index idx_rf_crew_str_dt
    on roster_flight (crew_id, sch_str_dt_utc)
    where is_deleted = 0 and assignment_group in ('FLT', 'DHD');

-- flight / pairing 接口 upsert 唯一索引
create unique index uq_flight_interface_flt_id
    on flight (interface_flt_id)
    where interface_flt_id is not null;
create unique index uq_pairing_interface_id
    on pairing (interface_id)
    where interface_id is not null;

-- roster_flight 查询性能索引（R3）
create index idx_roster_flight_crew_sch
    on roster_flight (crew_id, sch_str_dt_utc)
    where is_deleted = 0;
create index idx_roster_flight_pairing
    on roster_flight (pairing_id, duty_seq, seg_seq);
create index idx_roster_flight_live_id
    on roster_flight (live_id)
    where live_id is not null;
-- 8072/8030 Live∪Scenario COF fills by physical flt_id
create index idx_roster_flight_flt_fly
    on roster_flight (flt_id)
    where is_deleted = 0
      and assignment_group = 'FLY'
      and pairing_id is not null
      and flt_id is not null;

-- ============================================================
-- end of ddl
-- ============================================================
