-- Demo seed for crew_control_handover so the Dashboard handover panel isn't
-- empty on a fresh environment. Idempotent: guarded per-row on
-- (created_by, note) so re-running this script never duplicates rows.
--
-- Rollback whitelist tag: created_by = 'DASH_HANDOVER_SEED'.
do $$ begin
    if current_schema() is null or current_schema() in ('public', 'pg_catalog') then
        raise exception 'Select the intended application schema before seeding crew_control_handover';
    end if;
end $$;

insert into crew_control_handover (created_by, updated_by, shift_label, author, severity, case_ref, note)
select 'DASH_HANDOVER_SEED', 'DASH_HANDOVER_SEED', 'Night', 'A. Bekele', 'critical', 'case-2',
       'ET2681 (pairing 152675) published delay — FDP over on Rule 3007. T2001 rejected FDP-discretion; standby callout prepared, 8 executable B787 CA reserves. Next shift to pick a reserve.'
where not exists (
    select 1 from crew_control_handover
    where created_by = 'DASH_HANDOVER_SEED'
      and note = 'ET2681 (pairing 152675) published delay — FDP over on Rule 3007. T2001 rejected FDP-discretion; standby callout prepared, 8 executable B787 CA reserves. Next shift to pick a reserve.'
);

insert into crew_control_handover (created_by, updated_by, shift_label, author, severity, case_ref, note)
select 'DASH_HANDOVER_SEED', 'DASH_HANDOVER_SEED', 'Night', 'A. Bekele', 'watch', 'case-3',
       'Pairing 152227 (ET452/ET453) fleet change 788->7M8 — Rule 8004, rostered crew unqualified. Standby callout fleet-filtered to 7M8, 8 executable. Decision pending.'
where not exists (
    select 1 from crew_control_handover
    where created_by = 'DASH_HANDOVER_SEED'
      and note = 'Pairing 152227 (ET452/ET453) fleet change 788->7M8 — Rule 8004, rostered crew unqualified. Standby callout fleet-filtered to 7M8, 8 executable. Decision pending.'
);

insert into crew_control_handover (created_by, updated_by, shift_label, author, severity, case_ref, note)
select 'DASH_HANDOVER_SEED', 'DASH_HANDOVER_SEED', 'Day', 'S. Tadesse', 'info', 'case-1',
       'J4002 ILL absence overlaps pairing 152056 flying duty (Rule 1001). Retained flying duty; standby callout ready, 9 executable 7M8 CA reserves. FYI only.'
where not exists (
    select 1 from crew_control_handover
    where created_by = 'DASH_HANDOVER_SEED'
      and note = 'J4002 ILL absence overlaps pairing 152056 flying duty (Rule 1001). Retained flying duty; standby callout ready, 9 executable 7M8 CA reserves. FYI only.'
);

-- rollback: delete from crew_control_handover where created_by='DASH_HANDOVER_SEED';
