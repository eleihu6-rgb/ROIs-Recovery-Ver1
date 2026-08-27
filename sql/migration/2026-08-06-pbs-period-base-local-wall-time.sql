-- Store PBS period configuration as base-local wall time.
-- Idempotent for DEV / SIT / UAT and preserves the existing UTC clock face
-- when converting legacy timestamptz columns.

begin;

set local lock_timeout = '5s';

alter table roster_period
  add column if not exists pbs_award_publish_at timestamp;

do $$
declare
  target_column text;
begin
  foreach target_column in array array[
    'rp_start',
    'rp_end',
    'pbs_bid_open_at',
    'pbs_bid_close_at',
    'pbs_award_publish_at'
  ] loop
    if exists (
      select 1
      from information_schema.columns
      where table_schema = current_schema()
        and table_name = 'roster_period'
        and information_schema.columns.column_name = target_column
        and data_type = 'timestamp with time zone'
    ) then
      execute format(
        'alter table roster_period alter column %I type timestamp without time zone using %I at time zone ''UTC''',
        target_column,
        target_column
      );
    end if;
  end loop;
end $$;

-- Normalize the agreed 2026 F8 irregular Q1 roster periods. Conditions keep
-- already-correct SIT / UAT rows unchanged.
update roster_period
set rp_start = timestamp '2026-01-01 00:00:00',
    rp_end = timestamp '2026-01-30 00:00:00',
    updated_by = 'migration',
    updated_at = now()
where (roster_period = '2026RP01' or name = '2026-01' or pbs_period_code = 'Jan 2026')
  and (rp_start, rp_end) is distinct from (
    timestamp '2026-01-01 00:00:00',
    timestamp '2026-01-30 00:00:00'
  );

update roster_period
set rp_start = timestamp '2026-01-31 00:00:00',
    rp_end = timestamp '2026-03-01 00:00:00',
    updated_by = 'migration',
    updated_at = now()
where (roster_period = '2026RP02' or name = '2026-02' or pbs_period_code = 'Feb 2026')
  and (rp_start, rp_end) is distinct from (
    timestamp '2026-01-31 00:00:00',
    timestamp '2026-03-01 00:00:00'
  );

update roster_period
set rp_start = timestamp '2026-03-02 00:00:00',
    rp_end = timestamp '2026-03-31 00:00:00',
    updated_by = 'migration',
    updated_at = now()
where (roster_period = '2026RP03' or name = '2026-03' or pbs_period_code = 'Mar 2026')
  and (rp_start, rp_end) is distinct from (
    timestamp '2026-03-02 00:00:00',
    timestamp '2026-03-31 00:00:00'
  );

update roster_period
set pbs_award_publish_at = pbs_bid_close_at + interval '10 days',
    updated_by = 'migration',
    updated_at = now()
where pbs_period_code is not null
  and pbs_bid_close_at is not null
  and pbs_award_publish_at is null;

comment on column roster_period.rp_start is
  'Roster-period start as base-local wall time; resolve to an instant with the crew effective prime base';
comment on column roster_period.rp_end is
  'Roster-period inclusive end as base-local wall time; resolve with the crew effective prime base';
comment on column roster_period.pbs_bid_open_at is
  'PBS bid-open base-local wall time; no timezone is stored';
comment on column roster_period.pbs_bid_close_at is
  'PBS bid-close base-local wall time; no timezone is stored';
comment on column roster_period.pbs_award_publish_at is
  'PBS Award planned base-local wall time; actual publication is derived from schedule_publish_record';

commit;
