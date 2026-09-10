-- Additive, repeatable cost-library schema. Run with an explicit target search_path.
-- No data replication or changes to existing rule, crew, or roster tables.
do $$ begin
    if current_schema() is null or current_schema() in ('public', 'pg_catalog') then
        raise exception 'Select the intended application schema before installing cost library';
    end if;
end $$;

create table if not exists cost_type (
    id bigint generated always as identity primary key,
    type_code integer not null unique check (type_code > 0),
    name text not null,
    category_code text not null,
    calculator_code text not null,
    parameter_schema_json jsonb not null check (jsonb_typeof(parameter_schema_json) = 'object'),
    next_instance_no integer not null default 2 check (next_instance_no >= 2),
    created_by varchar(30) not null default 'system',
    created_at timestamptz not null default now(),
    updated_by varchar(30) not null default 'system',
    updated_at timestamptz not null default now()
);

create table if not exists cost_instance (
    id bigint generated always as identity primary key,
    cost_type_id bigint not null references cost_type(id) on delete restrict,
    instance_no integer not null check (instance_no >= 1),
    name text not null,
    source_instance_id bigint references cost_instance(id) on delete restrict,
    enabled boolean not null default true,
    created_by varchar(30) not null default 'system',
    created_at timestamptz not null default now(),
    updated_by varchar(30) not null default 'system',
    updated_at timestamptz not null default now(),
    constraint cost_instance_type_number_unique unique (cost_type_id, instance_no)
);

create table if not exists cost_revision (
    id bigint generated always as identity primary key,
    cost_instance_id bigint not null references cost_instance(id) on delete restrict,
    revision_no integer not null check (revision_no >= 1),
    calculator_code text not null,
    effective_from timestamptz not null,
    effective_to timestamptz,
    currency_code varchar(3) not null check (currency_code ~ '^[A-Z]{3}$'),
    unit_code text not null,
    unit_price numeric(18,6) check (unit_price >= 0),
    params_json jsonb not null default '{}'::jsonb check (jsonb_typeof(params_json) = 'object'),
    applicability_json jsonb not null default '{}'::jsonb check (jsonb_typeof(applicability_json) = 'object'),
    reference text not null default '',
    gh_policy_revision_id bigint references cost_revision(id) on delete restrict,
    created_by varchar(30) not null default 'system',
    created_at timestamptz not null default now(),
    updated_by varchar(30) not null default 'system',
    updated_at timestamptz not null default now(),
    constraint cost_revision_number_unique unique (cost_instance_id, revision_no),
    constraint cost_revision_instance_pair_unique unique (id, cost_instance_id),
    constraint cost_revision_effective_interval check (effective_to is null or effective_to > effective_from),
    constraint cost_revision_dependency_not_self check (gh_policy_revision_id is null or gh_policy_revision_id <> id),
    constraint cost_revision_standby_credit_only check (calculator_code <> 'standby' or (unit_price is null and gh_policy_revision_id is not null))
);

create table if not exists cost_set (
    id bigint generated always as identity primary key,
    name text not null,
    description text not null default '',
    division text not null default '',
    enabled boolean not null default true,
    is_default boolean not null default false,
    version integer not null default 1 check (version >= 1),
    created_by varchar(30) not null default 'system',
    created_at timestamptz not null default now(),
    updated_by varchar(30) not null default 'system',
    updated_at timestamptz not null default now()
);
create unique index if not exists cost_set_one_default on cost_set (is_default) where is_default;

create table if not exists cost_set_member (
    id bigint generated always as identity primary key,
    cost_set_id bigint not null references cost_set(id) on delete restrict,
    cost_instance_id bigint not null references cost_instance(id) on delete restrict,
    cost_revision_id bigint not null,
    enabled boolean not null default true,
    sort_order integer not null default 0,
    created_by varchar(30) not null default 'system',
    created_at timestamptz not null default now(),
    updated_by varchar(30) not null default 'system',
    updated_at timestamptz not null default now(),
    constraint cost_set_member_instance_unique unique (cost_set_id, cost_instance_id),
    constraint cost_set_member_revision_fk foreign key (cost_revision_id, cost_instance_id)
        references cost_revision(id, cost_instance_id) on delete restrict
);
create index if not exists cost_instance_source_idx on cost_instance (source_instance_id);
create index if not exists cost_revision_gh_policy_idx on cost_revision (gh_policy_revision_id);
create index if not exists cost_set_member_revision_idx on cost_set_member (cost_revision_id, cost_instance_id);
create index if not exists cost_set_member_instance_idx on cost_set_member (cost_instance_id);

comment on table cost_type is 'Cost calculator type catalogue; numeric display type and allowed parameter/calculator configuration';
comment on table cost_instance is 'Cost template (instance_no=1) or independently configurable copy';
comment on table cost_revision is 'Immutable saved cost configuration; sets pin revision IDs, never an implicit latest configuration';
comment on table cost_set is 'Named cost-library collection; inclusion is not automatic additive charging';
comment on table cost_set_member is 'Explicit set membership pinned to a revision of the same cost instance';
comment on column cost_type.next_instance_no is 'Transactionally allocated monotonic copy number; lock cost_type before incrementing';
comment on column cost_revision.unit_price is 'Currency per billing unit; null means unpriced, not zero; standby credit has no independent cash price';
comment on column cost_revision.gh_policy_revision_id is 'Exact guarantee configuration used by standby credit conversion; same currency, guarantee calculator only';
