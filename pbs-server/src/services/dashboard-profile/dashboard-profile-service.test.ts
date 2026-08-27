import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ||= "postgresql://user:password@localhost:5432/rois?options=-c%20search_path%3Df8_pbs";
process.env.PBS_SCHEMA ||= "f8_pbs";
process.env.JWT_SECRET ||= "test-secret";
process.env.CORS_ORIGIN ||= "http://localhost:3030";

type FakeDbOptions = {
  user: Record<string, unknown> | null;
  openPeriod?: Array<Record<string, unknown>>;
  latestPeriod?: Array<Record<string, unknown>>;
};

const createDb = ({
  user,
  openPeriod = [{ id: 11, periodCode: "Apr 2026" }],
  latestPeriod = [],
}: FakeDbOptions) => {
  let selectCall = 0;
  let executeCall = 0;

  return {
    async execute() {
      const callIndex = executeCall;
      executeCall += 1;

      if (callIndex === 0) {
        return { rows: [] };
      }

      return {
        rows: openPeriod.map((period) => ({
          period_id: period.id ?? null,
          roster_period_key: period.rosterPeriodKey ?? "2026RP04",
          period_code: period.periodCode ?? null,
          filiale: period.filiale ?? "F8",
          status: period.status ?? "OPEN",
          bid_open_at: period.bidOpenAt ?? "2026-04-01T00:00:00.000Z",
          bid_close_at: period.bidCloseAt ?? "2026-04-08T23:59:00.000Z",
          base: "YVR",
          zone_id: "America/Vancouver",
          rp_start_local: period.rpStartLocal ?? "2026-04-01",
          rp_end_local: period.rpEndLocal ?? "2026-04-30",
        })),
      };
    },
    select() {
      const callIndex = selectCall;
      selectCall += 1;
      const rows = callIndex === 0
        ? (user ? [user] : [])
        : callIndex === 1
          ? openPeriod
          : latestPeriod;
      const chain = {
        from() {
          return chain;
        },
        where() {
          return chain;
        },
        orderBy() {
          return chain;
        },
        async limit() {
          return rows;
        },
      };

      return chain;
    },
  };
};

const createPgPool = (
  handler: (query: string, values: unknown[]) => Array<Record<string, unknown>>,
) => ({
  async query(query: string, values: unknown[] = []) {
    return {
      rows: handler(query, values),
    };
  },
});

const createEmptyPgPool = () => createPgPool(() => []);

const isCrewIdentityQuery = (query: string) =>
  query.includes("with actor as")
  && query.includes("base_row.base")
  && query.includes("rank_row.rank")
  && query.includes("airport.zone_id");

const createSingleUserDb = (input: {
  user: Record<string, unknown> | null;
  periodKey?: string;
  onSelect?: () => void;
  onExecute?: () => void;
}) => ({
  async execute() {
    input.onExecute?.();
    return {
      rows: [{
        period_id: 20,
        roster_period_key: input.periodKey ?? "2026RP04",
        period_code: "Apr 2026",
        filiale: "F8",
        status: "OPEN",
        bid_open_at: "2026-04-01T00:00:00.000Z",
        bid_close_at: "2026-04-08T23:59:00.000Z",
        base: "YVR",
        zone_id: "America/Vancouver",
        rp_start_local: "2026-04-01",
        rp_end_local: "2026-04-30",
      }],
    };
  },
  select() {
    input.onSelect?.();
    const rows = input.user ? [input.user] : [];
    const chain = {
      from() {
        return chain;
      },
      where() {
        return chain;
      },
      async limit() {
        return rows;
      },
    };

    return chain;
  },
});

test("dashboard profile service maps stable pbs_user fields and live profile fields", async () => {
  const { createPbsDashboardProfileService } = await import("./dashboard-profile-service.js");
  const service = createPbsDashboardProfileService({
    db: createDb({
      user: {
        id: 42,
        crewId: "F8001",
        userName: "Alex Crew",
        email: " alex.crew@example.com ",
        base: "YVR",
        rank: "FA",
        division: "C",
        lastLoginAt: "2026-04-02T02:30:00.000Z",
      },
    }) as never,
    pgPool: createPgPool((query, values) => {
      if (query.includes(".crew_status")) {
        throw new Error("STATUS is not defined yet and should not be queried.");
      }

      // crew-identity resolution (base/rank/division/zoneId from one live query).
      if (isCrewIdentityQuery(query)) {
        return [{ base: "YVR", rank: "FA", division: "C", zoneId: "America/Vancouver" }];
      }

      if (
        query.includes(".crew")
        && query.includes(".crew_fleet")
        && query.includes(".crew_language")
        && query.includes(".crew_manday_cc_am_period")
      ) {
        assert.deepEqual(values, ["F8001", "YVR", "2026RP04"]);
        return [{
          seniority_num: "646.00",
          fleet_values: ["737", "7M8"],
          language_values: ["EN 5", "FR"],
          credit: "75.50",
          zone_id: "America/Vancouver",
        }];
      }

      return [];
    }) as never,
    liveSchema: "f8",
  });

  const profile = await service.getCurrentProfile({ crewId: "F8001" });

  assert.deepEqual(profile, {
    id: "42",
    employeeNo: "F8001",
    name: "Alex Crew",
    email: "alex.crew@example.com",
    base: "YVR",
    rank: "FA",
    division: "C",
    fleet: ["737", "7M8"],
    languages: ["EN 5", "FR"],
    seniorityLabel: "646",
    statusLabel: null,
    existingCreditLabel: "75.5",
    trainingMonthLabel: null,
    lastLoginLabel: "Apr 01, 19:30",
  });
});

test("dashboard profile service loads pilot monthly credit from the fd manday table", async () => {
  const { createPbsDashboardProfileService } = await import("./dashboard-profile-service.js");
  let loadedFdTable = false;
  const service = createPbsDashboardProfileService({
    db: createDb({
      user: {
        id: 44,
        crewId: "F8004",
        userName: "Pilot Crew",
        email: null,
        base: "YYZ",
        rank: "CA",
        division: "P",
        lastLoginAt: null,
      },
      openPeriod: [{ id: 12, rosterPeriodKey: "2026RP05", periodCode: "May 2026" }],
    }) as never,
    pgPool: createPgPool((query, values) => {
      // crew-identity resolution (base/rank/division/zoneId from one live query).
      if (isCrewIdentityQuery(query)) {
        return [{ base: "YYZ", rank: "CA", division: "P", zoneId: null }];
      }

      if (query.includes(".crew_manday_fd_period")) {
        loadedFdTable = true;
        assert.deepEqual(values, ["F8004", "YYZ", "2026RP05"]);
        return [{
          seniority_num: "100.10",
          fleet_values: null,
          language_values: null,
          credit: "80.00",
          zone_id: null,
        }];
      }

      if (query.includes(".crew_manday_cc_am_period")) {
        throw new Error("Pilot credit should not be loaded from cc/am monthly table.");
      }

      return [];
    }) as never,
    liveSchema: "f8",
  });

  const profile = await service.getCurrentProfile({ crewId: "F8004" });

  assert.equal(loadedFdTable, true);
  assert.equal(profile.seniorityLabel, "100.1");
  assert.equal(profile.statusLabel, null);
  assert.equal(profile.existingCreditLabel, "80");
});

test("dashboard profile service returns null for empty optional fields", async () => {
  const { createPbsDashboardProfileService } = await import("./dashboard-profile-service.js");
  const service = createPbsDashboardProfileService({
    db: createDb({
      user: {
        id: 43,
        crewId: "F8002",
        userName: "Casey Crew",
        email: " ",
        base: null,
        rank: "",
        division: null,
        lastLoginAt: null,
      },
    }) as never,
    pgPool: createEmptyPgPool() as never,
    liveSchema: "f8",
  });

  const profile = await service.getCurrentProfile({ crewId: "F8002" });

  assert.equal(profile.email, null);
  assert.equal(profile.base, null);
  assert.equal(profile.rank, null);
  assert.equal(profile.division, null);
  assert.equal(profile.fleet, null);
  assert.equal(profile.languages, null);
  assert.equal(profile.seniorityLabel, null);
  assert.equal(profile.statusLabel, null);
  assert.equal(profile.existingCreditLabel, null);
  assert.equal(profile.lastLoginLabel, null);
});

test("dashboard profile service uses the roster period key even when the display code is not parseable", async () => {
  const { createPbsDashboardProfileService } = await import("./dashboard-profile-service.js");
  const service = createPbsDashboardProfileService({
    db: createDb({
      user: {
        id: 45,
        crewId: "F8005",
        userName: "Period Crew",
        email: null,
        base: "YYZ",
        rank: "FA",
        division: "A",
        lastLoginAt: null,
      },
      openPeriod: [{ id: 13, rosterPeriodKey: "2026RP13", periodCode: "bad-period" }],
    }) as never,
    pgPool: createPgPool((query, values) => {
      // crew-identity resolution (base/rank/division/zoneId from one live query).
      if (isCrewIdentityQuery(query)) {
        return [{ base: "YYZ", rank: "FA", division: "A", zoneId: null }];
      }

      if (query.includes(".crew_manday_cc_am_period")) {
        assert.deepEqual(values, ["F8005", "YYZ", "2026RP13"]);
        return [{
          seniority_num: null,
          fleet_values: null,
          language_values: null,
          credit: "77.25",
          zone_id: null,
        }];
      }

      return [];
    }) as never,
    liveSchema: "f8",
  });

  const profile = await service.getCurrentProfile({ crewId: "F8005" });

  assert.equal(profile.statusLabel, null);
  assert.equal(profile.existingCreditLabel, "77.25");
});

test("dashboard profile service rejects unsafe live schema names", async () => {
  const { createPbsDashboardProfileService } = await import("./dashboard-profile-service.js");

  assert.throws(
    () => createPbsDashboardProfileService({
      db: createDb({ user: null }) as never,
      pgPool: createEmptyPgPool() as never,
      liveSchema: "f8;drop table crew",
    }),
    /Invalid live schema name/,
  );
});

test("dashboard profile service rejects missing pbs_user profile", async () => {
  const {
    createPbsDashboardProfileService,
    DashboardProfileServiceError,
  } = await import("./dashboard-profile-service.js");
  const service = createPbsDashboardProfileService({
    db: createDb({ user: null }) as never,
    pgPool: createPgPool(() => {
      throw new Error("Live tables should not be queried without pbs_user.");
    }) as never,
    liveSchema: "f8",
  });

  await assert.rejects(
    () => service.getCurrentProfile({ crewId: "missing" }),
    (error) => error instanceof DashboardProfileServiceError && error.statusCode === 404,
  );
});

test("dashboard profile service resolves an implicit current period before profile cache lookup", async () => {
  const { createPbsDashboardProfileService } = await import("./dashboard-profile-service.js");
  let pbsUserQueries = 0;
  let liveProfileQueries = 0;
  let currentPeriodQueries = 0;
  const service = createPbsDashboardProfileService({
    db: createSingleUserDb({
      periodKey: "2026RP07",
      user: {
        id: 46,
        crewId: "F8006",
        userName: "Cached Crew",
        email: null,
        division: "C",
        lastLoginAt: null,
      },
      onSelect: () => {
        pbsUserQueries += 1;
      },
      onExecute: () => {
        currentPeriodQueries += 1;
      },
    }) as never,
    pgPool: createPgPool((query, values) => {
      if (isCrewIdentityQuery(query)) {
        return [{ base: "YVR", rank: "FA", division: "C", zoneId: "America/Vancouver" }];
      }

      if (query.includes(".crew_manday_cc_am_period")) {
        liveProfileQueries += 1;
        assert.deepEqual(values, ["F8006", "YVR", "2026RP07"]);
        return [{
          seniority_num: "10",
          fleet_values: ["737"],
          language_values: null,
          credit: "66",
        }];
      }

      return [];
    }) as never,
    liveSchema: "f8",
  });

  const first = await service.getCurrentProfile({ crewId: "F8006" });
  const second = await service.getCurrentProfile({ crewId: "F8006" });

  assert.equal(first.existingCreditLabel, "66");
  assert.deepEqual(second, first);
  assert.equal(pbsUserQueries, 1);
  assert.equal(liveProfileQueries, 1);
  // First call loads business-time config and current period; second call hits both period/profile caches.
  assert.equal(currentPeriodQueries, 2);
});

test("dashboard profile service keys cached credit by explicit roster period", async () => {
  const { createPbsDashboardProfileService } = await import("./dashboard-profile-service.js");
  let liveProfileQueries = 0;
  const service = createPbsDashboardProfileService({
    db: createSingleUserDb({
      user: {
        id: 47,
        crewId: "F8007",
        userName: "Period Cache Crew",
        email: null,
        division: "C",
        lastLoginAt: null,
      },
      onExecute: () => {
        throw new Error("Explicit rosterPeriodKey should not resolve current period.");
      },
    }) as never,
    pgPool: createPgPool((query, values) => {
      if (isCrewIdentityQuery(query)) {
        return [{ base: "YVR", rank: "FA", division: "C", zoneId: "America/Vancouver" }];
      }

      if (query.includes(".crew_manday_cc_am_period")) {
        liveProfileQueries += 1;
        const rosterPeriodKey = values[2];
        return [{
          seniority_num: "20",
          fleet_values: null,
          language_values: null,
          credit: rosterPeriodKey === "2026RP04" ? "44" : "55",
        }];
      }

      return [];
    }) as never,
    liveSchema: "f8",
  });

  const first = await service.getCurrentProfile({ crewId: "F8007", rosterPeriodKey: "2026RP04" });
  const second = await service.getCurrentProfile({ crewId: "F8007", rosterPeriodKey: "2026RP04" });
  const third = await service.getCurrentProfile({ crewId: "F8007", rosterPeriodKey: "2026RP05" });

  assert.equal(first.existingCreditLabel, "44");
  assert.equal(second.existingCreditLabel, "44");
  assert.equal(third.existingCreditLabel, "55");
  assert.equal(liveProfileQueries, 2);
});
