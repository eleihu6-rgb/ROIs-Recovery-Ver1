-- Date: 2026-06-16
-- Purpose: Create the dedicated hidden PBS admin account used for admin-only APIs.
-- Background: Real crew accounts must not be promoted to admin just to call import/export APIs.
-- Usage: Run under the PBS schema search_path, for example f8_pbs.

insert into pbs_user (
  created_by,
  updated_by,
  crew_id,
  user_code,
  user_name,
  password_hash,
  branch_code,
  py_abbr,
  gender,
  eff_dt,
  exp_dt,
  ad_active,
  status,
  is_admin,
  interface_user_id,
  password_access,
  portal_access,
  app_access,
  is_first_login,
  email,
  last_login_at,
  last_login_ip,
  failed_login_count,
  locked_until,
  password_changed_at,
  token_version,
  division,
  base,
  rank
)
values (
  'pbs-hidden-admin-seed',
  'pbs-hidden-admin-seed',
  '__admin__',
  'admin',
  'System Administrator',
  '$2b$10$I7PJb/o78uyfP1.zDcqypeRqZ85gdK3HTIakhLld3rm4X3WR3g4la',
  'HQ',
  'ADMIN',
  null,
  '2026-01-01'::timestamptz,
  null,
  0,
  0,
  1,
  'pbs-hidden-admin',
  '1',
  '1',
  '0',
  'N',
  null,
  null,
  null,
  0,
  null,
  null,
  0,
  null,
  null,
  null
)
on conflict (user_code) do update
set
  updated_by = excluded.updated_by,
  updated_at = now(),
  crew_id = excluded.crew_id,
  user_name = excluded.user_name,
  branch_code = excluded.branch_code,
  py_abbr = excluded.py_abbr,
  gender = excluded.gender,
  exp_dt = null,
  ad_active = excluded.ad_active,
  status = excluded.status,
  is_admin = excluded.is_admin,
  interface_user_id = excluded.interface_user_id,
  password_access = excluded.password_access,
  portal_access = excluded.portal_access,
  app_access = excluded.app_access,
  is_first_login = excluded.is_first_login,
  email = excluded.email,
  division = null,
  base = null,
  rank = null,
  password_hash = case
    when pbs_user.password_hash = '$2b$10$placeholder.hash.for.seed.data.only.000000000000'
      then excluded.password_hash
    else pbs_user.password_hash
  end;

update pbs_user
set
  is_admin = 0,
  updated_by = 'pbs-hidden-admin-seed',
  updated_at = now()
where lower(user_code) <> 'admin'
  and is_admin <> 0;
