-- ============================================================
-- 2026-07-06-pbs-standing-bid-context.sql
-- Purpose: enable PBS Standing Bid storage on the existing pbs_bid chain.
-- ============================================================

alter table pbs_bid
  alter column bid_context type varchar(24);

comment on column pbs_bid.bid_context is
  '申请上下文：Default=每月复用的默认偏好；Current=当期特定申请；StandingLineholder/StandingReserve=长期备用偏好';

create index if not exists idx_pbs_bid_standing_context
  on pbs_bid (crew_id, bid_context)
  where period_code = 'STANDING';

insert into pbs_bid_property (
  property_code,
  bid_type,
  property_name,
  award_or_avoid,
  any_or_every,
  operator_options,
  validation_json,
  tooltip,
  source_type,
  is_visible_in_portal,
  display_order,
  is_active
) values
  (218, 'DaysOff', 'Day of Week Off', null, null, '["In"]',
   '{"type":"dow","label":"Day of Week"}',
   'Standing Bid day-of-week off preference.', 'aa', 1, 218, 1),
  (312, 'Reserve', 'Reserve Day of Week Off', null, null, '["In"]',
   '{"type":"dow","label":"Day of Week"}',
   'Standing Reserve day-of-week off preference.', 'aa', 1, 312, 1),
  (313, 'Reserve', 'Reserve Work Block Size', null, null, '["Between"]',
   '{"type":"int_range","label":"Work Block Size","min":3,"max":6}',
   'Standing Reserve preferred reserve work block size.', 'aa', 1, 313, 1),
  (314, 'Reserve', 'Waive to Allow Carry over to be Days Off', null, null, null,
   '{"type":"flag"}',
   'Standing Reserve waiver allowing carry-over to be days off.', 'aa', 1, 314, 1)
on conflict (property_code) do update set
  bid_type = excluded.bid_type,
  property_name = excluded.property_name,
  award_or_avoid = excluded.award_or_avoid,
  any_or_every = excluded.any_or_every,
  operator_options = excluded.operator_options,
  validation_json = excluded.validation_json,
  tooltip = excluded.tooltip,
  source_type = excluded.source_type,
  is_visible_in_portal = excluded.is_visible_in_portal,
  display_order = excluded.display_order,
  is_active = excluded.is_active,
  updated_at = now();
