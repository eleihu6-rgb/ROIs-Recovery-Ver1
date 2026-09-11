-- Date: 2026-09-11
-- Purpose: give every crew a mobile/PBS account and set the SAME test password for all of them.
--
-- Background
--   The crew-app simulation (crew-app/.maestro/et_login.yaml, Ethiopian Airlines) signs in as
--   an ET crew member through live-server POST /api/mobile-roster/session, which authenticates
--   against <pbs_schema>.pbs_user (see live-server/src/services/mobile-roster/mobile-roster-service.ts
--   -> verifyMobileCrewCredentials). sql/seed/2026-09-10-crew-add-j4001-j4040-add-7m8.sql created
--   the crew rows for the ET ADD/7M8 batch (J4001–J4040) but NO pbs_user rows, so the sim answered
--   "Invalid crew ID or password." for every one of them except J4002, which had been seeded by hand
--   (created_by = 'claude_et_crew_app_seed').
--
--   Password is a SHARED TEST value: bcrypt('Pier2026'), identical to the 894 existing crew accounts
--   (verified by comparing against the live f8_sit_pbs.pbs_user rows). One crew account (1032, Jason Ly)
--   held a different hash and is normalised here so "every crew = Pier2026" actually holds.
--
-- Usage (SIT):
--   psql "$DATABASE_URL" \
--     -v live_schema=f8_sit_live -v pbs_schema=f8_sit_pbs \
--     -f sql/seed/2026-09-11-crew-app-accounts-and-password.sql
--
-- Notes
--   * Idempotent: the insert skips crew that already have an account, and the update only touches
--     accounts whose hash differs from the shared one.
--   * eff_dt is a fixed past instant on purpose — the 2026-08-27 user seed shows that a "now()"
--     value can be written and later misread as UTC, tripping the app's eff_dt <= now check.
--   * branch_code: ADD-based crew get 'ET' (matching the J4002 account the Ethiopian crew-app has used),
--     all other crew get 'F8'. The field is display/ownership metadata; it is not part of the
--     credential or access gate.
--   * Access flags mirror the working J4002 row: password_access / portal_access / app_access = '1',
--     status = 0, ad_active = 1, is_first_login = 'N', token_version = 1.

\if :{?live_schema}
\else
\set live_schema f8_sit_live
\endif
\if :{?pbs_schema}
\else
\set pbs_schema f8_sit_pbs
\endif

\set shared_password_hash '$2b$10$UHcvSXoI/3DvuZqqrJxgp.rw3XF3wft94FTE8RSw.a2bX2AEmRauC'

begin;

-- 1) Create the missing crew accounts (one per crew, user_code = crew_id).
insert into :"pbs_schema".pbs_user (
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
  password_access,
  portal_access,
  app_access,
  is_first_login,
  email,
  tel,
  token_version,
  division
)
select
  'crew-app-account-seed',
  'crew-app-account-seed',
  c.crew_id,
  c.crew_id,
  btrim(c.first_name) || ' ' || btrim(c.last_name),
  :'shared_password_hash',
  case when cb.base = 'ADD' then 'ET' else 'F8' end,
  upper(left(btrim(c.first_name), 1) || left(btrim(c.last_name), 1)),
  c.gender,
  timestamptz '2026-01-01 00:00:00+00',
  null,
  1,
  0,
  0,
  '1',
  '1',
  '1',
  'N',
  '',
  '',
  1,
  c.division
from :"live_schema".crew c
left join lateral (
  select base
  from :"live_schema".crew_base
  where crew_id = c.crew_id
  order by is_prime_base desc, eff_dt desc
  limit 1
) cb on true
where not exists (
  select 1
  from :"pbs_schema".pbs_user u
  where u.crew_id = c.crew_id
)
on conflict (crew_id) do nothing;

-- 2) Normalise every crew account to the one shared test password.
update :"pbs_schema".pbs_user u
set password_hash = :'shared_password_hash',
    updated_by    = 'crew-app-account-seed',
    updated_at    = now()
where exists (
  select 1
  from :"live_schema".crew c
  where c.crew_id = u.crew_id
)
and u.password_hash <> :'shared_password_hash';

commit;

-- Audit: crew without an account, and accounts whose hash is not the shared one. Both must be 0.
select
  (select count(*)
     from :"live_schema".crew c
     left join :"pbs_schema".pbs_user u on u.crew_id = c.crew_id
    where u.crew_id is null) as crew_without_account,
  (select count(*)
     from :"pbs_schema".pbs_user u
     join :"live_schema".crew c on c.crew_id = u.crew_id
    where u.password_hash <> :'shared_password_hash') as crew_with_other_password;
