import { resolvePortalApiBaseUrl } from "@/shared/config/env";

describe("resolvePortalApiBaseUrl", () => {
  it("uses the PBS-only API prefix on the shared cr.rois.one host", () => {
    expect(resolvePortalApiBaseUrl("/api", {
      hostname: "cr.rois.one",
      pathname: "/pbs/dashboard",
    })).toBe("/pbs/api");
  });

  it("keeps the standard API prefix on the dedicated PBS host", () => {
    expect(resolvePortalApiBaseUrl("/api", {
      hostname: "pbs.rois.one",
      pathname: "/pbs/dashboard",
    })).toBe("/api");
  });

  it("does not override an explicitly configured API base", () => {
    expect(resolvePortalApiBaseUrl("https://api.example.test", {
      hostname: "cr.rois.one",
      pathname: "/pbs/dashboard",
    })).toBe("https://api.example.test");
  });
});
