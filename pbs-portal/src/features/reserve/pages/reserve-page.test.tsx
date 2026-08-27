import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppProviders } from "@/app/providers/app-providers";
import { ReservePage } from "@/features/reserve/pages/reserve-page";
import type { RuleBidPageData } from "@/features/rule-bids/types";
import { queryClient } from "@/shared/query/query-client";
import { reserveService } from "@/shared/services/reserve-service";

const reservePageData: RuleBidPageData = {
  rightPanel: {
    draftMeta: {
      draftKey: "42",
      bidId: 42,
      periodId: 1,
      draftVersion: 0,
      periodCode: "May 2026",
      bidContext: "Current" as const,
      remarks: "",
      currentPeriod: {
        id: 42,
        rosterPeriodId: 42,
        rosterPeriodKey: "2026RP05",
        periodCode: "May 2026",
        filiale: "F8",
        status: "OPEN",
        computedStage: "OPEN",
        bidOpenAt: "2026-04-03T00:00:00.000Z",
        bidCloseAt: "2026-04-10T23:59:59.000Z",
        rpEndLocal: "2026-05-31",
        rpStartLocal: "2026-05-01",
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
    availableProperties: [
      {
        id: "available-301",
        propertyCode: 301,
        name: "Reserve Preference",
        favorited: false,
        bid: {
          type: "reserve-call-type-date-scope" as const,
          callType: "CRAM",
          options: ["CRAM", "CRPM"],
          dateScope: { mode: "whole_month" as const },
        },
        tiers: [{ key: "t1", label: "T1", active: true }],
      },
      {
        id: "available-302",
        propertyCode: 302,
        name: "Reserve Day On",
        favorited: false,
        bid: { type: "tag-list" as const, values: [], suggestions: [] },
        tiers: [{ key: "t1", label: "T1", active: true }],
      },
      {
        id: "available-311",
        propertyCode: 311,
        name: "Reserve Prefer Off",
        favorited: false,
        bid: { type: "tag-list" as const, values: [], suggestions: [] },
        tiers: [{ key: "t1", label: "T1", active: true }],
      },
    ],
  },
};

const reserveCoverage = {
  periodCode: "May 2026",
  rosterPeriodId: 42,
  rpEndLocal: "2026-05-31",
  rpStartLocal: "2026-05-01",
  baseCode: "F8",
  days: [
    { date: "2026-05-01", requiredReserveCount: 279, availableOffCount: 33 },
    { date: "2026-05-02", requiredReserveCount: 299, availableOffCount: 21 },
  ],
  warnings: [],
};

const renderReservePage = () =>
  render(
    <AppProviders>
      <ReservePage />
    </AppProviders>,
  );

describe("ReservePage", () => {
  beforeEach(() => {
    vi.spyOn(reserveService, "getPageData").mockResolvedValue(structuredClone(reservePageData));
    vi.spyOn(reserveService, "getCoverage").mockResolvedValue(structuredClone(reserveCoverage));
    vi.spyOn(reserveService, "addCurrentDraftProperty").mockImplementation(async (property, draftMeta) => ({
      saved: true,
      draftKey: draftMeta.draftKey,
      bidId: draftMeta.bidId,
      periodId: draftMeta.periodId,
      periodCode: draftMeta.periodCode,
      draftVersion: draftMeta.draftVersion + 1,
      propertyGroupKey: `reserve-property-${property.propertyCode}-${property.id}`,
      rowSeq: 1,
    }));
    vi.spyOn(reserveService, "removeCurrentDraftProperty").mockImplementation(async (_propertyGroupKey, draftMeta) => ({
      saved: true,
      draftKey: draftMeta.draftKey,
      bidId: draftMeta.bidId,
      periodId: draftMeta.periodId,
      periodCode: draftMeta.periodCode,
      draftVersion: draftMeta.draftVersion + 1,
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
    vi.spyOn(reserveService, "saveCurrentDraft").mockImplementation(async (_existingProperties, draftMeta, mode = "legacy") => ({
      draft: {
        ...draftMeta,
        bidContext: "Current",
        mode,
        draftVersion: draftMeta.draftVersion + 1,
        properties: [],
      },
      propertyCatalog: [],
    }));
    queryClient.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("loads Reserve Preference with database coverage counts and no legacy mode controls", async () => {
    renderReservePage();

    expect(screen.getByTestId("reserve-page-loading")).toBeInTheDocument();

    await waitFor(() => {
      expect(reserveService.getPageData).toHaveBeenCalledTimes(1);
      expect(reserveService.getCoverage).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText("RESERVE PREFERENCE")).toBeInTheDocument();
    expect(screen.getByTestId("reserve-coverage-calendar")).toBeInTheDocument();
    expect(screen.getByText("Need: 279")).toBeInTheDocument();
    expect(screen.getByText("Off: 33")).toBeInTheDocument();
    expect(screen.getByText("EXISTING RESERVE PROPERTIES")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ADD RESERVE PREFERENCE" })).toBeInTheDocument();
    expect(screen.queryByText("Legacy Reserve")).not.toBeInTheDocument();
    expect(screen.queryByText("AA Prefer Off")).not.toBeInTheDocument();
    expect(screen.queryByText("Reserve Day On")).not.toBeInTheDocument();
    expect(screen.queryByText("Reserve Prefer Off")).not.toBeInTheDocument();
    expect(screen.queryByTestId("rule-bid-add-properties-workspace")).not.toBeInTheDocument();
  });

  it("adds Reserve Preference from the dedicated action", async () => {
    const user = userEvent.setup();
    const addSpy = vi.spyOn(reserveService, "addCurrentDraftProperty");

    renderReservePage();

    await user.click(await screen.findByRole("button", { name: "ADD RESERVE PREFERENCE" }));

    expect(await screen.findByRole("dialog", { name: "Configure Reserve Preference" })).toBeInTheDocument();
    expect(screen.getByText("APPLY TO TIERS")).toHaveTextContent("APPLY TO TIERS · REQUIRED");
    expect(screen.getByRole("combobox", { name: "Reserve Preference short-call type" })).toHaveValue("CRAM");
    expect(screen.getByRole("button", { name: "Toggle T1 for Reserve Preference" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Toggle T2 for Reserve Preference" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("· REQUIRED")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ADD BID" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Reserve Preference date scope" })).toHaveValue("whole_month");

    await user.selectOptions(screen.getByRole("combobox", { name: "Reserve Preference short-call type" }), "CRPM");
    await user.selectOptions(screen.getByRole("combobox", { name: "Reserve Preference date scope" }), "first_half");
    await user.click(screen.getByRole("button", { name: "Toggle T2 for Reserve Preference" }));
    expect(screen.getByText("APPLY TO TIERS")).toHaveTextContent("APPLY TO TIERS · REQUIRED");
    await user.click(screen.getByRole("button", { name: "ADD BID" }));

    await waitFor(() => {
      expect(addSpy).toHaveBeenCalledTimes(1);
    });

    const [property] = addSpy.mock.calls[0] ?? [];
    expect(property?.propertyCode).toBe(301);
    expect(property?.name).toBe("Reserve Preference");
    expect(property?.bid).toEqual({
      type: "reserve-call-type-date-scope",
      callType: "CRPM",
      options: ["CRAM", "CRPM"],
      dateScope: { mode: "first_half" },
    });
    expect(property?.tiers.find((tier) => tier.label === "T2")?.active).toBe(true);
    expect(property?.tiers.find((tier) => tier.label === "T1")?.active).toBe(false);
  });

  it("adds Reserve Preference for specific dates", async () => {
    const user = userEvent.setup();
    const addSpy = vi.spyOn(reserveService, "addCurrentDraftProperty");

    renderReservePage();

    await user.click(await screen.findByRole("button", { name: "ADD RESERVE PREFERENCE" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Reserve Preference date scope" }), "specific_dates");
    await user.click(screen.getByRole("button", { name: "Toggle T1 for Reserve Preference" }));
    await user.click(screen.getByRole("button", { name: "Open date picker for Reserve Preference specific dates" }));
    await user.click(screen.getByRole("gridcell", { name: "Select 2026-05-01" }));
    await user.click(screen.getByRole("gridcell", { name: "Select 2026-05-03" }));
    await user.click(screen.getByRole("button", { name: "ADD BID" }));

    await waitFor(() => {
      expect(addSpy).toHaveBeenCalledTimes(1);
    });

    const [property] = addSpy.mock.calls[0] ?? [];
    expect(property?.bid).toEqual({
      type: "reserve-call-type-date-scope",
      callType: "CRAM",
      options: ["CRAM", "CRPM"],
      dateScope: { mode: "specific_dates", dates: ["2026-05-01", "2026-05-03"] },
    });
  });

  it("opens Reserve Preference from the coverage calendar with the clicked date prefilled", async () => {
    const user = userEvent.setup();
    const addSpy = vi.spyOn(reserveService, "addCurrentDraftProperty");

    renderReservePage();

    await screen.findByTestId("reserve-coverage-calendar");
    await user.click(screen.getByRole("button", { name: /Open Reserve Preference options for 2026-05-02/ }));

    expect(addSpy).not.toHaveBeenCalled();
    expect(await screen.findByRole("dialog", { name: "Configure Reserve Preference" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Reserve Preference date scope" })).toHaveValue("specific_dates");
    expect(screen.getByText("2026-05-02")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ADD BID" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Toggle T2 for Reserve Preference" }));
    await user.click(screen.getByRole("button", { name: "ADD BID" }));

    await waitFor(() => {
      expect(addSpy).toHaveBeenCalledTimes(1);
    });

    const [property] = addSpy.mock.calls[0] ?? [];
    expect(property?.propertyCode).toBe(301);
    expect(property?.bid).toEqual({
      type: "reserve-call-type-date-scope",
      callType: "CRAM",
      options: ["CRAM", "CRPM"],
      dateScope: { mode: "specific_dates", dates: ["2026-05-02"] },
    });
    expect(property?.tiers.find((tier) => tier.label === "T2")?.active).toBe(true);
  });

  it("keeps Reserve Preference read-only when the period is closed", async () => {
    const user = userEvent.setup();
    const addSpy = vi.spyOn(reserveService, "addCurrentDraftProperty");
    const closedPageData = structuredClone(reservePageData);
    closedPageData.rightPanel.draftMeta.currentPeriod = {
      ...closedPageData.rightPanel.draftMeta.currentPeriod!,
      status: "CLOSED",
      computedStage: "CLOSED",
      canEditBid: false,
      readOnlyReason: "Bidding is closed for May 2026.",
    };
    vi.mocked(reserveService.getPageData).mockResolvedValueOnce(closedPageData);

    renderReservePage();

    const addButton = await screen.findByRole("button", { name: "ADD RESERVE PREFERENCE" });
    expect(addButton).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /Open Reserve Preference options for 2026-05-02/ }));

    expect(screen.queryByRole("dialog", { name: "Configure Reserve Preference" })).not.toBeInTheDocument();
    expect(screen.queryByText("ADDING...")).not.toBeInTheDocument();
    expect(addSpy).not.toHaveBeenCalled();
  });

  it("filters old Reserve Day On and Reserve Prefer Off rows from the current Reserve page", async () => {
    const pageDataWithOldRows = structuredClone(reservePageData);

    pageDataWithOldRows.rightPanel.existingProperties = [
      {
        id: "reserve-property-301",
        propertyCode: 301,
        name: "Reserve Preference",
        bid: {
          type: "reserve-call-type-date-scope",
          callType: "CRAM",
          options: ["CRAM", "CRPM"],
          dateScope: { mode: "whole_month" },
        },
        tiers: [{ key: "t1", label: "T1", active: true }],
      },
      {
        id: "reserve-property-302",
        propertyCode: 302,
        name: "Reserve Day On",
        bid: { type: "tag-list", values: ["2026-05-01"], suggestions: [] },
        tiers: [{ key: "t1", label: "T1", active: true }],
      },
      {
        id: "reserve-property-311",
        propertyCode: 311,
        name: "Reserve Prefer Off",
        bid: { type: "tag-list", values: ["2026-05-02"], suggestions: [] },
        tiers: [{ key: "t1", label: "T1", active: true }],
      },
    ];
    vi.mocked(reserveService.getPageData).mockResolvedValueOnce(pageDataWithOldRows);

    renderReservePage();

    expect((await screen.findAllByText("Reserve Preference")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Reserve Day On")).not.toBeInTheDocument();
    expect(screen.queryByText("Reserve Prefer Off")).not.toBeInTheDocument();
  });

  it("does not post duplicate Reserve Preference for the same call type, date scope, and tier", async () => {
    const user = userEvent.setup();
    const pageDataWithExistingReservePreference = structuredClone(reservePageData);
    const addSpy = vi.spyOn(reserveService, "addCurrentDraftProperty");

    pageDataWithExistingReservePreference.rightPanel.existingProperties = [
      {
        id: "reserve-property-301",
        propertyCode: 301,
        name: "Reserve Preference",
        bid: {
          type: "reserve-call-type-date-scope",
          callType: "CRAM",
          options: ["CRAM", "CRPM"],
          dateScope: { mode: "whole_month" },
        },
        tiers: [
          { key: "t1", label: "T1", active: true },
          { key: "t2", label: "T2", active: false },
        ],
      },
    ];
    vi.mocked(reserveService.getPageData).mockResolvedValueOnce(pageDataWithExistingReservePreference);

    renderReservePage();

    await user.click(await screen.findByRole("button", { name: "ADD RESERVE PREFERENCE" }));
    await user.click(screen.getByRole("button", { name: "Toggle T1 for Reserve Preference" }));
    await user.click(screen.getByRole("button", { name: "ADD BID" }));

    expect(addSpy).not.toHaveBeenCalled();
  });

  it("edits Reserve Preference through the reserve bid dialog", async () => {
    const user = userEvent.setup();
    const pageDataWithReservePreference = structuredClone(reservePageData);
    const patchSpy = vi.spyOn(reserveService, "patchCurrentDraftProperty");

    pageDataWithReservePreference.rightPanel.existingProperties = [
      {
        id: "reserve-property-301",
        propertyCode: 301,
        name: "Reserve Preference",
        bid: {
          type: "reserve-call-type-date-scope",
          callType: "CRAM",
          options: ["CRAM", "CRPM"],
          dateScope: { mode: "whole_month" },
        },
        tiers: [{ key: "t1", label: "T1", active: true }],
      },
    ];
    vi.mocked(reserveService.getPageData).mockResolvedValueOnce(pageDataWithReservePreference);

    renderReservePage();

    await screen.findByText("Reserve Preference");
    expect(screen.queryByRole("combobox", { name: "Bid for existing Reserve Preference" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit existing property Reserve Preference" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Reserve Preference short-call type" }), "CRPM");
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Reserve Preference date scope" }),
      "second_half",
    );
    await user.click(screen.getByRole("button", { name: "UPDATE BID" }));

    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith(
        "reserve-property-301",
        expect.objectContaining({
          propertyCode: 301,
          bid: {
            type: "reserve-call-type-date-scope",
            callType: "CRPM",
            options: ["CRAM", "CRPM"],
            dateScope: { mode: "second_half" },
          },
        }),
        expect.any(Object),
      );
    });
  });

  it("blocks Reserve Preference submission when the real roster period range is unavailable", async () => {
    const user = userEvent.setup();
    const coverageWithoutRange = structuredClone(reserveCoverage);
    const addSpy = vi.spyOn(reserveService, "addCurrentDraftProperty");

    coverageWithoutRange.rpStartLocal = "";
    coverageWithoutRange.rpEndLocal = "";
    vi.mocked(reserveService.getCoverage).mockResolvedValueOnce(coverageWithoutRange);

    renderReservePage();

    await user.click(await screen.findByRole("button", { name: "ADD RESERVE PREFERENCE" }));
    await user.click(screen.getByRole("button", { name: "Toggle T1 for Reserve Preference" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Bid period is unavailable");
    expect(screen.getByRole("button", { name: "ADD BID" })).toBeDisabled();
    expect(addSpy).not.toHaveBeenCalled();
  });

  it("preserves an out-of-period saved date and blocks update until it is explicitly replaced", async () => {
    const user = userEvent.setup();
    const pageDataWithOutOfPeriodDate = structuredClone(reservePageData);
    const patchSpy = vi.spyOn(reserveService, "patchCurrentDraftProperty");

    pageDataWithOutOfPeriodDate.rightPanel.existingProperties = [
      {
        id: "reserve-property-301",
        propertyCode: 301,
        name: "Reserve Preference",
        bid: {
          type: "reserve-call-type-date-scope",
          callType: "PRAM",
          options: ["CRAM", "CRPM", "PRAM"],
          dateScope: { mode: "specific_dates", dates: ["2026-04-30", "2026-05-02"] },
        },
        tiers: [{ key: "t1", label: "T1", active: true }],
      },
    ];
    vi.mocked(reserveService.getPageData).mockResolvedValueOnce(pageDataWithOutOfPeriodDate);

    renderReservePage();

    await user.click(await screen.findByRole("button", { name: "Edit existing property Reserve Preference" }));

    expect(screen.getByText("2026-04-30")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Saved dates outside this bid period: 2026-04-30");
    expect(screen.getByRole("button", { name: "UPDATE BID" })).toBeDisabled();
    expect(patchSpy).not.toHaveBeenCalled();
  });
});
