alter table roster_publish
  add column if not exists fleet_seg varchar(10);

comment on column roster_publish.sch_credited_minutes is
  '发布快照计划信用积分，优先来自 roster_flight.sch_credited_minutes，回退 pairing_segment.duty_sch_credited_minutes / duty_act_credited_minutes，PBS 禁止运行时 join live 原表';

comment on column roster_publish.act_credited_minutes is
  '发布快照实际信用积分，优先来自 roster_flight.act_credited_minutes，回退 pairing_segment.duty_act_credited_minutes，PBS 禁止运行时 join live 原表';

comment on column roster_publish.fleet_seg is
  '发布快照航段机型代码，来自 pairing_segment.fleet_seg，PBS 禁止运行时 join pairing_segment';

do $$
begin
  if exists (
    select 1
    from roster_publish rp
    join pairing_segment ps
      on ps.pairing_id = rp.pairing_id
     and ps.duty_seq = rp.duty_seq
     and ps.seg_seq = rp.seg_seq
     and coalesce(ps.is_deleted, 0) = 0
     and (ps.scenario_id is null or ps.scenario_id = 0)
    where rp.pairing_id is not null
      and (
        rp.fleet_seg is null
        or rp.act_credited_minutes is null
        or rp.sch_credited_minutes is null
      )
    group by rp.id
    having count(*) > 1
  ) then
    raise exception
      'roster_publish Credit/Fleet backfill found duplicate active pairing_segment matches';
  end if;
end
$$;

update roster_publish rp
set
  fleet_seg = coalesce(rp.fleet_seg, ps.fleet_seg),
  act_credited_minutes = coalesce(
    rp.act_credited_minutes,
    ps.duty_act_credited_minutes
  ),
  sch_credited_minutes = coalesce(
    rp.sch_credited_minutes,
    ps.duty_sch_credited_minutes,
    ps.duty_act_credited_minutes
  ),
  updated_at = case
    when rp.fleet_seg is distinct from coalesce(rp.fleet_seg, ps.fleet_seg)
      or rp.act_credited_minutes is distinct from coalesce(
        rp.act_credited_minutes,
        ps.duty_act_credited_minutes
      )
      or rp.sch_credited_minutes is distinct from coalesce(
        rp.sch_credited_minutes,
        ps.duty_sch_credited_minutes,
        ps.duty_act_credited_minutes
      )
    then now()
    else rp.updated_at
  end,
  updated_by = case
    when rp.fleet_seg is distinct from coalesce(rp.fleet_seg, ps.fleet_seg)
      or rp.act_credited_minutes is distinct from coalesce(
        rp.act_credited_minutes,
        ps.duty_act_credited_minutes
      )
      or rp.sch_credited_minutes is distinct from coalesce(
        rp.sch_credited_minutes,
        ps.duty_sch_credited_minutes,
        ps.duty_act_credited_minutes
      )
    then 'award_snapshot_backfill'
    else rp.updated_by
  end
from pairing_segment ps
where ps.pairing_id = rp.pairing_id
  and ps.duty_seq = rp.duty_seq
  and ps.seg_seq = rp.seg_seq
  and coalesce(ps.is_deleted, 0) = 0
  and (ps.scenario_id is null or ps.scenario_id = 0)
  and (
    (rp.fleet_seg is null and ps.fleet_seg is not null)
    or (
      rp.act_credited_minutes is null
      and ps.duty_act_credited_minutes is not null
    )
    or (
      rp.sch_credited_minutes is null
      and coalesce(
        ps.duty_sch_credited_minutes,
        ps.duty_act_credited_minutes
      ) is not null
    )
  );
