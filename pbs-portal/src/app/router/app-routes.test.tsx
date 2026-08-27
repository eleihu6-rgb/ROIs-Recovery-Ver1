import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "@/app/app";
import { getAuthReturnToKey, normalizeAuthReturnTo } from "@/app/router/auth-return-to";
import { pairingPageData } from "@/features/pairing/mock";
import { daysOffPageData } from "@/features/days-off/mock";
import { linePageData } from "@/features/line/mock";
import { tierPageData } from "@/features/tier/mock";
import { useAuthSessionStore } from "@/features/auth/store/use-auth-session-store";
import { authService } from "@/shared/services/auth-service";
import { awardService } from "@/shared/services/award-service";
import { biddingCalendarService } from "@/shared/services/bidding-calendar-service";
import { dashboardProfileService } from "@/shared/services/dashboard-profile-service";
import { dashboardSummaryService } from "@/shared/services/dashboard-summary-service";
import { bidFeedbackService } from "@/shared/services/bid-feedback-service";
import { pairingService } from "@/shared/services/pairing-service";
import { daysOffService } from "@/shared/services/days-off-service";
import { lineService } from "@/shared/services/line-service";
import { reserveService } from "@/shared/services/reserve-service";
import { tierService } from "@/shared/services/tier-service";
import { clearAuthToken, writeAuthToken } from "@/shared/services/auth-token-storage";
import type { PbsAwardCurrentResponse } from "../../../../packages/contracts/pbs-award-results.js";

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

const resetAuthSessionStore = () => {
  useAuthSessionStore.setState({
    status: "idle",
    user: null,
    authMode: null,
  });
};

const AUTH_RETURN_TO_KEY = getAuthReturnToKey();
const APP_BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");

const awardResponse: PbsAwardCurrentResponse = {
  periodCode: "Jun 2026",
  published: true,
  rpStart: "2026-06-01",
  rpEnd: "2026-06-30",
  timeZone: {
    base: "YVR",
    zoneId: "America/Vancouver",
    timezoneLabel: "YVR Local Time",
    fallback: false,
  },
  summary: {
    tier: "6",
    offDays: 14,
    creditMinutes: 5507,
    premiumMinutes: 4230,
    pairingCount: 18,
    activityCount: 42,
    warnings: [],
  },
  calendar: {
    monthLabel: "JUN 2026",
    weekdayLabels: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"],
    events: [],
  },
  items: [],
  reasonReport: {
    available: true,
    items: [{
      id: "pairing-1",
      kind: "awarded_pairing",
      pairingId: "1",
      pairingCode: "V1",
      startDate: "2026-06-01",
      endDate: "2026-06-01",
      explanation: "Matched your Tier 1 pairing preferences.",
    }],
  },
};

const buildBrowserPath = (path: string) => `${APP_BASE_PATH}${path}`;

const getCurrentAppPathname = () => {
  if (!APP_BASE_PATH) {
    return window.location.pathname;
  }

  if (window.location.pathname === APP_BASE_PATH) {
    return "/";
  }

  if (window.location.pathname.startsWith(`${APP_BASE_PATH}/`)) {
    return window.location.pathname.slice(APP_BASE_PATH.length);
  }

  return window.location.pathname;
};

const renderAppAt = (path: string, withStrictMode = false) => {
  window.history.replaceState({}, "", buildBrowserPath(path));

  const tree = <App />;

  return render(withStrictMode ? <StrictMode>{tree}</StrictMode> : tree);
};

describe("AppRoutes", () => {
  beforeEach(() => {
    resetAuthSessionStore();
    clearAuthToken();
    vi.resetAllMocks();
    vi.spyOn(pairingService, "getPageData").mockResolvedValue(structuredClone(pairingPageData));
    vi.spyOn(daysOffService, "getPageData").mockResolvedValue(structuredClone(daysOffPageData));
    vi.spyOn(lineService, "getPageData").mockResolvedValue(structuredClone(linePageData));
    vi.spyOn(reserveService, "getPageData").mockResolvedValue(structuredClone(linePageData));
    vi.spyOn(bidFeedbackService, "getCurrentConflicts").mockResolvedValue({
      draftVersion: "0:0:0:0",
      generatedAt: "2026-04-01T00:00:00.000Z",
      conflictCount: 0,
      advisoryCount: 0,
      conflicts: [],
    });
    vi.spyOn(pairingService, "previewCurrentRules").mockResolvedValue({
      mode: "current_rules_preview",
      tier: "T1",
      properties: [],
      summary: {
        pairingIdCount: 1,
        totalItems: 1,
      },
      pagination: {
        page: 1,
        pageSize: 1,
        totalItems: 1,
        totalPages: 1,
      },
      results: [],
    });
    vi.spyOn(pairingService, "countCurrentRules").mockImplementation(async (tier) => ({
      mode: "current_rules_counts",
      periodCode: "Apr 2026",
      tier,
      computedAt: "2026-04-01T00:00:00.000Z",
      summary: {
        activePropertyCount: 0,
        allRules: null,
      },
      rows: [],
    }));
    vi.spyOn(pairingService, "countCurrentRuleTierPools").mockResolvedValue({
      mode: "current_rules_tier_pools",
      periodCode: "Apr 2026",
      computedAt: "2026-04-01T00:00:00.000Z",
      packageTotal: {
        pairingIdCount: 1,
        totalItems: 1,
      },
      rows: [],
    });
    vi.spyOn(tierService, "getPageData").mockResolvedValue(structuredClone(tierPageData));
    vi.spyOn(awardService, "getCurrentAward").mockResolvedValue(structuredClone(awardResponse));
    vi.spyOn(awardService, "getAwardPeriods").mockResolvedValue({
      periods: [{
        rosterPeriodId: 42,
        periodCode: "Jun 2026",
        rpStart: "2026-06-01",
        rpEnd: "2026-06-30",
        lifecycleStage: "PUBLISHED",
        awardPublishAt: "2026-05-20T00:00:00.000Z",
        awardFinalAt: "2026-05-22T00:00:00.000Z",
        misAwardDeadlineAt: "2026-05-26T00:00:00.000Z",
        firstPublishedAt: "2026-05-20T00:05:00.000Z",
        latestPublishedAt: "2026-05-20T00:05:00.000Z",
      }],
    });
    vi.spyOn(dashboardProfileService, "getCurrentProfile").mockImplementation(
      () => new Promise(() => undefined),
    );
    vi.spyOn(dashboardSummaryService, "getCurrentSummary").mockImplementation(
      () => new Promise(() => undefined),
    );
    vi.spyOn(biddingCalendarService, "getCurrentCalendar").mockResolvedValue({
      periodCode: "Apr 2026",
      bidContext: "Current",
      currentPeriod: {
        id: 42,
        rosterPeriodId: 42,
        rosterPeriodKey: "2026RP04",
        periodCode: "Apr 2026",
        rpStartLocal: "2026-04-01",
        rpEndLocal: "2026-04-30",
        filiale: "F8",
        status: "OPEN",
        computedStage: "OPEN",
        bidOpenAt: "2026-03-06T00:00:00.000Z",
        bidCloseAt: "2026-03-13T23:59:00.000Z",
        canEditBid: true,
        readOnlyReason: null,
      },
      activeTierRange: ["T1", "T2", "T3", "T4", "T5", "T6", "T7"],
      events: [],
    });
    window.sessionStorage.clear();
    window.history.replaceState({}, "", buildBrowserPath("/"));
  });

  it("redirects `/` to `/dashboard` for authenticated users", async () => {
    writeAuthToken("jwt-token");
    mockedAuthService.getSession.mockResolvedValue({
      user: { id: "u-1", name: "Alex Crew", employeeNo: "F8001" },
      authMode: "password",
    });

    renderAppAt("/");

    expect(await screen.findByRole("heading", { name: "Alex Crew" })).toBeInTheDocument();
    expect(getCurrentAppPathname()).toBe("/dashboard");
  });

  it("redirects guests from `/dashboard` to `/login?redirect=%2Fdashboard`", async () => {
    mockedAuthService.getSession.mockResolvedValue(null);

    renderAppAt("/dashboard");

    expect(await screen.findByRole("button", { name: "SSO Login" })).toBeInTheDocument();
    expect(getCurrentAppPathname()).toBe("/login");
    expect(window.location.search).toBe("?redirect=%2Fdashboard");
    expect(window.sessionStorage.getItem(AUTH_RETURN_TO_KEY)).toBe("/dashboard");
  });

  it("allows Portal browser autofill and submits silently populated credentials", async () => {
    mockedAuthService.getSession.mockResolvedValue(null);
    mockedAuthService.login.mockResolvedValue({
      token: "jwt-token",
      user: { id: "u-login", name: "Qin Crew", employeeNo: "Qin" },
      authMode: "password",
    });

    renderAppAt("/login");

    expect(await screen.findByRole("button", { name: "SSO Login" })).toBeInTheDocument();

    const form = document.querySelector<HTMLFormElement>("form#pbs-portal-login-form");
    const userCodeInput = screen.getByLabelText("User Code");
    const passwordInput = screen.getByLabelText("Password");

    expect(form).toHaveAttribute("name", "pbs-portal-login-form");
    expect(form).toHaveAttribute("method", "post");
    expect(form).toHaveAttribute("autocomplete", "on");
    expect(userCodeInput).toHaveAttribute("name", "pbsPortalUserCode");
    expect(userCodeInput).toHaveAttribute("autocomplete", "section-pbs username");
    expect(userCodeInput).not.toHaveAttribute("readonly");
    expect(passwordInput).toHaveAttribute("name", "pbsPortalPassword");
    expect(passwordInput).toHaveAttribute("autocomplete", "section-pbs current-password");
    expect(passwordInput).not.toHaveAttribute("readonly");

    await act(async () => {
      (userCodeInput as HTMLInputElement).value = "Qin";
      (passwordInput as HTMLInputElement).value = "browser-password";
      await new Promise((resolve) => window.setTimeout(resolve, 300));
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() => {
      expect(mockedAuthService.login).toHaveBeenCalledWith({
        userCode: "Qin",
        password: "browser-password",
      });
    });
  });

  it("maps legacy `/portal/home` into `/dashboard` for authenticated users", async () => {
    writeAuthToken("jwt-token");
    mockedAuthService.getSession.mockResolvedValue({
      user: { id: "u-2", name: "Jordan Pilot", employeeNo: "F8010" },
      authMode: "sso",
    });

    renderAppAt("/portal/home");

    expect(await screen.findByRole("heading", { name: "Jordan Pilot" })).toBeInTheDocument();
    expect(getCurrentAppPathname()).toBe("/dashboard");
  });

  it("maps legacy `/auth/callback?token=abc` into `/login` and clears the URL token before completing sign-in", async () => {
    mockedAuthService.handleSsoCallback.mockImplementation(
      () => new Promise(() => undefined),
    );

    renderAppAt("/auth/callback?token=abc");

    await waitFor(() => {
      expect(mockedAuthService.handleSsoCallback).toHaveBeenCalledWith({ token: "abc" });
      expect(getCurrentAppPathname()).toBe("/login");
      expect(window.location.search).toBe("");
    });
  });

  it("recovers a failed SSO callback back on the login route with the error visible", async () => {
    mockedAuthService.handleSsoCallback.mockRejectedValue(
      new Error("sso callback failed"),
    );

    renderAppAt("/login?token=err");

    expect(await screen.findByText("sso callback failed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "SSO Login" })).toBeInTheDocument();
    expect(mockedAuthService.getSession).not.toHaveBeenCalled();
    expect(getCurrentAppPathname()).toBe("/login");
    expect(window.location.search).toBe("");
  });

  it("completes `/login?token=def` once in StrictMode and rejects retired Reserve redirect targets", async () => {
    mockedAuthService.handleSsoCallback.mockResolvedValue({
      user: { id: "u-3", name: "Taylor Crew", employeeNo: "F8015" },
      authMode: "sso",
    });

    renderAppAt("/login?token=def&redirect=%2Freserve", true);

    await waitFor(() => {
      expect(mockedAuthService.handleSsoCallback).toHaveBeenCalledTimes(1);
      expect(mockedAuthService.handleSsoCallback).toHaveBeenCalledWith({ token: "def" });
    });

    await waitFor(() => {
      expect(getCurrentAppPathname()).toBe("/dashboard");
    });
    expect(mockedAuthService.getSession).not.toHaveBeenCalled();
    expect(getCurrentAppPathname()).toBe("/dashboard");
    expect(window.sessionStorage.getItem(AUTH_RETURN_TO_KEY)).toBeNull();
  });

  it("completes `/login?simulate=1` once in StrictMode and returns to the safe redirect target", async () => {
    mockedAuthService.handleSimulatedLogin.mockResolvedValue({
      token: "simulated-jwt-token",
      user: { id: "u-4", name: "Mary Nasso", employeeNo: "B79185" },
      authMode: "simulated",
    });

    renderAppAt("/login?simulate=1&redirect=%2Fbid", true);

    await waitFor(() => {
      expect(mockedAuthService.handleSimulatedLogin).toHaveBeenCalledTimes(1);
      expect(mockedAuthService.handleSimulatedLogin).toHaveBeenCalledWith();
    });

    await waitFor(() => {
      expect(getCurrentAppPathname()).toBe("/bid");
    });
    expect(mockedAuthService.getSession).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(AUTH_RETURN_TO_KEY)).toBeNull();
  });

  it("rejects legacy `/login?simulateToken=def` links without exchanging the URL token", async () => {
    renderAppAt("/login?simulateToken=def&redirect=%2Fbid", true);

    expect(await screen.findByText("This simulated login link is no longer supported. Please generate a new link from Admin."))
      .toBeInTheDocument();
    expect(mockedAuthService.handleSimulatedLogin).not.toHaveBeenCalled();
    expect(getCurrentAppPathname()).toBe("/login");
    expect(window.location.search).toBe("?redirect=%2Fbid");
  });

  it("normalizes an unsafe stored return-to to `/dashboard` after password sign-in", async () => {
    const user = userEvent.setup();

    mockedAuthService.getSession.mockResolvedValue(null);
    mockedAuthService.login.mockResolvedValue({
      user: { id: "u-5", name: "Casey Crew", employeeNo: "F8030" },
      authMode: "password",
    });
    window.sessionStorage.setItem(AUTH_RETURN_TO_KEY, "/login");

    renderAppAt("/login");

    await user.type(screen.getByLabelText("User Code"), "casey.crew");
    await user.type(screen.getByLabelText("Password"), "super-secret");
    await user.click(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() => {
      expect(mockedAuthService.login).toHaveBeenCalledWith({
        userCode: "casey.crew",
        password: "super-secret",
      });
    });

    expect(await screen.findByRole("heading", { name: "Casey Crew" })).toBeInTheDocument();
    expect(getCurrentAppPathname()).toBe("/dashboard");
    expect(window.location.search).toBe("");
    expect(window.sessionStorage.getItem(AUTH_RETURN_TO_KEY)).toBeNull();
  });

  it("prefers the safe query redirect over a stale stored return-to after password sign-in", async () => {
    const user = userEvent.setup();

    mockedAuthService.getSession.mockResolvedValue(null);
    mockedAuthService.login.mockResolvedValue({
      user: { id: "u-4", name: "Morgan Crew", employeeNo: "F8020" },
      authMode: "password",
    });
    window.sessionStorage.setItem(AUTH_RETURN_TO_KEY, "/tier?tab=summary");

    renderAppAt("/login?redirect=%2Faward");

    await user.type(screen.getByLabelText("User Code"), "morgan.crew");
    await user.type(screen.getByLabelText("Password"), "super-secret");
    await user.click(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() => {
      expect(mockedAuthService.login).toHaveBeenCalledWith({
        userCode: "morgan.crew",
        password: "super-secret",
      });
    });

    expect(await screen.findByRole("button", { name: "View Reason Report" })).toBeInTheDocument();
    expect(getCurrentAppPathname()).toBe("/award");
    expect(window.location.search).toBe("");
    expect(window.sessionStorage.getItem(AUTH_RETURN_TO_KEY)).toBeNull();
  });

  it("normalizes retired Tier return-to targets to `/bid`", () => {
    expect(normalizeAuthReturnTo("/tier?tab=summary")).toBe("/bid");
    expect(normalizeAuthReturnTo("/layer?tab=summary")).toBe("/bid");
    expect(normalizeAuthReturnTo("/portal/notices?tab=summary")).toBe("/bid");
  });

  it("normalizes retired Reserve return-to targets to `/dashboard`", () => {
    expect(normalizeAuthReturnTo("/reserve")).toBe("/dashboard");
    expect(normalizeAuthReturnTo("/portal/calendar")).toBe("/dashboard");
  });

  it("redirects legacy `/pairing` to the merged Bid page", async () => {
    writeAuthToken("jwt-token");
    mockedAuthService.getSession.mockResolvedValue({
      user: { id: "u-6", name: "Riley Crew", employeeNo: "F8040" },
      authMode: "password",
    });

    renderAppAt("/pairing");

    expect(await screen.findByTestId("bid-page", {}, { timeout: 5_000 })).toBeInTheDocument();
    expect(getCurrentAppPathname()).toBe("/bid");
  });

  it("redirects legacy `/pairing/search` to `/bid/pairing/search`", async () => {
    writeAuthToken("jwt-token");
    mockedAuthService.getSession.mockResolvedValue({
      user: { id: "u-7", name: "Jamie Crew", employeeNo: "F8050" },
      authMode: "password",
    });

    renderAppAt("/pairing/search");

    expect(await screen.findByTestId("pairing-search-panel")).toBeInTheDocument();
    expect(getCurrentAppPathname()).toBe("/bid/pairing/search");
  });

  it("renders 404 for the removed Reserve route", async () => {
    writeAuthToken("jwt-token");
    mockedAuthService.getSession.mockResolvedValue({
      user: { id: "u-reserve", name: "Reserve Crew", employeeNo: "F8055" },
      authMode: "password",
    });

    renderAppAt("/reserve");

    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    expect(getCurrentAppPathname()).toBe("/reserve");
  });

  it("maps legacy `/portal/calendar` to 404 instead of the removed Reserve page", async () => {
    writeAuthToken("jwt-token");
    mockedAuthService.getSession.mockResolvedValue({
      user: { id: "u-calendar", name: "Calendar Crew", employeeNo: "F8056" },
      authMode: "password",
    });

    renderAppAt("/portal/calendar");

    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    expect(getCurrentAppPathname()).toBe("/portal/calendar");
  });

  it("renders the merged `/bid` route for authenticated users", async () => {
    writeAuthToken("jwt-token");
    mockedAuthService.getSession.mockResolvedValue({
      user: { id: "u-bid", name: "Taylor Crew", employeeNo: "F8045" },
      authMode: "password",
    });

    renderAppAt("/bid");

    expect(await screen.findByTestId("bid-page")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "FAVORITED PROPERTIES" })).toHaveAttribute("aria-selected", "true");
    expect(getCurrentAppPathname()).toBe("/bid");
  });

  it("renders the new `/help` route for authenticated users", async () => {
    writeAuthToken("jwt-token");
    mockedAuthService.getSession.mockResolvedValue({
      user: { id: "u-9", name: "Skyler Crew", employeeNo: "F8070" },
      authMode: "password",
    });

    renderAppAt("/help");

    expect(await screen.findByTestId("help-page")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Help Center" })).toBeInTheDocument();
    expect(getCurrentAppPathname()).toBe("/help");
  });

  it("redirects the retired `/tier` route to `/bid`", async () => {
    writeAuthToken("jwt-token");
    mockedAuthService.getSession.mockResolvedValue({
      user: { id: "u-8", name: "Avery Crew", employeeNo: "F8060" },
      authMode: "password",
    });

    renderAppAt("/tier");

    expect(await screen.findByTestId("bid-page")).toBeInTheDocument();
    expect(screen.queryByText("PAIRING POOLS")).not.toBeInTheDocument();
    expect(getCurrentAppPathname()).toBe("/bid");
  });

  it("renders `/award` as a standalone results page without the bidding calendar layout", async () => {
    writeAuthToken("jwt-token");
    mockedAuthService.getSession.mockResolvedValue({
      user: { id: "u-10", name: "Drew Crew", employeeNo: "F8080" },
      authMode: "password",
    });

    renderAppAt("/award");

    expect(await screen.findByTestId("award-results-page")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Award" })).toBeInTheDocument();
    expect(screen.queryByTestId("shared-bidding-workbench-layout")).not.toBeInTheDocument();
    expect(screen.queryByText("BIDDING CALENDAR")).not.toBeInTheDocument();
    expect(getCurrentAppPathname()).toBe("/award");
  });

  it("redirects legacy `/layer` to `/bid`", async () => {
    writeAuthToken("jwt-token");
    mockedAuthService.getSession.mockResolvedValue({
      user: { id: "u-layer", name: "Layer Crew", employeeNo: "F8081" },
      authMode: "password",
    });

    renderAppAt("/layer");

    expect(await screen.findByTestId("bid-page")).toBeInTheDocument();
    expect(getCurrentAppPathname()).toBe("/bid");
  });

  it("maps legacy `/portal/notices` directly to `/bid`", async () => {
    writeAuthToken("jwt-token");
    mockedAuthService.getSession.mockResolvedValue({
      user: { id: "u-notices", name: "Notices Crew", employeeNo: "F8082" },
      authMode: "password",
    });

    renderAppAt("/portal/notices");

    expect(await screen.findByTestId("bid-page")).toBeInTheDocument();
    expect(getCurrentAppPathname()).toBe("/bid");
  });
});
