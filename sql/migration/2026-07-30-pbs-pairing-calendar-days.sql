-- 2026-07-30
-- 保留上游 pairing.duration_days，新增 PBS 专用日历日口径。
-- 计算范围：Pairing Base 当地时区下，最早 Brief 到最晚 Debrief 覆盖的日历日数。

alter table pairing
  add column if not exists pbs_calendar_days smallint;

comment on column pairing.pbs_calendar_days is
  'PBS Pairing Length 口径：Base 当地时区最早 Brief 至最晚 Debrief 覆盖的日历日数；缺少时间或合法 Base 时区时为 NULL';

with calculated as (
  select
    p.id,
    case
      when base_zone.name is null
        or segment_bounds.brief_start_utc is null
        or segment_bounds.debrief_end_utc is null
      then null
      when (
        (segment_bounds.debrief_end_utc at time zone base_zone.name)::date
        - (segment_bounds.brief_start_utc at time zone base_zone.name)::date
        + 1
      ) < 1
      then null
      else (
        (segment_bounds.debrief_end_utc at time zone base_zone.name)::date
        - (segment_bounds.brief_start_utc at time zone base_zone.name)::date
        + 1
      )::smallint
    end as pbs_calendar_days
  from pairing p
  left join lateral (
    select valid_timezone.name
    from airport base_airport
    join pg_timezone_names valid_timezone
      on valid_timezone.name = nullif(btrim(base_airport.zone_id), '')
    where upper(btrim(base_airport.airport)) = upper(btrim(p.base))
    order by base_airport.id
    limit 1
  ) base_zone on true
  left join lateral (
    select
      min(ps.brief_start_utc) as brief_start_utc,
      max(ps.debrief_end_utc) as debrief_end_utc
    from pairing_segment ps
    where ps.pairing_id = p.id
      and coalesce(ps.is_deleted, 0) = 0
  ) segment_bounds on true
  where upper(btrim(p.assignment_group)) = 'FLY'
)
update pairing p
set
  pbs_calendar_days = calculated.pbs_calendar_days,
  updated_at = case
    when p.pbs_calendar_days is distinct from calculated.pbs_calendar_days then now()
    else p.updated_at
  end,
  updated_by = case
    when p.pbs_calendar_days is distinct from calculated.pbs_calendar_days then 'pbs_calendar_backfill'
    else p.updated_by
  end
from calculated
where calculated.id = p.id
  and p.pbs_calendar_days is distinct from calculated.pbs_calendar_days;
