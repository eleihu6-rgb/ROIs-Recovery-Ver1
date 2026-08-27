-- Remove unused PBS Period metadata after all services stop reading and writing it.
-- Run only after the target environment has deployed the compatible Live/PBS Server versions.

begin;

set local lock_timeout = '5s';

alter table roster_period
  drop column if exists pbs_award_run_at,
  drop column if exists pbs_award_publish_at,
  drop column if exists pbs_max_tiers,
  drop column if exists pbs_description;

commit;
