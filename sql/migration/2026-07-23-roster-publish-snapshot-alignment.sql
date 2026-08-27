-- Align roster_publish as a published snapshot of roster_flight plus pairing_segment windows.
-- PBS Award Results must read published task details from roster_publish only.

alter table roster_publish
  add column if not exists roster_flight_id bigint,
  add column if not exists ver integer not null default 1,
  add column if not exists base varchar(3),
  add column if not exists source varchar(12),
  add column if not exists is_requested smallint not null default 0,
  add column if not exists is_deleted smallint not null default 0,
  add column if not exists is_swapped smallint not null default 0,
  add column if not exists preference varchar(1),
  add column if not exists comments varchar(180),
  add column if not exists score integer,
  add column if not exists working_hour numeric(8,2),
  add column if not exists sch_credited_minutes numeric(8,2),
  add column if not exists sch_fm_credited_minutes numeric(8,2),
  add column if not exists sch_per_diem_mins numeric(8,2),
  add column if not exists sch_lh_per_diem_mins numeric(8,2),
  add column if not exists sch_fm_per_diem_mins numeric(8,2),
  add column if not exists sch_fm_lh_per_diem_mins numeric(8,2),
  add column if not exists act_credited_minutes numeric(8,2),
  add column if not exists act_fm_credited_minutes numeric(8,2),
  add column if not exists act_per_diem_mins numeric(8,2),
  add column if not exists act_lh_per_diem_mins numeric(8,2),
  add column if not exists act_fm_per_diem_mins numeric(8,2),
  add column if not exists act_fm_lh_per_diem_mins numeric(8,2),
  add column if not exists duty_seq smallint,
  add column if not exists seg_seq smallint,
  add column if not exists flight_acting_rank varchar(10),
  add column if not exists roster_acting_rank varchar(10),
  add column if not exists act_str_dt_utc timestamptz,
  add column if not exists act_end_dt_utc timestamptz,
  add column if not exists tag_set varchar(50),
  add column if not exists is_extra_course smallint not null default 0,
  add column if not exists seq_order_source varchar(20),
  add column if not exists exception_code varchar(50),
  add column if not exists act_rest_min integer,
  add column if not exists pairing_label varchar(50),
  add column if not exists pairing_base varchar(3),
  add column if not exists pairing_fleet varchar(20),
  add column if not exists tafb_minutes integer;

update roster_publish
set
  roster_flight_id = coalesce(roster_flight_id, roster_id),
  duty_seq = coalesce(duty_seq, nullif(duty_id, 0)::smallint),
  flight_acting_rank = coalesce(flight_acting_rank, acting_rank),
  roster_acting_rank = coalesce(roster_acting_rank, left(roster_rank, 10))
where roster_flight_id is null
   or duty_seq is null
   or flight_acting_rank is null
   or roster_acting_rank is null;

update roster_publish rp
set
  roster_flight_id = coalesce(rp.roster_flight_id, rf.id),
  roster_id = coalesce(rp.roster_id, rf.id),
  ver = rf.ver,
  base = rf.base,
  source = rf.source,
  is_requested = rf.is_requested,
  is_deleted = rf.is_deleted,
  is_swapped = rf.is_swapped,
  preference = rf.preference,
  comments = rf.comments,
  score = rf.score,
  working_hour = rf.working_hour,
  sch_credited_minutes = rf.sch_credited_minutes,
  sch_fm_credited_minutes = rf.sch_fm_credited_minutes,
  sch_per_diem_mins = rf.sch_per_diem_mins,
  sch_lh_per_diem_mins = rf.sch_lh_per_diem_mins,
  sch_fm_per_diem_mins = rf.sch_fm_per_diem_mins,
  sch_fm_lh_per_diem_mins = rf.sch_fm_lh_per_diem_mins,
  act_credited_minutes = rf.act_credited_minutes,
  act_fm_credited_minutes = rf.act_fm_credited_minutes,
  act_per_diem_mins = rf.act_per_diem_mins,
  act_lh_per_diem_mins = rf.act_lh_per_diem_mins,
  act_fm_per_diem_mins = rf.act_fm_per_diem_mins,
  act_fm_lh_per_diem_mins = rf.act_fm_lh_per_diem_mins,
  duty_seq = rf.duty_seq,
  seg_seq = rf.seg_seq,
  act_str_dt_utc = rf.act_str_dt_utc,
  act_end_dt_utc = rf.act_end_dt_utc,
  flight_acting_rank = rf.flight_acting_rank,
  roster_acting_rank = rf.roster_acting_rank,
  tag_set = rf.tag_set,
  is_extra_course = rf.is_extra_course,
  seq_order_source = rf.seq_order_source,
  exception_code = rf.exception_code,
  act_rest_min = rf.act_rest_min,
  dep_arp = coalesce(rp.dep_arp, rf.dep_arp, ps.dep_arp),
  arv_arp = coalesce(rp.arv_arp, rf.arv_arp, ps.arv_arp),
  pick_up_start_utc = coalesce(rp.pick_up_start_utc, ps.pickup_start_utc),
  pick_up_end_utc = coalesce(rp.pick_up_end_utc, ps.pickup_end_utc),
  brief_start_utc = coalesce(rp.brief_start_utc, ps.brief_start_utc),
  brief_end_utc = coalesce(rp.brief_end_utc, ps.brief_end_utc),
  debrief_start_utc = coalesce(rp.debrief_start_utc, ps.debrief_start_utc),
  debrief_end_utc = coalesce(rp.debrief_end_utc, ps.debrief_end_utc),
  drop_off_start_utc = coalesce(rp.drop_off_start_utc, ps.dropoff_start_utc),
  drop_off_end_utc = coalesce(rp.drop_off_end_utc, ps.dropoff_end_utc),
  pairing_label = coalesce(rp.pairing_label, p.pairing_label),
  pairing_base = coalesce(rp.pairing_base, p.base),
  pairing_fleet = coalesce(rp.pairing_fleet, p.fleet),
  tafb_minutes = coalesce(rp.tafb_minutes, p.tafb)
from roster_flight rf
left join pairing_segment ps
  on ps.pairing_id = rf.pairing_id
 and ps.duty_seq = rf.duty_seq
 and ps.seg_seq = rf.seg_seq
 and coalesce(ps.is_deleted, 0) = 0
left join pairing p on p.id = rf.pairing_id
where rf.id = coalesce(rp.roster_flight_id, rp.roster_id);

create unique index if not exists uq_roster_publish_roster_flight_id
  on roster_publish (roster_flight_id)
  where roster_flight_id is not null;

comment on table roster_publish is '已对外发布的排班快照：roster_flight + pairing_segment 时间窗口 + PBS 展示字段，供机组 app/PBS 只读';
comment on column roster_publish.roster_flight_id is '来源 roster_flight.id；旧字段 roster_id 的清晰命名兼容列';
comment on column roster_publish.duty_seq is '来源 roster_flight.duty_seq；旧字段 duty_id 的清晰命名兼容列';
comment on column roster_publish.seg_seq is '来源 roster_flight.seg_seq';
comment on column roster_publish.flight_acting_rank is '来源 roster_flight.flight_acting_rank；旧字段 acting_rank 的清晰命名兼容列';
comment on column roster_publish.roster_acting_rank is '来源 roster_flight.roster_acting_rank；旧字段 roster_rank 的清晰命名兼容列';
comment on column roster_publish.sch_credited_minutes is '发布快照计划信用积分，来自 roster_flight.sch_credited_minutes，PBS 禁止运行时 join roster_flight';
comment on column roster_publish.act_credited_minutes is '发布快照实际信用积分，来自 roster_flight.act_credited_minutes，PBS 禁止运行时 join roster_flight';
comment on column roster_publish.pairing_label is '发布快照环号，来自 pairing.pairing_label，PBS 禁止运行时 join pairing';
comment on column roster_publish.pairing_base is '发布快照环基地，来自 pairing.base，PBS 禁止运行时 join pairing';
comment on column roster_publish.pairing_fleet is '发布快照环机队，来自 pairing.fleet，PBS 禁止运行时 join pairing';
comment on column roster_publish.tafb_minutes is '发布快照 TAFB 分钟，来自 pairing.tafb，PBS 禁止运行时 join pairing';

select
  count(*)::int as roster_publish_rows,
  count(*) filter (where roster_flight_id is null)::int as missing_roster_flight_id,
  count(*) filter (where sch_credited_minutes is null and act_credited_minutes is null)::int as missing_credit_rows,
  count(*) filter (where pairing_id is not null and pairing_label is null)::int as missing_pairing_label_rows
from roster_publish;
