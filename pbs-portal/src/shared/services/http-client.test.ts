import { env, resolveSsoLoginUrl } from "@/shared/config/env";
import { authService } from "@/shared/services/auth-service";
import { writeAuthToken } from "@/shared/services/auth-token-storage";
import { createHttpClient, resolveApiBaseUrl } from "@/shared/services/http-client";

describe("http-client", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("uses /api as the default base URL", () => {
    expect(resolveApiBaseUrl()).toBe("/api");
  });

  it("resolves the SSO login fallback against the configured API base URL", () => {
    expect(resolveSsoLoginUrl(undefined, "https://api.example.com")).toBe(
      "https://api.example.com/auth/sso/login",
    );
    expect(resolveSsoLoginUrl(undefined, "https://api.example.com/base/")).toBe(
      "https://api.example.com/base/auth/sso/login",
    );
    expect(resolveSsoLoginUrl(undefined, "/api")).toBe("/api/auth/sso/login");
  });

  it("returns the resolved env SSO login URL from authService", () => {
    expect(authService.getSsoLoginUrl()).toBe(env.ssoLoginUrl);
  });

  it("creates an axios instance with credentials enabled", () => {
    const client = createHttpClient("https://api.example.com");

    expect(client.defaults.baseURL).toBe("https://api.example.com");
    expect(client.defaults.withCredentials).toBe(true);
    expect(client.defaults.timeout).toBe(10_000);
    expect(client.defaults.headers.common["Content-Type"]).toBeUndefined();
    expect(client.defaults.headers.post["Content-Type"]).toBeUndefined();
  });

  it("injects the bearer token when one is present", async () => {
    writeAuthToken("jwt-token");
    const client = createHttpClient("https://api.example.com");
    const requestInterceptorManager = client.interceptors.request as typeof client.interceptors.request & {
      handlers?: Array<{
        fulfilled?: (config: { headers?: unknown }) => Promise<{ headers?: unknown }> | { headers?: unknown };
      }>;
    };

    const interceptor = requestInterceptorManager.handlers?.[0]?.fulfilled;
    const config = await interceptor?.({
      headers: {},
    });

    expect((config?.headers as { Authorization?: string } | undefined)?.Authorization).toBe("Bearer jwt-token");
  });
});
