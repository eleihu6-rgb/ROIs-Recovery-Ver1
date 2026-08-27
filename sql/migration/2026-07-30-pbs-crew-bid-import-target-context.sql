-- Track the source NPBS context separately from the actual PBS bid context
-- written by an import run.

alter table pbs_crew_bid_import_item
    add column if not exists target_bid_context varchar(24);

update pbs_crew_bid_import_item
set target_bid_context = 'Current'
where target_bid_context is null;

alter table pbs_crew_bid_import_item
    alter column target_bid_context set not null;

alter table pbs_crew_bid_import_problem
    add column if not exists target_bid_context varchar(24);

alter table pbs_crew_bid_import_backup
    add column if not exists target_bid_context varchar(24);

update pbs_crew_bid_import_backup
set target_bid_context = 'Current'
where target_bid_context is null;

alter table pbs_crew_bid_import_backup
    alter column target_bid_context set not null;

drop index if exists uq_pbs_crew_bid_import_backup_run_crew;

create unique index if not exists uq_pbs_crew_bid_import_backup_run_target
    on pbs_crew_bid_import_backup (run_id, crew_id, period_code, target_bid_context);

alter table pbs_crew_bid_import_item
    drop constraint if exists ck_pbs_crew_bid_import_item_target_context;

alter table pbs_crew_bid_import_item
    add constraint ck_pbs_crew_bid_import_item_target_context
    check (target_bid_context in ('Current', 'StandingLineholder', 'StandingReserve'));

alter table pbs_crew_bid_import_problem
    drop constraint if exists ck_pbs_crew_bid_import_problem_target_context;

alter table pbs_crew_bid_import_problem
    add constraint ck_pbs_crew_bid_import_problem_target_context
    check (
      target_bid_context is null
      or target_bid_context in ('Current', 'StandingLineholder', 'StandingReserve')
    );

alter table pbs_crew_bid_import_backup
    drop constraint if exists ck_pbs_crew_bid_import_backup_target_context;

alter table pbs_crew_bid_import_backup
    add constraint ck_pbs_crew_bid_import_backup_target_context
    check (target_bid_context in ('Current', 'StandingLineholder', 'StandingReserve'));

-- The import runs in live-server, whose environment-specific live role already
-- owns the import workflow grants. This new visibility-authority read needs the
-- same explicit cross-schema access.
do $$
declare
  live_role text := case current_schema()
    when 'f8_pbs' then 'f8'
    when 'f8_sit_pbs' then 'f8_sit_live'
    when 'f8_uat_pbs' then 'f8_uat_live'
    else null
  end;
begin
  if live_role is null then
    raise exception 'Unsupported PBS schema for crew bid import migration: %', current_schema();
  end if;

  execute format(
    'grant select on table %I.pbs_bid_property_context to %I',
    current_schema(),
    live_role
  );
end
$$;
