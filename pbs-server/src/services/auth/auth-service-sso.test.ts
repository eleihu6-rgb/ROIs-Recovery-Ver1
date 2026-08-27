import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";

process.env.DATABASE_URL ||= "postgresql://user:password@localhost:5432/rois?options=-c%20search_path%3Df8_pbs";
process.env.PBS_SCHEMA ||= "f8_pbs";
process.env.JWT_SECRET ||= "test-secret";
process.env.JWT_EXPIRES_IN ||= "24h";
process.env.CORS_ORIGIN ||= "http://localhost:3030";

const user = {
  id: 1,
  userCode: "0227",
  userName: "Taylor Brown",
  crewId: "0227",
  email: "taylor.brown@flyflair.com",
  passwordHash: "x",
  status: 0,
  passwordAccess: "N",
  portalAccess: "1",
  effDt: new Date(0),
  expDt: null,
  tokenVersion: 0,
  isAdmin: 0,
  failedLoginCount: 0,
  lastLoginAt: null,
  lastLoginIp: null,
  lockedUntil: null,
  updatedAt: new Date(),
};

/** 从 drizzle Sql 对象 queryChunks 里提取插值的裸字符串（lower(email)=lower($1) 的 $1） */
const extractQueryValue = (cond: unknown): string | undefined => {
  const chunks = (cond as { queryChunks?: unknown[] }).queryChunks ?? [];
  for (const chunk of chunks) {
    if (typeof chunk === "string") return chunk;
  }
  return undefined;
};

/** db mock 模拟 `lower(email) = lower($value)` / `user_code = $value` 查询语义 */
const createDb = () => {
  let selects = 0;
  const select = () => ({
    from: () => ({
      where: (cond: unknown) => ({
        limit: async () => {
          selects += 1;
          const v = extractQueryValue(cond);
          if (v === undefined) return [];
          if (user.email.toLowerCase() === v.toLowerCase()) return [user];
          if (user.userCode === v) return [user];
          return [];
        },
      }),
    }),
  });
  const update = () => ({ set: () => ({ where: async () => undefined }) });
  return {
    select,
    update,
    get selects() {
      return selects;
    },
  };
};

test("loginViaSso: email 匹配（大小写不敏感）→ 签发 authMode=sso 的 JWT", async () => {
  const db = createDb();
  const { createPbsAuthService } = await import("./auth-service.js");
  const svc = createPbsAuthService({ db: db as never });
  const res = await svc.loginViaSso!(
    { email: "TAYLOR.BROWN@FLYFLAIR.COM" },
    { ipAddress: null, userAgent: null },
  );
  assert.equal(res.authMode, "sso");
  const decoded = jwt.verify(res.token, "test-secret") as { authMode: string; userCode: string };
  assert.equal(decoded.authMode, "sso");
  assert.equal(decoded.userCode, "0227");
  assert.ok(db.selects >= 1, "应发生至少一次查询");
});

test("loginViaSso: email 未命中 → 按 userCode 兜底", async () => {
  const db = createDb();
  const { createPbsAuthService } = await import("./auth-service.js");
  const svc = createPbsAuthService({ db: db as never });
  const res = await svc.loginViaSso!(
    { email: "x@x.com", userCode: "0227" },
    { ipAddress: null, userAgent: null },
  );
  assert.equal(res.user.employeeNo, "0227");
  assert.equal(db.selects, 2, "email 查询一次 + userCode 兜底一次");
});

test("loginViaSso: 未匹配 → 401", async () => {
  const db = createDb();
  const { createPbsAuthService } = await import("./auth-service.js");
  const svc = createPbsAuthService({ db: db as never });
  await assert.rejects(
    svc.loginViaSso!({ email: "nobody@flyflair.com" }, { ipAddress: null, userAgent: null }),
    (err: { statusCode?: number }) => err.statusCode === 401,
  );
});

test("loginViaSso: 门槛不含 passwordAccess（passwordAccess=N 仍可登录）", async () => {
  const db = createDb();
  const { createPbsAuthService } = await import("./auth-service.js");
  const svc = createPbsAuthService({ db: db as never });
  const res = await svc.loginViaSso!(
    { email: "taylor.brown@flyflair.com" },
    { ipAddress: null, userAgent: null },
  );
  assert.equal(res.authMode, "sso");
});
