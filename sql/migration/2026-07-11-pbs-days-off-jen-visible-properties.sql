-- PBS Days Off visible property scope aligned to Jen's final bidding options.
-- Execute with search_path pointing at the target PBS schema.

update pbs_bid_property
set is_visible_in_portal = case
      when property_code in (201, 204) then 1
      else 0
    end,
    recommended_order = case
      when property_code = 201 then 1
      when property_code = 204 then 2
      else null
    end,
    recommended_usage_count = case
      when property_code = 201 then coalesce(recommended_usage_count, 1583)
      when property_code = 204 then coalesce(recommended_usage_count, 175)
      else null
    end,
    updated_at = now()
where bid_type = 'DaysOff'
  and property_code in (201, 202, 203, 204, 205, 206, 211, 212, 213, 214, 215, 216, 217);

-- 218 is a Standing Bid-only DaysOff property and is not part of the current
-- Days Off Add Properties catalog. Keep it visible for Standing Bid.
update pbs_bid_property
set is_visible_in_portal = 1,
    updated_at = now()
where bid_type = 'DaysOff'
  and property_code = 218;
