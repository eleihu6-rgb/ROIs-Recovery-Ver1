-- Date: 2026-07-03
-- Purpose: Make roster_publish capable of storing a full monthly published roster.
-- Background: PBS Award must read the final monthly roster from roster_publish,
-- including both flight legs and ground assignments such as DO/VAC/RES.
-- Usage: Run under the target live schema search_path, for example f8.

alter table roster_publish
  alter column flt_id drop not null;

alter table roster_publish
  add column if not exists assignment_group varchar(20),
  add column if not exists label varchar(200),
  add column if not exists sch_str_dt_utc timestamp,
  add column if not exists sch_end_dt_utc timestamp,
  add column if not exists dep_arp varchar(3),
  add column if not exists arv_arp varchar(3);

drop index if exists uq_roster_publish;

create unique index if not exists uq_roster_publish
  on roster_publish (flt_id, crew_id)
  where flt_id is not null;

create unique index if not exists uq_roster_publish_roster_id
  on roster_publish (roster_id)
  where roster_id is not null;

create index if not exists idx_roster_pub_crew_start
  on roster_publish (crew_id, sch_str_dt_utc);

comment on column roster_publish.assignment_group is '任务分组代码，用于区分 FLY/GRD/RES 等整月排班类型';
comment on column roster_publish.label            is '排班展示标签，来自 roster_flight.label';
comment on column roster_publish.sch_str_dt_utc   is '通用计划开始时间：飞行任务=航段计划起飞，地面任务=任务开始时间';
comment on column roster_publish.sch_end_dt_utc   is '通用计划结束时间：飞行任务=航段计划落地，地面任务=任务结束时间';
comment on column roster_publish.dep_arp          is '通用起点机场/地点：飞行任务=出发机场，地面任务=开始地点';
comment on column roster_publish.arv_arp          is '通用终点机场/地点：飞行任务=到达机场，地面任务=结束地点';
