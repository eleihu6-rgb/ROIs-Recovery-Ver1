import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AppProviders } from "@/app/providers/app-providers";
import { BidPage } from "@/features/bid/pages/bid-page";
import { daysOffPageData } from "@/features/days-off/mock";
import { linePageData } from "@/features/line/mock";
import { pairingPageData } from "@/features/pairing/mock";
import { setupPairingPageTestMocks } from "@/features/pairing/pages/pairing-page.test-utils";
import { tierPageData } from "@/features/tier/mock";
import type { RuleBidPageData } from "@/features/rule-bids/types";
import { queryClient } from "@/shared/query/query-client";
import { daysOffService } from "@/shared/services/days-off-service";
import { bidFeedbackService } from "@/shared/services/bid-feedback-service";
import { lineService } from "@/shared/services/line-service";
import { pairingService } from "@/shared/services/pairing-service";
import { reserveService } from "@/shared/services/reserve-service";
import { tierService } from "@/shared/services/tier-service";
import { useBiddingCalendarStore } from "@/shared/store/use-bidding-calendar-store";

const renderBidPage = (
  initialEntry: string | { pathname: string; state: { availableTab: string } } = "/bid",
) =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AppProviders>
        <Routes>
          <Route path="/bid" element={<BidPage />} />
          <Route path="/bid/pairing/search" element={<div>Pairing Search</div>} />
        </Routes>
      </AppProviders>
    </MemoryRouter>,
  );

const reservePageData: RuleBidPageData = {
  rightPanel: {
    draftMeta: {
      draftKey: "reserve-draft",
      bidId: 42,
      periodId: 42,
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
    existingTitle: "EXISTING RESERVE PROPERTIES",
    addButtonLabel: "ADD RESERVE PREFERENCE",
    addSectionTitle: "ADD RESERVE PREFERENCE",
    allPropertiesLabel: "ALL RESERVE PROPERTIES",
    favoritedPropertiesLabel: "FAVORITED RESERVE PROPERTIES",
    searchPlaceholder: "Search Reserve Properties",
    existingProperties: [],
    availableProperties: [{
      id: "available-reserve-preference",
      propertyCode: 301,
      name: "Reserve Preference",
      favorited: false,
      bid: {
        type: "reserve-call-type-date-scope",
        callType: "CRAM",
        options: ["CRAM", "CRPM"],
        dateScope: { mode: "whole_month" },
      },
      tiers: [{ key: "t1", label: "T1", active: true }],
    }],
  },
};

describe("BidPage", () => {
  beforeEach(() => {
    queryClient.clear();
    useBiddingCalendarStore.getState().resetActiveTierLabel();
    setupPairingPageTestMocks();
    vi.spyOn(bidFeedbackService, "getCurrentConflicts").mockResolvedValue({
      draftVersion: "1:1:1:1",
      generatedAt: "2026-08-10T00:00:00.000Z",
      conflictCount: 0,
      advisoryCount: 0,
      conflicts: [],
    });
    vi.spyOn(bidFeedbackService, "startEligibilityRun").mockResolvedValue({
      runId: "run-test",
      status: "computing",
      draftVersion: "1:1:1:1",
      eligibilityLabel: "Eligibility unavailable. Rule Engine eligibility checks have not been run for Bid Feedback.",
    });
    vi.spyOn(bidFeedbackService, "openEligibilityWs").mockImplementation((_runId, handlers) => {
      handlers.onDone();
      return () => {};
    });
    vi.spyOn(bidFeedbackService, "getEligibilityRun").mockResolvedValue({
      runId: "run-test",
      status: "done",
      eligibilityLabel: "Eligibility unavailable. Rule Engine eligibility checks have not been run for Bid Feedback.",
      pairings: [],
    });
    vi.spyOn(daysOffService, "getPageData").mockResolvedValue(structuredClone(daysOffPageData));
    vi.spyOn(lineService, "getPageData").mockResolvedValue(structuredClone(linePageData));
    vi.spyOn(reserveService, "getPageData").mockResolvedValue(structuredClone(reservePageData));
    vi.spyOn(reserveService, "addCurrentDraftProperty").mockImplementation(async (property, draftMeta) => ({
      saved: true,
      draftKey: draftMeta.draftKey,
      bidId: draftMeta.bidId,
      periodId: draftMeta.periodId,
      periodCode: draftMeta.periodCode,
      draftVersion: draftMeta.draftVersion + 1,
      propertyGroupKey: `reserve-${property.id}`,
      rowSeq: 1,
    }));
    vi.spyOn(reserveService, "patchCurrentDraftProperty").mockImplementation(async (propertyGroupKey, property, draftMeta) => ({
      saved: true,
      draftKey: draftMeta.draftKey,
      bidId: draftMeta.bidId,
      periodId: draftMeta.periodId,
      periodCode: draftMeta.periodCode,
      draftVersion: draftMeta.draftVersion + 1,
      propertyGroupKey,
      tiers: property.tiers.filter((tier) => tier.active).map((tier) => tier.label),
    }));
    vi.spyOn(reserveService, "removeCurrentDraftProperty").mockImplementation(async (_propertyGroupKey, draftMeta) => ({
      saved: true,
      draftKey: draftMeta.draftKey,
      bidId: draftMeta.bidId,
      periodId: draftMeta.periodId,
      periodCode: draftMeta.periodCode,
      draftVersion: draftMeta.draftVersion + 1,
    }));
    vi.spyOn(tierService, "getPageData").mockResolvedValue(structuredClone(tierPageData));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    useBiddingCalendarStore.getState().resetActiveTierLabel();
  });

  it("defaults to Favorites and exposes only the three category tabs beside it", async () => {
    renderBidPage();

    const page = await screen.findByTestId("bid-page");
    const tabs = within(page).getAllByRole("tab");

    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "FAVORITED PROPERTIES",
      "DAYS OFF",
      "PAIRING",
      "ROSTER",
    ]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(within(page).queryByText("ALL PROPERTIES")).not.toBeInTheDocument();
  });

  it("labels Line favorites as Roster without changing the property name", async () => {
    const lineDataWithFavorite = structuredClone(linePageData);
    lineDataWithFavorite.rightPanel.availableProperties = [{
      id: "line-favorite-max-credit",
      favoriteKey: "line-favorite-max-credit",
      propertyCode: 401,
      name: "Max Credit Window",
      source: "favorite",
      favorited: true,
      bid: { type: "flag" },
      tiers: [],
    }];
    vi.mocked(lineService.getPageData).mockResolvedValue(lineDataWithFavorite);

    renderBidPage();

    const page = await screen.findByTestId("bid-page");
    expect(within(page).getByRole("heading", { name: "Roster" })).toBeInTheDocument();
    expect(within(page).getByText("Max Credit Window")).toBeInTheDocument();
  });

  it("adds Current Reserve Preference from the Roster tab using the reserve draft", async () => {
    const user = userEvent.setup();
    const addSpy = vi.spyOn(reserveService, "addCurrentDraftProperty");

    renderBidPage();

    const page = await screen.findByTestId("bid-page");
    await user.click(within(page).getByRole("tab", { name: "ROSTER" }));
    await user.click(within(page).getByRole("button", { name: "Add Reserve Preference" }));

    expect(await screen.findByRole("dialog", { name: "Configure Reserve Preference" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Reserve Preference short-call type" })).toHaveTextContent("CRAM");
    expect(screen.getByRole("combobox", { name: "Reserve Preference short-call type" })).toHaveTextContent("CRPM");
    expect(screen.getByRole("combobox", { name: "Reserve Preference short-call type" })).not.toHaveTextContent("PRAM");
    await user.selectOptions(screen.getByRole("combobox", { name: "Reserve Preference short-call type" }), "CRPM");
    await user.selectOptions(screen.getByRole("combobox", { name: "Reserve Preference date scope" }), "first_half");
    await user.click(screen.getByRole("button", { name: "Toggle T2 for Reserve Preference" }));
    await user.click(screen.getByRole("button", { name: "ADD BID" }));

    await waitFor(() => expect(addSpy).toHaveBeenCalled());
    expect(addSpy.mock.calls[0]?.[0]).toMatchObject({
      propertyCode: 301,
      name: "Reserve Preference",
      bid: {
        type: "reserve-call-type-date-scope",
        callType: "CRPM",
        dateScope: { mode: "first_half" },
      },
    });
    expect(addSpy.mock.calls[0]?.[0].tiers.filter((tier) => tier.active).map((tier) => tier.label)).toEqual(["T2"]);
    expect(addSpy.mock.calls[0]?.[1].draftKey).toBe("reserve-draft");
  });

  it("shows saved Reserve Preference in Existing Bid as a Roster item and opens the reserve editor", async () => {
    const user = userEvent.setup();
    const reserveDataWithExisting = structuredClone(reservePageData);
    reserveDataWithExisting.rightPanel.existingProperties = [{
      id: "reserve-existing-1",
      propertyCode: 301,
      name: "Reserve Preference",
      action: "award",
      bid: {
        type: "reserve-call-type-date-scope",
        callType: "CRPM",
        options: ["CRAM", "CRPM"],
        dateScope: { mode: "first_half" },
      },
      tiers: [{ key: "t1", label: "T1", active: true }],
    }];
    vi.mocked(reserveService.getPageData).mockResolvedValue(reserveDataWithExisting);

    renderBidPage();

    const page = await screen.findByTestId("bid-page");
    const existingRegion = within(page).getByTestId("bid-existing-properties-scroll");
    const reserveRow = within(existingRegion)
      .getByRole("button", { name: /Open detail for Award CRPM short call for the first half/ })
      .closest<HTMLElement>('[data-testid="tier-summary-row"]');

    expect(reserveRow).not.toBeNull();
    expect(within(reserveRow!).getByText("Roster")).toBeInTheDocument();
    expect(within(reserveRow!).getByText("Award CRPM short call for the first half")).toBeInTheDocument();

    await user.click(within(reserveRow!).getByRole("button", {
      name: /Open detail for Award CRPM short call for the first half/,
    }));

    expect(await screen.findByRole("dialog", { name: "Configure Reserve Preference" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Reserve Preference short-call type" })).toHaveValue("CRPM");
    expect(screen.getByRole("combobox", { name: "Reserve Preference date scope" })).toHaveValue("first_half");
  });

  it("keeps all Existing bid categories visible while switching the Available list", async () => {
    const user = userEvent.setup();
    renderBidPage();

    const page = await screen.findByTestId("bid-page");
    const existingRegion = within(page).getByText("EXISTING BID PROPERTIES").parentElement?.parentElement;

    expect(existingRegion).not.toBeNull();
    expect(within(existingRegion!).getAllByTestId("tier-summary-row").length).toBeGreaterThan(0);
    expect(within(existingRegion!).getAllByText("Days Off").length).toBeGreaterThan(0);
    expect(within(existingRegion!).getAllByText("Pairing").length).toBeGreaterThan(0);
    expect(within(existingRegion!).getAllByText("Roster").length).toBeGreaterThan(0);

    await user.click(within(page).getByRole("tab", { name: "PAIRING" }));

    expect(within(page).getAllByText("Days Off").length).toBeGreaterThan(0);
    expect(within(page).getAllByText("Pairing").length).toBeGreaterThan(0);
    expect(within(page).getAllByText("Roster").length).toBeGreaterThan(0);
    expect(within(page).queryByTestId("pairing-add-properties-footer")).not.toBeInTheDocument();
  });

  it("uses the Days Off config for editable Prefer Off summaries", async () => {
    const daysOffData = structuredClone(daysOffPageData);
    daysOffData.rightPanel.existingProperties = [{
      id: "days-off-weekend",
      propertyCode: 201,
      name: "Prefer Off",
      bid: { type: "tag-list", values: ["Tuesday"] },
      tiers: [{ key: "t1", label: "T1", active: true }],
    }];
    vi.mocked(daysOffService.getPageData).mockResolvedValueOnce(daysOffData);

    renderBidPage();

    const page = await screen.findByTestId("bid-page");
    expect(within(page).getByText("Prefer off on Tuesdays")).toBeInTheDocument();
    expect(within(page).queryByText("Set Prefer Off: Friday, Saturday, Sunday")).not.toBeInTheDocument();
    expect(within(page).queryByText("Prefer Off needs review")).not.toBeInTheDocument();
  });

  it("defaults Existing bid properties to T1 and filters by the selected bidding calendar Tx", async () => {
    renderBidPage();

    const page = await screen.findByTestId("bid-page");

    expect(within(page).getByTestId("bid-existing-tier-filter-label")).toHaveTextContent("T1 only");
    expect(within(page).getByTestId("bid-review-panel")).toHaveTextContent("BID REVIEW");
    expect(within(page).getByTestId("bid-review-panel")).toHaveTextContent("T1");
    expect(within(page).getByTestId("bid-review-panel")).toHaveTextContent("This bid appears in T1 and T2");
    expect(within(page).queryByText(/Mock warnings/)).not.toBeInTheDocument();
    expect(within(page).getByText("Set Prefer Off: Friday, Saturday, Sunday")).toBeInTheDocument();

    await act(async () => {
      useBiddingCalendarStore.getState().setActiveTierLabel("TIER-02");
    });

    await waitFor(() => {
      expect(within(page).getByTestId("bid-existing-tier-filter-label")).toHaveTextContent("T2 only");
    });
    expect(within(page).getByTestId("bid-review-panel")).toHaveTextContent("T2");
    expect(within(page).getByTestId("bid-review-panel")).toHaveTextContent("This bid appears in T1 and T2");
    expect(within(page).getByText("Award Any Landing In Airport: YVR")).toBeInTheDocument();
    expect(within(page).queryByText("Set Prefer Off: Friday, Saturday, Sunday")).not.toBeInTheDocument();
    expect(within(page).queryByText("Set Max Credit Window: Enabled")).not.toBeInTheDocument();
  });

  it("returns from Pairing Search with the Pairing tab selected", async () => {
    renderBidPage({
      pathname: "/bid",
      state: { availableTab: "pairing" },
    });

    expect(await screen.findByRole("tab", { name: "PAIRING" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("keeps the workbench fixed while Existing and Available rows own their scroll", async () => {
    const user = userEvent.setup();
    renderBidPage();

    const page = await screen.findByTestId("bid-page");
    const existingScroll = within(page).getByTestId("bid-existing-properties-scroll");
    const availableWorkspace = within(page).getByTestId("bid-available-properties");
    const availableScroll = within(page).getByTestId("bid-available-properties-scroll");

    expect(page).toHaveClass(
      "h-[var(--portal-page-shell-height)]",
      "max-h-[var(--portal-page-shell-height)]",
      "min-h-0",
      "overflow-hidden",
    );
    expect(existingScroll).toHaveClass(
      "max-h-[330px]",
      "min-h-0",
      "overflow-y-auto",
      "overscroll-contain",
    );
    expect(availableWorkspace).toHaveClass("min-h-0", "flex-1", "overflow-hidden");
    expect(availableScroll).toHaveClass(
      "min-h-0",
      "flex-1",
      "overflow-y-auto",
      "overscroll-contain",
    );

    availableScroll.scrollTop = 80;
    await user.click(within(page).getByRole("tab", { name: "PAIRING" }));

    expect(availableScroll.scrollTop).toBe(0);
  });

  it("keeps tiers and actions aligned and confirms row deletion without opening edit", async () => {
    const user = userEvent.setup();
    renderBidPage();

    const page = await screen.findByTestId("bid-page");
    const rows = within(page).getAllByTestId("tier-summary-row");
    const pairingRow = rows.find((row) => within(row).queryByText("Pairing"));
    const daysOffRow = rows.find((row) => within(row).queryByText("Days Off"));
    const lineRow = rows.find((row) => within(row).queryByText("Roster"));

    expect(pairingRow).toBeDefined();
    expect(daysOffRow).toBeDefined();
    expect(lineRow).toBeDefined();
    expect(within(pairingRow!).getByTestId("tier-summary-actions")).toHaveClass("w-[150px]");
    expect(within(daysOffRow!).getByTestId("tier-summary-actions")).toHaveClass("w-[150px]");
    expect(within(lineRow!).getByTestId("tier-summary-actions")).toHaveClass("w-[150px]");
    expect(within(pairingRow!).getByRole("button", { name: /^Preview / })).toBeInTheDocument();
    expect(within(pairingRow!).getByRole("button", { name: /^Delete / })).toBeInTheDocument();
    expect(within(daysOffRow!).queryByRole("button", { name: /^Preview / })).not.toBeInTheDocument();
    expect(within(daysOffRow!).getByRole("button", { name: /^Delete / })).toBeInTheDocument();
    expect(within(lineRow!).queryByRole("button", { name: /^Preview / })).not.toBeInTheDocument();
    expect(within(lineRow!).getByRole("button", { name: /^Delete / })).toBeInTheDocument();

    await user.click(within(daysOffRow!).getByRole("button", { name: /^Delete / }));

    expect(screen.getByText("Delete this bid from the current draft?")).toBeInTheDocument();
    expect(screen.queryByTestId("tier-detail-dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByText("Delete this bid from the current draft?")).not.toBeInTheDocument();
    expect(within(page).getByText("Set Prefer Off: Friday, Saturday, Sunday")).toBeInTheDocument();
  });

  it("hides existing bid delete actions when the bid period is closed", async () => {
    const closedDaysOffData = structuredClone(daysOffPageData);
    const closedPairingData = structuredClone(pairingPageData);
    const closedLineData = structuredClone(linePageData);
    const closedPeriod = {
      ...closedDaysOffData.rightPanel.draftMeta.currentPeriod!,
      status: "CLOSED" as const,
      computedStage: "CLOSED" as const,
      canEditBid: false,
      readOnlyReason: "Bidding is closed for Jul 2026.",
    };
    const deleteDaysOffSpy = vi.spyOn(daysOffService, "removeCurrentDraftProperty");
    const deletePairingSpy = vi.spyOn(pairingService, "removeCurrentDraftProperty");
    const deleteLineSpy = vi.spyOn(lineService, "removeCurrentDraftProperty");

    closedDaysOffData.rightPanel.draftMeta.currentPeriod = closedPeriod;
    closedPairingData.rightPanel.draftMeta.currentPeriod = closedPeriod;
    closedLineData.rightPanel.draftMeta.currentPeriod = closedPeriod;
    vi.mocked(daysOffService.getPageData).mockResolvedValue(closedDaysOffData);
    vi.mocked(pairingService.getPageData).mockResolvedValue(closedPairingData);
    vi.mocked(lineService.getPageData).mockResolvedValue(closedLineData);

    renderBidPage();

    const page = await screen.findByTestId("bid-page");
    const existingRegion = within(page).getByTestId("bid-existing-properties-scroll");

    expect(within(existingRegion).getAllByTestId("tier-summary-row").length).toBeGreaterThan(0);
    expect(within(existingRegion).queryByRole("button", { name: /^Delete / })).not.toBeInTheDocument();
    expect(within(existingRegion).getByRole("button", { name: /^Preview / })).toBeInTheDocument();
    expect(screen.queryByText("Delete this bid from the current draft?")).not.toBeInTheDocument();
    expect(deleteDaysOffSpy).not.toHaveBeenCalled();
    expect(deletePairingSpy).not.toHaveBeenCalled();
    expect(deleteLineSpy).not.toHaveBeenCalled();
  });

  it("disables the target row and prevents duplicate deletion while the request is pending", async () => {
    const user = userEvent.setup();
    const pairingProperty = pairingPageData.rightPanel.existingProperties[0]!;
    const pendingTierData = structuredClone(tierPageData);
    pendingTierData.summaryGroups[0]!.items = [{
      ...pendingTierData.summaryGroups[0]!.items[0]!,
      groupKey: pairingProperty.id,
      id: `${pairingProperty.id}-t1`,
      label: pairingProperty.name,
      readableText: `Award ${pairingProperty.name}`,
      tiers: ["T1"],
      conditions: [],
      editableSource: {
        module: "Pairing",
        propertyGroupKey: pairingProperty.id,
      },
    }];
    pendingTierData.summaryGroups[0]!.totalItems = 1;
    vi.mocked(tierService.getPageData).mockResolvedValue(pendingTierData);
    let resolveDelete: ((value: {
      saved: true;
      draftVersion: number;
    }) => void) | undefined;
    const deleteSpy = vi.spyOn(pairingService, "removeCurrentDraftProperty").mockImplementation(
      () => new Promise((resolve) => {
        resolveDelete = resolve;
      }),
    );
    renderBidPage();

    const page = await screen.findByTestId("bid-page");
    const pairingRow = within(page)
      .getByRole("button", { name: new RegExp(`Open detail for .*Award ${pairingProperty.name}`) })
      .closest<HTMLElement>('[data-testid="tier-summary-row"]');

    expect(pairingRow).not.toBeNull();
    await user.click(within(pairingRow!).getByRole("button", { name: /^Delete / }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(within(pairingRow!).getByRole("button", { name: /^Open detail / })).toHaveAttribute("aria-disabled", "true");
      expect(within(pairingRow!).getByRole("button", { name: /^Preview / })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Deleting..." })).toBeDisabled();
      expect(deleteSpy).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole("button", { name: "Deleting..." }));
    expect(deleteSpy).toHaveBeenCalledTimes(1);

    resolveDelete?.({ saved: true, draftVersion: 2 });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Deleting..." })).not.toBeInTheDocument());
  });

  it("keeps the row and restores its actions when deletion fails", async () => {
    const user = userEvent.setup();
    const pairingProperty = pairingPageData.rightPanel.existingProperties[0]!;
    const failedTierData = structuredClone(tierPageData);
    failedTierData.summaryGroups[0]!.items = [{
      ...failedTierData.summaryGroups[0]!.items[0]!,
      groupKey: pairingProperty.id,
      id: `${pairingProperty.id}-t1`,
      label: pairingProperty.name,
      readableText: `Award ${pairingProperty.name}`,
      tiers: ["T1"],
      conditions: [],
      editableSource: {
        module: "Pairing",
        propertyGroupKey: pairingProperty.id,
      },
    }];
    failedTierData.summaryGroups[0]!.totalItems = 1;
    vi.mocked(tierService.getPageData).mockResolvedValue(failedTierData);
    const deleteSpy = vi.spyOn(pairingService, "removeCurrentDraftProperty")
      .mockRejectedValue(new Error("Unable to delete this bid."));

    renderBidPage();

    const page = await screen.findByTestId("bid-page");
    const pairingRow = within(page)
      .getByRole("button", { name: new RegExp(`Open detail for .*Award ${pairingProperty.name}`) })
      .closest<HTMLElement>('[data-testid="tier-summary-row"]');

    expect(pairingRow).not.toBeNull();
    await user.click(within(pairingRow!).getByRole("button", { name: /^Delete / }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to delete this bid.");
    expect(deleteSpy).toHaveBeenCalledTimes(1);
    expect(within(pairingRow!).getByRole("button", { name: /^Open detail / })).toHaveAttribute("aria-disabled", "false");
    expect(within(pairingRow!).getByRole("button", { name: /^Preview / })).toBeEnabled();
    expect(within(pairingRow!).getByRole("button", { name: /^Delete / })).toBeEnabled();
  });
});
