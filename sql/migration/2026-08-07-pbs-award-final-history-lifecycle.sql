begin;

set local lock_timeout = '5s';

alter table roster_period
  add column if not exists pbs_award_final_at timestamp without time zone,
  add column if not exists pbs_mis_award_deadline_at timestamp without time zone;

comment on column roster_period.pbs_award_final_at is
  'PBS Award becomes final at this base-local wall time';

comment on column roster_period.pbs_mis_award_deadline_at is
  'Mis-award submission deadline in base-local wall time';

commit;
