-- Restore the planned PBS Award visibility time and index the existing
-- schedule publication fact table used by the Award visibility gate.
-- This is expand-only and idempotent because environments may differ on
-- whether the previous drop migration was executed.

begin;

set local lock_timeout = '5s';

alter table roster_period
  add column if not exists pbs_award_publish_at timestamptz;

comment on column roster_period.pbs_award_publish_at is
  'PBS Award planned visibility time; actual publication is derived from schedule_publish_record';

create index if not exists idx_sch_pub_rec_period_published_created
  on schedule_publish_record (roster_period_id, published, created_at desc);

comment on column schedule_publish_record.roster_period_id is
  'References roster_period.id for publication-period resolution';

comment on column schedule_publish_record.published is
  '1=successfully published; 0/null=draft or not successfully published';

commit;
