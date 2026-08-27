-- PBS Bid Definitions source-of-truth migration.
-- Override with: psql -v live_schema=f8_sit_live -v pbs_schema=f8_sit_pbs -f <file>

\if :{?live_schema}
\else
\set live_schema f8
\endif

\if :{?pbs_schema}
\else
\set pbs_schema f8_pbs
\endif

select set_config('pbs.bid_definitions_live_schema', :'live_schema', false);

do $$
declare
  target_schema text := current_setting('pbs.bid_definitions_live_schema');
  duplicate_count bigint;
begin
  execute format(
    'select count(*) from (select 1 from %I.dictionary group by coalesce(parent_code, ''___NULL___''), code having count(*) > 1) duplicates',
    target_schema
  ) into duplicate_count;

  if duplicate_count > 0 then
    raise exception 'Duplicate dictionary parent_code/code rows must be resolved before PBS Bid Definitions migration.';
  end if;
end $$;

create unique index if not exists uq_dictionary_parent_code
  on :"live_schema".dictionary (coalesce(parent_code, '___NULL___'), code);

insert into :"live_schema".dictionary (parent_code, code, name, idx, code_value)
values ('SYS_PARAM', 'PBS_PAIRING_REDEYE_CONFIG', 'PBS pairing Redeye configuration', 21, null)
on conflict (coalesce(parent_code, '___NULL___'), code) do nothing;

insert into :"live_schema".dictionary (parent_code, code, name, idx, code_value)
values
  ('PBS_PAIRING_REDEYE_CONFIG', 'START_TIME', 'Redeye local start time', 1, '03:30'),
  ('PBS_PAIRING_REDEYE_CONFIG', 'END_TIME', 'Redeye local end time', 2, '05:30')
on conflict (coalesce(parent_code, '___NULL___'), code) do nothing;

update :"pbs_schema".pbs_bid_property
set
  validation_json = '{"type":"redeye_preference","dateScope":["specific_dates","date_range"]}',
  tooltip = 'Award/Avoid pairings with a flight operating within the company-defined Redeye window, optionally limited to flight dates.',
  updated_by = 'migration',
  updated_at = now()
where bid_type = 'Pairing'
  and property_code = 117;
