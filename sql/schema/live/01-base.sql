-- ============================================================
-- 机组排班系统 — 基础数据定义（base ddl）
-- 从 Oracle brfdlive 转换为 PostgreSQL 16
-- ============================================================
-- 使用说明：
--   执行前先切换到对应航司 schema，例如：
--     create schema CA;
--     set search_path to CA;
--     \i base_pg.sql
--   新增航司只需重复上述三行，schema 名改为对应二字码即可
-- ============================================================
-- 审计字段顺序（每张表统一）：
--   id → created_by → created_at → updated_by → updated_at
-- ============================================================
-- 变更说明（相较于原 Oracle 版本）：
--   [1] system_parameter 表已废弃，功能合并入 dictionary 表
--       dictionary 支持 parent_code 树形结构，表达能力更强
--       · 系统参数查询：where parent_code = 'SYS_PARAM'
--       · 下拉选项查询：where parent_code = '分类代码'
--   [2] warn_column.colunm_* 拼写错误已修正为 column_*
--   [3] qualification_projection.qualfication 已修正为 qualification
--   [4] users 表移除 default_password，改用 password_hash 存 bcrypt 哈希
-- ============================================================

-- ------------------------------------------------------------
-- aircraft  (飞机)
-- ------------------------------------------------------------
create table aircraft (
    id                    bigint          generated always as identity primary key,
    created_by            varchar(30)     not null default 'system',
    created_at            timestamptz     not null default now(),
    updated_by            varchar(30)     not null default 'system',
    updated_at            timestamptz     not null default now(),
    filiale               varchar(6)      not null,
    ac_reg                varchar(20)     not null,
    fleet                 varchar(12)     not null,
    fleet_grp             varchar(12),
    ac_type               varchar(12),
    dow                   integer         not null default 0,
    dow_l                 integer         not null default 0,
    doi                   numeric(5,2)    not null default 0,
    doi_l                 numeric(5,2)    not null default 0,
    fly_device            varchar(12),
    max_depart_weight     integer         not null default 0,
    max_landfall_weight   integer         not null default 0,
    max_no_oil_weight     integer         not null default 0,
    start_date            timestamptz,
    end_date              timestamptz,
    seats                 smallint        not null default 0,
    is_cat2               smallint        not null default 0,
    restfacility          smallint        not null default 0,
    max_slide_weight      bigint,
    long_ac_type          varchar(20),
    sub_fleet             varchar(12)
);

create unique index uq_aircraft_ac_reg on aircraft (ac_reg);

comment on table  aircraft                  is '飞机主数据，每架飞机一条记录';
comment on column aircraft.ac_reg           is '飞机注册号，全局唯一，如 B-1234';
comment on column aircraft.fleet            is '所属机队代码，如 B738';
comment on column aircraft.fleet_grp        is '机队分组，用于宽泛匹配，如 B73x 匹配所有 737 系列';
comment on column aircraft.dow              is '空机重量（kg），Dry Operating Weight';
comment on column aircraft.doi              is '运营空重指数（Dry Operating Index），用于飞行计划配载';
comment on column aircraft.max_depart_weight  is '最大起飞重量（kg，MTOW）';
comment on column aircraft.max_landfall_weight is '最大落地重量（kg，MLW）';
comment on column aircraft.max_no_oil_weight   is '最大无燃油重量（kg，MZFW）';
comment on column aircraft.is_cat2          is '是否具备 CAT II 仪表着陆能力：1=是 0=否，影响机组资质要求';
comment on column aircraft.restfacility     is '机内休息设施等级（0=无），增强机组长航线使用';
comment on column aircraft.sub_fleet        is '子机队代码，同机型不同配置区分（如座位数不同）';

-- ------------------------------------------------------------
-- airport  (机场)
-- ------------------------------------------------------------
create table airport (
    id                        bigint          generated always as identity primary key,
    created_by                varchar(30)     not null default 'system',
    created_at                timestamptz     not null default now(),
    updated_by                varchar(30)     not null default 'system',
    updated_at                timestamptz     not null default now(),
    airport                   varchar(3)      not null,
    airport_name              varchar(100),
    airport_native_name       varchar(100),
    airport_icao              varchar(4),
    airport_abbr              varchar(30),
    city                      varchar(3)      not null,
    category                  varchar(3),
    dir                       varchar(1)      not null,
    zone_id                   varchar(50)     not null,
    utc_standard_offset       integer         not null,
    dst_grp                   varchar(4),
    plateau_type              varchar(5),
    cats                      varchar(5),
    rnp                       varchar(5),
    latitude                  numeric,
    longitude                 numeric,
    suitable_accommodation    smallint,
    in_phone                  varchar(200),
    out_phone                 varchar(200),
    country                   varchar(2),
    state                     smallint,
    email                     varchar(256),
    ic_route                  varchar(5)
);

create unique index uq_airport_code on airport (airport);

comment on table  airport                     is '机场主数据，法规引擎时区计算和资质检查的基础依赖';
comment on column airport.airport             is 'IATA 三字码，全局唯一，如 PEK/SHA/CAN';
comment on column airport.airport_icao        is 'ICAO 四字码，飞行计划使用，如 ZBAA';
comment on column airport.dir                 is '国内外标识：D=国内 I=国际，影响法规规则选择';
comment on column airport.zone_id             is 'IANA 时区标识，如 Asia/Shanghai，用于本地时间计算';
comment on column airport.utc_standard_offset is '标准时差（分钟，东正西负），如北京 +480（UTC+8）';
comment on column airport.plateau_type        is '高原类型：HP=高原(>2438m) HP2=高高原(>4500m)，影响机组资质要求';
comment on column airport.cats                is 'CAT 仪表着陆等级（I/II/III），影响机组资质要求';
comment on column airport.rnp                 is '所需导航性能精度要求（RNP），影响特殊机场资质';
comment on column airport.suitable_accommodation is '是否有适合的机组过夜住宿：1=有 0=无';

-- ------------------------------------------------------------
-- assignment  (任务类型定义)
-- ------------------------------------------------------------
create table assignment (
    id                              bigint          generated always as identity primary key,
    created_by                      varchar(30)     not null default 'system',
    created_at                      timestamptz     not null default now(),
    updated_by                      varchar(30)     not null default 'system',
    updated_at                      timestamptz     not null default now(),
    assignment                      varchar(20)     not null,
    description                     varchar(100)    not null,
    type                            varchar(3)      not null,
    is_rest                         smallint        not null default 0,
    color_hex                       varchar(6)      not null,
    label                           varchar(100),
    standalone                      varchar(1),
    bt_pct                          numeric(3,2),
    fdp_pct                         numeric(3,2),
    dp_pct                          numeric(3,2),
    is_adhoc                        smallint        not null default 0,
    default_location                varchar(3),
    is_recency                      smallint        not null default 0,
    fixed_str_tm                    varchar(5),            -- local wall-clock HH:mm (e.g. '04:00')
    fixed_end_tm                    varchar(5),            -- local wall-clock HH:mm (e.g. '16:00'); end≤start → next day
    fixed_duration_min              integer,
    fixed_credit_min                integer,  -- 固定信用积分（分钟）：不论时长的固定 credit；NULL=无固定信用积分
    display_label_when_available    varchar(1)      not null default 'N',
    default_assignment_group        varchar(20),
    ft_pct                          numeric(3,2)    not null default 0,
    is_qualifier                    smallint        not null default 0,
    wp_pct                          numeric(3,2)    not null default 0,
    rest_time                       integer,
    divide_crew_manday              varchar(1)      not null default 'E',
    reca_label                      varchar(1)      not null default 'Y',
    orientation                     varchar(20),
    pairing_label_color_hex         varchar(6),
    segment_label_color_hex         varchar(6),
    tm_credit_flag                  smallint,
    assignment_unit_type            varchar(20),
    dp_gap                          integer         not null default 0,
    before_pct_dp_gap_min           integer,
    after_pct_dp_gap_min            integer
);

create unique index uq_assignment_code on assignment (assignment);

comment on table  assignment                    is '任务类型定义，是法规引擎、工时计算、Gantt 展示的核心配置数据';
comment on column assignment.assignment         is '任务类型代码，全局唯一，如 FLT=飞行 SBY=待命 TRN=训练 AL=年假';
comment on column assignment.type              is '任务大类：L=Leave O=Off W=Work T=Training S=Reserve';
comment on column assignment.is_rest           is '休息标记：1=休息/非工作任务（type=L或O），0=非休息任务';
comment on column assignment.color_hex         is 'Gantt 显示颜色（6位十六进制，不含 #）';
comment on column assignment.bt_pct            is 'Block Time 飞行小时计入比例（0.00-1.00），飞行任务通常为1';
comment on column assignment.fdp_pct           is 'FDP 飞行执勤时间计入比例';
comment on column assignment.dp_pct            is 'DP 执勤时间计入比例';
comment on column assignment.is_adhoc          is '临时任务标记：1=不参与常规排班统计';
comment on column assignment.is_recency        is '近期经历标记：1=执行此任务可维持相关资质有效（如模拟机训练）';
comment on column assignment.is_qualifier      is '资质维持任务：1=执行后自动续期对应资质有效期';
comment on column assignment.rest_time         is '执行后法规要求的最少休息时间（分钟）';
comment on column assignment.divide_crew_manday is '跨日工时分配规则：E=均分 S=全计起飞日 L=全计落地日';
comment on column assignment.dp_gap            is '与相邻任务之间的最小缓冲间隔（分钟），用于法规校验';

-- ------------------------------------------------------------
-- assignment_group  (任务分组)
-- ------------------------------------------------------------
create table assignment_group (
    id                    bigint          generated always as identity primary key,
    created_by            varchar(30)     not null default 'system',
    created_at            timestamptz     not null default now(),
    updated_by            varchar(30)     not null default 'system',
    updated_at            timestamptz     not null default now(),
    assignment_group      varchar(15)     not null,
    name                  varchar(100)    not null,
    allow_overlap         smallint        not null default 0,
    optimizer_indicator   smallint        not null,
    color                 varchar(7)  -- 任务类型颜色 HEX 值，前端 Gantt 渲染用
);create unique index uq_assignment_group_code on assignment_group (assignment_group);

comment on table  assignment_group                    is '任务分组，用于权限控制和优化引擎分类管理';
comment on column assignment_group.color              is '任务类型颜色 HEX 值，前端 Gantt 渲染用';
comment on column assignment_group.allow_overlap      is '1=允许与其他任务时间重叠（如模拟机培训可与地面任务重叠）';
comment on column assignment_group.optimizer_indicator is '1=RO 分配引擎可将此分组任务纳入自动分配计划';

-- ------------------------------------------------------------
-- assignment_group_map  (任务与分组的映射关系)
-- ------------------------------------------------------------
create table assignment_group_map (
    id                    bigint          generated always as identity primary key,
    created_by            varchar(30)     not null default 'system',
    created_at            timestamptz     not null default now(),
    updated_by            varchar(30)     not null default 'system',
    updated_at            timestamptz     not null default now(),
    assignment_group_id   bigint          not null,
    assignment_id         bigint          not null
);

create unique index uq_assignment_group_map on assignment_group_map (assignment_group_id, assignment_id);

comment on table assignment_group_map is '任务类型与分组的多对多映射，同一任务可归属多个分组';

-- ------------------------------------------------------------
-- attribute  (组员/任务扩展属性定义)
-- ------------------------------------------------------------
create table attribute (
    id          bigint          generated always as identity primary key,
    created_by  varchar(30)     not null default 'system',  -- 创建人
    created_at  timestamptz     not null default now(),      -- 创建时间（UTC）
    updated_by  varchar(30)     not null default 'system',  -- 最后修改人
    updated_at  timestamptz     not null default now(),      -- 最后修改时间（UTC）
    type        varchar(30)     not null,
    code        varchar(30)     not null,
    name        varchar(100)    not null,
    filiale     varchar(6),
    is_visible  smallint        not null default 0,
    operation   varchar(3),
    division    varchar(1),
    source      varchar(10)     not null default 'man'  -- 来源：man=人工维护 int=接口自动同步（如HR系统）
);

comment on table  attribute          is '扩展属性定义，无需改表结构即可给机组/任务等对象动态挂载额外业务字段';
comment on column attribute.type     is '属性归属类型：CREW=机组 PAIRING=环 ROSTER=排班 FLIGHT=航班';
comment on column attribute.is_visible is '是否在界面可见：1=显示 0=隐藏（内部计算字段）';
comment on column attribute.source   is '数据来源：man=人工维护 int=外部接口同步';

-- ------------------------------------------------------------
-- audit_login_history  (登录审计日志)
-- ------------------------------------------------------------
create table audit_login_history (
    id            bigint          generated always as identity primary key,
    created_by    varchar(30)     not null default 'system',  -- 创建人
    created_at    timestamptz     not null default now(),      -- 创建时间（UTC）
    updated_by    varchar(30)     not null default 'system',  -- 最后修改人
    updated_at    timestamptz     not null default now(),      -- 最后修改时间（UTC）
    user_name     varchar(50),
    ip            varchar(45),
    machine       varchar(50),
    osuser        varchar(50),
    login_time    timestamptz     not null default now(),
    logout_time   timestamptz,
    login_type    varchar(20),
    result        varchar(100)   -- 登录结果（SUCCESS=成功，失败时记录具体原因）
);

comment on table  audit_login_history             is '系统登录审计日志，记录所有登录登出行为，用于安全合规';
comment on column audit_login_history.ip          is '客户端 IP 地址（支持 IPv6，最长 45 位）';
comment on column audit_login_history.logout_time is 'null 表示会话仍活跃，或客户端未正常退出（如直接关闭浏览器）';
comment on column audit_login_history.login_type  is '登录方式：WEB=浏览器 APP=移动端 API=接口调用';

-- ------------------------------------------------------------
-- base  (基地)
-- ------------------------------------------------------------
create table base (
    id                      bigint          generated always as identity primary key,
    created_by              varchar(30)     not null default 'system',
    created_at              timestamptz     not null default now(),
    updated_by              varchar(30)     not null default 'system',
    updated_at              timestamptz     not null default now(),
    filiale                 varchar(6)      not null,
    base                    varchar(3)      not null,
    name                    varchar(20),
    display_order           integer         not null,
    is_prime_display_base   smallint        not null
);

create unique index uq_base_filiale on base (filiale, base);

comment on table  base                       is '机组驻地基地，机组归属基地影响 TAFB 计算和法规规则选择';
comment on column base.base                  is '基地机场三字码，如 PEK=北京 SHA=上海 CAN=广州';
comment on column base.is_prime_display_base is '1=主显示基地，Gantt 界面打开时默认展示此基地机组数据';

-- ------------------------------------------------------------
-- certificate  (机组资质证书类型)
-- ------------------------------------------------------------
create table certificate (
    id                          bigint          generated always as identity primary key,
    created_by                  varchar(30)     not null default 'system',
    created_at                  timestamptz     not null default now(),
    updated_by                  varchar(30)     not null default 'system',
    updated_at                  timestamptz     not null default now(),
    certificate                 varchar(20)     not null,
    description                 varchar(100),
    divisions                   varchar(10)     not null,
    certificate_group           varchar(40),
    display_indicator           smallint        not null default 0,
    crew_filter_indicator       smallint        not null default 0,
    editor_filter_label         varchar(80),
    is_display_in_headerpane    smallint        not null default 0,
    headerpane_text             varchar(20),
    headerpane_text_color       varchar(10),
    display_order               integer,
    certificate_type            varchar(40)     not null default 'O',
    abbr                        varchar(10)     -- 缩写，空间有限区域使用（如 Gantt 条形内）
);

comment on table  certificate                       is '机组证件/执照类型定义，机组实际持有记录见 crew_certificate 表';
comment on column certificate.divisions             is '适用机组类型：P=飞行员 C=客舱 A=空中安全员，可组合如 PC';
comment on column certificate.display_indicator     is '1=在机组详情界面显示此证件的到期状态';
comment on column certificate.is_display_in_headerpane is '1=在 Gantt 机组行头部信息区显示到期提醒（临期变色）';
comment on column certificate.certificate_type      is '证件类别：O=其他 L=飞行执照 P=护照/旅行证件 M=体检证';

-- ------------------------------------------------------------
-- composition  (机组编制模板)
-- ------------------------------------------------------------
create table composition (
    id              bigint          generated always as identity primary key,
    created_by      varchar(30)     not null default 'system',
    created_at      timestamptz     not null default now(),
    updated_by      varchar(30)     not null default 'system',
    updated_at      timestamptz     not null default now(),
    filiale         varchar(6),
    division        varchar(2)      not null,
    name            varchar(30)     not null,
    name_desc       varchar(50),
    display_order   integer         not null,
    hierarchy       smallint    -- 编制层级：1=标准 2=增强（长航线增配额外飞行员）
);

comment on table  composition           is '机组编制模板，描述标准机组人数配置方案（如 2飞3乘）';
comment on column composition.hierarchy is '编制层级，1=标准编制 2=增强编制（如长航线增加休息飞行员）';

-- ------------------------------------------------------------
-- composition_load  (编制加载规则)
-- ------------------------------------------------------------
create table composition_load (
    id                  bigint          generated always as identity primary key,
    created_by          varchar(30)     not null default 'system',
    created_at          timestamptz     not null default now(),
    updated_by          varchar(30)     not null default 'system',
    updated_at          timestamptz     not null default now(),
    filiale             varchar(20)     not null,
    division            varchar(20)     not null,
    sequence            smallint        not null,
    flt_num             varchar(500),
    fleet               varchar(30),
    flight_flag         varchar(20),
    flt_type            varchar(1),
    seg_type            varchar(5),
    route_id            bigint,
    load_factor         varchar(15),
    eff_dt              timestamptz     not null,
    exp_dt              timestamptz,
    dow                 varchar(7)      not null default '1234567',
    description         varchar(255),
    comp_id             bigint,
    sub_fleet           varchar(30),
    flight_assignment   varchar(20),
    service_type        varchar(20),
    pax_num             varchar(20),
    rest_facility       integer,
    departure_time      varchar(200),
    arrival_time        varchar(200),
    option_id           bigint,
    blh_low             varchar(200),
    blh_upper           varchar(200)    -- 匹配的最大飞行时间（分钟）
);

comment on table  composition_load          is '编制加载规则，定义何种条件下自动套用哪个编制模板';
comment on column composition_load.sequence is '规则匹配优先级：数字越小越优先，多条同时满足时取最小值';
comment on column composition_load.dow      is '适用星期（7位字符串）：1=周一 7=周日，1234567=每天';
comment on column composition_load.eff_dt   is '规则生效日期';
comment on column composition_load.exp_dt   is '规则失效日期，null=长期有效';
comment on column composition_load.comp_id  is '命中时套用的编制模板 id（关联 composition 表）';

-- ------------------------------------------------------------
-- composition_rank  (编制职级人数配置)
-- ------------------------------------------------------------
create table composition_rank (
    id                bigint          generated always as identity primary key,
    created_by        varchar(30)     not null default 'system',
    created_at        timestamptz     not null default now(),
    updated_by        varchar(30)     not null default 'system',
    updated_at        timestamptz     not null default now(),
    comp_id           bigint          not null,
    plan_value        integer         not null,
    plan_value_extra  integer         not null,
    options           smallint        not null default 1,
    rank              varchar(30)     not null
);comment on table  composition_rank               is '编制模板中各职级的人数要求，如机长1名副驾1名乘务员4名';
comment on column composition_rank.plan_value    is '该职级计划人数，如 CA:1 FO:1 FA:4';
comment on column composition_rank.plan_value_extra is '额外备份人数（增强机组等长航线额外配置）';

-- ------------------------------------------------------------
-- cqf  (crew qualification function，机组资质函数)
-- ------------------------------------------------------------
create table cqf (
    id               bigint          generated always as identity primary key,
    created_by       varchar(30)     not null default 'system',
    created_at       timestamptz     not null default now(),
    updated_by       varchar(30)     not null default 'system',
    updated_at       timestamptz     not null default now(),
    function         integer         not null,
    instance         varchar(3),
    class            varchar(10),
    description      varchar(200),
    reference        varchar(20)     not null,
    category         varchar(20)     not null,
    store_structure  varchar(10),
    source           varchar(30),
    detail_display   varchar(100),
    filiale          varchar(6),
    division         varchar(1),
    owner            varchar(1)      not null default 'S',
    locked           varchar(1)      -- 是否锁定：Y=锁定后禁止修改参数配置
);

comment on table  cqf              is '机组资质检查函数定义，法规引擎用于验证机组是否具备特定任务资质';
comment on column cqf.function     is '资质函数编号，引擎通过此编号调用具体检查算法';
comment on column cqf.class        is '函数分类：QUAL=资质 LICENSE=执照 MEDIC=体检';
comment on column cqf.reference    is '法规引用编号，如 CCAR-121-R5-Sec4.32';
comment on column cqf.category     is '业务分类：AIRPORT=机场资质 FLEET=机型资质 LANG=语言资质';
comment on column cqf.owner        is 'S=系统内置（升级可能覆盖，勿随意改）C=客户自定义（可安全修改）';

-- ------------------------------------------------------------
-- cqf_parameter  (资质函数参数)
-- ------------------------------------------------------------
create table cqf_parameter (
    id            bigint          generated always as identity primary key,
    created_by    varchar(30)     not null default 'system',  -- 创建人
    created_at    timestamptz     not null default now(),      -- 创建时间（UTC）
    updated_by    varchar(30)     not null default 'system',  -- 最后修改人
    updated_at    timestamptz     not null default now(),      -- 最后修改时间（UTC）
    cqf_id        bigint          not null,
    phase_id      bigint          not null default 1,
    param_names   varchar(800)    not null,
    param_values  varchar(800)
);

create unique index uq_cqf_parameter on cqf_parameter (cqf_id, phase_id, param_names);

comment on table  cqf_parameter              is '资质函数参数配置，支持按计算阶段（phase）设置不同参数值';
comment on column cqf_parameter.phase_id     is '计算阶段：1=默认；多阶段用于月度/季度/年度不同限额场景';
comment on column cqf_parameter.param_names  is '参数名列表（逗号分隔），如 MAX_FT,MAX_FT_28D,MAX_FT_365D';
comment on column cqf_parameter.param_values is '参数值列表（逗号分隔），与 param_names 一一对应';

-- ------------------------------------------------------------
-- cqf_set  (资质函数集合，绑定到 workset)
-- ------------------------------------------------------------
create table cqf_set (
    id          bigint          generated always as identity primary key,
    created_by  varchar(30)     not null default 'system',  -- 创建人
    created_at  timestamptz     not null default now(),      -- 创建时间（UTC）
    updated_by  varchar(30)     not null default 'system',  -- 最后修改人
    updated_at  timestamptz     not null default now(),      -- 最后修改时间（UTC）
    workset_id  bigint          not null,
    cqf_id      bigint          not null    -- 关联资质函数 id（cqf 表）
);

comment on table cqf_set is '资质函数集合，将 cqf 函数与优化工作集关联，控制优化场景使用哪些资质检查';

-- ============================================================
-- 注意：cqf / cqf_parameter / cqf_set 为旧设计，待废弃。
-- 资质检查已合并到新法规体系中，作为 rule_template.category = 'QUALIFICATION'。
-- 新表：rule_template / rule_instance / rule_group / rule_group_instance
-- 待完全替换后，连同 workset 表一起删除。
-- ============================================================

-- ------------------------------------------------------------
-- dictionary — 数据字典（树形结构，同时替代原 system_parameter）
--
-- 设计说明：
--   原 system_parameter 表（param_name / param_values / app_ids /
--   param_desc）已废弃，其功能完全由本表承载。
--   dictionary 的 parent_code 树形结构比扁平 key-value 表达能力
--   更强，可统一存储系统参数和各类下拉选项。
--
--   使用约定
--   ┌─────────────────────────────────────────────────────────┐
--   │ 用途          │ parent_code      │ code      │ code_value│
--   ├─────────────────────────────────────────────────────────┤
--   │ 系统参数      │ SYS_PARAM        │ 参数名    │ 参数值    │
--   │   如 Manday   │ SYS_PARAM        │MANDAY_    │ 6         │
--   │   保留月数    │                  │DAILY_KEEP │           │
--   │               │                  │_MONTHS    │           │
--   ├─────────────────────────────────────────────────────────┤
--   │ 下拉选项      │ 分类代码         │ 选项值    │ 存储值    │
--   │   如性别      │ GENDER           │ M         │ 1         │
--   ├─────────────────────────────────────────────────────────┤
--   │ 分类树顶级    │ null             │ 分类代码  │ —         │
--   └─────────────────────────────────────────────────────────┘
-- ------------------------------------------------------------
create table dictionary (
    id           bigint          generated always as identity primary key,
    created_by   varchar(30)     not null default 'system',
    created_at   timestamptz     not null default now(),
    updated_by   varchar(30)     not null default 'system',
    updated_at   timestamptz     not null default now(),
    parent_code  varchar(40),    -- 父节点代码；null=顶级；'SYS_PARAM'=系统参数；其他=下拉选项分类
    code         varchar(100),   -- 字典代码；系统参数时为参数名，下拉选项时为选项值
    name         varchar(500),   -- 显示名称；系统参数时为参数说明，下拉选项时为界面文字
    idx          smallint,       -- 同父节点下的显示排序序号
    code_value   varchar(50)     -- 扩展值；系统参数时为参数值，下拉选项时为实际存储值
);

create index idx_dictionary_parent on dictionary (parent_code);
create index idx_dictionary_code   on dictionary (code);
create unique index uq_dictionary_parent_code on dictionary (coalesce(parent_code, '___NULL___'), code);

comment on table  dictionary            is '数据字典（树形），统一存储系统参数和下拉选项，替代原 system_parameter 表';
comment on column dictionary.parent_code is 'null=顶级分类节点；SYS_PARAM=系统参数；其他值=下拉选项父分类代码';
comment on column dictionary.code       is '字典代码：系统参数时为参数名（如 MANDAY_DAILY_KEEP_MONTHS）';
comment on column dictionary.code_value is '扩展值：系统参数时为参数值（如 6）；下拉选项时为实际存储入库的值';

-- ------------------------------------------------------------
-- division  (机型/飞行部门分类)
-- ------------------------------------------------------------
create table division (
    id           bigint          generated always as identity primary key,
    created_by   varchar(30)     not null default 'system',
    created_at   timestamptz     not null default now(),
    updated_by   varchar(30)     not null default 'system',
    updated_at   timestamptz     not null default now(),
    division     varchar(1)      not null,
    description  varchar(20)     -- 机组类型描述（中文）
);

comment on table  division          is '机组类型定义';
comment on column division.division is 'P=飞行员（Pilot）C=客舱乘务员（Cabin）A=空中安全员（Airmarshal）';

-- ------------------------------------------------------------
-- division_construction  (division 数据权限范围配置)
-- ------------------------------------------------------------
create table division_construction (
    id                  bigint          generated always as identity primary key,
    created_by          varchar(30)     not null default 'system',
    created_at          timestamptz     not null default now(),
    updated_by          varchar(30)     not null default 'system',
    updated_at          timestamptz     not null default now(),
    login_division      varchar(6)      not null,
    data_authorization  varchar(6)      -- 被授权可访问的 division 数据范围，null=仅限本 division
);

comment on table  division_construction                   is '数据权限范围配置，控制不同角色可查看的机组类型数据范围';
comment on column division_construction.login_division    is '账号登录身份标识（division 或角色代码）';
comment on column division_construction.data_authorization is '被授权访问的 division 范围，null=仅本 division';

-- ------------------------------------------------------------
-- fatigue_colour  (疲劳指数区间颜色配置)
-- ------------------------------------------------------------
create table fatigue_colour (
    id                 bigint          generated always as identity primary key,
    created_by         varchar(30)     not null default 'system',
    created_at         timestamptz     not null default now(),
    updated_by         varchar(30)     not null default 'system',
    updated_at         timestamptz     not null default now(),
    fatigue_index_min  numeric(6,2)    not null,
    fatigue_index_max  numeric(6,2)    not null,
    colour             varchar(20)     not null,
    display_order      smallint        -- 显示排序（从低疲劳到高疲劳）
);

comment on table  fatigue_colour                 is '疲劳指数颜色区间配置，控制 Gantt 中疲劳程度的颜色直观提示';
comment on column fatigue_colour.fatigue_index_min is '区间下限（含），如 0、40、80 等分段节点';
comment on column fatigue_colour.colour          is '颜色标识，如 GREEN/YELLOW/RED 或十六进制色值';

-- ------------------------------------------------------------
-- fatigue_result  (疲劳计算结果)
-- ------------------------------------------------------------
create table fatigue_result (
    id                  bigint          generated always as identity primary key,
    created_by          varchar(30)     not null default 'system',
    created_at          timestamptz     not null default now(),
    updated_by          varchar(30)     not null default 'system',
    updated_at          timestamptz     not null default now(),
    crew_id             varchar(30)     not null,
    duty_start          timestamptz     not null,
    duty_end            timestamptz     not null,
    fatigue_index       varchar(800),
    roster_id           bigint,
    duty_id             bigint,
    risk                varchar(40),
    max_sp              varchar(40),
    first_sleep_start   timestamptz,
    first_sleep_end     timestamptz,
    second_sleep_start  timestamptz,
    second_sleep_end    timestamptz,
    max_tod             varchar(20)     -- 昼夜节律低谷最大效应值（Time of Day effect），深夜飞行时偏高
);

comment on table  fatigue_result             is 'FRMS 疲劳模型计算结果，存储每次值勤的疲劳评估输出';
comment on column fatigue_result.fatigue_index is 'JSON 格式疲劳指数时间序列，记录整个 duty 期间的疲劳曲线';
comment on column fatigue_result.risk        is '疲劳风险等级：LOW=低 MEDIUM=中 HIGH=高 CRITICAL=超阈值';
comment on column fatigue_result.max_sp      is '最大睡眠压力值（Sleep Pressure Peak）';
comment on column fatigue_result.max_tod     is '昼夜节律效应峰值，反映生物钟对深夜飞行疲劳的额外影响';

-- ------------------------------------------------------------
-- filiale  (航空公司/子公司)
-- ------------------------------------------------------------
create table filiale (
    id            bigint          generated always as identity primary key,
    created_by    varchar(30)     not null default 'system',  -- 创建人
    created_at    timestamptz     not null default now(),      -- 创建时间（UTC）
    updated_by    varchar(30)     not null default 'system',  -- 最后修改人
    updated_at    timestamptz     not null default now(),      -- 最后修改时间（UTC）
    filiale       varchar(6)      not null,
    filiale_name  varchar(100)    not null,
    airline       varchar(2)      not null
);

create unique index uq_filiale_code on filiale (filiale);

comment on table  filiale         is '航空公司/子公司定义，多航司场景数据隔离的基础';
comment on column filiale.filiale is '内部标识码，如 CCA=国航主体；比 airline 更细粒度，支持子公司区分';
comment on column filiale.airline is 'IATA 两字代码：CA=国航 CZ=南航 MU=东航，用于航班号前缀';

-- ------------------------------------------------------------
-- fleet  (机队)
-- ------------------------------------------------------------
create table fleet (
    id              bigint          generated always as identity primary key,
    created_by      varchar(30)     not null default 'system',
    created_at      timestamptz     not null default now(),
    updated_by      varchar(30)     not null default 'system',
    updated_at      timestamptz     not null default now(),
    fleet           varchar(10)     not null,
    description     varchar(30),
    display_order   integer         not null,
    fleet_grp       varchar(20)     not null,
    ac_type         varchar(10)     not null,
    restfacility    smallint        not null default 0,
    market_ac_type  varchar(30),
    body            varchar(1)
);

create unique index uq_fleet_code on fleet (fleet);

comment on table  fleet              is '机队定义，机组资质管理和法规计算的基本单元';
comment on column fleet.fleet        is '机队代码，全局唯一，如 B738=波音737-800';
comment on column fleet.fleet_grp    is '机队族群，宽泛匹配用，如 B73x 可匹配整个 737 系列';
comment on column fleet.restfacility is '机内休息设施等级：0=无，宽体长航线飞机通常有机组休息舱';
comment on column fleet.body         is '机身类型：N=窄体单通道 W=宽体双通道';

-- ------------------------------------------------------------
-- language  (机组语言能力类型)
-- ------------------------------------------------------------
create table language (
    id                          bigint          generated always as identity primary key,
    created_by                  varchar(30)     not null default 'system',
    created_at                  timestamptz     not null default now(),
    updated_by                  varchar(30)     not null default 'system',
    updated_at                  timestamptz     not null default now(),
    language                    varchar(20)     not null,
    description                 varchar(100),
    filiale                     varchar(6)      not null,
    division                    varchar(1)      not null,
    language_group              varchar(40),
    display_indicator           smallint        not null default 0,
    crew_filter_indicator       smallint        not null default 0,
    editor_filter_label         varchar(40),
    is_display_in_headerpane    smallint        not null default 0,
    headerpane_text             varchar(10),
    headerpane_text_color       varchar(10),
    display_order               integer,
    language_level              varchar(1)      -- 要求的最低 ICAO 语言等级：4=有限熟练 5=流利 6=专家级
);

comment on table  language                       is '机组语言能力类型定义，机组实际语言记录见 crew_language 表';
comment on column language.language_level        is '最低 ICAO 语言等级：4=有限熟练 5=流利 6=专家级';
comment on column language.is_display_in_headerpane is '1=在 Gantt 机组头部区域显示语言证件有效期提醒';

-- ------------------------------------------------------------
-- live_config  (法规集合与 filiale/division 绑定配置)
-- ruleset_id 对应法规引擎的 rule_set 表
-- ------------------------------------------------------------
create table live_config (
    id                    bigint          generated always as identity primary key,
    created_by            varchar(30)     not null default 'system',
    created_at            timestamptz     not null default now(),
    updated_by            varchar(30)     not null default 'system',
    updated_at            timestamptz     not null default now(),
    filiale               varchar(6)      not null,
    division              varchar(1)      not null,
    ruleset_id            bigint          not null,
    rule_set_name         varchar(100),
    default_ruleset_flag  varchar(1),
    module                varchar(20)
);

create unique index uq_live_config on live_config (filiale, division, ruleset_id);

comment on table  live_config                      is '实时法规集合绑定，决定排班系统对哪套规章进行实时合规检查';
comment on column live_config.default_ruleset_flag is 'Y=默认法规集，同一 filiale+division 唯一，Gantt 启动时自动加载';
comment on column live_config.module               is '适用模块：GANTT=实时排班 OPT=优化引擎 ALL=所有模块';

-- ------------------------------------------------------------
-- profile  (用户权限档案)
-- ------------------------------------------------------------
create table profile (
    id            bigint          generated always as identity primary key,
    created_by    varchar(30)     not null default 'system',  -- 创建人
    created_at    timestamptz     not null default now(),      -- 创建时间（UTC）
    updated_by    varchar(30)     not null default 'system',  -- 最后修改人
    updated_at    timestamptz     not null default now(),      -- 最后修改时间（UTC）
    profile_name  varchar(50)     not null,
    filiale       varchar(6)      not null,
    division      varchar(1)      not null,
    idx           integer         -- 界面显示排序
);

comment on table profile is '用户权限档案，配合 profile_menu_privilege / profile_ctrl_privilege 控制菜单和按钮权限';

-- ------------------------------------------------------------
-- profile_authorization  (权限档案数据授权，粗粒度)
-- ------------------------------------------------------------
create table profile_authorization (
    id           bigint          generated always as identity primary key,
    created_by   varchar(30)     not null default 'system',
    created_at   timestamptz     not null default now(),
    updated_by   varchar(30)     not null default 'system',
    updated_at   timestamptz     not null default now(),
    profile_id   bigint          not null,
    auth_type    varchar(30)     not null,
    auth_values  varchar(3000)   not null
);

create unique index uq_profile_authorization on profile_authorization (profile_id, auth_type);

comment on table  profile_authorization          is '数据访问权限（粗粒度），控制档案可访问的基地/机队等范围';
comment on column profile_authorization.auth_type is '授权维度：BASE=基地 FLEET=机队 FILIALE=航司 DIVISION=机组类型';
comment on column profile_authorization.auth_values is '允许访问的值列表（逗号分隔），如 PEK,SHA 仅可见两个基地数据';

-- ------------------------------------------------------------
-- profile_authorization_detail  (权限档案数据授权，细粒度)
-- ------------------------------------------------------------
create table profile_authorization_detail (
    id           bigint          generated always as identity primary key,
    created_by   varchar(30)     not null default 'system',
    created_at   timestamptz     not null default now(),
    updated_by   varchar(30)     not null default 'system',
    updated_at   timestamptz     not null default now(),
    profile_id   bigint          not null,
    auth_type    varchar(30)     not null,
    auth_values  varchar(50)     not null    -- 单条授权值（每行一个，便于精确增删查改）
);

comment on table  profile_authorization_detail is '数据访问权限（细粒度），每行一个授权值，比粗粒度表更易精确管理';

-- ------------------------------------------------------------
-- profile_ctrl_privilege  (菜单控件操作权限)
-- ------------------------------------------------------------
create table profile_ctrl_privilege (
    id             bigint          generated always as identity primary key,
    created_by     varchar(30)     not null default 'system',
    created_at     timestamptz     not null default now(),
    updated_by     varchar(30)     not null default 'system',
    updated_at     timestamptz     not null default now(),
    profile_id     bigint          not null,
    menu_code      varchar(50)     not null,
    menu_ctl_code  varchar(50)     not null,
    is_hidden      varchar(5)      -- Y=隐藏此控件（等同无操作权限）；N 或 null=正常显示
);

comment on table  profile_ctrl_privilege          is '菜单控件级权限（按钮/操作项），隐藏即无权限';
comment on column profile_ctrl_privilege.menu_ctl_code is '按钮代码（system_menu.system_type=B），如 BTN_SAVE/BTN_DELETE/BTN_EXPORT';

-- ------------------------------------------------------------
-- profile_menu_privilege  (菜单访问权限)
-- ------------------------------------------------------------
create table profile_menu_privilege (
    id          bigint          generated always as identity primary key,
    created_by  varchar(30)     not null default 'system',  -- 创建人
    created_at  timestamptz     not null default now(),      -- 创建时间（UTC）
    updated_by  varchar(30)     not null default 'system',  -- 最后修改人
    updated_at  timestamptz     not null default now(),      -- 最后修改时间（UTC）
    profile_id  bigint          not null,
    menu_code   varchar(50)     not null,
    is_hidden   varchar(5)      -- Y=此菜单对该档案用户隐藏（不可访问）；N 或 null=正常显示
);

comment on table  profile_menu_privilege is '菜单访问权限，is_hidden=Y 表示该档案用户无法看到/访问此菜单';

-- ------------------------------------------------------------
-- qualification  (机组资质)
-- ------------------------------------------------------------
create table qualification (
    id                          bigint          generated always as identity primary key,
    created_by                  varchar(30)     not null default 'system',
    created_at                  timestamptz     not null default now(),
    updated_by                  varchar(30)     not null default 'system',
    updated_at                  timestamptz     not null default now(),
    qualification               varchar(20)     not null,
    description                 varchar(100),
    filiale                     varchar(6)      not null,
    division                    varchar(1)      not null,
    qualification_group         varchar(40),
    display_indicator           smallint        not null default 0,
    crew_filter_indicator       smallint        not null default 0,
    editor_filter_label         varchar(40),
    is_display_in_headerpane    smallint        not null default 0,
    headerpane_text             varchar(10),
    headerpane_text_color       varchar(10),
    display_order               integer,
    qualification_type          varchar(40),
    day_in_advance              integer         not null default 0,
    airport                     varchar(3),
    fleet_specific              varchar(20),
    sub_fleet                   varchar(20),
    negative_slippage           integer,
    positive_slippage           integer,
    base_month_flag             integer         not null default 0  -- 1=到期日取当月最后一天 0=按证书实际截止日
);

comment on table  qualification                      is '机组资质类型定义，机组实际持有记录见 crew_qualification 表';
comment on column qualification.qualification        is '资质代码，全局唯一，如 RVSM=缩小垂直间隔 ETOPS=延程飞行';
comment on column qualification.qualification_type   is '资质类别：AIRPORT=机场资质 OPERATION=操作资质 FLEET=机型资质';
comment on column qualification.day_in_advance       is '提前 N 天在 Gantt 界面显示到期预警（如30天内到期开始变色）';
comment on column qualification.negative_slippage    is '允许提前过期的容忍天数（如 -5=已过期5天内仍允许执行任务）';
comment on column qualification.positive_slippage    is '宽限期天数（如 +30=到期后30天内仍有效，等待复训安排）';
comment on column qualification.base_month_flag      is '1=有效期到当月最后一天（执照通常按月）0=按证书实际截止日';

-- ------------------------------------------------------------
-- qualification_projection  (资质投影/续期规则)
-- 原字段 qualfication 有拼写错误，已修正为 qualification
-- ------------------------------------------------------------
create table qualification_projection (
    id                 bigint          generated always as identity primary key,
    created_by         varchar(30)     not null default 'system',
    created_at         timestamptz     not null default now(),
    updated_by         varchar(30)     not null default 'system',
    updated_at         timestamptz     not null default now(),
    assignment         varchar(20),
    airport            varchar(100),
    projection_type    varchar(10)     not null default 'QUAL',
    qualification      varchar(20),
    renewal_period     varchar(6),
    renewal_unit       varchar(6),
    actualization      varchar(20),
    grace              varchar(20),
    display_order      integer,
    period             integer,
    unit               varchar(6),
    negative_slippage  integer,
    positive_slippage  integer         -- 正向滑动宽限天数
);

comment on table  qualification_projection            is '资质续期投影规则，定义完成特定任务后资质有效期自动延伸的计算规则';
comment on column qualification_projection.assignment is '触发续期的任务代码，如 SIM=模拟机训练后自动续期相关资质';
comment on column qualification_projection.projection_type is 'QUAL=资质续期 LIC=执照续期 MED=体检续期';
comment on column qualification_projection.actualization is '起算基准：EXEC_DATE=从执行日算新有效期 EXPIRE_DATE=从当前到期日顺延';
comment on column qualification_projection.renewal_unit is '续期周期单位：M=月 Y=年 D=天';

-- ------------------------------------------------------------
-- query_criteria  (gantt 查询条件元数据)
-- ------------------------------------------------------------
create table query_criteria (
    id                  bigint          generated always as identity primary key,
    created_by          varchar(30)     not null default 'system',
    created_at          timestamptz     not null default now(),
    updated_by          varchar(30)     not null default 'system',
    updated_at          timestamptz     not null default now(),
    criteria_code_name  varchar(30)     not null,
    criteria_ui_name    varchar(30)     not null,
    ref_table           varchar(50),
    ref_column          varchar(50),
    ref_condition       varchar(100),
    data_type           varchar(20),
    allowable_value     varchar(250),
    data_length         integer,
    low_value           varchar(10),
    high_value          varchar(20),
    flight_applicable   smallint        not null,
    pairing_applicable  smallint        not null,
    roster_applicable   smallint        not null,
    remark              varchar(100),
    default_value       varchar(100)    -- 该查询条件的默认筛选值
);

comment on table  query_criteria                    is 'Gantt 查询条件字段元数据，定义各面板可用的过滤字段配置';
comment on column query_criteria.flight_applicable  is '1=此条件可在航班面板（Flight Panel）的过滤器中使用';
comment on column query_criteria.pairing_applicable is '1=此条件可在环面板（Pairing Panel）的过滤器中使用';
comment on column query_criteria.roster_applicable  is '1=此条件可在排班面板（Roster Panel）的过滤器中使用';
comment on column query_criteria.ref_table          is '下拉选项数据来源表名（动态加载时使用）';

-- ------------------------------------------------------------
-- user_query  (用户保存的查询方案)
-- ------------------------------------------------------------
create table user_query (
    id              bigint          generated always as identity primary key,
    created_by      varchar(30)     not null default 'system',
    created_at      timestamptz     not null default now(),
    updated_by      varchar(30)     not null default 'system',
    updated_at      timestamptz     not null default now(),
    name            varchar(100)    not null,
    category        varchar(1)      not null check (category in ('F','P','R')),
    refresh_append  varchar(1)      not null check (refresh_append in ('A','R')),
    gray_hide       varchar(1)      not null check (gray_hide in ('G','H')),
    is_public       smallint        not null,
    is_editable     smallint        not null    -- 公开后他人是否可编辑：1=允许 0=只读
);

comment on table  user_query              is '用户保存的 Gantt 查询方案，可公开与其他排班人员共享';
comment on column user_query.category     is '适用面板：F=Flight航班 P=Pairing环 R=Roster排班';
comment on column user_query.refresh_append is 'A=追加模式（不清空已有结果）R=替换模式（全量刷新）';
comment on column user_query.gray_hide    is 'G=不匹配数据灰色显示（辅助对比）H=不匹配数据完全隐藏';

-- ------------------------------------------------------------
-- query  (查询方案明细条件)
-- ------------------------------------------------------------
create table query (
    id                    bigint          generated always as identity primary key,
    created_by            varchar(30)     not null default 'system',
    created_at            timestamptz     not null default now(),
    updated_by            varchar(30)     not null default 'system',
    updated_at            timestamptz     not null default now(),
    user_query_id         bigint          not null,
    group_condition       varchar(10)     not null check (group_condition in ('And','Or')),
    sub_group_id          bigint,
    sub_group_condition   varchar(10)     check (sub_group_condition in ('And','Or')),
    criteria_id           bigint          not null,
    criteria_seq          smallint        not null,
    include_exclude       varchar(1)      not null check (include_exclude in ('I','E')),
    operator              varchar(15),
    value1                varchar(50),
    value2                varchar(50),
    value3                varchar(50),
    is_bidirectional      smallint        not null default 0,
    timezone              varchar(1),
    ext_criteria          varchar(50),
    ext_operator          varchar(15)
);

create unique index uq_query on query (user_query_id, criteria_id, criteria_seq);

comment on table  query                   is '查询方案具体过滤条件，支持 AND/OR 多层嵌套条件组合';
comment on column query.group_condition   is '条件组逻辑：And=全部满足 Or=满足任一即可';
comment on column query.include_exclude   is 'I=Include满足条件则显示 E=Exclude满足条件则隐藏';
comment on column query.is_bidirectional  is '双向机场匹配：1=出发或落地满足即可（无论进出方向）';
comment on column query.timezone          is '时间条件时区类型：U=UTC L=本地时';

-- ------------------------------------------------------------
-- rank  (机组职级)
-- ------------------------------------------------------------
create table rank (
    id                  bigint          generated always as identity primary key,
    created_by          varchar(30)     not null default 'system',
    created_at          timestamptz     not null default now(),
    updated_by          varchar(30)     not null default 'system',
    updated_at          timestamptz     not null default now(),
    rank                varchar(10)     not null,
    division            varchar(1)      not null,
    display_order       integer         not null,
    description         varchar(100),
    is_include_in_ft    smallint        not null default 1,
    is_acting_rank      smallint        not null default 1,
    is_crew_rank        smallint        not null default 1,
    is_must_crew_rank   smallint        not null default 0
);

create unique index uq_rank_code on rank (rank);

comment on table  rank                    is '机组职级定义：CA=机长 FO=副驾驶 PU=乘务长 FA=乘务员';
comment on column rank.rank               is '职级代码，全局唯一，如 CA/FO/PU/FA';
comment on column rank.is_include_in_ft   is '1=此职级的飞行时间计入工时统计（通常为有操纵权的飞行员职级）';
comment on column rank.is_acting_rank     is '1=此职级可作为代飞职级被分配到排班任务';
comment on column rank.is_must_crew_rank  is '1=每个航班编组必须包含此职级人员（如机长是必须的）';

-- ------------------------------------------------------------
-- rank_acting  (代飞职级映射)
-- ------------------------------------------------------------
create table rank_acting (
    id           bigint          generated always as identity primary key,
    created_by   varchar(30)     not null default 'system',
    created_at   timestamptz     not null default now(),
    updated_by   varchar(30)     not null default 'system',
    updated_at   timestamptz     not null default now(),
    filiale      varchar(6)      not null,
    active_rank  varchar(10)     not null,
    acting_rank  varchar(10)     not null,
    qual         varchar(10)
);

create unique index uq_rank_acting on rank_acting (filiale, active_rank, acting_rank, qual);

comment on table  rank_acting            is '代飞职级映射，定义持某职级证书可以担任哪些代飞职级';
comment on column rank_acting.active_rank is '机组实际持有的职级，如 CA=持机长执照';
comment on column rank_acting.acting_rank is '实际担任的代飞职级，如 FO=该机长降级担任副驾驶位执飞';
comment on column rank_acting.qual        is '代飞所需额外资质（某些特殊机场/机型降级代飞需要额外授权）';

-- ------------------------------------------------------------
-- rank_position  (职级与席位对应关系)
-- ------------------------------------------------------------
create table rank_position (
    id             bigint          generated always as identity primary key,
    created_by     varchar(30)     not null default 'system',
    created_at     timestamptz     not null default now(),
    updated_by     varchar(30)     not null default 'system',
    updated_at     timestamptz     not null default now(),
    position       varchar(20)     not null,
    division       varchar(2)      not null,
    display_order  integer         not null,
    description    varchar(100),
    rank           varchar(10)     not null
);comment on table  rank_position          is '职级与驾驶舱/客舱席位对应关系';
comment on column rank_position.position is 'PIC=正驾驶左座 FO=副驾驶右座 FE=飞行工程师 OBS=观察员 PU=乘务长 FA=乘务员';

-- ------------------------------------------------------------
-- route  (航线段定义)
-- ------------------------------------------------------------
create table route (
    id                  bigint          generated always as identity primary key,
    created_by          varchar(30)     not null default 'system',
    created_at          timestamptz     not null default now(),
    updated_by          varchar(30)     not null default 'system',
    updated_at          timestamptz     not null default now(),
    route_id            bigint          not null,
    filiale             varchar(6)      not null,
    flt_num             varchar(100),
    dep_arp             varchar(3),
    arv_arp             varchar(3),
    seg_type            varchar(1),
    std_start           varchar(5),
    std_end             varchar(5),
    flt_dt_start        timestamptz,
    flt_dt_end          timestamptz,
    fleet_grp           varchar(30),
    fleet               varchar(30),
    seg_seq             smallint,
    min_blh             varchar(5),
    max_blh             varchar(5),
    flight_flag         varchar(30),
    flight_assignment   varchar(30),
    register            varchar(12)     -- 匹配的飞机注册号（限定特定飞机使用）
);

comment on table  route          is '航线段定义，供编制加载规则（composition_load）精确匹配特定出发到达组合';
comment on column route.route_id is '航线组 id，同 route_id 下多行为 OR 关系，满足任一即视为匹配该路线组';
comment on column route.seg_type is '航段类型：D=国内 I=国际';

-- ------------------------------------------------------------
-- rule  (法规定义) — 旧设计，待废弃
-- 新表：rule_template / rule_instance / rule_group / rule_group_instance
-- ------------------------------------------------------------
create table rule (
    id               bigint          generated always as identity primary key,
    created_by       varchar(30)     not null default 'system',
    created_at       timestamptz     not null default now(),
    updated_by       varchar(30)     not null default 'system',
    updated_at       timestamptz     not null default now(),
    function         integer         not null,
    instance         varchar(3),
    class            varchar(10),
    description      varchar(200),
    reference        varchar(20)     not null,
    category         varchar(30)     not null,
    store_structure  varchar(10),
    source           varchar(30),
    detail           varchar(400),
    overridability   varchar(1),
    severity         smallint        not null,
    filiale          varchar(6)      not null,
    division         varchar(1)      not null,
    owner            varchar(1)      not null default 'S',
    locked           varchar(1),
    exception_code   varchar(48),    -- 违规异常码，记录在违规日志中便于按类型统计分析
    param_json       jsonb           -- 法规参数（JSON 镜像，忠实保留旧 CSV 表头+行，含 Bases/Ranks/Fleets/Crew Teams 适用范围），cpp→python 再迁移的唯一权威
);

comment on table  rule                  is '法规定义，法规引擎核心配置，每条记录是一条具体的排班合规约束';
comment on column rule.param_json       is '法规参数 JSON 镜像：{"tables":[{"header":[...],"rows":[[...]]}]}，忠实保留 rule_parameter 旧 CSV（表头含 Bases/Ranks/Fleets/Crew Teams 适用范围），是 cpp→python 再迁移的参数权威来源';
comment on column rule.function         is '法规检查函数编号，引擎通过此编号调用具体检查算法';
comment on column rule.class            is '法规分类：FDP=飞行执勤时间 REST=休息时间 BLH=飞行小时限制';
comment on column rule.overridability   is 'Y=软限制可豁免（如机长签字后可延伸FDP）N=硬限制绝对不可违反';
comment on column rule.severity         is '违规严重程度，关联 severity 表，决定 Gantt 违规标注颜色';
comment on column rule.owner            is 'S=系统内置（升级可能覆盖，勿随意改）C=客户自定义（可安全修改）';

-- ------------------------------------------------------------
-- rule_set  (法规集合，将 rule 与 workset 绑定)
-- ------------------------------------------------------------
create table rule_set (
    id          bigint          generated always as identity primary key,
    created_by  varchar(30)     not null default 'system',  -- 创建人
    created_at  timestamptz     not null default now(),      -- 创建时间（UTC）
    updated_by  varchar(30)     not null default 'system',  -- 最后修改人
    updated_at  timestamptz     not null default now(),      -- 最后修改时间（UTC）
    workset_id  bigint          not null,
    rule_id     bigint          not null    -- 关联法规 id（rule 表）
);

comment on table rule_set is '法规集合，将 rule 与 workset 关联，一个工作集的关联法规构成完整合规约束体系';

-- ------------------------------------------------------------
-- sort_criteria  (gantt 排序条件元数据)
-- ------------------------------------------------------------
create table sort_criteria (
    id                  bigint          generated always as identity primary key,
    created_by          varchar(30)     not null default 'system',
    created_at          timestamptz     not null default now(),
    updated_by          varchar(30)     not null default 'system',
    updated_at          timestamptz     not null default now(),
    criteria_code_name  varchar(30)     not null,
    criteria_ui_name    varchar(30)     not null,
    data_type           varchar(20),
    flight_applicable   smallint        not null,
    pairing_applicable  smallint        not null,
    roster_applicable   smallint        not null,
    remark              varchar(100),
    criteria_code_enum  varchar(30)     -- 前端枚举代码，下拉选项映射用
);

comment on table  sort_criteria                    is 'Gantt 排序条件字段元数据，定义各面板排序选择器中的可用字段';
comment on column sort_criteria.flight_applicable  is '1=可用于航班面板排序';
comment on column sort_criteria.pairing_applicable is '1=可用于环面板排序';
comment on column sort_criteria.roster_applicable  is '1=可用于排班面板排序';

-- ------------------------------------------------------------
-- system_menu  (系统菜单定义)
-- ------------------------------------------------------------
create table system_menu (
    id                bigint          generated always as identity primary key,
    created_by        varchar(30)     not null default 'system',
    created_at        timestamptz     not null default now(),
    updated_by        varchar(30)     not null default 'system',
    updated_at        timestamptz     not null default now(),
    menu_code         varchar(50)     not null,
    menu_name         varchar(50)     not null,
    parent_menu_code  varchar(50)     not null,
    factory_name      varchar(300),
    png_name          varchar(50),
    system_type       varchar(1)      not null,
    system_source     integer,
    idx               integer,
    is_hidden         varchar(5)      -- 全局隐藏：Y=对所有人隐藏（功能开发中或已下线）
);

comment on table  system_menu               is '系统菜单树定义，配合 profile_menu_privilege 实现菜单级访问权限';
comment on column system_menu.parent_menu_code is '父菜单代码，根菜单用空字符串或特定根标识';
comment on column system_menu.factory_name  is '前端工厂类名，系统根据此字段动态加载对应页面/视图组件';
comment on column system_menu.is_hidden     is 'Y=全局隐藏（不受权限控制），用于临时下线或开发中的功能';

comment on column system_menu.system_type   is 'S=菜单节点，B=按钮；按钮的 parent_menu_code 指向所属页面，menu_code 为按钮代码';

-- ------------------------------------------------------------
-- team  (机组团队/小组)
-- ------------------------------------------------------------
create table team (
    id              bigint          generated always as identity primary key,
    created_by      varchar(30)     not null default 'system',
    created_at      timestamptz     not null default now(),
    updated_by      varchar(30)     not null default 'system',
    updated_at      timestamptz     not null default now(),
    filiale         varchar(6)      not null,
    team            varchar(50)     not null,
    description     varchar(100),
    display_order   integer,
    head_color      varchar(20),
    division        varchar(1)      not null,
    team_group      varchar(40)
);

create unique index uq_team on team (filiale, team, division);

comment on table  team            is '机组团队/小组定义，支持团队维度的排班分配、统计报表和 Gantt 分组显示';
comment on column team.head_color is 'Gantt 界面该团队标题行的背景颜色，便于直观区分不同团队排班区域';
comment on column team.team_group is '所属大组，支持两层分组结构（如 分公司 > 机队 > 班组）';

-- ------------------------------------------------------------
-- users  (系统用户)
-- 安全说明：
--   password_hash 存 bcrypt 哈希值，不存明文
--   原 default_password 字段已移除
--   通过 is_first_login 控制首次登录强制修改密码
-- ------------------------------------------------------------
create table users (
    id                  bigint          generated always as identity primary key,
    created_by          varchar(30)     not null default 'system',
    created_at          timestamptz     not null default now(),
    updated_by          varchar(30)     not null default 'system',
    updated_at          timestamptz     not null default now(),
    user_code           varchar(30)     not null,
    user_name           varchar(100)    not null,
    password_hash       varchar(200)    not null,
    branch_code         varchar(40)     not null,
    py_abbr             varchar(30)     not null,
    gender              varchar(1),
    tel                 varchar(40),
    eff_dt              timestamptz     not null,
    exp_dt              timestamptz,
    ad_active           smallint        not null default 0,
    status              smallint        not null default 0,
    is_admin            smallint        not null default 0,
    interface_user_id   varchar(50),
    password_access     varchar(1),
    portal_access       varchar(1),
    app_access          varchar(1),
    is_first_login      varchar(10),
    email               varchar(100),
    token_version       integer         not null default 0
);

create unique index uq_users_code on users (user_code);

comment on table  users                  is '系统内部用户（排班管理人员账号），与机组 PBS 账号（pbs_user）分开管理';
comment on column users.password_hash    is 'bcrypt 哈希密码，前端 RSA 加密传输，后端解密后哈希存储；严禁明文';
comment on column users.py_abbr          is '姓名拼音缩写，用于快速搜索账号，如 ZhangSan=ZS';
comment on column users.is_admin         is '1=超级管理员，绕过所有权限档案检查，拥有系统全部功能权限';
comment on column users.is_first_login   is 'Y=首次登录，系统强制要求修改密码后才能正常使用';
comment on column users.status           is '0=正常 1=管理员手动禁用 2=连续登录失败次数超限自动锁定';
comment on column users.password_access  is 'Y=允许账号密码登录方式';
comment on column users.portal_access    is 'Y=允许门户（Portal）页面访问';
comment on column users.app_access       is 'Y=允许移动 APP 端访问';
comment on column users.token_version    is 'JWT 会话撤销版本号；logout / 密码重置等安全事件递增后，旧 token 立即失效';

-- ------------------------------------------------------------
-- user_customer  (用户个性化配置，如列宽、布局偏好等)
-- ------------------------------------------------------------
create table user_customer (
    id          bigint          generated always as identity primary key,
    created_by  varchar(30)     not null default 'system',  -- 创建人
    created_at  timestamptz     not null default now(),      -- 创建时间（UTC）
    updated_by  varchar(30)     not null default 'system',  -- 最后修改人
    updated_at  timestamptz     not null default now(),      -- 最后修改时间（UTC）
    user_code   varchar(20)     not null,
    key         varchar(10)     not null,
    val         varchar(400),
    division    varchar(10)     -- 所属机组类型（同一用户可为不同 division 保存独立配置）
);

comment on table  user_customer     is '用户界面个性化配置，如 Gantt 列宽、面板布局、默认查询等偏好设置';
comment on column user_customer.key is '配置键：COL_WIDTH=列宽 PANE_LAYOUT=面板布局 DEFAULT_QUERY=默认查询方案';
comment on column user_customer.val is '配置值，复杂配置以 JSON 格式存储，如列宽 {"col1":120,"col2":80}';

-- ------------------------------------------------------------
-- user_department  (部门/分支机构)
-- ------------------------------------------------------------
create table user_department (
    id           bigint          generated always as identity primary key,
    created_by   varchar(30)     not null default 'system',
    created_at   timestamptz     not null default now(),
    updated_by   varchar(30)     not null default 'system',
    updated_at   timestamptz     not null default now(),
    branch_code  varchar(20)     not null,
    branch_name  varchar(50)     not null,
    parent_code  varchar(20),
    division     varchar(1),
    filiale      varchar(6),
    idx          smallint
);

create unique index uq_user_department on user_department (branch_code);

comment on table  user_department            is '系统用户组织部门（排班管理人员所属部门），与业务机组 department 表分开管理';
comment on column user_department.parent_code is 'null=顶级根部门，支持树形组织结构';

-- ------------------------------------------------------------
-- user_profile  (用户与权限档案绑定)
-- ------------------------------------------------------------
create table user_profile (
    id          bigint          generated always as identity primary key,
    created_by  varchar(30)     not null default 'system',  -- 创建人
    created_at  timestamptz     not null default now(),      -- 创建时间（UTC）
    updated_by  varchar(30)     not null default 'system',  -- 最后修改人
    updated_at  timestamptz     not null default now(),      -- 最后修改时间（UTC）
    user_code   varchar(30)     not null,
    profile_id  bigint          not null
);

create unique index uq_user_profile on user_profile (user_code, profile_id);

comment on table user_profile is '用户与权限档案绑定，一用户可绑多个档案，实际权限为所有绑定档案权限的并集';

-- ------------------------------------------------------------
-- warn  (预警类型定义)
-- ------------------------------------------------------------
create table warn (
    id          bigint          generated always as identity primary key,
    created_by  varchar(30)     not null default 'system',  -- 创建人
    created_at  timestamptz     not null default now(),      -- 创建时间（UTC）
    updated_by  varchar(30)     not null default 'system',  -- 最后修改人
    updated_at  timestamptz     not null default now(),      -- 最后修改时间（UTC）
    warn_name   varchar(100)    not null,
    file_name   varchar(50),
    icon_name   varchar(50)     -- 预警图标文件名（Gantt 界面预警标记图标）
);

comment on table  warn           is '预警类型定义，管理系统所有预警项，如资质到期、飞行时间临界等';
comment on column warn.file_name is '遗留字段，原用于前端动态加载预警处理文件，新系统改为标准 API 接口';

-- ------------------------------------------------------------
-- warn_auth  (用户预警授权)
-- ------------------------------------------------------------
create table warn_auth (
    id          bigint          generated always as identity primary key,
    created_by  varchar(30)     not null default 'system',  -- 创建人
    created_at  timestamptz     not null default now(),      -- 创建时间（UTC）
    updated_by  varchar(30)     not null default 'system',  -- 最后修改人
    updated_at  timestamptz     not null default now(),      -- 最后修改时间（UTC）
    warn_id     bigint          not null,
    user_name   varchar(30)     not null,
    warn_days   integer         not null default 30,
    is_start    varchar(2)
);

create unique index uq_warn_auth on warn_auth (warn_id, user_name);

comment on table  warn_auth          is '用户预警订阅配置，控制每个用户订阅哪些预警及提前提示天数';
comment on column warn_auth.warn_days is '提前天数：有效期在 N 天内开始在 Gantt 界面显示预警提示';
comment on column warn_auth.is_start  is 'Y=该用户启用此预警 N=暂时静默此预警（用户可自行调整）';

-- ------------------------------------------------------------
-- warn_column  (预警显示列定义)
-- 原字段 colunm_* 有拼写错误，已修正为 column_*
-- ------------------------------------------------------------
create table warn_column (
    id           bigint          generated always as identity primary key,
    created_by   varchar(30)     not null default 'system',
    created_at   timestamptz     not null default now(),
    updated_by   varchar(30)     not null default 'system',
    updated_at   timestamptz     not null default now(),
    warn_id      bigint          not null,
    column_code  varchar(100)    not null,
    column_name  varchar(50),
    column_idx   smallint
);

create unique index uq_warn_column on warn_column (warn_id, column_code);

comment on table  warn_column            is '预警展示列定义，控制每种预警详情列表中显示哪些数据列及顺序';
comment on column warn_column.column_code is '数据源字段名（原 Oracle 版本存在 colunm 拼写错误，此处已修正为 column）';

-- ------------------------------------------------------------
-- warn_notice  (预警通知内容)
-- ------------------------------------------------------------
create table warn_notice (
    id                  bigint          generated always as identity primary key,
    created_by          varchar(30)     not null default 'system',
    created_at          timestamptz     not null default now(),
    updated_by          varchar(30)     not null default 'system',
    updated_at          timestamptz     not null default now(),
    warn_id             bigint          not null,
    information_notice  varchar(100)    -- 通知消息模板，支持变量占位如 {crew_id} {exp_dt}
);

comment on table  warn_notice                  is '预警通知消息模板，预警触发时按此模板生成推送内容';
comment on column warn_notice.information_notice is '消息模板，如：机组 {crew_id} 的 {qual} 资质将于 {exp_dt} 到期';

-- ------------------------------------------------------------
-- warn_parameter  (预警参数配置)
-- ------------------------------------------------------------
create table warn_parameter (
    id               bigint          generated always as identity primary key,
    created_by       varchar(30)     not null default 'system',
    created_at       timestamptz     not null default now(),
    updated_by       varchar(30)     not null default 'system',
    updated_at       timestamptz     not null default now(),
    warn_id          bigint          not null,
    parameter_name   varchar(100),
    parameter_bind   varchar(20)     -- 绑定的数据字段名，用于动态拼接 SQL 过滤条件
);

comment on table  warn_parameter               is '预警动态过滤参数，支持用户按机场/机队等条件对预警结果二次过滤';
comment on column warn_parameter.parameter_bind is '将参数值映射到数据字段，用于构建动态 SQL 过滤条件';

-- ------------------------------------------------------------
-- warn_profile  (权限档案与预警绑定)
-- ------------------------------------------------------------
create table warn_profile (
    id          bigint          generated always as identity primary key,
    created_by  varchar(30)     not null default 'system',  -- 创建人
    created_at  timestamptz     not null default now(),      -- 创建时间（UTC）
    updated_by  varchar(30)     not null default 'system',  -- 最后修改人
    updated_at  timestamptz     not null default now(),      -- 最后修改时间（UTC）
    profile_id  bigint          not null,
    warn_id     bigint          not null,
    warn_days   integer         not null,
    is_start    varchar(1)      not null    -- Y=新用户绑定此档案后自动订阅此预警 N=默认不订阅
);

comment on table  warn_profile         is '权限档案预警默认配置，新用户绑定档案时自动继承档案的预警订阅设置';
comment on column warn_profile.is_start is 'Y=档案用户默认订阅；N=默认不订阅（用户可手动开启）';

-- ------------------------------------------------------------
-- workset  (工作集，绑定 rule_set / cqf_set)
-- ------------------------------------------------------------
create table workset (
    id          bigint          generated always as identity primary key,
    created_by  varchar(30)     not null default 'system',  -- 创建人
    created_at  timestamptz     not null default now(),      -- 创建时间（UTC）
    updated_by  varchar(30)     not null default 'system',  -- 最后修改人
    updated_at  timestamptz     not null default now(),      -- 最后修改时间（UTC）
    filiale     varchar(6),
    division    varchar(6)      not null,
    name        varchar(200)    not null,
    category    varchar(10),
    type        varchar(20)     not null,   -- 法规类型：逗号分隔多值 LIVE / RO / PBS
    enabled     boolean         not null default false -- LIVE/PBS 每个 division 的启用状态
);

comment on table  workset          is '优化引擎配置工作集，通过 rule_set/cqf_set 关联完整的法规和资质检查体系';
comment on column workset.category is '用途分类：PO=组环优化引擎 RO=分配优化引擎 LIVE=Gantt实时排班合规检查';
comment on column workset.type     is '法规类型：逗号分隔多值 LIVE/RO/PBS（如 ''LIVE,PBS,RO''），规范序 LIVE,PBS,RO';
comment on column workset.enabled  is 'LIVE/PBS 每个 division 只能有一套启用法规集';


-- ============================================================
-- section 1: 补充基础数据表（base_pg.sql 中遗漏的）
-- ============================================================

-- ------------------------------------------------------------
-- department — 业务组织部门（航司内部飞行部门树形结构）
-- ------------------------------------------------------------
create table department (
    id           bigint       generated always as identity primary key, -- 主键
    created_by   varchar(30)  not null default 'system',                -- 创建人
    created_at   timestamptz  not null default now(),                   -- 创建时间
    updated_by   varchar(30)  not null default 'system',                -- 最后修改人
    updated_at   timestamptz  not null default now(),                   -- 最后修改时间
    branch_code  varchar(20)  not null,                                 -- 部门编码（唯一）
    branch_name  varchar(100) not null,                                 -- 部门名称
    parent_code  varchar(20),                                           -- 上级部门编码，null 为顶级
    idx          smallint,                                              -- 显示排序序号
    division     varchar(1),                                            -- 所属 division（P=飞行员 C=客舱 A=空管）
    filiale      varchar(6)                                             -- 所属航司二字码
);
create unique index uq_department_code on department (branch_code);

comment on table  department              is '业务组织部门';
comment on column department.branch_code is '部门编码，全局唯一';
comment on column department.parent_code is '上级部门编码，null 表示顶级部门';
comment on column department.division    is '机组类型：P=飞行员 C=客舱 A=空管';

-- ------------------------------------------------------------
-- holiday — 节假日定义（用于法规引擎计算休息日、加班等）
-- ------------------------------------------------------------
create table holiday (
    id          bigint       generated always as identity primary key,
    created_by  varchar(30)  not null default 'system',
    created_at  timestamptz  not null default now(),
    updated_by  varchar(30)  not null default 'system',
    updated_at  timestamptz  not null default now(),
    filiale     varchar(6)   not null,  -- 所属航司
    country     varchar(2)   not null,  -- 国家代码（ISO 2位）
    city        varchar(3)   not null,  -- 城市代码（IATA 3位）
    str_dt      timestamptz  not null,  -- 假日开始时间
    end_dt      timestamptz  not null,  -- 假日结束时间
    holiday     varchar(80)  not null,  -- 假日名称
    mark        varchar(50),            -- 备注标记
    do_type     varchar(6)              -- 假日类型（如 PH=法定假日）
);
create unique index uq_holiday on holiday (filiale, country, city, str_dt);

comment on table  holiday         is '节假日定义，用于法规引擎计算休息日和加班';
comment on column holiday.do_type is '假日类型，如 PH=法定假日、WE=周末';

-- ------------------------------------------------------------
-- hotel — 外站酒店（机组在外站过夜时使用）
-- ------------------------------------------------------------
create table hotel (
    id          bigint       generated always as identity primary key,
    created_by  varchar(30)  not null default 'system',
    created_at  timestamptz  not null default now(),
    updated_by  varchar(30)  not null default 'system',
    updated_at  timestamptz  not null default now(),
    airport     varchar(3)   not null,              -- 所在机场代码
    hotel       varchar(100) not null,              -- 酒店名称
    phone       varchar(30),                        -- 联系电话
    address     varchar(200),                       -- 地址
    eff_dt      timestamptz  not null,              -- 生效日期
    exp_dt      timestamptz,                        -- 失效日期，null 表示长期有效
    pick_up     integer,                            -- 接送时间（分钟，距离机场）
    drop_off    integer,                            -- 送机时间（分钟）
    is_default  smallint,                           -- 是否默认酒店：1=是
    filiale     varchar(3),                         -- 所属航司
    fleet       varchar(100) not null default 'ALL' -- 适用机队，ALL 表示全部
);

comment on table  hotel          is '外站酒店，机组过夜时使用';
comment on column hotel.pick_up  is '接机时间，单位分钟，即机组到达后多少分钟送到酒店';
comment on column hotel.drop_off is '送机时间，单位分钟，即起飞前多少分钟从酒店出发';
comment on column hotel.fleet    is '适用机队，ALL 表示所有机队均可使用';

-- ------------------------------------------------------------
-- port_qual_reqmnt — 机场特殊资质要求
-- 定义哪些机场对特定职级机组有额外资质要求
-- ------------------------------------------------------------
create table port_qual_reqmnt (
    id             bigint       generated always as identity primary key,
    created_by     varchar(30)  not null default 'system',
    created_at     timestamptz  not null default now(),
    updated_by     varchar(30)  not null default 'system',
    updated_at     timestamptz  not null default now(),
    filiale        varchar(6)   not null,  -- 所属航司
    division       varchar(1)   not null,  -- 机组类型
    crew_group     varchar(16),            -- 机组分组（可选，更细粒度）
    flt_num        varchar(100),           -- 适用航班号，null 表示该机场所有航班
    airport        varchar(3)   not null,  -- 机场代码
    fleet          varchar(4),             -- 适用机队，null 表示所有机队
    rank           varchar(100) not null,  -- 适用职级（逗号分隔多个）
    qual           varchar(40)  not null,  -- 所需资质代码
    eff_dt         timestamptz  not null,  -- 生效日期
    start_time     varchar(20),            -- 每日生效时间（hhmm格式）
    exp_dt         timestamptz,            -- 失效日期
    end_time       varchar(20),            -- 每日失效时间
    in_out_ind     varchar(1)   not null,  -- 进出港方向：I=进港 O=出港 B=双向
    exception_code varchar(50),            -- 例外代码
    qual_level     smallint,               -- 资质等级要求
    seg_types      varchar(6),             -- 适用航段类型
    is_restricted  varchar(1)   not null default 'N' -- 是否限制：Y=限制 N=不限制
);

comment on table  port_qual_reqmnt            is '机场特殊资质要求，法规引擎使用';
comment on column port_qual_reqmnt.in_out_ind is '进出港方向：I=进港 O=出港 B=双向';
comment on column port_qual_reqmnt.rank       is '适用职级，多个职级用逗号分隔';

-- ------------------------------------------------------------
-- severity — 法规违规严重程度定义
-- ------------------------------------------------------------
create table severity (
    id          bigint       generated always as identity primary key,
    created_by  varchar(30)  not null default 'system',
    created_at  timestamptz  not null default now(),
    updated_by  varchar(30)  not null default 'system',
    updated_at  timestamptz  not null default now(),
    severity    smallint     not null,  -- 严重程度级别（数字越大越严重）
    definition  varchar(100),           -- 级别描述
    color_hex   varchar(6)   not null   -- Gantt 界面显示颜色（6位十六进制）
);
create unique index uq_severity on severity (severity);

comment on table  severity          is '法规违规严重程度等级定义';
comment on column severity.severity is '严重程度级别，数字越大表示越严重';

-- ------------------------------------------------------------
-- pane_header — Gantt 面板列头配置
-- 控制 Gantt 界面各列的显示顺序、宽度等
-- ------------------------------------------------------------
create table pane_header (
    id               bigint       generated always as identity primary key,
    created_by       varchar(30)  not null default 'system',
    created_at       timestamptz  not null default now(),
    updated_by       varchar(30)  not null default 'system',
    updated_at       timestamptz  not null default now(),
    pane             varchar(20)  not null,  -- 面板标识（如 FLIGHT/PAIRING/ROSTER）
    kpi              varchar(20)  not null,  -- 列标识代码
    is_display       integer      not null,  -- 是否显示：1=显示 0=隐藏
    position_index   smallint,               -- 列显示顺序
    expected_format  varchar(40),            -- 数据格式化模板
    remark           varchar(20),            -- 备注
    width            varchar(100)            -- 列宽（像素或百分比）
);

comment on table  pane_header             is 'Gantt 面板列头显示配置';
comment on column pane_header.pane        is '面板标识，如 FLIGHT=航班面板 PAIRING=环面板';
comment on column pane_header.kpi         is '列字段标识代码';
comment on column pane_header.is_display  is '是否显示：1=显示 0=隐藏';

-- ------------------------------------------------------------
-- roster_period — 排班周期定义
-- 定义每个排班周期的起止时间，用于 PBS 申请和排班发布管理
-- ------------------------------------------------------------
create table roster_period (
    id                       bigint       generated always as identity primary key,
    created_by               varchar(30)  not null default 'system',
    created_at               timestamptz  not null default now(),
    updated_by               varchar(30)  not null default 'system',
    updated_at               timestamptz  not null default now(),
    year                     varchar(5)   not null,  -- 年份（如 2025）
    name                     varchar(50)  not null,  -- 周期名称（如 2025-01）
    roster_period            varchar(100) not null,  -- 周期代码（唯一标识）
    rp_start                 timestamp    not null,  -- 基地本地排班周期开始墙上时间
    rp_end                   timestamp    not null,  -- 基地本地排班周期结束墙上时间
    roster_publication_date  timestamptz,            -- 排班发布日期
    paid_date                timestamptz,            -- 薪资结算日期
    lock_status              smallint     not null default 0, -- 锁定状态：0=未锁定 1=已锁定
    pbs_period_code          varchar(20),             -- PBS 周期代码，如 Dec 2025
    pbs_bid_open_at          timestamp,               -- PBS 申请开放基地本地墙上时间
    pbs_bid_close_at         timestamp,               -- PBS 申请截止基地本地墙上时间
    pbs_award_publish_at     timestamp,               -- PBS Award 计划开放基地本地墙上时间
    pbs_award_final_at       timestamp,               -- PBS Award Final 基地本地墙上时间
    pbs_mis_award_deadline_at timestamp,              -- mis-award 截止基地本地墙上时间
    pbs_status               varchar(20)  not null default 'DRAFT' -- PBS 周期状态
);

comment on table  roster_period                      is '排班周期定义，管理每个月/季度的排班时间范围';
comment on column roster_period.lock_status          is '锁定状态：0=未锁定可修改 1=已锁定不可修改';
comment on column roster_period.roster_publication_date is '排班对外发布日期，发布后机组可查看';
comment on column roster_period.pbs_period_code      is 'PBS 周期代码；PBS 不再单独维护 pbs_period 表';
comment on column roster_period.pbs_award_publish_at is 'PBS Award 计划开放查看时间；实际发布事实以 schedule_publish_record 为准';
comment on column roster_period.pbs_award_final_at is 'PBS Award 转为 Final 的基地本地墙上时间';
comment on column roster_period.pbs_mis_award_deadline_at is 'mis-award 申报截止的基地本地墙上时间';

-- ------------------------------------------------------------
-- roster_period_config — 排班周期自动生成规则
-- ------------------------------------------------------------
create table roster_period_config (
    id           bigint       generated always as identity primary key,
    created_by   varchar(30)  not null default 'system',
    created_at   timestamptz  not null default now(),
    updated_by   varchar(30)  not null default 'system',
    updated_at   timestamptz  not null default now(),
    name         varchar(100),  -- 配置名称
    name_type    smallint,      -- 名称生成规则类型
    rp_type      smallint,      -- 周期类型：1=月度 2=季度
    period       smallint,      -- 周期长度数值
    period_type  smallint,      -- 周期长度单位：1=天 2=周 3=月
    start_time   timestamptz,   -- 周期开始基准时间
    end_time     timestamptz    -- 周期结束基准时间
);

comment on table  roster_period_config            is '排班周期自动生成规则配置';
comment on column roster_period_config.rp_type    is '周期类型：1=月度周期 2=季度周期';
comment on column roster_period_config.period     is '周期长度数值，与 period_type 配合使用';
comment on column roster_period_config.period_type is '周期长度单位：1=天 2=周 3=月';

-- ============================================================
-- 新标签体系（统一 JSONB 条件 + 计算标签 + 优化过滤集）
-- 待完全替换旧表后，删除下方旧 tag_* / attribute 表
-- 设计文档：docs/modules/gantt/tag-system-redesign.md
-- ============================================================

-- ------------------------------------------------------------
-- tag_definition — 标签定义（统一所有对象类型）
-- ------------------------------------------------------------
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

comment on table  tag_definition                 is '标签定义，支持静态匹配/计算标签/手动打标三种类型';
comment on column tag_definition.code            is '标签编码，如 intl_flight, high_intensity_pairing';
comment on column tag_definition.target_type     is '标签挂载对象：FLIGHT/PAIRING/DUTY/ROSTER/CREW';
comment on column tag_definition.tag_type        is 'STATIC=基于数据字段匹配 COMPUTED=依赖法规计算结果 MANUAL=人工打标';
comment on column tag_definition.category        is '标签分类：FLIGHT_ATTR/DUTY_INTENSITY/CREW_SKILL/OPT_FILTER 等';
comment on column tag_definition.conditions      is '匹配条件JSONB，STATIC直接匹配字段，COMPUTED匹配calc.*结果，MANUAL为null';
comment on column tag_definition.color_hex       is 'Gantt显示颜色，如 #FF6B6B';
comment on column tag_definition.is_warning      is '命中标签是否触发告警提示';
comment on column tag_definition.requestable     is 'PBS机组是否可按此标签申请';

-- ------------------------------------------------------------
-- tag_assignment — 标签挂载记录（对象实际被打上的标签）
-- ------------------------------------------------------------
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

comment on table  tag_assignment                 is '标签挂载记录，记录哪个对象被打上了哪个标签';
comment on column tag_assignment.tag_id          is '关联tag_definition.id';
comment on column tag_assignment.target_type     is 'FLIGHT/PAIRING/DUTY/ROSTER/CREW';
comment on column tag_assignment.target_id       is '对应对象的id（flight.id/pairing.id/crew.id等）';
comment on column tag_assignment.source          is 'AUTO=系统自动匹配/计算 MANUAL=排班员手动 IMPORT=外部导入';
comment on column tag_assignment.calc_snapshot   is '计算标签时法规引擎输出快照，如 {"fdp_minutes":745,"segment_count":4}';
comment on column tag_assignment.valid_from      is '标签生效起始时间，null=立即生效';
comment on column tag_assignment.valid_to        is '标签失效时间，null=永久有效';

-- ------------------------------------------------------------
-- tag_opt_filter — 优化引擎过滤集（标签组合缩小求解范围）
-- ------------------------------------------------------------
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

comment on table  tag_opt_filter                 is '优化引擎过滤集，将标签组合为过滤条件缩小PO/RO求解范围';
comment on column tag_opt_filter.usage           is '适用引擎：PO/RO/BOTH';
comment on column tag_opt_filter.filter_logic    is '过滤逻辑JSONB，如 {"include_tags":["domestic"],"exclude_tags":["charter"],"logic":"AND"}';

-- ============================================================
-- 旧标签体系（待废弃，完全替换后删除）
-- 新表：tag_definition / tag_assignment / tag_opt_filter
-- ============================================================

-- ------------------------------------------------------------
-- tag_category — pairing/roster 标签分类定义（旧，待废弃）
-- 用于 Gantt 的查询过滤和颜色高亮
-- ------------------------------------------------------------
create table tag_category (
    id           bigint       generated always as identity primary key,
    created_by   varchar(30)  not null default 'system',
    created_at   timestamptz  not null default now(),
    updated_by   varchar(30)  not null default 'system',
    updated_at   timestamptz  not null default now(),
    code         varchar(50)  not null,  -- 标签分类代码
    name         varchar(50)  not null,  -- 标签分类名称
    ratio        integer      not null default 0,  -- 权重比例（优化引擎使用）
    idx          integer      not null default 0,  -- 显示排序
    source       varchar(10),            -- 来源标识
    except_tag   varchar(100),           -- 排除的标签代码（逗号分隔）
    filiale      varchar(6),             -- 所属航司，null 表示通用
    division     varchar(1),             -- 所属机组类型，null 表示通用
    requestable  smallint,               -- 是否可被 PBS 申请：1=是
    divisions    varchar(5),             -- 适用 division 范围
    is_display   smallint,               -- 是否在 Gantt 显示：1=显示
    color_hex    varchar(6),             -- 显示颜色
    is_warning   smallint                -- 是否触发预警：1=是
);

comment on table  tag_category             is 'pairing/roster 标签分类，用于 Gantt 查询过滤和颜色标注';
comment on column tag_category.ratio       is '权重比例，优化引擎排班时参考';
comment on column tag_category.requestable is '是否允许机组通过 PBS 申请：1=允许';
comment on column tag_category.is_warning  is '命中此标签是否触发预警提示：1=是';

-- ------------------------------------------------------------
-- tag_group — 标签条件分组（树形结构，与 tag_flight/duty/pairing 关联）
-- ------------------------------------------------------------
create table tag_group (
    id               bigint       generated always as identity primary key,
    created_by       varchar(30)  not null default 'system',
    created_at       timestamptz  not null default now(),
    updated_by       varchar(30)  not null default 'system',
    updated_at       timestamptz  not null default now(),
    tag_category_id  bigint       not null,  -- 所属标签分类 id
    table_type       varchar(20),            -- 条件应用的表类型（FLIGHT/DUTY/PAIRING/ROSTER）
    parent_id        bigint       not null default 0,  -- 父节点 id，0 表示根节点
    condition        varchar(5)   not null,  -- 条件逻辑：And / Or
    type             varchar(9)   not null,  -- 节点类型：condition=条件节点 leaf=叶子节点
    level            integer      not null default 0,  -- 树的层级深度
    idx              integer      not null default 0   -- 同层排序序号
);

comment on table  tag_group             is '标签条件分组，树形结构，根节点 parent_id=0';
comment on column tag_group.condition   is '条件逻辑：And=全部满足 Or=任一满足';
comment on column tag_group.table_type  is '适用数据类型：FLIGHT=航班 DUTY=值勤 PAIRING=环 ROSTER=排班';

-- ------------------------------------------------------------
-- tag_flight — 航班标签过滤条件
-- ------------------------------------------------------------
create table tag_flight (
    id             bigint       generated always as identity primary key,
    created_by     varchar(30)  not null default 'system',
    created_at     timestamptz  not null default now(),
    updated_by     varchar(30)  not null default 'system',
    updated_at     timestamptz  not null default now(),
    tag_group_id   bigint       not null,  -- 所属条件分组
    flt_dt_start   timestamptz,            -- 航班日期范围-开始
    flt_dt_end     timestamptz,            -- 航班日期范围-结束
    flt_num        varchar(100),           -- 航班号（支持通配符）
    fleet          varchar(100),           -- 机队（逗号分隔多个）
    dir            varchar(10),            -- 飞行方向
    dep_arp        varchar(3),             -- 出发机场
    arv_arp        varchar(3),             -- 到达机场
    std_start      varchar(5),             -- 计划起飞时间下限（hhmm）
    std_end        varchar(5),             -- 计划起飞时间上限
    sta_start      varchar(5),             -- 计划落地时间下限
    sta_end        varchar(5),             -- 计划落地时间上限
    country        varchar(2),             -- 国家代码
    assignments    varchar(30),            -- 任务类型（逗号分隔）
    sch_blh_start  varchar(20),            -- 计划飞行时间下限
    sch_blh_end    varchar(20),            -- 计划飞行时间上限
    act_blh_start  varchar(20),            -- 实际飞行时间下限
    act_blh_end    varchar(20),            -- 实际飞行时间上限
    flight_type    varchar(20)             -- 航班类型
);

comment on table  tag_flight              is '航班标签过滤条件，与 tag_group 关联';
comment on column tag_flight.flt_num      is '航班号，支持逗号分隔多个或通配符匹配';
comment on column tag_flight.std_start    is '计划起飞时间下限，格式 hhmm，如 0800';

-- ------------------------------------------------------------
-- tag_duty — duty 标签过滤条件
-- ------------------------------------------------------------
create table tag_duty (
    id                      bigint       generated always as identity primary key,
    created_by              varchar(30)  not null default 'system',
    created_at              timestamptz  not null default now(),
    updated_by              varchar(30)  not null default 'system',
    updated_at              timestamptz  not null default now(),
    tag_group_id            bigint       not null,  -- 所属条件分组
    check_in_start          varchar(5),             -- 签到时间下限（hhmm）
    check_in_end            varchar(5),             -- 签到时间上限
    check_out_start         varchar(5),             -- 签出时间下限
    check_out_end           varchar(5),             -- 签出时间上限
    blh_start               varchar(8),             -- 飞行时间下限（分钟）
    blh_end                 varchar(8),             -- 飞行时间上限
    fdp_start               varchar(8),             -- FDP 下限（分钟）
    fdp_end                 varchar(8),             -- FDP 上限
    seg_num                 varchar(20),            -- 航班段数范围（如 1-3）
    duty_seq                integer,                -- 环内 duty 序号
    duty_duration_start     varchar(5),             -- duty 时长下限（分钟）
    duty_duration_end       varchar(5),             -- duty 时长上限
    first_std_start         varchar(20),            -- 首段起飞时间下限
    first_std_end           varchar(20),            -- 首段起飞时间上限
    fdp_touch_start         varchar(20),            -- FDP 触及时间下限
    fdp_touch_end           varchar(20),            -- FDP 触及时间上限
    transit_duration_start  varchar(20),            -- 中转时长下限
    transit_duration_end    varchar(20),            -- 中转时长上限
    transit_airports        varchar(100),           -- 中转机场列表
    duty_days_start         varchar(3),             -- 跨天数下限
    duty_days_end           varchar(3),             -- 跨天数上限
    dp_start                varchar(8),             -- DP 下限
    dp_end                  varchar(8),             -- DP 上限
    overlap_period_start    varchar(8),             -- 重叠时段下限
    overlap_period_end      varchar(8)              -- 重叠时段上限
);

comment on table  tag_duty                 is 'duty 级标签过滤条件';
comment on column tag_duty.fdp_start       is 'FDP（飞行执勤时间）下限，单位分钟';
comment on column tag_duty.transit_airports is '中转机场列表，逗号分隔多个机场代码';

-- ------------------------------------------------------------
-- tag_pairing — 环标签过滤条件
-- ------------------------------------------------------------
create table tag_pairing (
    id                      bigint       generated always as identity primary key,
    created_by              varchar(30)  not null default 'system',
    created_at              timestamptz  not null default now(),
    updated_by              varchar(30)  not null default 'system',
    updated_at              timestamptz  not null default now(),
    tag_group_id            bigint       not null,  -- 所属条件分组
    base                    varchar(20),            -- 基地机场
    pairing_length          varchar(20),            -- 环长度（天数范围）
    avg_blh_low             varchar(10),            -- 平均飞行时间下限
    avg_blh_high            varchar(10),            -- 平均飞行时间上限
    layover                 varchar(100),           -- 过夜机场列表
    assignment_group        varchar(100),           -- 任务分组
    transit_duration_start  varchar(10),            -- 中转时长下限
    transit_duration_end    varchar(10),            -- 中转时长上限
    transit_airports        varchar(10),            -- 中转机场
    over_night_day_start    varchar(10),            -- 过夜天数下限
    over_night_day_end      varchar(10),            -- 过夜天数上限
    pairing_day_start       varchar(20),            -- 环起始日期下限
    pairing_day_end         varchar(20),            -- 环起始日期上限
    layover_duration_start  varchar(20),            -- 过夜时长下限
    layover_duration_end    varchar(20),            -- 过夜时长上限
    layover_country         varchar(200),           -- 过夜国家列表
    avg_block_per_seg_low   varchar(20),            -- 每段平均飞行时间下限
    avg_block_per_seg_high  varchar(20)             -- 每段平均飞行时间上限
);

comment on table  tag_pairing           is '环（pairing）级标签过滤条件';
comment on column tag_pairing.layover   is '过夜机场列表，逗号分隔多个机场代码';

-- ------------------------------------------------------------
-- tag_roster_ground — 地面任务标签过滤条件
-- ------------------------------------------------------------
create table tag_roster_ground (
    id                   bigint       generated always as identity primary key,
    created_by           varchar(30)  not null default 'system',
    created_at           timestamptz  not null default now(),
    updated_by           varchar(30)  not null default 'system',
    updated_at           timestamptz  not null default now(),
    tag_group_id         bigint       not null,  -- 所属条件分组
    str_dt_low           varchar(10),            -- 任务开始时间下限（天偏移量）
    str_dt_high          varchar(10),            -- 任务开始时间上限
    end_dt_low           varchar(10),            -- 任务结束时间下限
    end_dt_high          varchar(10),            -- 任务结束时间上限
    location             varchar(200),           -- 地点（逗号分隔）
    assignment           varchar(200),           -- 任务类型（逗号分隔）
    is_swap              varchar(1),             -- 是否为换班任务：Y/N
    is_request           varchar(1),             -- 是否为申请任务：Y/N
    is_training          varchar(1),             -- 是否为培训任务：Y/N
    training_role        varchar(1),             -- 培训角色：T=教员 S=学员
    duty_period_low      varchar(10),            -- 值勤时长下限
    duty_period_high     varchar(10),            -- 值勤时长上限
    overlap_period_low   varchar(10),            -- 重叠时段下限
    overlap_period_high  varchar(10)             -- 重叠时段上限
);
create index idx_tag_roster_ground_group on tag_roster_ground (tag_group_id);

comment on table  tag_roster_ground              is '地面任务标签过滤条件';
comment on column tag_roster_ground.is_swap      is '是否换班产生的地面任务：Y=是 N=否';
comment on column tag_roster_ground.training_role is '培训角色：T=教员 S=学员';

-- ------------------------------------------------------------
-- tag_flight_composition — 航班编组标签条件
-- ------------------------------------------------------------
create table tag_flight_composition (
    id            bigint       generated always as identity primary key,
    created_by    varchar(30)  not null default 'system',
    created_at    timestamptz  not null default now(),
    updated_by    varchar(30)  not null default 'system',
    updated_at    timestamptz  not null default now(),
    tag_group_id  bigint       not null,  -- 所属条件分组
    division      varchar(5),             -- 机组类型
    acting_rank   varchar(255),           -- 代飞职级（逗号分隔）
    min_value     bigint,                 -- 编组最小人数
    max_value     bigint                  -- 编组最大人数
);

comment on table  tag_flight_composition is '航班编组标签条件，基于编组人数和职级过滤';

-- ============================================================
-- end of ddl
-- ============================================================
