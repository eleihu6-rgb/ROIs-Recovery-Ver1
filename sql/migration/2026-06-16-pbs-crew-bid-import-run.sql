-- ============================================================
-- PBS crew bid TXT import run tracking
-- ============================================================
-- Supports admin dry-run/import result reporting and run-scoped rollback.
-- Execute with search_path pointing at the target PBS schema.

create table if not exists pbs_crew_bid_import_run (
    id                         bigint       generated always as identity primary key,
    created_by                 varchar(30)  not null default 'system',
    created_at                 timestamptz  not null default now(),
    updated_by                 varchar(30)  not null default 'system',
    updated_at                 timestamptz  not null default now(),
    run_key                    varchar(36)  not null,
    mode                       varchar(20)  not null,
    status                     varchar(40)  not null,
    period_code                varchar(20)  not null,
    source_period_code         varchar(20),
    scope_json                 jsonb,
    options_json               jsonb,
    source_sha256              varchar(64)  not null,
    total_blocks               integer      not null default 0,
    total_crew                 integer      not null default 0,
    selected_crew              integer      not null default 0,
    ready_crew                 integer      not null default 0,
    imported_crew              integer      not null default 0,
    skipped_crew               integer      not null default 0,
    failed_crew                integer      not null default 0,
    parsed_preference_count    integer      not null default 0,
    importable_preference_count integer     not null default 0,
    imported_preference_count  integer      not null default 0,
    skipped_preference_count   integer      not null default 0,
    failed_preference_count    integer      not null default 0,
    matched_pairing_count      integer      not null default 0,
    unmatched_pairing_count    integer      not null default 0,
    started_at                 timestamptz  not null default now(),
    completed_at               timestamptz,
    rolled_back_at             timestamptz,
    rolled_back_by             varchar(30)
);

create unique index if not exists uq_pbs_crew_bid_import_run_key
    on pbs_crew_bid_import_run (run_key);
create index if not exists idx_pbs_crew_bid_import_run_period
    on pbs_crew_bid_import_run (period_code, created_at desc);

create table if not exists pbs_crew_bid_import_item (
    id                         bigint       generated always as identity primary key,
    created_by                 varchar(30)  not null default 'system',
    created_at                 timestamptz  not null default now(),
    updated_by                 varchar(30)  not null default 'system',
    updated_at                 timestamptz  not null default now(),
    run_id                     bigint       not null references pbs_crew_bid_import_run(id) on delete cascade,
    crew_id                    varchar(30)  not null,
    category                   varchar(40)  not null,
    bid_context                varchar(10)  not null,
    status                     varchar(20)  not null,
    parsed_preference_count    integer      not null default 0,
    importable_preference_count integer     not null default 0,
    imported_preference_count  integer      not null default 0,
    skipped_preference_count   integer      not null default 0,
    failed_preference_count    integer      not null default 0,
    matched_pairing_count      integer      not null default 0,
    unmatched_pairing_count    integer      not null default 0,
    imported_bid_id            bigint,
    message                    varchar(500)
);

create index if not exists idx_pbs_crew_bid_import_item_run
    on pbs_crew_bid_import_item (run_id);
create index if not exists idx_pbs_crew_bid_import_item_crew
    on pbs_crew_bid_import_item (crew_id);

create table if not exists pbs_crew_bid_import_problem (
    id                         bigint       generated always as identity primary key,
    created_by                 varchar(30)  not null default 'system',
    created_at                 timestamptz  not null default now(),
    updated_by                 varchar(30)  not null default 'system',
    updated_at                 timestamptz  not null default now(),
    run_id                     bigint       not null references pbs_crew_bid_import_run(id) on delete cascade,
    item_id                    bigint       references pbs_crew_bid_import_item(id) on delete cascade,
    crew_id                    varchar(30),
    category                   varchar(40),
    bid_context                varchar(10),
    source_line_number         integer,
    source_seq                 integer,
    severity                   varchar(20)  not null,
    problem_code               varchar(80)  not null,
    message                    varchar(500) not null,
    raw_text                   text
);

create index if not exists idx_pbs_crew_bid_import_problem_run
    on pbs_crew_bid_import_problem (run_id);
create index if not exists idx_pbs_crew_bid_import_problem_crew
    on pbs_crew_bid_import_problem (crew_id);

create table if not exists pbs_crew_bid_import_backup (
    id                         bigint       generated always as identity primary key,
    created_by                 varchar(30)  not null default 'system',
    created_at                 timestamptz  not null default now(),
    updated_by                 varchar(30)  not null default 'system',
    updated_at                 timestamptz  not null default now(),
    run_id                     bigint       not null references pbs_crew_bid_import_run(id) on delete cascade,
    crew_id                    varchar(30)  not null,
    period_code                varchar(20)  not null,
    previous_bid_id            bigint,
    imported_bid_id            bigint,
    previous_snapshot_json     jsonb,
    imported_snapshot_json     jsonb
);

create unique index if not exists uq_pbs_crew_bid_import_backup_run_crew
    on pbs_crew_bid_import_backup (run_id, crew_id);
create index if not exists idx_pbs_crew_bid_import_backup_imported_bid
    on pbs_crew_bid_import_backup (imported_bid_id);
