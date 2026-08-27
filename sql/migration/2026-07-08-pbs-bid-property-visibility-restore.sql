-- PBS bid property visibility restore
-- Execute with search_path pointing at the target PBS schema.
--
-- This only restores Portal catalog visibility. It intentionally does not
-- restore deleted favorites/rule groups, does not rename property 107 back,
-- and does not hide the newly added Airport Preference property 168.

do $$
declare
  restored_count integer;
begin
  update pbs_bid_property
  set is_visible_in_portal = 1,
      updated_at = now()
  where (
      bid_type = 'DaysOff'
      and property_code in (202, 203, 204, 205, 206, 218)
    )
    or (
      bid_type = 'Pairing'
      and property_code in (101, 104, 119, 123, 108, 124, 130)
    );

  get diagnostics restored_count = row_count;

  raise notice 'PBS bid property visibility restore: properties updated=%',
    restored_count;
end $$;
