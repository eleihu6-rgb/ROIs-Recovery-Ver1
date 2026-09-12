-- Crew absence submissions (crew recovery story 101).
--
-- 背景: crew app 提交病假后 Live 自动 stand-down（软删除重叠 pairing 的 roster_flight，
-- 并按天插入 ILL 地面行）。本表记录每一次提交，作为后续 absence 窗口 / best-fit 的数据源。
-- 被改动的 roster_flight 行通过既有 request_source='CREW_APP' / request_id=crew_absence.id 回溯。
--
-- Additive and repeatable. Run with an explicit target search_path.

do $$
begin
  if current_schema() is null or current_schema() in ('public', 'pg_catalog') then
    raise exception 'Select the intended schema before installing crew_absence';
  end if;
end $$;

create table if not exists crew_absence (
  id bigint generated always as identity primary key,
  created_by varchar(30) not null default 'system',
  created_at timestamp not null default now(),
  updated_by varchar(30) not null default 'system',
  updated_at timestamp not null default now(),
  airline varchar(4) not null,
  crew_id varchar(30) not null,
  absence_type varchar(16) not null,
  assignment varchar(20) not null,
  from_date date not null,
  to_date date not null,
  start_utc timestamptz not null,
  end_utc timestamptz not null,
  base varchar(3) not null,
  note text not null default '',
  status varchar(12) not null default 'active',
  source varchar(20) not null default 'CREW_APP',
  removed_pairing_ids bigint[] not null default '{}',
  constraint crew_absence_range_chk check (to_date >= from_date),
  constraint crew_absence_status_chk check (status in ('active', 'cancelled'))
);

create index if not exists crew_absence_crew_idx on crew_absence (airline, crew_id, from_date);
create index if not exists crew_absence_status_idx on crew_absence (status, from_date);
