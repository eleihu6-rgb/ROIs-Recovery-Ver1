create table if not exists scenario_parameter (
  id bigint generated always as identity primary key,
  created_by varchar(30) default 'system' not null,
  created_at timestamp default now() not null,
  updated_by varchar(30) default 'system' not null,
  updated_at timestamp default now() not null,
  scenario_id bigint default 0 not null,
  code varchar(200) not null,
  param_val jsonb default '{}'::jsonb not null,
  description varchar(300),
  idx int,
  type varchar(50)
);

create unique index if not exists uq_scenario_parameter_code
  on scenario_parameter (scenario_id, code);

create index if not exists ix_scenario_parameter_list
  on scenario_parameter (scenario_id, idx, code);

insert into scenario_parameter (scenario_id, code, param_val, description, idx, type)
values
  (
    0,
    'solver_limits',
    '{
      "schema": {
        "maxIterations": {"type": "number", "label": "Max Iterations", "min": 1},
        "enableReserve": {"type": "boolean", "label": "Enable Reserve"}
      },
      "defaultValue": {"maxIterations": 100, "enableReserve": true}
    }'::jsonb,
    'Limits used by optimization',
    10,
    'OBJ'
  ),
  (
    0,
    'solver_csv_overrides',
    '{
      "schema": {"format": "csv", "label": "CSV Overrides"},
      "defaultValue": {"csv": ""}
    }'::jsonb,
    'CSV-style solver override data',
    20,
    'LIST'
  )
on conflict (scenario_id, code) do nothing;
