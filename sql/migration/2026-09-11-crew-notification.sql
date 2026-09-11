-- Crew-app notification feed for Altair Live (F8/ET).
--
-- 背景: The crew app's notification feed was EK/EVACC only. F8/ET crew route to
-- live-server, which had no crew-app route at all, so the Alerts tab returned
-- 404. This adds the durable per-crew notification log that the live-server
-- crew-app v1 endpoints read and the Live mutation points write.
--
-- Additive and repeatable. Run with an explicit target search_path (the script
-- refuses to install into public/pg_catalog). No changes to existing tables.
do $$ begin
    if current_schema() is null or current_schema() in ('public', 'pg_catalog') then
        raise exception 'Select the intended application schema before installing crew notifications';
    end if;
end $$;

create table if not exists crew_notification (
    seq bigint generated always as identity primary key,
    airline varchar(4) not null,
    crew_id varchar(30) not null,
    notif_id varchar(64) not null,
    notif_type varchar(32) not null,
    created_utc timestamptz not null default now(),
    title text not null,
    body text not null default '',
    status varchar(8) not null default 'unread',
    read_utc timestamptz,
    related_pairing_id varchar(32),
    related_flight_id varchar(32),
    related_duty_id varchar(64),
    payload jsonb not null default '{}'::jsonb,
    constraint crew_notification_status_chk check (status in ('unread', 'read')),
    constraint crew_notification_payload_chk check (jsonb_typeof(payload) = 'object')
);

-- notif_id is the idempotency key: a replayed commit must not create a second row.
create unique index if not exists crew_notification_notif_id_uidx
    on crew_notification (notif_id);

-- The app's single poll: rows for one crew after a cursor.
create index if not exists crew_notification_crew_seq_idx
    on crew_notification (airline, crew_id, seq);

comment on table crew_notification is
    'Crew-app notification log for Altair Live (F8/ET). Durable history, no TTL.';
