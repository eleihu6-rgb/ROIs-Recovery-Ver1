-- Date: 2026-07-22
-- Purpose: Add outbound callback grouping fields to roster_publish_adjust.
-- Background: Publish Roster callback payloads need the selected roster period
-- window and external pairing interface ids for old/new snapshots.
-- Usage: Run under the target live schema search_path, for example f8.

alter table roster_publish_adjust
  add column if not exists rp_start timestamp null,
  add column if not exists rp_end timestamp null,
  add column if not exists old_pair_interface_id varchar(100) null,
  add column if not exists new_pair_interface_id varchar(100) null;

comment on column roster_publish_adjust.rp_start is 'Roster period start selected during Publish Roster apply';
comment on column roster_publish_adjust.rp_end is 'Roster period end selected during Publish Roster apply';
comment on column roster_publish_adjust.old_pair_interface_id is 'Old published pairing external interface id';
comment on column roster_publish_adjust.new_pair_interface_id is 'New roster pairing external interface id';
