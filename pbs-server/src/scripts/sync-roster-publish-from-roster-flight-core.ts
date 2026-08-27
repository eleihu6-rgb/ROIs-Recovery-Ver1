import { z } from "zod";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = new Map([
  ["jan", 0],
  ["feb", 1],
  ["mar", 2],
  ["apr", 3],
  ["may", 4],
  ["jun", 5],
  ["jul", 6],
  ["aug", 7],
  ["sep", 8],
  ["oct", 9],
  ["nov", 10],
  ["dec", 11],
]);

const identifierSchema = z.string()
  .min(1)
  .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, "must be a valid SQL identifier");

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  LIVE_SCHEMA: identifierSchema.default("f8"),
  PBS_SCHEMA: identifierSchema.default("f8_pbs"),
  PBS_ROSTER_PUBLISH_UPDATED_BY: z.string().trim().min(1).default("roster-publish-sync"),
});

export type RosterPublishSyncEnv = {
  databaseUrl: string;
  pbsSchema: string;
  liveSchema: string;
  filiale: string;
  updatedBy: string;
};

export type RosterPublishSyncCommand = {
  execute: boolean;
  fromDate: string;
  toDate: string;
  crewId: string | null;
  periodCode: string | null;
  sampleLimit: number;
};

export type RosterPublishSyncSummary = {
  candidateRows: number;
  validRows: number;
  invalidRows: number;
  duplicateSkippedRows: number;
  existingFlightConflictRows: number;
  plannedInsertRows: number;
  plannedUpdateRows: number;
  writableRows: number;
  affectedRows: number;
};

export type RosterPublishDuplicateSample = {
  fltId: string | null;
  crewId: string;
  rowCount: number;
  rosterIds: string[];
  pairingIds: Array<string | null>;
  labels: Array<string | null>;
};

type SummaryRow = Record<keyof RosterPublishSyncSummary, string | number | null>;

const assertIsoDate = (value: string, label: string) => {
  if (!ISO_DATE_PATTERN.test(value)) {
    throw new Error(`${label} must use YYYY-MM-DD.`);
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} is not a valid calendar date.`);
  }
};

const addMonths = (date: Date, months: number) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));

const formatIsoDate = (date: Date) => date.toISOString().slice(0, 10);

export const parsePeriodCodeRange = (periodCode: string) => {
  const match = periodCode.trim().match(/^([A-Za-z]{3})\s+(\d{4})$/);

  if (!match) {
    throw new Error('Period code must look like "Jun 2026".');
  }

  const monthIndex = MONTHS.get(match[1].toLowerCase());

  if (monthIndex === undefined) {
    throw new Error(`Unsupported period month: ${match[1]}.`);
  }

  const year = Number.parseInt(match[2], 10);
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = addMonths(start, 1);

  return {
    fromDate: formatIsoDate(start),
    toDate: formatIsoDate(end),
  };
};

const readOptionValue = (args: string[], index: number, name: string) => {
  const value = args[index + 1];

  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }

  return value;
};

export const parseRosterPublishSyncArgs = (args: string[]): RosterPublishSyncCommand => {
  let execute = false;
  let dryRun = false;
  let periodCode: string | null = null;
  let fromDate: string | null = null;
  let toDate: string | null = null;
  let crewId: string | null = null;
  let sampleLimit = 5;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--execute") {
      execute = true;
      continue;
    }

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === "--period-code") {
      periodCode = readOptionValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--period-code=")) {
      periodCode = arg.slice("--period-code=".length);
      continue;
    }

    if (arg === "--from") {
      fromDate = readOptionValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--from=")) {
      fromDate = arg.slice("--from=".length);
      continue;
    }

    if (arg === "--to") {
      toDate = readOptionValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--to=")) {
      toDate = arg.slice("--to=".length);
      continue;
    }

    if (arg === "--crew-id") {
      crewId = readOptionValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--crew-id=")) {
      crewId = arg.slice("--crew-id=".length);
      continue;
    }

    if (arg === "--sample-limit") {
      sampleLimit = Number.parseInt(readOptionValue(args, index, arg), 10);
      index += 1;
      continue;
    }

    if (arg.startsWith("--sample-limit=")) {
      sampleLimit = Number.parseInt(arg.slice("--sample-limit=".length), 10);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (execute && dryRun) {
    throw new Error("Use either --dry-run or --execute, not both.");
  }

  if (periodCode && (fromDate || toDate)) {
    throw new Error("Use either --period-code or --from/--to, not both.");
  }

  if (periodCode) {
    const range = parsePeriodCodeRange(periodCode);
    fromDate = range.fromDate;
    toDate = range.toDate;
  }

  if (!fromDate || !toDate) {
    throw new Error('Provide --period-code "Jun 2026" or both --from and --to.');
  }

  assertIsoDate(fromDate, "--from");
  assertIsoDate(toDate, "--to");

  if (fromDate >= toDate) {
    throw new Error("--from must be earlier than --to.");
  }

  if (!Number.isInteger(sampleLimit) || sampleLimit < 0 || sampleLimit > 100) {
    throw new Error("--sample-limit must be an integer from 0 to 100.");
  }

  return {
    execute,
    fromDate,
    toDate,
    crewId: crewId?.trim() || null,
    periodCode,
    sampleLimit,
  };
};

export const parseRosterPublishSyncEnv = (rawEnv: NodeJS.ProcessEnv): RosterPublishSyncEnv => {
  const parsed = envSchema.parse(rawEnv);
  const liveSchema = parsed.LIVE_SCHEMA;

  identifierSchema.parse(liveSchema);

  return {
    databaseUrl: parsed.DATABASE_URL,
    pbsSchema: parsed.PBS_SCHEMA,
    liveSchema,
    filiale: liveSchema.toUpperCase(),
    updatedBy: parsed.PBS_ROSTER_PUBLISH_UPDATED_BY,
  };
};

export const quoteIdentifier = (value: string) => {
  identifierSchema.parse(value);
  return `"${value.replace(/"/g, "\"\"")}"`;
};

const toInt = (value: string | number | null) => {
  if (typeof value === "number") {
    return value;
  }

  return Number.parseInt(value ?? "0", 10) || 0;
};

export const mapRosterPublishSyncSummary = (row: SummaryRow): RosterPublishSyncSummary => ({
  candidateRows: toInt(row.candidateRows),
  validRows: toInt(row.validRows),
  invalidRows: toInt(row.invalidRows),
  duplicateSkippedRows: toInt(row.duplicateSkippedRows),
  existingFlightConflictRows: toInt(row.existingFlightConflictRows),
  plannedInsertRows: toInt(row.plannedInsertRows),
  plannedUpdateRows: toInt(row.plannedUpdateRows),
  writableRows: toInt(row.writableRows),
  affectedRows: toInt(row.affectedRows),
});

const buildSourceCte = (liveSchema: string) => {
  const schema = quoteIdentifier(liveSchema);

  return `
    source_raw as (
      select
        rf.id as roster_flight_id,
        rf.crew_id,
        rf.pairing_id,
        coalesce(rf.flt_id, ps.flt_id) as flt_id,
        coalesce(nullif(trim(rf.flt_dt), ''), ps.flt_dt::text, to_char(rf.sch_str_dt_utc, 'YYYY-MM-DD')) as flt_dt,
        rf.ver,
        rf.base,
        rf.source,
        rf.is_requested,
        rf.is_deleted,
        rf.is_swapped,
        rf.preference,
        rf.comments,
        rf.score,
        rf.working_hour,
        coalesce(
          rf.sch_credited_minutes,
          ps.duty_sch_credited_minutes,
          ps.duty_act_credited_minutes
        ) as sch_credited_minutes,
        rf.sch_fm_credited_minutes,
        rf.sch_per_diem_mins,
        rf.sch_lh_per_diem_mins,
        rf.sch_fm_per_diem_mins,
        rf.sch_fm_lh_per_diem_mins,
        coalesce(
          rf.act_credited_minutes,
          ps.duty_act_credited_minutes
        ) as act_credited_minutes,
        rf.act_fm_credited_minutes,
        rf.act_per_diem_mins,
        rf.act_lh_per_diem_mins,
        rf.act_fm_per_diem_mins,
        rf.act_fm_lh_per_diem_mins,
        nullif(trim(rf.division), '') as division,
        nullif(trim(rf.assignment_group), '') as assignment_group,
        nullif(trim(rf.assignment), '') as assignment,
        rf.label,
        coalesce(
          nullif(trim(rf.flight_acting_rank), ''),
          nullif(trim(rf.roster_acting_rank), ''),
          nullif(trim(rf.active_rank), ''),
          nullif(trim(current_rank.rank), '')
        ) as flight_acting_rank,
        coalesce(nullif(trim(rf.active_rank), ''), nullif(trim(current_rank.rank), '')) as active_rank,
        nullif(trim(rf.roster_acting_rank), '') as roster_acting_rank,
        rf.position,
        rf.duty_seq,
        rf.seg_seq,
        coalesce(rf.seq_order, 0) as seq_order,
        rf.check_type,
        rf.ts_flag,
        rf.sch_str_dt_utc,
        rf.sch_end_dt_utc,
        rf.act_str_dt_utc,
        rf.act_end_dt_utc,
        coalesce(ps.dep_arp, rf.dep_arp) as dep_arp,
        coalesce(ps.arv_arp, rf.arv_arp) as arv_arp,
        rf.tag_set,
        rf.is_extra_course,
        rf.seq_order_source,
        rf.exception_code,
        rf.act_rest_min,
        p.pairing_label,
        p.base as pairing_base,
        p.fleet as pairing_fleet,
        ps.fleet_seg,
        p.tafb as tafb,
        rf.resource_code,
        rf.role,
        rf.tm_program_course_id,
        rf.group_id,
        rf.send_flag,
        rf.parent_tm_program_course_id,
        rf.course_code,
        rf.request_source,
        rf.request_id,
        rf.is_publish,
        rf.sub_tm_program_course_id,
        rf.sub_parent_tm_program_id,
        rf.sub_course_code,
        rf.sub_role,
        rf.sub_group_id
      from ${schema}.roster_flight rf
      left join ${schema}.pairing_segment ps
        on ps.pairing_id = rf.pairing_id
        and ps.duty_seq = rf.duty_seq
        and ps.seg_seq = rf.seg_seq
        and coalesce(ps.is_deleted, 0) = 0
        and (ps.scenario_id is null or ps.scenario_id = 0)
      left join ${schema}.pairing p
        on p.id = rf.pairing_id
      left join lateral (
        select cr.rank
        from ${schema}.crew_rank cr
        where cr.crew_id = rf.crew_id
          and cr.eff_dt <= rf.sch_str_dt_utc
          and (cr.exp_dt is null or cr.exp_dt >= rf.sch_str_dt_utc)
        order by cr.eff_dt desc
        limit 1
      ) current_rank on true
      where coalesce(rf.is_deleted, 0) = 0
        and (rf.scenario_id is null or rf.scenario_id = 0)
        and ($3::varchar is null or rf.crew_id = $3::varchar)
    ),
    period_source as (
      select *
      from source_raw
      where flt_dt >= $1::varchar
        and flt_dt < $2::varchar
    ),
    validated as (
      select
        *,
        (
          roster_flight_id is not null
          and nullif(trim(crew_id), '') is not null
          and nullif(trim(flt_dt), '') is not null
          and nullif(trim(division), '') is not null
          and nullif(trim(assignment), '') is not null
          and nullif(trim(flight_acting_rank), '') is not null
          and sch_str_dt_utc is not null
          and sch_end_dt_utc is not null
        ) as is_valid
      from period_source
    ),
    ranked as (
      select
        *,
        case
          when flt_id is null then 1
          else row_number() over (
            partition by flt_id, crew_id
            order by sch_str_dt_utc asc, roster_flight_id asc
          )
        end as flight_key_rank
      from validated
      where is_valid
    ),
    selected as (
      select *
      from ranked
      where flt_id is null
        or flight_key_rank = 1
    ),
    with_existing as (
      select
        selected.*,
        existing_roster.id is not null as has_existing_roster,
        existing_flight.id is not null as has_existing_flight_conflict
      from selected
      left join ${schema}.roster_publish existing_roster
        on existing_roster.roster_flight_id = selected.roster_flight_id
      left join ${schema}.roster_publish existing_flight
        on selected.flt_id is not null
        and existing_flight.flt_id = selected.flt_id
        and existing_flight.crew_id = selected.crew_id
        and existing_flight.roster_flight_id is distinct from selected.roster_flight_id
    ),
    writable as (
      select *
      from with_existing
      where not has_existing_flight_conflict
    ),
    planned as (
      select
        (select count(*) from period_source)::int as "candidateRows",
        (select count(*) from validated where is_valid)::int as "validRows",
        (select count(*) from validated where not is_valid)::int as "invalidRows",
        (select count(*) from ranked where flt_id is not null and flight_key_rank > 1)::int as "duplicateSkippedRows",
        (select count(*) from with_existing where has_existing_flight_conflict)::int as "existingFlightConflictRows",
        (select count(*) from writable where not has_existing_roster)::int as "plannedInsertRows",
        (select count(*) from writable where has_existing_roster)::int as "plannedUpdateRows",
        (select count(*) from writable)::int as "writableRows"
    )`;
};

export const buildRosterPublishDryRunSql = (liveSchema: string) => `
  with
    ${buildSourceCte(liveSchema)}
  select
    planned.*,
    0::int as "affectedRows"
  from planned
`;

export const buildRosterPublishExecuteSql = (liveSchema: string) => {
  const schema = quoteIdentifier(liveSchema);

  return `
    with
      ${buildSourceCte(liveSchema)},
      upserted as (
        insert into ${schema}.roster_publish (
          created_by,
          created_at,
          updated_by,
          updated_at,
          filiale,
          division,
          flt_id,
          flt_dt,
          pairing_id,
          roster_flight_id,
          ver,
          base,
          source,
          is_requested,
          is_deleted,
          is_swapped,
          preference,
          comments,
          score,
          working_hour,
          sch_credited_minutes,
          sch_fm_credited_minutes,
          sch_per_diem_mins,
          sch_lh_per_diem_mins,
          sch_fm_per_diem_mins,
          sch_fm_lh_per_diem_mins,
          act_credited_minutes,
          act_fm_credited_minutes,
          act_per_diem_mins,
          act_lh_per_diem_mins,
          act_fm_per_diem_mins,
          act_fm_lh_per_diem_mins,
          duty_seq,
          seg_seq,
          crew_id,
          flight_acting_rank,
          active_rank,
          roster_acting_rank,
          position,
          assignment_group,
          assignment,
          label,
          seq_order,
          check_type,
          ts_flag,
          sch_str_dt_utc,
          sch_end_dt_utc,
          act_str_dt_utc,
          act_end_dt_utc,
          dep_arp,
          arv_arp,
          tag_set,
          is_extra_course,
          seq_order_source,
          exception_code,
          act_rest_min,
          pairing_label,
          pairing_base,
          pairing_fleet,
          fleet_seg,
          tafb,
          resource_code,
          role,
          tm_program_course_id,
          group_id,
          send_flag,
          parent_tm_program_course_id,
          course_code,
          request_source,
          request_id,
          is_publish,
          sub_tm_program_course_id,
          sub_parent_tm_program_id,
          sub_course_code,
          sub_role,
          sub_group_id
        )
        select
          $4::varchar,
          now(),
          $4::varchar,
          now(),
          $5::varchar,
          division,
          flt_id,
          flt_dt,
          pairing_id,
          roster_flight_id,
          ver,
          base,
          source,
          coalesce(is_requested, 0),
          coalesce(is_deleted, 0),
          coalesce(is_swapped, 0),
          preference,
          comments,
          score,
          working_hour,
          sch_credited_minutes,
          sch_fm_credited_minutes,
          sch_per_diem_mins,
          sch_lh_per_diem_mins,
          sch_fm_per_diem_mins,
          sch_fm_lh_per_diem_mins,
          act_credited_minutes,
          act_fm_credited_minutes,
          act_per_diem_mins,
          act_lh_per_diem_mins,
          act_fm_per_diem_mins,
          act_fm_lh_per_diem_mins,
          duty_seq,
          seg_seq,
          crew_id,
          flight_acting_rank,
          active_rank,
          roster_acting_rank,
          position,
          assignment_group,
          assignment,
          label,
          seq_order,
          check_type,
          ts_flag,
          sch_str_dt_utc,
          sch_end_dt_utc,
          act_str_dt_utc,
          act_end_dt_utc,
          dep_arp,
          arv_arp,
          tag_set,
          coalesce(is_extra_course, 0),
          seq_order_source,
          exception_code,
          act_rest_min,
          pairing_label,
          pairing_base,
          pairing_fleet,
          fleet_seg,
          tafb,
          resource_code,
          role,
          tm_program_course_id,
          group_id,
          send_flag,
          parent_tm_program_course_id,
          course_code,
          request_source,
          request_id,
          coalesce(is_publish, 1),
          sub_tm_program_course_id,
          sub_parent_tm_program_id,
          sub_course_code,
          sub_role,
          sub_group_id
        from writable
        on conflict (roster_flight_id) where roster_flight_id is not null do update
        set
          updated_by = excluded.updated_by,
          updated_at = now(),
          filiale = excluded.filiale,
          division = excluded.division,
          flt_id = excluded.flt_id,
          flt_dt = excluded.flt_dt,
          pairing_id = excluded.pairing_id,
          roster_flight_id = excluded.roster_flight_id,
          ver = excluded.ver,
          base = excluded.base,
          source = excluded.source,
          is_requested = excluded.is_requested,
          is_deleted = excluded.is_deleted,
          is_swapped = excluded.is_swapped,
          preference = excluded.preference,
          comments = excluded.comments,
          score = excluded.score,
          working_hour = excluded.working_hour,
          sch_credited_minutes = coalesce(
            excluded.sch_credited_minutes,
            roster_publish.sch_credited_minutes
          ),
          sch_fm_credited_minutes = excluded.sch_fm_credited_minutes,
          sch_per_diem_mins = excluded.sch_per_diem_mins,
          sch_lh_per_diem_mins = excluded.sch_lh_per_diem_mins,
          sch_fm_per_diem_mins = excluded.sch_fm_per_diem_mins,
          sch_fm_lh_per_diem_mins = excluded.sch_fm_lh_per_diem_mins,
          act_credited_minutes = coalesce(
            excluded.act_credited_minutes,
            roster_publish.act_credited_minutes
          ),
          act_fm_credited_minutes = excluded.act_fm_credited_minutes,
          act_per_diem_mins = excluded.act_per_diem_mins,
          act_lh_per_diem_mins = excluded.act_lh_per_diem_mins,
          act_fm_per_diem_mins = excluded.act_fm_per_diem_mins,
          act_fm_lh_per_diem_mins = excluded.act_fm_lh_per_diem_mins,
          duty_seq = excluded.duty_seq,
          seg_seq = excluded.seg_seq,
          crew_id = excluded.crew_id,
          flight_acting_rank = excluded.flight_acting_rank,
          active_rank = excluded.active_rank,
          roster_acting_rank = excluded.roster_acting_rank,
          position = excluded.position,
          assignment_group = excluded.assignment_group,
          assignment = excluded.assignment,
          label = excluded.label,
          seq_order = excluded.seq_order,
          check_type = excluded.check_type,
          ts_flag = excluded.ts_flag,
          sch_str_dt_utc = excluded.sch_str_dt_utc,
          sch_end_dt_utc = excluded.sch_end_dt_utc,
          act_str_dt_utc = excluded.act_str_dt_utc,
          act_end_dt_utc = excluded.act_end_dt_utc,
          dep_arp = excluded.dep_arp,
          arv_arp = excluded.arv_arp,
          tag_set = excluded.tag_set,
          is_extra_course = excluded.is_extra_course,
          seq_order_source = excluded.seq_order_source,
          exception_code = excluded.exception_code,
          act_rest_min = excluded.act_rest_min,
          pairing_label = excluded.pairing_label,
          pairing_base = excluded.pairing_base,
          pairing_fleet = excluded.pairing_fleet,
          fleet_seg = coalesce(excluded.fleet_seg, roster_publish.fleet_seg),
          tafb = excluded.tafb,
          resource_code = excluded.resource_code,
          role = excluded.role,
          tm_program_course_id = excluded.tm_program_course_id,
          group_id = excluded.group_id,
          send_flag = excluded.send_flag,
          parent_tm_program_course_id = excluded.parent_tm_program_course_id,
          course_code = excluded.course_code,
          request_source = excluded.request_source,
          request_id = excluded.request_id,
          is_publish = excluded.is_publish,
          sub_tm_program_course_id = excluded.sub_tm_program_course_id,
          sub_parent_tm_program_id = excluded.sub_parent_tm_program_id,
          sub_course_code = excluded.sub_course_code,
          sub_role = excluded.sub_role,
          sub_group_id = excluded.sub_group_id
        returning 1
      )
    select
      planned.*,
      (select count(*) from upserted)::int as "affectedRows"
    from planned
  `;
};

export const buildRosterPublishDuplicateSampleSql = (liveSchema: string) => `
  with
    ${buildSourceCte(liveSchema)}
  select
    flt_id::varchar as "fltId",
    crew_id as "crewId",
    count(*)::int as "rowCount",
    array_agg(roster_flight_id::varchar order by sch_str_dt_utc asc, roster_flight_id asc) as "rosterIds",
    array_agg(pairing_id::varchar order by sch_str_dt_utc asc, roster_flight_id asc) as "pairingIds",
    array_agg(label order by sch_str_dt_utc asc, roster_flight_id asc) as "labels"
  from ranked
  where flt_id is not null
  group by flt_id, crew_id
  having count(*) > 1
  order by "rowCount" desc, "crewId", "fltId"
  limit $4::int
`;
