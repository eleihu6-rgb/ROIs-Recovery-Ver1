-- Date: 2026-07-02
-- Purpose: Remove obsolete PBS Portal Active Period override configuration.
-- Background: The current PBS bid period is derived only from PBS Business Time and pbs_period.
-- Usage: Run under the target PBS schema search_path, for example f8.

delete from dictionary
where parent_code = 'SYS_PARAM'
  and code like 'PBS_PORTAL_ACTIVE_PERIOD\_%' escape '\';
