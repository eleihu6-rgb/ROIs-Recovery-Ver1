import { describe, it, expect } from "vitest";
import { extractIdentity, createSamlSp } from "./index.js";

describe("extractIdentity", () => {
  const profile = {
    nameID: "ryan@flyflair.com",
    email: "Ryan@FlyFlair.com",
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress": "ryan@flyflair.com",
    employeeId: "1001",
  };

  it("优先取第一个命中的 email 属性（含内置 email/mail 兜底）", () => {
    const id = extractIdentity(profile as never, {
      emailAttrs: ["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"],
      userCodeAttrs: [],
    });
    expect(id.email).toBe("ryan@flyflair.com");
    expect(id.userCode).toBeUndefined();
  });

  it("email 属性缺失时兜底取内置 email/mail，并 trim", () => {
    const id = extractIdentity({ ...profile, email: "  a@b.com  " } as never, {
      emailAttrs: ["urn:missing"],
      userCodeAttrs: [],
    });
    expect(id.email).toBe("a@b.com");
  });

  it("提取工号属性（自定义 URI）", () => {
    const id = extractIdentity(profile as never, {
      emailAttrs: [],
      userCodeAttrs: ["employeeId"],
    });
    expect(id.userCode).toBe("1001");
  });

  it("非字符串属性值被忽略", () => {
    const id = extractIdentity({ email: 123 } as never, { emailAttrs: [], userCodeAttrs: [] });
    expect(id.email).toBeUndefined();
  });
});

describe("createSamlSp", () => {
  it("构造 SAML 实例不抛错", () => {
    const saml = createSamlSp({
      callbackUrl: "https://example.com/api/auth/sso/acs",
      entryPoint: "https://login.microsoftonline.com/t/saml2",
      issuer: "urn:rois:test",
      idpCert: "MII...",
      wantAssertionsSigned: true,
      acceptedClockSkewMs: 30000,
      validateInResponseTo: "ifPresent",
    });
    expect(saml).toBeDefined();
  });

  it("Azure 只签 Assertion → wantAuthnResponseSigned 必须为 false（否则 Response 级签名校验会抛 Invalid document signature）", () => {
    const saml = createSamlSp({
      callbackUrl: "https://example.com/api/auth/sso/acs",
      entryPoint: "https://login.microsoftonline.com/t/saml2",
      issuer: "urn:rois:test",
      idpCert: "MII...",
      wantAssertionsSigned: true,
      acceptedClockSkewMs: 30000,
      validateInResponseTo: "ifPresent",
    });
    expect((saml as unknown as { options: { wantAuthnResponseSigned: boolean } }).options.wantAuthnResponseSigned).toBe(false)
    // Assertion 签名仍必须强制校验，安全性不降级
    expect((saml as unknown as { options: { wantAssertionsSigned: boolean } }).options.wantAssertionsSigned).toBe(true)
  });
});
