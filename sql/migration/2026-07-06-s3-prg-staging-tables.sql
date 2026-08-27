-- S3 PRG formal staging tables for PO pairing import.
-- Apply under a connection whose search_path includes the airline schema.

create schema if not exists scenario;

create table if not exists scenario.s3_prg_import_batch (
    id bigint generated always as identity primary key,
    scenario_id bigint not null,
    file_name varchar(255) not null,
    file_checksum varchar(128) not null,
    pairing_record_count integer not null default 0,
    online_segment_record_count integer not null default 0,
    duty_record_count integer not null default 0,
    offline_segment_record_count integer not null default 0,
    warning_count integer not null default 0,
    warnings jsonb not null default '[]'::jsonb,
    created_by varchar(50) not null default 'system',
    created_at timestamp not null default now(),
    updated_by varchar(50) not null default 'system',
    updated_at timestamp not null default now()
);

create table if not exists scenario.s3_prg_pairing_record (
    id bigint generated always as identity primary key,
    batch_id bigint not null references scenario.s3_prg_import_batch(id) on delete cascade,
    scenario_id bigint not null,
    raw_line_no integer not null,
    raw_line text not null,
    pairing_number varchar(20) not null,
    pairing_date char(8) not null,
    effective_from_date char(8) not null,
    effective_to_date char(8) not null,
    frequency varchar(10) not null,
    pairing_no_op_dates_raw text not null,
    report_date char(8) not null,
    report_minutes integer not null,
    pairing_end_date char(8) not null,
    pairing_end_minutes integer not null,
    first_flight_number varchar(20) not null,
    first_departure_minutes integer not null,
    duty_count integer not null,
    tafb_minutes integer not null,
    standup_overnight_indicator varchar(1) not null,
    positions_raw text not null,
    rest_required_after_pairing_minutes integer not null,
    total_block_minutes integer not null,
    deadhead_credit_minutes integer not null,
    language_positions_raw text not null,
    created_by varchar(50) not null default 'system',
    created_at timestamp not null default now(),
    updated_by varchar(50) not null default 'system',
    updated_at timestamp not null default now()
);

create table if not exists scenario.s3_prg_online_segment_record (
    id bigint generated always as identity primary key,
    batch_id bigint not null references scenario.s3_prg_import_batch(id) on delete cascade,
    scenario_id bigint not null,
    raw_line_no integer not null,
    raw_line text not null,
    pairing_number varchar(20) not null,
    pairing_date char(8) not null,
    flight_number varchar(20) not null,
    flight_segment_date char(8) not null,
    departure_airport varchar(3) not null,
    departure_date char(8) not null,
    departure_minutes integer not null,
    arrival_airport varchar(3) not null,
    arrival_date char(8) not null,
    arrival_minutes integer not null,
    pairing_sequence_number integer not null,
    deadhead_indicator varchar(1) not null,
    leg_break_indicator varchar(1) not null,
    far_domestic_international_indicator varchar(1) not null,
    block_minutes integer not null,
    block_crossover_minutes integer not null,
    leg_credit_minutes integer not null,
    leg_deadhead_pay_minutes integer not null,
    far_type varchar(1) not null,
    pilot_crew_complement integer,
    departure_utc_offset_minutes integer,
    arrival_utc_offset_minutes integer,
    equipment_type varchar(10) not null,
    contract_domestic_international_indicator varchar(1) not null,
    created_by varchar(50) not null default 'system',
    created_at timestamp not null default now(),
    updated_by varchar(50) not null default 'system',
    updated_at timestamp not null default now()
);

create table if not exists scenario.s3_prg_duty_record (
    id bigint generated always as identity primary key,
    batch_id bigint not null references scenario.s3_prg_import_batch(id) on delete cascade,
    scenario_id bigint not null,
    raw_line_no integer not null,
    raw_line text not null,
    pairing_number varchar(20) not null,
    pairing_date char(8) not null,
    pairing_sequence_number integer not null,
    duty_period_number integer not null,
    duty_start_date char(8) not null,
    duty_start_minutes integer not null,
    duty_end_date char(8) not null,
    duty_end_minutes integer not null,
    far_domestic_international_indicator varchar(1) not null,
    scheduled_duty_minutes integer not null,
    scheduled_layover_minutes integer,
    layover_city varchar(3) not null,
    hotel_name text not null,
    hotel_phone_number varchar(30) not null,
    rest_far_type varchar(2) not null,
    rest_far_type_number varchar(1) not null,
    rest_far_must_begin_minutes integer,
    rest_far_required_minutes integer,
    duty_period_guarantee_minutes integer,
    total_block_minutes integer not null,
    total_deadhead_credit_minutes integer not null,
    total_deadhead_pay_minutes integer not null,
    total_duty_credit_minutes integer not null,
    total_duty_pay_minutes integer not null,
    duty_period_type_day_night varchar(1) not null,
    fatigue_units_raw varchar(10) not null,
    created_by varchar(50) not null default 'system',
    created_at timestamp not null default now(),
    updated_by varchar(50) not null default 'system',
    updated_at timestamp not null default now()
);

create table if not exists scenario.s3_prg_offline_segment_record (
    id bigint generated always as identity primary key,
    batch_id bigint not null references scenario.s3_prg_import_batch(id) on delete cascade,
    scenario_id bigint not null,
    raw_line_no integer not null,
    raw_line text not null,
    pairing_number varchar(20) not null,
    pairing_date char(8) not null,
    pairing_sequence_number integer not null,
    carrier varchar(10) not null,
    transport_code varchar(10) not null,
    flight_segment_date char(8) not null,
    departure_airport varchar(3) not null,
    departure_date char(8) not null,
    departure_minutes integer not null,
    arrival_airport varchar(3) not null,
    arrival_date char(8) not null,
    arrival_minutes integer not null,
    tail_assignment varchar(10) not null,
    assignment varchar(20) not null,
    created_by varchar(50) not null default 'system',
    created_at timestamp not null default now(),
    updated_by varchar(50) not null default 'system',
    updated_at timestamp not null default now()
);

create index if not exists idx_s3_prg_import_batch_scenario_id_id
    on scenario.s3_prg_import_batch (scenario_id, id desc);
create index if not exists idx_s3_prg_import_batch_file_checksum
    on scenario.s3_prg_import_batch (file_checksum);

create index if not exists idx_s3_prg_pairing_record_batch_id
    on scenario.s3_prg_pairing_record (batch_id);
create index if not exists idx_s3_prg_pairing_record_scenario_pairing
    on scenario.s3_prg_pairing_record (scenario_id, pairing_number, pairing_date);

create index if not exists idx_s3_prg_online_segment_record_batch_id
    on scenario.s3_prg_online_segment_record (batch_id);
create index if not exists idx_s3_prg_online_segment_record_scenario_pairing
    on scenario.s3_prg_online_segment_record (scenario_id, pairing_number, pairing_date, pairing_sequence_number);

create index if not exists idx_s3_prg_duty_record_batch_id
    on scenario.s3_prg_duty_record (batch_id);
create index if not exists idx_s3_prg_duty_record_scenario_pairing
    on scenario.s3_prg_duty_record (scenario_id, pairing_number, pairing_date, duty_period_number);

create index if not exists idx_s3_prg_offline_segment_record_batch_id
    on scenario.s3_prg_offline_segment_record (batch_id);
create index if not exists idx_s3_prg_offline_segment_record_scenario_pairing
    on scenario.s3_prg_offline_segment_record (scenario_id, pairing_number, pairing_date, pairing_sequence_number);
