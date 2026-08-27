-- 场景发布时固化 Team Rule 解析结果，PBS 仅通过只读视图消费。
-- 在目标 Live schema 的 search_path 下执行。

create table if not exists scenario_roster_publish_snapshot (
    id                    bigint       generated always as identity primary key,
    created_by            varchar(30)  not null default 'system',
    created_at            timestamptz  not null default now(),
    updated_by            varchar(30)  not null default 'system',
    updated_at            timestamptz  not null default now(),
    scenario_id           bigint       not null,
    scenario_task_id      varchar(64)   not null,
    scenario_version      varchar(20)   not null,
    roster_period_id      bigint       not null,
    rp_start              timestamp    not null,
    rp_end                timestamp    not null,
    team_rules_hash       varchar(64)   not null,
    team_rules            jsonb         not null
);

create unique index if not exists uq_scenario_roster_publish_snapshot
    on scenario_roster_publish_snapshot
    (scenario_id, scenario_task_id, scenario_version, roster_period_id, team_rules_hash);

create index if not exists idx_scenario_roster_publish_snapshot_period
    on scenario_roster_publish_snapshot (roster_period_id, scenario_id);

alter table roster_flight
    add column if not exists scenario_publish_snapshot_id bigint;

create index if not exists idx_roster_flight_crew_scenario_snapshot
    on roster_flight (crew_id, scenario_publish_snapshot_id)
    where is_deleted = 0
      and request_source = 'SCENARIO'
      and scenario_publish_snapshot_id is not null;

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conrelid = 'scenario_roster_publish_snapshot'::regclass
          and conname = 'fk_scenario_publish_snapshot_roster_period'
    ) then
        alter table scenario_roster_publish_snapshot
            add constraint fk_scenario_publish_snapshot_roster_period
            foreign key (roster_period_id) references roster_period(id);
    end if;
    if not exists (
        select 1 from pg_constraint
        where conrelid = 'roster_flight'::regclass
          and conname = 'fk_roster_flight_scenario_publish_snapshot'
    ) then
        alter table roster_flight
            add constraint fk_roster_flight_scenario_publish_snapshot
            foreign key (scenario_publish_snapshot_id) references scenario_roster_publish_snapshot(id);
    end if;
end
$$;

comment on table scenario_roster_publish_snapshot is
    'Live 场景发布时固化的 Team Rule 解析结果，供 PBS Bid Feedback 只读复现';
comment on column roster_flight.scenario_publish_snapshot_id is
    '关联 scenario_roster_publish_snapshot.id；仅 Scenario 发布写入';

create or replace view pbs_bid_feedback_team_rule_source as
select distinct
    rf.crew_id,
    snapshot.id as snapshot_id,
    snapshot.scenario_id,
    snapshot.scenario_task_id,
    snapshot.scenario_version,
    snapshot.roster_period_id,
    snapshot.rp_start,
    snapshot.rp_end,
    snapshot.team_rules_hash,
    snapshot.team_rules
from roster_flight rf
join scenario_roster_publish_snapshot snapshot
  on snapshot.id = rf.scenario_publish_snapshot_id
where rf.is_deleted = 0
  and rf.request_source = 'SCENARIO';

comment on view pbs_bid_feedback_team_rule_source is
    'PBS Bid Feedback 可读取的 Live 场景 Team Rule 发布快照边界';

do $$
declare
    current_schema_name text := current_schema();
    pbs_role_name text := regexp_replace(current_schema(), '_live$', '_pbs');
begin
    if pbs_role_name = current_schema_name then
        pbs_role_name := current_schema_name || '_pbs';
    end if;
    if to_regrole(pbs_role_name) is not null then
        execute format('grant select on %I.pbs_bid_feedback_team_rule_source to %I', current_schema_name, pbs_role_name);
    end if;
end
$$;
