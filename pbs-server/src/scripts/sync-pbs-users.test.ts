import test from "node:test";
import assert from "node:assert/strict";
import { getTableColumns } from "drizzle-orm";
import { parseSyncEnv } from "../config/sync-env.js";
import {
  PBS_USER_ALIGNED_FIELDS,
  PBS_USER_SECURITY_FIELDS,
  buildSelectedColumns,
  isDedicatedPbsAdminUserCode,
  mapSourceUserToPbsUser,
  type SourceUserRow,
} from "./sync-pbs-users-core.js";
import {
  PBS_USER_NORMALIZED_EFFECTIVE_DATE_ISO,
  acquirePbsUserEffectiveDateTransactionLock,
  buildPbsUserEffectiveDateLockName,
  buildPbsUserSourceSelectExpression,
  quotePbsUserSqlIdentifier,
} from "./pbs-user-effective-date-normalization.js";

const createSourceRow = (): SourceUserRow => ({
  user_code: "admin",
  user_name: "System Administrator",
  password_hash: "hashed",
  branch_code: "HQ",
  py_abbr: "ADMIN",
  gender: "M",
  tel: "18800000000",
  eff_dt: "2026-01-01T00:00:00Z",
  exp_dt: null,
  ad_active: 0,
  email: "admin@example.com",
  status: 0,
  is_admin: 1,
  password_access: "Y",
  portal_access: "Y",
  app_access: "Y",
  is_first_login: "Y",
  interface_user_id: "ext-admin",
});

test("parseSyncEnv uses DATABASE_URL and PBS_SCHEMA as target fallbacks", () => {
  const result = parseSyncEnv({
    SOURCE_DATABASE_URL: "postgresql://source",
    DATABASE_URL: "postgresql://target",
    PBS_SCHEMA: "f8_pbs",
  });

  assert.deepEqual(result, {
    sourceDatabaseUrl: "postgresql://source",
    targetDatabaseUrl: "postgresql://target",
    sourceSchema: "f8",
    targetSchema: "f8_pbs",
    crewIdField: "user_code",
    updatedBy: "pbs-user-sync",
    effectiveDateLockTimeoutMs: 5000,
  });
});

test("parseSyncEnv accepts a configured PBS effective-date lock timeout", () => {
  const result = parseSyncEnv({
    SOURCE_DATABASE_URL: "postgresql://source",
    DATABASE_URL: "postgresql://target",
    PBS_SCHEMA: "f8_pbs",
    PBS_USER_EFFECTIVE_DATE_LOCK_TIMEOUT_MS: "7500",
  });

  assert.equal(result.effectiveDateLockTimeoutMs, 7500);
});

test("parseSyncEnv rejects invalid SQL identifiers", () => {
  assert.throws(
    () => parseSyncEnv({
      SOURCE_DATABASE_URL: "postgresql://source",
      PBS_SYNC_CREW_ID_FIELD: "user-code",
    }),
    /valid SQL identifier/,
  );
});

test("buildSelectedColumns de-duplicates the crew id field when it matches user_code", () => {
  const selectedColumns = buildSelectedColumns("user_code");

  assert.equal(selectedColumns.filter((column) => column === "user_code").length, 1);
  assert.ok(selectedColumns.includes("user_name"));
});

test("PBS user source projection normalizes BC effective dates in PostgreSQL", () => {
  const expression = buildPbsUserSourceSelectExpression(
    "eff_dt",
    "timestamp with time zone",
  );

  assert.match(expression, /case/i);
  assert.match(expression, /"eff_dt" < timestamptz '0001-01-01 00:00:00\+00 AD'/i);
  assert.match(expression, /then timestamptz '1900-01-01 00:00:00\+00'/i);
  assert.match(expression, /::text as "eff_dt"/i);
  assert.equal(PBS_USER_NORMALIZED_EFFECTIVE_DATE_ISO, "1900-01-01T00:00:00.000Z");
});

test("PBS user source projection uses same-type literals for timestamp without time zone", () => {
  const expression = buildPbsUserSourceSelectExpression(
    "eff_dt",
    "timestamp without time zone",
  );

  assert.match(expression, /"eff_dt" < timestamp '0001-01-01 00:00:00 AD'/i);
  assert.match(expression, /then timestamp '1900-01-01 00:00:00'/i);
  assert.doesNotMatch(expression, /timestamptz/i);
});

test("PBS user source projection preserves non-effective-date columns", () => {
  assert.equal(
    buildPbsUserSourceSelectExpression("user_code", "timestamp without time zone"),
    '"user_code"',
  );
});

test("PBS user effective-date SQL helpers reject unsafe identifiers", () => {
  assert.throws(() => quotePbsUserSqlIdentifier("f8_pbs; drop schema f8"), /Invalid SQL identifier/);
  assert.throws(() => buildPbsUserEffectiveDateLockName("f8-pbs"), /Invalid SQL identifier/);
  assert.equal(
    buildPbsUserEffectiveDateLockName("f8_pbs"),
    "rois:pbs-user-effective-date:f8_pbs",
  );
});

test("PBS user effective-date lock uses a finite local timeout before the transaction lock", async () => {
  const calls: Array<{ text: string; values: unknown[] }> = [];

  await acquirePbsUserEffectiveDateTransactionLock(
    async (text, values) => {
      calls.push({ text, values });
    },
    "f8_pbs",
    5000,
  );

  assert.deepEqual(calls, [
    {
      text: "select set_config('TimeZone', 'UTC', true)",
      values: [],
    },
    {
      text: "select set_config('lock_timeout', $1, true)",
      values: ["5000ms"],
    },
    {
      text: "select pg_advisory_xact_lock(hashtextextended($1, 0))",
      values: ["rois:pbs-user-effective-date:f8_pbs"],
    },
  ]);
});

test("PBS user effective-date lock rejects invalid timeout values", async () => {
  await assert.rejects(
    acquirePbsUserEffectiveDateTransactionLock(async () => undefined, "f8_pbs", 0),
    /positive integer/,
  );
});

test("mapSourceUserToPbsUser keeps aligned user fields and PBS crew id", () => {
  const mappedUser = mapSourceUserToPbsUser(createSourceRow(), "user_code");

  assert.deepEqual(mappedUser, {
    crewId: "admin",
    userCode: "admin",
    userName: "System Administrator",
    passwordHash: "hashed",
    branchCode: "HQ",
    pyAbbr: "ADMIN",
    gender: "M",
    tel: "18800000000",
    effDt: "2026-01-01T00:00:00Z",
    expDt: null,
    adActive: 0,
    email: "admin@example.com",
    status: 0,
    isAdmin: 1,
    passwordAccess: "Y",
    portalAccess: "Y",
    appAccess: "Y",
    isFirstLogin: "Y",
    interfaceUserId: "ext-admin",
  });
});

test("mapSourceUserToPbsUser returns null when the configured crew id field is missing", () => {
  const mappedUser = mapSourceUserToPbsUser(
    { ...createSourceRow(), interface_user_id: null },
    "interface_user_id",
  );

  assert.equal(mappedUser, null);
});

test("isDedicatedPbsAdminUserCode detects the hidden PBS admin account", () => {
  assert.equal(isDedicatedPbsAdminUserCode("admin"), true);
  assert.equal(isDedicatedPbsAdminUserCode(" ADMIN "), true);
  assert.equal(isDedicatedPbsAdminUserCode("900"), false);
  assert.equal(isDedicatedPbsAdminUserCode(null), false);
});

test("pbsUser keeps the aligned user fields and PBS-only security fields without legacy aliases", async () => {
  process.env.DATABASE_URL ||= "postgresql://user:password@localhost:5432/rois?options=-c%20search_path%3Df8_pbs";
  process.env.PBS_SCHEMA ||= "f8_pbs";
  process.env.JWT_SECRET ||= "test-secret";
  process.env.CORS_ORIGIN ||= "http://localhost:3030";

  const { pbsUser } = await import("../models/pbs/pbs-user.js");
  const modelColumns = getTableColumns(pbsUser);
  const columnNames = Object.values(modelColumns).map((column) => column.name);

  for (const field of PBS_USER_ALIGNED_FIELDS) {
    assert.ok(columnNames.includes(field), `Expected aligned PBS field ${field}`);
  }

  for (const field of PBS_USER_SECURITY_FIELDS) {
    assert.ok(columnNames.includes(field), `Expected PBS-only field ${field}`);
  }

  for (const legacyField of ["username", "phone", "is_active"]) {
    assert.ok(!columnNames.includes(legacyField), `Unexpected legacy field ${legacyField}`);
  }
});
