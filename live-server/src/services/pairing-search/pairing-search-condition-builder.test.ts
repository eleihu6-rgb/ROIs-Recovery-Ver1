import { strict as assert } from "node:assert";
import { test } from "vitest";

import { buildPreviewCondition } from "./pairing-search-condition-builder.js";
import { createPairingSearchSqlBuilder } from "./pairing-search-sql-builder.js";

const normalizeSql = (value: string) => value.replace(/\s+/g, " ").trim();

test("buildPreviewCondition matches Pairing Preference by selected stable pairing ids only", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    {
      propertyCode: 102,
      name: "Pairing Preference",
      action: "award",
      quantifier: null,
      bid: {
        type: "pairing-preference",
        pairingIds: ["496001", "496002"],
        pairingLabels: ["PR141", "PR142"],
      },
    },
    "f8",
    sqlBuilder,
  );

  assert.equal(normalizeSql(condition), "p.id = any($1::bigint[])");
  assert.deepEqual(sqlBuilder.params, [["496001", "496002"]]);
});

test("buildPreviewCondition matches Work Day Preference by the same local duty check-in event", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    {
      propertyCode: 110,
      name: "Work Day Preference",
      action: "award",
      quantifier: null,
      bid: {
        type: "work-day-preference",
        days: [{ dayOfWeek: "FRI", checkInFrom: "22:00", checkInTo: "04:00" }],
        dateScope: { mode: "date_range", from: "2026-06-05", to: "2026-06-26" },
      },
    },
    "f8",
    sqlBuilder,
  );
  const normalized = normalizeSql(condition);

  assert.match(normalized, /distinct on \(event_segment\.pairing_id, event_segment\.duty_seq\)/);
  assert.match(normalized, /event_segment\.brief_start_utc/);
  assert.match(normalized, /event_segment\.dep_arp/);
  assert.match(normalized, /work_day_events\.event_date between \$1::date and \$2::date/);
  assert.match(normalized, /extract\(isodow from work_day_events\.event_date\) = 5/);
  assert.match(normalized, /work_day_events\.event_time >= \$3::time or work_day_events\.event_time <= \$4::time/);
  assert.deepEqual(sqlBuilder.params, ["2026-06-05", "2026-06-26", "22:00", "04:00"]);
});

test("buildPreviewCondition makes an incomplete Work Day Preference non-matching", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    {
      propertyCode: 110,
      name: "Work Day Preference",
      action: "award",
      quantifier: null,
      bid: {
        type: "work-day-preference",
        days: [{ dayOfWeek: "FRI", checkInFrom: "22:00", checkInTo: null }],
        dateScope: null,
      },
    },
    "f8",
    sqlBuilder,
  );

  assert.equal(normalizeSql(condition), "false");
  assert.deepEqual(sqlBuilder.params, []);
});

test("buildPreviewCondition filters Pairing Length by multiple specific start dates", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    {
      propertyCode: 112,
      name: "Pairing Length",
      action: "award",
      quantifier: null,
      bid: {
        type: "pairing-length-preference",
        minDays: 1,
        maxDays: 3,
        dateScope: { mode: "specific_dates", dates: ["2026-06-03", "2026-06-18"] },
        min: 1,
        max: 7,
      },
    },
    "f8",
    sqlBuilder,
    { periodStartDate: "2026-06-01", periodEndDate: "2026-06-30" },
  );
  const normalized = normalizeSql(condition);

  assert.doesNotMatch(normalized, /pbs_calendar_days/);
  assert.match(normalized, /p\.tafb between \$1 and \$2/);
  assert.doesNotMatch(normalized, /p\.duration_days between/);
  assert.match(normalized, /select min\(coalesce\(s\.brief_start_utc, s\.sch_str_dt_utc\)\)/);
  assert.match(normalized, /\)::date = any\(\$3::date\[\]\)/);
  assert.deepEqual(sqlBuilder.params, [1, 3, ["2026-06-03", "2026-06-18"]]);
});

test("buildPreviewCondition keeps Pairing Length date-range behavior", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    {
      propertyCode: 112,
      name: "Pairing Length",
      action: "award",
      quantifier: null,
      bid: {
        type: "pairing-length-preference",
        minDays: 1,
        maxDays: 3,
        dateScope: { mode: "date_range", from: "2026-06-03", to: "2026-06-18" },
        min: 1,
        max: 7,
      },
    },
    "f8",
    sqlBuilder,
    { periodStartDate: "2026-06-01", periodEndDate: "2026-06-30" },
  );

  assert.match(normalizeSql(condition), /\)::date between \$3::date and \$4::date/);
  assert.deepEqual(sqlBuilder.params, [1, 3, "2026-06-03", "2026-06-18"]);
});

test("buildPreviewCondition keeps unknown PBS calendar days outside Avoid Pairing Length", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    {
      propertyCode: 112,
      name: "Pairing Length",
      action: "avoid",
      quantifier: null,
      bid: {
        type: "pairing-length-preference",
        minDays: null,
        maxDays: 1,
        dateScope: null,
        min: 1,
        max: 7,
      },
    },
    "f8",
    sqlBuilder,
    { periodStartDate: "2026-06-01", periodEndDate: "2026-06-30" },
  );

  const normalized = normalizeSql(condition);
  assert.doesNotMatch(normalized, /pbs_calendar_days/);
  assert.match(normalized, /not \(\(p\.tafb <= \$1\)\)/);
  assert.deepEqual(sqlBuilder.params, [1]);
});

test("buildPreviewCondition calculates Month-End Carryover in the pairing base timezone", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    {
      propertyCode: 163,
      name: "Month-End Carryover",
      action: "award",
      quantifier: null,
      bid: { type: "month-end-carryover", operator: "=", days: 1 },
    },
    "f8",
    sqlBuilder,
    { pairingBaseZoneExpression: "resolved_pairing_base.zone_id", periodStartDate: "2026-06-01", periodEndDate: "2026-06-30" },
  );
  const normalized = normalizeSql(condition);

  assert.match(normalized, /from lateral \( select greatest\(/);
  assert.match(normalized, /coalesce\(p\.sch_end_dt_utc, p\.sch_str_dt_utc\) at time zone 'UTC'\) at time zone resolved_pairing_base\.zone_id/);
  assert.match(normalized, /month_end_carryover\.carry_out_days = \$2/);
  assert.doesNotMatch(normalized, /from f8\.airport pairing_base_airport/);
  assert.deepEqual(sqlBuilder.params, ["2026-06-30", 1]);
});

test("buildPreviewCondition keeps legacy Carry-Out Days payloads on the base-timezone calculation", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    {
      propertyCode: 163,
      name: "Month-End Carryover",
      action: "award",
      quantifier: null,
      bid: { type: "stepper", value: 1, min: 1, max: 7, operator: "=" },
    },
    "f8",
    sqlBuilder,
    { periodStartDate: "2026-06-01", periodEndDate: "2026-06-30" },
  );
  const normalized = normalizeSql(condition);

  assert.match(normalized, /month_end_carryover\.carry_out_days = \$2/);
  assert.equal(normalized.match(/from f8\.airport pairing_base_airport/g)?.length, 1);
  assert.deepEqual(sqlBuilder.params, ["2026-06-30", 1]);
});

test("buildPreviewCondition matches Redeye windows on multiple local flight dates", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    {
      propertyCode: 117,
      name: "Redeye Preference",
      action: "award",
      quantifier: null,
      bid: {
        type: "redeye-preference",
        dateScope: { mode: "specific_dates", dates: ["2026-06-03", "2026-06-18"] },
      },
    },
    "f8",
    sqlBuilder,
    {
      periodStartDate: "2026-06-01",
      periodEndDate: "2026-06-30",
      redeye: { available: true, startTime: "03:30", endTime: "05:30", crossesMidnight: false, version: "03:30|05:30" },
    },
  );
  const normalized = normalizeSql(condition);

  assert.match(normalized, /tstzrange\(s\.sch_str_dt_utc, s\.sch_end_dt_utc/);
  assert.match(normalized, /redeye_windows\.redeye_date \+ \$2::time/);
  assert.match(normalized, /redeye_windows\.redeye_date \+ \$3::time/);
  assert.match(normalized, /redeye_windows\.redeye_date = any\(\$1::date\[\]\)/);
  assert.doesNotMatch(normalized, /arr_airport/);
  assert.deepEqual(sqlBuilder.params, [["2026-06-03", "2026-06-18"], "03:30", "05:30"]);
});

test("buildPreviewCondition limits Deadhead Flying to selected flight dates", () => {
  const anyBuilder = createPairingSearchSqlBuilder();
  const anyCondition = buildPreviewCondition(
    {
      propertyCode: 122,
      name: "Deadhead Flying",
      action: "award",
      quantifier: null,
      bid: {
        type: "deadhead-flying",
        mode: "any-deadhead",
        dateScope: { mode: "specific_dates", dates: ["2026-06-03", "2026-06-18"] },
      },
    },
    "f8",
    anyBuilder,
    { periodStartDate: "2026-06-01", periodEndDate: "2026-06-30" },
  );

  assert.match(normalizeSql(anyCondition), /s\.seg_assignment = 'DHD'/);
  assert.match(normalizeSql(anyCondition), /s\.flt_dt = any\(\$1::date\[\]\)/);
  assert.deepEqual(anyBuilder.params, [["2026-06-03", "2026-06-18"]]);

  const onlyBuilder = createPairingSearchSqlBuilder();
  const onlyCondition = buildPreviewCondition(
    {
      propertyCode: 122,
      name: "Deadhead Flying",
      action: "avoid",
      quantifier: null,
      bid: {
        type: "deadhead-flying",
        mode: "deadhead-only-duty",
        dateScope: { mode: "date_range", from: "2026-06-10", to: "2026-06-12" },
      },
    },
    "f8",
    onlyBuilder,
    { periodStartDate: "2026-06-01", periodEndDate: "2026-06-30" },
  );

  assert.match(normalizeSql(onlyCondition), /^not \(/);
  assert.match(normalizeSql(onlyCondition), /group by s\.duty_seq/);
  assert.match(normalizeSql(onlyCondition), /s\.duty_seq is not null/);
  assert.match(normalizeSql(onlyCondition), /bool_or\(s\.flt_dt between \$1::date and \$2::date\)/);
  assert.deepEqual(onlyBuilder.params, ["2026-06-10", "2026-06-12"]);
});

test("buildPreviewCondition supports Airport Preference Both with preferred layover hours", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    {
      propertyCode: 168,
      name: "Airport Preference",
      action: "award",
      quantifier: null,
      bid: {
        type: "airport-preference",
        event: "landing_or_layover",
        locations: [{ code: "YVR", kind: "airport" }],
        dateScope: null,
        minimumLayoverDuration: "16:00",
      },
    },
    "f8",
    sqlBuilder,
  );
  const normalized = normalizeSql(condition);

  assert.match(normalized, /airport_events\.event_type in \('landing', 'layover'\)/);
  assert.match(normalized, /later_s\.pairing_id = s\.pairing_id/);
  assert.match(normalized, /later_s\.is_deleted = 0/);
  assert.match(normalized, /later_s\.duty_seq > s\.duty_seq/);
  assert.match(normalized, /later_s\.seg_seq > s\.seg_seq/);
  assert.match(normalized, /from \( select distinct on \(s\.pairing_id, s\.duty_seq\).*order by s\.pairing_id, s\.duty_seq, s\.seg_seq \) layover_events/);
  assert.doesNotMatch(normalized, /\) airport_events order by s\./);
  assert.match(normalized, /airport_events\.event_type = 'landing' or airport_events\.layover_minutes >= \$2/);
  assert.deepEqual(sqlBuilder.params, [["YVR"], 960]);
});
