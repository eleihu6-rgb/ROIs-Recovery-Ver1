import assert from "node:assert/strict";
import test from "node:test";
import { createPbsAwardResultsService } from "./award-results-service.js";
import type { AwardRosterRow } from "./types.js";

process.env.DATABASE_URL ||= "postgresql://user:password@localhost:5432/rois?options=-c%20search_path%3Df8_pbs";
process.env.PBS_SCHEMA ||= "f8_pbs";
process.env.JWT_SECRET ||= "test-secret";
process.env.CORS_ORIGIN ||= "http://localhost:3030";

test("createPbsAwardResultsService resolves current period with PBS business time", async () => {
  const queries: Array<{ text: string; values?: unknown[] }> = [];
  const executeQueries: unknown[] = [];
  const rosterRows: AwardRosterRow[] = [
    {
      publish_id: "1",
      roster_id: "101",
      crew_id: "13401",
      pairing_id: "2001",
      pairing_label: "V4558",
      assignment_group: "FLY",
      assignment: "FLY",
      label: "F8808 YVR-YYC",
      flt_id: "8808",
      flt_dt: "2026-06-01",
      start_utc: "2026-06-01 08:20:00",
      end_utc: "2026-06-01 09:50:00",
      dep_arp: "YVR",
      arv_arp: "YYC",
      position: "FA",
      acting_rank: "FA",
      active_rank: "FA",
      duty_seq: 1,
      seg_seq: 1,
      seq_order: 1,
      sch_credit_minutes: "90",
      act_credit_minutes: null,
      tafb_days: "2",
      base: "YVR",
      fleet: "737",
      fleet_seg: "7M8",
      comments: "PBS_AWARD_V1|Matched your Tier 3 pairing preferences.",
      source: "CR",
      request_source: "SCENARIO",
      request_id: "541",
    },
  ];
  const db = {
    async execute(query: unknown) {
      executeQueries.push(query);

      if (executeQueries.length === 1) {
        return {
          rows: [
            { code: "PBS_BUSINESS_TIME_MODE", code_value: "ROLLING" },
            { code: "PBS_BUSINESS_TIME_ANCHOR", code_value: "2026-05-04T05:00:00.000Z" },
            { code: "PBS_BUSINESS_TIME_ANCHOR_REAL", code_value: new Date().toISOString() },
          ],
        };
      }

      return {
        rows: [
          {
            period_id: "75",
            period_code: "Jun 2026",
            filiale: "F8",
            status: "PUBLISHED",
            bid_open_at: "2026-05-01 00:00:00",
            bid_close_at: "2026-05-08 23:59:00",
          },
        ],
      };
    },
  };
  const pgPool = {
    async query(text: string, values?: unknown[]) {
      queries.push({ text, values });

      if (text.includes("schedule_publish_record")) {
        return {
          rows: [{
            period_id: "75",
            period_code: "Jun 2026",
            rp_start: "2026-06-01T00:00:00.000Z",
            rp_end: "2026-06-30T00:00:00.000Z",
            bid_open_at: "2026-05-01T00:00:00.000Z",
            bid_close_at: "2026-05-08T23:59:00.000Z",
            award_publish_at: "2026-05-02T00:00:00.000Z",
            award_final_at: "2026-05-04T00:00:00.000Z",
            mis_award_deadline_at: "2026-05-08T00:00:00.000Z",
            status: "PUBLISHED",
            first_published_at: "2026-05-03T01:00:00.000Z",
            latest_published_at: "2026-05-03T01:00:00.000Z",
            base: "YVR",
            zone_id: "America/Vancouver",
          }],
        };
      }

      if (text.includes("roster_publish")) {
        return { rows: rosterRows };
      }

      return { rows: [] };
    },
  };
  const service = createPbsAwardResultsService({
    db: db as never,
    pgPool: pgPool as never,
    liveSchema: "f8",
    pbsSchema: "f8_pbs",
  });

  const response = await service.getCurrentAward({
    crewId: "13401",
    userCode: "casey.crew",
  });

  assert.equal(response.periodCode, "Jun 2026");
  assert.deepEqual(response.timeZone, {
    base: "YVR",
    zoneId: "America/Vancouver",
    timezoneLabel: "YVR Local Time",
    fallback: false,
  });
  assert.equal(response.summary.pairingCount, 1);
  assert.equal(response.items[0]?.label, "V4558");
  assert.equal(executeQueries.length, 1);
  const rosterQuery = queries[1]?.text ?? "";
  assert.match(rosterQuery, /to_char\(rp\.sch_str_dt_utc/);
  assert.match(rosterQuery, /rp\.flt_dt::date >= \$2::date/);
  assert.match(rosterQuery, /rp\.sch_credited_minutes::text as sch_credit_minutes/);
  assert.match(rosterQuery, /rp\.act_credited_minutes::text as act_credit_minutes/);
  assert.match(rosterQuery, /rp\.roster_flight_id::text as roster_id/);
  assert.match(rosterQuery, /rp\.flight_acting_rank::varchar as acting_rank/);
  assert.match(rosterQuery, /rp\.duty_seq::int as duty_seq/);
  assert.match(rosterQuery, /rp\.seg_seq::int as seg_seq/);
  assert.match(rosterQuery, /rp\.fleet_seg::varchar as fleet_seg/);
  assert.match(rosterQuery, /rp\.comments::varchar as comments/);
  assert.match(rosterQuery, /rp\.source::varchar as source/);
  assert.match(rosterQuery, /rp\.request_source::varchar as request_source/);
  assert.match(rosterQuery, /rp\.request_id::text as request_id/);
  assert.doesNotMatch(rosterQuery, /rp\.roster_id/);
  assert.doesNotMatch(rosterQuery, /rp\.acting_rank/);
  assert.doesNotMatch(rosterQuery, /join\s+"?f8"?\.roster_flight/i);
  assert.doesNotMatch(rosterQuery, /join\s+"?f8"?\.pairing\b/i);
  assert.doesNotMatch(rosterQuery, /join\s+"?f8"?\.pairing_segment/i);
  assert.deepEqual(queries[1]?.values, ["13401", "2026-05-30", "2026-07-03"]);
  assert.deepEqual(queries[2]?.values, ["13401", 75]);
  assert.match(queries[2]?.text ?? "", /ar\.roster_period_id = \$2/);
});

test("createPbsAwardResultsService rejects invalid dynamic schema names", () => {
  const db = { async execute() { return { rows: [] }; } };
  const pgPool = { async query() { return { rows: [] }; } };

  assert.throws(
    () => createPbsAwardResultsService({
      db: db as never,
      pgPool: pgPool as never,
      liveSchema: "f8;drop",
      pbsSchema: "f8_pbs",
    }),
    /Invalid live schema name/,
  );
});

test("createPbsAwardResultsService does not expose an unavailable selected period as historical fallback", async () => {
  const db = {
    async execute() {
      return {
        rows: [
          { code: "PBS_BUSINESS_TIME_MODE", code_value: "ROLLING" },
          { code: "PBS_BUSINESS_TIME_ANCHOR", code_value: "2026-05-04T05:00:00.000Z" },
          { code: "PBS_BUSINESS_TIME_ANCHOR_REAL", code_value: new Date().toISOString() },
        ],
      };
    },
  };
  const pgPool = {
    async query(text: string) {
      assert.match(text, /schedule_publish_record/);
      return {
        rows: [{
          period_id: "76",
          period_code: "Jul 2026",
          rp_start: "2026-07-01T00:00:00",
          rp_end: "2026-07-31T23:59:59",
          bid_open_at: "2026-06-01T00:00:00.000Z",
          bid_close_at: "2026-06-08T23:59:00.000Z",
          award_publish_at: "2026-06-20T12:00:00.000Z",
          award_final_at: null,
          mis_award_deadline_at: null,
          status: "DRAFT",
          first_published_at: null,
          latest_published_at: null,
          base: "YVR",
          zone_id: "America/Vancouver",
        }],
      };
    },
  };
  const service = createPbsAwardResultsService({
    db: db as never,
    pgPool: pgPool as never,
    liveSchema: "f8",
    pbsSchema: "f8_pbs",
  });

  const response = await service.getCurrentAward({ crewId: "13401", userCode: "casey.crew" });

  assert.equal(response.availability, "UNCONFIGURED");
  assert.equal(response.upcomingPeriod, null);
});
