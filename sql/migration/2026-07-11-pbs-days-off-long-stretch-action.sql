-- PBS Days Off Long Stretch Off / Compressed Flying action support.
-- Execute with search_path pointing at the target PBS schema.

alter table pbs_bid_days_off_favorite
  add column if not exists action varchar(20);

comment on column pbs_bid_days_off_favorite.action is
  'Days Off configured favorite Award/Avoid action; currently used by Long Stretch Off / Compressed Flying.';

update pbs_bid_property
set tooltip = 'Request a long block of consecutive days off inside an optional date window.',
    updated_at = now()
where bid_type = 'DaysOff'
  and property_code = 204;
