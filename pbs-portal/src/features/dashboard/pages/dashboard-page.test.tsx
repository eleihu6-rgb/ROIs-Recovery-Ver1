import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppProviders } from "@/app/providers/app-providers";
import { DashboardPage } from "@/features/dashboard/pages/dashboard-page";
import { useAuthSessionStore } from "@/features/auth/store/use-auth-session-store";
import { queryClient } from "@/shared/query/query-client";
import { biddingCalendarService } from "@/shared/services/bidding-calendar-service";
import { dashboardSummaryService } from "@/shared/services/dashboard-summary-service";
import { pairingService } from "@/shared/services/pairing-service";

describe("DashboardPage", () => {
  beforeEach(() => {
    queryClient.clear();
    vi.spyOn(biddingCalendarService, "getCurrentCalendar").mockResolvedValue({
      periodCode: "Apr 2026",
      bidContext: "Current",
      currentPeriod: {
        id: 42,
        rosterPeriodId: 42,
        rosterPeriodKey: "2026RP04",
        periodCode: "Apr 2026",
        filiale: "F8",
        status: "OPEN",
        computedStage: "OPEN",
        bidOpenAt: "2026-03-06T00:00:00.000Z",
        bidCloseAt: "2026-03-13T23:59:00.000Z",
        base: "YYZ",
        zoneId: "America/Toronto",
        timezoneLabel: "YYZ Local Time",
        rpStartLocal: "2026-04-01",
        rpEndLocal: "2026-04-30",
        canEditBid: true,
        readOnlyReason: null,
      },
      activeTierRange: ["T1", "T2", "T3", "T4", "T5", "T6", "T7"],
      events: [
        {
          id: "day-off-2026-04-05",
          type: "prefer_off_bid",
          tier: "T1",
          label: "Off",
          startDate: "2026-04-05",
          endDate: "2026-04-05",
          tone: "green",
          source: "pbs_bid_group",
          readonly: false,
        },
        {
          id: "pairing-bid-m4959",
          type: "pairing_bid",
          tier: "T1",
          label: "M4959",
          startDate: "2026-04-06",
          endDate: "2026-04-08",
          tone: "blue",
          source: "pbs_bid_group",
          readonly: true,
          metadata: {
            propertyGroupKey: "group-102",
            pairingNumber: "M4959",
            pairingId: "4959001",
            originDate: "2026-04-06",
            occurrenceMode: "specific_date",
          },
        },
      ],
    });
    vi.spyOn(dashboardSummaryService, "getCurrentSummary").mockResolvedValue({
      profile: {
        id: "u-1",
        employeeNo: "F8001",
        name: "Alex Crew",
        email: "alex.crew@example.com",
        base: "YVR",
        rank: "FA",
        division: "C",
        fleet: ["737", "7M8"],
        languages: ["EN 5", "FR"],
        seniorityLabel: "646",
        statusLabel: null,
        existingCreditLabel: "75.5",
        trainingMonthLabel: null,
        lastLoginLabel: "Apr 01, 19:30",
      },
      bidPackage: {
        periodCode: "Apr 2026",
        rosterPeriodId: 4,
        rpEndLocal: "2026-04-30",
        rpStartLocal: "2026-04-01",
        businessNow: "2026-04-02T12:00:00.000Z",
        timezoneLabel: "YVR Local Time",
        bidStartAt: "2026-04-01T07:00:00.000Z",
        bidCloseAt: "2026-04-09T06:59:00.000Z",
        bidStartLabel: "Apr 01, 00:00",
        bidCloseLabel: "Apr 08, 23:59",
        remainingLabel: "6 DAYS 11 HRS 59 MINS",
        computedStage: "OPEN",
        targetedLine: null,
        targetedReserve: null,
        totalBidder: 147,
      },
      messageCenter: {
        title: "MESSAGE CENTER",
        baseLineAverage: null,
        preAssignments: {
          totalDuties: 2,
          daysTouched: 2,
          categories: [
            { code: "PAIRING", label: "Pairing", count: 1 },
            { code: "DAYS_OFF", label: "Days Off", count: 1 },
          ],
          details: [
            {
              id: "pairing:9001",
              type: "pairing",
              code: "PAIRING",
              label: "T4501",
              startDate: "2026-04-06",
              endDate: "2026-04-06",
              timeText: "06:00-15:00",
            },
            {
              id: "ground:do",
              type: "ground",
              code: "DO",
              label: "Days Off",
              startDate: "2026-04-10",
              endDate: "2026-04-10",
              timeText: null,
            },
          ],
        },
        fleetItems: [{ fleet: "737", subFleet: null, pairingCount: 24 }],
        messages: [],
      },
    });
    vi.spyOn(pairingService, "getPageData").mockResolvedValue({
      rightPanel: {
        draftMeta: {
          draftKey: "pairing-draft-1",
          periodCode: "Apr 2026",
          draftVersion: 0,
          bidContext: "Current",
          remarks: "",
        },
        existingTitle: "EXISTING PAIRING PROPERTIES",
        addSectionTitle: "ADD PAIRING PROPERTIES",
        allPropertiesLabel: "ALL PROPERTIES",
        favoritedPropertiesLabel: "FAVORITED PROPERTIES",
        searchPlaceholder: "Search Properties",
        searchButtonLabel: "SEARCH PAIRINGS",
        existingProperties: [],
        availableProperties: [],
        initialSearchForm: {
          pairingNumber: "",
          pairingType: "",
          dateFrom: "",
          dateTo: "",
        },
      },
    });
    vi.spyOn(pairingService, "getPairingDetails").mockResolvedValue({
      results: [
        {
          id: "4959001",
          pairingId: "4959001",
          pairingNumber: "M4959",
          base: "YVR",
          originDate: "2026-04-06",
          endDate: "2026-04-08",
          endDateLabel: "Apr 8, 2026",
          reportTime: "0630",
          releaseTime: "1830",
          durationDays: 3,
          routeLabel: "YVR-CUN",
          priorityLabel: "P0",
          prioritySequence: "00",
          totalBlock: "1214",
          totalCredit: "765",
          totalPay: "765",
          activeDates: ["2026-04-06"],
          legs: [
            {
              id: "4959001-1-1",
              day: 1,
              dutyDate: "0406",
              dutyFdp: "0830",
              dutyFlyingHour: "0531",
              dutyHour: "0930",
              dutyCredit: "0600",
              flightNumber: "2810",
              departureStation: "YVR",
              arrivalStation: "CUN",
              departureTime: "0730",
              arrivalTime: "1301",
              blockTime: "0531",
              equipment: "7M8",
            },
          ],
        },
      ],
    });
  });

  afterEach(() => {
    act(() => {
      useAuthSessionStore.setState({
        status: "idle",
        user: null,
        authMode: null,
      });
    });
    queryClient.clear();
    vi.restoreAllMocks();
  });

  it("renders the authenticated crew profile inside the three-column dashboard layout", async () => {
    act(() => {
      useAuthSessionStore.setState({
        status: "authenticated",
        user: {
          id: "u-1",
          name: "Alex Crew",
          employeeNo: "F8001",
        },
        authMode: "password",
      });
    });

    render(
      <AppProviders>
        <DashboardPage />
      </AppProviders>,
    );

    expect(screen.getByRole("heading", { name: "Alex Crew" })).toBeInTheDocument();
    expect(await screen.findByText("alex.crew@example.com")).toBeInTheDocument();
    expect(screen.getByText("YVR")).toBeInTheDocument();
    expect(screen.getByText("FA")).toBeInTheDocument();
    expect(screen.getByText(/737\s+7M8/)).toBeInTheDocument();
    expect(screen.getByText(/EN 5\s+FR/)).toBeInTheDocument();
    expect(screen.getByText("646")).toBeInTheDocument();
    expect(screen.getByText("75.5")).toBeInTheDocument();
    expect(screen.getByText("Apr 01, 00:00")).toBeInTheDocument();
    expect(screen.getByText("Apr 08, 23:59")).toBeInTheDocument();
    expect(screen.getByText("6 DAYS 11 HRS")).toBeInTheDocument();
    expect(screen.queryByText("6 DAYS 11 HRS 59 MINS")).not.toBeInTheDocument();
    expect(screen.queryByText("147")).not.toBeInTheDocument();
    expect(screen.queryByText(/TARGETED LINE/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/TOTAL BIDDER/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/TARGETED RESERVE/i)).not.toBeInTheDocument();
    expect(screen.getByText("Apr 01, 19:30")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pre-assigned Duties" })).toBeInTheDocument();
    expect(screen.getByText("2 days")).toBeInTheDocument();
    expect(screen.getByText("Duty Details")).toBeInTheDocument();
    expect(screen.getAllByText("Pairing").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Days Off").length).toBeGreaterThan(0);
    expect(screen.getByText("T4501")).toBeInTheDocument();
    expect(screen.getByText("Apr 06")).toBeInTheDocument();
    expect(screen.queryByText("Bid Package")).not.toBeInTheDocument();
    expect(screen.queryByText("24 pairings")).not.toBeInTheDocument();
    expect(screen.queryByText("BASE LINE AVERAGE: -")).not.toBeInTheDocument();
    expect(screen.queryByText(/ACTIVE/)).not.toBeInTheDocument();
    expect(screen.queryByText("Emma Li@rois-tech.com")).not.toBeInTheDocument();
    expect(screen.queryByText("LAX")).not.toBeInTheDocument();
    expect(screen.queryByText("646/2132")).not.toBeInTheDocument();
    expect(screen.queryByText("FRI DEC 21 2024 12:00 PM")).not.toBeInTheDocument();
    expect(screen.queryByText("NOV 2025")).not.toBeInTheDocument();
    expect(screen.queryByText("F80001")).not.toBeInTheDocument();
    expect(screen.queryByText("78:16")).not.toBeInTheDocument();
    expect(screen.queryByText(/LINEHOLDER/)).not.toBeInTheDocument();
    expect(screen.getByText("BIDDING CALENDAR")).toBeInTheDocument();
    const currentPeriodStatus = screen.getByTestId("bidding-calendar-current-period-status");
    expect(within(currentPeriodStatus).getByText("Bidding open for Apr 2026")).toBeInTheDocument();
    expect(within(currentPeriodStatus).getByText(
      "Open Mar 05, 19:00 · Close Mar 13, 19:59 · YYZ Local Time",
    )).toBeInTheDocument();
    expect(screen.queryByText(/Mar 06, 08:00/)).not.toBeInTheDocument();
    expect(screen.getByText("MESSAGE CENTER")).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-layout")).toHaveStyle({
      gridTemplateColumns: "436px minmax(0, 1fr) 365px",
      minHeight: "var(--portal-page-shell-height)",
    });
    expect(screen.queryByRole("button", { name: "Collapse bidding calendar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Expand bidding calendar" })).not.toBeInTheDocument();
  });

  it("contains the dashboard calendar loading state inside the page shell", async () => {
    vi.mocked(biddingCalendarService.getCurrentCalendar).mockImplementation(
      () => new Promise(() => {}),
    );

    act(() => {
      useAuthSessionStore.setState({
        status: "authenticated",
        user: {
          id: "u-1",
          name: "Alex Crew",
          employeeNo: "F8001",
        },
        authMode: "password",
      });
    });

    render(
      <AppProviders>
        <DashboardPage />
      </AppProviders>,
    );

    expect(screen.getByTestId("dashboard-layout")).toHaveStyle({
      minHeight: "var(--portal-page-shell-height)",
    });

    const loadingPanel = await screen.findByTestId("dashboard-schedule-panel-loading");

    expect(loadingPanel).toHaveClass("h-full", "min-h-0", "overflow-hidden");
    expect(screen.getAllByText("Loading bidding calendar...").length).toBeGreaterThan(0);
    expect(loadingPanel.querySelectorAll("[aria-hidden='true']").length).toBeGreaterThan(20);
  });

  it("opens pairing bid details in readonly mode without loading pairing draft data", async () => {
    const user = userEvent.setup();
    const getPageDataSpy = vi.mocked(pairingService.getPageData);
    const getPairingDetailsSpy = vi.mocked(pairingService.getPairingDetails);

    act(() => {
      useAuthSessionStore.setState({
        status: "authenticated",
        user: {
          id: "u-1",
          name: "Alex Crew",
          employeeNo: "F8001",
        },
        authMode: "password",
      });
    });

    render(
      <AppProviders>
        <DashboardPage />
      </AppProviders>,
    );

    await user.click(await screen.findByRole("button", { name: "View pairing bid M4959" }));

    const dialog = await screen.findByRole("dialog", { name: "Pairing Bid" });

    expect(await within(dialog).findByText("M4959 #4959001")).toBeInTheDocument();
    expect(within(dialog).getByText("Base")).toBeInTheDocument();
    expect(within(dialog).getByText("Total BH")).toBeInTheDocument();
    expect(within(dialog).getAllByText("M4959").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText("YVR").length).toBeGreaterThan(0);
    expect(within(dialog).getByText("2810")).toBeInTheDocument();
    expect(within(dialog).queryByText("APPLY TO TIERS")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "SAVE BID" })).not.toBeInTheDocument();
    expect(getPageDataSpy).not.toHaveBeenCalled();
    expect(getPairingDetailsSpy).toHaveBeenCalledWith(
      { rosterPeriodId: 42, periodCode: "Apr 2026" },
      [
        {
          pairingId: "4959001",
          originDate: "2026-04-06",
        },
      ],
    );
  });
});
