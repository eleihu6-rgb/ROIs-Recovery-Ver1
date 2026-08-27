-- Canonical/no-data fixture for property 427 Reserve migration.
-- Run only in an isolated PBS test schema.

begin;

delete from pbs_bid_property_context
where property_id in (
  select id
  from pbs_bid_property
  where bid_type = 'Line'
    and property_code = 427
);

update pbs_bid_property
set
  property_name = 'Reserve Avoidance',
  award_or_avoid = null,
  any_or_every = null,
  operator_options = null,
  validation_json = '{"type":"reserve_avoidance","label":"Reserve Avoidance","mode":["if_possible","no_matter_what"]}',
  tooltip = 'Avoid reserve if possible, or avoid reserve no matter what.',
  source_type = 'aa',
  is_visible_in_portal = 1,
  display_order = 6,
  is_active = 1,
  updated_by = 'fixture',
  updated_at = now()
where bid_type = 'Line'
  and property_code = 427;

commit;
