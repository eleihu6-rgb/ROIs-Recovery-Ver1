-- Restore the final Pairing catalog after the broad visibility-restore migration.
-- Execute with search_path pointing at the target PBS schema.
-- This is intentionally metadata-only: no bid, group, condition, or favorite is deleted.

begin;

update pbs_bid_property
set
  is_visible_in_portal = 0,
  updated_at = now()
where bid_type = 'Pairing'
  and property_code in (101, 104, 108, 119, 123, 124, 130);

commit;
