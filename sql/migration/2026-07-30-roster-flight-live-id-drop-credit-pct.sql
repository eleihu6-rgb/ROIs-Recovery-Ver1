-- Track Live roster rows copied into Scenario result rows, and remove the
-- retired proportional ground-credit factor.

alter table roster_flight
  add column if not exists live_id bigint;

create index if not exists idx_roster_flight_live_id
  on roster_flight (live_id)
  where live_id is not null;

comment on column roster_flight.live_id is
  'Live roster_flight.id source copied into scenario/live rows for cross-system traceability';

alter table assignment
  drop column if exists credit_pct;

set search_path to scenario;

alter table roster_flight
  add column if not exists live_id bigint;

create index if not exists idx_scenario_roster_flight_live_id
  on roster_flight (scenario_id, live_id)
  where live_id is not null;

comment on column roster_flight.live_id is
  'Source live roster_flight.id from optimizer output old_id';
