-- =====================================================================
-- 2026-08-10 Pairing.tafb 统一为 PBS 日历日，删除 pbs_calendar_days
-- 依据: docs/superpowers/specs/2026-08-10-pairing-tafb-unify-days-design.md
-- 顺序: SIT 演练 → 远端库预检 → 上线窗口执行。DROP COLUMN 不可逆。
-- 环境: DEV live=f8 / scenario=scenario / pbs=f8_pbs；SIT/UAT 前缀 f8_sit_* / f8_uat_*
-- =====================================================================

begin;

set local lock_timeout = '5s';

-- 0) 预检（执行前手工核对，§Remote-DB-Only 用远端库，把 UPDATE 换成 SELECT 看分布）:
--    SELECT min(tafb), max(tafb),
--           count(*) FILTER (WHERE tafb BETWEEN 1 AND 60) AS likely_days,
--           count(*) FILTER (WHERE tafb > 60) AS still_minutes
--    FROM f8.pairing WHERE is_deleted = 0;
--    若 still_minutes 占比高，说明库中 tafb 仍是分钟口径，先停表人工核对再迁移。

-- 1) live pairing: 以旧 pbs_calendar_days 对齐；无旧值时 tafb 仅在已为天(1..60)时采用，
--    否则按 sch 起止日历日 → duration_days → 1（min 1）。
--    注：tafb 须用 case 限定 1..60，防止历史分钟口径（如 720）被当成 720 天。
update f8.pairing
set tafb = greatest(1, coalesce(
        pbs_calendar_days,
        case when tafb between 1 and 60 then tafb end,
        (sch_end_dt_utc::date - sch_str_dt_utc::date + 1),
        duration_days,
        1
    )),
    updated_by = 'tafb_unify',
    updated_at = now()
where is_deleted = 0;

-- 2) 删除 pbs_calendar_days（不可逆，SIT 演练后执行）
alter table f8.pairing drop column pbs_calendar_days;

comment on column f8.pairing.tafb is
  'PBS 口径日历日：Base 当地时区 Brief（签到开始）至 Debrief（签到结束）覆盖的日历日数，单位天，最小值 1';

-- 3) scenario pairing: 按段重算（UTC 墙钟；scenario 无 airport/base 时区表），兜底 sch 起止 / duration_days / 1
update scenario.pairing p
set tafb = greatest(1, coalesce(
        (select (max(ps.debrief_end_utc)::date - min(ps.brief_start_utc)::date + 1)
         from scenario.pairing_segment ps
         where ps.pairing_id = p.id
           and coalesce(ps.is_deleted, 0) = 0
           and ps.brief_start_utc is not null
           and ps.debrief_end_utc is not null),
        (p.sch_end_dt_utc::date - p.sch_str_dt_utc::date + 1),
        p.duration_days,
        1
    )),
    updated_by = 'tafb_unify',
    updated_at = now()
where p.is_deleted = 0;

comment on column scenario.pairing.tafb is
  'PBS 口径日历日（UTC 墙钟 Brief→Debrief 覆盖日历日数），单位天，最小值 1';

-- 4) roster_publish: tafb_minutes → tafb（来源仍为 pairing.tafb）
alter table f8.roster_publish rename column tafb_minutes to tafb;

comment on column f8.roster_publish.tafb is '发布快照：pairing.tafb（PBS 日历日，单位天）';

-- 5) pbs_bid_property 113 validation_json 改为天数（文档用途；portal 控件由 catalog 类型驱动）
update f8_pbs.pbs_bid_property
set validation_json = '{"type":"int","label":"Days","min":1,"max":14}'::json
where property_code = 113;

-- 6) 删除 hidden AA 属性 138「Maximum TAFB-Credit Ratio」定义与存量 bid
delete from f8_pbs.pbs_bid_group            where property_id = 138;
delete from f8_pbs.pbs_bid_property_context where property_id = (
    select id from f8_pbs.pbs_bid_property where property_code = 138
);
delete from f8_pbs.pbs_bid_property         where property_code = 138;

-- 7) pbs_bid_group 113 存量 HH:MM → 天（分钟粒度折叠为整天桶，预期语义损失）
update f8_pbs.pbs_bid_group
set param_a    = greatest(1, ceil(((split_part(param_a, ':', 1)::int * 60 + split_part(param_a, ':', 2)::int)::numeric) / 1440.0))::text,
    updated_at = now()
where property_id = 113
  and param_a ~ '^[0-9]{1,3}:[0-9]{2}$';

update f8_pbs.pbs_bid_group
set param_b    = greatest(1, ceil(((split_part(param_b, ':', 1)::int * 60 + split_part(param_b, ':', 2)::int)::numeric) / 1440.0))::text,
    updated_at = now()
where property_id = 113
  and param_b ~ '^[0-9]{1,3}:[0-9]{2}$';

commit;
