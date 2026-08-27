\set ON_ERROR_STOP on

\if :{?live_schema}
\else
\echo 'ERROR: live_schema is required (example: psql -v live_schema=f8_sit_live -f sql/migration/tests/2026-08-12-drop-bid-feedback-team-rule-snapshot-preflight.sql)'
\quit 3
\endif

-- Read-only deployment preflight.
-- This preflight is idempotent: old snapshot objects may already be absent.
-- It fails only when the target schema gate is invalid or roster_flight is missing.
begin read only;

select set_config('pbs.bid_feedback_snapshot_cleanup_schema', :'live_schema', true);

do $preflight$
declare
  target_schema text := current_setting('pbs.bid_feedback_snapshot_cleanup_schema');
  roster_relation oid;
  snapshot_relation oid;
  view_relation oid;
  snapshot_column_attnum smallint;
  snapshot_column_exists boolean;
  snapshot_rows bigint;
  snapshot_ref_rows bigint;
  snapshot_indexes jsonb;
  related_constraints jsonb;
  related_dependencies jsonb;
begin
  if target_schema not in ('f8', 'f8_sit_live', 'f8_uat_live') then
    raise exception
      'live_schema must be one of f8, f8_sit_live, f8_uat_live; received %',
      target_schema;
  end if;

  if to_regnamespace(target_schema) is null then
    raise exception 'Live schema does not exist: %', target_schema;
  end if;

  roster_relation := to_regclass(format('%I.roster_flight', target_schema));
  snapshot_relation := to_regclass(format('%I.scenario_roster_publish_snapshot', target_schema));
  view_relation := to_regclass(format('%I.pbs_bid_feedback_team_rule_source', target_schema));

  if roster_relation is null then
    raise exception '%.roster_flight does not exist; refusing snapshot cleanup preflight', target_schema;
  end if;

  select attribute_info.attnum
    from pg_attribute attribute_info
   where attribute_info.attrelid = roster_relation
     and attribute_info.attname = 'scenario_publish_snapshot_id'
     and not attribute_info.attisdropped
  into snapshot_column_attnum;

  snapshot_column_exists := snapshot_column_attnum is not null;

  if snapshot_relation is not null then
    execute format('select count(*) from %I.scenario_roster_publish_snapshot', target_schema)
      into snapshot_rows;
  end if;

  if snapshot_column_exists then
    execute format(
      'select count(*) from %I.roster_flight where scenario_publish_snapshot_id is not null',
      target_schema
    )
      into snapshot_ref_rows;
  end if;

  select coalesce(
    jsonb_agg(indexname order by indexname),
    '[]'::jsonb
  )
  into snapshot_indexes
  from pg_indexes
  where schemaname = target_schema
    and indexname in (
      'idx_roster_flight_crew_scenario_snapshot',
      'idx_scenario_roster_publish_snapshot_period'
    );

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
  where (
      snapshot_column_exists
      and constraint_info.conrelid = roster_relation
      and snapshot_column_attnum = any (constraint_info.conkey)
    )
     or (
      snapshot_relation is not null
      and constraint_info.confrelid = snapshot_relation
    );

  select coalesce(
    jsonb_agg(distinct jsonb_build_object(
      'dependent', pg_describe_object(dependency_info.classid, dependency_info.objid, dependency_info.objsubid),
      'referenced', pg_describe_object(dependency_info.refclassid, dependency_info.refobjid, dependency_info.refobjsubid),
      'deptype', dependency_info.deptype
    )),
    '[]'::jsonb
  )
  into related_dependencies
  from pg_depend dependency_info
  where (
      snapshot_relation is not null
      and dependency_info.refobjid = snapshot_relation
    )
     or (
      view_relation is not null
      and dependency_info.refobjid = view_relation
    )
     or (
      snapshot_column_exists
      and dependency_info.refobjid = roster_relation
      and dependency_info.refobjsubid = snapshot_column_attnum
    );

  raise notice 'Bid Feedback snapshot cleanup preflight target_schema=%', target_schema;
  raise notice
    'objects: roster_flight=true, snapshot_table=%, roster_flight_snapshot_column=%, source_view=%, indexes=%',
    snapshot_relation is not null,
    snapshot_column_exists,
    view_relation is not null,
    snapshot_indexes;
  raise notice
    'counts: snapshot_rows=%, roster_flight_non_null_snapshot_refs=%',
    coalesce(snapshot_rows::text, 'n/a'),
    coalesce(snapshot_ref_rows::text, 'n/a');
  raise notice 'related_constraints=%', related_constraints;
  raise notice 'related_dependencies=%', related_dependencies;
end;
$preflight$;

commit;
