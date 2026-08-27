import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ||= "postgresql://user:password@localhost:5432/rois?options=-c%20search_path%3Df8_pbs";
process.env.PBS_SCHEMA ||= "f8_pbs";
process.env.JWT_SECRET ||= "test-secret";
process.env.CORS_ORIGIN ||= "http://localhost:3030";
process.env.PBS_INTERNAL_API_SECRET ||= "test-internal-secret";

const createUser = (overrides: Record<string, unknown> = {}) => ({
  id: 4010,
  userCode: "B79185",
  userName: "Mary Nasso",
  crewId: "B79185",
  status: 0,
  portalAccess: "1",
  effDt: new Date(Date.now() - 60_000),
  expDt: null,
  ...overrides,
});

const createDb = (
  user: Record<string, unknown> | null,
  logs: Array<{
    id: number;
    crewId: string;
    newValue: string | null;
    operatedAt: Date;
  }> = [],
  configRows: Array<{
    code: string;
    codeValue: string | null;
  }> = [
    { code: "PBS_PORTAL_PUBLIC_URL", codeValue: "https://crew-f8-usva-sit.roiscloud.com/pbs" },
    { code: "PBS_SIMULATED_LOGIN_TTL_SECONDS", codeValue: "300" },
  ],
) => {
  const inserts: Record<string, unknown>[] = [];
  let selectCallIndex = 0;

  return {
    inserts,
    select() {
      const callIndex = selectCallIndex;
      selectCallIndex += 1;

      return {
        from() {
          return {
            where() {
              return {
                async limit(limit: number) {
                  if (callIndex > 0) {
                    return configRows.slice(0, limit);
                  }

                  return user ? [user].slice(0, limit) : [];
                },
                orderBy() {
                  return {
                    async limit(limit: number) {
                      return logs.slice(0, limit);
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
    insert() {
      return {
        async values(value: Record<string, unknown>) {
          inserts.push(value);
        },
      };
    },
  };
};

const createConfigDb = (
  configRows: Array<{
    code: string;
    codeValue: string | null;
  }> = [
    { code: "PBS_PORTAL_PUBLIC_URL", codeValue: "https://crew-f8-usva-sit.roiscloud.com/pbs" },
    { code: "PBS_SIMULATED_LOGIN_TTL_SECONDS", codeValue: "300" },
  ],
  updateHits: boolean[] = [],
) => {
  const updates: Record<string, unknown>[] = [];
  const inserts: Record<string, unknown>[] = [];
  let updateIndex = 0;

  return {
    updates,
    inserts,
    select() {
      return {
        from() {
          return {
            where() {
              return {
                async limit(limit: number) {
                  return configRows.slice(0, limit);
                },
              };
            },
          };
        },
      };
    },
    update() {
      return {
        set(value: Record<string, unknown>) {
          return {
            where() {
              return {
                async returning() {
                  const hit = updateHits[updateIndex] ?? false;
                  updateIndex += 1;
                  updates.push(value);
                  return hit ? [{ id: updateIndex }] : [];
                },
              };
            },
          };
        },
      };
    },
    insert() {
      return {
        async values(value: Record<string, unknown>) {
          inserts.push(value);
        },
      };
    },
  };
};

test("simulated crew portal service creates configured portal login URL and audit log", async () => {
  const { createSimulatedCrewPortalSession } = await import("./simulated-crew-portal-service.js");
  const db = createDb(createUser());

  const session = await createSimulatedCrewPortalSession(db as never, {
    crewCode: "B79185",
    adminUserCode: "admin",
    adminUserName: "Admin User",
    ipAddress: "127.0.0.1",
  });

  const url = new URL(session.cleanUrl);
  assert.equal(url.origin, "https://crew-f8-usva-sit.roiscloud.com");
  assert.equal(url.pathname, "/pbs/login");
  assert.equal(url.searchParams.get("simulate"), "1");
  assert.equal(url.searchParams.get("redirect"), "/bid");
  assert.equal(url.searchParams.has("simulateToken"), false);
  assert.equal(typeof session.token, "string");
  assert.equal(session.maxAgeSeconds, 300);
  assert.equal(db.inserts.length, 1);
  assert.equal(db.inserts[0].operation, "SIMULATED_LOGIN");
  assert.equal(db.inserts[0].crewId, "B79185");
});

test("simulated crew portal service fails clearly when portal URL config is missing", async () => {
  const { createSimulatedCrewPortalSession } = await import("./simulated-crew-portal-service.js");
  const { SimulatedCrewPortalError } = await import("./simulated-crew-portal-error.js");
  const db = createDb(createUser(), [], [
    { code: "PBS_SIMULATED_LOGIN_TTL_SECONDS", codeValue: "300" },
  ]);

  await assert.rejects(
    () => createSimulatedCrewPortalSession(db as never, {
      crewCode: "B79185",
      adminUserCode: "admin",
      adminUserName: "Admin User",
      ipAddress: "127.0.0.1",
    }),
    (error) => (
      error instanceof SimulatedCrewPortalError
      && error.statusCode === 500
      && error.message === "Simulated crew portal URL is not configured."
    ),
  );
});

test("simulated crew portal admin config returns editable defaults when portal URL is missing", async () => {
  const { loadSimulatedCrewPortalAdminConfig } = await import("./simulated-crew-portal-config.js");
  const db = createConfigDb([
    { code: "PBS_SIMULATED_LOGIN_TTL_SECONDS", codeValue: null },
  ]);

  const config = await loadSimulatedCrewPortalAdminConfig(db as never);

  assert.deepEqual(config, {
    portalPublicUrl: "",
    loginTtlSeconds: 300,
  });
});

test("simulated crew portal admin config rejects invalid save values", async () => {
  const { saveSimulatedCrewPortalAdminConfig } = await import("./simulated-crew-portal-config.js");
  const { SimulatedCrewPortalError } = await import("./simulated-crew-portal-error.js");
  const db = createConfigDb();

  await assert.rejects(
    () => saveSimulatedCrewPortalAdminConfig(db as never, {
      portalPublicUrl: "ftp://crew-f8-usva-sit.roiscloud.com/pbs",
      loginTtlSeconds: 300,
      updatedBy: "admin",
    }),
    (error) => (
      error instanceof SimulatedCrewPortalError
      && error.statusCode === 400
      && error.message === "Portal URL must be a valid http or https URL."
    ),
  );

  await assert.rejects(
    () => saveSimulatedCrewPortalAdminConfig(db as never, {
      portalPublicUrl: "https://crew-f8-usva-sit.roiscloud.com/pbs",
      loginTtlSeconds: 3601,
      updatedBy: "admin",
    }),
    (error) => (
      error instanceof SimulatedCrewPortalError
      && error.statusCode === 400
      && error.message === "Token TTL Seconds must be an integer from 1 to 3600."
    ),
  );
});

test("simulated crew portal admin config updates existing dictionary rows", async () => {
  const { saveSimulatedCrewPortalAdminConfig } = await import("./simulated-crew-portal-config.js");
  const db = createConfigDb(undefined, [true, true]);

  const config = await saveSimulatedCrewPortalAdminConfig(db as never, {
    portalPublicUrl: "https://crew-f8-usva-sit.roiscloud.com/pbs/",
    loginTtlSeconds: 600,
    updatedBy: "admin-user-code-that-is-longer-than-thirty-characters",
  });

  assert.deepEqual(config, {
    portalPublicUrl: "https://crew-f8-usva-sit.roiscloud.com/pbs",
    loginTtlSeconds: 600,
  });
  assert.equal(db.inserts.length, 0);
  assert.equal(db.updates.length, 2);
  assert.equal(db.updates[0].codeValue, "https://crew-f8-usva-sit.roiscloud.com/pbs");
  assert.equal(db.updates[0].updatedBy, "admin-user-code-that-is-longer");
  assert.equal(db.updates[1].codeValue, "600");
});

test("simulated crew portal admin config creates missing dictionary rows", async () => {
  const { saveSimulatedCrewPortalAdminConfig } = await import("./simulated-crew-portal-config.js");
  const db = createConfigDb(undefined, [false, false]);

  await saveSimulatedCrewPortalAdminConfig(db as never, {
    portalPublicUrl: "http://localhost:3030/pbs",
    loginTtlSeconds: 120,
    updatedBy: "admin",
  });

  assert.equal(db.inserts.length, 2);
  assert.equal(db.inserts[0].parentCode, "SYS_PARAM");
  assert.equal(db.inserts[0].code, "PBS_PORTAL_PUBLIC_URL");
  assert.equal(db.inserts[0].codeValue, "http://localhost:3030/pbs");
  assert.equal(db.inserts[1].code, "PBS_SIMULATED_LOGIN_TTL_SECONDS");
  assert.equal(db.inserts[1].codeValue, "120");
});

test("simulated crew portal service lists audit logs for the popup", async () => {
  const { listSimulatedCrewPortalLogs } = await import("./simulated-crew-portal-service.js");
  const operatedAt = new Date("2026-08-17T10:00:00.000Z");
  const db = createDb(null, [{
    id: 12,
    crewId: "B79185",
    newValue: JSON.stringify({
      adminUser: "Admin User",
      adminUserCode: "admin",
      crewCode: "B79185",
      crewName: "Mary Nasso",
      result: "SUCCESS",
    }),
    operatedAt,
  }]);

  const logs = await listSimulatedCrewPortalLogs(db as never, 50);

  assert.deepEqual(logs, [{
    id: "12",
    adminUser: "Admin User",
    adminUserCode: "admin",
    crewCode: "B79185",
    crewName: "Mary Nasso",
    result: "SUCCESS",
    loginTime: operatedAt.toISOString(),
  }]);
});
