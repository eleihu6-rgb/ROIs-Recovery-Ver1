import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PbsDaysOffBidValue } from "../../../../../packages/contracts/pbs-days-off-bids.js";
import { AppProviders } from "@/app/providers/app-providers";
import { daysOffPageData } from "@/features/days-off/mock";
import { DaysOffPage } from "@/features/days-off/pages/days-off-page";
import type { RuleBidRightPanelPresentation } from "@/features/rule-bids/components/rule-bid-right-panel";
import { queryClient } from "@/shared/query/query-client";
import { daysOffService } from "@/shared/services/days-off-service";
import { pbsUserService } from "@/shared/services/pbs-user-service";
import type { RuleBidAvailableProperty } from "@/features/rule-bids/types";

vi.mock("@/shared/services/pbs-user-service", () => ({
  pbsUserService: {
    searchCrewOptions: vi.fn(),
  },
}));

const renderDaysOffPage = (presentation?: RuleBidRightPanelPresentation) =>
  render(
    <AppProviders>
      <DaysOffPage presentation={presentation} />
    </AppProviders>,
  );

const showAllDaysOffProperties = async (user: ReturnType<typeof userEvent.setup>) => {
  const allTab = await screen.findByRole("button", { name: "ALL PROPERTIES" });

  if (allTab.getAttribute("aria-pressed") !== "true") {
    await user.click(allTab);
  }
};

const selectDaysOffDialogTier = async (
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  propertyName: string,
  tier = "T1",
) => {
  const tierButton = within(dialog).getByRole("button", { name: `Toggle ${tier} for ${propertyName}` });

  if (tierButton.getAttribute("aria-pressed") !== "true") {
    await user.click(tierButton);
  }
};

const buildAvailableDaysOffProperty = (index: number) => ({
  id: `available-${index}`,
  propertyCode: 300 + index,
  name: `Days Off Property ${String(index).padStart(2, "0")}`,
  favorited: false,
  bid: { type: "flag" as const },
  tiers: [{ key: "t1", label: "T1", active: true }],
});

const getDaysOffTestBidValue = (property: RuleBidAvailableProperty): PbsDaysOffBidValue => {
  if (property.bid.type === "pairing-occurrence-list") {
    throw new Error("Pairing occurrence bids are not valid for Days Off tests.");
  }

  if (property.bid.type === "pairing-id-list") {
    throw new Error("Pairing ID bids are not valid for Days Off tests.");
  }

  if (property.bid.type === "time-condition-list") {
    throw new Error("Pairing time condition bids are not valid for Days Off tests.");
  }

  if (property.bid.type === "duration" || property.bid.type === "duration-range") {
    throw new Error("Pairing duration bids are not valid for Days Off tests.");
  }

  if (property.bid.type === "date-or-dow-list") {
    throw new Error("Pairing date or day bids are not valid for Days Off tests.");
  }

  if (property.bid.type === "percent-or-duration") {
    throw new Error("Pairing percent or duration bids are not valid for Days Off tests.");
  }

  if (property.bid.type === "airport-preference") {
    throw new Error("Pairing airport preference bids are not valid for Days Off tests.");
  }

  if (property.bid.type === "pairing-preference") {
    throw new Error("Pairing preference bids are not valid for Days Off tests.");
  }

  if (property.bid.type === "pairing-check-time") {
    throw new Error("Pairing check-time bids are not valid for Days Off tests.");
  }

  if (property.bid.type === "pairing-length-preference") {
    throw new Error("Pairing length bids are not valid for Days Off tests.");
  }

  if (property.bid.type === "flight-number-preference") {
    throw new Error("Flight number preference bids are not valid for Days Off tests.");
  }

  if (property.bid.type === "redeye-preference") {
    throw new Error("Redeye preference bids are not valid for Days Off tests.");
  }

  if (property.bid.type === "month-end-carryover") {
    throw new Error("Month-End Carryover bids are not valid for Days Off tests.");
  }

  if (property.bid.type === "deadhead-flying") {
    throw new Error("Deadhead Flying bids are not valid for Days Off tests.");
  }

  if (property.bid.type === "flight-legs-per-duty") {
    throw new Error("Flight Legs per Duty bids are not valid for Days Off tests.");
  }

  if (property.bid.type === "work-day-preference") {
    throw new Error("Work Day Preference bids are not valid for Days Off tests.");
  }

  if (property.bid.type === "credit-window-preference") {
    throw new Error("Credit Window Preference bids are not valid for Days Off tests.");
  }

  if (property.bid.type === "minimum-base-layover") {
    throw new Error("Minimum Base Layover bids are not valid for Days Off tests.");
  }

  if (property.bid.type === "efficient-flying-preference") {
    throw new Error("Efficient Flying First bids are not valid for Days Off tests.");
  }

  return structuredClone(property.bid);
};

describe("DaysOffPage", () => {
  beforeEach(() => {
    vi.mocked(pbsUserService.searchCrewOptions).mockReset();
    vi.spyOn(daysOffService, "getPageData").mockResolvedValue(structuredClone(daysOffPageData));
    vi.spyOn(daysOffService, "addCurrentDraftProperty").mockImplementation(async (_property, draftMeta) => ({
      saved: true,
      draftKey: draftMeta.draftKey ?? "draft-1",
      bidId: draftMeta.bidId ?? 1,
      periodId: draftMeta.periodId,
      periodCode: draftMeta.periodCode,
      draftVersion: draftMeta.draftVersion + 1,
      propertyGroupKey: "property-group-1",
      rowSeq: 1,
    }));
    vi.spyOn(daysOffService, "removeCurrentDraftProperty").mockImplementation(async (_propertyGroupKey, draftMeta) => ({
      saved: true,
      draftKey: draftMeta.draftKey,
      bidId: draftMeta.bidId,
      periodId: draftMeta.periodId,
      periodCode: draftMeta.periodCode,
      draftVersion: draftMeta.draftVersion + 1,
    }));
    vi.spyOn(daysOffService, "patchCurrentDraftProperty").mockImplementation(async (propertyGroupKey, property, draftMeta) => ({
      saved: true,
      draftKey: draftMeta.draftKey,
      bidId: draftMeta.bidId,
      periodId: draftMeta.periodId,
      periodCode: draftMeta.periodCode,
      draftVersion: draftMeta.draftVersion + 1,
      propertyGroupKey,
      tiers: property.tiers.filter((tier) => tier.active).map((tier) => tier.label),
    }));
    vi.spyOn(daysOffService, "favoriteProperty").mockImplementation(async (property, draftMeta) => ({
      saved: true,
      draftKey: draftMeta.draftKey ?? "draft-1",
      bidId: draftMeta.bidId ?? 1,
      periodId: draftMeta.periodId,
      periodCode: draftMeta.periodCode,
      draftVersion: draftMeta.draftVersion,
      favoriteKey: "favorite-1",
      propertyId: property.propertyCode,
      propertyCode: property.propertyCode,
      name: property.name,
      bid: getDaysOffTestBidValue(property),
      allOrNothing: property.allOrNothing ?? false,
      minimumN: property.minimumN ?? null,
      maximumN: property.maximumN ?? null,
    }));
    vi.spyOn(daysOffService, "patchFavoriteProperty").mockImplementation(async (favoriteKey, property, draftMeta) => ({
      saved: true,
      draftKey: draftMeta.draftKey ?? "draft-1",
      bidId: draftMeta.bidId ?? 1,
      periodId: draftMeta.periodId,
      periodCode: draftMeta.periodCode,
      draftVersion: draftMeta.draftVersion + 1,
      favoriteKey,
      propertyId: property.propertyCode,
      propertyCode: property.propertyCode,
      name: property.name,
      action: property.action,
      bid: getDaysOffTestBidValue(property),
      allOrNothing: property.allOrNothing ?? false,
      minimumN: property.minimumN ?? null,
      maximumN: property.maximumN ?? null,
    }));
    vi.spyOn(daysOffService, "unfavoriteProperty").mockResolvedValue({ saved: true });
    queryClient.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("loads page data through the days off service boundary", async () => {
    const serviceSpy = vi.spyOn(daysOffService, "getPageData");

    renderDaysOffPage();

    expect(
      screen.getByRole("status", { name: "Loading current days off draft..." }),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(serviceSpy).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText("EXISTING DAYS OFF PROPERTIES")).toBeInTheDocument();
    expect(screen.getByText("ADD DAYS OFF PROPERTIES")).toBeInTheDocument();
    const addWorkspace = await screen.findByTestId("rule-bid-add-properties-workspace");
    expect(document.querySelector('[data-uiid="rule-bid-right-panel"]')).toHaveClass(
      "min-h-full",
    );
    expect(document.querySelector('[data-uiid="rule-bid-right-panel"]')).not.toHaveClass(
      "h-full",
    );
    expect(addWorkspace).toHaveClass(
      "min-h-[420px]",
    );
    const favoriteTab = await screen.findByRole("button", { name: "FAVORITED PROPERTIES" });
    const allTab = screen.getByRole("button", { name: "ALL PROPERTIES" });

    expect(favoriteTab).toHaveAttribute("aria-pressed", "true");
    expect(allTab).toHaveAttribute("aria-pressed", "false");
    expect(favoriteTab.compareDocumentPosition(allTab) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Edit available property / })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: "Filter existing Standing Bid by tier" }),
    ).not.toBeInTheDocument();
  });

  it("renders duplicate existing days off properties as read-only rows with full bid text and actions", async () => {
    const pageData = structuredClone(daysOffPageData);
    pageData.rightPanel.availableProperties = [];
    pageData.rightPanel.existingProperties = [
      {
        id: "existing-prefer-off-range",
        propertyCode: 201,
        name: "Prefer Off",
        bid: { type: "date-range", from: "2026-06-18", to: "2026-06-21" },
        tiers: [
          { key: "t1", label: "T1", active: true },
          { key: "t2", label: "T2", active: false },
        ],
        allOrNothing: false,
        minimumN: null,
      },
      {
        id: "existing-prefer-off-dates",
        propertyCode: 201,
        name: "Prefer Off",
        bid: {
          type: "tag-list",
          values: ["2026-07-02", "2026-07-03", "2026-07-04", "2026-07-05", "2026-07-06"],
        },
        tiers: [
          { key: "t1", label: "T1", active: true },
          { key: "t2", label: "T2", active: false },
        ],
        allOrNothing: true,
        minimumN: 2,
      },
    ];
    vi.mocked(daysOffService.getPageData).mockResolvedValueOnce(pageData);

    renderDaysOffPage();

    const existingRows = await screen.findAllByTestId("rule-bid-existing-row");
    expect(existingRows).toHaveLength(2);
    expect(screen.getByText("ACTIONS")).toBeInTheDocument();

    const existingBids = screen.getAllByLabelText("Bid for existing Prefer Off");
    expect(existingBids).toHaveLength(2);
    expect(existingBids[0]).toHaveTextContent("Between 2026-06-18 - 2026-06-21");
    expect(existingBids[1]).toHaveTextContent("Prefer off on 5 selected dates");
    expect(existingBids[1]).toHaveTextContent("Jul 2, 2026, Jul 3, 2026, Jul 4, 2026, +2 more");
    expect(existingBids[1]).toHaveTextContent("Show all 5 selected");
    expect(existingBids[1].tagName).toBe("DIV");
    expect(existingBids[1].className).not.toContain("truncate");
    expect(within(existingRows[1]).queryByRole("button", {
      name: "Remove 2026-07-02 from Bid for existing Prefer Off",
    })).not.toBeInTheDocument();
    expect(existingBids[1].closest(".grid")).toHaveStyle({
      columnGap: "14px",
      gridTemplateColumns: "minmax(150px, 200px) minmax(260px, 1fr) 236px minmax(56px, 72px)",
    });

    expect(within(existingRows[1]).getByRole("button", { name: "Edit existing property Prefer Off" })).toBeInTheDocument();
    expect(within(existingRows[1]).getByRole("button", { name: "Delete existing property Prefer Off" })).toBeInTheDocument();
  });

  it("renders imported Prefer Off ranges and weekdays with the configured semantics", async () => {
    const pageData = structuredClone(daysOffPageData);
    pageData.rightPanel.availableProperties = [];
    pageData.rightPanel.existingProperties = [
      {
        id: "existing-prefer-off-range",
        propertyCode: 201,
        name: "Prefer Off",
        bid: { type: "tag-list", values: ["Between 2026-06-03 - 2026-06-05"] },
        tiers: [{ key: "t1", label: "T1", active: true }],
      },
      {
        id: "existing-prefer-off-tuesday",
        propertyCode: 201,
        name: "Prefer Off",
        bid: { type: "tag-list", values: ["Tuesday"] },
        tiers: [{ key: "t1", label: "T1", active: true }],
      },
    ];
    vi.mocked(daysOffService.getPageData).mockResolvedValueOnce(pageData);

    renderDaysOffPage();

    expect(await screen.findByText(
      "Prefer off from Jun 3, 2026 to Jun 5, 2026",
    )).toBeInTheDocument();
    expect(screen.getByText("Prefer off on Tuesdays")).toBeInTheDocument();
    expect(screen.queryByText("Prefer Off needs review")).not.toBeInTheDocument();
  });

  it("wraps long existing days off property names without changing table columns", async () => {
    const longPropertyName = "Long Stretch Off / Compressed Flying";
    const pageData = structuredClone(daysOffPageData);
    pageData.rightPanel.availableProperties = [];
    pageData.rightPanel.existingProperties = [
      {
        id: "existing-min-consecutive-days-off-window",
        propertyCode: 206,
        name: longPropertyName,
        bid: { type: "stepper-date-range", value: 2, from: "2026-05-01", to: "2026-05-07" },
        tiers: [
          { key: "t1", label: "T1", active: true },
          { key: "t2", label: "T2", active: false },
        ],
        allOrNothing: false,
        minimumN: null,
      },
    ];
    vi.mocked(daysOffService.getPageData).mockResolvedValueOnce(pageData);

    renderDaysOffPage();

    const existingRow = await screen.findByTestId("rule-bid-existing-row");
    const propertyName = within(existingRow).getByText(longPropertyName);

    expect(propertyName).toHaveClass("whitespace-normal", "break-words");
    expect(propertyName).not.toHaveClass("truncate");
    expect(propertyName.closest(".grid")).toHaveStyle({
      columnGap: "14px",
      gridTemplateColumns: "minmax(150px, 200px) minmax(260px, 1fr) 236px minmax(56px, 72px)",
    });
    expect(within(existingRow).getByLabelText(`Bid for existing ${longPropertyName}`)).toHaveTextContent(
      "2 consecutive days between 2026-05-01 - 2026-05-07",
    );
  });

  it("filters all properties by search, adds a property, and keeps the all tab stable", async () => {
    const user = userEvent.setup();
    const addSpy = vi.spyOn(daysOffService, "addCurrentDraftProperty");

    vi.mocked(daysOffService.getPageData).mockResolvedValueOnce({
      rightPanel: {
        ...structuredClone(daysOffPageData.rightPanel),
        availableProperties: [
          {
            id: "available-212",
            propertyCode: 212,
            name: "Maximize Weekend Days Off",
            favorited: true,
            bid: { type: "flag" },
            tiers: [{ key: "t1", label: "T1", active: true }],
          },
          {
            id: "available-215",
            propertyCode: 215,
            name: "String of Days Off Starting on Date",
            favorited: false,
            bid: { type: "date", value: "2026-04-01" },
            tiers: [{ key: "t1", label: "T1", active: true }],
          },
        ],
      },
    });

    renderDaysOffPage();

    await user.click(await screen.findByRole("button", { name: "ALL PROPERTIES" }));
    expect(screen.getByRole("button", { name: "ALL PROPERTIES" })).toHaveAttribute("aria-pressed", "true");
    await user.type(screen.getByPlaceholderText("Search Properties"), "starting");

    expect(screen.getByText("String of Days Off Starting on Date")).toBeInTheDocument();
    expect(screen.queryByText("Maximize Weekend Days Off")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add String of Days Off Starting on Date" }));
    const dialog = await screen.findByRole("dialog", { name: "Configure String of Days Off Starting on Date" });
    expect(within(dialog).getByText("APPLY TO TIERS")).toHaveTextContent("APPLY TO TIERS · REQUIRED");
    expect(addSpy).not.toHaveBeenCalled();

    await selectDaysOffDialogTier(user, dialog, "String of Days Off Starting on Date");
    await user.click(within(dialog).getByRole("button", { name: "ADD BID" }));
    expect(await screen.findByLabelText("Bid for existing String of Days Off Starting on Date")).toBeInTheDocument();

    await waitFor(() => {
      expect(addSpy).toHaveBeenCalled();
    });
    expect(screen.getByRole("button", { name: "ALL PROPERTIES" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByPlaceholderText("Search Properties")).toHaveValue("starting");
    expect(screen.queryByText("Maximize Weekend Days Off")).not.toBeInTheDocument();
  });

  it("keeps Add tiers inside the configure dialog while Existing tiers stay visible", async () => {
    const user = userEvent.setup();
    const addSpy = vi.spyOn(daysOffService, "addCurrentDraftProperty");

    vi.mocked(daysOffService.getPageData).mockResolvedValueOnce({
      rightPanel: {
        ...structuredClone(daysOffPageData.rightPanel),
        existingProperties: [
          {
            id: "existing-211-1",
            propertyCode: 211,
            name: "Minimum Days Off Between Work Blocks",
            bid: { type: "stepper", value: 2, min: 1, max: 12 },
            tiers: [
              { key: "t1", label: "T1", active: true },
              { key: "t2", label: "T2", active: false },
            ],
          },
        ],
        availableProperties: [
          {
            id: "available-215",
            propertyCode: 215,
            name: "String of Days Off Starting on Date",
            favorited: false,
            bid: { type: "date", value: "2026-04-01" },
            tiers: [
              { key: "t1", label: "T1", active: true },
              { key: "t2", label: "T2", active: false },
            ],
          },
        ],
      },
    });

    renderDaysOffPage();

    await showAllDaysOffProperties(user);
    expect(await screen.findByLabelText("Toggle existing T1 for Minimum Days Off Between Work Blocks")).toBeInTheDocument();
    expect(screen.getAllByText("TIERS")).toHaveLength(1);
    const addWorkspace = screen.getByTestId("rule-bid-add-properties-workspace");

    expect(within(addWorkspace).queryByText("APPLY TO TIERS")).not.toBeInTheDocument();
    expect(within(addWorkspace).queryByText("BID")).not.toBeInTheDocument();
    expect(within(addWorkspace).getByTestId("rule-bid-available-row")).toHaveTextContent(
      "String of Days Off Starting on Date",
    );
    expect(screen.queryByLabelText("Toggle available T1 for String of Days Off Starting on Date")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add String of Days Off Starting on Date" }));
    const dialog = await screen.findByRole("dialog", { name: "Configure String of Days Off Starting on Date" });
    const dialogTierT1 = within(dialog).getByRole("button", { name: "Toggle T1 for String of Days Off Starting on Date" });
    const dialogTierT2 = within(dialog).getByRole("button", { name: "Toggle T2 for String of Days Off Starting on Date" });
    const addBidButton = within(dialog).getByRole("button", { name: "ADD BID" });

    expect(within(dialog).getByText("APPLY TO TIERS")).toHaveTextContent("APPLY TO TIERS · REQUIRED");
    expect(dialogTierT1).toHaveAttribute("aria-pressed", "false");
    expect(dialogTierT2).toHaveAttribute("aria-pressed", "false");
    expect(addBidButton).toBeDisabled();

    await user.click(dialogTierT2);
    expect(addBidButton).toBeEnabled();
    await user.click(addBidButton);

    await waitFor(() => {
      expect(addSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          tiers: expect.arrayContaining([
            expect.objectContaining({ label: "T1", active: false }),
            expect.objectContaining({ label: "T2", active: true }),
          ]),
        }),
        expect.any(Object),
      );
    });
  });

  it("hides external favorite actions and keeps the all tab stable after delete mutations", async () => {
    const user = userEvent.setup();
    const deleteSpy = vi.spyOn(daysOffService, "removeCurrentDraftProperty");

    vi.mocked(daysOffService.getPageData).mockResolvedValueOnce({
      preferOffConfig: structuredClone(daysOffPageData.preferOffConfig),
      rightPanel: {
        ...structuredClone(daysOffPageData.rightPanel),
        existingProperties: [
          {
            id: "existing-211-1",
            propertyCode: 211,
            name: "Minimum Days Off Between Work Blocks",
            bid: { type: "stepper", value: 2, min: 1, max: 12 },
            tiers: [{ key: "t1", label: "T1", active: true }],
          },
        ],
        availableProperties: [
          {
            id: "available-212",
            propertyCode: 212,
            name: "Maximize Weekend Days Off",
            favorited: false,
            bid: { type: "flag" },
            tiers: [{ key: "t1", label: "T1", active: true }],
          },
          {
            id: "available-215",
            propertyCode: 215,
            name: "String of Days Off Starting on Date",
            favorited: false,
            bid: { type: "date", value: "2026-04-01" },
            tiers: [{ key: "t1", label: "T1", active: true }],
          },
        ],
      },
    });

    renderDaysOffPage();

    await user.click(await screen.findByRole("button", { name: "ALL PROPERTIES" }));
    expect(screen.getByRole("button", { name: "ALL PROPERTIES" })).toHaveAttribute("aria-pressed", "true");
    await user.type(screen.getByPlaceholderText("Search Properties"), "weekend");

    expect(screen.queryByRole("button", { name: "Favorite Maximize Weekend Days Off" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ALL PROPERTIES" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByPlaceholderText("Search Properties")).toHaveValue("weekend");

    await user.click(screen.getByRole("button", { name: "Delete existing property Minimum Days Off Between Work Blocks" }));
    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith("existing-211-1", expect.any(Object));
    });
    expect(screen.getByRole("button", { name: "ALL PROPERTIES" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByPlaceholderText("Search Properties")).toHaveValue("weekend");
  });

  it("paginates available days off properties without moving the footer into the list", async () => {
    const user = userEvent.setup();

    vi.mocked(daysOffService.getPageData).mockResolvedValueOnce({
      rightPanel: {
        ...structuredClone(daysOffPageData.rightPanel),
        availableProperties: Array.from({ length: 11 }, (_, index) => buildAvailableDaysOffProperty(index + 1)),
      },
    });

    renderDaysOffPage();

    await user.click(await screen.findByRole("button", { name: "ALL PROPERTIES" }));
    expect(await screen.findByText("Days Off Property 01")).toBeInTheDocument();
    expect(screen.getByText("Total 11 items")).toBeInTheDocument();
    expect(screen.getByTestId("rule-bid-add-properties-footer")).toBeInTheDocument();
    expect(screen.queryByText("Days Off Property 11")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Go to next available properties page" }));

    expect(await screen.findByText("Days Off Property 11")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ALL PROPERTIES" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows add validation errors as a message and does not save conflicting days off properties", async () => {
    const user = userEvent.setup();
    const patchSpy = vi.spyOn(daysOffService, "patchCurrentDraftProperty");
    const addSpy = vi.spyOn(daysOffService, "addCurrentDraftProperty");

    vi.mocked(daysOffService.getPageData).mockResolvedValueOnce({
      rightPanel: {
        ...structuredClone(daysOffPageData.rightPanel),
        existingProperties: [
          {
            id: "existing-212-1",
            propertyCode: 212,
            name: "Maximize Weekend Days Off",
            bid: { type: "flag" },
            tiers: [{ key: "t1", label: "T1", active: true }],
          },
        ],
        availableProperties: [
          {
            id: "available-215",
            propertyCode: 215,
            name: "String of Days Off Starting on Date",
            favorited: true,
            bid: { type: "date", value: "2026-04-01" },
            tiers: [{ key: "t1", label: "T1", active: true }],
          },
        ],
      },
    });

    renderDaysOffPage();

    await showAllDaysOffProperties(user);
    await user.click(await screen.findByRole("button", { name: "Add String of Days Off Starting on Date" }));
    const dialog = await screen.findByRole("dialog", { name: "Configure String of Days Off Starting on Date" });
    await selectDaysOffDialogTier(user, dialog, "String of Days Off Starting on Date");
    await user.click(within(dialog).getByRole("button", { name: "ADD BID" }));

    expect(await screen.findByText("Only one maximize or string Days Off property can be active in T1.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 350));
    });

    expect(patchSpy).not.toHaveBeenCalled();
    expect(addSpy).not.toHaveBeenCalled();
  });

  it("hides modifiers for structural Days Off properties", async () => {
    const user = userEvent.setup();

    vi.mocked(daysOffService.getPageData).mockResolvedValueOnce({
      rightPanel: {
        ...structuredClone(daysOffPageData.rightPanel),
        existingProperties: [
          {
            id: "existing-204-1",
            propertyCode: 204,
            name: "Long Stretch Off / Compressed Flying",
            bid: {
              type: "stepper-date-range",
              value: 2,
              from: "2026-05-01",
              to: "2026-05-07",
              min: 1,
              max: 14,
            },
            tiers: [{ key: "t1", label: "T1", active: true }],
            allOrNothing: false,
            minimumN: null,
          },
        ],
      },
    });

    renderDaysOffPage();

    await user.click(await screen.findByRole("button", { name: "Edit existing property Long Stretch Off / Compressed Flying" }));
    const dialog = await screen.findByRole("dialog", { name: "Configure Long Stretch Off / Compressed Flying" });

    expect(within(dialog).queryByText("MODIFIERS")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("All or Nothing for Long Stretch Off / Compressed Flying")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Minimum N for Long Stretch Off / Compressed Flying")).not.toBeInTheDocument();
  });

  it("adds Long Stretch Off using whole-month range when date range is not limited", async () => {
    const user = userEvent.setup();
    const addSpy = vi.spyOn(daysOffService, "addCurrentDraftProperty");

    vi.mocked(daysOffService.getPageData).mockResolvedValueOnce({
      rightPanel: {
        ...structuredClone(daysOffPageData.rightPanel),
        availableProperties: [
          {
            id: "available-204",
            source: "catalog",
            propertyCode: 204,
            name: "Long Stretch Off / Compressed Flying",
            favorited: false,
            bid: {
              type: "stepper-date-range",
              value: 10,
              from: "2026-05-01",
              to: "2026-05-07",
              min: 1,
              max: 14,
            },
            tiers: [{ key: "t1", label: "T1", active: true }],
          },
        ],
      },
    });

    renderDaysOffPage();

    await showAllDaysOffProperties(user);
    await user.click(await screen.findByRole("button", { name: "Add Long Stretch Off / Compressed Flying" }));
    const dialog = await screen.findByRole("dialog", { name: "Configure Long Stretch Off / Compressed Flying" });
    const tierButton = within(dialog).getByRole("button", { name: "Toggle T1 for Long Stretch Off / Compressed Flying" });
    const addBidButton = within(dialog).getByRole("button", { name: "ADD BID" });

    expect(tierButton).toHaveAttribute("aria-pressed", "false");
    expect(within(dialog).getByRole("switch", { name: "Configure bid for Long Stretch Off / Compressed Flying limit to a date range" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(within(dialog).queryByText("PREFERENCE")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Award" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Avoid" })).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Whole bid month")).not.toBeInTheDocument();
    expect(addBidButton).toBeDisabled();
    expect(within(dialog).getByText("· REQUIRED")).toBeInTheDocument();
    await user.click(tierButton);
    expect(addBidButton).toBeEnabled();
    await user.click(addBidButton);

    await waitFor(() => {
      expect(addSpy).toHaveBeenCalledTimes(1);
    });

    const [property] = addSpy.mock.calls[0] ?? [];
    expect(property).toMatchObject({
      propertyCode: 204,
      name: "Long Stretch Off / Compressed Flying",
      action: "award",
      bid: {
        type: "stepper-date-range",
        value: 10,
        from: "2026-04-01",
        to: "2026-04-30",
      },
    });
  });

  it("blocks Long Stretch Off when a limited date range is too short", async () => {
    const user = userEvent.setup();
    const addSpy = vi.spyOn(daysOffService, "addCurrentDraftProperty");

    vi.mocked(daysOffService.getPageData).mockResolvedValueOnce({
      rightPanel: {
        ...structuredClone(daysOffPageData.rightPanel),
        availableProperties: [
          {
            id: "available-204",
            source: "catalog",
            propertyCode: 204,
            name: "Long Stretch Off / Compressed Flying",
            favorited: false,
            bid: {
              type: "stepper-date-range",
              value: 10,
              from: "2026-05-01",
              to: "2026-05-07",
              min: 1,
              max: 14,
            },
            tiers: [{ key: "t1", label: "T1", active: true }],
          },
        ],
      },
    });

    renderDaysOffPage();

    await showAllDaysOffProperties(user);
    await user.click(await screen.findByRole("button", { name: "Add Long Stretch Off / Compressed Flying" }));
    const dialog = await screen.findByRole("dialog", { name: "Configure Long Stretch Off / Compressed Flying" });
    await user.click(within(dialog).getByRole("switch", { name: "Configure bid for Long Stretch Off / Compressed Flying limit to a date range" }));

    await user.click(within(dialog).getByRole("button", {
      name: "Open Configure bid for Long Stretch Off / Compressed Flying date range calendar",
    }));
    await user.click(screen.getByRole("gridcell", { name: "Select 2026-04-01" }));
    await user.click(screen.getByRole("gridcell", { name: "Select 2026-04-03" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("date range must be at least 10 days long");
    expect(within(dialog).getByRole("button", { name: "ADD BID" })).toBeDisabled();
    expect(addSpy).not.toHaveBeenCalled();
  });

  it("configures employee schedule preference relationship and threshold", async () => {
    const user = userEvent.setup();
    const addSpy = vi.spyOn(daysOffService, "addCurrentDraftProperty");

    vi.mocked(daysOffService.getPageData).mockResolvedValueOnce({
      rightPanel: {
        ...structuredClone(daysOffPageData.rightPanel),
        availableProperties: [
          {
            id: "available-206",
            propertyCode: 206,
            name: "Employee Schedule Preference",
            favorited: false,
            bid: {
              type: "employee-schedule-preference",
              crewId: "",
              relationship: "together",
              scheduleType: "days_off",
              thresholdType: "minimum",
              days: 1,
              min: 1,
              max: 31,
            },
            tiers: [{ key: "t1", label: "T1", active: true }],
          },
        ],
      },
    });

    renderDaysOffPage();

    vi.mocked(pbsUserService.searchCrewOptions).mockResolvedValue({
      query: "DIA",
      limit: 20,
      options: [
        {
          value: "817",
          label: "Diana Crew",
          crewId: "817",
          userName: "Diana Crew",
          userCode: "diana.crew",
          base: "YEG",
          rank: "FA",
          division: "C",
        },
      ],
    });

    await showAllDaysOffProperties(user);
    await user.click(await screen.findByRole("button", { name: "Add Employee Schedule Preference" }));
    const dialog = await screen.findByRole("dialog", { name: "Configure Employee Schedule Preference" });

    expect(within(dialog).getByLabelText("Configure bid for Employee Schedule Preference crew")).toBeInTheDocument();
    expect(within(dialog).getByText("Relationship")).toBeInTheDocument();
    expect(within(dialog).getByText("Schedule Type")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "ADD BID" })).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText("Configure bid for Employee Schedule Preference crew"), {
      target: { value: "dia" },
    });
    await user.click(await within(dialog).findByRole("option", { name: /Diana Crew/i }));
    await user.click(within(dialog).getByRole("button", { name: "Apart" }));
    fireEvent.change(within(dialog).getByLabelText("Configure bid for Employee Schedule Preference days"), {
      target: { value: "12" },
    });
    await selectDaysOffDialogTier(user, dialog, "Employee Schedule Preference");
    await user.click(within(dialog).getByRole("button", { name: "ADD BID" }));

    await waitFor(() => {
      expect(addSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          propertyCode: 206,
          bid: {
            type: "employee-schedule-preference",
            crewId: "817",
            crewName: "Diana Crew",
            relationship: "apart",
            scheduleType: "days_off",
            thresholdType: "minimum",
            days: 12,
            min: 1,
            max: 31,
          },
        }),
        expect.any(Object),
      );
    });
    expect(await screen.findByLabelText("Bid for existing Employee Schedule Preference")).toHaveTextContent(
      "Apart · Days Off · Crew Diana Crew · Minimum 12",
    );
  });

  it("configures days off / days on pattern and validates days on order", async () => {
    const user = userEvent.setup();
    const addSpy = vi.spyOn(daysOffService, "addCurrentDraftProperty");

    vi.mocked(daysOffService.getPageData).mockResolvedValueOnce({
      rightPanel: {
        ...structuredClone(daysOffPageData.rightPanel),
        availableProperties: [
          {
            id: "available-205",
            propertyCode: 205,
            name: "Days Off / Days On Pattern",
            favorited: false,
            bid: {
              type: "days-off-on-pattern",
              minDaysOff: 3,
              minDaysOn: 3,
              maxDaysOn: 5,
              min: 1,
              max: 14,
            },
            tiers: [{ key: "t1", label: "T1", active: true }],
          },
        ],
      },
    });

    renderDaysOffPage();

    await showAllDaysOffProperties(user);
    await user.click(await screen.findByRole("button", { name: "Add Days Off / Days On Pattern" }));
    const dialog = await screen.findByRole("dialog", { name: "Configure Days Off / Days On Pattern" });

    expect(within(dialog).getByText("WORK DAYS MIN")).toBeInTheDocument();
    expect(within(dialog).getByText("WORK DAYS MAX")).toBeInTheDocument();
    expect(within(dialog).getByText("DAYS OFF")).toBeInTheDocument();
    expect(within(dialog).getByText("Work 3-5 days, then 3 days off")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Configure bid for Days Off / Days On Pattern min days on")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Configure bid for Days Off / Days On Pattern max days on")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Configure bid for Days Off / Days On Pattern minimum days off")).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText("Configure bid for Days Off / Days On Pattern min days on"), {
      target: { value: "6" },
    });
    fireEvent.change(within(dialog).getByLabelText("Configure bid for Days Off / Days On Pattern max days on"), {
      target: { value: "4" },
    });

    expect(within(dialog).getByRole("button", { name: "ADD BID" })).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText("Configure bid for Days Off / Days On Pattern min days on"), {
      target: { value: "4" },
    });
    fireEvent.change(within(dialog).getByLabelText("Configure bid for Days Off / Days On Pattern max days on"), {
      target: { value: "5" },
    });
    fireEvent.change(within(dialog).getByLabelText("Configure bid for Days Off / Days On Pattern minimum days off"), {
      target: { value: "5" },
    });
    await selectDaysOffDialogTier(user, dialog, "Days Off / Days On Pattern");
    await user.click(within(dialog).getByRole("button", { name: "ADD BID" }));

    await waitFor(() => {
      expect(addSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          propertyCode: 205,
          bid: {
            type: "days-off-on-pattern",
            minDaysOff: 5,
            minDaysOn: 4,
            maxDaysOn: 5,
            min: 1,
            max: 14,
          },
        }),
        expect.any(Object),
      );
    });
    expect(await screen.findByLabelText("Bid for existing Days Off / Days On Pattern")).toHaveTextContent(
      "Work 4-5 days, then 5 days off",
    );
  });

  it("shows API add failures through the message layer without rendering the panel alert", async () => {
    const user = userEvent.setup();

    vi.mocked(daysOffService.getPageData).mockResolvedValueOnce({
      rightPanel: {
        ...structuredClone(daysOffPageData.rightPanel),
        availableProperties: [
          {
            id: "available-205",
            propertyCode: 205,
            name: "Days Off / Days On Pattern",
            favorited: false,
            bid: {
              type: "days-off-on-pattern",
              minDaysOff: 3,
              minDaysOn: 3,
              maxDaysOn: 5,
              min: 1,
              max: 14,
            },
            tiers: [{ key: "t1", label: "T1", active: true }],
          },
        ],
      },
    });
    vi.mocked(daysOffService.addCurrentDraftProperty).mockRejectedValueOnce({
      response: {
        data: {
          message: "Invalid days off property payload.",
        },
      },
    });

    renderDaysOffPage();

    await showAllDaysOffProperties(user);
    await user.click(await screen.findByRole("button", { name: "Add Days Off / Days On Pattern" }));
    const dialog = await screen.findByRole("dialog", { name: "Configure Days Off / Days On Pattern" });
    await selectDaysOffDialogTier(user, dialog, "Days Off / Days On Pattern");
    await user.click(within(dialog).getByRole("button", { name: "ADD BID" }));

    expect(await screen.findByText("Invalid days off property payload.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("edits an existing Prefer Off bid through the Days Off dialog", async () => {
    const user = userEvent.setup();
    const patchSpy = vi.spyOn(daysOffService, "patchCurrentDraftProperty");

    vi.mocked(daysOffService.getPageData).mockResolvedValueOnce({
      rightPanel: {
        ...structuredClone(daysOffPageData.rightPanel),
        existingProperties: [
          {
            id: "existing-201-1",
            propertyCode: 201,
            name: "Prefer Off",
            bid: { type: "tag-list", values: ["2026-04-10", "Window 08:00-18:00"], suggestions: [] },
            tiers: [{ key: "t1", label: "T1", active: true }],
            allOrNothing: true,
            minimumN: 1,
          },
        ],
      },
    });

    renderDaysOffPage();

    await user.click(await screen.findByRole("button", { name: "Edit existing property Prefer Off" }));
    const dialog = await screen.findByRole("dialog", { name: "Configure Prefer Off" });

    expect(within(dialog).getByRole("button", { name: "Remove Prefer Off date 2026-04-10" })).toBeInTheDocument();
    expect(within(dialog).getByRole("switch", { name: "Prefer Off time window" })).toHaveAttribute("aria-checked", "true");
    expect(within(dialog).getByLabelText("Prefer Off time from")).toHaveValue("08:00");
    expect(within(dialog).queryByText("FULFILMENT")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Remove Prefer Off date 2026-04-10" }));
    await user.click(within(dialog).getByRole("button", { name: "Open Prefer Off calendar" }));
    await user.click(screen.getByRole("gridcell", { name: "Select 2026-04-12" }));
    await user.click(within(dialog).getByRole("button", { name: "UPDATE BID" }));

    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith(
        "existing-201-1",
        expect.objectContaining({
          propertyCode: 201,
          bid: expect.objectContaining({
            type: "tag-list",
            values: ["2026-04-12", "Window 08:00-18:00"],
          }),
          allOrNothing: true,
          minimumN: null,
          maximumN: null,
        }),
        expect.any(Object),
      );
    });
  });

  it("does not open a requested existing Prefer Off edit dialog as pending when the period is closed", async () => {
    const handledSpy = vi.fn();
    const patchSpy = vi.spyOn(daysOffService, "patchCurrentDraftProperty");
    const pageData = structuredClone(daysOffPageData);
    pageData.rightPanel.draftMeta.currentPeriod = {
      ...pageData.rightPanel.draftMeta.currentPeriod!,
      status: "CLOSED",
      computedStage: "CLOSED",
      canEditBid: false,
      readOnlyReason: "Bidding is closed for Apr 2026.",
    };
    pageData.rightPanel.existingProperties = [
      {
        id: "existing-201-closed",
        propertyCode: 201,
        name: "Prefer Off",
        bid: { type: "tag-list", values: ["2026-04-10"], suggestions: [] },
        tiers: [{ key: "t1", label: "T1", active: true }],
        allOrNothing: false,
        minimumN: null,
        maximumN: null,
      },
    ];
    vi.mocked(daysOffService.getPageData).mockResolvedValueOnce(pageData);

    renderDaysOffPage({
      requestedExistingPropertyId: "existing-201-closed",
      onRequestedExistingPropertyHandled: handledSpy,
    });

    expect((await screen.findAllByText("Prefer Off")).length).toBeGreaterThan(0);

    await waitFor(() => {
      expect(handledSpy).toHaveBeenCalledTimes(1);
    });

    expect(screen.queryByRole("dialog", { name: "Configure Prefer Off" })).not.toBeInTheDocument();
    expect(screen.queryByText("UPDATING...")).not.toBeInTheDocument();
    expect(patchSpy).not.toHaveBeenCalled();
  });

  it("shows Updating only while an open-period Prefer Off update request is pending", async () => {
    const user = userEvent.setup();
    let resolvePatch: ((value: Awaited<ReturnType<typeof daysOffService.patchCurrentDraftProperty>>) => void) | null = null;
    const pageData = structuredClone(daysOffPageData);
    pageData.rightPanel.existingProperties = [
      {
        id: "existing-201-pending",
        propertyCode: 201,
        name: "Prefer Off",
        bid: { type: "tag-list", values: ["2026-04-10"], suggestions: [] },
        tiers: [{ key: "t1", label: "T1", active: true }],
        allOrNothing: false,
        minimumN: null,
        maximumN: null,
      },
    ];
    vi.mocked(daysOffService.getPageData).mockResolvedValueOnce(pageData);
    vi.mocked(daysOffService.patchCurrentDraftProperty).mockImplementationOnce(() =>
      new Promise((resolve) => {
        resolvePatch = resolve;
      }));

    renderDaysOffPage();

    await user.click(await screen.findByRole("button", { name: "Edit existing property Prefer Off" }));
    const dialog = await screen.findByRole("dialog", { name: "Configure Prefer Off" });
    await user.click(within(dialog).getByRole("button", { name: "Remove Prefer Off date 2026-04-10" }));
    await user.click(within(dialog).getByRole("button", { name: "Open Prefer Off calendar" }));
    await user.click(screen.getByRole("gridcell", { name: "Select 2026-04-12" }));
    await user.click(within(dialog).getByRole("button", { name: "UPDATE BID" }));

    await waitFor(() => {
      expect(within(dialog).getByRole("button", { name: "UPDATING..." })).toBeDisabled();
    });

    await act(async () => {
      resolvePatch?.({
        saved: true,
        draftKey: "draft-1",
        bidId: 1,
        periodId: 42,
        periodCode: "Apr 2026",
        draftVersion: 1,
        propertyGroupKey: "existing-201-pending",
        tiers: ["T1"],
      });
    });
  });

  it("opens imported Prefer Off tag-list dates with the same editable state as manual entries", async () => {
    const user = userEvent.setup();

    vi.mocked(daysOffService.getPageData).mockResolvedValueOnce({
      rightPanel: {
        ...structuredClone(daysOffPageData.rightPanel),
        existingProperties: [
          {
            id: "existing-imported-201",
            propertyCode: 201,
            name: "Prefer Off",
            bid: {
              type: "tag-list",
              values: ["2026-06-01", "2026-06-03", "2026-06-05"],
              suggestions: [],
            },
            tiers: [{ key: "t1", label: "T1", active: true }],
            allOrNothing: false,
            minimumN: null,
          },
        ],
      },
    });

    renderDaysOffPage();

    await user.click(await screen.findByRole("button", { name: "Edit existing property Prefer Off" }));
    const dialog = await screen.findByRole("dialog", { name: "Configure Prefer Off" });

    expect(within(dialog).getByRole("button", { name: "Remove Prefer Off date 2026-06-01" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Remove Prefer Off date 2026-06-03" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Remove Prefer Off date 2026-06-05" })).toBeInTheDocument();
    expect(within(dialog).queryByText(/\{"dates"/)).not.toBeInTheDocument();
  });

  it("configures Specific Dates before adding the unified Prefer Off bid", async () => {
    const user = userEvent.setup();
    const addSpy = vi.spyOn(daysOffService, "addCurrentDraftProperty");

    vi.mocked(daysOffService.getPageData).mockResolvedValueOnce({
      preferOffConfig: structuredClone(daysOffPageData.preferOffConfig),
      rightPanel: {
        ...structuredClone(daysOffPageData.rightPanel),
        availableProperties: [
          {
            id: "available-201",
            propertyCode: 201,
            name: "Prefer Off",
            favorited: false,
            bid: { type: "tag-list", values: [], suggestions: [] },
            tiers: [{ key: "t1", label: "T1", active: true }],
          },
        ],
      },
    });

    renderDaysOffPage();

    await showAllDaysOffProperties(user);
    await user.click(await screen.findByRole("button", { name: "Add Prefer Off" }));
    const dialog = await screen.findByRole("dialog", { name: "Configure Prefer Off" });

    expect(within(dialog).getByText("PREFER OFF TYPE")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Specific Dates" })).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByRole("button", { name: "Days of Week" })).toBeEnabled();
    expect(within(dialog).getByRole("button", { name: "Date Range" })).toBeEnabled();
    expect(within(dialog).getByRole("button", { name: "ADD BID" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Toggle T1 for Prefer Off" })).toHaveAttribute("aria-pressed", "false");
    expect(within(dialog).getByText("· REQUIRED")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Open Prefer Off calendar" }));
    await user.click(screen.getByRole("gridcell", { name: "Select 2026-04-10" }));
    expect(within(dialog).queryByText("FULFILMENT")).not.toBeInTheDocument();
    await selectDaysOffDialogTier(user, dialog, "Prefer Off");
    await user.click(within(dialog).getByRole("button", { name: "ADD BID" }));

    await waitFor(() => {
      expect(addSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          propertyCode: 201,
          bid: expect.objectContaining({
            type: "tag-list",
            values: ["2026-04-10"],
          }),
          allOrNothing: true,
          minimumN: null,
          maximumN: null,
        }),
        expect.any(Object),
      );
    });
    expect(await screen.findByLabelText("Bid for existing Prefer Off")).toHaveTextContent("Apr 10, 2026");
  });

  it("configures Days of Week inside the unified Prefer Off dialog", async () => {
    const user = userEvent.setup();
    const addSpy = vi.spyOn(daysOffService, "addCurrentDraftProperty");

    vi.mocked(daysOffService.getPageData).mockResolvedValueOnce({
      preferOffConfig: structuredClone(daysOffPageData.preferOffConfig),
      rightPanel: {
        ...structuredClone(daysOffPageData.rightPanel),
        availableProperties: [
          {
            id: "available-201",
            propertyCode: 201,
            name: "Prefer Off",
            favorited: false,
            bid: { type: "tag-list", values: [], suggestions: [] },
            tiers: [{ key: "t1", label: "T1", active: true }],
          },
        ],
      },
    });

    renderDaysOffPage();

    await showAllDaysOffProperties(user);
    await user.click(await screen.findByRole("button", { name: "Add Prefer Off" }));
    const dialog = await screen.findByRole("dialog", { name: "Configure Prefer Off" });

    await user.click(within(dialog).getByRole("button", { name: "Days of Week" }));
    expect(within(dialog).getByText("PREFER OFF TYPE")).toBeInTheDocument();
    expect(within(dialog).getByText("DAYS OF WEEK")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Monday" }));
    await user.click(within(dialog).getByRole("button", { name: "Friday" }));
    expect(within(dialog).queryByText("FULFILMENT")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "All selected periods" })).not.toBeInTheDocument();
    await selectDaysOffDialogTier(user, dialog, "Prefer Off");
    await user.click(within(dialog).getByRole("button", { name: "ADD BID" }));

    await waitFor(() => {
      expect(addSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          propertyCode: 201,
          bid: expect.objectContaining({
            type: "tag-list",
            values: ["Monday", "Friday"],
          }),
          allOrNothing: true,
          minimumN: null,
          maximumN: null,
        }),
        expect.any(Object),
      );
    });
  });

  it("configures dictionary-backed Weekends with a time window", async () => {
    const user = userEvent.setup();
    const addSpy = vi.spyOn(daysOffService, "addCurrentDraftProperty");

    vi.mocked(daysOffService.getPageData).mockResolvedValueOnce({
      preferOffConfig: structuredClone(daysOffPageData.preferOffConfig),
      rightPanel: {
        ...structuredClone(daysOffPageData.rightPanel),
        availableProperties: [
          {
            id: "available-201",
            propertyCode: 201,
            name: "Prefer Off",
            favorited: false,
            bid: { type: "tag-list", values: [], suggestions: [] },
            tiers: [{ key: "t1", label: "T1", active: true }],
          },
        ],
      },
    });

    renderDaysOffPage();

    await showAllDaysOffProperties(user);
    await user.click(await screen.findByRole("button", { name: "Add Prefer Off" }));
    const dialog = await screen.findByRole("dialog", { name: "Configure Prefer Off" });

    await user.click(within(dialog).getByRole("button", { name: "Weekends" }));
    expect(within(dialog).getByText("Saturday 00:00 – Sunday 24:00")).toBeInTheDocument();
    expect(within(dialog).getByText("4 weekends")).toBeInTheDocument();
    expect(within(dialog).queryByText("FULFILMENT")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "All selected periods" })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("switch", { name: "Prefer Off time window" }));
    fireEvent.change(within(dialog).getByLabelText("Prefer Off time from"), { target: { value: "08:00" } });
    fireEvent.change(within(dialog).getByLabelText("Prefer Off time to"), { target: { value: "18:00" } });
    await selectDaysOffDialogTier(user, dialog, "Prefer Off");
    await user.click(within(dialog).getByRole("button", { name: "ADD BID" }));

    await waitFor(() => {
      expect(addSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          propertyCode: 201,
          bid: expect.objectContaining({
            type: "tag-list",
            values: ["Weekends", "Window 08:00-18:00"],
          }),
          allOrNothing: true,
          minimumN: null,
          maximumN: null,
        }),
        expect.any(Object),
      );
    });
  });

  it("disables Favorite for explicit dates while keeping Add Bid available", async () => {
    const user = userEvent.setup();
    const favoriteSpy = vi.spyOn(daysOffService, "favoriteProperty");
    const addSpy = vi.spyOn(daysOffService, "addCurrentDraftProperty");

    vi.mocked(daysOffService.getPageData).mockResolvedValueOnce({
      preferOffConfig: structuredClone(daysOffPageData.preferOffConfig),
      rightPanel: {
        ...structuredClone(daysOffPageData.rightPanel),
        availableProperties: [
          {
            id: "available-201",
            source: "catalog",
            propertyCode: 201,
            name: "Prefer Off",
            favorited: false,
            bid: { type: "tag-list", values: [], suggestions: [] },
            tiers: [{ key: "t1", label: "T1", active: true }],
          },
        ],
      },
    });

    renderDaysOffPage();

    await showAllDaysOffProperties(user);
    await user.click(await screen.findByRole("button", { name: "Add Prefer Off" }));
    const dialog = await screen.findByRole("dialog", { name: "Configure Prefer Off" });

    expect(within(dialog).getByRole("button", { name: "SAVE FAVORITE" })).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "Open Prefer Off calendar" }));
    await user.click(screen.getByRole("gridcell", { name: "Select 2026-04-10" }));
    await selectDaysOffDialogTier(user, dialog, "Prefer Off");
    expect(within(dialog).getByRole("button", { name: "SAVE FAVORITE" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "ADD BID" })).toBeEnabled();
    await user.click(within(dialog).getByRole("button", { name: "ADD BID" }));

    await waitFor(() => {
      expect(addSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          propertyCode: 201,
          bid: expect.objectContaining({
            type: "tag-list",
            values: ["2026-04-10"],
          }),
        }),
        expect.any(Object),
      );
    });
    expect(favoriteSpy).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Configure Prefer Off" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Bid for existing Prefer Off")).toBeInTheDocument();
  });

  it("adds a configured favorite directly without reopening the configure dialog", async () => {
    const user = userEvent.setup();
    const addSpy = vi.spyOn(daysOffService, "addCurrentDraftProperty");
    const deleteFavoriteSpy = vi.spyOn(daysOffService, "unfavoriteProperty");

    vi.mocked(daysOffService.getPageData).mockResolvedValueOnce({
      preferOffConfig: structuredClone(daysOffPageData.preferOffConfig),
      rightPanel: {
        ...structuredClone(daysOffPageData.rightPanel),
        availableProperties: [
          {
            id: "available-201",
            source: "catalog",
            propertyCode: 201,
            name: "Prefer Off",
            favorited: false,
            bid: { type: "tag-list", values: [], suggestions: [] },
            tiers: [{ key: "t1", label: "T1", active: true }],
          },
          {
            id: "favorite-favorite-201",
            favoriteKey: "favorite-201",
            propertyId: 201,
            source: "favorite",
            propertyCode: 201,
            name: "Prefer Off",
            favorited: true,
            bid: { type: "tag-list", values: ["2026-04-10"], suggestions: [] },
            tiers: [
              { key: "t1", label: "T1", active: false },
              { key: "t2", label: "T2", active: false },
            ],
            allOrNothing: false,
            minimumN: null,
          },
        ],
      },
    });

    renderDaysOffPage();

    await user.click(await screen.findByRole("button", { name: "FAVORITED PROPERTIES" }));
    const addWorkspace = screen.getByTestId("rule-bid-add-properties-workspace");

    expect(within(addWorkspace).queryByText("APPLY TO TIERS")).not.toBeInTheDocument();
    expect(within(addWorkspace).queryByText("BID")).not.toBeInTheDocument();
    expect(within(addWorkspace).queryByText("Saved setup")).not.toBeInTheDocument();
    expect(within(addWorkspace).getByLabelText("Favorite bid for Prefer Off")).toHaveTextContent("2026-04-10");
    const favoriteT2 = within(addWorkspace).getByRole("button", {
      name: "Select T2 for favorite Prefer Off",
    });
    expect(favoriteT2).toHaveAttribute("aria-pressed", "false");
    expect(within(addWorkspace).queryByText("AON")).not.toBeInTheDocument();
    expect(within(addWorkspace).queryByText("Min 1")).not.toBeInTheDocument();

    await user.click(favoriteT2);
    await user.click(screen.getByRole("button", { name: "Add Prefer Off" }));

    await waitFor(() => {
      expect(addSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "favorite-favorite-201",
          propertyCode: 201,
          bid: expect.objectContaining({
            type: "tag-list",
            values: ["2026-04-10"],
          }),
          allOrNothing: false,
          minimumN: null,
          maximumN: null,
        }),
        expect.any(Object),
      );
    });
    expect(screen.queryByRole("dialog", { name: "Configure Prefer Off" })).not.toBeInTheDocument();
    expect(await screen.findByLabelText("Bid for existing Prefer Off")).toHaveTextContent("Apr 10, 2026");

    await user.click(screen.getByRole("button", { name: "Remove favorite Prefer Off" }));
    expect(deleteFavoriteSpy).not.toHaveBeenCalled();
    expect(screen.getByText("Remove this favorite?")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Cancel removing favorite Prefer Off" }),
    );
    expect(screen.queryByText("Remove this favorite?")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove favorite Prefer Off" }));
    await user.click(
      screen.getByRole("button", { name: "Confirm remove favorite Prefer Off" }),
    );

    await waitFor(() => {
      expect(deleteFavoriteSpy).toHaveBeenCalledWith("favorite-201", expect.any(Object));
    });
    expect(screen.queryByRole("button", { name: "Add Prefer Off" })).not.toBeInTheDocument();
  });

  it("edits a configured favorite without changing its selected Tx or existing bids", async () => {
    const user = userEvent.setup();
    const patchFavoriteSpy = vi.spyOn(daysOffService, "patchFavoriteProperty");
    const addSpy = vi.spyOn(daysOffService, "addCurrentDraftProperty");
    const pageData = structuredClone(daysOffPageData);
    const favorite: RuleBidAvailableProperty = {
      id: "favorite-edit-201",
      favoriteKey: "favorite-edit-201",
      propertyId: 201,
      source: "favorite",
      propertyCode: 201,
      name: "Prefer Off",
      favorited: true,
      bid: { type: "tag-list", values: ["Weekends"], suggestions: [] },
      tiers: [
        { key: "t1", label: "T1", active: false },
        { key: "t2", label: "T2", active: true },
      ],
      allOrNothing: false,
      minimumN: null,
    };
    pageData.rightPanel.availableProperties = [favorite];
    vi.mocked(daysOffService.getPageData).mockResolvedValueOnce(pageData);

    renderDaysOffPage();

    await user.click(await screen.findByRole("button", { name: `Edit favorite ${favorite.name}` }));
    const dialog = await screen.findByRole("dialog", { name: `Configure ${favorite.name}` });
    expect(within(dialog).queryByText("APPLY TO TIERS")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Specific Dates" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Date Range" })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Days of Week" })).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Weekends" })).toBeVisible();
    expect(within(dialog).getByText("TIME WINDOW")).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "UPDATE FAVORITE" }));

    await waitFor(() => {
      expect(patchFavoriteSpy).toHaveBeenCalledWith(
        favorite.favoriteKey,
        expect.objectContaining({
          propertyCode: favorite.propertyCode,
        }),
        expect.any(Object),
      );
    });
    expect(addSpy).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: `Configure ${favorite.name}` })).not.toBeInTheDocument();
    expect(screen.getByRole("button", {
      name: `Select T2 for favorite ${favorite.name}`,
    })).toHaveAttribute("aria-pressed", "true");
  });

  it("offers persistent recovery when a favorite was deleted in another session", async () => {
    const user = userEvent.setup();
    const pageData = structuredClone(daysOffPageData);
    const favorite: RuleBidAvailableProperty = {
      id: "favorite-missing-201",
      favoriteKey: "favorite-missing-201",
      propertyId: 201,
      source: "favorite",
      propertyCode: 201,
      name: "Prefer Off",
      favorited: true,
      bid: { type: "tag-list", values: ["Weekends"], suggestions: [] },
      tiers: [{ key: "t1", label: "T1", active: true }],
      allOrNothing: false,
      minimumN: null,
    };
    pageData.rightPanel.availableProperties = [favorite];
    const reloadedPageData = structuredClone(pageData);
    reloadedPageData.rightPanel.availableProperties = [];
    vi.mocked(daysOffService.getPageData)
      .mockResolvedValueOnce(pageData)
      .mockResolvedValueOnce(reloadedPageData);
    vi.mocked(daysOffService.patchFavoriteProperty).mockRejectedValueOnce({
      response: { status: 404, data: { message: "Favorite not found." } },
    });

    renderDaysOffPage();

    await user.click(await screen.findByRole("button", { name: `Edit favorite ${favorite.name}` }));
    const dialog = await screen.findByRole("dialog", { name: `Configure ${favorite.name}` });
    await user.click(within(dialog).getByRole("button", { name: "UPDATE FAVORITE" }));

    const recoveryAlert = await screen.findByRole("alert");
    expect(recoveryAlert).toHaveTextContent("This favorite no longer exists.");
    expect(screen.queryByRole("dialog", { name: `Configure ${favorite.name}` })).not.toBeInTheDocument();
    await user.click(within(recoveryAlert).getByRole("button", { name: "Reload draft" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: `Edit favorite ${favorite.name}` })).not.toBeInTheDocument();
    });
  });

  it("keeps favorite tier selections and offers draft reload after a 409 add conflict", async () => {
    const user = userEvent.setup();
    vi.mocked(daysOffService.getPageData).mockResolvedValueOnce({
      preferOffConfig: structuredClone(daysOffPageData.preferOffConfig),
      rightPanel: {
        ...structuredClone(daysOffPageData.rightPanel),
        availableProperties: [{
          id: "favorite-conflict-201",
          favoriteKey: "favorite-conflict-201",
          propertyId: 201,
          source: "favorite",
          propertyCode: 201,
          name: "Prefer Off",
          favorited: true,
          bid: { type: "tag-list", values: ["2026-04-10"], suggestions: [] },
          tiers: [
            { key: "t1", label: "T1", active: false },
            { key: "t2", label: "T2", active: false },
          ],
        }],
      },
    });
    vi.mocked(daysOffService.addCurrentDraftProperty).mockRejectedValueOnce({
      response: { status: 409, data: { message: "Draft version conflict." } },
    });

    renderDaysOffPage();

    const favoriteT2 = await screen.findByRole("button", {
      name: "Select T2 for favorite Prefer Off",
    });
    await user.click(favoriteT2);
    await user.click(screen.getByRole("button", { name: "Add Prefer Off" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This bid changed in another request.",
    );
    expect(screen.getByRole("button", { name: "Reload draft" })).toBeInTheDocument();
    expect(favoriteT2).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByLabelText("Bid for existing Prefer Off")).not.toBeInTheDocument();
  });

  it("allows adding overlapping Prefer Off dates in T2 when T1 already has the same dates", async () => {
    const user = userEvent.setup();
    const addSpy = vi.spyOn(daysOffService, "addCurrentDraftProperty");

    vi.mocked(daysOffService.getPageData).mockResolvedValueOnce({
      rightPanel: {
        ...structuredClone(daysOffPageData.rightPanel),
        draftMeta: {
          ...daysOffPageData.rightPanel.draftMeta,
          periodCode: "Apr 2026",
        },
        existingProperties: [
          {
            id: "existing-201-list",
            propertyCode: 201,
            name: "Prefer Off",
            bid: {
              type: "tag-list",
              values: ["2026-04-19", "2026-04-20", "2026-04-21", "2026-04-22", "2026-04-30"],
              suggestions: [],
            },
            tiers: [{ key: "t1", label: "T1", active: true }],
            allOrNothing: false,
            minimumN: null,
          },
        ],
        availableProperties: [
          {
            id: "available-201",
            propertyCode: 201,
            name: "Prefer Off",
            favorited: false,
            bid: { type: "tag-list", values: [], suggestions: [] },
            tiers: [
              { key: "t1", label: "T1", active: false },
              { key: "t2", label: "T2", active: true },
            ],
          },
        ],
      },
    });

    renderDaysOffPage();

    await showAllDaysOffProperties(user);
    await user.click(await screen.findByRole("button", { name: "Add Prefer Off" }));
    const dialog = await screen.findByRole("dialog", { name: "Configure Prefer Off" });

    await user.click(within(dialog).getByRole("button", { name: "Date Range" }));
    expect(within(dialog).getByText("PREFER OFF TYPE")).toBeInTheDocument();
    expect(within(dialog).getByText("DATE RANGE")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Open Prefer Off calendar" }));
    await user.click(screen.getByRole("gridcell", { name: "Select 2026-04-19" }));
    await user.click(screen.getByRole("gridcell", { name: "Select 2026-04-22" }));
    await selectDaysOffDialogTier(user, dialog, "Prefer Off", "T2");
    await user.click(within(dialog).getByRole("button", { name: "ADD BID" }));

    await waitFor(() => {
      expect(addSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          propertyCode: 201,
          bid: expect.objectContaining({
            type: "tag-list",
            values: ["Between 2026-04-19 - 2026-04-22"],
          }),
          tiers: expect.arrayContaining([
            expect.objectContaining({ label: "T2", active: true }),
          ]),
        }),
        expect.any(Object),
      );
    });
    expect(screen.queryByText(/Prefer Off dates overlap/)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("cancels the Days Off configure dialog without adding a property", async () => {
    const user = userEvent.setup();
    const addSpy = vi.spyOn(daysOffService, "addCurrentDraftProperty");

    vi.mocked(daysOffService.getPageData).mockResolvedValueOnce({
      rightPanel: {
        ...structuredClone(daysOffPageData.rightPanel),
        availableProperties: [
          {
            id: "available-212",
            propertyCode: 212,
            name: "Maximize Weekend Days Off",
            favorited: false,
            bid: { type: "flag" },
            tiers: [{ key: "t1", label: "T1", active: true }],
          },
        ],
      },
    });

    renderDaysOffPage();

    await showAllDaysOffProperties(user);
    await user.click(await screen.findByRole("button", { name: "Add Maximize Weekend Days Off" }));
    const dialog = await screen.findByRole("dialog", { name: "Configure Maximize Weekend Days Off" });
    await user.click(within(dialog).getByRole("button", { name: "CANCEL" }));

    expect(screen.queryByRole("dialog", { name: "Configure Maximize Weekend Days Off" })).not.toBeInTheDocument();
    expect(addSpy).not.toHaveBeenCalled();
  });

  it("shows the Waive Minimum Days Off persistent message", async () => {
    vi.mocked(daysOffService.getPageData).mockResolvedValueOnce({
      rightPanel: {
        ...structuredClone(daysOffPageData.rightPanel),
        existingProperties: [
          {
            id: "existing-217-1",
            propertyCode: 217,
            name: "Waive Minimum Days Off",
            bid: { type: "flag" },
            tiers: [{ key: "t2", label: "T2", active: true }],
          },
        ],
      },
    });

    renderDaysOffPage();

    expect(await screen.findByText("Waive Minimum Days Off from T2 applies to later tiers in this draft.")).toBeInTheDocument();
  });

  it("blocks restrictive minimum days off increases across tiers", async () => {
    const patchSpy = vi.spyOn(daysOffService, "patchCurrentDraftProperty");

    vi.mocked(daysOffService.getPageData).mockResolvedValueOnce({
      rightPanel: {
        ...structuredClone(daysOffPageData.rightPanel),
        existingProperties: [
          {
            id: "existing-211-1",
            propertyCode: 211,
            name: "Minimum Days Off Between Work Blocks",
            bid: { type: "stepper", value: 2, min: 1, max: 12 },
            tiers: [{ key: "t1", label: "T1", active: true }],
          },
          {
            id: "existing-211-2",
            propertyCode: 211,
            name: "Minimum Days Off Between Work Blocks",
            bid: { type: "stepper", value: 3, min: 1, max: 12 },
            tiers: [{ key: "t3", label: "T3", active: true }],
          },
        ],
      },
    });

    renderDaysOffPage();

    expect(
      await screen.findByText("Minimum Days Off Between Work Blocks in T3 cannot be greater than the earlier value from T1."),
    ).toBeInTheDocument();
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 350));
    });

    expect(patchSpy).not.toHaveBeenCalled();
  });
});
