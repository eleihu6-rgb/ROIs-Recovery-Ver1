import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PbsStandingCurrentResponse } from "../../../../../packages/contracts/pbs-standing-bids.js";
import { AppProviders } from "@/app/providers/app-providers";
import { StandingBidPage } from "@/features/standing-bid/pages/standing-bid-page";
import { standingBidPageDataQueryKey } from "@/features/standing-bid/hooks/use-standing-bid-page-data";
import { mapStandingBidResponseToPageData } from "@/features/standing-bid/standing-bid-draft-mappers";
import type { RuleBidExistingProperty } from "@/features/rule-bids/types";
import { queryClient } from "@/shared/query/query-client";
import { lineService } from "@/shared/services/line-service";
import { pairingService } from "@/shared/services/pairing-service";
import { standingBidService } from "@/shared/services/standing-bid-service";

const buildStandingResponse = (
  lineholderProperties: PbsStandingCurrentResponse["lineholderDraft"]["properties"] = [],
  reserveProperties: PbsStandingCurrentResponse["reserveDraft"]["properties"] = [],
): PbsStandingCurrentResponse => ({
  currentPeriod: {
    id: null,
    periodCode: "Standing Bid",
    filiale: null,
    status: "OPEN",
    computedStage: "OPEN",
    bidOpenAt: null,
    bidCloseAt: null,
    canEditBid: true,
    readOnlyReason: null,
  },
  lineholderDraft: {
    draftKey: "100",
    bidId: 100,
    periodId: null,
    draftVersion: 2,
    periodCode: "STANDING",
    bidContext: "StandingLineholder",
    remarks: "lineholder remarks",
    properties: lineholderProperties,
  },
  preferOffConfig: {
    weekdays: [
      { code: "MON", name: "Monday", order: 1, isoDay: 1 },
      { code: "TUE", name: "Tuesday", order: 2, isoDay: 2 },
      { code: "WED", name: "Wednesday", order: 3, isoDay: 3 },
      { code: "THU", name: "Thursday", order: 4, isoDay: 4 },
      { code: "FRI", name: "Friday", order: 5, isoDay: 5 },
      { code: "SAT", name: "Saturday", order: 6, isoDay: 6 },
      { code: "SUN", name: "Sunday", order: 7, isoDay: 7 },
    ],
    weekend: { available: false },
  },
  reserveDraft: {
    draftKey: "200",
    bidId: 200,
    periodId: null,
    draftVersion: 7,
    periodCode: "STANDING",
    bidContext: "StandingReserve",
    remarks: "reserve remarks",
    properties: reserveProperties,
  },
  propertyCatalog: {
    lineholder: [
      {
        bidType: "DaysOff",
        propertyCode: 201,
        name: "Prefer Off",
        defaultBid: { type: "tag-list", values: [] },
      },
      {
        bidType: "DaysOff",
        propertyCode: 218,
        name: "Day of Week Off",
        defaultBid: { type: "date-or-dow-list", dates: [], daysOfWeek: ["SAT"] },
      },
      {
        bidType: "Pairing",
        propertyCode: 168,
        name: "Airport Preference",
        defaultAction: "award",
        supportedActions: ["award", "avoid"],
        defaultBid: { type: "tag-list", values: [] },
      },
      {
        bidType: "Pairing",
        propertyCode: 107,
        name: "Flight Legs per Duty",
        defaultAction: "award",
        supportedActions: ["award", "avoid"],
        defaultBid: {
          type: "flight-legs-per-duty",
          operator: "=",
          legs: 2,
          dateScope: null,
        },
      },
      {
        bidType: "Pairing",
        propertyCode: 428,
        name: "Efficient Flying First",
        defaultAction: "award",
        supportedActions: ["award", "avoid"],
        defaultBid: { type: "efficient-flying-preference", mode: "efficient" },
      },
      {
        bidType: "Line",
        propertyCode: 429,
        name: "Credit Window Preference",
        defaultBid: { type: "credit-window-preference", direction: "more" },
      },
      {
        bidType: "Line",
        propertyCode: 408,
        name: "Commuter Pattern",
        defaultBid: {
          type: "days-off-on-pattern",
          minDaysOff: 4,
          minDaysOn: 4,
          maxDaysOn: 5,
          dateRange: null,
          min: 1,
          max: 14,
        },
      },
      {
        bidType: "Line",
        propertyCode: 427,
        name: "Reserve",
        defaultAction: "award",
        supportedActions: ["award", "avoid"],
        defaultBid: { type: "flag" },
      },
    ],
    reserve: [
      {
        bidType: "Reserve",
        propertyCode: 301,
        name: "Reserve Preference",
        defaultBid: {
          type: "reserve-call-type-date-scope",
          callType: "CRAM",
          options: ["CRAM", "CRPM"],
          dateScope: { mode: "whole_month" },
        },
      },
      {
        bidType: "Reserve",
        propertyCode: 312,
        name: "Reserve Day of Week Off",
        defaultBid: { type: "date-or-dow-list", dates: [], daysOfWeek: ["SAT"] },
      },
      {
        bidType: "Reserve",
        propertyCode: 313,
        name: "Reserve Work Block Size",
        defaultBid: { type: "stepper-range", from: 3, to: 5, min: 3, max: 6 },
      },
      {
        bidType: "Reserve",
        propertyCode: 314,
        name: "Waive to Allow Carry over to be Days Off",
        defaultBid: { type: "flag" },
      },
    ],
  },
});

const mapExistingPropertiesToResponseProperties = (
  properties: RuleBidExistingProperty[],
): PbsStandingCurrentResponse["lineholderDraft"]["properties"] => properties.map((property, index) => ({
  propertyGroupKey: property.id,
  rowSeq: index + 1,
  propertyCode: property.propertyCode,
  name: property.name,
  action: property.action ?? null,
  bid: property.bid,
  tiers: property.tiers.filter((tier) => tier.active).map((tier) => tier.label),
}));

const renderStandingBidPage = () =>
  render(
    <AppProviders>
      <StandingBidPage />
    </AppProviders>,
  );

describe("StandingBidPage", () => {
  let response: PbsStandingCurrentResponse;

  beforeEach(() => {
    response = buildStandingResponse();
    vi.spyOn(standingBidService, "getPageData").mockImplementation(async () =>
      mapStandingBidResponseToPageData(response));
    vi.spyOn(standingBidService, "saveDraft").mockImplementation(async (mode, existingProperties) => {
      const responseProperties = mapExistingPropertiesToResponseProperties(existingProperties);

      response = mode === "lineholder"
        ? {
            ...response,
            lineholderDraft: {
              ...response.lineholderDraft,
              draftVersion: response.lineholderDraft.draftVersion + 1,
              properties: responseProperties,
            },
          }
        : {
            ...response,
            reserveDraft: {
              ...response.reserveDraft,
              draftVersion: response.reserveDraft.draftVersion + 1,
              properties: responseProperties,
            },
          };

      return response;
    });
    vi.spyOn(pairingService, "getReferenceOptions").mockResolvedValue({
      airports: [],
      cities: [],
    });
    vi.spyOn(pairingService, "getAirportOptions").mockResolvedValue({
      airportPreferenceLayoverHours: {
        defaultHours: 13,
        maxHours: 18,
        minHours: 13,
        stepHours: 1,
      },
      airportPreferenceOptions: [],
      filterAirports: [],
      landingAirports: [],
      layoverAirports: [],
      workStartStations: [],
    });
    vi.spyOn(pairingService, "getEfficientFlyingConfig").mockResolvedValue({
      percentile: 50,
    });
    vi.spyOn(pairingService, "getRedeyeConfig").mockResolvedValue({
      available: false,
    });
    vi.spyOn(pairingService, "getTimeBetweenFlightsBounds").mockResolvedValue({
      minimumMinutes: 0,
      maximumMinutes: null,
    });
    vi.spyOn(lineService, "getCreditWindowConfig").mockResolvedValue({
      available: true,
      deltaHours: 5,
    });
    vi.spyOn(lineService, "getMinimumBaseLayoverConfig").mockResolvedValue({
      available: true,
      minDuration: "011:00",
    });
    queryClient.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders one Bid-style Standing workspace without mode tabs, favorites, or calendar", async () => {
    renderStandingBidPage();

    expect(screen.getByRole("status", { name: "Loading Standing Bid..." })).toBeInTheDocument();
    expect(await screen.findByText("EXISTING STANDING BID")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Standing Bid" })).not.toBeInTheDocument();
    expect(screen.queryByText(
      "Reusable long-term preferences used when no current bid applies.",
    )).not.toBeInTheDocument();
    expect(screen.getByTestId("standing-bid-page-layout")).toHaveClass(
      "h-[var(--portal-page-shell-height)]",
      "min-h-0",
      "overflow-hidden",
    );
    const addWorkspace = await screen.findByTestId("rule-bid-add-properties-workspace");
    expect(document.querySelector('[data-uiid="rule-bid-right-panel"]')).toHaveClass(
      "h-full",
      "min-h-0",
    );
    expect(addWorkspace).toHaveClass(
      "min-h-0",
      "overflow-hidden",
    );
    expect(addWorkspace).not.toHaveClass(
      "min-h-[420px]",
    );
    expect(screen.getByTestId("rule-bid-add-properties-footer").parentElement).toHaveClass(
      "shrink-0",
    );
    expect(screen.getByText("ADD STANDING BID")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Lineholder" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Reserve" })).not.toBeInTheDocument();
    expect(screen.queryByText("FAVORITED PROPERTIES")).not.toBeInTheDocument();
    expect(screen.queryByText("BIDDING CALENDAR")).not.toBeInTheDocument();
  });

  it("filters only Existing Standing Bid rows by tier", async () => {
    const user = userEvent.setup();
    response = buildStandingResponse([
      {
        propertyGroupKey: "prefer-off-t1",
        rowSeq: 1,
        bidType: "DaysOff",
        propertyCode: 201,
        name: "Prefer Off",
        bid: { type: "tag-list", values: ["Monday"] },
        tiers: ["T1"],
      },
      {
        propertyGroupKey: "airport-t2",
        rowSeq: 2,
        bidType: "Pairing",
        propertyCode: 168,
        name: "Airport Preference",
        action: "award",
        bid: {
          type: "airport-preference",
          event: "landing",
          locations: [{ code: "YYZ", kind: "airport" }],
          dateScope: null,
          minimumLayoverDuration: null,
        },
        tiers: ["T2"],
      },
      {
        propertyGroupKey: "commuter-t1-t2",
        rowSeq: 3,
        bidType: "Line",
        propertyCode: 408,
        name: "Commuter Pattern",
        bid: {
          type: "days-off-on-pattern",
          minDaysOff: 4,
          minDaysOn: 4,
          maxDaysOn: 5,
          dateRange: null,
          min: 1,
          max: 14,
        },
        tiers: ["T1", "T2"],
      },
    ]);

    renderStandingBidPage();

    const allFilter = await screen.findByRole("radio", { name: "ALL" });
    const t1Filter = screen.getByRole("radio", { name: "T1" });
    const t2Filter = screen.getByRole("radio", { name: "T2" });
    const t7Filter = screen.getByRole("radio", { name: "T7" });
    const addPropertyCount = screen.getAllByRole("button", { name: /^Add / }).length;

    expect(allFilter).toBeChecked();
    expect(screen.getByLabelText("Prefer Off bid summary")).toBeInTheDocument();
    expect(screen.getByLabelText("Airport Preference bid summary")).toBeInTheDocument();
    expect(screen.getByLabelText("Commuter Pattern bid summary")).toBeInTheDocument();

    await user.click(t1Filter);
    expect(screen.getByLabelText("Prefer Off bid summary")).toBeInTheDocument();
    expect(screen.queryByLabelText("Airport Preference bid summary")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Commuter Pattern bid summary")).toBeInTheDocument();

    await user.click(t2Filter);
    expect(screen.queryByLabelText("Prefer Off bid summary")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Airport Preference bid summary")).toBeInTheDocument();
    expect(screen.getByLabelText("Commuter Pattern bid summary")).toBeInTheDocument();

    await user.click(t7Filter);
    expect(screen.getByText("No saved Standing Bid properties in T7.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Add / })).toHaveLength(addPropertyCount);
    expect(standingBidService.saveDraft).not.toHaveBeenCalled();
  });

  it("keeps the single-column shell while loading without rendering mode tabs", () => {
    vi.mocked(standingBidService.getPageData).mockImplementation(() => new Promise(() => undefined));

    renderStandingBidPage();

    expect(screen.getByRole("status", { name: "Loading Standing Bid..." })).toBeInTheDocument();
    expect(screen.getByText("EXISTING STANDING BID")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Lineholder" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Reserve" })).not.toBeInTheDocument();
  });

  it("shows Reserve Standing properties under the Roster category", async () => {
    renderStandingBidPage();

    const categoryTabs = await screen.findByRole("tablist", { name: "Property categories" });

    expect(within(categoryTabs).getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "ALL PROPERTIES",
      "DAYS OFF",
      "PAIRING",
      "ROSTER",
    ]);
    expect(within(categoryTabs).getByRole("tab", { name: "ALL PROPERTIES" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("tab", { name: "STANDING" })).not.toBeInTheDocument();
    expect(within(categoryTabs).queryByRole("tab", { name: "RESERVE" })).not.toBeInTheDocument();
    await userEvent.click(within(categoryTabs).getByRole("tab", { name: "ROSTER" }));
    expect(screen.getByRole("button", { name: "Add Commuter Pattern" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Reserve Preference" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Reserve Day of Week Off" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Reserve Work Block Size" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Waive to Allow Carry over to be Days Off" })).toBeInTheDocument();
  });

  it("adds a Lineholder property using only the Lineholder draft metadata", async () => {
    const user = userEvent.setup();

    renderStandingBidPage();
    await user.click(await screen.findByRole("button", { name: "Add Day of Week Off" }));
    expect(screen.queryByLabelText("Configure bid for Day of Week Off date restriction")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mon" }));
    await user.click(screen.getByRole("button", { name: "Wed" }));
    await user.click(await screen.findByRole("button", { name: "Toggle T1 for Day of Week Off" }));
    await user.click(await screen.findByRole("button", { name: "ADD BID" }));

    await waitFor(() => expect(standingBidService.saveDraft).toHaveBeenCalledTimes(1));
    expect(standingBidService.saveDraft).toHaveBeenCalledWith(
      "lineholder",
      expect.arrayContaining([
        expect.objectContaining({
          propertyCode: 218,
          sourceContext: "lineholder",
          bid: expect.objectContaining({
            type: "date-or-dow-list",
            dates: [],
            daysOfWeek: ["MON", "WED", "SAT"],
          }),
        }),
      ]),
      expect.objectContaining({
        bidContext: "StandingLineholder",
        draftVersion: 2,
        remarks: "lineholder remarks",
      }),
    );
  });

  it("adds Standing Mixed Line Bid as an explicit Pairing Only lineholder bid", async () => {
    const user = userEvent.setup();

    renderStandingBidPage();
    await user.type(await screen.findByPlaceholderText("Search Standing Properties"), "Mixed Line");
    await user.click(await screen.findByRole("button", { name: "Add Mixed Line Bid" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Configure Standing Bid for Mixed Line Bid",
    });
    expect(within(dialog).getByRole("button", { name: "Mixed Line" })).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByRole("button", { name: "ADD BID" })).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "+ ADD RESERVE SHORT CALL" }));
    expect(within(dialog).getByLabelText("Configure short-call 1 for Mixed Line Bid short-call type")).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Pairing Only" }));
    expect(within(dialog).queryByText("Pairing Only conflicts with Reserve Short Call bids.")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "CLEAR BIDS" })).not.toBeInTheDocument();
    expect(within(dialog).queryByText("RESERVE SHORT CALL")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Toggle T1 for Mixed Line Bid" }));
    await user.click(within(dialog).getByRole("button", { name: "ADD BID" }));

    await waitFor(() => expect(standingBidService.saveDraft).toHaveBeenCalledTimes(1));
    expect(standingBidService.saveDraft).toHaveBeenCalledWith(
      "lineholder",
      expect.arrayContaining([
        expect.objectContaining({
          propertyCode: 427,
          name: "Mixed Line Bid",
          action: "avoid",
          sourceContext: "lineholder",
          bid: { type: "flag" },
        }),
      ]),
      expect.objectContaining({
        bidContext: "StandingLineholder",
        draftVersion: 2,
      }),
    );
  });

  it("adds Standing Mixed Line Bid as a reserve short-call bid without date range controls", async () => {
    const user = userEvent.setup();

    renderStandingBidPage();
    await user.type(await screen.findByPlaceholderText("Search Standing Properties"), "Mixed Line");
    await user.click(await screen.findByRole("button", { name: "Add Mixed Line Bid" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Configure Standing Bid for Mixed Line Bid",
    });
    expect(within(dialog).getByRole("button", { name: "Mixed Line" })).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByText("RESERVE SHORT CALL")).toBeInTheDocument();
    expect(within(dialog).queryByText("LIMIT TO A DATE RANGE")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "+ ADD RESERVE SHORT CALL" }));
    await user.click(within(dialog).getByRole("button", { name: "Toggle T1 for Mixed Line Bid" }));
    const [, dateScopeSelect] = within(dialog).getAllByRole("combobox");
    await user.selectOptions(dateScopeSelect!, "first_half");
    await user.click(within(dialog).getByRole("button", { name: "ADD BID" }));

    await waitFor(() => expect(standingBidService.saveDraft).toHaveBeenCalledTimes(1));
    expect(standingBidService.saveDraft).toHaveBeenCalledWith(
      "reserve",
      expect.arrayContaining([
        expect.objectContaining({
          propertyCode: 301,
          name: "Mixed Line Bid",
          action: "award",
          bid: expect.objectContaining({
            type: "reserve-call-type-date-scope",
            callType: "PRAM",
            dateScope: { mode: "first_half" },
          }),
        }),
      ]),
      expect.objectContaining({
        bidContext: "StandingReserve",
        draftVersion: 7,
      }),
    );
  });

  it("moves an existing Standing Mixed Line Bid to reserve short-call when edited back to Mixed Line", async () => {
    const user = userEvent.setup();
    response = buildStandingResponse([
      {
        propertyGroupKey: "standing-line-427",
        rowSeq: 1,
        bidType: "Line",
        propertyCode: 427,
        name: "Reserve",
        action: "award",
        bid: { type: "flag" },
        tiers: ["T1"],
      },
    ]);

    renderStandingBidPage();

    expect(await screen.findByLabelText("Mixed Line Bid bid summary")).toHaveTextContent(
      "Reserve only for the whole bid month",
    );
    await user.click(screen.getByRole("button", { name: "Edit existing property Mixed Line Bid" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Configure Standing Bid for Mixed Line Bid",
    });
    expect(within(dialog).getByRole("button", { name: "Reserve Only" })).toHaveAttribute("aria-pressed", "true");
    await user.click(within(dialog).getByRole("button", { name: "Mixed Line" }));
    await user.click(within(dialog).getByRole("button", { name: "+ ADD RESERVE SHORT CALL" }));
    const tierButton = within(dialog).getByRole("button", { name: "Toggle T1 for Mixed Line Bid" });
    if (tierButton.getAttribute("aria-pressed") !== "true") {
      await user.click(tierButton);
    }
    expect(within(dialog).getByRole("button", { name: "UPDATE BID" })).toBeEnabled();
    await user.click(within(dialog).getByRole("button", { name: "UPDATE BID" }));

    await waitFor(() => expect(standingBidService.saveDraft).toHaveBeenCalledTimes(2));
    expect(standingBidService.saveDraft).toHaveBeenNthCalledWith(
      1,
      "lineholder",
      [],
      expect.objectContaining({
        bidContext: "StandingLineholder",
        draftVersion: 2,
      }),
    );
    expect(standingBidService.saveDraft).toHaveBeenNthCalledWith(
      2,
      "reserve",
      expect.arrayContaining([
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
      ]),
      expect.objectContaining({
        bidContext: "StandingReserve",
        draftVersion: 7,
      }),
    );
  });

  it("keeps an add dialog unchanged while same-view Standing data hydrates during save", async () => {
    const user = userEvent.setup();
    const pendingSave = {
      resolve: null as ((value: PbsStandingCurrentResponse) => void) | null,
    };

    vi.mocked(standingBidService.saveDraft).mockImplementationOnce(() =>
      new Promise<PbsStandingCurrentResponse>((resolve) => {
        pendingSave.resolve = resolve;
      }));

    renderStandingBidPage();
    await user.click(await screen.findByRole("button", { name: "Add Day of Week Off" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Configure Standing Bid for Day of Week Off",
    });
    expect(within(dialog).getByText("APPLY TO TIERS")).toHaveTextContent("APPLY TO TIERS · REQUIRED");
    const mondayButton = within(dialog).getByRole("button", { name: "Mon" });
    const tierButton = within(dialog).getByRole("button", {
      name: "Toggle T1 for Day of Week Off",
    });

    await user.click(mondayButton);
    await user.click(tierButton);
    await user.click(within(dialog).getByRole("button", { name: "ADD BID" }));

    expect(within(dialog).getByRole("button", { name: "ADDING..." })).toBeDisabled();
    const savedProperty: PbsStandingCurrentResponse["lineholderDraft"]["properties"][number] = {
      propertyGroupKey: "standing-lineholder-218",
      rowSeq: 1,
      bidType: "DaysOff",
      propertyCode: 218,
      name: "Day of Week Off",
      bid: { type: "date-or-dow-list" as const, dates: [], daysOfWeek: ["MON", "SAT"] },
      tiers: ["T1"],
    };
    queryClient.setQueryData(
      standingBidPageDataQueryKey,
      mapStandingBidResponseToPageData(buildStandingResponse([savedProperty])),
    );

    await waitFor(() => {
      expect(mondayButton).toHaveAttribute("aria-pressed", "true");
      expect(tierButton).toHaveAttribute("aria-pressed", "true");
      expect(dialog).toBeInTheDocument();
    });

    if (!pendingSave.resolve) {
      throw new Error("Expected Standing save to be pending.");
    }

    response = buildStandingResponse([savedProperty]);
    pendingSave.resolve(response);

    await waitFor(() => {
      expect(screen.queryByRole("dialog", {
        name: "Configure Standing Bid for Day of Week Off",
      })).not.toBeInTheDocument();
      expect(screen.getByLabelText("Day of Week Off bid summary")).toHaveTextContent(
        "Monday, Saturday",
      );
    });
  });

  it("keeps Pairing tiers and values visible while a Standing add is pending", async () => {
    const user = userEvent.setup();
    const pendingSave = {
      resolve: null as ((value: PbsStandingCurrentResponse) => void) | null,
    };

    vi.mocked(standingBidService.saveDraft).mockImplementationOnce(() =>
      new Promise<PbsStandingCurrentResponse>((resolve) => {
        pendingSave.resolve = resolve;
      }));

    renderStandingBidPage();
    await user.click(await screen.findByRole("button", { name: "Add Flight Legs per Duty" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Configure Standing Bid for Flight Legs per Duty",
    });
    const tierButton = within(dialog).getByRole("button", {
      name: "Toggle T1 for Flight Legs per Duty",
    });
    const operatorSelect = within(dialog).getByRole("combobox", {
      name: "Flight Legs per Duty operator",
    });
    const legsInput = within(dialog).getByRole("spinbutton", {
      name: "Flight Legs per Duty legs per duty",
    });

    await user.click(tierButton);
    await user.selectOptions(operatorSelect, "<");
    await user.clear(legsInput);
    await user.type(legsInput, "3");
    await user.click(within(dialog).getByRole("button", { name: "ADD BID" }));

    expect(within(dialog).getByRole("button", { name: "ADDING..." })).toBeDisabled();
    await waitFor(() => {
      expect(tierButton).toHaveAttribute("aria-pressed", "true");
      expect(operatorSelect).toHaveValue("<");
      expect(legsInput).toHaveValue(3);
    });

    if (!pendingSave.resolve) {
      throw new Error("Expected Standing save to be pending.");
    }

    pendingSave.resolve(buildStandingResponse([
      {
        propertyGroupKey: "standing-lineholder-107",
        rowSeq: 1,
        bidType: "Pairing",
        propertyCode: 107,
        name: "Flight Legs per Duty",
        action: "award",
        bid: {
          type: "flight-legs-per-duty",
          operator: "<",
          legs: 3,
          dateScope: null,
        },
        tiers: ["T1"],
      },
    ]));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", {
        name: "Configure Standing Bid for Flight Legs per Duty",
      })).not.toBeInTheDocument();
    });
  });

  it("keeps an edited Standing value after save failure so the user can retry", async () => {
    const user = userEvent.setup();
    response = buildStandingResponse([
      {
        propertyGroupKey: "standing-lineholder-218",
        rowSeq: 1,
        bidType: "DaysOff",
        propertyCode: 218,
        name: "Day of Week Off",
        bid: { type: "date-or-dow-list", dates: [], daysOfWeek: ["SAT"] },
        tiers: ["T1"],
      },
    ]);
    vi.mocked(standingBidService.saveDraft).mockRejectedValueOnce(new Error("Save failed."));

    renderStandingBidPage();
    await user.click(await screen.findByRole("button", {
      name: "Edit existing property Day of Week Off",
    }));
    const dialog = await screen.findByRole("dialog", {
      name: "Configure Standing Bid for Day of Week Off",
    });
    const mondayButton = within(dialog).getByRole("button", { name: "Mon" });

    await user.click(mondayButton);
    await user.click(within(dialog).getByRole("button", { name: "UPDATE BID" }));

    await waitFor(() => {
      expect(within(dialog).getByRole("button", { name: "UPDATE BID" })).toBeEnabled();
      expect(mondayButton).toHaveAttribute("aria-pressed", "true");
    });

    await user.click(within(dialog).getByRole("button", { name: "UPDATE BID" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", {
        name: "Configure Standing Bid for Day of Week Off",
      })).not.toBeInTheDocument();
      expect(screen.getByLabelText("Day of Week Off bid summary")).toHaveTextContent(
        "Monday, Saturday",
      );
    });
    expect(standingBidService.saveDraft).toHaveBeenCalledTimes(2);
  });

  it("ignores an old Standing save result after the panel switches views", async () => {
    const user = userEvent.setup();
    const pendingSave = {
      resolve: null as ((value: PbsStandingCurrentResponse) => void) | null,
    };

    vi.mocked(standingBidService.saveDraft).mockImplementationOnce(() =>
      new Promise<PbsStandingCurrentResponse>((resolve) => {
        pendingSave.resolve = resolve;
      }));

    renderStandingBidPage();
    await user.click(await screen.findByRole("button", { name: "Add Day of Week Off" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Configure Standing Bid for Day of Week Off",
    });
    await user.click(within(dialog).getByRole("button", {
      name: "Toggle T1 for Day of Week Off",
    }));
    await user.click(within(dialog).getByRole("button", { name: "ADD BID" }));

    const switchedView = mapStandingBidResponseToPageData(response);
    switchedView.rightPanel.draftMeta = {
      ...switchedView.rightPanel.draftMeta,
      periodCode: "STANDING-NEXT",
    };
    queryClient.setQueryData(standingBidPageDataQueryKey, switchedView);

    await waitFor(() => {
      expect(screen.queryByRole("dialog", {
        name: "Configure Standing Bid for Day of Week Off",
      })).not.toBeInTheDocument();
    });

    if (!pendingSave.resolve) {
      throw new Error("Expected Standing save to be pending.");
    }

    pendingSave.resolve(buildStandingResponse([
      {
        propertyGroupKey: "old-standing-lineholder-218",
        rowSeq: 1,
        bidType: "DaysOff",
        propertyCode: 218,
        name: "Day of Week Off",
        bid: { type: "date-or-dow-list", dates: [], daysOfWeek: ["SAT"] },
        tiers: ["T1"],
      },
    ]));

    await waitFor(() => {
      const currentData = queryClient.getQueryData<ReturnType<typeof mapStandingBidResponseToPageData>>(
        standingBidPageDataQueryKey,
      );

      expect(currentData?.rightPanel.draftMeta.periodCode).toBe("STANDING-NEXT");
      expect(screen.queryByLabelText("Day of Week Off bid summary")).not.toBeInTheDocument();
    });
  });

  it("adds a Reserve property using only the Reserve draft metadata", async () => {
    const user = userEvent.setup();

    renderStandingBidPage();
    await user.click(await screen.findByRole("tab", { name: "ROSTER" }));
    await user.click(await screen.findByRole("button", { name: "Add Reserve Preference" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Configure Standing Bid for Reserve Preference",
    });
    expect(within(dialog).getByText("SHORT-CALL TYPE")).toBeInTheDocument();
    expect(within(dialog).getByRole("combobox", { name: "Configure bid for Reserve Preference short-call type" })).toHaveTextContent("CRAM");
    expect(within(dialog).getByRole("combobox", { name: "Configure bid for Reserve Preference short-call type" })).toHaveTextContent("CRPM");
    expect(within(dialog).getByRole("combobox", { name: "Configure bid for Reserve Preference short-call type" })).not.toHaveTextContent("PRAM");
    await user.click(await within(dialog).findByRole("button", { name: "Toggle T1 for Reserve Preference" }));
    await user.click(await screen.findByRole("button", { name: "ADD BID" }));

    await waitFor(() => expect(standingBidService.saveDraft).toHaveBeenCalledTimes(1));
    expect(standingBidService.saveDraft).toHaveBeenCalledWith(
      "reserve",
      expect.arrayContaining([
        expect.objectContaining({ propertyCode: 301, sourceContext: "reserve" }),
      ]),
      expect.objectContaining({
        bidContext: "StandingReserve",
        draftVersion: 7,
        remarks: "reserve remarks",
      }),
    );
  });

  it("recovers a draft conflict by invalidating only the Standing query", async () => {
    const user = userEvent.setup();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");

    vi.mocked(standingBidService.saveDraft).mockRejectedValueOnce({
      response: {
        status: 409,
        data: { message: "Draft version conflict." },
      },
    });

    renderStandingBidPage();
    await user.click(await screen.findByRole("button", { name: "Add Day of Week Off" }));
    await user.click(await screen.findByRole("button", { name: "Toggle T1 for Day of Week Off" }));
    await user.click(await screen.findByRole("button", { name: "ADD BID" }));

    const recoveryAlert = await screen.findByRole("alert");

    expect(within(recoveryAlert).getByText(/changed in another request/i)).toBeInTheDocument();
    await user.click(within(recoveryAlert).getByRole("button", { name: "Reload draft" }));

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: standingBidPageDataQueryKey,
    });
    expect(invalidateQueries).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: expect.arrayContaining(["bid"]) }),
    );
  });

  it("shows all Standing categories with Bid-style badges and semantic summaries", async () => {
    response = buildStandingResponse(
      [
        {
          propertyGroupKey: "days-off-existing",
          rowSeq: 1,
          bidType: "DaysOff",
          propertyCode: 218,
          name: "Day of Week Off",
          bid: { type: "date-or-dow-list", dates: [], daysOfWeek: ["SAT"] },
          tiers: ["T1"],
        },
        {
          propertyGroupKey: "pairing-existing",
          rowSeq: 2,
          bidType: "Pairing",
          propertyCode: 168,
          name: "Airport Preference",
          action: "award",
          bid: {
            type: "airport-preference",
            event: "landing",
            locations: [{ code: "YYZ", kind: "airport" }],
            dateScope: null,
          },
          tiers: ["T1"],
        },
        {
          propertyGroupKey: "roster-existing",
          rowSeq: 3,
          bidType: "Line",
          propertyCode: 408,
          name: "Commuter Pattern",
          bid: {
            type: "days-off-on-pattern",
            minDaysOff: 4,
            minDaysOn: 4,
            maxDaysOn: 5,
          },
          tiers: ["T1"],
        },
      ],
      [{
        propertyGroupKey: "reserve-existing",
        rowSeq: 1,
        bidType: "Reserve",
        propertyCode: 301,
        name: "Reserve Preference",
        bid: {
          type: "reserve-call-type-date-scope",
          callType: "PRAM",
          options: ["PRAM"],
          dateScope: { mode: "whole_month" },
        },
        tiers: ["T1"],
      }],
    );

    renderStandingBidPage();

    const existingRows = await screen.findAllByTestId("rule-bid-existing-row");

    expect(existingRows).toHaveLength(4);

    const expectedRows = [
      {
        badge: "Days Off",
        badgeClass: "border-[#bddfcb]",
        name: "Day of Week Off",
        summary: "Day off on Saturdays",
      },
      {
        badge: "Pairing",
        badgeClass: "border-[#c9c7f5]",
        name: "Airport Preference",
        summary: "Award pairings landing at YYZ",
      },
      {
        badge: "Roster",
        badgeClass: "border-[#ffd8ac]",
        name: "Commuter Pattern",
        summary: "Work 4–5 days, then 4 days off",
      },
      {
        badge: "Roster",
        badgeClass: "border-[#ffd8ac]",
        name: "Reserve Preference",
        summary: "PRAM on Whole Month",
      },
    ];

    for (const expected of expectedRows) {
      const row = existingRows.find((candidate) => within(candidate).queryByText(expected.summary));

      expect(row).toBeDefined();

      expect(within(row!).getByText(expected.badge)).toHaveClass(expected.badgeClass);
      expect(within(row!).getByLabelText(`${expected.name} bid summary`)).toHaveTextContent(
        expected.summary,
      );
      expect(within(row!).queryByText(expected.name, { exact: true })).not.toBeInTheDocument();
      expect(within(row!).getByRole("button", { name: `Edit existing property ${expected.name}` }))
        .toBeInTheDocument();
      expect(within(row!).getByRole("button", { name: `Delete existing property ${expected.name}` }))
        .toBeInTheDocument();
    }
  });

  it("renders Standing Prefer Off with the Current Bid badge and semantic summaries", async () => {
    response = buildStandingResponse([
      {
        propertyGroupKey: "prefer-off-weekdays-window",
        rowSeq: 1,
        bidType: "DaysOff",
        propertyCode: 201,
        name: "Prefer Off",
        bid: {
          type: "tag-list",
          values: ["Monday", "Friday", "Saturday", "Window 18:00-23:59"],
        },
        tiers: ["T1"],
      },
      {
        propertyGroupKey: "prefer-off-weekends-window",
        rowSeq: 2,
        bidType: "DaysOff",
        propertyCode: 201,
        name: "Prefer Off",
        bid: {
          type: "tag-list",
          values: ["Weekends", "Window 18:00-23:59"],
        },
        tiers: ["T1"],
      },
      {
        propertyGroupKey: "prefer-off-weekends",
        rowSeq: 3,
        bidType: "DaysOff",
        propertyCode: 201,
        name: "Prefer Off",
        bid: { type: "tag-list", values: ["Weekends"] },
        tiers: ["T3"],
      },
      {
        propertyGroupKey: "prefer-off-weekdays",
        rowSeq: 4,
        bidType: "DaysOff",
        propertyCode: 201,
        name: "Prefer Off",
        bid: {
          type: "tag-list",
          values: ["Friday", "Tuesday", "Saturday"],
        },
        tiers: ["T4"],
      },
    ]);
    response = {
      ...response,
      preferOffConfig: {
        ...response.preferOffConfig,
        weekend: {
          available: true,
          startDayCode: "SAT",
          startDayName: "Saturday",
          startTime: "00:00",
          endDayCode: "SUN",
          endDayName: "Sunday",
          endTime: "24:00",
        },
      },
    };

    renderStandingBidPage();

    const existingRows = await screen.findAllByTestId("rule-bid-existing-row");

    expect(existingRows).toHaveLength(4);
    expect(existingRows.map((row) =>
      within(row).getByLabelText("Prefer Off bid summary").textContent)).toEqual([
      "Prefer off on Monday, Friday, Saturday from 18:00 to 23:59",
      "Prefer off on weekends from 18:00 to 23:59",
      "Prefer off on weekends",
      "Prefer off on Tuesday, Friday, Saturday",
    ]);

    for (const row of existingRows) {
      const badge = within(row).getByText("Days Off");

      expect(badge).toHaveClass("border-[#bddfcb]", "bg-[#effaf3]", "text-[#32734d]");
      expect(within(row).queryByText("Prefer Off", { exact: true })).not.toBeInTheDocument();
      expect(within(row).getByRole("button", { name: "Edit existing property Prefer Off" }))
        .toBeInTheDocument();
      expect(within(row).getByRole("button", { name: "Delete existing property Prefer Off" }))
        .toBeInTheDocument();
    }
  });
});
