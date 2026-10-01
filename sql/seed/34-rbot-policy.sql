-- 34-rbot-policy.sql — R'Bot autonomy policy (idempotent)
-- Spec: docs/superpowers/specs/2026-09-30-rbot-gantt-viewport-awareness-design.md §16 (L2 contract)
--   RBOT_AUTONOMY          L0 = read only, L1 = stage draft changes only, L2 = may Save after the
--                          user approves R'Bot's plan card. Kill switch: set to L1 or L0, no deploy.
--   RBOT_MAX_PLAN_CHANGES  most draft changes R'Bot may Save in one approved plan (bigger → manual Save).
insert into dictionary (parent_code, code, name, idx, code_value)
select v.parent_code, v.code, v.name, v.idx, v.code_value
from (values
  ('SYS_PARAM', 'RBOT_AUTONOMY',         'R''Bot autonomy: L0 read only, L1 stage only, L2 save after user confirms', 90, 'L2'),
  ('SYS_PARAM', 'RBOT_MAX_PLAN_CHANGES', 'Max draft changes R''Bot may save in one confirmed plan',                     91, '20')
) as v(parent_code, code, name, idx, code_value)
where not exists (
  select 1 from dictionary d where d.parent_code = v.parent_code and d.code = v.code
);
