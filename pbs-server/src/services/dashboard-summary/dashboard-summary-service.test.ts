import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ||= "postgresql://user:password@localhost:5432/rois?options=-c%20search_path%3Df8_pbs";
process.env.PBS_SCHEMA ||= "f8_pbs";
process.env.JWT_SECRET ||= "test-secret";
process.env.CORS_ORIGIN ||= "http://localhost:3030";

const createDb = () => {
  let executeCall = 0;

  return {
    async execute() {
      const callIndex = executeCall;
      executeCall += 1;

      if (callIndex === 0) {
        return { rows: [] };
      }

      return {
        rows: [{
          period_id: 42,
          roster_period_key: "2026RP02",
          period_code: "Apr 2026",
          filiale: "F8",
          status: "OPEN",
          bid_open_at: "2026-04-01T07:00:00.000Z",
          bid_close_at: "2026-04-09T06:59:00.000Z",
          base: "YVR",
          zone_id: "America/Vancouver",
          rp_start_local: "2026-01-31",
          rp_end_local: "2026-03-01",
        }],
      };
    },
  };
};

const createPgPool = () => ({
  async query(query: string, values: unknown[] = []) {
    if (
      query.includes("from input")
      && query.includes("left join f8.airport")
      && query.includes("pg_timezone_names")
    ) {
      assert.deepEqual(values, ["YVR"]);
      return {
        rows: [{ zone_id: "America/Vancouver" }],
      };
    }

    if (query.includes("join f8.roster_flight roster_flight")) {
      assert.deepEqual(values, ["F8001", "2026-01-31", "2026-03-01", "America/Vancouver", "IMP"]);
      assert.match(query, /roster_flight\.source = \$5/);
      return {
        rows: [
          {
            roster_id: "10",
            pairing_id: "9001",
            assignment_group: "FLT",
            assignment: null,
            label: "T4501",
            start_utc: "2026-02-05T14:00:00.000Z",
            end_utc: "2026-02-05T18:00:00.000Z",
            start_date: "2026-02-05",
            end_date: "2026-02-05",
            start_time: "06:00",
            end_time: "10:00",
          },
          {
            roster_id: "11",
            pairing_id: "9001",
            assignment_group: "FLT",
            assignment: null,
            label: "T4501",
            start_utc: "2026-02-05T19:00:00.000Z",
            end_utc: "2026-02-05T23:00:00.000Z",
            start_date: "2026-02-05",
            end_date: "2026-02-05",
            start_time: "11:00",
            end_time: "15:00",
          },
          {
            roster_id: "12",
            pairing_id: null,
            assignment_group: "GRD",
            assignment: "DO",
            label: null,
            start_utc: "2026-02-10T08:00:00.000Z",
            end_utc: "2026-02-11T07:59:00.000Z",
            start_date: "2026-02-10",
            end_date: "2026-02-10",
            start_time: "00:00",
            end_time: "23:59",
          },
        ],
      };
    }

    throw new Error(`Unexpected query: ${query}`);
  },
});

const createCountingDb = (period: {
  rosterPeriodKey?: string;
  base?: string | null;
  zoneId?: string | null;
} = {}) => {
  let executeCalls = 0;

  return {
    get executeCalls() {
      return executeCalls;
    },
    async execute() {
      executeCalls += 1;

      if (executeCalls === 1) {
        return { rows: [] };
      }

      return {
        rows: [{
          period_id: 42,
          roster_period_key: period.rosterPeriodKey ?? "2026RP02",
          period_code: "Apr 2026",
          filiale: "F8",
          status: "OPEN",
          bid_open_at: "2026-04-01T07:00:00.000Z",
          bid_close_at: "2026-04-09T06:59:00.000Z",
          base: period.base ?? "YVR",
          zone_id: period.zoneId ?? "America/Vancouver",
          rp_start_local: "2026-01-31",
          rp_end_local: "2026-03-01",
        }],
      };
    },
  };
};

const createProfile = () => ({
  id: "1",
  employeeNo: "F8001",
  name: "Alex Crew",
  email: null,
  base: "YVR",
  rank: "FA",
  division: "C",
  fleet: null,
  languages: null,
  seniorityLabel: null,
  statusLabel: null,
  existingCreditLabel: null,
  trainingMonthLabel: null,
  lastLoginLabel: null,
});

test("dashboard summary service returns real summary fields without fabricated AA targets", async () => {
  const { createPbsDashboardSummaryService } = await import("./dashboard-summary-service.js");
  const profile = {
    id: "1",
    employeeNo: "F8001",
    name: "Alex Crew",
    email: "alex.crew@example.com",
    base: "YVR",
    rank: "FA",
    division: "C",
    fleet: ["737"],
    languages: ["EN 5"],
    seniorityLabel: "646",
    statusLabel: null,
    existingCreditLabel: "75.5",
    trainingMonthLabel: null,
    lastLoginLabel: "Apr 01, 19:30",
  };
  const service = createPbsDashboardSummaryService({
    db: createDb() as never,
    pgPool: createPgPool() as never,
    liveSchema: "f8",
    pbsSchema: "f8_pbs",
    dashboardProfileService: {
      async getCurrentProfile(actor) {
        assert.equal(actor.crewId, "F8001");
        assert.equal(actor.rosterPeriodKey, "2026RP02");
        return profile;
      },
    },
  });

  const summary = await service.getCurrentSummary({
    crewId: "F8001",
    userCode: "alex.crew",
  });

  assert.deepEqual(summary.profile, profile);
  assert.equal(summary.bidPackage.periodCode, "Apr 2026");
  assert.equal(summary.bidPackage.rosterPeriodId, 42);
  assert.equal(summary.bidPackage.rpStartLocal, "2026-01-31");
  assert.equal(summary.bidPackage.rpEndLocal, "2026-03-01");
  assert.equal(summary.bidPackage.bidStartLabel, "Apr 01, 00:00");
  assert.equal(summary.bidPackage.bidCloseLabel, "Apr 08, 23:59");
  assert.equal(summary.bidPackage.timezoneLabel, "YVR Local Time");
  assert.equal(summary.bidPackage.targetedLine, null);
  assert.equal(summary.bidPackage.targetedReserve, null);
  assert.equal(summary.bidPackage.totalBidder, null);
  assert.equal(summary.messageCenter.baseLineAverage, null);
  assert.deepEqual(summary.messageCenter.fleetItems, []);
  assert.deepEqual(summary.messageCenter.preAssignments, {
    totalDuties: 2,
    daysTouched: 2,
    categories: [
      { code: "PAIRING", label: "Pairing", count: 1 },
      { code: "DAYS_OFF", label: "Days Off", count: 1 },
    ],
    details: [
      {
        id: "pairing:9001",
        type: "pairing",
        code: "PAIRING",
        label: "T4501",
        startDate: "2026-02-05",
        endDate: "2026-02-05",
        timeText: "06:00-15:00",
      },
      {
        id: "ground:GRD:DO::1770710400000:1770796740000",
        type: "ground",
        code: "DO",
        label: "Days Off",
        startDate: "2026-02-10",
        endDate: "2026-02-10",
        timeText: "00:00-23:59",
      },
    ],
  });
  assert.deepEqual(summary.messageCenter.messages, []);
});

test("dashboard summary service skips obsolete bid package fleet statistics", async () => {
  const { createPbsDashboardSummaryService } = await import("./dashboard-summary-service.js");
  const service = createPbsDashboardSummaryService({
    db: createDb() as never,
    pgPool: {
      async query(query: string) {
        if (
          query.includes("join f8.pairing")
          || query.includes("from f8.fleet")
          || query.includes("from f8_pbs.pbs_user")
        ) {
          throw new Error("Obsolete Bid Package statistics should not be queried.");
        }

        if (
          query.includes("from input")
          && query.includes("left join f8.airport")
          && query.includes("pg_timezone_names")
        ) {
          return {
            rows: [{ zone_id: "America/Vancouver" }],
          };
        }

        if (query.includes("join f8.roster_flight roster_flight")) {
          return { rows: [] };
        }

        throw new Error(`Unexpected query: ${query}`);
      },
    } as never,
    liveSchema: "f8",
    pbsSchema: "f8_pbs",
    dashboardProfileService: {
      async getCurrentProfile() {
        return {
          id: "1",
          employeeNo: "F8001",
          name: "Alex Crew",
          email: null,
          base: "YVR",
          rank: "FA",
          division: "C",
          fleet: null,
          languages: null,
          seniorityLabel: null,
          statusLabel: null,
          existingCreditLabel: null,
          trainingMonthLabel: null,
          lastLoginLabel: null,
        };
      },
    },
  });

  const summary = await service.getCurrentSummary({
    crewId: "F8001",
    userCode: "alex.crew",
  });

  assert.equal(summary.bidPackage.totalBidder, null);
  assert.deepEqual(summary.messageCenter.fleetItems, []);
  assert.deepEqual(summary.messageCenter.preAssignments, {
    totalDuties: 0,
    daysTouched: 0,
    categories: [],
    details: [],
  });
});

test("dashboard summary service returns all pre-assigned duty details without truncating to five", async () => {
  const { createPbsDashboardSummaryService } = await import("./dashboard-summary-service.js");
  const service = createPbsDashboardSummaryService({
    db: createDb() as never,
    pgPool: {
      async query(query: string) {
        if (
          query.includes("from input")
          && query.includes("left join f8.airport")
          && query.includes("pg_timezone_names")
        ) {
          return {
            rows: [{ zone_id: "America/Vancouver" }],
          };
        }

        if (query.includes("join f8.roster_flight roster_flight")) {
          return {
            rows: Array.from({ length: 6 }, (_, index) => {
              const day = String(index + 1).padStart(2, "0");

              return {
                roster_id: String(100 + index),
                pairing_id: null,
                assignment_group: "GRD",
                assignment: "DO",
                label: null,
                start_utc: `2026-02-${day}T08:00:00.000Z`,
                end_utc: `2026-02-${day}T23:00:00.000Z`,
                start_date: `2026-02-${day}`,
                end_date: `2026-02-${day}`,
                start_time: "00:00",
                end_time: "15:00",
              };
            }),
          };
        }

        throw new Error(`Unexpected query: ${query}`);
      },
    } as never,
    liveSchema: "f8",
    pbsSchema: "f8_pbs",
    dashboardProfileService: {
      async getCurrentProfile() {
        return {
          id: "1",
          employeeNo: "F8001",
          name: "Alex Crew",
          email: null,
          base: "YVR",
          rank: "FA",
          division: "C",
          fleet: null,
          languages: null,
          seniorityLabel: null,
          statusLabel: null,
          existingCreditLabel: null,
          trainingMonthLabel: null,
          lastLoginLabel: null,
        };
      },
    },
  });

  const summary = await service.getCurrentSummary({
    crewId: "F8001",
    userCode: "alex.crew",
  });

  assert.equal(summary.messageCenter.preAssignments.totalDuties, 6);
  assert.equal(summary.messageCenter.preAssignments.details.length, 6);
  assert.equal(summary.messageCenter.preAssignments.details.at(-1)?.startDate, "2026-02-06");
});

test("dashboard summary service rejects unsafe schema names", async () => {
  const { createPbsDashboardSummaryService } = await import("./dashboard-summary-service.js");

  assert.throws(
    () => createPbsDashboardSummaryService({
      db: createDb() as never,
      pgPool: createPgPool() as never,
      liveSchema: "f8;drop",
      pbsSchema: "f8_pbs",
      dashboardProfileService: {
        async getCurrentProfile() {
          throw new Error("Not used.");
        },
      },
    }),
    /Invalid live schema name/,
  );
});

test("dashboard summary service caches the current period between repeated reads", async () => {
  const { createPbsDashboardSummaryService } = await import("./dashboard-summary-service.js");
  const db = createCountingDb();
  let profileCalls = 0;
  let preAssignmentQueries = 0;
  const service = createPbsDashboardSummaryService({
    db: db as never,
    pgPool: {
      async query(query: string) {
        if (query.includes("join f8.roster_flight roster_flight")) {
          preAssignmentQueries += 1;
          return { rows: [] };
        }

        throw new Error(`Unexpected query: ${query}`);
      },
    } as never,
    liveSchema: "f8",
    pbsSchema: "f8_pbs",
    dashboardProfileService: {
      async getCurrentProfile(actor) {
        profileCalls += 1;
        assert.equal(actor.rosterPeriodKey, "2026RP02");
        return createProfile();
      },
    },
  });

  await service.getCurrentSummary({ crewId: "F8001", userCode: "alex.crew" });
  await service.getCurrentSummary({ crewId: "F8001", userCode: "alex.crew" });

  // First request loads business-time config + current period. The second request hits both caches.
  assert.equal(db.executeCalls, 2);
  assert.equal(profileCalls, 2);
  assert.equal(preAssignmentQueries, 2);
});

test("dashboard summary service loads profile and pre-assigned duties in parallel when period timezone is complete", async () => {
  const { createPbsDashboardSummaryService } = await import("./dashboard-summary-service.js");
  const releaseProfileRef: { current: (() => void) | null } = { current: null };
  let profileStarted: (() => void) | null = null;
  let preAssignmentQueried = false;
  const profileStartedPromise = new Promise<void>((resolve) => {
    profileStarted = resolve;
  });
  const service = createPbsDashboardSummaryService({
    db: createDb() as never,
    pgPool: {
      async query(query: string) {
        if (query.includes("join f8.roster_flight roster_flight")) {
          preAssignmentQueried = true;
          return { rows: [] };
        }

        throw new Error(`Unexpected query: ${query}`);
      },
    } as never,
    liveSchema: "f8",
    pbsSchema: "f8_pbs",
    dashboardProfileService: {
      async getCurrentProfile() {
        profileStarted?.();
        await new Promise<void>((resolve) => {
          releaseProfileRef.current = resolve;
        });
        return createProfile();
      },
    },
  });

  const summaryPromise = service.getCurrentSummary({ crewId: "F8001", userCode: "alex.crew" });
  await profileStartedPromise;
  await new Promise((resolve) => {
    setImmediate(resolve);
  });

  assert.equal(preAssignmentQueried, true);
  assert.ok(releaseProfileRef.current);
  releaseProfileRef.current();
  const summary = await summaryPromise;
  assert.equal(summary.bidPackage.timezoneLabel, "YVR Local Time");
});
