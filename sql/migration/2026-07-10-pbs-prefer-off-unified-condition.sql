-- PBS Days Off 201 Prefer Off unified condition.
-- Execute with search_path pointing at the target PBS schema.

alter table pbs_bid_days_off_favorite
  add column if not exists maximum_n smallint;

comment on column pbs_bid_days_off_favorite.maximum_n is
  'Configured favorite maximum selected periods for flexible Prefer Off fulfilment.';

comment on column pbs_bid_group.limit_n is
  'Bid-type maximum: Pairing means maximum pairings; DaysOff 201 means maximum selected periods.';

insert into f8.dictionary (parent_code, code, name, code_value, idx, created_by, updated_by)
values
  (null, 'PBS_PREFER_OFF', 'PBS Prefer Off Configuration', null, 30, 'system', 'system'),
  ('PBS_PREFER_OFF', 'WEEKEND_START_DOW', 'Weekend Start Day', 'FRI', 10, 'system', 'system'),
  ('PBS_PREFER_OFF', 'WEEKEND_START_TIME', 'Weekend Start Time', '00:00', 20, 'system', 'system'),
  ('PBS_PREFER_OFF', 'WEEKEND_END_DOW', 'Weekend End Day', 'SUN', 30, 'system', 'system'),
  ('PBS_PREFER_OFF', 'WEEKEND_END_TIME', 'Weekend End Time', '24:00', 40, 'system', 'system')
on conflict (coalesce(parent_code, '___NULL___'), code) do update set
  name = excluded.name,
  code_value = excluded.code_value,
  idx = excluded.idx,
  updated_by = excluded.updated_by,
  updated_at = now();
