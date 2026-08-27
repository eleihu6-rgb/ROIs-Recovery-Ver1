\set ON_ERROR_STOP on

\if :{?live_schema}
\else
\echo 'ERROR: live_schema is required (example: psql -v live_schema=f8_sit_live -f sql/migration/2026-08-12-drop-bid-feedback-team-rule-snapshot.sql)'
\quit 3
\endif

begin;

select set_config('pbs.bid_feedback_snapshot_cleanup_schema', :'live_schema', true);

do $migration$
declare
  target_schema text := current_setting('pbs.bid_feedback_snapshot_cleanup_schema');
  snapshot_table_exists boolean;
  snapshot_rows bigint;
  snapshot_ref_rows bigint;
  snapshot_column_exists boolean;
  related_constraints jsonb;
begin
  if target_schema not in ('f8', 'f8_sit_live', 'f8_uat_live') then
    raise exception
      'live_schema must be one of f8, f8_sit_live, f8_uat_live; received %',
      target_schema;
  end if;

  if to_regnamespace(target_schema) is null then
    raise exception 'Live schema does not exist: %', target_schema;
  end if;

  if to_regclass(format('%I.roster_flight', target_schema)) is null then
    raise exception '%.roster_flight does not exist; refusing snapshot cleanup', target_schema;
  end if;

  snapshot_table_exists := to_regclass(format('%I.scenario_roster_publish_snapshot', target_schema)) is not null;

  select exists (
    select 1
      from information_schema.columns
     where table_schema = target_schema
       and table_name = 'roster_flight'
       and column_name = 'scenario_publish_snapshot_id'
  )
  into snapshot_column_exists;

  if snapshot_table_exists then
    execute format('select count(*) from %I.scenario_roster_publish_snapshot', target_schema)
      into snapshot_rows;
  end if;

  if snapshot_column_exists then
    execute format(
      'select count(*) from %I.roster_flight where scenario_publish_snapshot_id is not null',
      target_schema
    )
      into snapshot_ref_rows;

    select coalesce(
      jsonb_agg(jsonb_build_object(
        'table', table_class.relname,
        'constraint', constraint_info.conname,
        'type', constraint_info.contype
      ) order by constraint_info.conname),
      '[]'::jsonb
    )
    into related_constraints
    from pg_constraint constraint_info
    join pg_class table_class
      on table_class.oid = constraint_info.conrelid
    where constraint_info.conrelid = to_regclass(format('%I.roster_flight', target_schema))
      and exists (
        select 1
          from pg_attribute attribute_info
         where attribute_info.attrelid = constraint_info.conrelid
           and attribute_info.attname = 'scenario_publish_snapshot_id'
           and attribute_info.attnum = any (constraint_info.conkey)
      );
  else
    related_constraints := '[]'::jsonb;
  end if;

  raise notice
    'Cleaning Bid Feedback Team Rule snapshot objects in schema=%; snapshot_table_exists=%; snapshot_rows=%; roster_flight_refs=%; column_constraints=%',
    target_schema,
    snapshot_table_exists,
    snapshot_rows,
    snapshot_ref_rows,
    related_constraints;

  execute format('drop view if exists %I.pbs_bid_feedback_team_rule_source', target_schema);

  execute format('drop index if exists %I.idx_roster_flight_crew_scenario_snapshot', target_schema);
  execute format('drop index if exists %I.idx_scenario_roster_publish_snapshot_period', target_schema);

  -- CASCADE intentionally removes FK/index/view dependencies tied to the column
  -- without assuming environment-specific constraint names are identical.
  execute format(
    'alter table if exists %I.roster_flight drop column if exists scenario_publish_snapshot_id cascade',
    target_schema
  );

  execute format('drop table if exists %I.scenario_roster_publish_snapshot', target_schema);
end;
$migration$;

commit;
