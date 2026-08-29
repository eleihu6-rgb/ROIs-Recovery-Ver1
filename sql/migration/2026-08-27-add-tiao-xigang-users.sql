-- Date: 2026-08-27
-- Purpose: Create live-server login accounts for Tiao and Xigang.
-- Background: Same role/access profile and password as the existing 'Ryan' account
--   (branch_code, is_admin, password_access, portal_access, app_access, status, ad_active,
--   password_hash all copied from 'Ryan'). Personal fields (gender/tel/email) are left null
--   since they belong to Tiao/Xigang, not Ryan.
-- Usage: Run under the live schema search_path, e.g. f8_sit_live.
-- Note: eff_dt is a `timestamp` (no timezone) column. Using now() here gets converted
--   through the session's TimeZone GUC into a civil value that later gets misread as UTC
--   by the app, landing hours in the "future" and tripping hasLivePortalAccess's
--   effDt <= now check. Use an explicit past literal instead (matches Ryan's eff_dt).

insert into users (
  created_by,
  updated_by,
  user_code,
  user_name,
  password_hash,
  branch_code,
  py_abbr,
  eff_dt,
  ad_active,
  status,
  is_admin,
  password_access,
  portal_access,
  app_access,
  is_first_login,
  token_version
)
values
  (
    'tiao-xigang-user-seed',
    'tiao-xigang-user-seed',
    'Tiao',
    'Tiao',
    '$2b$10$PhKoOq7yKt6YxWhYgXSzlut51pAy1oRuE8eaITicBsNofimHze7Dm',
    'F8',
    'TIAO',
    '2026-01-01 00:00:00',
    0,
    0,
    0,
    'Y',
    'Y',
    'Y',
    'Y',
    0
  ),
  (
    'tiao-xigang-user-seed',
    'tiao-xigang-user-seed',
    'Xigang',
    'Xigang',
    '$2b$10$PhKoOq7yKt6YxWhYgXSzlut51pAy1oRuE8eaITicBsNofimHze7Dm',
    'F8',
    'XIGANG',
    '2026-01-01 00:00:00',
    0,
    0,
    0,
    'Y',
    'Y',
    'Y',
    'Y',
    0
  )
on conflict (user_code) do nothing;

-- Mirror Ryan's user_profile bindings so Tiao/Xigang actually get Ryan's permissions/menus,
-- not just an authenticated-but-empty shell (see live-server/scripts/create-demo-users.cjs
-- for the established pattern this follows).
insert into user_profile (user_code, profile_id)
select v.user_code, up.profile_id
from user_profile up
cross join (values ('Tiao'), ('Xigang')) as v(user_code)
where up.user_code = 'Ryan'
on conflict (user_code, profile_id) do nothing;
