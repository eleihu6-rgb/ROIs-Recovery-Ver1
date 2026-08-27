-- Drop ambiguous roster_publish compatibility columns after snapshot alignment.
-- Prerequisite: 2026-07-23-roster-publish-snapshot-alignment.sql has been applied.

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

create unique index if not exists uq_roster_publish_roster_flight_id
  on roster_publish (roster_flight_id)
  where roster_flight_id is not null;

drop index if exists uq_roster_publish_roster_id;

alter table roster_publish
  drop column if exists roster_id,
  drop column if exists duty_id,
  drop column if exists acting_rank,
  drop column if exists roster_rank;

drop index if exists idx_roster_pub_crew_pair;
create index if not exists idx_roster_pub_crew_pair
  on roster_publish (crew_id, pairing_id, duty_seq, flt_id);

comment on column roster_publish.roster_flight_id is '来源 roster_flight.id';
comment on column roster_publish.duty_seq is '来源 roster_flight.duty_seq';
comment on column roster_publish.flight_acting_rank is '来源 roster_flight.flight_acting_rank';
comment on column roster_publish.roster_acting_rank is '来源 roster_flight.roster_acting_rank';

select
  (select count(*)::int from roster_publish) as roster_publish_rows,
  (select count(*)::int from roster_publish where roster_flight_id is null) as missing_roster_flight_id,
  (select count(*)::int from roster_publish where flight_acting_rank is null) as missing_flight_acting_rank,
  (
    select count(*)::int
    from information_schema.columns
    where table_schema = current_schema()
      and table_name = 'roster_publish'
      and column_name in ('roster_id', 'duty_id', 'acting_rank', 'roster_rank')
  ) as legacy_column_count;
