-- Date: 2026-07-27
-- Purpose: Make roster_publish_adjust.published a durable three-state status.
-- Usage: Run under the target live schema search_path, for example f8_sit_live.

update roster_publish_adjust
   set published = 2,
       updated_by = 'published-status-migration',
       updated_at = now()
 where (old_source = 'IMP' or new_source = 'IMP')
   and published is distinct from 2;

update roster_publish_adjust
   set published = 0,
       updated_by = 'published-status-migration',
       updated_at = now()
 where published is null;

alter table roster_publish_adjust
  alter column published set default 0,
  alter column published set not null;

alter table roster_publish_adjust
  drop constraint if exists chk_roster_publish_adjust_published;

alter table roster_publish_adjust
  add constraint chk_roster_publish_adjust_published
  check (published between 0 and 2);

comment on column roster_publish_adjust.published is
  'Callback status: 0=pending, 1=sent to NOC, 2=IMP imported and excluded from NOC publish';
