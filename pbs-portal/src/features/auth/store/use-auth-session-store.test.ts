import { act } from "@testing-library/react";
import { authService } from "@/shared/services/auth-service";
import { clearAuthToken, readAuthToken, writeAuthToken } from "@/shared/services/auth-token-storage";
import { queryClient } from "@/shared/query/query-client";
import { useBiddingCalendarStore } from "@/shared/store/use-bidding-calendar-store";
import { useAuthSessionStore } from "@/features/auth/store/use-auth-session-store";

vi.mock("@/shared/services/auth-service", () => ({
  authService: {
    getSession: vi.fn(),
    login: vi.fn(),
    handleSsoCallback: vi.fn(),
    handleSimulatedLogin: vi.fn(),
    getSsoLoginUrl: vi.fn(),
    logout: vi.fn(),
  },
}));

const mockedAuthService = vi.mocked(authService);
const staleAccountQueryKey = ["pairing", "page-data"] as const;

const resetAuthSessionStore = () => {
  useAuthSessionStore.setState({
    status: "idle",
    user: null,
    authMode: null,
  });
};

describe("useAuthSessionStore", () => {
  beforeEach(() => {
    resetAuthSessionStore();
    clearAuthToken();
    queryClient.clear();
    useBiddingCalendarStore.getState().resetActiveTierLabel();
    vi.resetAllMocks();
  });

  it("initializes to authenticated when the session API returns a user", async () => {
    writeAuthToken("jwt-token");
    mockedAuthService.getSession.mockResolvedValue({
      user: { id: "u-1", name: "Alex Crew", employeeNo: "F8001" },
      authMode: "password",
    });

    await act(async () => {
      await useAuthSessionStore.getState().initialize();
    });

    expect(useAuthSessionStore.getState().status).toBe("authenticated");
    expect(useAuthSessionStore.getState().user?.employeeNo).toBe("F8001");
  });

  it("initializes to unauthenticated immediately when no token is available", async () => {
    queryClient.setQueryData(staleAccountQueryKey, { account: "previous" });
    useBiddingCalendarStore.getState().setActiveTierLabel("T3");

    await act(async () => {
      await useAuthSessionStore.getState().initialize();
    });

    expect(mockedAuthService.getSession).not.toHaveBeenCalled();
    expect(useAuthSessionStore.getState().status).toBe("unauthenticated");
    expect(useAuthSessionStore.getState().user).toBeNull();
    expect(useAuthSessionStore.getState().authMode).toBeNull();
    expect(queryClient.getQueryData(staleAccountQueryKey)).toBeUndefined();
    expect(useBiddingCalendarStore.getState().activeTierLabel).toBe("");
  });

  it("clears the stored token when the session API returns null", async () => {
    writeAuthToken("jwt-token");
    queryClient.setQueryData(staleAccountQueryKey, { account: "previous" });
    useBiddingCalendarStore.getState().setActiveTierLabel("T2");
    mockedAuthService.getSession.mockResolvedValue(null);

    await act(async () => {
      await useAuthSessionStore.getState().initialize();
    });

    expect(readAuthToken()).toBeNull();
    expect(useAuthSessionStore.getState().status).toBe("unauthenticated");
    expect(queryClient.getQueryData(staleAccountQueryKey)).toBeUndefined();
    expect(useBiddingCalendarStore.getState().activeTierLabel).toBe("");
  });

  it("logs in with user code and password and stores the session", async () => {
    writeAuthToken("previous-token");
    queryClient.setQueryData(staleAccountQueryKey, { account: "previous" });
    useBiddingCalendarStore.getState().setActiveTierLabel("T4");
    mockedAuthService.login.mockResolvedValue({
      token: "jwt-token",
      user: { id: "u-2", name: "Taylor Crew", employeeNo: "F8015" },
      authMode: "password",
    });

    await act(async () => {
      await useAuthSessionStore.getState().login({
        userCode: "taylor.crew",
        password: "super-secret",
      });
    });

    expect(mockedAuthService.login).toHaveBeenCalledWith({
      userCode: "taylor.crew",
      password: "super-secret",
    });
    expect(useAuthSessionStore.getState().status).toBe("authenticated");
    expect(useAuthSessionStore.getState().user?.name).toBe("Taylor Crew");
    expect(useAuthSessionStore.getState().authMode).toBe("password");
    expect(readAuthToken()).toBe("jwt-token");
    expect(queryClient.getQueryData(staleAccountQueryKey)).toBeUndefined();
    expect(useBiddingCalendarStore.getState().activeTierLabel).toBe("");
  });

  it("recovers to unauthenticated and rejects when password login fails", async () => {
    writeAuthToken("previous-token");
    queryClient.setQueryData(staleAccountQueryKey, { account: "previous" });
    useBiddingCalendarStore.getState().setActiveTierLabel("T5");
    mockedAuthService.login.mockRejectedValue(new Error("login failed"));

    await act(async () => {
      await expect(
        useAuthSessionStore.getState().login({
          userCode: "taylor.crew",
          password: "wrong-password",
        }),
      ).rejects.toThrow("login failed");
    });

    expect(useAuthSessionStore.getState().status).toBe("unauthenticated");
    expect(useAuthSessionStore.getState().user).toBeNull();
    expect(useAuthSessionStore.getState().authMode).toBeNull();
    expect(readAuthToken()).toBeNull();
    expect(queryClient.getQueryData(staleAccountQueryKey)).toBeUndefined();
    expect(useBiddingCalendarStore.getState().activeTierLabel).toBe("");
  });

  it("completes SSO from a token and stores the session", async () => {
    writeAuthToken("previous-token");
    queryClient.setQueryData(staleAccountQueryKey, { account: "previous" });
    useBiddingCalendarStore.getState().setActiveTierLabel("T6");
    mockedAuthService.handleSsoCallback.mockResolvedValue({
      user: { id: "u-3", name: "Jordan Pilot", employeeNo: "F8010" },
      authMode: "sso",
    });

    await act(async () => {
      await useAuthSessionStore.getState().completeSsoFromToken("abc");
    });

    expect(mockedAuthService.handleSsoCallback).toHaveBeenCalledWith({ token: "abc" });
    expect(useAuthSessionStore.getState().status).toBe("authenticated");
    expect(useAuthSessionStore.getState().user?.name).toBe("Jordan Pilot");
    expect(useAuthSessionStore.getState().authMode).toBe("sso");
    expect(queryClient.getQueryData(staleAccountQueryKey)).toBeUndefined();
    expect(useBiddingCalendarStore.getState().activeTierLabel).toBe("");
  });

  it("completes simulated login from the secure cookie handoff and stores the session", async () => {
    writeAuthToken("previous-token");
    queryClient.setQueryData(staleAccountQueryKey, { account: "previous" });
    useBiddingCalendarStore.getState().setActiveTierLabel("T6");
    mockedAuthService.handleSimulatedLogin.mockResolvedValue({
      token: "simulated-jwt-token",
      user: { id: "u-4", name: "Mary Nasso", employeeNo: "B79185" },
      authMode: "simulated",
    });

    await act(async () => {
      await useAuthSessionStore.getState().completeSimulatedLogin();
    });

    expect(mockedAuthService.handleSimulatedLogin).toHaveBeenCalledWith();
    expect(useAuthSessionStore.getState().status).toBe("authenticated");
    expect(useAuthSessionStore.getState().user?.employeeNo).toBe("B79185");
    expect(useAuthSessionStore.getState().authMode).toBe("simulated");
    expect(readAuthToken()).toBe("simulated-jwt-token");
    expect(queryClient.getQueryData(staleAccountQueryKey)).toBeUndefined();
    expect(useBiddingCalendarStore.getState().activeTierLabel).toBe("");
  });

  it("recovers to unauthenticated and rejects when token completion fails", async () => {
    writeAuthToken("previous-token");
    queryClient.setQueryData(staleAccountQueryKey, { account: "previous" });
    useBiddingCalendarStore.getState().setActiveTierLabel("T7");
    mockedAuthService.handleSsoCallback.mockRejectedValue(
      new Error("sso callback failed"),
    );

    await act(async () => {
      await expect(
        useAuthSessionStore.getState().completeSsoFromToken("abc"),
      ).rejects.toThrow("sso callback failed");
    });

    expect(useAuthSessionStore.getState().status).toBe("unauthenticated");
    expect(useAuthSessionStore.getState().user).toBeNull();
    expect(useAuthSessionStore.getState().authMode).toBeNull();
    expect(readAuthToken()).toBeNull();
    expect(queryClient.getQueryData(staleAccountQueryKey)).toBeUndefined();
    expect(useBiddingCalendarStore.getState().activeTierLabel).toBe("");
  });

  it("recovers to unauthenticated when initialize fails", async () => {
    writeAuthToken("jwt-token");
    queryClient.setQueryData(staleAccountQueryKey, { account: "previous" });
    useBiddingCalendarStore.getState().setActiveTierLabel("T8");
    mockedAuthService.getSession.mockRejectedValue(new Error("session lookup failed"));

    await act(async () => {
      await useAuthSessionStore.getState().initialize();
    });

    expect(useAuthSessionStore.getState().status).toBe("unauthenticated");
    expect(useAuthSessionStore.getState().user).toBeNull();
    expect(useAuthSessionStore.getState().authMode).toBeNull();
    expect(readAuthToken()).toBeNull();
    expect(queryClient.getQueryData(staleAccountQueryKey)).toBeUndefined();
    expect(useBiddingCalendarStore.getState().activeTierLabel).toBe("");
  });

  it("clears session data back to unauthenticated", () => {
    useAuthSessionStore.getState().setSession(
      { id: "u-1", name: "Alex Crew", employeeNo: "F8001" },
      "sso",
    );
    queryClient.setQueryData(staleAccountQueryKey, { account: "previous" });
    useBiddingCalendarStore.getState().setActiveTierLabel("T2");

    useAuthSessionStore.getState().clearSession();

    expect(useAuthSessionStore.getState().status).toBe("unauthenticated");
    expect(useAuthSessionStore.getState().user).toBeNull();
    expect(useAuthSessionStore.getState().authMode).toBeNull();
    expect(readAuthToken()).toBeNull();
    expect(queryClient.getQueryData(staleAccountQueryKey)).toBeUndefined();
    expect(useBiddingCalendarStore.getState().activeTierLabel).toBe("");
  });

  it("clears account-scoped client cache on logout", async () => {
    writeAuthToken("jwt-token");
    queryClient.setQueryData(staleAccountQueryKey, { account: "previous" });
    useBiddingCalendarStore.getState().setActiveTierLabel("T1");
    mockedAuthService.logout.mockResolvedValue(undefined);
    useAuthSessionStore.getState().setSession(
      { id: "u-1", name: "Alex Crew", employeeNo: "F8001" },
      "password",
    );
    queryClient.setQueryData(staleAccountQueryKey, { account: "previous" });
    useBiddingCalendarStore.getState().setActiveTierLabel("T1");

    await act(async () => {
      await useAuthSessionStore.getState().logout();
    });

    expect(mockedAuthService.logout).toHaveBeenCalledTimes(1);
    expect(useAuthSessionStore.getState().status).toBe("unauthenticated");
    expect(useAuthSessionStore.getState().user).toBeNull();
    expect(readAuthToken()).toBeNull();
    expect(queryClient.getQueryData(staleAccountQueryKey)).toBeUndefined();
    expect(useBiddingCalendarStore.getState().activeTierLabel).toBe("");
  });

  it("redirects enterprise sign-in to the configured SSO URL", () => {
    const assign = vi.fn();

    vi.stubGlobal("location", {
      ...window.location,
      assign,
    });
    mockedAuthService.getSsoLoginUrl.mockReturnValue("https://id.example.com/sso/login");

    useAuthSessionStore.getState().redirectToSsoLogin();

    expect(mockedAuthService.getSsoLoginUrl).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith("https://id.example.com/sso/login");

    vi.unstubAllGlobals();
  });
});
