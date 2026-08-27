-- ============================================================
-- PBS Days Off visible property pruning
-- ============================================================
-- Execute with search_path pointing at the target PBS schema.
-- This only hides properties from the Portal catalog. Rows remain
-- active so existing drafts/favorites/imported bids can still resolve.

update pbs_bid_property
set is_visible_in_portal = case
      when property_code in (201, 203) then 1
      when property_code in (202, 204, 205, 206, 218) then 0
      else is_visible_in_portal
    end,
    updated_at = now()
where bid_type = 'DaysOff'
  and property_code in (201, 202, 203, 204, 205, 206, 218);
