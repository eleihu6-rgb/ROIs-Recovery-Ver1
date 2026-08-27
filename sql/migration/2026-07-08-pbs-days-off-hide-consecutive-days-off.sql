-- PBS Days Off entry simplification
-- Execute with search_path pointing at target PBS schema.

update pbs_bid_property
set is_visible_in_portal = case
      when property_code = 201 then 1
      when property_code in (202, 203, 204, 205, 206) then 0
      else is_visible_in_portal
    end,
    updated_at = now()
where bid_type = 'DaysOff'
  and property_code in (201, 202, 203, 204, 205, 206);
