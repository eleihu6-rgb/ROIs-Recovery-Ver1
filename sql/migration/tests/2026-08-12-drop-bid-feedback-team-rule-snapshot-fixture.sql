\set ON_ERROR_STOP on

\if :{?live_schema}
\else
\echo 'ERROR: live_schema is required (example: psql -v live_schema=f8 -f sql/migration/tests/2026-08-12-drop-bid-feedback-team-rule-snapshot-fixture.sql)'
\quit 3
\endif

begin;

select set_config('pbs.bid_feedback_snapshot_cleanup_schema', :'live_schema', true);

do $fixture$
declare
  target_schema text := current_setting('pbs.bid_feedback_snapshot_cleanup_schema');
  snapshot_id bigint;
begin
  if target_schema not in ('f8', 'f8_sit_live', 'f8_uat_live') then
    raise exception
      'live_schema must be one of f8, f8_sit_live, f8_uat_live; received %',
      target_schema;
  end if;

  execute format('create schema if not exists %I', target_schema);

  execute format(
    'create table if not exists %I.roster_period (
      id bigint generated always as identity primary key,
      roster_period varchar(20),
      rp_start timestamp,
      rp_end timestamp,
      created_by varchar(30) not null default ''system'',
      created_at timestamptz not null default now(),
      updated_by varchar(30) not null default ''system'',
      updated_at timestamptz not null default now()
    )',
    target_schema
  );

  execute format(
    'create table if not exists %I.scenario_roster_publish_snapshot (
      id bigint generated always as identity primary key,
      created_by varchar(30) not null default ''system'',
      created_at timestamptz not null default now(),
      updated_by varchar(30) not null default ''system'',
      updated_at timestamptz not null default now(),
      scenario_id bigint not null,
      scenario_task_id varchar(64) not null,
      scenario_version varchar(20) not null,
      roster_period_id bigint,
      rp_start timestamp not null,
      rp_end timestamp not null,
      team_rules_hash varchar(64) not null,
      team_rules jsonb not null
    )',
    target_schema
  );

  execute format(
    'create table if not exists %I.roster_flight (
      id bigint generated always as identity primary key,
      crew_id varchar(30),
      request_source varchar(20),
      is_deleted smallint not null default 0,
      created_by varchar(30) not null default ''system'',
      created_at timestamptz not null default now(),
      updated_by varchar(30) not null default ''system'',
      updated_at timestamptz not null default now()
    )',
    target_schema
  );

  execute format(
    'alter table %I.roster_flight add column if not exists scenario_publish_snapshot_id bigint',
    target_schema
  );

  if not exists (
    select 1
      from pg_constraint
     where connamespace = to_regnamespace(target_schema)
       and conname = 'fk_roster_flight_scenario_publish_snapshot_fixture'
  ) then
    execute format(
      'alter table %I.roster_flight
         add constraint fk_roster_flight_scenario_publish_snapshot_fixture
         foreign key (scenario_publish_snapshot_id)
         references %I.scenario_roster_publish_snapshot(id)',
      target_schema,
      target_schema
    );
  end if;

  execute format(
    'create index if not exists idx_scenario_roster_publish_snapshot_period
       on %I.scenario_roster_publish_snapshot (roster_period_id, scenario_id)',
    target_schema
  );

  execute format(
    'create index if not exists idx_roster_flight_crew_scenario_snapshot
       on %I.roster_flight (crew_id, scenario_publish_snapshot_id)
       where is_deleted = 0
         and request_source = ''SCENARIO''
         and scenario_publish_snapshot_id is not null',
    target_schema
  );

  execute format(
    'insert into %I.scenario_roster_publish_snapshot (
       scenario_id,
       scenario_task_id,
       scenario_version,
       roster_period_id,
       rp_start,
       rp_end,
       team_rules_hash,
       team_rules
     )
     select 1, ''fixture-2026-08-12'', ''v1'', null, timestamp ''2026-06-01'', timestamp ''2026-06-30'', ''fixture'', ''{}''::jsonb
     where not exists (
       select 1
         from %I.scenario_roster_publish_snapshot
        where scenario_task_id = ''fixture-2026-08-12''
     )',
    target_schema,
    target_schema
  );

  execute format(
    'select id
       from %I.scenario_roster_publish_snapshot
      where scenario_task_id = ''fixture-2026-08-12''
      order by id
      limit 1',
    target_schema
  )
  into snapshot_id;

  execute format(
    'insert into %I.roster_flight (
       crew_id,
       request_source,
       is_deleted,
       scenario_publish_snapshot_id
     )
     select ''fixture-crew-2026-08-12'', ''SCENARIO'', 0, $1
     where not exists (
       select 1
         from %I.roster_flight
        where crew_id = ''fixture-crew-2026-08-12''
          and request_source = ''SCENARIO''
     )',
    target_schema,
    target_schema
  )
  using snapshot_id;

  execute format(
    'create or replace view %I.pbs_bid_feedback_team_rule_source as
     select
       rf.crew_id,
       snapshot.id as snapshot_id,
       snapshot.team_rules_hash,
       snapshot.team_rules
     from %I.roster_flight rf
     join %I.scenario_roster_publish_snapshot snapshot
       on snapshot.id = rf.scenario_publish_snapshot_id
     where rf.is_deleted = 0
       and rf.request_source = ''SCENARIO''',
    target_schema,
    target_schema,
    target_schema
  );
end;
$fixture$;

commit;
