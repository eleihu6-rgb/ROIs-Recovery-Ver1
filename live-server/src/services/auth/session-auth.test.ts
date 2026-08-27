import { describe, it, expect, vi } from "vitest";

// session-auth 顶层引用 env.LIVE_SCHEMA；mock 掉 config 避免真实 env 校验
vi.mock("../../config/index.js", () => ({ env: { LIVE_SCHEMA: "f8" } }));

import { buildAuthPayload, hasSsoPortalAccess } from "./session-auth.js";

describe("buildAuthPayload authMode", () => {
  const user = {
    userCode: "Ryan",
    userName: "Ryan",
    schema: "f8",
    isAdmin: 0,
    tokenVersion: 0,
    effDt: new Date(0),
    expDt: null,
    status: 0,
    passwordAccess: "N",
    portalAccess: "Y",
  } as never;

  it("默认 authMode=password（兼容存量调用）", () => {
    const p = buildAuthPayload(user);
    expect(p.authMode).toBe("password");
  });

  it("可指定 authMode=sso", () => {
    const p = buildAuthPayload(user, 1, "sso");
    expect(p.authMode).toBe("sso");
  });
});

describe("hasSsoPortalAccess", () => {
  const base = {
    status: 0,
    passwordAccess: "N",
    portalAccess: "Y",
    effDt: new Date(Date.now() - 1000),
    expDt: null,
  };

  it("不要求 passwordAccess", () => {
    expect(hasSsoPortalAccess(base as never, new Date())).toBe(true);
  });

  it("portalAccess 关闭则拒绝", () => {
    expect(hasSsoPortalAccess({ ...base, portalAccess: "N" } as never, new Date())).toBe(false);
  });

  it("生效期外拒绝", () => {
    expect(hasSsoPortalAccess({ ...base, effDt: new Date(Date.now() + 10000) } as never, new Date())).toBe(false);
  });
});
