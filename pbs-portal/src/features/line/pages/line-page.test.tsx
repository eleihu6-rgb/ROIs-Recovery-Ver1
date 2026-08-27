import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppProviders } from "@/app/providers/app-providers";
import { linePageData } from "@/features/line/mock";
import { LinePage } from "@/features/line/pages/line-page";
import type { RuleBidRightPanelPresentation } from "@/features/rule-bids/components/rule-bid-right-panel";
import { queryClient } from "@/shared/query/query-client";
import { lineService } from "@/shared/services/line-service";

const renderLinePage = (presentation?: RuleBidRightPanelPresentation) =>
  render(
    <AppProviders>
      <LinePage presentation={presentation} />
    </AppProviders>,
  );

const showAllLineProperties = async (user: ReturnType<typeof userEvent.setup>) => {
  const allTab = await screen.findByRole("button", { name: "ALL PROPERTIES" });

  if (allTab.getAttribute("aria-pressed") !== "true") {
    await user.click(allTab);
  }
};

const selectLineDialogTier = async (
  user: ReturnType<typeof userEvent.setup>,
  propertyName: string,
  tier = "T1",
) => {
  const tierButton = screen.getByRole("button", { name: `Toggle ${tier} for ${propertyName}` });

  if (tierButton.getAttribute("aria-pressed") !== "true") {
    await user.click(tierButton);
  }
};

describe("LinePage", () => {
  beforeEach(() => {
    vi.spyOn(lineService, "getPageData").mockResolvedValue(structuredClone(linePageData));
    vi.spyOn(lineService, "getCreditWindowConfig").mockResolvedValue({
      available: true,
      deltaHours: 5,
    });
    vi.spyOn(lineService, "saveCurrentDraft").mockImplementation(async (_existingProperties, draftMeta) => ({
      draft: {
        ...draftMeta,
        bidContext: "Current",
        draftVersion: draftMeta.draftVersion + 1,
        properties: [],
      },
      propertyCatalog: [],
      favoriteProperties: [],
      recommendedPropertyCodes: [],
    }));
    vi.spyOn(lineService, "addCurrentDraftProperty").mockImplementation(async (_property, draftMeta) => ({
      saved: true,
      draftKey: draftMeta.draftKey,
      bidId: draftMeta.bidId,
      periodId: draftMeta.periodId,
      periodCode: draftMeta.periodCode,
      draftVersion: draftMeta.draftVersion + 1,
      propertyGroupKey: "line-property-403",
      rowSeq: 1,
    }));
    vi.spyOn(lineService, "removeCurrentDraftProperty").mockImplementation(async (_propertyGroupKey, draftMeta) => ({
      saved: true,
      draftKey: draftMeta.draftKey,
      bidId: draftMeta.bidId,
      periodId: draftMeta.periodId,
      periodCode: draftMeta.periodCode,
      draftVersion: draftMeta.draftVersion + 1,
    }));
    vi.spyOn(lineService, "patchCurrentDraftProperty").mockImplementation(async (propertyGroupKey, property, draftMeta) => ({
      saved: true,
      draftKey: draftMeta.draftKey,
      bidId: draftMeta.bidId,
      periodId: draftMeta.periodId,
      periodCode: draftMeta.periodCode,
      draftVersion: draftMeta.draftVersion + 1,
      propertyGroupKey,
      tiers: property.tiers.filter((tier) => tier.active).map((tier) => tier.label),
    }));
    vi.spyOn(lineService, "favoriteProperty").mockImplementation(async (property, draftMeta) => ({
      saved: true,
      draftKey: draftMeta.draftKey,
      bidId: draftMeta.bidId,
      periodId: draftMeta.periodId,
      periodCode: draftMeta.periodCode,
      draftVersion: draftMeta.draftVersion,
      favoriteKey: `line-configured-${property.propertyCode}`,
      propertyId: property.propertyCode,
      propertyCode: property.propertyCode,
      name: property.name,
      action: property.action ?? null,
      bid: property.bid,
    }));
    vi.spyOn(lineService, "saveConfiguredFavoriteProperty").mockImplementation(async (property, draftMeta) => ({
      saved: true,
      draftKey: draftMeta.draftKey,
      bidId: draftMeta.bidId,
      periodId: draftMeta.periodId,
      periodCode: draftMeta.periodCode,
      draftVersion: draftMeta.draftVersion,
      favoriteKey: `line-configured-${property.propertyCode}`,
      propertyId: property.propertyCode,
      propertyCode: property.propertyCode,
      name: property.name,
      action: property.action ?? null,
      bid: property.bid,
    }));
    vi.spyOn(lineService, "patchFavoriteProperty").mockImplementation(async (favoriteKey, property, draftMeta) => ({
      saved: true,
      draftKey: draftMeta.draftKey,
      bidId: draftMeta.bidId,
      periodId: draftMeta.periodId,
      periodCode: draftMeta.periodCode,
      draftVersion: draftMeta.draftVersion + 1,
      favoriteKey,
      propertyId: property.propertyCode,
      propertyCode: property.propertyCode,
      name: property.name,
      action: property.action ?? null,
      bid: property.bid,
    }));
    vi.spyOn(lineService, "unfavoriteProperty").mockResolvedValue({ saved: true });
    queryClient.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("loads page data through the line service boundary", async () => {
    const serviceSpy = vi.spyOn(lineService, "getPageData");

    renderLinePage();

    expect(
      screen.getByRole("status", { name: "Loading current line draft..." }),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(serviceSpy).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText("EXISTING LINE PROPERTIES")).toBeInTheDocument();
    expect(screen.getByText("ADD LINE PROPERTIES")).toBeInTheDocument();
    const favoriteTab = await screen.findByRole("button", { name: "FAVORITED PROPERTIES" });
    const allTab = screen.getByRole("button", { name: "ALL PROPERTIES" });

    expect(favoriteTab).toHaveAttribute("aria-pressed", "true");
    expect(allTab).toHaveAttribute("aria-pressed", "false");
    expect(favoriteTab.compareDocumentPosition(allTab) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("disables add actions when the current period is read-only", async () => {
    const user = userEvent.setup();
    const readOnlyData = structuredClone(linePageData);
    readOnlyData.rightPanel.draftMeta.periodCode = "May 2026";
    readOnlyData.rightPanel.draftMeta.currentPeriod = {
      id: 12,
      periodCode: "May 2026",
      filiale: "F8",
      status: "CLOSED",
      computedStage: "CLOSED",
      bidOpenAt: "2026-04-03T00:00:00.000Z",
      bidCloseAt: "2026-04-10T23:59:59.000Z",
      canEditBid: false,
      readOnlyReason: "Bidding closed at 2026-04-10T23:59:59.000Z.",
    };
    vi.mocked(lineService.getPageData).mockResolvedValueOnce(readOnlyData);

    renderLinePage();

    const addButton = await screen.findByRole("button", { name: "ADD MORE PROPERTIES" });
    expect(addButton).toBeDisabled();

    await user.click(addButton);

    expect(lineService.addCurrentDraftProperty).not.toHaveBeenCalled();
  });

  it("shows an explicit loading shell before the line draft resolves", () => {
    vi.mocked(lineService.getPageData).mockImplementationOnce(
      () => new Promise(() => undefined),
    );

    renderLinePage();

    expect(
      screen.getByRole("status", { name: "Loading current line draft..." }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("line-page-loading")).toBeInTheDocument();
  });

  it("adds an available line property through the line add API", async () => {
    const user = userEvent.setup();
    const saveSpy = vi.spyOn(lineService, "saveCurrentDraft");
    const addSpy = vi.spyOn(lineService, "addCurrentDraftProperty");

    vi.mocked(lineService.getPageData).mockResolvedValueOnce({
      rightPanel: {
        ...structuredClone(linePageData.rightPanel),
        availableProperties: [
          {
            id: "available-403",
            propertyCode: 403,
            name: "Clear Schedule and Start Next Bid Group",
            favorited: false,
            bid: { type: "flag" },
            tiers: [{ key: "t1", label: "T1", active: false }],
          },
        ],
      },
    });

    renderLinePage();

    await showAllLineProperties(user);
    await user.click(await screen.findByRole("button", { name: "Add Clear Schedule and Start Next Bid Group" }));

    expect(await screen.findByLabelText("Bid for existing Clear Schedule and Start Next Bid Group")).toBeInTheDocument();

    await waitFor(() => {
      expect(addSpy).toHaveBeenCalledTimes(1);
    });
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it("adds Commuter Pattern as a Line work/off block condition", async () => {
    const user = userEvent.setup();
    const addSpy = vi.spyOn(lineService, "addCurrentDraftProperty");

    vi.mocked(lineService.getPageData).mockResolvedValueOnce({
      rightPanel: {
        ...structuredClone(linePageData.rightPanel),
        availableProperties: [
          {
            id: "available-408",
            propertyCode: 408,
            name: "Commuter Pattern",
            favorited: false,
            bid: { type: "days-off-on-pattern", minDaysOff: 4, minDaysOn: 4, maxDaysOn: 5, min: 1, max: 14 },
            tiers: [{ key: "t1", label: "T1", active: false }],
          },
        ],
      },
    });

    renderLinePage();

    await showAllLineProperties(user);
    expect(await screen.findByText("Commuter Pattern")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add Commuter Pattern" }));

    expect(await screen.findByRole("dialog", { name: "Configure Commuter Pattern" })).toBeInTheDocument();
    expect(screen.getByText("WORK BLOCK")).toBeInTheDocument();
    expect(screen.getByText("OFF BLOCK")).toBeInTheDocument();
    const commuterTierT1 = screen.getByRole("button", { name: "Toggle T1 for Commuter Pattern" });
    expect(commuterTierT1).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "ADD BID" })).toBeDisabled();
    expect(screen.getByText("· REQUIRED")).toBeInTheDocument();

    await user.click(commuterTierT1);
    expect(screen.getByRole("button", { name: "ADD BID" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "SAVE FAVORITE" })).not.toBeDisabled();

    fireEvent.change(screen.getByLabelText("Configure bid for Commuter Pattern min days on"), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByLabelText("Configure bid for Commuter Pattern max days on"), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByLabelText("Configure bid for Commuter Pattern minimum days off"), {
      target: { value: "4" },
    });
    await user.click(screen.getByRole("switch", { name: "Configure bid for Commuter Pattern limit to a date range" }));
    expect(screen.getByRole("button", { name: "ADD BID" })).toBeDisabled();
    await user.click(screen.getByRole("button", {
      name: "Open Configure bid for Commuter Pattern date range calendar",
    }));
    await user.click(screen.getByRole("gridcell", { name: "Select 2026-04-02" }));
    await user.click(screen.getByRole("gridcell", { name: "Select 2026-04-05" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Commuter Pattern date range must be at least 9 days long.",
    );
    expect(screen.getByRole("button", { name: "ADD BID" })).toBeDisabled();

    await user.click(screen.getByRole("button", {
      name: "Open Configure bid for Commuter Pattern date range calendar",
    }));
    await user.click(screen.getByRole("gridcell", { name: "Select 2026-04-02" }));
    await user.click(screen.getByRole("gridcell", { name: "Select 2026-04-18" }));

    await selectLineDialogTier(user, "Commuter Pattern");
    expect(screen.getByRole("button", { name: "ADD BID" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "SAVE FAVORITE" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "ADD BID" }));

    await waitFor(() => {
      expect(addSpy).toHaveBeenCalledTimes(1);
    });

    const [property] = addSpy.mock.calls[0] ?? [];
    expect(property).toMatchObject({
      propertyCode: 408,
      name: "Commuter Pattern",
      bid: {
        type: "days-off-on-pattern",
        minDaysOff: 4,
        minDaysOn: 5,
        maxDaysOn: 5,
        dateRange: {
          from: "2026-04-02",
          to: "2026-04-18",
        },
        min: 1,
        max: 14,
      },
    });
  });

  it("shows Line all-properties as template rows without bid or tier controls", async () => {
    const user = userEvent.setup();

    vi.mocked(lineService.getPageData).mockResolvedValueOnce({
      rightPanel: {
        ...structuredClone(linePageData.rightPanel),
        availableProperties: [
          {
            id: "available-404",
            propertyCode: 404,
            name: "No Same Day Pairings",
            favorited: false,
            bid: { type: "flag" },
            tiers: [{ key: "t1", label: "T1", active: true }],
          },
          {
            id: "available-408",
            propertyCode: 408,
            name: "Commuter Pattern",
            favorited: false,
            bid: { type: "days-off-on-pattern", minDaysOff: 4, minDaysOn: 4, maxDaysOn: 5, min: 1, max: 14 },
            tiers: [{ key: "t1", label: "T1", active: true }],
          },
          {
            id: "available-428",
            propertyCode: 428,
            name: "Efficient Flying First",
            action: "award",
            supportedActions: ["award", "avoid"],
            favorited: false,
            bid: { type: "flag" },
            tiers: [{ key: "t1", label: "T1", active: true }],
          },
          {
            id: "available-410",
            propertyCode: 410,
            name: "Reserve / Flying Date Pattern",
            favorited: false,
            bid: {
              type: "reserve-flying-date-pattern",
              segments: [
                { workType: "reserve", callType: "PRAM", dateScope: { mode: "first_half" } },
                { workType: "flying", dateScope: { mode: "second_half" } },
              ],
              callTypeOptions: ["PRAM", "PRPM"],
              strength: "strong",
            },
            tiers: [{ key: "t1", label: "T1", active: true }],
          },
          {
            id: "available-427",
            propertyCode: 427,
            name: "Mixed Line Bid",
            favorited: false,
            action: "award",
            supportedActions: ["award", "avoid"],
            bid: { type: "flag" },
            tiers: [{ key: "t1", label: "T1", active: true }],
          },
        ],
      },
    });

    renderLinePage();

    await showAllLineProperties(user);
    const addWorkspace = screen.getByTestId("rule-bid-add-properties-workspace");
    expect(await screen.findByText("No Same Day Pairings")).toBeInTheDocument();
    expect(screen.getByText("Commuter Pattern")).toBeInTheDocument();
    expect(screen.getByText("Efficient Flying First")).toBeInTheDocument();
    expect(screen.getByText("Reserve / Flying Date Pattern")).toBeInTheDocument();
    expect(screen.getByText("Mixed Line Bid")).toBeInTheDocument();
    expect(screen.queryByLabelText("Bid for available No Same Day Pairings")).not.toBeInTheDocument();
    expect(within(addWorkspace).queryByText("BID")).not.toBeInTheDocument();
    expect(within(addWorkspace).queryByText("APPLY TO TIERS")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Favorite No Same Day Pairings" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Toggle available T1 for No Same Day Pairings" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Toggle available T1 for Commuter Pattern" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Toggle available T1 for Efficient Flying First" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Toggle available T1 for Reserve / Flying Date Pattern" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Toggle available T1 for Mixed Line Bid" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Bid for available Commuter Pattern min days on")).not.toBeInTheDocument();
  });

  it("adds Mixed Line Bid as a Reserve Short Call date-range bid", async () => {
    const user = userEvent.setup();
    const addSpy = vi.spyOn(lineService, "addCurrentDraftProperty");

    vi.mocked(lineService.getPageData).mockResolvedValueOnce({
      rightPanel: {
        ...structuredClone(linePageData.rightPanel),
        availableProperties: [
          {
            id: "available-427",
            propertyCode: 427,
            name: "Mixed Line Bid",
            favorited: false,
            action: "award",
            supportedActions: ["award", "avoid"],
            bid: { type: "flag" },
            tiers: [{ key: "t1", label: "T1", active: true }],
          },
        ],
      },
    });

    renderLinePage();

    await showAllLineProperties(user);
    await user.click(await screen.findByRole("button", { name: "Add Mixed Line Bid" }));

    const dialog = await screen.findByRole("dialog", { name: "Configure Mixed Line Bid" });
    expect(within(dialog).getByRole("button", { name: "Mixed Line" })).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByRole("button", { name: "Reserve Only" })).toHaveAttribute("aria-pressed", "false");
    expect(within(dialog).getByRole("button", { name: "Pairing Only" })).toHaveAttribute("aria-pressed", "false");
    expect(within(dialog).getByText("RESERVE SHORT CALL")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "+ ADD RESERVE SHORT CALL" }));
    expect(within(dialog).getByLabelText("Configure short-call 1 for Mixed Line Bid short-call type")).toHaveValue("PRAM");
    await selectLineDialogTier(user, "Mixed Line Bid");
    expect(screen.getByRole("button", { name: "ADD BID" })).toBeEnabled();

    await user.click(within(dialog).getByRole("switch", {
      name: "Configure short-call 1 for Mixed Line Bid limit to a date range",
    }));
    expect(screen.getByRole("button", { name: "ADD BID" })).toBeDisabled();

    await user.click(within(dialog).getByRole("button", {
      name: "Open Configure short-call 1 for Mixed Line Bid date range calendar",
    }));
    const calendar = await screen.findByRole("grid", {
      name: "Configure short-call 1 for Mixed Line Bid date range calendar",
    });
    await user.click(within(calendar).getByRole("gridcell", { name: "Select 2026-04-02" }));
    await user.click(within(calendar).getByRole("gridcell", { name: "Select 2026-04-04" }));
    await user.click(screen.getByRole("button", { name: "ADD BID" }));

    await waitFor(() => {
      expect(addSpy).toHaveBeenCalledTimes(1);
    });

    const [property] = addSpy.mock.calls[0] ?? [];
    expect(property).toMatchObject({
      propertyCode: 301,
      name: "Mixed Line Bid",
      action: "award",
      bid: {
        type: "reserve-call-type-date-scope",
        callType: "PRAM",
        dateScope: {
          mode: "date_range",
          from: "2026-04-02",
          to: "2026-04-04",
        },
      },
    });
  });

  it("adds Mixed Line Bid as Reserve Only with a Reserve Short Call bid", async () => {
    const user = userEvent.setup();
    const addSpy = vi.spyOn(lineService, "addCurrentDraftProperty");
    addSpy
      .mockImplementationOnce(async (_property, draftMeta) => ({
        saved: true,
        draftKey: draftMeta.draftKey,
        bidId: draftMeta.bidId,
        periodId: draftMeta.periodId,
        periodCode: draftMeta.periodCode,
        draftVersion: draftMeta.draftVersion + 1,
        propertyGroupKey: "line-property-427",
        rowSeq: 1,
      }))
      .mockImplementationOnce(async (_property, draftMeta) => ({
        saved: true,
        draftKey: draftMeta.draftKey,
        bidId: draftMeta.bidId,
        periodId: draftMeta.periodId,
        periodCode: draftMeta.periodCode,
        draftVersion: draftMeta.draftVersion + 1,
        propertyGroupKey: "line-property-301",
        rowSeq: 2,
      }));

    vi.mocked(lineService.getPageData).mockResolvedValueOnce({
      rightPanel: {
        ...structuredClone(linePageData.rightPanel),
        availableProperties: [
          {
            id: "available-427",
            propertyCode: 427,
            name: "Mixed Line Bid",
            favorited: false,
            action: "award",
            supportedActions: ["award", "avoid"],
            bid: { type: "flag" },
            tiers: [{ key: "t1", label: "T1", active: true }],
          },
        ],
      },
    });

    renderLinePage();

    await showAllLineProperties(user);
    await user.click(await screen.findByRole("button", { name: "Add Mixed Line Bid" }));

    const dialog = await screen.findByRole("dialog", { name: "Configure Mixed Line Bid" });
    await user.click(within(dialog).getByRole("button", { name: "Reserve Only" }));
    await user.click(within(dialog).getByRole("button", { name: "+ ADD RESERVE SHORT CALL" }));
    await selectLineDialogTier(user, "Mixed Line Bid");
    await user.click(screen.getByRole("button", { name: "ADD BID" }));

    await waitFor(() => {
      expect(addSpy).toHaveBeenCalledTimes(2);
    });
    expect(addSpy.mock.calls[0]?.[0]).toMatchObject({
      propertyCode: 427,
      name: "Mixed Line Bid",
      action: "award",
      bid: { type: "flag" },
    });
    expect(addSpy.mock.calls[1]?.[0]).toMatchObject({
      propertyCode: 301,
      name: "Mixed Line Bid",
      action: "award",
      bid: expect.objectContaining({
        type: "reserve-call-type-date-scope",
        callType: "PRAM",
        dateScope: { mode: "whole_month" },
      }),
    });
  });

  it("adds Mixed Line Bid with Pairing Only action", async () => {
    const user = userEvent.setup();
    const addSpy = vi.spyOn(lineService, "addCurrentDraftProperty");

    vi.mocked(lineService.getPageData).mockResolvedValueOnce({
      rightPanel: {
        ...structuredClone(linePageData.rightPanel),
        availableProperties: [
          {
            id: "available-427",
            propertyCode: 427,
            name: "Mixed Line Bid",
            favorited: false,
            action: "award",
            supportedActions: ["award", "avoid"],
            bid: { type: "flag" },
            tiers: [{ key: "t1", label: "T1", active: true }],
          },
        ],
      },
    });

    renderLinePage();

    await showAllLineProperties(user);
    await user.click(await screen.findByRole("button", { name: "Add Mixed Line Bid" }));
    await user.click(await screen.findByRole("button", { name: "Pairing Only" }));
    await selectLineDialogTier(user, "Mixed Line Bid");
    await user.click(screen.getByRole("button", { name: "ADD BID" }));

    await waitFor(() => {
      expect(addSpy).toHaveBeenCalledTimes(1);
    });

    const [property] = addSpy.mock.calls[0] ?? [];
    expect(property).toMatchObject({
      propertyCode: 427,
      action: "avoid",
      bid: { type: "flag" },
    });
  });

  it("updates an existing Mixed Line Bid to Reserve Short Call when edited back to Mixed Line", async () => {
    const user = userEvent.setup();
    const addSpy = vi.spyOn(lineService, "addCurrentDraftProperty");
    const removeSpy = vi.spyOn(lineService, "removeCurrentDraftProperty");
    const patchSpy = vi.spyOn(lineService, "patchCurrentDraftProperty");

    vi.mocked(lineService.getPageData).mockResolvedValueOnce({
      rightPanel: {
        ...structuredClone(linePageData.rightPanel),
        existingProperties: [
          {
            id: "line-property-427",
            propertyCode: 427,
            name: "Mixed Line Bid",
            action: "avoid",
            bid: { type: "flag" },
            tiers: [{ key: "t1", label: "T1", active: true }],
          },
        ],
        availableProperties: [],
      },
    });

    renderLinePage();

    expect(await screen.findByLabelText("Mixed Line Bid bid summary")).toHaveTextContent(
      "Pairing only for the whole bid month",
    );
    await user.click(screen.getByRole("button", { name: "Edit existing property Mixed Line Bid" }));

    const dialog = await screen.findByRole("dialog", { name: "Configure Mixed Line Bid" });
    expect(within(dialog).getByRole("button", { name: "Pairing Only" })).toHaveAttribute("aria-pressed", "true");
    await user.click(within(dialog).getByRole("button", { name: "Mixed Line" }));
    await user.click(within(dialog).getByRole("button", { name: "+ ADD RESERVE SHORT CALL" }));
    await user.click(within(dialog).getByRole("button", { name: "UPDATE BID" }));

    await waitFor(() => {
      expect(removeSpy).toHaveBeenCalledWith(
        "line-property-427",
        expect.objectContaining({ periodCode: linePageData.rightPanel.draftMeta.periodCode }),
      );
    });
    expect(addSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        propertyCode: 301,
        name: "Mixed Line Bid",
        action: "award",
        bid: expect.objectContaining({
          type: "reserve-call-type-date-scope",
          callType: "PRAM",
          dateScope: { mode: "whole_month" },
        }),
      }),
      expect.objectContaining({
        periodCode: linePageData.rightPanel.draftMeta.periodCode,
      }),
    );
    expect(patchSpy).not.toHaveBeenCalled();
  });

  it("adds Reserve / Flying Date Pattern through the complex Line dialog", async () => {
    const user = userEvent.setup();
    const addSpy = vi.spyOn(lineService, "addCurrentDraftProperty");

    vi.mocked(lineService.getPageData).mockResolvedValueOnce({
      rightPanel: {
        ...structuredClone(linePageData.rightPanel),
        availableProperties: [
          {
            id: "available-410",
            propertyCode: 410,
            name: "Reserve / Flying Date Pattern",
            favorited: false,
            bid: {
              type: "reserve-flying-date-pattern",
              segments: [
                { workType: "reserve", callType: "PRAM", dateScope: { mode: "first_half" } },
                { workType: "flying", dateScope: { mode: "second_half" } },
              ],
              callTypeOptions: ["PRAM", "PRPM"],
              strength: "strong",
            },
            tiers: [{ key: "t1", label: "T1", active: true }],
          },
        ],
      },
    });

    renderLinePage();

    await showAllLineProperties(user);
    await user.click(await screen.findByRole("button", { name: "Add Reserve / Flying Date Pattern" }));

    expect(await screen.findByRole("dialog", { name: "Configure Reserve / Flying Date Pattern" })).toBeInTheDocument();
    await user.selectOptions(
      screen.getByLabelText("Configure bid for Reserve / Flying Date Pattern Segment 1 date scope"),
      "specific_dates",
    );
    const segmentOneDateInput = screen.getByLabelText("Configure bid for Reserve / Flying Date Pattern Segment 1 specific date");
    expect(segmentOneDateInput).toHaveAttribute("type", "text");
    expect(segmentOneDateInput).toHaveAttribute("placeholder", "YYYY-MM-DD");
    fireEvent.change(segmentOneDateInput, {
      target: { value: "2026-05-01" },
    });
    await user.click(screen.getByRole("button", { name: "ADD DATE" }));
    fireEvent.change(screen.getByLabelText("Configure bid for Reserve / Flying Date Pattern Segment 1 specific date"), {
      target: { value: "2026-05-03" },
    });
    await user.click(screen.getByRole("button", { name: "ADD DATE" }));
    await user.selectOptions(
      screen.getByLabelText("Configure bid for Reserve / Flying Date Pattern Segment 2 date scope"),
      "specific_dates",
    );
    fireEvent.change(screen.getByLabelText("Configure bid for Reserve / Flying Date Pattern Segment 2 specific date"), {
      target: { value: "2026-05-11" },
    });
    await user.click(screen.getAllByRole("button", { name: "ADD DATE" }).find((button) =>
      !button.hasAttribute("disabled"))!);
    await selectLineDialogTier(user, "Reserve / Flying Date Pattern");
    await user.click(screen.getByRole("button", { name: "ADD BID" }));

    await waitFor(() => {
      expect(addSpy).toHaveBeenCalledTimes(1);
    });

    const [property] = addSpy.mock.calls[0] ?? [];
    expect(property).toMatchObject({
      propertyCode: 410,
      name: "Reserve / Flying Date Pattern",
      bid: {
        type: "reserve-flying-date-pattern",
        segments: [
          {
            workType: "reserve",
            callType: "PRAM",
            dateScope: { mode: "specific_dates", dates: ["2026-05-01", "2026-05-03"] },
          },
          {
            workType: "flying",
            dateScope: { mode: "specific_dates", dates: ["2026-05-11"] },
          },
        ],
        strength: "strong",
      },
    });
  });

  it("adds Credit Window Preference with a company-defined More/Less direction", async () => {
    const user = userEvent.setup();
    const addSpy = vi.spyOn(lineService, "addCurrentDraftProperty");

    vi.mocked(lineService.getPageData).mockResolvedValueOnce({
      rightPanel: {
        ...structuredClone(linePageData.rightPanel),
        availableProperties: [
          {
            id: "available-429",
            propertyCode: 429,
            name: "Credit Window Preference",
            favorited: false,
            bid: {
              type: "credit-window-preference",
              direction: "more",
            },
            tiers: [{ key: "t1", label: "T1", active: true }],
          },
        ],
      },
    });

    renderLinePage();

    await showAllLineProperties(user);
    await user.click(await screen.findByRole("button", { name: "Add Credit Window Preference" }));

    const dialog = await screen.findByRole("dialog", { name: "Configure Credit Window Preference" });
    const sectionTitles = [...dialog.querySelectorAll("section > p")].map((element) => element.textContent);
    const moreCredit = within(dialog).getByRole("button", { name: "More credit" });
    const lessCredit = within(dialog).getByRole("button", { name: "Less credit" });
    const helperText = await within(dialog).findByLabelText(
      "Configure bid for Credit Window Preference company-defined adjustment",
    );

    expect(sectionTitles).toEqual(["APPLY TO TIERS · REQUIRED", "PREFERENCE"]);
    expect(moreCredit).toHaveAttribute("aria-pressed", "true");
    expect(moreCredit).toHaveClass("bg-white");
    expect(lessCredit).toHaveAttribute("aria-pressed", "false");
    expect(within(dialog).getByRole("button", { name: "ADD BID" })).toBeDisabled();
    expect(helperText).not.toHaveClass("border", "rounded-lg");
    expect(
      await screen.findByLabelText("Configure bid for Credit Window Preference company-defined adjustment"),
    ).toHaveTextContent(
      "Aims for up to 5h above",
    );
    expect(screen.queryByRole("button", { name: "Custom" })).not.toBeInTheDocument();
    await user.click(lessCredit);
    expect(moreCredit).toHaveAttribute("aria-pressed", "false");
    expect(lessCredit).toHaveAttribute("aria-pressed", "true");
    expect(lessCredit).toHaveClass("bg-white");
    await selectLineDialogTier(user, "Credit Window Preference");
    await user.click(within(dialog).getByRole("button", { name: "ADD BID" }));

    await waitFor(() => {
      expect(addSpy).toHaveBeenCalledTimes(1);
    });

    const [property] = addSpy.mock.calls[0] ?? [];
    expect(property).toMatchObject({
      propertyCode: 429,
      name: "Credit Window Preference",
      bid: {
        type: "credit-window-preference",
        direction: "less",
      },
    });
  });

  it("keeps existing simple line bids compact and edits complex line bids in a dialog", async () => {
    const user = userEvent.setup();
    const patchSpy = vi.spyOn(lineService, "patchCurrentDraftProperty");

    vi.mocked(lineService.getPageData).mockResolvedValueOnce({
      rightPanel: {
        ...structuredClone(linePageData.rightPanel),
        existingProperties: [
          {
            id: "line-property-401",
            propertyCode: 401,
            name: "Max Credit Window",
            bid: { type: "flag" },
            tiers: [{ key: "t1", label: "T1", active: true }],
          },
          {
            id: "line-property-408",
            propertyCode: 408,
            name: "Commuter Pattern",
            bid: { type: "days-off-on-pattern", minDaysOff: 4, minDaysOn: 4, maxDaysOn: 5, min: 1, max: 14 },
            tiers: [{ key: "t1", label: "T1", active: true }],
          },
        ],
        availableProperties: [],
      },
    });

    renderLinePage();

    expect(await screen.findByText("Max Credit Window")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit existing property Max Credit Window" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit existing property Commuter Pattern" })).toBeInTheDocument();
    expect(screen.getByText("ACTIONS")).toBeInTheDocument();
    expect(screen.getByLabelText("Bid for existing Commuter Pattern")).toHaveTextContent("Work 4–5 days, then 4 days off");
    expect(screen.getByLabelText("Bid for existing Commuter Pattern").className).not.toContain("truncate");
    expect(screen.getByLabelText("Bid for existing Commuter Pattern").closest(".grid")).toHaveStyle({
      columnGap: "14px",
      gridTemplateColumns: "minmax(150px, 200px) minmax(260px, 1fr) 236px minmax(56px, 72px)",
    });
    expect(screen.queryByLabelText("Bid for existing Commuter Pattern min days on")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit existing property Commuter Pattern" }));

    expect(await screen.findByRole("dialog", { name: "Configure Commuter Pattern" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Configure bid for Commuter Pattern min days on"), {
      target: { value: "5" },
    });
    await user.click(screen.getByRole("button", { name: "UPDATE BID" }));

    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith(
        "line-property-408",
        expect.objectContaining({
          propertyCode: 408,
          bid: expect.objectContaining({
            type: "days-off-on-pattern",
            minDaysOn: 5,
          }),
        }),
        expect.objectContaining({
          periodCode: linePageData.rightPanel.draftMeta.periodCode,
        }),
      );
    });
  });

  it("does not open a requested existing Line bid edit dialog as pending when the period is closed", async () => {
    const handledSpy = vi.fn();
    const patchSpy = vi.spyOn(lineService, "patchCurrentDraftProperty");
    const pageData = structuredClone(linePageData);
    pageData.rightPanel.draftMeta.currentPeriod = {
      ...pageData.rightPanel.draftMeta.currentPeriod!,
      status: "CLOSED",
      computedStage: "CLOSED",
      canEditBid: false,
      readOnlyReason: "Bidding is closed for Apr 2026.",
    };
    pageData.rightPanel.existingProperties = [
      {
        id: "line-property-408",
        propertyCode: 408,
        name: "Commuter Pattern",
        bid: { type: "days-off-on-pattern", minDaysOff: 4, minDaysOn: 4, maxDaysOn: 5, min: 1, max: 14 },
        tiers: [{ key: "t1", label: "T1", active: true }],
      },
    ];
    pageData.rightPanel.availableProperties = [];
    vi.mocked(lineService.getPageData).mockResolvedValueOnce(pageData);

    renderLinePage({
      requestedExistingPropertyId: "line-property-408",
      onRequestedExistingPropertyHandled: handledSpy,
    });

    expect(await screen.findByText("Commuter Pattern")).toBeInTheDocument();

    await waitFor(() => {
      expect(handledSpy).toHaveBeenCalledTimes(1);
    });

    expect(screen.queryByRole("dialog", { name: "Configure Commuter Pattern" })).not.toBeInTheDocument();
    expect(screen.queryByText("UPDATING...")).not.toBeInTheDocument();
    expect(patchSpy).not.toHaveBeenCalled();
  });

  it("shows configured favorites without preselected tiers", async () => {
    const user = userEvent.setup();

    vi.mocked(lineService.getPageData).mockResolvedValueOnce({
      rightPanel: {
        ...structuredClone(linePageData.rightPanel),
        availableProperties: [
          {
            id: "favorite-401",
            favoriteKey: "favorite-401",
            propertyId: 401,
            source: "favorite",
            propertyCode: 401,
            name: "Max Credit Window",
            favorited: true,
            bid: { type: "flag" },
            tiers: [{ key: "t1", label: "T1", active: false }],
          },
          {
            id: "favorite-line-configured-408",
            favoriteKey: "line-configured-408",
            propertyId: 408,
            source: "favorite",
            propertyCode: 408,
            name: "Commuter Pattern",
            favorited: true,
            bid: { type: "days-off-on-pattern", minDaysOff: 4, minDaysOn: 5, maxDaysOn: 5, min: 1, max: 14 },
            tiers: [{ key: "t2", label: "T2", active: false }],
          },
        ],
      },
    });

    renderLinePage();

    await user.click(await screen.findByRole("button", { name: "FAVORITED PROPERTIES" }));
    const addWorkspace = screen.getByTestId("rule-bid-add-properties-workspace");

    expect(screen.queryByRole("button", { name: "Unfavorite Max Credit Window" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove favorite Max Credit Window" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove favorite Commuter Pattern" })).toBeInTheDocument();
    expect(within(addWorkspace).queryByText("Saved setup")).not.toBeInTheDocument();
    expect(within(addWorkspace).getByLabelText("Favorite bid for Max Credit Window")).toHaveTextContent("Enabled");
    expect(within(addWorkspace).getByLabelText("Favorite bid for Commuter Pattern")).toHaveTextContent("Work 5 days");
    expect(within(addWorkspace).getByRole("button", {
      name: "Select T1 for favorite Max Credit Window",
    })).toHaveAttribute("aria-pressed", "false");
    expect(within(addWorkspace).getByRole("button", {
      name: "Select T2 for favorite Commuter Pattern",
    })).toHaveAttribute("aria-pressed", "false");
  });

  it("edits a configured line favorite without changing its selected Tx or existing bids", async () => {
    const user = userEvent.setup();
    const patchFavoriteSpy = vi.spyOn(lineService, "patchFavoriteProperty");
    const addSpy = vi.spyOn(lineService, "addCurrentDraftProperty");
    const pageData = structuredClone(linePageData);
    pageData.rightPanel.availableProperties = [{
      id: "favorite-line-configured-408",
      favoriteKey: "line-configured-408",
      propertyId: 408,
      source: "favorite",
      propertyCode: 408,
      name: "Commuter Pattern",
      favorited: true,
      bid: { type: "days-off-on-pattern", minDaysOff: 4, minDaysOn: 5, maxDaysOn: 5 },
      tiers: [
        { key: "t1", label: "T1", active: false },
        { key: "t2", label: "T2", active: true },
      ],
    }];
    vi.mocked(lineService.getPageData).mockResolvedValueOnce(pageData);

    renderLinePage();

    await user.click(await screen.findByRole("button", { name: "Edit favorite Commuter Pattern" }));
    const dialog = await screen.findByRole("dialog", { name: "Configure Commuter Pattern" });
    expect(within(dialog).queryByRole("button", {
      name: "Toggle T2 for Commuter Pattern",
    })).not.toBeInTheDocument();
    expect(within(dialog).queryByText("LIMIT TO A DATE RANGE")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("switch", {
      name: "Configure bid for Commuter Pattern limit to a date range",
    })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "UPDATE FAVORITE" }));

    await waitFor(() => {
      expect(patchFavoriteSpy).toHaveBeenCalledWith(
        "line-configured-408",
        expect.objectContaining({ propertyCode: 408 }),
        expect.any(Object),
      );
    });
    expect(addSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("button", {
      name: "Select T2 for favorite Commuter Pattern",
    })).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps only reusable month scopes when editing a Reserve / Flying Date Pattern favorite", async () => {
    const user = userEvent.setup();
    const pageData = structuredClone(linePageData);
    pageData.rightPanel.availableProperties = [{
      id: "favorite-line-pattern-410",
      favoriteKey: "favorite-line-pattern-410",
      propertyId: 410,
      source: "favorite",
      propertyCode: 410,
      name: "Reserve / Flying Date Pattern",
      favorited: true,
      bid: {
        type: "reserve-flying-date-pattern",
        segments: [
          { workType: "reserve", callType: "PRAM", dateScope: { mode: "first_half" } },
          { workType: "flying", dateScope: { mode: "second_half" } },
        ],
        callTypeOptions: ["PRAM", "PRPM"],
        strength: "strong",
      },
      tiers: [{ key: "t1", label: "T1", active: true }],
    }];
    vi.mocked(lineService.getPageData).mockResolvedValueOnce(pageData);

    renderLinePage();

    await user.click(await screen.findByRole("button", {
      name: "Edit favorite Reserve / Flying Date Pattern",
    }));
    const dialog = await screen.findByRole("dialog", {
      name: "Configure Reserve / Flying Date Pattern",
    });
    const dateScopeSelects = [1, 2].map((segmentNumber) => within(dialog).getByLabelText(
      `Configure bid for Reserve / Flying Date Pattern Segment ${segmentNumber} date scope`,
    ));

    for (const dateScopeSelect of dateScopeSelects) {
      expect(Array.from(dateScopeSelect.querySelectorAll("option"), (option) => option.textContent)).toEqual([
        "Whole Month",
        "First Half",
        "Second Half",
      ]);
    }
  });

  it("does not emit duplicate line add requests while an add is pending", async () => {
    const user = userEvent.setup();
    let resolveAdd: ((value: Awaited<ReturnType<typeof lineService.addCurrentDraftProperty>>) => void) | undefined;
    const addSpy = vi.spyOn(lineService, "addCurrentDraftProperty").mockImplementationOnce(
      async (_property, draftMeta) => new Promise((resolve) => {
        resolveAdd = () => resolve({
          saved: true,
          draftKey: draftMeta.draftKey,
          bidId: draftMeta.bidId,
          periodId: draftMeta.periodId,
          periodCode: draftMeta.periodCode,
          draftVersion: draftMeta.draftVersion + 1,
          propertyGroupKey: "line-property-404",
          rowSeq: 1,
        });
      }),
    );

    vi.mocked(lineService.getPageData).mockResolvedValueOnce({
      rightPanel: {
        ...structuredClone(linePageData.rightPanel),
        availableProperties: [
          {
            id: "available-404",
            propertyCode: 404,
            name: "No Same Day Pairings",
            favorited: false,
            bid: { type: "flag" },
            tiers: [{ key: "t1", label: "T1", active: true }],
          },
        ],
      },
    });

    renderLinePage();

    await showAllLineProperties(user);
    await user.dblClick(await screen.findByRole("button", { name: "Add No Same Day Pairings" }));

    expect(addSpy).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveAdd?.({
        saved: true,
        periodCode: linePageData.rightPanel.draftMeta.periodCode,
        draftVersion: 1,
        propertyGroupKey: "line-property-404",
        rowSeq: 1,
      });
    });
  });

  it("blocks exact duplicate line properties before calling the add API", async () => {
    const user = userEvent.setup();
    const addSpy = vi.spyOn(lineService, "addCurrentDraftProperty");

    vi.mocked(lineService.getPageData).mockResolvedValueOnce({
      rightPanel: {
        ...structuredClone(linePageData.rightPanel),
        existingProperties: [
          {
            id: "existing-404-1",
            propertyCode: 404,
            name: "No Same Day Pairings",
            bid: { type: "flag" },
            tiers: [{ key: "t1", label: "T1", active: true }],
          },
        ],
        availableProperties: [
          {
            id: "available-404",
            propertyCode: 404,
            name: "No Same Day Pairings",
            favorited: false,
            bid: { type: "flag" },
            tiers: [{ key: "t1", label: "T1", active: true }],
          },
        ],
      },
    });

    renderLinePage();

    await showAllLineProperties(user);
    await user.click(await screen.findByRole("button", { name: "Add No Same Day Pairings" }));

    expect(addSpy).not.toHaveBeenCalled();
    expect(await screen.findByText("This property already exists.")).toBeInTheDocument();
  });

  it("merges the same line property on a different active tier through the patch API", async () => {
    const user = userEvent.setup();
    const addSpy = vi.spyOn(lineService, "addCurrentDraftProperty");
    const patchSpy = vi.spyOn(lineService, "patchCurrentDraftProperty");

    vi.mocked(lineService.getPageData).mockResolvedValueOnce({
      rightPanel: {
        ...structuredClone(linePageData.rightPanel),
        existingProperties: [
          {
            id: "line-property-404-t2",
            propertyCode: 404,
            name: "No Same Day Pairings",
            bid: { type: "flag" },
            tiers: [
              { key: "t1", label: "T1", active: false },
              { key: "t2", label: "T2", active: true },
            ],
          },
        ],
        availableProperties: [
          {
            id: "available-404",
            propertyCode: 404,
            name: "No Same Day Pairings",
            favorited: false,
            bid: { type: "flag" },
            tiers: [{ key: "t1", label: "T1", active: true }],
          },
        ],
      },
    });

    renderLinePage();

    await showAllLineProperties(user);
    await user.click(await screen.findByRole("button", { name: "Add No Same Day Pairings" }));

    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith(
        "line-property-404-t2",
        expect.objectContaining({
          tiers: expect.arrayContaining([
            expect.objectContaining({ label: "T1", active: true }),
            expect.objectContaining({ label: "T2", active: true }),
          ]),
        }),
        expect.objectContaining({
          periodCode: linePageData.rightPanel.draftMeta.periodCode,
        }),
      );
    });
    expect(addSpy).not.toHaveBeenCalled();
    expect(screen.getAllByLabelText("Bid for existing No Same Day Pairings")).toHaveLength(1);
  });

  it("deletes an existing line property through the line delete API", async () => {
    const user = userEvent.setup();
    const saveSpy = vi.spyOn(lineService, "saveCurrentDraft");
    const deleteSpy = vi.spyOn(lineService, "removeCurrentDraftProperty");

    vi.mocked(lineService.getPageData).mockResolvedValueOnce({
      rightPanel: {
        ...structuredClone(linePageData.rightPanel),
        draftMeta: {
          ...linePageData.rightPanel.draftMeta,
          draftKey: "10",
          bidId: 10,
          draftVersion: 2,
        },
        existingProperties: [
          {
            id: "line-property-401",
            propertyCode: 401,
            name: "Max Credit Window",
            bid: { type: "flag" },
            tiers: [{ key: "t1", label: "T1", active: true }],
          },
        ],
      },
    });

    renderLinePage();

    await user.click(await screen.findByRole("button", { name: "Delete existing property Max Credit Window" }));

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith(
        "line-property-401",
        expect.objectContaining({
          draftKey: "10",
          draftVersion: 2,
        }),
      );
    });
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it("updates an existing line property tier through the line patch API", async () => {
    const user = userEvent.setup();
    const saveSpy = vi.spyOn(lineService, "saveCurrentDraft");
    const patchSpy = vi.spyOn(lineService, "patchCurrentDraftProperty");

    vi.mocked(lineService.getPageData).mockResolvedValueOnce({
      rightPanel: {
        ...structuredClone(linePageData.rightPanel),
        draftMeta: {
          ...linePageData.rightPanel.draftMeta,
          draftKey: "10",
          bidId: 10,
          draftVersion: 2,
        },
        existingProperties: [
          {
            id: "line-property-401",
            propertyCode: 401,
            name: "Max Credit Window",
            bid: { type: "flag" },
            tiers: [
              { key: "t1", label: "T1", active: true },
              { key: "t2", label: "T2", active: false },
            ],
          },
        ],
      },
    });

    renderLinePage();

    await user.click(await screen.findByRole("button", { name: "Toggle existing T2 for Max Credit Window" }));

    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith(
        "line-property-401",
        expect.objectContaining({
          tiers: expect.arrayContaining([
            expect.objectContaining({ label: "T1", active: true }),
            expect.objectContaining({ label: "T2", active: true }),
          ]),
        }),
        expect.objectContaining({
          draftKey: "10",
          draftVersion: 2,
        }),
      );
    });
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it("does not emit duplicate line patch requests while a tier update is pending", async () => {
    const user = userEvent.setup();
    let resolvePatch: ((value: Awaited<ReturnType<typeof lineService.patchCurrentDraftProperty>>) => void) | undefined;
    const patchSpy = vi.spyOn(lineService, "patchCurrentDraftProperty").mockImplementationOnce(
      async (propertyGroupKey, property, draftMeta) => new Promise((resolve) => {
        resolvePatch = () => resolve({
          saved: true,
          draftKey: draftMeta.draftKey,
          bidId: draftMeta.bidId,
          periodId: draftMeta.periodId,
          periodCode: draftMeta.periodCode,
          draftVersion: draftMeta.draftVersion + 1,
          propertyGroupKey,
          tiers: property.tiers.filter((tier) => tier.active).map((tier) => tier.label),
        });
      }),
    );

    vi.mocked(lineService.getPageData).mockResolvedValueOnce({
      rightPanel: {
        ...structuredClone(linePageData.rightPanel),
        draftMeta: {
          ...linePageData.rightPanel.draftMeta,
          draftKey: "10",
          bidId: 10,
          draftVersion: 2,
        },
        existingProperties: [
          {
            id: "line-property-401",
            propertyCode: 401,
            name: "Max Credit Window",
            bid: { type: "flag" },
            tiers: [
              { key: "t1", label: "T1", active: true },
              { key: "t2", label: "T2", active: false },
            ],
          },
        ],
        availableProperties: [
          {
            id: "available-405",
            propertyCode: 405,
            name: "Waive No Same Day Duty Starts",
            favorited: false,
            bid: { type: "flag" },
            tiers: [{ key: "t1", label: "T1", active: true }],
          },
        ],
      },
    });

    renderLinePage();

    await showAllLineProperties(user);
    await user.dblClick(await screen.findByRole("button", { name: "Toggle existing T2 for Max Credit Window" }));

    expect(patchSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Add Waive No Same Day Duty Starts" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Toggle available T1 for Waive No Same Day Duty Starts" })).not.toBeInTheDocument();

    await act(async () => {
      resolvePatch?.({
        saved: true,
        periodCode: linePageData.rightPanel.draftMeta.periodCode,
        draftVersion: 3,
        propertyGroupKey: "line-property-401",
        tiers: ["T1", "T2"],
      });
    });
  });

  it("persists line unfavorite toggles through the line service", async () => {
    const user = userEvent.setup();
    const unfavoriteSpy = vi.spyOn(lineService, "unfavoriteProperty");

    vi.mocked(lineService.getPageData).mockResolvedValueOnce({
      rightPanel: {
        ...structuredClone(linePageData.rightPanel),
        availableProperties: [
          {
            id: "favorite-403",
            favoriteKey: "favorite-403",
            propertyId: 403,
            source: "favorite",
            propertyCode: 403,
            name: "Clear Schedule and Start Next Bid Group",
            favorited: true,
            bid: { type: "flag" },
            tiers: [{ key: "t1", label: "T1", active: true }],
          },
        ],
      },
    });

    renderLinePage();

    await user.click(await screen.findByRole("button", { name: "Remove favorite Clear Schedule and Start Next Bid Group" }));
    await user.click(await screen.findByRole("button", { name: "Confirm remove favorite Clear Schedule and Start Next Bid Group" }));

    await waitFor(() => {
      expect(unfavoriteSpy).toHaveBeenCalledWith(
        "favorite-403",
        expect.objectContaining({
          periodCode: linePageData.rightPanel.draftMeta.periodCode,
        }),
      );
    });
    expect(await screen.findByText("Favorite removed.")).toBeInTheDocument();
  });
});
