import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

process.env.DATABASE_URL ||= "postgresql://user:password@localhost:5432/rois?options=-c%20search_path%3Df8_pbs";
process.env.PBS_SCHEMA ||= "f8_pbs";
process.env.JWT_SECRET ||= "test-secret";
process.env.CORS_ORIGIN ||= "http://localhost:3030";
process.env.PBS_INTERNAL_API_SECRET ||= "test-internal-secret";

const createDb = (user: Record<string, unknown> | null) => {
  let failedLoginUpdates = 0;
  let successfulLoginUpdates = 0;
  let logoutUpdates = 0;
  let selectCalls = 0;

  return {
    get selectCalls() {
      return selectCalls;
    },
    get failedLoginUpdates() {
      return failedLoginUpdates;
    },
    get successfulLoginUpdates() {
      return successfulLoginUpdates;
    },
    get logoutUpdates() {
      return logoutUpdates;
    },
    select() {
      selectCalls += 1;
      return {
        from() {
          return {
            where() {
              return {
                async limit() {
                  return user ? [user] : [];
                },
              };
            },
          };
        },
      };
    },
    update() {
      return {
        set(values: Record<string, unknown>) {
          return {
            async where() {
              if (values.tokenVersion !== undefined) {
                logoutUpdates += 1;
              } else if (values.lastLoginAt !== undefined || values.lockedUntil === null) {
                successfulLoginUpdates += 1;
              } else if (values.failedLoginCount !== undefined) {
                failedLoginUpdates += 1;
              }
            },
          };
        },
      };
    },
  };
};

const createUser = async (overrides: Record<string, unknown> = {}) => ({
  id: 4010,
  userCode: "4010",
  userName: "Test Crew",
  crewId: "4010",
  status: 0,
  passwordAccess: "1",
  portalAccess: "1",
  effDt: new Date(Date.now() - 60_000),
  expDt: null,
  isAdmin: 0,
  lockedUntil: null,
  passwordHash: await bcrypt.hash("rois", 4),
  tokenVersion: 7,
  ...overrides,
});

test("auth service accepts database access flag 1 for password portal login", async () => {
  const { createPbsAuthService } = await import("./auth-service.js");
  const db = createDb(await createUser());
  const authService = createPbsAuthService({ db: db as never });

  const response = await authService.login("4010", "rois", {
    ipAddress: "127.0.0.1",
    userAgent: "node-test",
  });

  assert.equal(response.user.employeeNo, "4010");
  assert.equal(response.authMode, "password");
  assert.equal(typeof response.token, "string");
  assert.equal(db.successfulLoginUpdates, 1);
  assert.equal(db.failedLoginUpdates, 0);
});

test("auth service signs admin flag into the JWT payload", async () => {
  const { createPbsAuthService } = await import("./auth-service.js");
  const db = createDb(await createUser({ isAdmin: 1 }));
  const authService = createPbsAuthService({ db: db as never });

  const response = await authService.login("4010", "rois", {
    ipAddress: "127.0.0.1",
    userAgent: "node-test",
  });
  const payload = jwt.verify(response.token, process.env.JWT_SECRET ?? "test-secret") as { isAdmin?: boolean };

  assert.equal(payload.isAdmin, true);
});

test("auth service signs token version into the JWT payload", async () => {
  const { createPbsAuthService } = await import("./auth-service.js");
  const db = createDb(await createUser({ tokenVersion: 11 }));
  const authService = createPbsAuthService({ db: db as never });

  const response = await authService.login("4010", "rois", {
    ipAddress: "127.0.0.1",
    userAgent: "node-test",
  });
  const payload = jwt.verify(response.token, process.env.JWT_SECRET ?? "test-secret") as { tokenVersion?: number };

  assert.equal(payload.tokenVersion, 11);
});

test("auth service signs the dedicated hidden admin account as admin", async () => {
  const { createPbsAuthService } = await import("./auth-service.js");
  const db = createDb(await createUser({
    userCode: "admin",
    userName: "System Administrator",
    crewId: "__admin__",
    isAdmin: 1,
    passwordHash: await bcrypt.hash("123456", 4),
  }));
  const authService = createPbsAuthService({ db: db as never });

  const response = await authService.login("admin", "123456", {
    ipAddress: "127.0.0.1",
    userAgent: "node-test",
  });
  const payload = jwt.verify(response.token, process.env.JWT_SECRET ?? "test-secret") as {
    employeeNo?: string;
    isAdmin?: boolean;
    userCode?: string;
  };

  assert.equal(response.user.employeeNo, "__admin__");
  assert.equal(payload.userCode, "admin");
  assert.equal(payload.employeeNo, "__admin__");
  assert.equal(payload.isAdmin, true);
});

test("auth service rejects legacy Y access flags when database uses 1 and 0 semantics", async () => {
  const { createPbsAuthService, AuthServiceError } = await import("./auth-service.js");
  const db = createDb(await createUser({
    passwordAccess: "Y",
    portalAccess: "Y",
  }));
  const authService = createPbsAuthService({ db: db as never });

  await assert.rejects(
    () => authService.login("4010", "rois", {
      ipAddress: "127.0.0.1",
      userAgent: "node-test",
    }),
    (error) => error instanceof AuthServiceError && error.statusCode === 403,
  );
});

test("auth service rejects disabled database access flag 0", async () => {
  const { createPbsAuthService, AuthServiceError } = await import("./auth-service.js");
  const db = createDb(await createUser({
    portalAccess: "0",
  }));
  const authService = createPbsAuthService({ db: db as never });

  await assert.rejects(
    () => authService.login("4010", "rois", {
      ipAddress: "127.0.0.1",
      userAgent: "node-test",
    }),
    (error) => error instanceof AuthServiceError && error.statusCode === 403,
  );
});

test("auth service rejects accounts outside the effective window", async () => {
  const { createPbsAuthService, AuthServiceError } = await import("./auth-service.js");
  const db = createDb(await createUser({
    expDt: new Date(Date.now() - 60_000),
  }));
  const authService = createPbsAuthService({ db: db as never });

  await assert.rejects(
    () => authService.login("4010", "rois", {
      ipAddress: "127.0.0.1",
      userAgent: "node-test",
    }),
    (error) => error instanceof AuthServiceError && error.statusCode === 403,
  );
});

test("auth service validates current token version before accepting a session payload", async () => {
  const { createPbsAuthService } = await import("./auth-service.js");
  const db = createDb(await createUser({
    tokenVersion: 3,
    userName: "Current Crew Name",
  }));
  const authService = createPbsAuthService({ db: db as never });

  const payload = await authService.validatePayload!({
    id: "4010",
    name: "Stale Crew Name",
    employeeNo: "4010",
    userCode: "4010",
    userName: "Stale Crew Name",
    authMode: "password",
    isAdmin: false,
    tokenVersion: 3,
  });

  assert.equal(payload?.name, "Current Crew Name");
  assert.equal(payload?.tokenVersion, 3);
});

test("auth service validates simulated sessions without requiring password access", async () => {
  const { createPbsAuthService } = await import("./auth-service.js");
  const db = createDb(await createUser({
    tokenVersion: 3,
    passwordAccess: "0",
    portalAccess: "1",
  }));
  const authService = createPbsAuthService({ db: db as never });

  const payload = await authService.validatePayload!({
    id: "4010",
    name: "Test Crew",
    employeeNo: "4010",
    userCode: "4010",
    userName: "Test Crew",
    authMode: "simulated",
    isAdmin: false,
    tokenVersion: 3,
  });

  assert.equal(payload.authMode, "simulated");
  assert.equal(payload.tokenVersion, 3);
});

test("auth service exchanges simulated login token for a portal session", async () => {
  const { createPbsAuthService } = await import("./auth-service.js");
  const { createSimulatedCrewPortalToken } = await import("../simulated-crew-portal/simulated-crew-portal-token.js");
  const db = createDb(await createUser({
    passwordAccess: "0",
    portalAccess: "1",
  }));
  const authService = createPbsAuthService({ db: db as never });
  const simulated = createSimulatedCrewPortalToken({
    userCode: "4010",
    adminUserCode: "admin",
    adminUserName: "Admin User",
  });

  const response = await authService.loginViaSimulation!(simulated.token, {
    ipAddress: "127.0.0.1",
    userAgent: "node-test",
  });
  const payload = jwt.verify(response.token, process.env.JWT_SECRET ?? "test-secret") as {
    authMode?: string;
    userCode?: string;
  };

  assert.equal(response.authMode, "simulated");
  assert.equal(payload.authMode, "simulated");
  assert.equal(payload.userCode, "4010");
  assert.equal(db.successfulLoginUpdates, 1);
});

test("auth service rejects invalid simulated login token", async () => {
  const { createPbsAuthService, AuthServiceError } = await import("./auth-service.js");
  const db = createDb(await createUser());
  const authService = createPbsAuthService({ db: db as never });

  await assert.rejects(
    () => authService.loginViaSimulation!("not-a-token", {
      ipAddress: "127.0.0.1",
      userAgent: "node-test",
    }),
    (error) => error instanceof AuthServiceError && error.statusCode === 401,
  );
});

test("auth service consumes simulated login tokens through the replay guard", async () => {
  const { createPbsAuthService } = await import("./auth-service.js");
  const { createSimulatedCrewPortalToken } = await import("../simulated-crew-portal/simulated-crew-portal-token.js");
  const consumedTokens: Array<{ jti: string; ttlSeconds: number }> = [];
  const db = createDb(await createUser({
    passwordAccess: "0",
    portalAccess: "1",
  }));
  const authService = createPbsAuthService({
    db: db as never,
    simulatedLoginReplayGuard: {
      async consume(jti, ttlSeconds) {
        consumedTokens.push({ jti, ttlSeconds });
        return true;
      },
    },
  });
  const simulated = createSimulatedCrewPortalToken({
    userCode: "4010",
    adminUserCode: "admin",
    adminUserName: "Admin User",
  }, 60);

  await authService.loginViaSimulation!(simulated.token, {
    ipAddress: "127.0.0.1",
    userAgent: "node-test",
  });

  assert.equal(consumedTokens.length, 1);
  assert.ok(consumedTokens[0].jti);
  assert.ok(consumedTokens[0].ttlSeconds > 0);
});

test("auth service fails closed when simulated token replay guard rejects", async () => {
  const { createPbsAuthService, AuthServiceError } = await import("./auth-service.js");
  const { createSimulatedCrewPortalToken } = await import("../simulated-crew-portal/simulated-crew-portal-token.js");
  const db = createDb(await createUser());
  const authService = createPbsAuthService({
    db: db as never,
    simulatedLoginReplayGuard: {
      async consume() {
        return false;
      },
    },
  });
  const simulated = createSimulatedCrewPortalToken({
    userCode: "4010",
    adminUserCode: "admin",
    adminUserName: "Admin User",
  });

  await assert.rejects(
    () => authService.loginViaSimulation!(simulated.token, {
      ipAddress: "127.0.0.1",
      userAgent: "node-test",
    }),
    (error) => error instanceof AuthServiceError && error.statusCode === 401,
  );
  assert.equal(db.successfulLoginUpdates, 0);
});

test("auth service fails closed when simulated token replay guard is unavailable", async () => {
  const { createPbsAuthService, AuthServiceError } = await import("./auth-service.js");
  const { createSimulatedCrewPortalToken } = await import("../simulated-crew-portal/simulated-crew-portal-token.js");
  const db = createDb(await createUser());
  const authService = createPbsAuthService({
    db: db as never,
    simulatedLoginReplayGuard: {
      async consume() {
        throw new Error("redis unavailable");
      },
    },
  });
  const simulated = createSimulatedCrewPortalToken({
    userCode: "4010",
    adminUserCode: "admin",
    adminUserName: "Admin User",
  });

  await assert.rejects(
    () => authService.loginViaSimulation!(simulated.token, {
      ipAddress: "127.0.0.1",
      userAgent: "node-test",
    }),
    (error) => error instanceof AuthServiceError && error.statusCode === 500,
  );
  assert.equal(db.successfulLoginUpdates, 0);
});

test("auth service reuses a short-lived validated token payload cache", async () => {
  const { createPbsAuthService } = await import("./auth-service.js");
  const db = createDb(await createUser({
    tokenVersion: 3,
    userName: "Current Crew Name",
  }));
  const authService = createPbsAuthService({ db: db as never });
  const payload = {
    id: "4010",
    name: "Stale Crew Name",
    employeeNo: "4010",
    userCode: "4010",
    userName: "Stale Crew Name",
    authMode: "password" as const,
    isAdmin: false,
    tokenVersion: 3,
  };

  const first = await authService.validatePayload!(payload);
  const second = await authService.validatePayload!(payload);

  assert.equal(first.name, "Current Crew Name");
  assert.equal(second.name, "Current Crew Name");
  assert.equal(db.selectCalls, 1);
});

test("auth service rejects a stale token version", async () => {
  const { createPbsAuthService, AuthServiceError } = await import("./auth-service.js");
  const db = createDb(await createUser({ tokenVersion: 9 }));
  const authService = createPbsAuthService({ db: db as never });

  await assert.rejects(
    () => authService.validatePayload!({
      id: "4010",
      name: "Test Crew",
      employeeNo: "4010",
      userCode: "4010",
      userName: "Test Crew",
      authMode: "password",
      isAdmin: false,
      tokenVersion: 8,
    }),
    (error: unknown) => error instanceof AuthServiceError && error.statusCode === 401,
  );
});

test("auth service logout increments token version for user-level revocation", async () => {
  const { createPbsAuthService } = await import("./auth-service.js");
  const db = createDb(await createUser());
  const authService = createPbsAuthService({ db: db as never });

  await authService.logout({
    id: "4010",
    name: "Test Crew",
    employeeNo: "4010",
    userCode: "4010",
    userName: "Test Crew",
    authMode: "password",
    isAdmin: false,
    tokenVersion: 7,
  });

  assert.equal(db.logoutUpdates, 1);
});
