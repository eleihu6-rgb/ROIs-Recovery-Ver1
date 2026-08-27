-- ============================================================
-- 机组排班系统 — PBS（Preferential Bidding System）数据定义
-- 基于样例数据 crew_bids_reference-2026-03-16-072929.xlsx 设计
-- ============================================================
-- 使用说明：
--   set search_path to CA;
--   \i pbs_pg.sql
-- ============================================================
-- PBS 业务说明：
--   PBS 是机组优先申请排班系统，机组可在每个排班周期开始前
--   按照自己的偏好提交申请，系统根据资历分值和申请优先级
--   自动进行排班分配。
--
-- 核心数据结构：
--   pbs_bid_property  → 申请条件属性定义表（系统配置，45条）
--   pbs_bid           → 机组申请主记录（每周期每机组最多一条）
--   pbs_bid_tier     → 申请层（每个申请分多层，每层是独立的一组偏好）
--   pbs_bid_node      → 申请节点（层内的树形条件，node_id=1为动作行，>1为AND条件）
--   pbs_bid_error     → 解析失败的原始申请记录（对应 Errors sheet）
--   PBS 申请周期配置由 live schema 的 roster_period 承载
--   pbs_award_result  → PBS 自动分配结果
--   pbs_award_item    → PBS 分配结果明细（具体分配的环/休息日）
-- ============================================================

-- ============================================================
-- section 1: 系统配置表
-- ============================================================

-- ------------------------------------------------------------
-- pbs_bid_property — PBS 申请条件属性定义（系统配置数据）
-- 对应 Excel 中的 bid_properties sheet
-- 共 45 条属性，覆盖 Pairing/DaysOff/Reserve/Line 四大类型
-- ------------------------------------------------------------
create table pbs_bid_property (
    id                   bigint       generated always as identity primary key,
    created_by           varchar(30)  not null default 'system',
    created_at           timestamptz  not null default now(),
    updated_by           varchar(30)  not null default 'system',
    updated_at           timestamptz  not null default now(),
    property_code        smallint     not null,  -- 属性编码（101-130=Pairing 201-206=DaysOff 301-302=Reserve 401-407=Line）
    bid_type             varchar(20)  not null,  -- 申请类型：Pairing / DaysOff / Reserve / Line
    property_name        varchar(100) not null,  -- 属性展示名称（新版，对应 remastered_property）
    property_name_legacy varchar(300),  -- 旧版属性描述（对应 legend_property，含换行符）
    award_or_avoid       varchar(50),  -- 支持的操作方向（JSON数组字符串：award/avoid/两者）
    any_or_every         varchar(30),  -- 支持的量词（JSON数组字符串：any/every/两者）
    operator_options     varchar(100),  -- 支持的比较运算符（JSON数组字符串）
    validation_json      varchar(500),  -- 前端输入验证配置（JSON格式，含type/format/label等）
    tooltip              text,  -- 前端提示信息（含实际申请例子）
    notes                varchar(500),  -- 实施备注（开发用）
    is_active            smallint     not null default 1,  -- 是否启用：1=启用 0=禁用
    source_type          varchar(20)  not null default 'legacy',  -- 来源：legacy=旧库 aa=AA文档
    is_visible_in_portal smallint     not null default 1,  -- 兼容历史 seed/migration；运行时目录禁止读取
    display_order        integer,  -- 兼容历史 seed/migration；运行时目录禁止读取
    recommended_order smallint,  -- PBS Portal 推荐排序，null=非推荐
    recommended_usage_count integer  -- 推荐来源报表使用次数
);

create unique index uq_pbs_bid_property_code on pbs_bid_property (property_code);

comment on table  pbs_bid_property                  is 'PBS申请条件属性定义，系统配置数据，共45条';
comment on column pbs_bid_property.property_code    is '属性编码：101-130=Pairing类 201-206=休息日类 301-302=备勤类 401-407=排班线类';
comment on column pbs_bid_property.bid_type         is '申请类型：Pairing=航班偏好 DaysOff=休息日偏好 Reserve=备勤偏好 Line=排班线偏好';
comment on column pbs_bid_property.property_name    is '新版属性名称，前端展示使用，如 Any Landing In Airport';
comment on column pbs_bid_property.award_or_avoid   is '支持的操作方向，JSON数组格式：["award"]或["avoid"]或["award","avoid"]';
comment on column pbs_bid_property.any_or_every     is '量词支持，JSON数组格式：["any"]或["every"]或["any","every"]，null表示不适用';
comment on column pbs_bid_property.operator_options is '支持的比较运算符，JSON数组格式，如["In"]或["<","=",">","Between"]';
comment on column pbs_bid_property.validation_json  is '前端表单验证配置JSON，含type/format/label/multi等字段';
comment on column pbs_bid_property.tooltip          is '前端悬浮提示，通常包含真实申请示例';
comment on column pbs_bid_property.source_type      is '属性来源：legacy=旧库/crew_bids_reference，aa=AA文档';
comment on column pbs_bid_property.is_visible_in_portal is '历史兼容字段；运行时目录不得读取，唯一来源为 pbs_bid_property_context';
comment on column pbs_bid_property.display_order    is '历史兼容字段；运行时目录不得读取，唯一来源为 pbs_bid_property_context';
comment on column pbs_bid_property.recommended_order is 'PBS Portal 推荐排序，空表示非推荐';
comment on column pbs_bid_property.recommended_usage_count is '推荐来源报表中的使用次数';

-- ------------------------------------------------------------
-- pbs_bid_property_context — PBS 条件按申请上下文的 Portal 可见配置
-- ------------------------------------------------------------
create table pbs_bid_property_context (
    id                   bigint       generated always as identity primary key,
    created_by           varchar(30)  not null default 'system',
    created_at           timestamptz  not null default now(),
    updated_by           varchar(30)  not null default 'system',
    updated_at           timestamptz  not null default now(),
    property_id          bigint       not null,
    bid_context          varchar(24)  not null,
    is_visible_in_portal smallint     not null default 0,
    display_order        integer,
    constraint fk_pbs_bid_property_context_property
      foreign key (property_id) references pbs_bid_property(id),
    constraint ck_pbs_bid_property_context
      check (bid_context in ('Current', 'StandingLineholder', 'StandingReserve')),
    constraint ck_pbs_bid_property_context_visible
      check (is_visible_in_portal in (0, 1)),
    constraint uq_pbs_bid_property_context
      unique (property_id, bid_context)
);

create index idx_pbs_bid_property_context_catalog
    on pbs_bid_property_context (bid_context, is_visible_in_portal, display_order, property_id);

comment on table pbs_bid_property_context is 'PBS 条件按 Current/Standing 上下文的 Portal 可见配置，是条件目录显示的唯一数据源';
comment on column pbs_bid_property_context.property_id is '稳定属性定义 id，关联 pbs_bid_property.id';
comment on column pbs_bid_property_context.bid_context is '目录上下文：Current/StandingLineholder/StandingReserve';
comment on column pbs_bid_property_context.is_visible_in_portal is '当前上下文 Portal 展示开关：1=展示 0=隐藏';
comment on column pbs_bid_property_context.display_order is '当前上下文 Portal 展示排序';

-- ============================================================
-- section 2: 机组申请相关表
-- ============================================================

-- ------------------------------------------------------------
-- pbs_bid — 机组申请主记录
-- 每个机组在每个 PBS 周期下、每种申请上下文（Default/Current/Standing）有一条记录
-- Default：机组的默认偏好，每月复用
-- Current：针对当前周期的特定申请（可覆盖 Default）
-- Standing：长期备用偏好，不绑定真实 PBS 周期
-- ------------------------------------------------------------
create table pbs_bid (
    id                   bigint       generated always as identity primary key,
    created_by           varchar(30)  not null default 'system',
    created_at           timestamptz  not null default now(),
    updated_by           varchar(30)  not null default 'system',
    updated_at           timestamptz  not null default now(),
    crew_id              varchar(30)  not null,  -- 机组工号
    period_code          varchar(20)  not null,  -- PBS 周期代码，如 Dec 2025
    roster_period_id     bigint,  -- 关联 live schema roster_period.id；Standing* 长期偏好可为空
    bid_context          varchar(24)  not null,  -- 申请上下文：Default=默认偏好 Current=当期申请 Standing*=长期备用偏好
    submitted_at         timestamptz,  -- 提交时间（null=尚未提交）
    last_modified_at     timestamptz,  -- 最后修改时间
    is_locked            smallint     not null default 0,  -- 是否已锁定（截止后锁定）：1=锁定
    total_tiers         smallint     not null default 0,  -- 实际提交的层数
    status               varchar(20)  not null default 'DRAFT',  -- 状态：DRAFT=草稿 SUBMITTED=已提交 LOCKED=已锁定
    remarks              varchar(500),  -- 申请备注
    draft_version        integer      not null default 0  -- 草稿乐观锁版本，完整保存时校验并递增
);

create unique index uq_pbs_bid on pbs_bid (crew_id, period_code, bid_context);
create index idx_pbs_bid_crew    on pbs_bid (crew_id);
create index idx_pbs_bid_period  on pbs_bid (period_code, bid_context);

comment on table  pbs_bid             is '机组PBS申请主记录，每个机组每周期每种上下文一条';
comment on column pbs_bid.bid_context is '申请上下文：Default=每月复用的默认偏好；Current=当期特定申请；StandingLineholder/StandingReserve=长期备用偏好';
comment on column pbs_bid.draft_version is '草稿乐观锁版本；GET 返回当前版本，完整保存时必须带版本并由服务端递增';
comment on column pbs_bid.is_locked   is '锁定标记：1=申请截止后系统自动锁定，不可再修改';
comment on column pbs_bid.status      is '申请状态：DRAFT=保存草稿 SUBMITTED=已提交待审核 LOCKED=截止已锁定';

-- ------------------------------------------------------------
-- pbs_bid_tier — 申请层
-- 每条 pbs_bid 下分多个层（tier），层数代表优先级顺序（tier=1最优先）
-- 每层是一组独立的偏好设置，可包含多个条件分组（property_group）
-- 申请按层顺序尝试满足：先尝试 tier=1，不满足则尝试 tier=2，以此类推
-- ------------------------------------------------------------
create table pbs_bid_tier (

    id                   bigint       generated always as identity primary key,
    created_by           varchar(30)  not null default 'system',
    created_at           timestamptz  not null default now(),
    updated_by           varchar(30)  not null default 'system',
    updated_at           timestamptz  not null default now(),
    bid_id               bigint       not null,  -- 关联申请主记录 id
    tier                smallint     not null,  -- 层序号（1=最高优先级，数字越大优先级越低，最大24）
    total_groups         smallint     not null default 0,  -- 本层包含的条件分组数
    is_active            smallint     not null default 1   -- 是否启用此层：1=启用 0=跳过
);

create unique index uq_pbs_bid_tier on pbs_bid_tier (bid_id, tier);
create index idx_pbs_bid_tier_bid on pbs_bid_tier (bid_id);

comment on table  pbs_bid_tier         is 'PBS申请层，每层代表一组优先级相同的偏好，层数越小优先级越高';
comment on column pbs_bid_tier.tier   is '层序号，从1开始，1=最高优先级；系统按层从小到大依次尝试满足';
comment on column pbs_bid_tier.is_active is '是否启用：0=跳过此层，用于临时禁用某层申请而不删除';

-- ------------------------------------------------------------
-- pbs_bid_day_off — 日历具体休息日请求
-- 仅承接月历上的具体日期休点选，不承接泛化 Days Off 规则
-- 每条记录表示某个申请层下的一个具体休息日请求
-- ------------------------------------------------------------
create table pbs_bid_day_off (

    id                   bigint       generated always as identity primary key,
    created_by           varchar(30)  not null default 'system',
    created_at           timestamptz  not null default now(),
    updated_by           varchar(30)  not null default 'system',
    updated_at           timestamptz  not null default now(),
    bid_id               bigint       not null,
    tier_id             bigint       not null,
    tier                smallint     not null,
    bid_date             date         not null,
    request_type         varchar(20)  not null default 'DAY_OFF'
);

create unique index uq_pbs_bid_day_off on pbs_bid_day_off (bid_id, tier, bid_date, request_type);
create index idx_pbs_bid_day_off_bid   on pbs_bid_day_off (bid_id);
create index idx_pbs_bid_day_off_tier on pbs_bid_day_off (tier_id);

comment on table  pbs_bid_day_off              is 'PBS月历具体休息日请求明细，仅用于 Lineholder 月历具体日期休';
comment on column pbs_bid_day_off.bid_id       is '关联申请主记录 id';
comment on column pbs_bid_day_off.tier_id     is '关联申请层 id';
comment on column pbs_bid_day_off.tier        is '层序号，冗余存储便于查询';
comment on column pbs_bid_day_off.bid_date     is '具体请求休息的日期';
comment on column pbs_bid_day_off.request_type is '请求类型，第一阶段固定为 DAY_OFF';

-- ------------------------------------------------------------
-- pbs_bid_group — 申请条件分组
-- 每层（tier）内包含多个条件分组（property_group）
-- 每个分组是一个独立的 action+条件链（类似一条完整的申请规则）
-- 分组间是 OR 关系：满足任意一个分组即可
-- property_group_id 对应原始数据中的 property_group_id 字段
-- ------------------------------------------------------------
create table pbs_bid_group (
    id                   bigint       generated always as identity primary key,
    created_by           varchar(30)  not null default 'system',
    created_at           timestamptz  not null default now(),
    updated_by           varchar(30)  not null default 'system',
    updated_at           timestamptz  not null default now(),
    tier_id             bigint       not null,  -- 关联申请层 id
    bid_id               bigint       not null,  -- 冗余存储，便于直接查询
    group_seq            smallint     not null,  -- 分组在层内的序号（对应原始 property_group_id）
    bid_type             varchar(20),  -- 本分组的申请类型（Pairing/DaysOff/Reserve/Line）
    action_id            smallint,  -- 动作：1=Award（争取获得） 2=Avoid（尽量避免）；Pairing 与 Line 427 Reserve 使用
    property_id          smallint     not null,  -- Legacy 主属性编码（关联 pbs_bid_property.property_code）
    operator             varchar(20),  -- 主条件比较运算符（</>=/=/Between/In）
    param_a              varchar(1000),  -- 主条件参数A（值、下界、或逗号分隔列表）
    param_b              varchar(200),  -- 主条件参数B（上界，仅 Between 时使用）
    param_c              varchar(200),  -- 主条件参数C（第三参数，极少使用）
    limit_n              smallint,  -- 限制N：最多分配 N 个满足条件的 pairing
    all_or_nothing       smallint,  -- 全或无标记：1=要么全部满足要么不分配（用于 Prefer Off）
    minimum_n            smallint,  -- 最少 N：至少要满足 N 个（用于 Prefer Off Weekends）
    total_conditions     smallint     not null default 0,  -- 本分组附加的 AND 条件数
    property_group_key   varchar(36)  not null,  -- 跨 tier 共享的分组稳定 key
    property_definition_id bigint     not null,  -- 稳定主属性 id（关联 pbs_bid_property.id）
    preference_json      jsonb  -- 面向算法导出的偏好元数据，如 Pairing credit priority
);

create index idx_pbs_bid_group_tier  on pbs_bid_group (tier_id);
create index idx_pbs_bid_group_bid    on pbs_bid_group (bid_id);
create unique index uq_pbs_bid_group_property_tier on pbs_bid_group (bid_id, bid_type, property_group_key, tier_id);
create index idx_pbs_bid_group_property_key on pbs_bid_group (bid_id, bid_type, property_group_key);
create index idx_pbs_bid_group_property_definition on pbs_bid_group (property_definition_id);

comment on table  pbs_bid_group             is 'PBS申请条件分组，每组是一条完整的规则（action+条件链），组间是OR关系';
comment on column pbs_bid_group.group_seq   is '分组序号，对应原始数据的 property_group_id，同一层内从1开始';
comment on column pbs_bid_group.property_group_key is '跨 tier 共享的分组稳定 key，同一条 UI property 写入多个 tier 时保持一致';
comment on column pbs_bid_group.action_id   is '申请动作：1=Award争取获得 2=Avoid尽量回避；Pairing 使用，Line 427 Reserve 也使用；其他 Line/DaysOff/Reserve 通常为null';
comment on column pbs_bid_group.property_id is 'Legacy 主属性编码，关联 pbs_bid_property.property_code；稳定关系请使用 property_definition_id';
comment on column pbs_bid_group.property_definition_id is '稳定主属性 id，关联 pbs_bid_property.id';
comment on column pbs_bid_group.param_a     is '参数A：单值时为具体值，多值时为逗号分隔列表（如机场：SFO,YYZ），Between时为下界';
comment on column pbs_bid_group.param_b     is '参数B：仅 Between 运算时为上界，其他情况为 null';
comment on column pbs_bid_group.limit_n     is '最多分配N个：如只想要最多2个满足条件的pairing，填2';
comment on column pbs_bid_group.all_or_nothing is '全或无：1=必须全部满足否则不分配，通常用于 Prefer Off 类型申请';
comment on column pbs_bid_group.minimum_n   is '最少满足N个：用于 Prefer Off Weekends，至少需要N个休息日在周末';
comment on column pbs_bid_group.preference_json is '面向算法导出的可选偏好元数据，例如 {"creditPriority":"higher"}';

-- ------------------------------------------------------------
-- pbs_bid_pairing_occurrence — Pairing Number 具体运行日请求
-- 每条记录表示某个 Pairing Number bid 在某个 Tx 下选择的一次 pairing run
-- ------------------------------------------------------------
create table pbs_bid_pairing_occurrence (

    id                   bigint       generated always as identity primary key,
    created_by           varchar(30)  not null default 'system',
    created_at           timestamptz  not null default now(),
    updated_by           varchar(30)  not null default 'system',
    updated_at           timestamptz  not null default now(),
    bid_id               bigint       not null references pbs_bid(id) on delete cascade,
    group_id             bigint       not null references pbs_bid_group(id) on delete cascade,
    property_group_key   varchar(36)  not null,
    tier_id              bigint       not null references pbs_bid_tier(id) on delete cascade,
    tier                 smallint     not null,
    pairing_number       varchar(100) not null,
    origin_date          date         not null,
    pairing_id           varchar(40)  not null,
    occurrence_id        varchar(80),
    source               varchar(20)  not null default 'portal',
    is_deleted           smallint     not null default 0
);

create unique index uq_pbs_bid_pairing_occurrence_active
    on pbs_bid_pairing_occurrence (bid_id, property_group_key, tier, pairing_id, origin_date)
    where is_deleted = 0;
create index idx_pbs_bid_pairing_occurrence_bid
    on pbs_bid_pairing_occurrence (bid_id);
create index idx_pbs_bid_pairing_occurrence_group
    on pbs_bid_pairing_occurrence (group_id);
create index idx_pbs_bid_pairing_occurrence_calendar
    on pbs_bid_pairing_occurrence (bid_id, tier, origin_date)
    where is_deleted = 0;
create index idx_pbs_bid_pairing_occurrence_lookup
    on pbs_bid_pairing_occurrence (bid_id, pairing_id, origin_date)
    where is_deleted = 0;

comment on table pbs_bid_pairing_occurrence is 'PBS Pairing Number specific run 明细';
comment on column pbs_bid_pairing_occurrence.property_group_key is '跨 Tx 共享的 UI property key';
comment on column pbs_bid_pairing_occurrence.pairing_number is '用户选择 pairing 的展示 label，不作为稳定定位键';
comment on column pbs_bid_pairing_occurrence.origin_date is '该 pairing run 的 origin date';
comment on column pbs_bid_pairing_occurrence.pairing_id is 'live pairing.id，Pairing Number bid 的稳定定位键';

-- ------------------------------------------------------------
-- pbs_bid_condition — 申请附加条件（AND 链）
-- 每个 pbs_bid_group 可以附加多个 AND 条件（node_id > 1 的行）
-- 这些条件与主分组条件构成 AND 关系，即必须同时满足
-- 例如：Award Pairings IF Any Landing In YVR AND Check-In Time > 10:00
-- ------------------------------------------------------------
create table pbs_bid_condition (
    id                   bigint       generated always as identity primary key,
    created_by           varchar(30)  not null default 'system',
    created_at           timestamptz  not null default now(),
    updated_by           varchar(30)  not null default 'system',
    updated_at           timestamptz  not null default now(),
    group_id             bigint       not null,  -- 关联条件分组 id
    bid_id               bigint       not null,  -- 冗余存储，便于直接查询
    node_seq             smallint     not null,  -- 节点序号（对应原始 node_id，从2开始）
    and_or_or            varchar(3)   not null default 'AND',  -- 与主条件的逻辑关系，目前只有 AND
    property_id          smallint     not null,  -- Legacy 条件属性编码（关联 pbs_bid_property.property_code）
    operator             varchar(20),  -- 比较运算符
    param_a              varchar(1000),  -- 参数A
    param_b              varchar(200),  -- 参数B（Between 上界）
    param_c              varchar(200),  -- 参数C（极少使用）
    property_definition_id bigint     not null  -- 稳定条件属性 id（关联 pbs_bid_property.id）
);

create index idx_pbs_bid_condition_group on pbs_bid_condition (group_id);
create index idx_pbs_bid_condition_bid   on pbs_bid_condition (bid_id);
create index idx_pbs_bid_condition_property_definition on pbs_bid_condition (property_definition_id);

comment on table  pbs_bid_condition            is 'PBS申请附加条件，与主分组条件构成AND关系，对应原始数据 node_id >= 2 的行';
comment on column pbs_bid_condition.node_seq   is '节点序号，对应原始 node_id，从2开始；同一分组内的条件按此顺序用AND连接';
comment on column pbs_bid_condition.and_or_or  is '逻辑连接符，目前数据中只有AND，预留支持OR的扩展';
comment on column pbs_bid_condition.property_id is 'Legacy 条件属性编码，关联 pbs_bid_property.property_code；稳定关系请使用 property_definition_id';
comment on column pbs_bid_condition.property_definition_id is '稳定条件属性 id，关联 pbs_bid_property.id';
comment on column pbs_bid_condition.param_a    is '条件参数A，多值时为逗号分隔列表';

-- ------------------------------------------------------------
-- pbs_bid_pairing_favorite — Pairing 申请属性收藏
-- 每条记录表示某个当期 bid 收藏了一个 pairing property 定义。
-- property_id 是稳定关系身份，property_code 仅保留为业务编码兼容字段。
-- ------------------------------------------------------------
create table pbs_bid_pairing_favorite (
    id                   bigint       generated always as identity primary key,
    created_by           varchar(30)  not null default 'system',
    created_at           timestamptz  not null default now(),
    updated_by           varchar(30)  not null default 'system',
    updated_at           timestamptz  not null default now(),
    bid_id               bigint       not null,
    property_code        integer      not null,
    property_id          bigint       not null
);

create unique index uq_pbs_bid_pairing_favorite_property_id
    on pbs_bid_pairing_favorite (bid_id, property_id);
create index idx_pbs_bid_pairing_favorite_bid
    on pbs_bid_pairing_favorite (bid_id);
create index idx_pbs_bid_pairing_favorite_property_id
    on pbs_bid_pairing_favorite (property_id);

alter table pbs_bid_pairing_favorite
    add constraint fk_pbs_bid_pairing_favorite_bid
    foreign key (bid_id) references pbs_bid(id);

alter table pbs_bid_pairing_favorite
    add constraint fk_pbs_bid_pairing_favorite_property
    foreign key (property_id) references pbs_bid_property(id);

comment on table pbs_bid_pairing_favorite is 'PBS Pairing property 收藏表，用稳定 property_id 记录收藏关系';
comment on column pbs_bid_pairing_favorite.property_id is '稳定属性定义 id，关联 pbs_bid_property.id';
comment on column pbs_bid_pairing_favorite.property_code is 'Legacy 属性业务编码，保留用于展示和兼容；唯一关系请使用 property_id';

-- ------------------------------------------------------------
-- pbs_bid_error — 申请解析错误记录（对应 Errors sheet）
-- 存储因格式错误无法正常解析的原始申请数据
-- 便于人工核查和重新解析
-- ------------------------------------------------------------
create table pbs_bid_error (

    id                   bigint       generated always as identity primary key,
    created_by           varchar(30)  not null default 'system',
    created_at           timestamptz  not null default now(),
    updated_by           varchar(30)  not null default 'system',
    updated_at           timestamptz  not null default now(),
    crew_id              varchar(30)  not null,  -- 机组工号
    bid_context          varchar(10)  not null,  -- 申请上下文（Default/Current）
    tier                smallint,               -- 出错的层序号
    raw_bid              text,                   -- 原始申请文本（解析前的原始内容）
    error_message        varchar(500),           -- 解析错误信息
    resolved             smallint     not null default 0, -- 是否已处理：1=已修复 0=待处理
    resolved_at          timestamptz,            -- 处理时间
    resolved_by          varchar(30)             -- 处理人
);

create index idx_pbs_bid_error_crew   on pbs_bid_error (crew_id);
create index idx_pbs_bid_error_status on pbs_bid_error (resolved);

comment on table  pbs_bid_error          is 'PBS申请解析失败记录，存储无法正常解析的原始申请，对应Errors sheet';
comment on column pbs_bid_error.raw_bid  is '原始申请文本，保留完整的未解析内容，便于人工排查和重新解析';
comment on column pbs_bid_error.resolved is '处理状态：0=待处理 1=已修复重新解析 2=已标记忽略';

-- ============================================================
-- section 3: PBS 分配结果表
-- ============================================================

-- ------------------------------------------------------------
-- pbs_award_result — PBS 自动分配主结果记录
-- 系统运行分配算法后，每个机组在每个 PBS 周期生成一条结果记录
-- ------------------------------------------------------------
create table pbs_award_result (

    id                   bigint       generated always as identity primary key,
    created_by           varchar(30)  not null default 'system',
    created_at           timestamptz  not null default now(),
    updated_by           varchar(30)  not null default 'system',
    updated_at           timestamptz  not null default now(),
    roster_period_id     bigint       not null,  -- 关联 live schema roster_period.id
    period_code          varchar(20)  not null,  -- 冗余存储周期代码，便于查询
    crew_id              varchar(30)  not null,  -- 机组工号
    bid_id               bigint,                 -- 关联申请主记录 id（如未提交申请则为 null）
    seniority_rank       integer,                -- 分配时的资历排名
    awarded_tier        smallint,               -- 最终满足的申请层（成功从第几层开始分配）
    total_pairings       smallint     not null default 0, -- 分配到的 pairing 总数
    total_days_off       smallint     not null default 0, -- 分配到的休息日总数
    satisfaction_score   numeric(5,2),           -- 申请满意度评分（0-100，越高越满意）
    run_at               timestamptz  not null,  -- 分配算法运行时间
    published_at         timestamptz,            -- 结果发布给机组的时间
    status               varchar(20)  not null default 'PENDING', -- 状态：PENDING=待分配 DONE=已分配 PUBLISHED=已发布
    remarks              varchar(500)            -- 备注（如特殊处理原因）
);

create unique index uq_pbs_award_result on pbs_award_result (roster_period_id, crew_id);
create index idx_pbs_award_crew        on pbs_award_result (crew_id);
create index idx_pbs_award_period      on pbs_award_result (period_code);

comment on table  pbs_award_result                 is 'PBS自动分配结果主记录，每个机组每周期一条';
comment on column pbs_award_result.seniority_rank  is '分配时的资历排名，排名越靠前越先得到偏好满足的分配';
comment on column pbs_award_result.awarded_tier   is '最终从第几层开始满足，1=完全按最高优先级分配，数字越大说明优先偏好越少被满足';
comment on column pbs_award_result.satisfaction_score is '满意度评分0-100，衡量实际分配与申请偏好的匹配程度';

-- ------------------------------------------------------------
-- pbs_award_item — PBS 分配结果明细
-- 记录每个机组具体被分配了哪些 pairing 或休息日
-- ------------------------------------------------------------
create table pbs_award_item (
    id                   bigint       generated always as identity primary key,
    created_by           varchar(30)  not null default 'system',
    created_at           timestamptz  not null default now(),
    updated_by           varchar(30)  not null default 'system',
    updated_at           timestamptz  not null default now(),
    award_result_id      bigint       not null,  -- 关联分配结果主记录 id
    crew_id              varchar(30)  not null,  -- 冗余存储机组工号，便于查询
    item_type            varchar(20)  not null,  -- 分配类型：PAIRING=环 DAY_OFF=休息日 RESERVE=备勤 LINE=排班线
    pairing_id           bigint,  -- 分配的环 id（item_type=PAIRING时有值）
    date_off             date,  -- 分配的休息日（item_type=DAY_OFF时有值）
    matched_tier        smallint,  -- 此项分配匹配的申请层序号
    matched_group_seq    smallint,  -- 匹配的条件分组序号
    is_awarded           smallint     not null default 1,  -- 是否成功分配：1=已分配 0=申请了但未满足
    rejection_reason     varchar(200),  -- 未分配原因（is_awarded=0时记录）
    matched_group_id     bigint,  -- 稳定匹配分组 id，关联 pbs_bid_group.id
    matched_property_group_key varchar(36)  -- 稳定匹配 property key，关联 pbs_bid_group.property_group_key
);

create index idx_pbs_award_item_result on pbs_award_item (award_result_id);
create index idx_pbs_award_item_crew   on pbs_award_item (crew_id);
create index idx_pbs_award_item_pair   on pbs_award_item (pairing_id) where pairing_id is not null;
create index idx_pbs_award_item_matched_group on pbs_award_item (matched_group_id) where matched_group_id is not null;
create index idx_pbs_award_item_matched_property_key on pbs_award_item (award_result_id, matched_property_group_key) where matched_property_group_key is not null;

alter table pbs_award_item
    add constraint fk_pbs_award_item_result
    foreign key (award_result_id) references pbs_award_result(id) on delete cascade;

alter table pbs_award_item
    add constraint fk_pbs_award_item_matched_group
    foreign key (matched_group_id) references pbs_bid_group(id) on delete set null;

comment on table  pbs_award_item                    is 'PBS分配结果明细，记录每个机组具体分配到的pairing或休息日';
comment on column pbs_award_item.item_type          is '分配类型：PAIRING=飞行环 DAY_OFF=休息日 RESERVE=备勤值班 LINE=整条排班线';
comment on column pbs_award_item.matched_tier      is '匹配到的申请层，对应 pbs_bid_tier.tier';
comment on column pbs_award_item.matched_group_seq  is 'Legacy 匹配条件分组序号，对应 pbs_bid_group.group_seq；稳定追溯请使用 matched_group_id / matched_property_group_key';
comment on column pbs_award_item.matched_group_id   is '稳定匹配条件分组 id，关联 pbs_bid_group.id；bid 顺序调整不影响追溯';
comment on column pbs_award_item.matched_property_group_key is '稳定匹配 property key，关联 pbs_bid_group.property_group_key；用于跨 tier 的 UI property 追溯';
comment on column pbs_award_item.is_awarded         is '1=成功按申请分配；0=申请了但因冲突/无法满足未分配';

-- ============================================================
-- section 4: PBS 安全与访问控制
-- ============================================================

-- ------------------------------------------------------------
-- pbs_user — PBS 用户投影表（共享 users 字段 + PBS 安全扩展）
-- 共享字段尽量与 users 表保持同名，PBS 特有登录安全状态单独保留
-- 安全要求：密码前端 RSA 加密传输，后端 bcrypt 存储哈希
-- ------------------------------------------------------------
create table pbs_user (
    id                   bigint       generated always as identity primary key,
    created_by           varchar(30)  not null default 'system',
    created_at           timestamptz  not null default now(),
    updated_by           varchar(30)  not null default 'system',
    updated_at           timestamptz  not null default now(),
    crew_id              varchar(30)  not null,  -- 关联机组工号
    user_code            varchar(30)  not null,  -- 登录账号，和 users.user_code 对齐
    password_hash        varchar(200) not null,  -- bcrypt 哈希密码（前端RSA加密传输，后端解密后哈希存储）
    email                varchar(100),  -- 邮箱（用于密码重置）
    tel                  varchar(40),  -- 联系电话
    is_first_login       varchar(10),  -- 首次登录标记：Y=首次登录
    last_login_at        timestamptz,  -- 最后登录时间
    last_login_ip        varchar(45),  -- 最后登录 IP（支持 IPv6）
    failed_login_count   smallint     not null default 0,  -- 连续登录失败次数（超限自动锁定）
    locked_until         timestamptz,  -- 账号锁定截止时间（失败次数过多后）
    password_changed_at  timestamptz,  -- 最后一次修改密码时间
    token_version        integer      not null default 0,  -- JWT token 版本号（修改密码/强制下线时递增）
    user_name            varchar(100) not null,  -- 显示姓名，和 users.user_name 对齐
    branch_code          varchar(40)  not null,  -- 所属部门/机构，和 users.branch_code 对齐
    py_abbr              varchar(30)  not null,  -- 拼音缩写，和 users.py_abbr 对齐
    gender               varchar(1),  -- 性别
    eff_dt               timestamptz  not null,  -- 生效时间
    exp_dt               timestamptz,  -- 失效时间
    ad_active            smallint     not null default 0,  -- AD 状态
    status               smallint     not null default 0,  -- 账号状态：0=正常 1=禁用 2=锁定
    is_admin             smallint     not null default 0,  -- 管理员标记
    interface_user_id    varchar(50),  -- 外部接口用户 id
    password_access      varchar(1),  -- 是否允许密码登录
    portal_access        varchar(1),  -- 是否允许门户访问
    app_access           varchar(1),  -- 是否允许 app 访问
    division             varchar(1)  -- 机组类型：P=飞行员 C=客舱乘务员 A=空中安全员，从 crew 表同步写入
);

create unique index uq_pbs_user_crew     on pbs_user (crew_id);
create unique index uq_pbs_user_code     on pbs_user (user_code);
create index idx_pbs_user_division      on pbs_user (division);

comment on table  pbs_user                    is 'PBS 用户投影表：共享 users 表主要字段命名，并保留 PBS 独有安全状态字段';
comment on column pbs_user.password_hash      is 'bcrypt哈希密码；前端使用RSA公钥加密后传输，后端解密再哈希存储';
comment on column pbs_user.is_first_login     is '首次登录标记：Y=需要强制修改密码后才能使用系统';
comment on column pbs_user.failed_login_count is '连续登录失败次数，超过阈值（如5次）自动锁定账号';
comment on column pbs_user.token_version      is 'JWT版本号，修改密码或强制下线时递增，使旧token失效';
comment on column pbs_user.division           is '机组类型：P=飞行员（Pilot）C=客舱乘务员（Cabin）A=空中安全员（Airmarshal），从 crew 表同步写入，供 PBS 界面按机组类型筛选';

-- ------------------------------------------------------------
-- pbs_login_log — PBS 登录审计日志
-- 记录所有登录行为，用于安全审计和异常检测
-- ------------------------------------------------------------
create table pbs_login_log (

    id                   bigint       generated always as identity primary key,
    created_by           varchar(30)  not null default 'system',
    created_at           timestamptz  not null default now(),
    updated_by           varchar(30)  not null default 'system',
    updated_at           timestamptz  not null default now(),
    pbs_user_id          bigint,                 -- 关联 PBS 用户 id（登录失败时也可能为 null）
    crew_id              varchar(30),            -- 机组工号（冗余）
    username             varchar(50)  not null,  -- 尝试登录的用户名
    ip_address           varchar(45)  not null,  -- 登录 IP（支持 IPv6）
    user_agent           varchar(500),           -- 客户端浏览器/app 标识
    login_result         varchar(20)  not null,  -- 登录结果：SUCCESS/FAILED/LOCKED/EXPIRED
    failure_reason       varchar(100),           -- 失败原因（login_result=FAILED时记录）
    session_id           varchar(100),           -- 会话 id（成功登录后生成）
    login_at             timestamptz  not null default now()  -- 登录时间
);

create index idx_pbs_login_log_user    on pbs_login_log (pbs_user_id);
create index idx_pbs_login_log_crew    on pbs_login_log (crew_id);
create index idx_pbs_login_log_time    on pbs_login_log (login_at);
create index idx_pbs_login_log_result  on pbs_login_log (login_result);

comment on table  pbs_login_log                is 'PBS登录审计日志，记录所有登录尝试，用于安全审计和异常检测';
comment on column pbs_login_log.login_result   is '登录结果：SUCCESS=成功 FAILED=密码错误 LOCKED=账号已锁定 EXPIRED=密码已过期';
comment on column pbs_login_log.session_id     is '成功登录后生成的会话标识，用于关联后续操作日志';

-- ------------------------------------------------------------
-- pbs_operation_log — PBS 申请操作日志
-- 记录机组对申请的所有修改操作，用于审计和纠纷处理
-- ------------------------------------------------------------
create table pbs_operation_log (

    id                   bigint       generated always as identity primary key,
    created_by           varchar(30)  not null default 'system',
    created_at           timestamptz  not null default now(),
    updated_by           varchar(30)  not null default 'system',
    updated_at           timestamptz  not null default now(),
    pbs_user_id          bigint       not null,  -- 操作用户 id
    crew_id              varchar(30)  not null,  -- 机组工号
    bid_id               bigint,                 -- 关联申请 id
    operation            varchar(30)  not null,  -- 操作类型（SUBMIT/MODIFY/DELETE/LOCK 等）
    target_type          varchar(30),            -- 操作对象类型（BID/TIER/GROUP/CONDITION）
    target_id            bigint,                 -- 操作对象 id
    old_value            text,                   -- 修改前的值（JSON格式）
    new_value            text,                   -- 修改后的值（JSON格式）
    ip_address           varchar(45),            -- 操作来源 IP
    operated_at          timestamptz  not null default now()  -- 操作时间
);

create index idx_pbs_op_log_user    on pbs_operation_log (pbs_user_id);
create index idx_pbs_op_log_crew    on pbs_operation_log (crew_id);
create index idx_pbs_op_log_bid     on pbs_operation_log (bid_id);
create index idx_pbs_op_log_time    on pbs_operation_log (operated_at);

comment on table  pbs_operation_log            is 'PBS申请操作审计日志，记录所有申请修改行为，用于纠纷处理和操作追溯';
comment on column pbs_operation_log.operation  is '操作类型：SUBMIT=提交 MODIFY=修改 DELETE=删除 WITHDRAW=撤回 LOCK=锁定';
comment on column pbs_operation_log.old_value  is '修改前的数据快照，JSON格式，便于还原历史状态';
comment on column pbs_operation_log.new_value  is '修改后的数据，JSON格式';

-- ============================================================
-- section 5: PBS 收藏表
-- ============================================================

-- ------------------------------------------------------------
-- pbs_bid_property_favorite — 通用 PBS property 收藏表
-- 用于 DaysOff / Reserve 等非 Pairing bid type 的稳定收藏关系
-- ------------------------------------------------------------
create table pbs_bid_property_favorite (

    id              bigint generated always as identity primary key,
    created_by      varchar(30)  not null default 'system',
    created_at      timestamptz  not null default now(),
    updated_by      varchar(30)  not null default 'system',
    updated_at      timestamptz  not null default now(),
    bid_id          bigint       not null,
    bid_type        varchar(20)  not null,
    property_id     bigint       not null,
    property_code   integer      not null
);

create unique index uq_pbs_bid_property_favorite_bid_type_property
    on pbs_bid_property_favorite (bid_id, bid_type, property_id);
create index idx_pbs_bid_property_favorite_bid
    on pbs_bid_property_favorite (bid_id);
create index idx_pbs_bid_property_favorite_property_id
    on pbs_bid_property_favorite (property_id);

alter table pbs_bid_property_favorite
    add constraint fk_pbs_bid_property_favorite_bid
    foreign key (bid_id) references pbs_bid(id) on delete cascade;

alter table pbs_bid_property_favorite
    add constraint fk_pbs_bid_property_favorite_property
    foreign key (property_id) references pbs_bid_property(id);

comment on table pbs_bid_property_favorite is 'PBS 通用 property 收藏表，用稳定 property_id 记录非 Pairing bid type 的收藏关系';
comment on column pbs_bid_property_favorite.bid_type is '收藏所属 bid type，例如 DaysOff';
comment on column pbs_bid_property_favorite.property_id is '稳定属性定义 id，关联 pbs_bid_property.id';
comment on column pbs_bid_property_favorite.property_code is 'Legacy 属性业务编码，保留用于展示和兼容；唯一关系请使用 property_id';

-- ------------------------------------------------------------
-- pbs_bid_pairing_configured_favorite — Pairing 已配置 bid 收藏表
-- 保存完整配置快照
-- ------------------------------------------------------------
create table pbs_bid_pairing_configured_favorite (

    id              bigint generated always as identity primary key,
    created_by      varchar(30) not null default 'system',
    created_at      timestamptz not null default now(),
    updated_by      varchar(30) not null default 'system',
    updated_at      timestamptz not null default now(),
    bid_id          bigint not null references pbs_bid(id) on delete cascade,
    property_id     bigint not null references pbs_bid_property(id),
    property_code   integer not null,
    favorite_name   varchar(120),
    action          varchar(20),
    quantifier      varchar(20),
    bid_payload     jsonb not null default '{}'::jsonb
);

create index idx_pbs_bid_pairing_configured_favorite_bid
    on pbs_bid_pairing_configured_favorite (bid_id);
create index idx_pbs_bid_pairing_configured_favorite_bid_property
    on pbs_bid_pairing_configured_favorite (bid_id, property_id);

comment on table pbs_bid_pairing_configured_favorite is 'PBS Pairing 已配置 bid 收藏表；保存完整配置快照';
comment on column pbs_bid_pairing_configured_favorite.favorite_name is '可选收藏展示名';
comment on column pbs_bid_pairing_configured_favorite.action is '已配置 Pairing bid 的 Award/Avoid 动作';
comment on column pbs_bid_pairing_configured_favorite.quantifier is '已配置 Pairing bid 的 Any/Every 量词';
comment on column pbs_bid_pairing_configured_favorite.bid_payload is '已配置 Pairing bid 的 JSON 快照';

-- ------------------------------------------------------------
-- pbs_bid_days_off_favorite — Days Off 已配置 bid 收藏表
-- 保存完整配置快照
-- ------------------------------------------------------------
create table pbs_bid_days_off_favorite (

    id              bigint generated always as identity primary key,
    created_by      varchar(30) not null default 'system',
    created_at      timestamptz not null default now(),
    updated_by      varchar(30) not null default 'system',
    updated_at      timestamptz not null default now(),
    bid_id          bigint not null references pbs_bid(id) on delete cascade,
    property_id     bigint not null references pbs_bid_property(id),
    property_code   integer not null,
    favorite_name   varchar(120),
    action          varchar(20),
    bid_payload     jsonb not null default '{}'::jsonb,
    all_or_nothing  smallint not null default 0,
    minimum_n       smallint,
    maximum_n       smallint
);

create index idx_pbs_bid_days_off_favorite_bid
    on pbs_bid_days_off_favorite (bid_id);
create index idx_pbs_bid_days_off_favorite_bid_property
    on pbs_bid_days_off_favorite (bid_id, property_id);

comment on table pbs_bid_days_off_favorite is 'PBS Days Off 已配置 bid 收藏表；保存完整配置快照';
comment on column pbs_bid_days_off_favorite.favorite_name is '可选收藏展示名';
comment on column pbs_bid_days_off_favorite.action is 'Days Off 已配置 bid 的动作快照；Long Stretch Off / Compressed Flying 当前为 award-only，仅保留 award 兼容值';
comment on column pbs_bid_days_off_favorite.bid_payload is '已配置收藏 bid 的 JSON 快照';
comment on column pbs_bid_days_off_favorite.all_or_nothing is '已配置收藏 bid 的 All or Nothing 标记，1=true';
comment on column pbs_bid_days_off_favorite.minimum_n is '已配置收藏 bid 的 Minimum N 值，空表示未设置';
comment on column pbs_bid_days_off_favorite.maximum_n is '已配置收藏 bid 的 Maximum N 值，空表示未设置';

-- ------------------------------------------------------------
-- pbs_bid_line_favorite — Line 已配置 bid 收藏表
-- 保存完整配置快照，用于 Forget Line / Min Base Layover / Commuter Pattern 等
-- ------------------------------------------------------------
create table pbs_bid_line_favorite (
    id              bigint generated always as identity primary key,
    created_by      varchar(30) not null default 'system',
    created_at      timestamptz not null default now(),
    updated_by      varchar(30) not null default 'system',
    updated_at      timestamptz not null default now(),
    bid_id          bigint not null references pbs_bid(id) on delete cascade,
    property_id     bigint not null references pbs_bid_property(id),
    property_code   integer not null,
    favorite_name   varchar(120),
    bid_payload     jsonb not null default '{}'::jsonb,
    action          varchar(20)
);

create index idx_pbs_bid_line_favorite_bid
    on pbs_bid_line_favorite (bid_id);
create index idx_pbs_bid_line_favorite_bid_property
    on pbs_bid_line_favorite (bid_id, property_id);

comment on table pbs_bid_line_favorite is 'PBS Line 已配置 bid 收藏表；保存完整配置快照';
comment on column pbs_bid_line_favorite.favorite_name is '可选收藏展示名';
comment on column pbs_bid_line_favorite.action is 'Line 配置收藏的动作：award=Only Reserve，avoid=No Reserve；仅 427 Reserve 等需要动作的 Line 条件使用';
comment on column pbs_bid_line_favorite.bid_payload is '已配置 Line bid 的 JSON 快照';

-- ============================================================
-- end of pbs ddl
-- ============================================================
