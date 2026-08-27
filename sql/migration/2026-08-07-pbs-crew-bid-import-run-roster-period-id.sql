-- Bind each Crew Bid Import run to the authoritative Live roster period.

begin;

set local lock_timeout = '5s';

alter table f8_pbs.pbs_crew_bid_import_run
  add column if not exists roster_period_id bigint;

update f8_pbs.pbs_crew_bid_import_run run
set roster_period_id = period.id,
    updated_by = 'migration',
    updated_at = now()
from f8.roster_period period
where run.roster_period_id is null
  and period.pbs_period_code = run.period_code;

do $$
begin
  if exists (
    select 1
    from f8_pbs.pbs_crew_bid_import_run
    where roster_period_id is null
  ) then
    raise exception 'Cannot map every Crew Bid Import run to live.roster_period';
  end if;
end
$$;

alter table f8_pbs.pbs_crew_bid_import_run
  alter column roster_period_id set not null;

drop index if exists f8_pbs.idx_pbs_crew_bid_import_run_period;

create index if not exists idx_pbs_crew_bid_import_run_period
  on f8_pbs.pbs_crew_bid_import_run (roster_period_id, created_at desc);

comment on column f8_pbs.pbs_crew_bid_import_run.roster_period_id is
  'Authoritative Live roster_period.id used by this import run';

commit;
