import assert from "node:assert/strict";
import test from "node:test";
import type { PbsPairingDraftProperty } from "../../../../packages/contracts/pbs-pairing-bids.js";
import type { PbsPairingSearchPreviewProperty } from "../../../../packages/contracts/pbs-search-pairings.js";
import { LineholderBidServiceError } from "../lineholder/shared.js";
import {
  buildCurrentRulesCondition,
  buildCurrentRulesExpression,
  buildPreviewCondition,
  normalizeCurrentRulePreviewProperties,
  parsePreviewTier,
} from "./pairing-search-condition-builder.js";
import { createPairingSearchSqlBuilder } from "./pairing-search-sql-builder.js";

const normalizeSql = (value: string) => value.replace(/\s+/g, " ").trim();

const buildPreviewProperty = (
  overrides: Partial<PbsPairingSearchPreviewProperty>,
): PbsPairingSearchPreviewProperty => ({
  propertyCode: 102,
  name: "Pairing Preference",
  action: null,
  quantifier: null,
  bid: { type: "pairing-preference", pairingIds: ["4959"] },
  ...overrides,
});

const buildDraftProperty = (
  overrides: Partial<PbsPairingDraftProperty>,
): PbsPairingDraftProperty => ({
  propertyGroupKey: "property-1",
  rowSeq: 1,
  propertyCode: 131,
  name: "Prefer Pairing Length",
  action: null,
  quantifier: null,
  bid: { type: "stepper", value: 3, min: 1, max: 7 },
  tiers: ["T1"],
  ...overrides,
});

test("buildPreviewCondition matches numeric DB pairing ids", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      bid: { type: "pairing-preference", pairingIds: [" 4959 ", "4959"] },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /p\.id = any\(\$1::bigint\[\]\)/);
  assert.deepEqual(sqlBuilder.params, [["4959"]]);
});

test("buildPreviewCondition evaluates Time Between Flights per same-duty connection for any and every", () => {
  const anyBuilder = createPairingSearchSqlBuilder();
  const anyCondition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 129,
      name: "Time Between Flights",
      action: "award",
      quantifier: "any",
      bid: { type: "duration", value: "01:15", operator: ">" },
    }),
    "f8",
    anyBuilder,
  );
  const everyBuilder = createPairingSearchSqlBuilder();
  const everyCondition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 129,
      name: "Time Between Flights",
      action: "avoid",
      quantifier: "every",
      bid: { type: "duration", value: "01:15", operator: "=" },
    }),
    "f8",
    everyBuilder,
  );

  assert.match(normalizeSql(anyCondition), /lead\(s\.sch_str_dt_utc\) over \(partition by s\.pairing_id, s\.duty_seq order by s\.seg_seq\)/);
  assert.match(normalizeSql(anyCondition), /time_between_flights\.connection_minutes > \$1/);
  assert.deepEqual(anyBuilder.params, [75]);
  assert.match(normalizeSql(everyCondition), /^not \(/);
  assert.match(normalizeSql(everyCondition), /exists \(/);
  assert.match(normalizeSql(everyCondition), /not \(time_between_flights\.connection_minutes = \$1\)/);
  assert.deepEqual(everyBuilder.params, [75]);
});

test("buildPreviewCondition rejects pairing labels as Pairing Preference IDs", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();

  assert.throws(
    () => buildPreviewCondition(
      buildPreviewProperty({
        bid: { type: "pairing-preference", pairingIds: ["M4959"] },
      }),
      "f8",
      sqlBuilder,
    ),
    /requires Pairing IDs selected from the list/,
  );
});

test("buildPreviewCondition rejects hyphenated pairing labels like PRPM-2000-0559", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();

  assert.throws(
    () => buildPreviewCondition(
      buildPreviewProperty({
        bid: { type: "pairing-preference", pairingIds: ["PRPM-2000-0559"] },
      }),
      "f8",
      sqlBuilder,
    ),
    /requires Pairing IDs selected from the list/,
  );
});

test("buildPreviewCondition rejects legacy occurrence-scoped Pairing Preference bids", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();

  assert.throws(() => buildPreviewCondition(
    buildPreviewProperty({
      bid: {
        type: "pairing-occurrence-list",
        occurrences: [{
          pairingId: "4123",
          pairingNumber: "M4123",
          originDate: "2026-04-08",
          occurrenceId: "4123:2026-04-08",
        }],
      },
    }),
    "f8",
    sqlBuilder,
  ), /must use Pairing IDs selected from the list/);
});

test("buildPreviewCondition applies default avoid intent for negative deadhead properties", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 148,
      name: "Avoid Deadheads",
      bid: { type: "select", value: "Enabled", options: ["Enabled"] },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /^not \(coalesce\(\(/);
  assert.match(normalizeSql(condition), /\), false\)\)$/);
  assert.match(condition, /s\.seg_assignment = 'DHD'/);
  assert.deepEqual(sqlBuilder.params, []);
});

test("buildPreviewCondition keeps layover city date parameters in values-then-date order", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 152,
      name: "Layover at City on Date",
      bid: { type: "tag-list-date", values: [" lax ", "yyz"], date: "2026-04-10" },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /\(s\.duty_sch_end_dt_utc at time zone 'UTC'\)::date = \$2::date/);
  assert.match(normalizeSql(condition), /upper\(s\.duty_end_arp\) = any\(\$1\)/);
  assert.deepEqual(sqlBuilder.params, [["LAX", "YYZ"], "2026-04-10"]);
});

test("buildPreviewCondition expands Airport Preference city locations and ignores fulfilment in the event predicate", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 168,
      name: "Airport Preference",
      action: "award",
      bid: {
        type: "airport-preference",
        event: "landing_or_layover",
        locations: [{ code: " yyz ", kind: "airport" }, { code: "yto", kind: "city" }],
        dateScope: { mode: "date_range", from: "2026-06-15", to: "2026-06-21" },
      },
    }),
    "f8",
    sqlBuilder,
  );
  const normalized = normalizeSql(condition);

  assert.doesNotMatch(normalized, /select count\(\*\)::numeric/);
  assert.match(normalized, /s\.duty_layover_nits > 0/);
  assert.match(normalized, /later_s\.pairing_id = s\.pairing_id/);
  assert.match(normalized, /later_s\.is_deleted = 0/);
  assert.match(normalized, /later_s\.duty_seq > s\.duty_seq/);
  assert.match(normalized, /later_s\.seg_seq > s\.seg_seq/);
  assert.match(normalized, /from \( select distinct on \(s\.pairing_id, s\.duty_seq\).*order by s\.pairing_id, s\.duty_seq, s\.seg_seq \) layover_events/);
  assert.doesNotMatch(normalized, /\) airport_events order by s\./);
  assert.match(normalized, /airport_events\.airport_code = any\(\$1::text\[\]\)/);
  assert.match(normalized, /airport_events\.city_code = any\(\$2::text\[\]\)/);
  assert.match(normalized, /coalesce\(s\.duty_sch_end_dt_utc, s\.sch_end_dt_utc\)/);
  assert.match(normalized, /airport_events\.event_date between \$3::date and \$4::date/);
  assert.deepEqual(sqlBuilder.params, [["YYZ"], ["YTO"], "2026-06-15", "2026-06-21"]);
});

test("buildPreviewCondition uses the airport-local landing event date", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 168,
      name: "Airport Preference",
      action: "award",
      bid: {
        type: "airport-preference",
        event: "landing",
        locations: [{ code: "YVR", kind: "airport" }],
        dateScope: { mode: "specific_dates", dates: ["2026-06-15"] },
      },
    }),
    "f8",
    sqlBuilder,
  );
  const normalized = normalizeSql(condition);

  assert.match(normalized, /^exists \(/);
  assert.match(normalized, /landing_airport\.zone_id/);
  assert.match(normalized, /later_s\.pairing_id = s\.pairing_id/);
  assert.match(normalized, /later_s\.is_deleted = 0/);
  assert.match(normalized, /airport_events\.airport_code = any\(\$1::text\[\]\)/);
  assert.match(normalized, /airport_events\.event_date = any\(\$2::date\[\]\)/);
  assert.deepEqual(sqlBuilder.params, [["YVR"], ["2026-06-15"]]);
});

test("buildPreviewCondition keeps landing matches when Both has preferred layover hours", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 168,
      name: "Airport Preference",
      action: "award",
      bid: {
        type: "airport-preference",
        event: "landing_or_layover",
        locations: [{ code: "YVR", kind: "airport" }],
        dateScope: null,
        minimumLayoverDuration: "16:00",
      },
    }),
    "f8",
    sqlBuilder,
  );
  const normalized = normalizeSql(condition);

  assert.match(normalized, /airport_events\.event_type in \('landing', 'layover'\)/);
  assert.match(normalized, /later_s\.pairing_id = s\.pairing_id/);
  assert.match(normalized, /airport_events\.event_type = 'landing' or airport_events\.layover_minutes >= \$2/);
  assert.deepEqual(sqlBuilder.params, [["YVR"], 960]);
});

test("buildPreviewCondition reuses current-rules airport event facts when requested", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 168,
      name: "Airport Preference",
      action: "award",
      bid: {
        type: "airport-preference",
        event: "landing_or_layover",
        locations: [{ code: "YVR", kind: "airport" }],
        dateScope: { mode: "specific_dates", dates: ["2026-06-15"] },
        minimumLayoverDuration: "16:00",
      },
    }),
    "f8",
    sqlBuilder,
    { periodStartDate: "2026-06-01", periodEndDate: "2026-06-30", useCurrentRulesFacts: true },
  );

  assert.match(normalizeSql(condition), /jsonb_to_recordset\(facts\.airport_events\)/);
  assert.doesNotMatch(normalizeSql(condition), /pairing_segment/);
});

test("buildPreviewCondition rejects airport preference landing with layover duration", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();

  assert.throws(
    () => buildPreviewCondition(
      buildPreviewProperty({
        propertyCode: 168,
        name: "Airport Preference",
        action: "award",
        bid: {
          type: "airport-preference",
          event: "landing",
          locations: [{ code: "YVR", kind: "airport" }],
          minimumLayoverDuration: "12:00",
        },
      }),
      "f8",
      sqlBuilder,
    ),
    /Landing Airport Preference cannot include layover duration/,
  );
});

test("buildPreviewCondition keeps pairing length date before compare values", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 132,
      name: "Prefer Pairing Length on Date",
      bid: { type: "stepper-date", value: 2, date: "2026-04-10", min: 1, max: 7 },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /\$1::date between \(p\.sch_str_dt_utc at time zone 'UTC'\)::date/);
  assert.doesNotMatch(normalizeSql(condition), /pbs_calendar_days/);
  assert.match(normalizeSql(condition), /p\.tafb = \$2/);
  assert.deepEqual(sqlBuilder.params, ["2026-04-10", 2]);
});

test("buildPreviewCondition filters Pairing Length by duration and pairing start date", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 112,
      name: "Pairing Length",
      bid: {
        type: "pairing-length-preference",
        minDays: 1,
        maxDays: 3,
        dateScope: { mode: "date_range", from: "2026-06-03", to: "2026-06-18" },
        min: 1,
        max: 7,
      },
    }),
    "f8",
    sqlBuilder,
    { periodStartDate: "2026-06-01", periodEndDate: "2026-06-30" },
  );
  const normalized = normalizeSql(condition);

  assert.doesNotMatch(normalized, /pbs_calendar_days/);
  assert.match(normalized, /p\.tafb between \$1 and \$2/);
  assert.doesNotMatch(normalized, /p\.duration_days between/);
  assert.match(normalized, /select min\(coalesce\(s\.brief_start_utc, s\.sch_str_dt_utc\)\)/);
  assert.match(normalized, /\)::date between \$3::date and \$4::date/);
  assert.deepEqual(sqlBuilder.params, [1, 3, "2026-06-03", "2026-06-18"]);
});

test("buildPreviewCondition filters Pairing Length by multiple specific start dates", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 112,
      name: "Pairing Length",
      bid: {
        type: "pairing-length-preference",
        minDays: 1,
        maxDays: 3,
        dateScope: { mode: "specific_dates", dates: ["2026-06-03", "2026-06-18"] },
        min: 1,
        max: 7,
      },
    }),
    "f8",
    sqlBuilder,
    { periodStartDate: "2026-06-01", periodEndDate: "2026-06-30" },
  );
  const normalized = normalizeSql(condition);

  assert.doesNotMatch(normalized, /pbs_calendar_days/);
  assert.match(normalized, /p\.tafb between \$1 and \$2/);
  assert.match(normalized, /select min\(coalesce\(s\.brief_start_utc, s\.sch_str_dt_utc\)\)/);
  assert.match(normalized, /\)::date = any\(\$3::date\[\]\)/);
  assert.deepEqual(sqlBuilder.params, [1, 3, ["2026-06-03", "2026-06-18"]]);
});

test("buildPreviewCondition avoids pairings shorter than the Avoid Pairing Length maximum", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 112,
      name: "Pairing Length",
      action: "avoid",
      bid: {
        type: "pairing-length-preference",
        minDays: null,
        maxDays: 1,
        dateScope: null,
        min: 1,
        max: 7,
      },
    }),
    "f8",
    sqlBuilder,
    { periodStartDate: "2026-06-01", periodEndDate: "2026-06-30" },
  );

  const normalized = normalizeSql(condition);
  assert.doesNotMatch(normalized, /pbs_calendar_days/);
  assert.match(normalized, /not \(coalesce\(\(\(p\.tafb <= \$1\)\), false\)\)/);
  assert.deepEqual(sqlBuilder.params, [1]);
});

test("buildPreviewCondition rejects Pairing Length dates outside the current period", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();

  assert.throws(
    () => buildPreviewCondition(
      buildPreviewProperty({
        propertyCode: 112,
        name: "Pairing Length",
        bid: {
          type: "pairing-length-preference",
          minDays: 1,
          maxDays: 3,
          dateScope: { mode: "specific_dates", dates: ["2026-07-03"] },
        },
      }),
      "f8",
      sqlBuilder,
      { periodStartDate: "2026-06-01", periodEndDate: "2026-06-30" },
    ),
    /Invalid pairing start dates for Pairing Length/,
  );
});

test("buildPreviewCondition rejects reversed Pairing Length day ranges", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();

  assert.throws(
    () => buildPreviewCondition(
      buildPreviewProperty({
        propertyCode: 112,
        name: "Pairing Length",
        bid: {
          type: "pairing-length-preference",
          minDays: 4,
          maxDays: 2,
          dateScope: null,
        },
      }),
      "f8",
      sqlBuilder,
      { periodStartDate: "2026-06-01", periodEndDate: "2026-06-30" },
    ),
    /Invalid pairing length for Pairing Length/,
  );
});

test("buildPreviewCondition compares pairing total credit as duration minutes", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 105,
      name: "Pairing Total Credit",
      bid: { type: "duration", value: "112:30", operator: ">" },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /sum\(coalesce\(s\.act_credited_minutes_seg::numeric, s\.duty_act_credited_minutes::numeric, 0\)\)/);
  assert.match(normalizeSql(condition), /> \$1/);
  assert.deepEqual(sqlBuilder.params, [6750]);
});

test("buildPreviewCondition compares pairing total credit ranges as duration minutes", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 105,
      name: "Pairing Total Credit",
      bid: { type: "duration-range", from: "08:00", to: "12:00" },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /between \$1 and \$2/);
  assert.deepEqual(sqlBuilder.params, [480, 720]);
});

test("buildPreviewCondition compares average daily credit as duration minutes per pairing day", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 109,
      name: "Average Daily Credit",
      bid: { type: "duration", value: "005:30", operator: ">" },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /sum\(coalesce\(s\.act_credited_minutes_seg::numeric, s\.duty_act_credited_minutes::numeric, 0\)\)/);
  assert.match(normalizeSql(condition), /\/ greatest\(coalesce\(p\.duration_days, 1\), 1\)/);
  assert.match(normalizeSql(condition), /> \$1/);
  assert.deepEqual(sqlBuilder.params, [330]);
});

test("buildPreviewCondition compares average daily credit ranges as duration minutes", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 109,
      name: "Average Daily Credit",
      bid: { type: "duration-range", from: "004:00", to: "005:30" },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /\/ greatest\(coalesce\(p\.duration_days, 1\), 1\)\) between \$1 and \$2/);
  assert.deepEqual(sqlBuilder.params, [240, 330]);
});

test("buildPreviewCondition compares average daily block time as total block time over pairing days", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 121,
      name: "Average Daily Block Time",
      bid: { type: "duration", value: "006:00", operator: ">" },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /sum\(coalesce\(f\.blk_min, 0\)\)::numeric/);
  assert.match(normalizeSql(condition), /\/ greatest\(coalesce\(p\.duration_days, 1\), 1\)/);
  assert.match(normalizeSql(condition), /join f8\.flight f/);
  assert.match(normalizeSql(condition), /> \$1/);
  assert.deepEqual(sqlBuilder.params, [360]);
});

test("buildPreviewCondition applies avoid intent to average daily block time", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 121,
      name: "Average Daily Block Time",
      action: "avoid",
      bid: { type: "duration", value: "008:00", operator: "<" },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /^not \(/);
  assert.match(normalizeSql(condition), /< \$1/);
  assert.deepEqual(sqlBuilder.params, [480]);
});

test("buildPreviewCondition compares pairing total block time as total block minutes", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 127,
      name: "Pairing Total Block Time",
      bid: { type: "duration", value: "006:00", operator: ">" },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /sum\(coalesce\(f\.blk_min, 0\)\)::numeric/);
  assert.match(normalizeSql(condition), /join f8\.flight f/);
  assert.match(normalizeSql(condition), /> \$1/);
  assert.match(normalizeSql(condition), /s\.flt_id is not null/);
  assert.deepEqual(sqlBuilder.params, [360]);
});

test("buildPreviewCondition compares pairing total block time ranges as total block minutes", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 127,
      name: "Pairing Total Block Time",
      bid: { type: "duration-range", from: "004:00", to: "006:00" },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /sum\(coalesce\(f\.blk_min, 0\)\)::numeric/);
  assert.match(normalizeSql(condition), /between \$1 and \$2/);
  assert.deepEqual(sqlBuilder.params, [240, 360]);
});

test("buildPreviewCondition compares credit per time away from base as percent", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 125,
      name: "Credit Per Time Away From Base",
      bid: { type: "percent-or-duration", unit: "percent", value: "75", operator: ">" },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /sum\(coalesce\(s\.act_credited_minutes_seg::numeric, s\.duty_act_credited_minutes::numeric, 0\)\)/);
  assert.match(normalizeSql(condition), /\/ nullif\(p\.tafb::numeric, 0\) \* 100/);
  assert.match(normalizeSql(condition), /> \$1/);
  assert.deepEqual(sqlBuilder.params, [75]);
});

test("buildPreviewCondition compares credit per time away from base as duration", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 125,
      name: "Credit Per Time Away From Base",
      action: "avoid",
      bid: { type: "percent-or-duration", unit: "duration", value: "007:00", operator: "<" },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /^not \(/);
  assert.match(normalizeSql(condition), /\/ nullif\(p\.tafb::numeric, 0\) \* 1440/);
  assert.match(normalizeSql(condition), /< \$1/);
  assert.deepEqual(sqlBuilder.params, [420]);
});

test("buildPreviewCondition matches any deadhead segment for Deadhead Flying", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 122,
      name: "Deadhead Flying",
      bid: { type: "deadhead-flying", mode: "any-deadhead" },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /exists \( select 1 from f8\.pairing_segment s/);
  assert.match(normalizeSql(condition), /s\.seg_assignment = 'DHD'/);
  assert.deepEqual(sqlBuilder.params, []);
});

test("buildPreviewCondition matches deadhead-only duty for Deadhead Flying", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 122,
      name: "Deadhead Flying",
      action: "avoid",
      bid: { type: "deadhead-flying", mode: "deadhead-only-duty" },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /^not \(/);
  assert.match(normalizeSql(condition), /group by s\.duty_seq/);
  assert.match(normalizeSql(condition), /s\.duty_seq is not null/);
  assert.match(normalizeSql(condition), /count\(\*\) filter \(where s\.seg_assignment = 'DHD'\) = count\(\*\)/);
  assert.deepEqual(sqlBuilder.params, []);
});

test("buildPreviewCondition limits any deadhead to specific flight dates", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 122,
      name: "Deadhead Flying",
      bid: {
        type: "deadhead-flying",
        mode: "any-deadhead",
        dateScope: { mode: "specific_dates", dates: ["2026-01-05", "2026-01-07"] },
      },
    }),
    "f8",
    sqlBuilder,
    { periodStartDate: "2026-01-01", periodEndDate: "2026-01-30" },
  );

  assert.match(normalizeSql(condition), /s\.seg_assignment = 'DHD'/);
  assert.match(normalizeSql(condition), /s\.flt_dt = any\(\$1::date\[\]\)/);
  assert.deepEqual(sqlBuilder.params, [["2026-01-05", "2026-01-07"]]);
});

test("buildPreviewCondition compares total legs in first duty by first-duty segment counts", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 124,
      name: "Total Legs In First Duty",
      bid: { type: "stepper", value: 2, min: 1, max: 8, operator: ">" },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /select count\(\*\)::numeric/);
  assert.match(normalizeSql(condition), /s\.duty_seq = 1/);
  assert.match(normalizeSql(condition), /> \$1/);
  assert.deepEqual(sqlBuilder.params, [2]);
});

test("buildPreviewCondition applies avoid intent to total legs in first duty", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 124,
      name: "Total Legs In First Duty",
      action: "avoid",
      bid: { type: "stepper", value: 3, min: 1, max: 8, operator: "<" },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /^not \(/);
  assert.match(normalizeSql(condition), /s\.duty_seq = 1/);
  assert.match(normalizeSql(condition), /< \$1/);
  assert.deepEqual(sqlBuilder.params, [3]);
});

test("buildPreviewCondition compares total legs in last duty by last-duty segment counts", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 130,
      name: "Total Legs In Last Duty",
      action: "avoid",
      bid: { type: "stepper", value: 2, min: 1, max: 8, operator: ">" },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /^not \(/);
  assert.match(normalizeSql(condition), /select count\(\*\)::numeric/);
  assert.match(normalizeSql(condition), /s\.duty_seq = \(/);
  assert.match(normalizeSql(condition), /select max\(last_s\.duty_seq\)/);
  assert.match(normalizeSql(condition), /> \$1/);
  assert.deepEqual(sqlBuilder.params, [2]);
});

test("buildPreviewCondition limits deadhead-only duty to a flight date range", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 122,
      name: "Deadhead Flying",
      action: "avoid",
      bid: {
        type: "deadhead-flying",
        mode: "deadhead-only-duty",
        dateScope: { mode: "date_range", from: "2026-01-10", to: "2026-01-12" },
      },
    }),
    "f8",
    sqlBuilder,
    { periodStartDate: "2026-01-01", periodEndDate: "2026-01-30" },
  );

  assert.match(normalizeSql(condition), /^not \(/);
  assert.match(normalizeSql(condition), /bool_or\(s\.flt_dt between \$1::date and \$2::date\)/);
  assert.deepEqual(sqlBuilder.params, ["2026-01-10", "2026-01-12"]);
});

test("buildPreviewCondition applies avoid intent to average daily credit", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 109,
      name: "Average Daily Credit",
      action: "avoid",
      bid: { type: "duration", value: "006:00", operator: "=" },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /^not \(/);
  assert.match(normalizeSql(condition), /= \$1/);
  assert.deepEqual(sqlBuilder.params, [360]);
});

test("buildPreviewCondition compares TAFB as calendar days", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 113,
      name: "TAFB",
      bid: { type: "stepper", value: 2, operator: ">" },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /p\.tafb > \$1/);
  assert.deepEqual(sqlBuilder.params, [2]);
});

test("buildPreviewCondition compares TAFB day ranges", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 113,
      name: "TAFB",
      bid: { type: "stepper-range", from: 1, to: 7 },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /p\.tafb between \$1 and \$2/);
  assert.deepEqual(sqlBuilder.params, [1, 7]);
});

test("buildPreviewCondition applies avoid intent to TAFB", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 113,
      name: "TAFB",
      action: "avoid",
      bid: { type: "stepper", value: 2, operator: ">" },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /^not \(/);
  assert.match(normalizeSql(condition), /p\.tafb > \$1/);
  assert.deepEqual(sqlBuilder.params, [2]);
});

test("buildPreviewCondition compares duty duration as duration minutes", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 118,
      name: "Any/Every Duty Duration",
      quantifier: "any",
      bid: { type: "duration", value: "11:30", operator: ">" },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /^exists \(/);
  assert.match(normalizeSql(condition), /select distinct on \(s\.pairing_id, s\.duty_seq\)/);
  assert.match(normalizeSql(condition), /coalesce\(s\.duty_sch_duty_min, s\.duty_act_duty_min\)::numeric as duty_minutes/);
  assert.match(normalizeSql(condition), /duty_durations\.duty_minutes > \$1/);
  assert.deepEqual(sqlBuilder.params, [690]);
});

test("buildPreviewCondition compares every duty duration by rejecting mismatched duties", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 118,
      name: "Any/Every Duty Duration",
      quantifier: "every",
      bid: { type: "duration-range", from: "08:00", to: "12:00" },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /^\(\s*exists/);
  assert.match(normalizeSql(condition), /and not exists/);
  assert.match(normalizeSql(condition), /not \(duty_durations\.duty_minutes between \$1 and \$2\)/);
  assert.deepEqual(sqlBuilder.params, [480, 720]);
});

test("buildPreviewCondition compares layover duration as duration minutes", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 119,
      name: "Any/Every Layover Duration",
      quantifier: "any",
      bid: { type: "duration", value: "15:00", operator: ">" },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /^exists \(/);
  assert.match(normalizeSql(condition), /select distinct on \(s\.pairing_id, s\.duty_seq\)/);
  assert.match(normalizeSql(condition), /coalesce\(s\.duty_sch_rest_min, s\.duty_act_rest_min\)::numeric as layover_minutes/);
  assert.match(normalizeSql(condition), /s\.duty_layover_nits > 0/);
  assert.match(normalizeSql(condition), /layover_durations\.layover_minutes > \$1/);
  assert.deepEqual(sqlBuilder.params, [900]);
});

test("buildPreviewCondition compares every layover duration by rejecting mismatched duties", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 119,
      name: "Any/Every Layover Duration",
      quantifier: "every",
      bid: { type: "duration", value: "08:00", operator: "<" },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /^\(\s*exists/);
  assert.match(normalizeSql(condition), /and not exists/);
  assert.match(normalizeSql(condition), /not \(layover_durations\.layover_minutes < \$1\)/);
  assert.deepEqual(sqlBuilder.params, [480]);
});

test("buildPreviewCondition rejects invalid pairing total credit durations", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();

  assert.throws(
    () =>
      buildPreviewCondition(
        buildPreviewProperty({
          propertyCode: 105,
          name: "Pairing Total Credit",
          bid: { type: "duration", value: "08:75" },
        }),
        "f8",
        sqlBuilder,
      ),
    /Unsupported duration value: 08:75/,
  );
  assert.deepEqual(sqlBuilder.params, []);
});

test("buildPreviewCondition matches pairing check-out time ranges on specific local event dates", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 103,
      name: "Pairing Check-In / Check-Out Time",
      bid: {
        type: "pairing-check-time",
        timeType: "check_out",
        operator: "Between",
        from: "14:00",
        to: "22:00",
        dateScope: { mode: "specific_dates", dates: ["2026-06-15", "2026-06-18"] },
      },
    }),
    "f8",
    sqlBuilder,
    { periodStartDate: "2026-06-01", periodEndDate: "2026-06-30" },
  );

  assert.match(normalizeSql(condition), /left join f8\.airport event_airport on event_airport\.airport = s\.arv_arp/);
  assert.match(normalizeSql(condition), /left join pg_timezone_names valid_timezone/);
  assert.match(normalizeSql(condition), /coalesce\(valid_timezone\.name, 'UTC'\)/);
  assert.match(normalizeSql(condition), /order by s\.debrief_end_utc desc, s\.duty_seq desc, s\.seg_seq desc/);
  assert.match(normalizeSql(condition), /\) = any\(\$3::date\[\]\) and/);
  assert.match(normalizeSql(condition), /\) between \$1::time and \$2::time/);
  assert.deepEqual(sqlBuilder.params, ["14:00", "22:00", ["2026-06-15", "2026-06-18"]]);
});

test("buildPreviewCondition matches pairing check-in time on a local event date range", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 103,
      name: "Pairing Check-In / Check-Out Time",
      bid: {
        type: "pairing-check-time",
        timeType: "check_in",
        operator: ">",
        value: "08:00",
        dateScope: { mode: "date_range", from: "2026-06-10", to: "2026-06-20" },
      },
    }),
    "f8",
    sqlBuilder,
    { periodStartDate: "2026-06-01", periodEndDate: "2026-06-30" },
  );

  assert.match(normalizeSql(condition), /left join f8\.airport event_airport on event_airport\.airport = s\.dep_arp/);
  assert.match(normalizeSql(condition), /order by s\.brief_start_utc asc, s\.duty_seq asc, s\.seg_seq asc/);
  assert.match(normalizeSql(condition), /\) between \$2::date and \$3::date and/);
  assert.match(normalizeSql(condition), /\) > \$1::time/);
  assert.deepEqual(sqlBuilder.params, ["08:00", "2026-06-10", "2026-06-20"]);
});

test("buildPreviewCondition reuses current-rules check event facts when requested", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 103,
      name: "Pairing Check-In / Check-Out Time",
      bid: {
        type: "pairing-check-time",
        timeType: "check_in",
        operator: ">",
        value: "08:00",
        dateScope: { mode: "date_range", from: "2026-06-10", to: "2026-06-20" },
      },
    }),
    "f8",
    sqlBuilder,
    { periodStartDate: "2026-06-01", periodEndDate: "2026-06-30", useCurrentRulesFacts: true },
  );

  assert.match(normalizeSql(condition), /facts\.check_in_local::date between \$2::date and \$3::date/);
  assert.match(normalizeSql(condition), /facts\.check_in_local::time > \$1::time/);
  assert.doesNotMatch(normalizeSql(condition), /pairing_segment/);
});

test("buildPreviewCondition keeps pairing check-time applicability outside Avoid inversion", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 103,
      name: "Pairing Check-In / Check-Out Time",
      action: "avoid",
      bid: {
        type: "pairing-check-time",
        timeType: "check_in",
        operator: ">",
        value: "06:51",
        dateScope: { mode: "specific_dates", dates: ["2026-06-10"] },
      },
    }),
    "f8",
    sqlBuilder,
    { periodStartDate: "2026-06-01", periodEndDate: "2026-06-30", useCurrentRulesFacts: true },
  );
  const normalized = normalizeSql(condition);

  assert.match(normalized, /facts\.check_in_local::time is not null/);
  assert.match(normalized, /facts\.check_in_local::date = any\(\$3::date\[\]\)/);
  assert.match(normalized, /not \(coalesce\(\(.*facts\.check_in_local::time > \$1::time.*\), false\)\)/);
  assert.deepEqual(sqlBuilder.params, ["06:51", ["2026-06-10"], ["2026-06-10"]]);
});

test("buildPreviewCondition rejects pairing check event dates outside the bidding period", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();

  assert.throws(
    () => buildPreviewCondition(
      buildPreviewProperty({
        propertyCode: 103,
        name: "Pairing Check-In / Check-Out Time",
        bid: {
          type: "pairing-check-time",
          timeType: "check_out",
          operator: "<",
          value: "22:00",
          dateScope: { mode: "specific_dates", dates: ["2026-07-01"] },
        },
      }),
      "f8",
      sqlBuilder,
      { periodStartDate: "2026-06-01", periodEndDate: "2026-06-30" },
    ),
    /Invalid event dates/,
  );
});

test("buildPreviewCondition does not treat old pairing check-in time bids as valid", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  assert.throws(
    () =>
      buildPreviewCondition(
        buildPreviewProperty({
          propertyCode: 103,
          name: "Pairing Check-In / Check-Out Time",
          bid: { type: "time-range", from: "10:00", to: "11:00" },
        }),
        "f8",
        sqlBuilder,
      ),
    /Search preview is not supported yet for Pairing Check-In \/ Check-Out Time/,
  );

  assert.deepEqual(sqlBuilder.params, []);
});

test("buildPreviewCondition matches departing on dates and days of week", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 106,
      name: "Departing On",
      bid: {
        type: "date-or-dow-list",
        dates: ["2026-04-03", "2026-04-10"],
        daysOfWeek: ["MON", "WED"],
      },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /= any\(\$1::date\[\]\)/);
  assert.match(normalizeSql(condition), /extract\(isodow from .*::date\) = any\(\$2::int\[\]\)/);
  assert.match(normalizeSql(condition), / or /);
  assert.deepEqual(sqlBuilder.params, [["2026-04-03", "2026-04-10"], [1, 3]]);
});

test("buildPreviewCondition matches departing on date ranges", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 106,
      name: "Departing On",
      bid: { type: "date-range", from: "2026-04-01", to: "2026-04-13" },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /::date between \$1::date and \$2::date/);
  assert.deepEqual(sqlBuilder.params, ["2026-04-01", "2026-04-13"]);
});

test("buildPreviewCondition matches departure time using scheduled flight departure", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 164,
      name: "Departure Time",
      bid: { type: "time-range", from: "06:00", to: "06:45" },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /min\(s\.sch_str_dt_utc\).*::time.*between \$1::time and \$2::time/);
  assert.doesNotMatch(normalizeSql(condition), /brief_start_utc/);
  assert.deepEqual(sqlBuilder.params, ["06:00", "06:45"]);
});

test("buildPreviewCondition matches work start station from the first duty start airport", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 165,
      name: "Work Start Station",
      bid: { type: "tag-list", values: [" yvr ", "YYZ", "YVR"] },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /select s\.duty_str_arp from f8\.pairing_segment s/);
  assert.match(normalizeSql(condition), /s\.pairing_id = p\.id/);
  assert.match(normalizeSql(condition), /s\.duty_str_arp is not null/);
  assert.match(normalizeSql(condition), /order by s\.duty_seq, s\.seg_seq limit 1/);
  assert.match(normalizeSql(condition), /= any\(\$1\)/);
  assert.deepEqual(sqlBuilder.params, [["YVR", "YYZ"]]);
});

test("buildPreviewCondition matches any duty by FLY/FLT counts and keeps deadhead-only duties at zero", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 107,
      name: "Flight Legs per Duty",
      quantifier: "any",
      bid: { type: "flight-legs-per-duty", operator: "=", legs: 2, dateScope: null },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /^exists \(/);
  assert.match(normalizeSql(condition), /group by s\.duty_seq/);
  assert.match(normalizeSql(condition), /coalesce\(s\.seg_assignment, ''\)\)\) in \('FLT', 'FLY'\)/);
  assert.match(normalizeSql(condition), /duty_counts\.leg_count = \$1/);
  assert.deepEqual(sqlBuilder.params, [2]);
});

test("buildPreviewCondition matches every duty legs by rejecting non-matching duty counts", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 107,
      name: "Flight Legs per Duty",
      quantifier: "every",
      bid: { type: "flight-legs-per-duty", operator: "<", legs: 3, dateScope: null },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /^\( exists/);
  assert.match(normalizeSql(condition), /and not exists/);
  assert.match(normalizeSql(condition), /where not \(duty_counts\.leg_count < \$1\)/);
  assert.deepEqual(sqlBuilder.params, [3]);
});

test("buildPreviewCondition applies avoid intent to duty legs", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 107,
      name: "Flight Legs per Duty",
      action: "avoid",
      quantifier: "any",
      bid: { type: "flight-legs-per-duty", operator: ">", legs: 2, dateScope: null },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /^not \(/);
  assert.match(normalizeSql(condition), /duty_counts\.leg_count > \$1/);
  assert.deepEqual(sqlBuilder.params, [2]);
});

test("buildPreviewCondition supports inclusive Between and duty check-in event dates", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 107,
      name: "Flight Legs per Duty",
      quantifier: "any",
      bid: {
        type: "flight-legs-per-duty",
        operator: "Between",
        from: 2,
        to: 4,
        dateScope: { mode: "specific_dates", dates: ["2026-04-03", "2026-04-10"] },
      },
    }),
    "f8",
    sqlBuilder,
  );

  const normalized = normalizeSql(condition);
  assert.match(normalized, /duty_counts\.leg_count between \$1 and \$2/);
  assert.match(normalized, /duty_counts\.event_date = any\(\$3::date\[\]\)/);
  assert.match(normalized, /event_segment\.brief_start_utc/);
  assert.match(normalized, /event_segment\.dep_arp/);
  assert.match(normalized, /pg_timezone_names valid_timezone/);
  assert.deepEqual(sqlBuilder.params, [2, 4, ["2026-04-03", "2026-04-10"]]);
});

test("buildPreviewCondition reuses current-rules duty facts when requested", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 107,
      name: "Flight Legs per Duty",
      quantifier: "any",
      bid: {
        type: "flight-legs-per-duty",
        operator: "=",
        legs: 3,
        dateScope: { mode: "specific_dates", dates: ["2026-06-10"] },
      },
    }),
    "f8",
    sqlBuilder,
    { periodStartDate: "2026-06-01", periodEndDate: "2026-06-30", useCurrentRulesFacts: true },
  );

  assert.match(normalizeSql(condition), /jsonb_to_recordset\(facts\.duty_counts\)/);
  assert.doesNotMatch(normalizeSql(condition), /pairing_segment/);
});

test("buildPreviewCondition matches Work Day Preference on the same local duty check-in event", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 110,
      name: "Work Day Preference",
      quantifier: null,
      bid: {
        type: "work-day-preference",
        days: [
          { dayOfWeek: "MON", checkInFrom: "06:00", checkInTo: "10:00" },
          { dayOfWeek: "WED", checkInFrom: "12:00", checkInTo: "16:00" },
        ],
        dateScope: { mode: "specific_dates", dates: ["2026-04-06", "2026-04-08"] },
      },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /^exists \(/);
  assert.match(normalizeSql(condition), /distinct on \(event_segment\.pairing_id, event_segment\.duty_seq\)/);
  assert.match(normalizeSql(condition), /event_segment\.brief_start_utc/);
  assert.match(normalizeSql(condition), /event_segment\.dep_arp/);
  assert.match(normalizeSql(condition), /work_day_events\.event_date = any\(\$1::date\[\]\)/);
  assert.match(normalizeSql(condition), /extract\(isodow from work_day_events\.event_date\) = 1/);
  assert.match(normalizeSql(condition), /work_day_events\.event_time between \$2::time and \$3::time/);
  assert.match(normalizeSql(condition), /extract\(isodow from work_day_events\.event_date\) = 3/);
  assert.deepEqual(sqlBuilder.params, [["2026-04-06", "2026-04-08"], "06:00", "10:00", "12:00", "16:00"]);
});

test("buildPreviewCondition supports optional Work Day Preference check-in windows", () => {
  const weekdayOnlyBuilder = createPairingSearchSqlBuilder();
  const weekdayOnlyCondition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 110,
      name: "Work Day Preference",
      quantifier: null,
      bid: {
        type: "work-day-preference",
        days: [{ dayOfWeek: "MON", checkInFrom: null, checkInTo: null }],
        dateScope: null,
      },
    }),
    "f8",
    weekdayOnlyBuilder,
  );
  const startOnlyBuilder = createPairingSearchSqlBuilder();
  const startOnlyCondition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 110,
      name: "Work Day Preference",
      quantifier: null,
      bid: {
        type: "work-day-preference",
        days: [{ dayOfWeek: "WED", checkInFrom: "06:00", checkInTo: null }],
        dateScope: null,
      },
    }),
    "f8",
    startOnlyBuilder,
  );
  const endOnlyBuilder = createPairingSearchSqlBuilder();
  const endOnlyCondition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 110,
      name: "Work Day Preference",
      quantifier: null,
      bid: {
        type: "work-day-preference",
        days: [{ dayOfWeek: "FRI", checkInFrom: null, checkInTo: "10:00" }],
        dateScope: null,
      },
    }),
    "f8",
    endOnlyBuilder,
  );

  assert.match(normalizeSql(weekdayOnlyCondition), /extract\(isodow from work_day_events\.event_date\) = 1/);
  assert.doesNotMatch(normalizeSql(weekdayOnlyCondition), /work_day_events\.event_time (?:between|>=|<=)/);
  assert.deepEqual(weekdayOnlyBuilder.params, []);

  assert.match(normalizeSql(startOnlyCondition), /extract\(isodow from work_day_events\.event_date\) = 3/);
  assert.match(normalizeSql(startOnlyCondition), /work_day_events\.event_time >= \$1::time/);
  assert.deepEqual(startOnlyBuilder.params, ["06:00"]);

  assert.match(normalizeSql(endOnlyCondition), /extract\(isodow from work_day_events\.event_date\) = 5/);
  assert.match(normalizeSql(endOnlyCondition), /work_day_events\.event_time <= \$1::time/);
  assert.deepEqual(endOnlyBuilder.params, ["10:00"]);
});

test("buildPreviewCondition makes zero-width Work Day Preference windows non-matching", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 110,
      name: "Work Day Preference",
      quantifier: null,
      bid: {
        type: "work-day-preference",
        days: [{ dayOfWeek: "MON", checkInFrom: "06:00", checkInTo: "06:00" }],
        dateScope: null,
      },
    }),
    "f8",
    sqlBuilder,
  );

  assert.equal(normalizeSql(condition), "false");
  assert.deepEqual(sqlBuilder.params, []);
});

test("buildPreviewCondition supports overnight Work Day Preference windows and a date range", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 110,
      name: "Work Day Preference",
      quantifier: null,
      bid: {
        type: "work-day-preference",
        days: [{ dayOfWeek: "FRI", checkInFrom: "22:00", checkInTo: "04:00" }],
        dateScope: { mode: "date_range", from: "2026-04-03", to: "2026-04-10" },
      },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /work_day_events\.event_date between \$1::date and \$2::date/);
  assert.match(normalizeSql(condition), /work_day_events\.event_time >= \$3::time or work_day_events\.event_time <= \$4::time/);
  assert.deepEqual(sqlBuilder.params, ["2026-04-03", "2026-04-10", "22:00", "04:00"]);
});

test("buildPreviewCondition matches any layover on dates and days of week", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 123,
      name: "Any/Every Layover On Date / Day",
      quantifier: "any",
      bid: {
        type: "date-or-dow-list",
        dates: ["2026-04-03"],
        daysOfWeek: ["FRI"],
      },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /^exists \(/);
  assert.match(normalizeSql(condition), /s\.duty_layover_nits > 0/);
  assert.match(normalizeSql(condition), /coalesce\(s\.duty_sch_end_dt_utc, s\.sch_end_dt_utc\)/);
  assert.match(normalizeSql(condition), /layover_dates\.layover_date = any\(\$1::date\[\]\)/);
  assert.match(normalizeSql(condition), /extract\(isodow from layover_dates\.layover_date\) = any\(\$2::int\[\]\)/);
  assert.deepEqual(sqlBuilder.params, [["2026-04-03"], [5]]);
});

test("buildPreviewCondition matches every layover on date ranges", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 123,
      name: "Any/Every Layover On Date / Day",
      quantifier: "every",
      bid: { type: "date-range", from: "2026-04-03", to: "2026-04-10" },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /^\( exists/);
  assert.match(normalizeSql(condition), /and not exists/);
  assert.match(normalizeSql(condition), /where not \(layover_dates\.layover_date between \$1::date and \$2::date\)/);
  assert.deepEqual(sqlBuilder.params, ["2026-04-03", "2026-04-10"]);
});

test("buildPreviewCondition applies avoid intent to layover on date or day", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 123,
      name: "Any/Every Layover On Date / Day",
      action: "avoid",
      quantifier: "any",
      bid: { type: "date-or-dow-list", dates: [], daysOfWeek: ["SUN"] },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /^not \(/);
  assert.match(normalizeSql(condition), /extract\(isodow from layover_dates\.layover_date\) = any\(\$1::int\[\]\)/);
  assert.deepEqual(sqlBuilder.params, [[7]]);
});

test("buildPreviewCondition accepts single station text values for layover station bids", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 104,
      name: "Layover Station",
      quantifier: "any",
      bid: { type: "text", value: " yhz " },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /^exists \(/);
  assert.match(normalizeSql(condition), /s\.duty_layover_nits > 0/);
  assert.match(normalizeSql(condition), /upper\(s\.duty_end_arp\) = any\(\$1\)/);
  assert.deepEqual(sqlBuilder.params, [["YHZ"]]);
});

test("buildPreviewCondition matches any leg with crew id through roster flight assignments", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 115,
      name: "Any/Every Leg With Employee Number",
      action: "award",
      quantifier: "any",
      bid: { type: "tag-list", values: [" 5510 ", "5513", "5510"] },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /^exists \(/);
  assert.match(normalizeSql(condition), /from f8\.pairing_segment s/);
  assert.match(normalizeSql(condition), /from f8\.roster_flight rf/);
  assert.match(normalizeSql(condition), /rf\.pairing_id = s\.pairing_id/);
  assert.match(normalizeSql(condition), /rf\.flt_id is not distinct from s\.flt_id/);
  assert.match(normalizeSql(condition), /rf\.duty_seq = s\.duty_seq/);
  assert.match(normalizeSql(condition), /rf\.seg_seq = s\.seg_seq/);
  assert.match(normalizeSql(condition), /upper\(rf\.crew_id\) = any\(\$1::text\[\]\)/);
  assert.deepEqual(sqlBuilder.params, [["5510", "5513"]]);
});

test("buildPreviewCondition matches every leg with crew id by rejecting unmatched legs", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 115,
      name: "Any/Every Leg With Employee Number",
      action: "award",
      quantifier: "every",
      bid: { type: "tag-list", values: ["5510"] },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /^\( exists/);
  assert.match(normalizeSql(condition), /and not exists/);
  assert.match(normalizeSql(condition), /and not \( exists \( select 1 from f8\.roster_flight rf/);
  assert.match(normalizeSql(condition), /upper\(rf\.crew_id\) = any\(\$1::text\[\]\)/);
  assert.deepEqual(sqlBuilder.params, [["5510"]]);
});

test("buildPreviewCondition matches actual Flight Number Preference segments on any selected operating date", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 116,
      name: "Flight Number Preference",
      action: "award",
      quantifier: null,
      bid: {
        type: "flight-number-preference",
        flightNumbers: [" 1993 ", "1600", "1993"],
        dateScope: { mode: "specific_dates", dates: ["2026-06-03", "2026-06-18"] },
      },
    }),
    "f8",
    sqlBuilder,
    { periodStartDate: "2026-06-01", periodEndDate: "2026-06-30" },
  );

  assert.match(normalizeSql(condition), /^exists \(/);
  assert.match(normalizeSql(condition), /from f8\.pairing_segment s/);
  assert.match(normalizeSql(condition), /s\.pairing_id = p\.id/);
  assert.match(normalizeSql(condition), /s\.is_deleted = 0/);
  assert.match(normalizeSql(condition), /seg_assignment.*in \('FLT', 'FLY'\)/);
  assert.match(normalizeSql(condition), /upper\(btrim\(s\.flt_num\)\) = any\(\$1::text\[\]\)/);
  assert.match(normalizeSql(condition), /s\.flt_dt = any\(\$2::date\[\]\)/);
  assert.doesNotMatch(normalizeSql(condition), /count\(\*\)/);
  assert.deepEqual(sqlBuilder.params, [["1993", "1600"], ["2026-06-03", "2026-06-18"]]);
});

test("buildPreviewCondition applies Avoid to the complete Flight Number Preference condition", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 116,
      name: "Flight Number Preference",
      action: "avoid",
      quantifier: null,
      bid: {
        type: "flight-number-preference",
        flightNumbers: ["1993"],
        dateScope: { mode: "date_range", from: "2026-06-03", to: "2026-06-18" },
      },
    }),
    "f8",
    sqlBuilder,
    { periodStartDate: "2026-06-01", periodEndDate: "2026-06-30" },
  );

  assert.match(normalizeSql(condition), /^not \(/);
  assert.match(normalizeSql(condition), /upper\(btrim\(s\.flt_num\)\) = any\(\$1::text\[\]\)/);
  assert.match(normalizeSql(condition), /s\.flt_dt between \$2::date and \$3::date/);
  assert.deepEqual(sqlBuilder.params, [["1993"], "2026-06-03", "2026-06-18"]);
});

test("buildPreviewCondition rejects Flight Number Preference dates outside the current period", () => {
  assert.throws(
    () => buildPreviewCondition(
      buildPreviewProperty({
        propertyCode: 116,
        name: "Flight Number Preference",
        action: "award",
        quantifier: null,
        bid: {
          type: "flight-number-preference",
          flightNumbers: ["1993"],
          dateScope: { mode: "specific_dates", dates: ["2026-07-01"] },
        },
      }),
      "f8",
      createPairingSearchSqlBuilder(),
      { periodStartDate: "2026-06-01", periodEndDate: "2026-06-30" },
    ),
    /Invalid flight dates/,
  );
});

test("buildPreviewCondition matches Redeye Preference through local operating window overlap", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 117,
      name: "Redeye Preference",
      action: "award",
      quantifier: null,
      bid: {
        type: "redeye-preference",
        dateScope: { mode: "specific_dates", dates: ["2026-06-03", "2026-06-18"] },
      },
    }),
    "f8",
    sqlBuilder,
    {
      periodStartDate: "2026-06-01",
      periodEndDate: "2026-06-30",
      redeye: { available: true, startTime: "23:00", endTime: "05:00", crossesMidnight: true, version: "23:00|05:00" },
    },
  );

  assert.match(normalizeSql(condition), /^exists \(/);
  assert.match(normalizeSql(condition), /from f8\.pairing_segment s/);
  assert.match(normalizeSql(condition), /join f8\.airport dep_airport on dep_airport\.airport = s\.dep_arp/);
  assert.match(normalizeSql(condition), /cross join lateral \( select generate_series/);
  assert.match(normalizeSql(condition), /s\.pairing_id = p\.id/);
  assert.match(normalizeSql(condition), /s\.is_deleted = 0/);
  assert.match(normalizeSql(condition), /tstzrange\(s\.sch_str_dt_utc, s\.sch_end_dt_utc, '\[\)'\) && tstzrange/);
  assert.match(normalizeSql(condition), /redeye_windows\.redeye_date \+ \$2::time/);
  assert.match(normalizeSql(condition), /redeye_windows\.redeye_date \+ \$3::time\) \+ interval '1 day'/);
  assert.match(normalizeSql(condition), /date::timestamp - interval '1 day'/);
  assert.match(normalizeSql(condition), /redeye_windows\.redeye_date = any\(\$1::date\[\]\)/);
  assert.deepEqual(sqlBuilder.params, [["2026-06-03", "2026-06-18"], "23:00", "05:00"]);
});

test("buildPreviewCondition applies Avoid to Redeye Preference date ranges", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 117,
      name: "Redeye Preference",
      action: "avoid",
      quantifier: null,
      bid: {
        type: "redeye-preference",
        dateScope: { mode: "date_range", from: "2026-06-03", to: "2026-06-18" },
      },
    }),
    "f8",
    sqlBuilder,
    {
      periodStartDate: "2026-06-01",
      periodEndDate: "2026-06-30",
      redeye: { available: true, startTime: "03:30", endTime: "05:30", crossesMidnight: false, version: "03:30|05:30" },
    },
  );

  assert.match(normalizeSql(condition), /^not \(/);
  assert.match(normalizeSql(condition), /join f8\.airport dep_airport/);
  assert.match(normalizeSql(condition), /redeye_windows\.redeye_date between \$1::date and \$2::date/);
  assert.deepEqual(sqlBuilder.params, ["2026-06-03", "2026-06-18", "03:30", "05:30"]);
});

test("buildPreviewCondition rejects legacy Redeye flag bids", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  assert.throws(() => buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 117,
      name: "Redeye Preference",
      action: "award",
      quantifier: "any",
      bid: { type: "flag" },
    }),
    "f8",
    sqlBuilder,
    { periodStartDate: "2026-06-01", periodEndDate: "2026-06-30" },
  ), /Search preview is not supported yet/);
});

test("buildPreviewCondition normalizes pairing type values before matching assignment fields", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 137,
      name: "Prefer Pairing Type",
      bid: { type: "select", value: " odan ", options: ["ODAN"] },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /regexp_replace\( upper\(concat_ws/);
  assert.match(normalizeSql(condition), /like \$1/);
  assert.deepEqual(sqlBuilder.params, ["%ODAN%"]);
});

test("buildPreviewCondition defaults month-end carryover to award intent", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 163,
      name: "Month-End Carryover",
      bid: { type: "month-end-carryover", operator: ">", days: 5 },
    }),
    "f8",
    sqlBuilder,
    { pairingBaseZoneExpression: "resolved_pairing_base.zone_id", periodStartDate: "2026-04-01", periodEndDate: "2026-04-30" },
  );

  const normalized = normalizeSql(condition);

  assert.doesNotMatch(normalized, /^not \(/);
  assert.match(normalized, /from lateral \( select greatest\(/);
  assert.match(normalized, /coalesce\(p\.sch_end_dt_utc, p\.sch_str_dt_utc\) at time zone 'UTC'\) at time zone resolved_pairing_base\.zone_id/);
  assert.match(normalized, /month_end_carryover\.carry_out_days >= 1/);
  assert.match(normalized, /month_end_carryover\.carry_out_days > \$2/);
  assert.doesNotMatch(normalized, /from f8\.airport pairing_base_airport/);
  assert.deepEqual(sqlBuilder.params, ["2026-04-30", 5]);
});

test("buildPreviewCondition applies Avoid to month-end carryover", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 163,
      name: "Month-End Carryover",
      action: "avoid",
      bid: { type: "month-end-carryover", operator: ">", days: 5 },
    }),
    "f8",
    sqlBuilder,
    { periodStartDate: "2026-04-01", periodEndDate: "2026-04-30" },
  );

  const normalized = normalizeSql(condition);

  assert.match(normalized, /^not \(/);
  assert.match(normalized, /month_end_carryover\.carry_out_days > \$2/);
  assert.equal(normalized.match(/from f8\.airport pairing_base_airport/g)?.length, 1);
  assert.deepEqual(sqlBuilder.params, ["2026-04-30", 5]);
});

test("buildPreviewCondition supports month-end carryover day ranges", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 163,
      name: "Month-End Carryover",
      action: "award",
      bid: { type: "month-end-carryover", operator: "Between", from: 2, to: 4 },
    }),
    "f8",
    sqlBuilder,
    { periodStartDate: "2026-04-01", periodEndDate: "2026-04-30" },
  );

  const normalized = normalizeSql(condition);

  assert.doesNotMatch(normalized, /^not \(/);
  assert.match(normalized, /month_end_carryover\.carry_out_days >= 1/);
  assert.match(normalized, /month_end_carryover\.carry_out_days between \$2 and \$3/);
  assert.equal(normalized.match(/from f8\.airport pairing_base_airport/g)?.length, 1);
  assert.deepEqual(sqlBuilder.params, ["2026-04-30", 2, 4]);
});

test("buildPreviewCondition requires the real roster period range for month-end carryover", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();

  assert.throws(
    () =>
      buildPreviewCondition(
        buildPreviewProperty({
          propertyCode: 163,
          name: "Month-End Carryover",
          bid: { type: "month-end-carryover", operator: ">", days: 5 },
        }),
        "f8",
        sqlBuilder,
      ),
    (error) =>
      error instanceof LineholderBidServiceError
      && error.statusCode === 400
      && error.message === "Roster period range is required for Month-End Carryover.",
  );
  assert.deepEqual(sqlBuilder.params, []);
});

test("buildPreviewCondition rejects legacy Carry-Out Days stepper payloads", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  assert.throws(
    () =>
      buildPreviewCondition(
        buildPreviewProperty({
          propertyCode: 163,
          name: "Month-End Carryover",
          bid: { type: "stepper", value: 5, min: 1, max: 14, operator: ">" },
        }),
        "f8",
        sqlBuilder,
        { periodStartDate: "2026-04-01", periodEndDate: "2026-04-30" },
      ),
    (error) =>
      error instanceof LineholderBidServiceError
      && error.statusCode === 422
      && error.message === "Search preview is not supported yet for Month-End Carryover.",
  );
  assert.deepEqual(sqlBuilder.params, []);
});

test("buildPreviewCondition keeps report time range parameters in from-then-to order", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 134,
      name: "Prefer Report Time",
      bid: { type: "time-range", from: "06:00", to: "12:00" },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /min\(s\.brief_start_utc\).*::time.*between \$1::time and \$2::time/);
  assert.deepEqual(sqlBuilder.params, ["06:00", "12:00"]);
});

test("buildPreviewCondition keeps report date before report time parameters", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 139,
      name: "Prefer Report on Date",
      bid: { type: "time-date", value: "05:30", date: "2026-04-10" },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /min\(s\.brief_start_utc\).*::date.*= \$1::date/);
  assert.match(normalizeSql(condition), /min\(s\.brief_start_utc\).*::time.*= \$2::time/);
  assert.deepEqual(sqlBuilder.params, ["2026-04-10", "05:30"]);
});

test("buildPreviewCondition matches any enroute check-in time exactly", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 114,
      name: "Any/Every Enroute Check-In Time",
      bid: { type: "time", value: "06:00", operator: "=" },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /^exists \(/);
  assert.match(normalizeSql(condition), /s\.duty_seq > 1/);
  assert.match(normalizeSql(condition), /brief_start_utc.*::time = \$1::time/);
  assert.deepEqual(sqlBuilder.params, ["06:00"]);
});

test("buildPreviewCondition matches every enroute check-in time exactly", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 114,
      name: "Any/Every Enroute Check-In Time",
      quantifier: "every",
      bid: { type: "time", value: "09:15", operator: "=" },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /^\(/);
  assert.match(normalizeSql(condition), /exists \(/);
  assert.match(normalizeSql(condition), /not exists \(/);
  assert.match(normalizeSql(condition), /s\.duty_seq > 1/);
  assert.match(normalizeSql(condition), /brief_start_utc.*::time = \$1::time/);
  assert.match(normalizeSql(condition), /not \(/);
  assert.deepEqual(sqlBuilder.params, ["09:15"]);
});

test("buildPreviewCondition matches any enroute check-in time ranges", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 114,
      name: "Any/Every Enroute Check-In Time",
      bid: { type: "time-range", from: "19:00", to: "23:59" },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /s\.duty_seq > 1/);
  assert.match(normalizeSql(condition), /brief_start_utc.*::time between \$1::time and \$2::time/);
  assert.deepEqual(sqlBuilder.params, ["19:00", "23:59"]);
});

test("buildPreviewCondition applies avoid intent to any enroute check-in time", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 114,
      name: "Any/Every Enroute Check-In Time",
      action: "avoid",
      bid: { type: "time", value: "14:00", operator: ">" },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /^not \(/);
  assert.match(normalizeSql(condition), /brief_start_utc.*::time > \$1::time/);
  assert.deepEqual(sqlBuilder.params, ["14:00"]);
});

test("buildPreviewCondition aggregates the duty-on time so a multi-segment pairing yields one row", () => {
  // Regression: property 120 (Duty On Time) built a scalar subquery WITHOUT an aggregate
  // (`select (coalesce(...) )::time from pairing_segment where pairing_id = p.id`). Any
  // pairing with >1 segment made that subquery return multiple rows, so using it as a
  // scalar threw Postgres 21000 "more than one row returned by a subquery used as an
  // expression" and failed the whole scenario bid-package export. Like its siblings
  // (report/release/departure all use min/max), duty-on must collapse to a single row.
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 120,
      name: "Duty On Time",
      bid: { type: "time", value: "09:00", operator: "<" },
    }),
    "f8",
    sqlBuilder,
  );

  const normalized = normalizeSql(condition);
  // The duty-on timestamp must be wrapped in min(...) — this assertion fails on the old
  // un-aggregated SQL and passes only after the fix.
  assert.match(normalized, /min\(coalesce\(s\.duty_sch_str_dt_utc, s\.brief_start_utc, s\.sch_str_dt_utc\)\)/);
  assert.match(normalized, /from f8\.pairing_segment s/);
  assert.match(normalized, /\) < \$1::time/);
  assert.deepEqual(sqlBuilder.params, ["09:00"]);
});

test("buildPreviewCondition matches any enroute check-out time before a threshold", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 126,
      name: "Any/Every Enroute Check-Out Time",
      quantifier: "any",
      bid: { type: "time", value: "22:30", operator: "<" },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /^exists \(/);
  assert.match(normalizeSql(condition), /s\.duty_seq > 1/);
  assert.match(normalizeSql(condition), /debrief_end_utc.*::time < \$1::time/);
  assert.deepEqual(sqlBuilder.params, ["22:30"]);
});

test("buildPreviewCondition matches every enroute check-out time before a threshold", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 126,
      name: "Any/Every Enroute Check-Out Time",
      quantifier: "every",
      bid: { type: "time", value: "22:30", operator: "<" },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /^\(/);
  assert.match(normalizeSql(condition), /exists \(/);
  assert.match(normalizeSql(condition), /not exists \(/);
  assert.match(normalizeSql(condition), /s\.duty_seq > 1/);
  assert.match(normalizeSql(condition), /debrief_end_utc.*::time < \$1::time/);
  assert.match(normalizeSql(condition), /s\.debrief_end_utc is null or not \(/);
  assert.deepEqual(sqlBuilder.params, ["22:30"]);
});

test("buildPreviewCondition matches any enroute check-out time ranges", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 126,
      name: "Any/Every Enroute Check-Out Time",
      quantifier: "any",
      bid: { type: "time-range", from: "19:00", to: "23:59" },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /^exists \(/);
  assert.match(normalizeSql(condition), /s\.duty_seq > 1/);
  assert.match(normalizeSql(condition), /debrief_end_utc.*::time between \$1::time and \$2::time/);
  assert.deepEqual(sqlBuilder.params, ["19:00", "23:59"]);
});

test("buildPreviewCondition matches any enroute check-in date or day", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 166,
      name: "Any/Every Enroute Check-In Date / Day",
      quantifier: "any",
      bid: {
        type: "date-or-dow-list",
        dates: ["2026-04-03"],
        daysOfWeek: ["FRI"],
      },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /^exists \(/);
  assert.match(normalizeSql(condition), /distinct on \(s\.pairing_id, s\.duty_seq\)/);
  assert.match(normalizeSql(condition), /s\.duty_seq > 1/);
  assert.match(normalizeSql(condition), /s\.brief_start_utc is not null/);
  assert.match(normalizeSql(condition), /\(s\.brief_start_utc at time zone 'UTC'\)::date as enroute_check_in_date/);
  assert.match(normalizeSql(condition), /enroute_dates\.enroute_check_in_date = any\(\$1::date\[\]\)/);
  assert.match(normalizeSql(condition), /extract\(isodow from enroute_dates\.enroute_check_in_date\) = any\(\$2::int\[\]\)/);
  assert.deepEqual(sqlBuilder.params, [["2026-04-03"], [5]]);
});

test("buildPreviewCondition matches every enroute check-in date range", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 166,
      name: "Any/Every Enroute Check-In Date / Day",
      quantifier: "every",
      bid: { type: "date-range", from: "2026-04-03", to: "2026-04-10" },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /^\( exists/);
  assert.match(normalizeSql(condition), /and not exists/);
  assert.match(normalizeSql(condition), /s\.duty_seq > 1/);
  assert.match(normalizeSql(condition), /s\.brief_start_utc is not null/);
  assert.match(normalizeSql(condition), /where not \(enroute_dates\.enroute_check_in_date between \$1::date and \$2::date\)/);
  assert.deepEqual(sqlBuilder.params, ["2026-04-03", "2026-04-10"]);
});

test("buildPreviewCondition matches any enroute check-out date or day", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 167,
      name: "Any/Every Enroute Check-Out Date / Day",
      quantifier: "any",
      bid: {
        type: "date-or-dow-list",
        dates: ["2026-04-04"],
        daysOfWeek: ["SAT"],
      },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /^exists \(/);
  assert.match(normalizeSql(condition), /distinct on \(s\.pairing_id, s\.duty_seq\)/);
  assert.match(normalizeSql(condition), /s\.duty_seq > 1/);
  assert.match(normalizeSql(condition), /s\.debrief_end_utc is not null/);
  assert.match(normalizeSql(condition), /\(s\.debrief_end_utc at time zone 'UTC'\)::date as enroute_check_out_date/);
  assert.match(normalizeSql(condition), /enroute_dates\.enroute_check_out_date = any\(\$1::date\[\]\)/);
  assert.match(normalizeSql(condition), /extract\(isodow from enroute_dates\.enroute_check_out_date\) = any\(\$2::int\[\]\)/);
  assert.deepEqual(sqlBuilder.params, [["2026-04-04"], [6]]);
});

test("buildPreviewCondition matches every enroute check-out date range", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 167,
      name: "Any/Every Enroute Check-Out Date / Day",
      quantifier: "every",
      bid: { type: "date-range", from: "2026-04-05", to: "2026-04-12" },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /^\( exists/);
  assert.match(normalizeSql(condition), /and not exists/);
  assert.match(normalizeSql(condition), /s\.duty_seq > 1/);
  assert.match(normalizeSql(condition), /s\.debrief_end_utc is not null/);
  assert.match(normalizeSql(condition), /where not \(enroute_dates\.enroute_check_out_date between \$1::date and \$2::date\)/);
  assert.deepEqual(sqlBuilder.params, ["2026-04-05", "2026-04-12"]);
});

test("buildPreviewCondition matches any duty on time by using duty start time", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 120,
      name: "Any Duty On Time",
      bid: { type: "time", value: "12:00", operator: "=" },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /select \(min\(coalesce\(s\.duty_sch_str_dt_utc, s\.brief_start_utc, s\.sch_str_dt_utc\)\) at time zone 'UTC'\)::time/);
  assert.match(normalizeSql(condition), /= \$1::time/);
  assert.deepEqual(sqlBuilder.params, ["12:00"]);
});

test("buildPreviewCondition matches any duty on time ranges", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 120,
      name: "Any Duty On Time",
      bid: { type: "time-range", from: "08:00", to: "10:00" },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /select \(min\(coalesce\(s\.duty_sch_str_dt_utc, s\.brief_start_utc, s\.sch_str_dt_utc\)\) at time zone 'UTC'\)::time/);
  assert.match(normalizeSql(condition), /between \$1::time and \$2::time/);
  assert.deepEqual(sqlBuilder.params, ["08:00", "10:00"]);
});

test("buildPreviewCondition defaults mid-pairing report time to greater-than comparison", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 136,
      name: "Prefer Mid-Pairing Report",
      bid: { type: "time", value: "10:00" },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /s\.duty_seq > 1/);
  assert.match(normalizeSql(condition), /brief_start_utc.*::time > \$1::time/);
  assert.deepEqual(sqlBuilder.params, ["10:00"]);
});

test("buildPreviewCondition defaults mid-pairing release time to less-than comparison", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildPreviewCondition(
    buildPreviewProperty({
      propertyCode: 141,
      name: "Prefer Mid-Pairing Release",
      bid: { type: "time", value: "22:30" },
    }),
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /s\.duty_seq > 1/);
  assert.match(normalizeSql(condition), /debrief_end_utc.*::time < \$1::time/);
  assert.deepEqual(sqlBuilder.params, ["22:30"]);
});

test("buildCurrentRulesCondition joins same multi-use properties with OR", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildCurrentRulesCondition(
    [
      buildDraftProperty({ propertyGroupKey: "length-3" }),
      buildDraftProperty({
        propertyGroupKey: "length-4",
        bid: { type: "stepper", value: 4, min: 1, max: 7 },
      }),
    ],
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /p\.tafb = \$1/);
  assert.match(normalizeSql(condition), / or /);
  assert.match(normalizeSql(condition), /p\.tafb = \$2/);
  assert.deepEqual(sqlBuilder.params, [3, 4]);
});

test("buildCurrentRulesCondition joins multiple unified check-time bids with OR", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildCurrentRulesCondition(
    [
      buildDraftProperty({
        propertyGroupKey: "check-in-12",
        propertyCode: 103,
        name: "Pairing Check-In / Check-Out Time",
        bid: {
          type: "pairing-check-time",
          timeType: "check_in",
          operator: "=",
          value: "12:16",
          dateScope: null,
        },
      }),
      buildDraftProperty({
        propertyGroupKey: "check-in-13",
        propertyCode: 103,
        name: "Pairing Check-In / Check-Out Time",
        bid: {
          type: "pairing-check-time",
          timeType: "check_in",
          operator: ">",
          value: "13:00",
          dateScope: null,
        },
      }),
    ],
    "f8",
    sqlBuilder,
  );

  assert.match(normalizeSql(condition), /= \$1::time/);
  assert.match(normalizeSql(condition), /\) or \(/);
  assert.match(normalizeSql(condition), /> \$2::time/);
  assert.deepEqual(sqlBuilder.params, ["12:16", "13:00"]);
});

test("buildCurrentRulesCondition joins independent properties with AND", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();
  const condition = buildCurrentRulesCondition(
    [
      buildDraftProperty({ propertyGroupKey: "length" }),
      buildDraftProperty({
        propertyGroupKey: "duties",
        propertyCode: 133,
        name: "Prefer Duty Period",
        bid: { type: "stepper", value: 2, min: 1, max: 4 },
      }),
    ],
    "f8",
    sqlBuilder,
  );

  assert.doesNotMatch(normalizeSql(condition), /pbs_calendar_days/);
  assert.match(normalizeSql(condition), /p\.tafb = \$1/);
  assert.match(normalizeSql(condition), / and \(p\.duty_count = \$2\)/);
  assert.deepEqual(sqlBuilder.params, [3, 2]);
});

test("buildCurrentRulesExpression reuses current OR groups with precomputed leaves", () => {
  const expression = buildCurrentRulesExpression(
    [
      buildDraftProperty({ propertyGroupKey: "length-3", rowSeq: 1 }),
      buildDraftProperty({
        propertyGroupKey: "length-4",
        rowSeq: 2,
        bid: { type: "stepper", value: 4, min: 1, max: 7 },
      }),
      buildDraftProperty({
        propertyGroupKey: "duties",
        rowSeq: 3,
        propertyCode: 133,
        name: "Prefer Duty Period",
        bid: { type: "stepper", value: 2, min: 1, max: 4 },
      }),
    ],
    (property) => `evaluated.match_${property.rowSeq}`,
  );

  assert.equal(
    normalizeSql(expression),
    "((evaluated.match_1) or (evaluated.match_2)) and (evaluated.match_3)",
  );
});

test("buildCurrentRulesCondition rejects duplicate single-use properties before SQL generation", () => {
  const sqlBuilder = createPairingSearchSqlBuilder();

  assert.throws(
    () =>
      buildCurrentRulesCondition(
        [
          buildDraftProperty({
            propertyGroupKey: "avg-credit-6",
            propertyCode: 142,
            name: "Minimum Avg Credit per Duty",
            bid: { type: "text", value: "06:00" },
          }),
          buildDraftProperty({
            propertyGroupKey: "avg-credit-7",
            propertyCode: 142,
            name: "Minimum Avg Credit per Duty",
            bid: { type: "text", value: "07:00" },
          }),
        ],
        "f8",
        sqlBuilder,
      ),
    (error) =>
      error instanceof LineholderBidServiceError
      && error.statusCode === 409
      && error.message === "Minimum Avg Credit per Duty can only be used once in T1.",
  );
  assert.deepEqual(sqlBuilder.params, []);
});

test("normalizeCurrentRulePreviewProperties filters and canonicalizes the requested tier", () => {
  const properties = normalizeCurrentRulePreviewProperties("T2", [
    buildDraftProperty({
      propertyGroupKey: "t2",
      rowSeq: 0,
      tiers: ["t2"],
    }),
    buildDraftProperty({
      propertyGroupKey: "t3",
      rowSeq: 0,
      tiers: ["T3"],
    }),
  ]);

  assert.equal(properties.length, 1);
  assert.equal(properties[0]?.propertyGroupKey, "t2");
  assert.equal(properties[0]?.rowSeq, 1);
  assert.deepEqual(properties[0]?.tiers, ["T2"]);
});

test("parsePreviewTier rejects unsupported tier labels", () => {
  assert.throws(
    () => parsePreviewTier("A1"),
    (error) =>
      error instanceof LineholderBidServiceError
      && error.statusCode === 400
      && error.message === "Unsupported pairing search tier: A1",
  );

  assert.throws(
    () => parsePreviewTier("L1"),
    (error) =>
      error instanceof LineholderBidServiceError
      && error.statusCode === 400
      && error.message === "Unsupported pairing search tier: L1",
  );
});
