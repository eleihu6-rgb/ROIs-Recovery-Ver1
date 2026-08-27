import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { biddingCalendarService } from "@/shared/services/bidding-calendar-service";
import { daysOffService } from "@/shared/services/days-off-service";
import { pairingService } from "@/shared/services/pairing-service";
import { reserveService } from "@/shared/services/reserve-service";
import { BIDDING_CALENDAR_COLLAPSED_STORAGE_KEY } from "@/app/layout/bidding-calendar-collapse-state";
import { queryClient } from "@/shared/query/query-client";
import { biddingCalendarQueryKey } from "@/features/dashboard/hooks/use-bidding-calendar";
import { dashboardUserProfileQueryKey } from "@/features/dashboard/hooks/use-dashboard-user-profile";
import { tierPageDataQueryKey } from "@/features/tier/hooks/use-tier-page-data";
import { usePairingPoolCountsRefreshStore } from "@/features/pairing/pairing-pool-counts-refresh-store";
import {
  buildPairingTierOptionsForTest,
  buildDaysOffPageDataForTest,
  cleanupSharedWorkbenchTest,
  getDaysOffCalendarMutationCallCount,
  getLastCalendarPatchChanges,
  getLastPatchedCalendarDraft,
  renderSharedWorkbench,
  setViewportSize,
  setDaysOffPageDataForTest,
  setupSharedWorkbenchTestMocks,
} from "@/app/layout/shared-bidding-workbench-layout.test-utils";

describe("SharedBiddingWorkbenchLayout", () => {
  beforeEach(setupSharedWorkbenchTestMocks);

  afterEach(cleanupSharedWorkbenchTest);

  it("fills the available viewport height while preserving proportional canvas scaling", async () => {
    setViewportSize(1200, 900);

    renderSharedWorkbench();

    expect(
      screen.getByRole("status", { name: "Loading bidding calendar..." }),
    ).toBeInTheDocument();

    await screen.findByText("APR 2026 · 2026-04-01 – 2026-04-30");

    const viewport = screen.getByTestId("shared-bidding-workbench-viewport");
    const canvas = screen.getByTestId("shared-bidding-workbench-canvas");
    const calendarContentRegion = screen.getByTestId("bidding-calendar-content-region");

    expect(viewport).toHaveStyle({ width: "1168px", height: "818px" });
    expect(canvas).toHaveStyle({
      width: "1888px",
      minHeight: `${818 / (1168 / 1888)}px`,
      transform: `scale(${1168 / 1888})`,
    });
    expect(calendarContentRegion).not.toHaveClass("overflow-x-auto");
    expect(calendarContentRegion).not.toHaveClass("overflow-y-auto");
  });

  it("shows days off capacity and reserve coverage together on the shared calendar", async () => {
    const reserveCoverageSpy = vi.spyOn(reserveService, "getCoverage");

    renderSharedWorkbench();

    expect(await screen.findByText("DO 23/33")).toBeInTheDocument();
    expect(await screen.findByText("RES 12/33")).toBeInTheDocument();
    expect(reserveCoverageSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps the shared calendar usable when reserve coverage cannot load", async () => {
    vi.mocked(reserveService.getCoverage).mockRejectedValueOnce(new Error("Reserve coverage unavailable"));

    renderSharedWorkbench();

    expect(await screen.findByText("APR 2026 · 2026-04-01 – 2026-04-30")).toBeInTheDocument();
    expect(await screen.findByText("DO 23/33")).toBeInTheDocument();
    expect(screen.queryByText("RES 12/33")).not.toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-schedule-panel-error")).not.toBeInTheDocument();
  });

  it("collapses and expands the shared bidding calendar while persisting the browser preference", async () => {
    const user = userEvent.setup();

    renderSharedWorkbench();

    await screen.findByText("APR 2026 · 2026-04-01 – 2026-04-30");

    const layout = screen.getByTestId("shared-bidding-workbench-layout");

    expect(layout).toHaveAttribute("data-calendar-collapsed", "false");
    expect(screen.getByTestId("bidding-calendar-title-strip")).toHaveTextContent("BIDDING CALENDAR");

    await user.click(screen.getByRole("button", { name: "Collapse bidding calendar" }));

    expect(layout).toHaveAttribute("data-calendar-collapsed", "true");
    expect(layout).toHaveStyle({
      gap: "0px",
    });
    expect(screen.getByTestId("shared-bidding-calendar-column")).toHaveStyle({
      flexBasis: "0px",
      width: "0px",
    });
    expect(screen.getByTestId("shared-bidding-workbench-body")).toHaveStyle({
      paddingLeft: "48px",
    });
    const calendarContent = screen.getByTestId("shared-bidding-calendar-content");
    expect(calendarContent).toHaveAttribute("aria-hidden", "true");
    expect(calendarContent).toHaveStyle({
      pointerEvents: "none",
      transform: "translateX(-8px)",
    });
    expect(screen.getByTestId("bidding-calendar-title-strip")).toHaveTextContent("BIDDING CALENDAR");
    expect(screen.getByRole("button", { name: "Expand bidding calendar" })).toBeInTheDocument();
    expect(window.localStorage.getItem(BIDDING_CALENDAR_COLLAPSED_STORAGE_KEY)).toBe("true");

    await user.click(screen.getByRole("button", { name: "Expand bidding calendar" }));

    expect(layout).toHaveAttribute("data-calendar-collapsed", "false");
    expect(screen.getByTestId("shared-bidding-workbench-body")).toHaveStyle({
      paddingLeft: "0px",
    });
    expect(screen.getByTestId("shared-bidding-calendar-content")).not.toHaveAttribute("aria-hidden");
    expect(await screen.findByTestId("bidding-calendar-title-strip")).toHaveTextContent("BIDDING CALENDAR");
    expect(window.localStorage.getItem(BIDDING_CALENDAR_COLLAPSED_STORAGE_KEY)).toBe("false");
  });

  it("restores the persisted collapsed calendar state on the next workbench mount", async () => {
    const user = userEvent.setup();
    const firstRender = renderSharedWorkbench();

    await screen.findByText("APR 2026 · 2026-04-01 – 2026-04-30");
    await user.click(screen.getByRole("button", { name: "Collapse bidding calendar" }));

    expect(window.localStorage.getItem(BIDDING_CALENDAR_COLLAPSED_STORAGE_KEY)).toBe("true");

    firstRender.unmount();
    renderSharedWorkbench();

    const layout = screen.getByTestId("shared-bidding-workbench-layout");

    expect(layout).toHaveAttribute("data-calendar-collapsed", "true");
    expect(screen.getByTestId("shared-bidding-calendar-content")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByTestId("bidding-calendar-title-strip")).toHaveTextContent("BIDDING CALENDAR");
    expect(screen.getByRole("button", { name: "Expand bidding calendar" })).toBeInTheDocument();
  });

  it("keeps the selected tier active after collapsing and expanding the calendar", async () => {
    const user = userEvent.setup();

    renderSharedWorkbench();

    const tierThree = await screen.findByRole("button", { name: "TIER-03" });

    await user.click(tierThree);
    await user.click(screen.getByRole("button", { name: "Collapse bidding calendar" }));
    await user.click(screen.getByRole("button", { name: "Expand bidding calendar" }));

    expect(await screen.findByRole("button", { name: "TIER-03" })).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps the selected tier active while switching between workbench routes", async () => {
    const user = userEvent.setup();

    renderSharedWorkbench();

    const tierThree = await screen.findByRole("button", { name: "TIER-03" });

    await user.click(tierThree);

    expect(tierThree).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("link", { name: "Pairing workbench body" })).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Pairing workbench body" }));

    expect(await screen.findByRole("link", { name: "Bid workbench body" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "TIER-03" })).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps day off editing disabled outside the days off route", async () => {
    const initialMutationCallCount = getDaysOffCalendarMutationCallCount();

    renderSharedWorkbench("/pairing");

    await screen.findByText("APR 2026 · 2026-04-01 – 2026-04-30");

    expect(screen.queryByRole("button", { name: "Toggle day off for 2026-04-05" })).not.toBeInTheDocument();
    expect(getDaysOffCalendarMutationCallCount()).toBe(initialMutationCallCount);
  });

  it("keeps the shared calendar display on bidding-calendar data instead of cached days off page data", async () => {
    setDaysOffPageDataForTest(buildDaysOffPageDataForTest({
      periodCode: "Apr 2026",
      draftVersion: 0,
      bidContext: "Current",
      tiers: [
        {
          tier: "T1",
          dates: ["2026-04-10"],
        },
      ],
    }));

    renderSharedWorkbench("/days-off");

    await screen.findByText("APR 2026 · 2026-04-01 – 2026-04-30");

    expect(screen.getByLabelText("TIER-01 day 05").className).toContain("bg-[#3DC0A9]");
    expect(screen.getByLabelText("TIER-01 day 10").className).toContain("bg-[#F8F9FB]");
  });

  it("blocks day off additions for tiers covered by an existing pairing bid", async () => {
    const user = userEvent.setup();
    const initialMutationCallCount = getDaysOffCalendarMutationCallCount();

    renderSharedWorkbench("/days-off");

    await user.click(await screen.findByRole("button", { name: "Toggle day off for 2026-04-06" }));

    expect(await screen.findByRole("checkbox", { name: "T1" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "T1" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "T2" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "SAVE BID" })).toBeDisabled();
    expect(screen.getByText("1 tier/date entry is blocked by a pairing bid.")).toBeInTheDocument();

    for (const tier of ["T2", "T3", "T4", "T5", "T6", "T7"]) {
      await user.click(screen.getByRole("checkbox", { name: tier }));
    }
    await user.click(screen.getByRole("button", { name: "SAVE BID" }));

    await waitFor(() => {
      expect(getDaysOffCalendarMutationCallCount()).toBeGreaterThan(initialMutationCallCount);
    }, { timeout: 1500 });

    expect(getLastPatchedCalendarDraft()).toEqual({
      periodCode: "Apr 2026",
      draftVersion: 0,
      bidContext: "Current",
      tiers: [
        {
          tier: "T1",
          dates: ["2026-04-05"],
        },
        {
          tier: "T2",
          dates: ["2026-04-06"],
        },
        {
          tier: "T3",
          dates: ["2026-04-06"],
        },
        {
          tier: "T4",
          dates: ["2026-04-06"],
        },
        {
          tier: "T5",
          dates: ["2026-04-06"],
        },
        {
          tier: "T6",
          dates: ["2026-04-06"],
        },
        {
          tier: "T7",
          dates: ["2026-04-06"],
        },
      ],
    });
  });

  it("adds selected origin-date pairings from the pairing calendar", async () => {
    const user = userEvent.setup();
    const addSpy = vi.mocked(pairingService.addCurrentDraftProperty);

    renderSharedWorkbench();

    await user.click(await screen.findByRole("button", { name: "Add pairing bid for 2026-04-04" }));

    const popover = await screen.findByTestId("schedule-action-popover");
    const portalRoot = screen.getByTestId("scaled-page-dialog-portal-root");

    expect(portalRoot).toContainElement(popover);
    expect(within(popover).queryByRole("tab", { name: "DAYS OFF" })).not.toBeInTheDocument();
    expect(within(popover).queryByRole("tab", { name: "PAIRING" })).not.toBeInTheDocument();
    expect(within(popover).getByText("PAIRING BID")).toBeInTheDocument();
    expect(within(popover).getByText("2026-04-04")).toBeInTheDocument();
    expect(await within(popover).findByRole("checkbox", { name: /M4959/ })).toBeInTheDocument();

    await user.click(within(popover).getByRole("checkbox", { name: /M4959/ }));
    await user.click(within(popover).getByRole("checkbox", { name: /V4146/ }));

    expect(within(popover).getByRole("checkbox", { name: "T1" })).toBeDisabled();
    expect(within(popover).getByText("1 tier blocked by days off.")).toBeInTheDocument();
    expect(within(popover).getByTestId("pairing-calendar-run-list")).toHaveClass("basis-[102px]");

    await user.click(within(popover).getByRole("button", { name: "Clear" }));
    await user.click(within(popover).getByRole("checkbox", { name: "T2" }));
    await user.click(within(popover).getByRole("button", { name: "ADD BID" }));

    await waitFor(() => {
      expect(addSpy).toHaveBeenCalledTimes(1);
    });

    expect(addSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        propertyCode: 102,
        name: "Pairing Preference",
        action: "award",
        bid: {
          type: "pairing-preference",
          pairingIds: ["496001", "414601"],
          pairingLabels: ["M4959", "V4146"],
        },
      }),
      expect.objectContaining({
        draftKey: "pairing-draft-1",
        periodCode: "Apr 2026",
      }),
    );
    expect(addSpy.mock.calls[0]?.[0].tiers.filter((tier) => tier.active).map((tier) => tier.label)).toEqual(["T2"]);
    const pairingPoolRefreshRequest = usePairingPoolCountsRefreshStore.getState().request;

    expect(pairingPoolRefreshRequest?.period).toEqual({
      rosterPeriodId: 42,
      periodCode: "Apr 2026",
    });
    expect(pairingPoolRefreshRequest?.existingProperties.map((property) => property.id)).toContain(
      "pairing-property-key-new",
    );
    expect(await screen.findByText("Pairing bid added.")).toBeInTheDocument();
  });

  it("lets Bid users switch a date between Days Off and Pairing and remembers the mode", async () => {
    const user = userEvent.setup();

    renderSharedWorkbench("/bid");

    await user.click(await screen.findByRole("button", { name: "Add bid for 2026-04-04" }));

    const popover = await screen.findByTestId("schedule-action-popover");
    const daysOffTab = within(popover).getByRole("tab", { name: "DAYS OFF" });
    const pairingTab = within(popover).getByRole("tab", { name: "PAIRING" });

    expect(daysOffTab).toHaveAttribute("aria-selected", "true");
    expect(pairingTab).toHaveAttribute("aria-selected", "false");

    await user.click(pairingTab);

    expect(pairingTab).toHaveAttribute("aria-selected", "true");
    expect(window.sessionStorage.getItem("pbs.bid.calendar-date-mode")).toBe("pairing");
    expect(await within(popover).findByRole("checkbox", { name: /M4959/ })).toBeInTheDocument();

    await user.click(daysOffTab);

    expect(daysOffTab).toHaveAttribute("aria-selected", "true");
    expect(window.sessionStorage.getItem("pbs.bid.calendar-date-mode")).toBe("days-off");
    expect(await within(popover).findByRole("group", { name: "Day off bid tiers" })).toBeInTheDocument();
  });

  it("does not default a new pairing calendar bid from the active tier", async () => {
    const user = userEvent.setup();
    const addSpy = vi.mocked(pairingService.addCurrentDraftProperty);

    renderSharedWorkbench();

    await user.click(await screen.findByRole("button", { name: "TIER-03" }));
    await user.click(screen.getByRole("button", { name: "Add pairing bid for 2026-04-04" }));

    const popover = await screen.findByTestId("schedule-action-popover");

    await within(popover).findByRole("checkbox", { name: /M4959/ });

    for (const tier of ["T1", "T2", "T3", "T4", "T5", "T6", "T7"]) {
      expect(within(popover).getByRole("checkbox", { name: tier })).not.toBeChecked();
    }
    expect(within(popover).getByRole("button", { name: "ADD BID" })).toBeDisabled();

    await user.click(within(popover).getByRole("checkbox", { name: /M4959/ }));
    expect(within(popover).getByRole("button", { name: "ADD BID" })).toBeDisabled();

    await user.click(within(popover).getByRole("checkbox", { name: "T3" }));
    await user.click(within(popover).getByRole("checkbox", { name: "T7" }));
    await user.click(within(popover).getByRole("button", { name: "ADD BID" }));

    await waitFor(() => {
      expect(addSpy).toHaveBeenCalledTimes(1);
    });

    expect(addSpy.mock.calls[0]?.[0].tiers.filter((tier) => tier.active).map((tier) => tier.label)).toEqual(["T3", "T7"]);
  });

  it("dismisses the pairing calendar popover before allowing another date action", async () => {
    const user = userEvent.setup();
    const occurrenceSpy = vi.mocked(pairingService.searchPairingOccurrencesByDate);

    renderSharedWorkbench();

    await user.click(await screen.findByRole("button", { name: "Add pairing bid for 2026-04-04" }));

    expect(await screen.findByTestId("schedule-action-popover")).toBeInTheDocument();
    expect(await screen.findByText("2026-04-04")).toBeInTheDocument();

    await waitFor(() => {
      expect(occurrenceSpy).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByTestId("schedule-action-popover-dismiss"));

    await waitFor(() => {
      expect(screen.queryByTestId("schedule-action-popover")).not.toBeInTheDocument();
    });
    expect(occurrenceSpy).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Add pairing bid for 2026-04-05" }));

    expect(await screen.findByTestId("schedule-action-popover")).toBeInTheDocument();
    expect(await screen.findByText("2026-04-05")).toBeInTheDocument();
    await waitFor(() => {
      expect(occurrenceSpy).toHaveBeenCalledTimes(2);
    });
  });

  it("filters pairing calendar runs locally by pairing number", async () => {
    const user = userEvent.setup();

    renderSharedWorkbench();

    await user.click(await screen.findByRole("button", { name: "Add pairing bid for 2026-04-04" }));

    const popover = await screen.findByTestId("schedule-action-popover");
    const runList = within(popover).getByTestId("pairing-calendar-run-list");

    expect(runList.className).toContain("basis-[118px]");

    await user.type(within(popover).getByRole("searchbox", { name: "Search pairing numbers" }), "v41");

    expect(within(runList).getByRole("checkbox", { name: /V4146/ })).toBeInTheDocument();
    expect(within(runList).queryByRole("checkbox", { name: /M4959/ })).not.toBeInTheDocument();

    await user.clear(within(popover).getByRole("searchbox", { name: "Search pairing numbers" }));
    await user.type(within(popover).getByRole("searchbox", { name: "Search pairing numbers" }), "zzz");

    expect(within(runList).getByText("No matching pairings found.")).toBeInTheDocument();
  });

  it("keeps pairing calendar add controls disabled until the save completes", async () => {
    const user = userEvent.setup();
    const pendingSave = {
      resolve: null as (() => void) | null,
    };

    vi.mocked(pairingService.addCurrentDraftProperty).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          pendingSave.resolve = () => resolve({
            saved: true,
            draftKey: "pairing-draft-1",
            periodCode: "Apr 2026",
            draftVersion: 1,
            propertyGroupKey: "pairing-property-key-new",
            rowSeq: 1,
          });
        }),
    );

    renderSharedWorkbench();

    await user.click(await screen.findByRole("button", { name: "Add pairing bid for 2026-04-04" }));

    const popover = await screen.findByTestId("schedule-action-popover");

    await user.click(await within(popover).findByRole("checkbox", { name: /M4959/ }));
    await user.click(within(popover).getByRole("checkbox", { name: "T2" }));
    await user.click(within(popover).getByRole("button", { name: "ADD BID" }));

    expect(within(popover).getByRole("button", { name: "ADDING..." })).toBeDisabled();
    expect(within(popover).getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(within(popover).getByRole("button", { name: "Clear" })).toBeDisabled();
    expect(within(popover).getByRole("checkbox", { name: /M4959/ })).toBeDisabled();
    expect(within(popover).getByRole("checkbox", { name: "T1" })).toBeDisabled();
    expect(within(popover).getByRole("searchbox", { name: "Search pairing numbers" })).toBeDisabled();

    if (!pendingSave.resolve) {
      throw new Error("Expected pairing calendar add save to be pending.");
    }

    pendingSave.resolve();

    expect(await screen.findByText("Pairing bid added.")).toBeInTheDocument();
  });

  it("shows an error message when pairing calendar add fails", async () => {
    const user = userEvent.setup();

    vi.mocked(pairingService.addCurrentDraftProperty).mockRejectedValueOnce(new Error("add failed"));

    renderSharedWorkbench();

    await user.click(await screen.findByRole("button", { name: "Add pairing bid for 2026-04-04" }));

    const popover = await screen.findByTestId("schedule-action-popover");

    await user.click(await within(popover).findByRole("checkbox", { name: /M4959/ }));
    await user.click(within(popover).getByRole("checkbox", { name: "T2" }));
    await user.click(within(popover).getByRole("button", { name: "ADD BID" }));

    expect(await screen.findAllByText("Unable to add pairing bid.")).not.toHaveLength(0);
    expect(within(popover).getByRole("button", { name: "ADD BID" })).not.toBeDisabled();
  });

  it("edits pairing bid tiers from the shared bidding calendar detail", async () => {
    const user = userEvent.setup();
    const patchSpy = vi.mocked(pairingService.patchCurrentDraftProperty);
    const getPairingDetailsSpy = vi.mocked(pairingService.getPairingDetails);

    renderSharedWorkbench();

    await user.click(await screen.findByRole("button", { name: "View pairing bid M4959" }));

    const dialog = await screen.findByRole("dialog", { name: "Pairing Bid" });
    const overlay = screen.getByTestId("pairing-bid-detail-overlay");
    const portalRoot = screen.getByTestId("scaled-page-dialog-portal-root");

    expect(portalRoot).toContainElement(overlay);
    expect(overlay.className).toContain("justify-center");
    expect(overlay.className).toContain("inset-0");
    expect(overlay.className).not.toContain("justify-start");
    expect(overlay.className).not.toContain("bottom-4");
    expect(within(dialog).getByText("PAIRING")).toBeInTheDocument();
    expect(within(dialog).getByText("ID")).toBeInTheDocument();
    expect(within(dialog).getByText("ORIG")).toBeInTheDocument();
    expect(within(dialog).getByText("START")).toBeInTheDocument();
    expect(within(dialog).getByText("END")).toBeInTheDocument();
    expect(within(dialog).queryByRole("table")).not.toBeInTheDocument();
    expect(within(dialog).getAllByText("M4959").length).toBeGreaterThanOrEqual(2);
    expect(within(dialog).getAllByText("T1").length).toBeGreaterThanOrEqual(1);
    expect(within(dialog).getByText("4959001")).toBeInTheDocument();
    expect(within(dialog).getByText("M4959 #4959001")).toBeInTheDocument();
    expect(within(dialog).getAllByText("20260406").length).toBeGreaterThanOrEqual(2);
    expect(within(dialog).getByText("20260408")).toBeInTheDocument();
    expect(within(dialog).getByText("Specific Date")).toBeInTheDocument();
    expect(await within(dialog).findByText("Base")).toBeInTheDocument();
    expect(within(dialog).getByText("Start")).toBeInTheDocument();
    expect(within(dialog).getByText("Composition")).toBeInTheDocument();
    expect(within(dialog).getByText("CA(1)")).toBeInTheDocument();
    expect(within(dialog).getByText("Total Credit")).toBeInTheDocument();
    expect(within(dialog).getByText("Total BH")).toBeInTheDocument();
    expect(within(dialog).getByText("Total DP")).toBeInTheDocument();
    expect(within(dialog).getByText("9:30")).toBeInTheDocument();
    expect(within(dialog).getAllByText("YVR").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText("-240").length).toBeGreaterThan(0);
    expect(within(dialog).queryByText("REPORT")).not.toBeInTheDocument();
    expect(dialog.className).toContain("!w-[880px]");
    expect(dialog.className).not.toContain("w-[min(1600px,calc(100vw-96px))]");
    expect(dialog).not.toHaveAttribute("style");
    expect(within(dialog).getByText("QUAL")).toBeInTheDocument();
    expect(within(dialog).getByText("ALN")).toBeInTheDocument();
    expect(within(dialog).getByText("Flight")).toBeInTheDocument();
    expect(within(dialog).getByText("Fleet")).toBeInTheDocument();
    expect(within(dialog).getByText("ACC")).toBeInTheDocument();
    expect(within(dialog).getByText("Ref")).toBeInTheDocument();
    expect(within(dialog).getByText("DEP")).toBeInTheDocument();
    expect(within(dialog).getByText("PCK")).toBeInTheDocument();
    expect(within(dialog).getByText("RPT")).toBeInTheDocument();
    expect(within(dialog).getByText("STD")).toBeInTheDocument();
    expect(within(dialog).getByText("ATD")).toBeInTheDocument();
    expect(within(dialog).getByText("ARR")).toBeInTheDocument();
    expect(within(dialog).getByText("STA")).toBeInTheDocument();
    expect(within(dialog).getByText("ATA")).toBeInTheDocument();
    expect(within(dialog).getByText("DRP")).toBeInTheDocument();
    expect(within(dialog).getByText("GT")).toBeInTheDocument();
    expect(within(dialog).getByText("BH")).toBeInTheDocument();
    expect(within(dialog).getByText("FT")).toBeInTheDocument();
    expect(within(dialog).getByText("MRT")).toBeInTheDocument();
    expect(within(dialog).getByText("Duty")).toBeInTheDocument();
    expect(within(dialog).queryByText("Day")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Credit")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("DAY")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("FDP")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("F/H")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("D/H")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("CRD")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("FLTN")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("DPS")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("ARS")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("BLKT")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("EQP")).not.toBeInTheDocument();
    expect(within(dialog).getByText("2810")).toBeInTheDocument();
    expect(within(dialog).getAllByText("F8").length).toBeGreaterThan(0);
    expect(within(dialog).getByText("06:15")).toBeInTheDocument();
    expect(within(dialog).getByText("07:35")).toBeInTheDocument();
    expect(within(dialog).getAllByText("5:31").length).toBeGreaterThanOrEqual(2);
    expect(within(dialog).getByText("LO 1 · FDP 8:30")).toBeInTheDocument();
    expect(within(dialog).getAllByText("CUN").length).toBeGreaterThan(0);
    expect(within(dialog).queryByText("TBLK")).not.toBeInTheDocument();
    expect(within(dialog).getByText("12:14")).toBeInTheDocument();
    await waitFor(() => {
      expect(getPairingDetailsSpy).toHaveBeenCalledWith(
        {
          rosterPeriodId: 42,
          periodCode: "Apr 2026",
        },
        [
          {
            pairingId: "4959001",
            originDate: "2026-04-06",
          },
        ],
      );
    });
    expect(await within(dialog).findByRole("checkbox", { name: "T1" })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: "T2" })).toBeChecked();

    await user.click(within(dialog).getByRole("checkbox", { name: "T2" }));
    await user.click(within(dialog).getByRole("button", { name: "SAVE BID" }));

    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledTimes(1);
    });

    expect(patchSpy.mock.calls[0]?.[0]).toBe("group-102");
    expect(patchSpy.mock.calls[0]?.[1].tiers.filter((tier) => tier.active).map((tier) => tier.label)).toEqual(["T1"]);
    expect(patchSpy.mock.calls[0]?.[2]).toEqual(expect.objectContaining({
      draftKey: "pairing-draft-1",
      periodCode: "Apr 2026",
    }));

    expect(screen.queryByRole("dialog", { name: "Pairing Bid" })).not.toBeInTheDocument();
    expect(await screen.findByText("Pairing bid updated.")).toBeInTheDocument();
  });

  it("requires selecting one combined pairing bid row before editing tiers", async () => {
    const user = userEvent.setup();
    const patchSpy = vi.mocked(pairingService.patchCurrentDraftProperty);

    vi.mocked(pairingService.getPairingDetails).mockResolvedValueOnce({ results: [] });
    vi.mocked(biddingCalendarService.getCurrentCalendar).mockResolvedValueOnce({
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
      events: [
        {
          id: "pairing-bid-combined-c4101-c4102",
          type: "pairing_bid",
          tier: "T1",
          label: "C4101 +1",
          startDate: "2026-04-13",
          endDate: "2026-04-14",
          tone: "blue",
          source: "pbs_bid_group",
          readonly: true,
          metadata: {
            propertyGroupKey: "group-a",
            propertyGroupKeys: "group-a,group-b",
            pairingNumber: "C4101",
            pairingNumbers: "C4101,C4102",
            pairingId: "410101",
            pairingIds: "410101,410201",
            originDate: "2026-04-13",
            originDates: "2026-04-13,2026-04-14",
            pairingDateRanges: "C4101:2026-04-13 - 2026-04-14; C4102:2026-04-14",
            pairingBidEntries: "group-a|C4101|410101|2026-04-13|2026-04-13|2026-04-14; group-b|C4102|410201|2026-04-14|2026-04-14|2026-04-14",
            occurrenceMode: "specific_date",
          },
        },
      ],
    });
    vi.mocked(pairingService.getPageData).mockResolvedValueOnce({
      rightPanel: {
        draftMeta: {
          draftKey: "pairing-draft-1",
          periodCode: "Apr 2026",
          draftVersion: 0,
          bidContext: "Current",
          remarks: "",
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
        },
        existingTitle: "EXISTING PAIRING PROPERTIES",
        addSectionTitle: "ADD PAIRING PROPERTIES",
        allPropertiesLabel: "ALL PROPERTIES",
        favoritedPropertiesLabel: "FAVORITED PROPERTIES",
        searchPlaceholder: "Search Properties",
        searchButtonLabel: "SEARCH PAIRINGS",
        existingProperties: [
          {
            id: "group-a",
            propertyCode: 102,
            name: "Pairing Number",
            action: "award",
            quantifier: null,
            bid: {
              type: "tag-list-date",
              values: ["C4101"],
              date: "2026-04-13",
            },
            tiers: buildPairingTierOptionsForTest(["T1"]),
            priorityOptions: [],
            pairingNumber: "",
            pairingType: "",
            effectiveDateRange: {
              from: "",
              to: "",
            },
          },
          {
            id: "group-b",
            propertyCode: 102,
            name: "Pairing Number",
            action: "award",
            quantifier: null,
            bid: {
              type: "tag-list-date",
              values: ["C4102"],
              date: "2026-04-14",
            },
            tiers: buildPairingTierOptionsForTest(["T2"]),
            priorityOptions: [],
            pairingNumber: "",
            pairingType: "",
            effectiveDateRange: {
              from: "",
              to: "",
            },
          },
        ],
        availableProperties: [],
        initialSearchForm: {
          pairingNumber: "",
          pairingType: "",
          dateFrom: "",
          dateTo: "",
        },
      },
    });

    renderSharedWorkbench();

    await user.click(await screen.findByRole("button", { name: "View pairing bid C4101 +1" }));

    const dialog = await screen.findByRole("dialog", { name: "Pairing Bid" });

    expect(within(dialog).getByText("C4101 +1")).toBeInTheDocument();
    expect(within(dialog).getByText("EDIT")).toBeInTheDocument();
    expect(await within(dialog).findByText("Select one pairing bid to edit Tx.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "SAVE BID" })).toBeDisabled();
    expect(within(dialog).getByRole("checkbox", { name: "T1" })).toBeDisabled();

    await user.click(within(dialog).getByRole("radio", { name: "Select C4102 20260414 for Tx editing" }));

    await waitFor(() => {
      expect(within(dialog).getByRole("checkbox", { name: "T2" })).toBeChecked();
    });
    expect(within(dialog).getByRole("checkbox", { name: "T1" })).not.toBeChecked();
    expect(within(dialog).getByRole("button", { name: "SAVE BID" })).not.toBeDisabled();

    await user.click(within(dialog).getByRole("checkbox", { name: "T3" }));
    await user.click(within(dialog).getByRole("button", { name: "SAVE BID" }));

    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledTimes(1);
    });

    expect(patchSpy.mock.calls[0]?.[0]).toBe("group-b");
    expect(patchSpy.mock.calls[0]?.[1].tiers.filter((tier) => tier.active).map((tier) => tier.label)).toEqual(["T2", "T3"]);
  });

  it("refetches pairing draft once when the selected calendar bid is missing from cache", async () => {
    const user = userEvent.setup();
    const getPageDataSpy = vi.mocked(pairingService.getPageData);

    getPageDataSpy
      .mockResolvedValueOnce({
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
      })
      .mockResolvedValueOnce({
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
          existingProperties: [
            {
              id: "group-102",
              propertyCode: 102,
              name: "Pairing Number",
              action: "award",
              quantifier: null,
              bid: {
                type: "tag-list-date",
                values: ["4959001"],
                date: "2026-04-06",
              },
              tiers: buildPairingTierOptionsForTest(["T1"]),
              priorityOptions: [],
              pairingNumber: "",
              pairingType: "",
              effectiveDateRange: {
                from: "",
                to: "",
              },
            },
          ],
          availableProperties: [],
          initialSearchForm: {
            pairingNumber: "",
            pairingType: "",
            dateFrom: "",
            dateTo: "",
          },
        },
      });

    renderSharedWorkbench();

    await user.click(await screen.findByRole("button", { name: "View pairing bid M4959" }));

    const dialog = await screen.findByRole("dialog", { name: "Pairing Bid" });

    await waitFor(() => {
      expect(getPageDataSpy).toHaveBeenCalledTimes(2);
    });
    expect(await within(dialog).findByRole("checkbox", { name: "T1" })).toBeChecked();
    expect(within(dialog).getByRole("button", { name: "SAVE BID" })).not.toBeDisabled();
    expect(within(dialog).queryByText("Unable to find this pairing bid in the current draft.")).not.toBeInTheDocument();
  });

  it("shows draft load failure instead of not-found when pairing draft tiers fail to load", async () => {
    const user = userEvent.setup();

    vi.mocked(pairingService.getPageData).mockRejectedValueOnce(new Error("draft failed"));

    renderSharedWorkbench();

    await user.click(await screen.findByRole("button", { name: "View pairing bid M4959" }));

    const dialog = await screen.findByRole("dialog", { name: "Pairing Bid" });

    expect(await within(dialog).findByText("Unable to load pairing bid tiers.")).toBeInTheDocument();
    expect(within(dialog).queryByText("Unable to find this pairing bid in the current draft.")).not.toBeInTheDocument();
  });

  it("removes the pairing bid when all tiers are cleared from the calendar detail", async () => {
    const user = userEvent.setup();
    const patchSpy = vi.mocked(pairingService.patchCurrentDraftProperty);

    renderSharedWorkbench();

    await user.click(await screen.findByRole("button", { name: "View pairing bid M4959" }));

    const dialog = await screen.findByRole("dialog", { name: "Pairing Bid" });

    await within(dialog).findByRole("checkbox", { name: "T1" });
    await user.click(within(dialog).getByRole("button", { name: "Clear" }));
    await user.click(within(dialog).getByRole("button", { name: "SAVE BID" }));

    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith(
        "group-102",
        expect.objectContaining({
          tiers: expect.arrayContaining([
            expect.objectContaining({ label: "T1", active: false }),
            expect.objectContaining({ label: "T2", active: false }),
          ]),
        }),
        expect.objectContaining({
          draftKey: "pairing-draft-1",
          periodCode: "Apr 2026",
        }),
      );
    });
    expect(await screen.findByText("Pairing bid updated.")).toBeInTheDocument();
  });

  it("keeps pairing calendar detail controls disabled until the save completes", async () => {
    const user = userEvent.setup();
    const pendingSave = {
      resolve: null as (() => void) | null,
    };

    vi.mocked(pairingService.patchCurrentDraftProperty).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          pendingSave.resolve = () => resolve({
            saved: true,
            draftKey: "pairing-draft-1",
            periodCode: "Apr 2026",
            draftVersion: 1,
            propertyGroupKey: "group-102",
            deleted: false,
            tiers: ["T1"],
          });
        }),
    );

    renderSharedWorkbench();

    await user.click(await screen.findByRole("button", { name: "View pairing bid M4959" }));

    const dialog = await screen.findByRole("dialog", { name: "Pairing Bid" });

    await user.click(await within(dialog).findByRole("checkbox", { name: "T2" }));
    await user.click(within(dialog).getByRole("button", { name: "SAVE BID" }));

    expect(within(dialog).getByRole("button", { name: "SAVING..." })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Close" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Clear" })).toBeDisabled();
    expect(within(dialog).getByRole("checkbox", { name: "T1" })).toBeDisabled();

    if (!pendingSave.resolve) {
      throw new Error("Expected pairing calendar detail save to be pending.");
    }

    pendingSave.resolve();

    expect(await screen.findByText("Pairing bid updated.")).toBeInTheDocument();
  });

  it("shows an error message when pairing calendar detail save fails", async () => {
    const user = userEvent.setup();

    vi.mocked(pairingService.patchCurrentDraftProperty).mockRejectedValueOnce(new Error("save failed"));

    renderSharedWorkbench();

    await user.click(await screen.findByRole("button", { name: "View pairing bid M4959" }));

    const dialog = await screen.findByRole("dialog", { name: "Pairing Bid" });

    await user.click(await within(dialog).findByRole("checkbox", { name: "T2" }));
    await user.click(within(dialog).getByRole("button", { name: "SAVE BID" }));

    expect(await screen.findAllByText("Unable to save pairing bid.")).not.toHaveLength(0);
    expect(screen.getByRole("dialog", { name: "Pairing Bid" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "SAVE BID" })).not.toBeDisabled();
  });

  it("confirms calendar day off edits on the days off route before saving", async () => {
    const user = userEvent.setup();
    const initialMutationCallCount = getDaysOffCalendarMutationCallCount();

    renderSharedWorkbench("/days-off");

    await user.click(await screen.findByRole("button", { name: "TIER-01" }));
    expect(screen.getByRole("button", { name: "TIER-01" })).toHaveAttribute("aria-pressed", "true");

    const dateButton = await screen.findByRole("button", { name: "Toggle day off for 2026-04-05" });
    expect(dateButton).toHaveAttribute("aria-pressed", "true");

    await user.click(dateButton);
    expect(await screen.findByRole("button", { name: "SAVE BID" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "DAYS OFF" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "PAIRING" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "DELETE BID" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "T1" }));
    await user.click(screen.getByRole("button", { name: "SAVE BID" }));

    await waitFor(() => {
      expect(getDaysOffCalendarMutationCallCount()).toBeGreaterThan(initialMutationCallCount);
    });

    expect(getLastPatchedCalendarDraft()).toEqual({
      periodCode: "Apr 2026",
      draftVersion: 0,
      bidContext: "Current",
      tiers: [],
    });
    expect(dateButton).toHaveAttribute("aria-pressed", "false");
  });

  it("dismisses the day off calendar popover before allowing another date action", async () => {
    const user = userEvent.setup();
    const initialMutationCallCount = getDaysOffCalendarMutationCallCount();

    renderSharedWorkbench("/days-off");

    await user.click(await screen.findByRole("button", { name: "Toggle day off for 2026-04-05" }));

    expect(await screen.findByTestId("schedule-action-popover")).toBeInTheDocument();
    expect(screen.getByText("2026-04-05")).toBeInTheDocument();

    await user.click(screen.getByTestId("schedule-action-popover-dismiss"));

    await waitFor(() => {
      expect(screen.queryByTestId("schedule-action-popover")).not.toBeInTheDocument();
    });
    expect(getDaysOffCalendarMutationCallCount()).toBe(initialMutationCallCount);

    await user.click(screen.getByRole("button", { name: "Toggle day off for 2026-04-06" }));

    expect(await screen.findByTestId("schedule-action-popover")).toBeInTheDocument();
    expect(screen.getByText("2026-04-06")).toBeInTheDocument();
    expect(getDaysOffCalendarMutationCallCount()).toBe(initialMutationCallCount);
  });

  it("shows an error message when a calendar day off save fails", async () => {
    const user = userEvent.setup();

    vi.mocked(daysOffService.patchCurrentDraftProperty).mockRejectedValueOnce(new Error("save failed"));
    vi.mocked(daysOffService.removeCurrentDraftProperty).mockRejectedValueOnce(new Error("save failed"));

    renderSharedWorkbench("/days-off");

    const dateButton = await screen.findByRole("button", { name: "Toggle day off for 2026-04-05" });

    await user.click(dateButton);
    await user.click(screen.getByRole("checkbox", { name: "T1" }));
    await user.click(screen.getByRole("button", { name: "SAVE BID" }));

    expect(await screen.findAllByText("Unable to save days off calendar bid.")).not.toHaveLength(0);
    expect(
      document.querySelector('[data-uiid="dashboard-schedule-panel"] [role="alert"]'),
    ).not.toBeInTheDocument();
  });

  it("patches each confirmed calendar date change without full-draft debounce", async () => {
    const user = userEvent.setup();
    const initialMutationCallCount = getDaysOffCalendarMutationCallCount();

    renderSharedWorkbench("/days-off");

    await user.click(await screen.findByRole("button", { name: "Toggle day off for 2026-04-06" }));
    expect(await screen.findByRole("checkbox", { name: "T2" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "SAVE BID" })).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: "T2" }));
    await user.click(screen.getByRole("button", { name: "SAVE BID" }));

    expect(getDaysOffCalendarMutationCallCount()).toBeGreaterThan(initialMutationCallCount);
    expect(getLastPatchedCalendarDraft()).toEqual({
      periodCode: "Apr 2026",
      draftVersion: 0,
      bidContext: "Current",
      tiers: [
        {
          tier: "T1",
          dates: ["2026-04-05"],
        },
        {
          tier: "T2",
          dates: ["2026-04-06"],
        },
      ],
    });
  });

  it("updates the days off calendar cache without refetching the days off page data after save", async () => {
    const user = userEvent.setup();
    const getPageDataSpy = vi.mocked(daysOffService.getPageData);
    const initialMutationCallCount = getDaysOffCalendarMutationCallCount();

    renderSharedWorkbench("/days-off");

    await screen.findByText("APR 2026 · 2026-04-01 – 2026-04-30");
    getPageDataSpy.mockClear();

    await user.click(await screen.findByRole("button", { name: "Toggle day off for 2026-04-06" }));
    await user.click(screen.getByRole("checkbox", { name: "T2" }));
    await user.click(screen.getByRole("button", { name: "SAVE BID" }));

    await waitFor(() => {
      expect(getDaysOffCalendarMutationCallCount()).toBeGreaterThan(initialMutationCallCount);
    }, { timeout: 1500 });

    expect(getPageDataSpy).not.toHaveBeenCalled();
    expect(getLastPatchedCalendarDraft().tiers).toEqual(
      expect.arrayContaining([
        {
          tier: "T2",
          dates: ["2026-04-06"],
        },
      ]),
    );
  });

  it("uses newer days off page data when a property edit supersedes the local calendar draft", async () => {
    const user = userEvent.setup();
    const initialMutationCallCount = getDaysOffCalendarMutationCallCount();

    renderSharedWorkbench("/days-off");

    await user.click(await screen.findByRole("button", { name: "Toggle day off for 2026-04-06" }));
    for (const tier of ["T2", "T3", "T4", "T5", "T6", "T7"]) {
      await user.click(screen.getByRole("checkbox", { name: tier }));
    }
    await user.click(screen.getByRole("button", { name: "SAVE BID" }));

    await waitFor(() => {
      expect(getDaysOffCalendarMutationCallCount()).toBeGreaterThan(initialMutationCallCount);
    }, { timeout: 1500 });

    await waitFor(() => {
      expect(screen.getByLabelText("TIER-07 day 06").className).toContain("bg-[#3DC0A9]");
    });

    act(() => {
      setDaysOffPageDataForTest(buildDaysOffPageDataForTest({
        periodCode: "Apr 2026",
        draftVersion: 2,
        bidContext: "Current",
        tiers: [
          {
            tier: "T1",
            dates: ["2026-04-05"],
          },
          {
            tier: "T2",
            dates: ["2026-04-06"],
          },
          {
            tier: "T3",
            dates: ["2026-04-06"],
          },
          {
            tier: "T4",
            dates: ["2026-04-06"],
          },
          {
            tier: "T5",
            dates: ["2026-04-06"],
          },
          {
            tier: "T6",
            dates: ["2026-04-06"],
          },
        ],
      }));
    });

    await waitFor(() => {
      expect(screen.getByLabelText("TIER-06 day 06").className).toContain("bg-[#3DC0A9]");
      expect(screen.getByLabelText("TIER-07 day 06").className).toContain("bg-[#F8F9FB]");
    });
  });

  it("clears all tier selections before saving a day off calendar action", async () => {
    const user = userEvent.setup();
    const initialMutationCallCount = getDaysOffCalendarMutationCallCount();

    renderSharedWorkbench("/days-off");

    await user.click(await screen.findByRole("button", { name: "Toggle day off for 2026-04-05" }));

    expect(await screen.findByRole("checkbox", { name: "T1" })).toBeChecked();

    await user.click(screen.getByRole("button", { name: "Clear" }));

    for (const tier of ["T1", "T2", "T3", "T4", "T5", "T6", "T7"]) {
      expect(screen.getByRole("checkbox", { name: tier })).not.toBeChecked();
    }

    expect(getDaysOffCalendarMutationCallCount()).toBe(initialMutationCallCount);

    await user.click(screen.getByRole("button", { name: "SAVE BID" }));

    await waitFor(() => {
      expect(getDaysOffCalendarMutationCallCount()).toBeGreaterThan(initialMutationCallCount);
    }, { timeout: 1500 });

    expect(getLastPatchedCalendarDraft()).toEqual({
      periodCode: "Apr 2026",
      draftVersion: 0,
      bidContext: "Current",
      tiers: [],
    });
  });

  it("adds all matching weekdays from the days off calendar header", async () => {
    const user = userEvent.setup();
    const initialMutationCallCount = getDaysOffCalendarMutationCallCount();

    renderSharedWorkbench("/days-off");

    await user.click(await screen.findByRole("button", { name: "Add day off bids for SAT" }));
    expect(await screen.findByRole("checkbox", { name: "T1" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "SAVE BID" })).toBeDisabled();

    for (const tier of ["T1", "T2", "T3", "T4", "T5", "T6", "T7"]) {
      await user.click(screen.getByRole("checkbox", { name: tier }));
    }
    await user.click(await screen.findByRole("button", { name: "SAVE BID" }));

    await waitFor(() => {
      expect(getDaysOffCalendarMutationCallCount()).toBeGreaterThan(initialMutationCallCount);
    }, { timeout: 1500 });

    expect(getLastPatchedCalendarDraft()).toEqual({
      periodCode: "Apr 2026",
      draftVersion: 0,
      bidContext: "Current",
      tiers: [
        {
          tier: "T1",
          dates: ["2026-04-04", "2026-04-05", "2026-04-11", "2026-04-18", "2026-04-25"],
        },
        {
          tier: "T2",
          dates: ["2026-04-04", "2026-04-11", "2026-04-18", "2026-04-25"],
        },
        {
          tier: "T3",
          dates: ["2026-04-04", "2026-04-11", "2026-04-18", "2026-04-25"],
        },
        {
          tier: "T4",
          dates: ["2026-04-04", "2026-04-11", "2026-04-18", "2026-04-25"],
        },
        {
          tier: "T5",
          dates: ["2026-04-04", "2026-04-11", "2026-04-18", "2026-04-25"],
        },
        {
          tier: "T6",
          dates: ["2026-04-04", "2026-04-11", "2026-04-18", "2026-04-25"],
        },
        {
          tier: "T7",
          dates: ["2026-04-04", "2026-04-11", "2026-04-18", "2026-04-25"],
        },
      ],
    });
  });

  it("skips pairing-covered tier dates when adding days off from a weekday header", async () => {
    const user = userEvent.setup();
    const initialMutationCallCount = getDaysOffCalendarMutationCallCount();

    renderSharedWorkbench("/days-off");

    await user.click(await screen.findByRole("button", { name: "Add day off bids for MON" }));
    for (const tier of ["T1", "T2", "T3", "T4", "T5", "T6", "T7"]) {
      await user.click(screen.getByRole("checkbox", { name: tier }));
    }
    await user.click(await screen.findByRole("button", { name: "SAVE BID" }));

    await waitFor(() => {
      expect(getDaysOffCalendarMutationCallCount()).toBeGreaterThan(initialMutationCallCount);
    }, { timeout: 1500 });

    expect(getLastPatchedCalendarDraft()).toEqual({
      periodCode: "Apr 2026",
      draftVersion: 0,
      bidContext: "Current",
      tiers: [
        {
          tier: "T1",
          dates: ["2026-04-05", "2026-04-13", "2026-04-20", "2026-04-27"],
        },
        {
          tier: "T2",
          dates: ["2026-04-06", "2026-04-13", "2026-04-20", "2026-04-27"],
        },
        {
          tier: "T3",
          dates: ["2026-04-06", "2026-04-13", "2026-04-20", "2026-04-27"],
        },
        {
          tier: "T4",
          dates: ["2026-04-06", "2026-04-13", "2026-04-20", "2026-04-27"],
        },
        {
          tier: "T5",
          dates: ["2026-04-06", "2026-04-13", "2026-04-20", "2026-04-27"],
        },
        {
          tier: "T6",
          dates: ["2026-04-06", "2026-04-13", "2026-04-20", "2026-04-27"],
        },
        {
          tier: "T7",
          dates: ["2026-04-06", "2026-04-13", "2026-04-20", "2026-04-27"],
        },
      ],
    });
    expect(await screen.findByText("1 tier/date entry is blocked by a pairing bid.")).toBeInTheDocument();
  });

  it("keeps weekday tiers selectable while only skipping blocked tier dates", async () => {
    const user = userEvent.setup();
    const initialMutationCallCount = getDaysOffCalendarMutationCallCount();

    vi.mocked(biddingCalendarService.getCurrentCalendar).mockResolvedValueOnce({
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
      events: [
        {
          id: "pairing-bid-t2-2026-04-09",
          type: "pairing_bid",
          tier: "T2",
          label: "C4101",
          startDate: "2026-04-09",
          endDate: "2026-04-09",
          tone: "blue",
          source: "pbs_bid_group",
          readonly: true,
        },
        {
          id: "pairing-bid-t3-2026-04-09",
          type: "pairing_bid",
          tier: "T3",
          label: "C4101",
          startDate: "2026-04-09",
          endDate: "2026-04-09",
          tone: "blue",
          source: "pbs_bid_group",
          readonly: true,
        },
      ],
    });
    setDaysOffPageDataForTest(buildDaysOffPageDataForTest({
        periodCode: "Apr 2026",
        draftVersion: 0,
        bidContext: "Current",
        tiers: [
          {
            tier: "T2",
            dates: ["2026-04-16"],
          },
        ],
    }));

    renderSharedWorkbench("/days-off");

    await user.click(await screen.findByRole("button", { name: "TIER-02" }));
    await user.click(await screen.findByRole("button", { name: "Add day off bids for THU" }));

    expect(await screen.findByRole("checkbox", { name: "T1" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "T2" })).toBeChecked();
    for (const tier of ["T3", "T4", "T5", "T6", "T7"]) {
      const checkbox = screen.getByRole("checkbox", { name: tier });

      expect(checkbox).not.toBeChecked();
      expect(checkbox).not.toBeDisabled();
    }

    for (const tier of ["T3", "T4", "T5", "T6", "T7"]) {
      await user.click(screen.getByRole("checkbox", { name: tier }));
    }
    expect(await screen.findByText("2 tier/date entries are blocked by pairing bids.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "SAVE BID" }));

    await waitFor(() => {
      expect(getDaysOffCalendarMutationCallCount()).toBeGreaterThan(initialMutationCallCount);
    }, { timeout: 1500 });

    expect(getLastCalendarPatchChanges()).not.toContainEqual({
      date: "2026-04-09",
      tier: "T2",
      selected: true,
    });
    expect(getLastCalendarPatchChanges()).not.toContainEqual({
      date: "2026-04-09",
      tier: "T3",
      selected: true,
    });
    expect(getLastCalendarPatchChanges()).toContainEqual({
      date: "2026-04-09",
      tier: "T4",
      selected: true,
    });
    expect(getLastPatchedCalendarDraft()).toEqual({
      periodCode: "Apr 2026",
      draftVersion: 0,
      bidContext: "Current",
      tiers: [
        {
          tier: "T2",
          dates: ["2026-04-02", "2026-04-16", "2026-04-23", "2026-04-30"],
        },
        {
          tier: "T3",
          dates: ["2026-04-02", "2026-04-16", "2026-04-23", "2026-04-30"],
        },
        {
          tier: "T4",
          dates: ["2026-04-02", "2026-04-09", "2026-04-16", "2026-04-23", "2026-04-30"],
        },
        {
          tier: "T5",
          dates: ["2026-04-02", "2026-04-09", "2026-04-16", "2026-04-23", "2026-04-30"],
        },
        {
          tier: "T6",
          dates: ["2026-04-02", "2026-04-09", "2026-04-16", "2026-04-23", "2026-04-30"],
        },
        {
          tier: "T7",
          dates: ["2026-04-02", "2026-04-09", "2026-04-16", "2026-04-23", "2026-04-30"],
        },
      ],
    });
  });

  it("removes existing weekday days off when a selected tier is unchecked", async () => {
    const user = userEvent.setup();
    const initialMutationCallCount = getDaysOffCalendarMutationCallCount();

    setDaysOffPageDataForTest(buildDaysOffPageDataForTest({
        periodCode: "Apr 2026",
        draftVersion: 0,
        bidContext: "Current",
        tiers: [
          {
            tier: "T2",
            dates: ["2026-04-02", "2026-04-16"],
          },
        ],
    }));

    renderSharedWorkbench("/days-off");

    await user.click(await screen.findByRole("button", { name: "TIER-02" }));
    await user.click(await screen.findByRole("button", { name: "Add day off bids for THU" }));
    await user.click(await screen.findByRole("checkbox", { name: "T2" }));
    await user.click(screen.getByRole("button", { name: "SAVE BID" }));

    await waitFor(() => {
      expect(getDaysOffCalendarMutationCallCount()).toBeGreaterThan(initialMutationCallCount);
    }, { timeout: 1500 });

    expect(getLastCalendarPatchChanges()).toEqual(
      expect.arrayContaining([
        { date: "2026-04-02", tier: "T2", selected: false },
        { date: "2026-04-16", tier: "T2", selected: false },
      ]),
    );
  });

  it("does not default a new day off bid from the active tier", async () => {
    const user = userEvent.setup();
    const initialMutationCallCount = getDaysOffCalendarMutationCallCount();

    renderSharedWorkbench("/days-off");

    await user.click(await screen.findByRole("button", { name: "TIER-03" }));
    await user.click(screen.getByRole("button", { name: "Toggle day off for 2026-04-06" }));

    for (const tier of ["T1", "T2", "T3", "T4", "T5", "T6", "T7"]) {
      expect(await screen.findByRole("checkbox", { name: tier })).not.toBeChecked();
    }
    expect(screen.getByRole("button", { name: "SAVE BID" })).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: "T3" }));
    await user.click(screen.getByRole("checkbox", { name: "T7" }));
    await user.click(screen.getByRole("button", { name: "SAVE BID" }));

    await waitFor(() => {
      expect(getDaysOffCalendarMutationCallCount()).toBeGreaterThan(initialMutationCallCount);
    }, { timeout: 1500 });

    expect(getLastPatchedCalendarDraft()).toEqual({
      periodCode: "Apr 2026",
      draftVersion: 0,
      bidContext: "Current",
      tiers: [
        {
          tier: "T1",
          dates: ["2026-04-05"],
        },
        {
          tier: "T3",
          dates: ["2026-04-06"],
        },
        {
          tier: "T7",
          dates: ["2026-04-06"],
        },
      ],
    });
  });

  it("edits the tier selection for an existing day off bid", async () => {
    const user = userEvent.setup();
    const initialMutationCallCount = getDaysOffCalendarMutationCallCount();

    setDaysOffPageDataForTest(buildDaysOffPageDataForTest({
        periodCode: "Apr 2026",
        draftVersion: 0,
        bidContext: "Current",
        tiers: [
          {
            tier: "T1",
            dates: ["2026-04-05"],
          },
          {
            tier: "T3",
            dates: ["2026-04-05"],
          },
        ],
    }));

    renderSharedWorkbench("/days-off");

    await user.click(await screen.findByRole("button", { name: "Toggle day off for 2026-04-05" }));

    expect(await screen.findByRole("checkbox", { name: "T1" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "T2" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "T3" })).toBeChecked();

    await user.click(screen.getByRole("checkbox", { name: "T3" }));
    await user.click(screen.getByRole("button", { name: "SAVE BID" }));

    await waitFor(() => {
      expect(getDaysOffCalendarMutationCallCount()).toBeGreaterThan(initialMutationCallCount);
    }, { timeout: 1500 });

    expect(getLastPatchedCalendarDraft()).toEqual({
      periodCode: "Apr 2026",
      draftVersion: 0,
      bidContext: "Current",
      tiers: [
        {
          tier: "T1",
          dates: ["2026-04-05"],
        },
      ],
    });
  });

  it("shows a loading state while the shared calendar draft is still pending", () => {
    vi.mocked(biddingCalendarService.getCurrentCalendar).mockImplementationOnce(
      () => new Promise(() => undefined),
    );

    renderSharedWorkbench();

    expect(
      screen.getByRole("status", { name: "Loading bidding calendar..." }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-schedule-panel-loading")).toBeInTheDocument();
  });

  it("loads the shared calendar draft only once in StrictMode", async () => {
    const getCalendarSpy = vi.spyOn(biddingCalendarService, "getCurrentCalendar");

    renderSharedWorkbench("/pairing", true);

    expect(await screen.findByText("APR 2026 · 2026-04-01 – 2026-04-30")).toBeInTheDocument();

    await waitFor(() => {
      expect(getCalendarSpy).toHaveBeenCalledTimes(1);
    });
  });

  it("prefetches the shared workbench queries on layout entry", async () => {
    const prefetchSpy = vi
      .spyOn(queryClient, "prefetchQuery")
      .mockResolvedValue(undefined);

    try {
      renderSharedWorkbench();

      await waitFor(() => {
        expect(prefetchSpy).toHaveBeenCalledWith(
          expect.objectContaining({ queryKey: biddingCalendarQueryKey }),
        );
      });
      expect(prefetchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: dashboardUserProfileQueryKey }),
      );
      expect(prefetchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: tierPageDataQueryKey }),
      );
    } finally {
      prefetchSpy.mockRestore();
    }
  });
});
