-- Consolidate duplicated PBS period/dictionary tables.
--
-- Target:
--   - f8.dictionary is the only dictionary/system parameter source.
--   - f8.roster_period is the only PBS period source.
--   - f8_pbs keeps PBS business data only.

begin;

alter table if exists f8.roster_period
  add column if not exists pbs_period_code varchar(20),
  add column if not exists pbs_bid_open_at timestamptz,
  add column if not exists pbs_bid_close_at timestamptz,
  add column if not exists pbs_award_run_at timestamptz,
  add column if not exists pbs_award_publish_at timestamptz,
  add column if not exists pbs_max_tiers smallint not null default 24,
  add column if not exists pbs_status varchar(20) not null default 'DRAFT',
  add column if not exists pbs_description varchar(200);

alter table if exists f8_pbs.pbs_bid
  add column if not exists roster_period_id bigint;

alter table if exists f8_pbs.pbs_award_result
  add column if not exists roster_period_id bigint;

insert into f8.dictionary (parent_code, code, name, idx, created_by, updated_by)
select null, 'SYS_PARAM', 'System Parameters / 系统参数', 1, 'migration', 'migration'
where exists (
  select 1
  from information_schema.tables
  where table_schema = 'f8'
    and table_name = 'dictionary'
)
and not exists (
  select 1
  from f8.dictionary
  where parent_code is null
    and code = 'SYS_PARAM'
);

with old_business_time as (
  select
    code,
    name,
    idx,
    code_value
  from f8_pbs.dictionary
  where parent_code = 'SYS_PARAM'
    and code in (
      'PBS_BUSINESS_TIME_MODE',
      'PBS_BUSINESS_TIME_ANCHOR',
      'PBS_BUSINESS_TIME_ANCHOR_REAL'
    )
)
update f8.dictionary dictionary
set name = old_business_time.name,
    idx = old_business_time.idx,
    code_value = old_business_time.code_value,
    updated_by = 'migration',
    updated_at = now()
from old_business_time
where dictionary.parent_code = 'SYS_PARAM'
  and dictionary.code = old_business_time.code;

with old_business_time as (
  select
    code,
    name,
    idx,
    code_value
  from f8_pbs.dictionary
  where parent_code = 'SYS_PARAM'
    and code in (
      'PBS_BUSINESS_TIME_MODE',
      'PBS_BUSINESS_TIME_ANCHOR',
      'PBS_BUSINESS_TIME_ANCHOR_REAL'
    )
)
insert into f8.dictionary (
  parent_code,
  code,
  name,
  idx,
  code_value,
  created_by,
  updated_by
)
select
  'SYS_PARAM',
  old_business_time.code,
  old_business_time.name,
  old_business_time.idx,
  old_business_time.code_value,
  'migration',
  'migration'
from old_business_time
where not exists (
  select 1
  from f8.dictionary dictionary
  where dictionary.parent_code = 'SYS_PARAM'
    and dictionary.code = old_business_time.code
);

with aggregated_periods as (
  select
    period_code,
    min(bid_open_at) as bid_open_at,
    max(bid_close_at) as bid_close_at,
    min(award_run_at) filter (where award_run_at is not null) as award_run_at,
    min(award_publish_at) filter (where award_publish_at is not null) as award_publish_at,
    max(max_tiers) as max_tiers,
    (array_agg(
      status
      order by case status
        when 'PUBLISHED' then 5
        when 'AWARDED' then 4
        when 'CLOSED' then 3
        when 'OPEN' then 2
        when 'DRAFT' then 1
        else 0
      end desc,
      id desc
    ))[1] as status,
    max(description) filter (where description is not null) as description
  from f8_pbs.pbs_period
  group by period_code
),
mapped_periods as (
  select
    roster_period.id as roster_period_id,
    aggregated_periods.*
  from aggregated_periods
  join f8.roster_period roster_period
    on roster_period.name = to_char(to_date(aggregated_periods.period_code, 'Mon YYYY'), 'YYYY-MM')
)
update f8.roster_period roster_period
set pbs_period_code = mapped_periods.period_code,
    pbs_bid_open_at = mapped_periods.bid_open_at,
    pbs_bid_close_at = mapped_periods.bid_close_at,
    pbs_award_run_at = mapped_periods.award_run_at,
    pbs_award_publish_at = mapped_periods.award_publish_at,
    pbs_max_tiers = coalesce(mapped_periods.max_tiers, 24),
    pbs_status = coalesce(mapped_periods.status, 'DRAFT'),
    pbs_description = mapped_periods.description,
    updated_by = 'migration',
    updated_at = now()
from mapped_periods
where roster_period.id = mapped_periods.roster_period_id;

with old_period_map as (
  select
    pbs_period.id as pbs_period_id,
    roster_period.id as roster_period_id
  from f8_pbs.pbs_period pbs_period
  join f8.roster_period roster_period
    on roster_period.name = to_char(to_date(pbs_period.period_code, 'Mon YYYY'), 'YYYY-MM')
)
update f8_pbs.pbs_bid bid
set roster_period_id = old_period_map.roster_period_id,
    updated_by = 'migration',
    updated_at = now()
from old_period_map
where bid.pbs_period_id = old_period_map.pbs_period_id;

update f8_pbs.pbs_bid bid
set roster_period_id = roster_period.id,
    updated_by = 'migration',
    updated_at = now()
from f8.roster_period roster_period
where bid.roster_period_id is null
  and bid.period_code = roster_period.pbs_period_code;

with old_period_map as (
  select
    pbs_period.id as pbs_period_id,
    roster_period.id as roster_period_id
  from f8_pbs.pbs_period pbs_period
  join f8.roster_period roster_period
    on roster_period.name = to_char(to_date(pbs_period.period_code, 'Mon YYYY'), 'YYYY-MM')
)
update f8_pbs.pbs_award_result award
set roster_period_id = old_period_map.roster_period_id,
    updated_by = 'migration',
    updated_at = now()
from old_period_map
where award.pbs_period_id = old_period_map.pbs_period_id;

update f8_pbs.pbs_award_result award
set roster_period_id = roster_period.id,
    updated_by = 'migration',
    updated_at = now()
from f8.roster_period roster_period
where award.roster_period_id is null
  and award.period_code = roster_period.pbs_period_code;

alter table if exists f8_pbs.pbs_award_result
  alter column roster_period_id set not null;

drop index if exists f8_pbs.uq_pbs_award_result;
create unique index if not exists uq_pbs_award_result
  on f8_pbs.pbs_award_result (roster_period_id, crew_id);

create unique index if not exists uq_roster_period_pbs_period_code
  on f8.roster_period (pbs_period_code)
  where pbs_period_code is not null;

alter table if exists f8_pbs.pbs_bid
  drop column if exists pbs_period_id;

alter table if exists f8_pbs.pbs_award_result
  drop column if exists pbs_period_id;

drop table if exists f8_pbs.pbs_period;
drop table if exists f8_pbs.dictionary;

commit;
