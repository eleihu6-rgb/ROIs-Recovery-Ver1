-- Crew control handover / shift book log for the Dashboard.
--
-- 背景: Controllers hand off between shifts with no durable shared log —
-- context (delay decisions, standby callouts in flight, pending confirms)
-- lives only in verbal handover or chat, and is lost between shifts. This
-- adds a shared, persisted handover log the Dashboard reads/writes via
-- GET/POST /api/dashboard/handover.
--
-- Additive and repeatable. Run with an explicit target search_path (the
-- script refuses to install into public/pg_catalog). No changes to existing
-- tables.
do $$ begin
    if current_schema() is null or current_schema() in ('public', 'pg_catalog') then
        raise exception 'Select the intended application schema before installing crew_control_handover';
    end if;
end $$;

create table if not exists crew_control_handover (
    id            bigint       generated always as identity primary key,
    created_by    varchar(30)  not null default 'system',
    created_at    timestamptz  not null default now(),
    updated_by    varchar(30)  not null default 'system',
    updated_at    timestamptz  not null default now(),
    filiale       varchar(6)   default 'F8',
    shift_label   varchar(30)  not null,
    author        varchar(60)  not null,
    severity      varchar(10)  not null default 'info',
    case_ref      varchar(20),
    note          text         not null,
    is_deleted    smallint     not null default 0,
    constraint crew_control_handover_severity_chk check (severity in ('info', 'watch', 'critical'))
);

create index if not exists idx_cch_created_at
    on crew_control_handover (created_at desc);

comment on table crew_control_handover is
    'Shared, persisted shift-handover log shown on the Dashboard. Durable history, no TTL.';
comment on column crew_control_handover.case_ref is
    'Optional cross-reference, e.g. a recovery case id (case-2) or a pairing id.';
comment on column crew_control_handover.severity is
    'Handover urgency: info | watch | critical (see crew_control_handover_severity_chk).';
