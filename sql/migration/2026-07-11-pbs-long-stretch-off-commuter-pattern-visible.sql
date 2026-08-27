-- PBS Days Off Long Stretch Off / Compressed Flying entry.
-- Execute with search_path pointing at the target PBS schema.

update pbs_bid_property
set property_name = case
      when property_code = 204 then 'Long Stretch Off / Compressed Flying'
      else property_name
    end,
    tooltip = case
      when property_code = 204 then 'Request a long block of consecutive days off inside a window.'
      else tooltip
    end,
    is_visible_in_portal = case
      when property_code = 204 then 1
      when property_code in (203, 205) then 0
      else is_visible_in_portal
    end,
    recommended_order = case
      when property_code = 204 then 2
      when property_code in (203, 205) then null
      else recommended_order
    end,
    recommended_usage_count = case
      when property_code = 204 then coalesce(recommended_usage_count, 175)
      when property_code in (203, 205) then null
      else recommended_usage_count
    end,
    updated_at = now()
where bid_type = 'DaysOff'
  and property_code in (203, 204, 205);
