-- Date: 2026-07-22
-- Purpose: Persist every Publish Roster outbound callback request and response.
-- Background: Operators need per-attempt payload and external API response logs
-- for troubleshooting callback data and downstream errors.
-- Usage: Run under the target live schema search_path, for example f8.

create table if not exists roster_publish_outbound_log (
    id bigint generated always as identity primary key,
    created_by varchar(30) not null default 'system',
    created_at timestamp not null default now(),
    updated_by varchar(30) not null default 'system',
    updated_at timestamp not null default now(),
    batch_id bigint not null,
    request_id varchar(80) not null,
    request_payload jsonb not null,
    response_status int,
    response_body text,
    error_message text,
    duration_ms int,
    success smallint not null default 0,
    constraint chk_roster_pub_out_log_success check (success in (0, 1))
);

create index if not exists idx_roster_pub_out_log_batch
    on roster_publish_outbound_log (batch_id, created_at);

create index if not exists idx_roster_pub_out_log_request
    on roster_publish_outbound_log (request_id, created_at);

create index if not exists idx_roster_pub_out_log_success
    on roster_publish_outbound_log (success, created_at);

comment on table roster_publish_outbound_log is 'Publish Roster outbound callback request/response history';
comment on column roster_publish_outbound_log.batch_id is 'roster_publish_adjust.batch_id for the callback batch';
comment on column roster_publish_outbound_log.request_payload is 'Full outbound callback JSON payload sent to the external API';
comment on column roster_publish_outbound_log.response_body is 'Raw external API response body';
comment on column roster_publish_outbound_log.success is '1=HTTP success, 0=HTTP/network failure';
