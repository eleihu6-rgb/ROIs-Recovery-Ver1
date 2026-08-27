\set ON_ERROR_STOP on

\if :{?live_schema}
\else
\echo 'ERROR: live_schema is required (example: psql -v live_schema=f8_sit_live -f sql/migration/tests/2026-08-12-drop-bid-feedback-team-rule-snapshot-verify.sql)'
\quit 3
\endif

begin;

select set_config('pbs.bid_feedback_snapshot_cleanup_schema', :'live_schema', true);

do $verify$
declare
  target_schema text := current_setting('pbs.bid_feedback_snapshot_cleanup_schema');
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
    raise exception '%.roster_flight does not exist; cleanup target cannot be verified', target_schema;
  end if;

  if to_regclass(format('%I.pbs_bid_feedback_team_rule_source', target_schema)) is not null then
    raise exception '%.pbs_bid_feedback_team_rule_source should not exist', target_schema;
  end if;

  if to_regclass(format('%I.scenario_roster_publish_snapshot', target_schema)) is not null then
    raise exception '%.scenario_roster_publish_snapshot should not exist', target_schema;
  end if;

  if exists (
    select 1
      from information_schema.columns
     where table_schema = target_schema
       and table_name = 'roster_flight'
       and column_name = 'scenario_publish_snapshot_id'
  ) then
    raise exception '%.roster_flight.scenario_publish_snapshot_id should not exist', target_schema;
  end if;

  if exists (
    select 1
      from pg_indexes
     where schemaname = target_schema
       and indexname in (
         'idx_roster_flight_crew_scenario_snapshot',
         'idx_scenario_roster_publish_snapshot_period'
       )
  ) then
    raise exception 'Bid Feedback snapshot indexes should not exist in %', target_schema;
  end if;

  raise notice 'Bid Feedback Team Rule snapshot cleanup verified for schema=%', target_schema;
end;
$verify$;

commit;
