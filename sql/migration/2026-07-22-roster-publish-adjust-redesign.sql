-- Date: 2026-07-22
-- Purpose: Redesign roster_publish_adjust for Publish Roster outbound callback tasks.
-- Background: Each Publish Roster apply operation records old/new roster snapshots
-- with a shared batch_id so a later scheduled callback can transmit pending rows.
-- Usage: Run under the target live schema search_path, for example f8.

drop table if exists roster_publish_adjust cascade;

create table roster_publish_adjust (
    id int8 generated always as identity(
        increment by 1
        minvalue 1
        maxvalue 9223372036854775807
        start 1
        cache 1
        no cycle
    ) not null,
    created_by varchar(30) default 'system'::character varying not null,
    created_at timestamp default now() not null,
    updated_by varchar(30) default 'system'::character varying not null,
    updated_at timestamp default now() not null,
    batch_id int8 not null,
    rp_start timestamp null,
    rp_end timestamp null,
    published_dt timestamp null,
    filiale varchar(20) null,
    division varchar(20) null,
    action_type varchar(20) null,
    crew_id varchar(30) null,
    old_roster_flight_id int8 null,
    old_pairing_id int8 null,
    old_pair_interface_id varchar(100) null,
    old_flt_id int8 null,
    old_base varchar(3) null,
    old_sch_str_dt_utc timestamp null,
    old_sch_end_dt_utc timestamp null,
    old_act_str_dt_utc timestamp null,
    old_act_end_dt_utc timestamp null,
    old_dep_arp varchar(3) null,
    old_arv_arp varchar(3) null,
    old_assignment_group varchar(20) null,
    old_assignment varchar(20) null,
    old_roster_acting_rank varchar(10) null,
    old_flight_acting_rank varchar(10) null,
    old_active_rank varchar(10) null,
    old_position varchar(10) null,
    old_role varchar(30) null,
    old_course_code varchar(30) null,
    old_resource_code varchar(30) null,
    old_seq_order int2 null,
    old_brief_start_utc timestamp null,
    old_brief_end_utc timestamp null,
    new_roster_flight_id int8 null,
    new_pairing_id int8 null,
    new_pair_interface_id varchar(100) null,
    new_flt_id int8 null,
    new_base varchar(3) null,
    new_sch_str_dt_utc timestamp null,
    new_sch_end_dt_utc timestamp null,
    new_act_str_dt_utc timestamp null,
    new_act_end_dt_utc timestamp null,
    new_dep_arp varchar(3) null,
    new_arv_arp varchar(3) null,
    new_assignment_group varchar(20) null,
    new_assignment varchar(20) null,
    new_roster_acting_rank varchar(10) null,
    new_flight_acting_rank varchar(10) null,
    new_active_rank varchar(10) null,
    new_position varchar(10) null,
    new_role varchar(30) null,
    new_course_code varchar(30) null,
    new_resource_code varchar(30) null,
    new_seq_order int2 null,
    new_brief_start_utc timestamp null,
    new_brief_end_utc timestamp null,
    published int2 null,
    constraint chk_roster_publish_adjust_filiale_upper check (((filiale)::text = upper((filiale)::text))),
    constraint roster_publish_adjust_pkey primary key (id)
);

create index idx_roster_pub_adj_published on roster_publish_adjust (published);
create index idx_roster_pub_adj_batch on roster_publish_adjust (batch_id);
create index idx_roster_pub_adj_crew_created on roster_publish_adjust (crew_id, created_at);

comment on table roster_publish_adjust is 'Publish Roster old/new snapshot rows pending outbound callback';
comment on column roster_publish_adjust.batch_id is 'Shared publish apply batch id';
comment on column roster_publish_adjust.action_type is 'Publish diff action: ADD, UPDATE, DELETE';
comment on column roster_publish_adjust.published is 'Callback status: 0=pending, 1=sent';
