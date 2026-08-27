import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { SharedBiddingWorkbenchLayout } from "@/app/layout/shared-bidding-workbench-layout";
import { AppProviders } from "@/app/providers/app-providers";
import { PairingPage } from "@/features/pairing/pages/pairing-page";
import { SearchPairingsPage } from "@/features/pairing/pages/search-pairings-page";
import { pairingPageData } from "@/features/pairing/mock";
import { biddingCalendarQueryKey } from "@/features/dashboard/hooks/use-bidding-calendar";
import type {
  PairingExistingProperty,
  PairingOccurrenceBidItem,
  PairingSearchPreviewProperty,
  PairingTierOption,
} from "@/features/pairing/types";
import { queryClient } from "@/shared/query/query-client";
import { biddingCalendarService } from "@/shared/services/bidding-calendar-service";
import { pairingService } from "@/shared/services/pairing-service";

const searchPeriod = { rosterPeriodId: 42, periodCode: "Apr 2026" };

const buildPreviewResponse = (pairingId = "M4959", totalItems = 1) => ({
  mode: "single_property_preview" as const,
  property: {
    propertyCode: 150,
    name: "Layover at City",
    action: "award" as const,
    quantifier: "any" as const,
    bid: {
      type: "tag-list" as const,
      values: ["YYZ"],
    },
  },
  summary: {
    pairingIdCount: totalItems,
    totalItems,
  },
  pagination: {
    page: 1,
    pageSize: 30,
    totalItems,
    totalPages: 1,
  },
  results: [
    {
      id: pairingId,
      pairingId,
      pairingNumber: pairingId,
      base: "YYZ",
      originDate: "2026-04-03",
      endDate: "2026-04-05",
      startDateLabel: "Apr 3, 2026",
      endDateLabel: "Apr 5, 2026",
      compositionLabel: "CA(1)FO(1)",
      reportTime: "0630",
      releaseTime: "1545",
      durationDays: 3,
      routeLabel: "YYZ-YVR",
      priorityLabel: "P3",
      prioritySequence: "02",
      totalBlock: "0550",
      totalCredit: "550",
      totalDp: "0930",
      totalPay: "550",
      activeDates: ["2026-04-03", "2026-04-10"],
      legs: [
        {
          id: `${pairingId}-1-1`,
          day: 1,
          dutyDate: "0403",
          dutyFdp: "0830",
          dutyFlyingHour: "0550",
          dutyHour: "0930",
          dutyCredit: "0730",
          flightNumber: "601",
          departureStation: "YYZ",
          arrivalStation: "YVR",
          departureTime: "0730",
          arrivalTime: "1020",
          blockTime: "0550",
          equipment: "7M8",
          ganttQual: "FLY",
          ganttAirline: "F8",
          ganttFlight: "601",
          ganttFleet: "7M8",
          ganttAcc: "D",
          ganttRef: "-",
          ganttDep: "YYZ",
          ganttPickup: "06:00",
          ganttReport: "06:30",
          ganttStd: "07:30",
          ganttAtd: "07:35",
          ganttArr: "YVR",
          ganttSta: "10:20",
          ganttAta: "10:25",
          ganttDropoff: "10:40",
          ganttGroundTime: "0:30",
          ganttBlockHour: "5:50",
          ganttFlightTime: "5:50",
          ganttMinimumRest: "10:00|10:00",
          ganttDuty: "FDP 9:30",
        },
      ],
    },
  ],
});

const buildCurrentRulesPreviewResponse = (tier = "T4", pairingId = "M4959", totalItems = 1) => {
  const previewResponse = buildPreviewResponse(pairingId, totalItems);

  return {
    mode: "current_rules_preview" as const,
    tier,
    properties: [
      {
        propertyGroupKey: "existing-pairing-length",
        rowSeq: 1,
        propertyCode: 112,
        name: "Pairing Length",
        action: "award" as const,
        quantifier: null,
        bid: {
          type: "pairing-length-preference" as const,
          minDays: null,
          maxDays: 1,
          dateScope: null,
        },
        tiers: [tier],
      },
    ],
    summary: previewResponse.summary,
    pagination: previewResponse.pagination,
    results: previewResponse.results,
  };
};

const buildCriteriaPreviewResponse = (pairingId = "M4959", totalItems = 1) => {
  const previewResponse = buildPreviewResponse(pairingId, totalItems);

  return {
    mode: "criteria_preview" as const,
    properties: [
      {
        propertyGroupKey: "criteria-layover-city",
        rowSeq: 1,
        propertyCode: 150,
        name: "Layover at City",
        action: "award" as const,
        quantifier: "any" as const,
        bid: {
          type: "tag-list" as const,
          values: ["YYZ"],
        },
        tiers: ["T1"],
      },
    ],
    summary: previewResponse.summary,
    pagination: previewResponse.pagination,
    results: previewResponse.results,
  };
};

const buildAllPairingsPreviewResponse = () => ({
  mode: "all_pairings_preview" as const,
  summary: {
    pairingIdCount: 1,
    totalItems: 1,
  },
  pagination: {
    page: 1,
    pageSize: 30,
    totalItems: 1,
    totalPages: 1,
  },
  results: [
    {
      id: "496001",
      pairingId: "496001",
      pairingNumber: "M4959",
      base: "YYZ",
      originDate: "2026-04-03",
      endDate: "2026-04-05",
      startDateLabel: "Apr 3, 2026",
      endDateLabel: "Apr 5, 2026",
      compositionLabel: "CA(1)FO(1)",
      reportTime: "0630",
      releaseTime: "1545",
      durationDays: 3,
      routeLabel: "YYZ-YVR",
      priorityLabel: "P3",
      prioritySequence: "02",
      totalBlock: "0550",
      totalCredit: "550",
      totalDp: "0930",
      totalPay: "550",
      activeDates: ["2026-04-03", "2026-04-10"],
      legs: [
        {
          id: "496001-1-1",
          day: 1,
          dutyDate: "0403",
          dutyFdp: "0830",
          dutyFlyingHour: "0550",
          dutyHour: "0930",
          dutyCredit: "0730",
          flightNumber: "601",
          departureStation: "YYZ",
          arrivalStation: "YVR",
          departureTime: "0730",
          arrivalTime: "1020",
          blockTime: "0550",
          equipment: "7M8",
          ganttQual: "FLY",
          ganttAirline: "F8",
          ganttFlight: "601",
          ganttFleet: "7M8",
          ganttAcc: "D",
          ganttRef: "-",
          ganttDep: "YYZ",
          ganttPickup: "06:00",
          ganttReport: "06:30",
          ganttStd: "07:30",
          ganttAtd: "07:35",
          ganttArr: "YVR",
          ganttSta: "10:20",
          ganttAta: "10:25",
          ganttDropoff: "10:40",
          ganttGroundTime: "0:30",
          ganttBlockHour: "5:50",
          ganttFlightTime: "5:50",
          ganttMinimumRest: "10:00|10:00",
          ganttDuty: "FDP 9:30",
        },
      ],
    },
  ],
});

const buildTierOptions = (activeTier = "T4"): PairingTierOption[] =>
  ["T1", "T2", "T3", "T4", "T5", "T6", "T7"].map((tier) => ({
    key: tier.toLowerCase(),
    label: tier,
    active: tier === activeTier,
  }));

const buildLongPairingOccurrences = (): PairingOccurrenceBidItem[] => [
  ["E4101", "2026-06-05"],
  ["E4103", "2026-06-05"],
  ["E4103", "2026-06-08"],
  ["E4103", "2026-06-10"],
  ["E4103", "2026-06-12"],
  ["E4103", "2026-06-19"],
  ["E4106", "2026-06-02"],
  ["E4106", "2026-06-04"],
  ["E4106", "2026-06-06"],
  ["E4106", "2026-06-07"],
  ["E4106", "2026-06-09"],
  ["E4106", "2026-06-11"],
  ["E4106", "2026-06-16"],
  ["E4108", "2026-06-04"],
  ["E4109", "2026-06-04"],
  ["E4109", "2026-06-06"],
  ["E4109", "2026-06-11"],
  ["E4110", "2026-06-08"],
  ["E4111", "2026-06-07"],
  ["E4112", "2026-06-06"],
  ["E4114", "2026-06-12"],
  ["E4117", "2026-06-14"],
  ["E4117", "2026-06-18"],
  ["E4127", "2026-06-21"],
  ["E4203", "2026-06-01"],
].map(([pairingNumber, originDate]) => ({
  occurrenceId: `${pairingNumber}:${originDate}`,
  originDate,
  pairingId: pairingNumber,
  pairingNumber,
}));

const buildLongPairingNumberExistingProperty = (): PairingExistingProperty => ({
  id: "existing-pairing-number-long-rule",
  propertyCode: 102,
  name: "Pairing Number",
  action: "award",
  quantifier: null,
  bid: {
    type: "pairing-occurrence-list",
    occurrences: buildLongPairingOccurrences(),
  },
  tiers: buildTierOptions("T1"),
  priorityOptions: [],
  pairingNumber: "",
  pairingType: "Regular",
  effectiveDateRange: { from: "2026-06-01", to: "2026-06-30" },
});

const buildSearchPreviewProperty = (
  overrides: Partial<PairingSearchPreviewProperty> = {},
): PairingSearchPreviewProperty => ({
  propertyCode: 150,
  name: "Layover at City",
  action: "award",
  quantifier: "any",
  bid: {
    type: "tag-list",
    values: ["YYZ"],
  },
  tiers: buildTierOptions(),
  favorited: false,
  pairingNumber: "LAX410",
  pairingType: "Regular",
  effectiveDateRange: { from: "2025-12-19", to: "2025-12-22" },
  ...overrides,
});

const buildClosedPairingPageData = () => {
  const data = structuredClone(pairingPageData);

  data.rightPanel.draftMeta.currentPeriod = {
    ...data.rightPanel.draftMeta.currentPeriod!,
    status: "CLOSED",
    computedStage: "CLOSED",
    canEditBid: false,
    readOnlyReason: "Bidding closed at May 08, 22:59.",
  };

  return data;
};

const renderSearchPairingsPage = (initialEntry: string | { pathname: string; state?: unknown } = "/pairing/search") =>
  render(
    <AppProviders>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route element={<SharedBiddingWorkbenchLayout />}>
            <Route path="/pairing" element={<PairingPage />} />
            <Route path="/pairing/search" element={<SearchPairingsPage />} />
            <Route path="/bid" element={<div>Bid workbench</div>} />
            <Route path="/bid/pairing/search" element={<SearchPairingsPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AppProviders>,
  );

describe("SearchPairingsPage", () => {
  beforeEach(() => {
    queryClient.clear();
    vi.spyOn(pairingService, "getPageData").mockResolvedValue(structuredClone(pairingPageData));
    vi.spyOn(pairingService, "addCurrentDraftProperty").mockResolvedValue({
      saved: true,
      propertyGroupKey: "search-added-property-key",
      rowSeq: 7,
      draftVersion: 8,
    });
    vi.spyOn(pairingService, "removeCurrentDraftProperty").mockResolvedValue({
      saved: true,
      draftVersion: 9,
    });
    vi.spyOn(pairingService, "patchCurrentDraftProperty").mockResolvedValue({
      saved: true,
      draftVersion: 7,
      propertyGroupKey: "existing-pairing-type",
      deleted: false,
      tiers: ["T4"],
    });
    vi.spyOn(pairingService, "saveConfiguredFavoriteProperty").mockResolvedValue({
      saved: true,
      favoriteKey: "10150",
      propertyId: 150,
      propertyCode: 150,
      name: "Pairing Number",
      action: "award",
      quantifier: null,
      bid: { type: "tag-list", values: ["4960"], suggestions: ["M4960"] },
    });
    vi.spyOn(pairingService, "patchFavoriteProperty").mockResolvedValue({
      saved: true,
      favoriteKey: "10150",
      propertyId: 150,
      propertyCode: 150,
      name: "Layover at City",
      action: "award",
      quantifier: "any",
      bid: { type: "tag-list", values: ["YYZ", "LAX"] },
    });
    vi.spyOn(pairingService, "unfavoriteProperty").mockResolvedValue({ saved: true });
    vi.spyOn(pairingService, "getReferenceOptions").mockResolvedValue({
      airports: [
        { code: "YYZ", name: "TORONTO PEARSON INTL", icao: null, abbr: null, city: "YYZ" },
        { code: "LAX", name: "LOS ANGELES INTL", icao: null, abbr: null, city: "LAX" },
      ],
      cities: [
        { code: "YYZ" },
        { code: "LAX" },
      ],
    });
    vi.spyOn(pairingService, "previewCriteria").mockResolvedValue(buildCriteriaPreviewResponse());
    vi.spyOn(pairingService, "previewSingleProperty").mockResolvedValue(buildCriteriaPreviewResponse());
    vi.spyOn(pairingService, "previewCurrentRules").mockImplementation(async (tier) =>
      buildCurrentRulesPreviewResponse(tier),
    );
    vi.spyOn(pairingService, "previewAllPairings").mockResolvedValue(buildAllPairingsPreviewResponse());
    vi.spyOn(pairingService, "getAirportOptions").mockResolvedValue({
      airportPreferenceLayoverHours: {
        minHours: 1,
        maxHours: 48,
        stepHours: 1,
        defaultHours: 12,
      },
      airportPreferenceOptions: [],
      landingAirports: [],
      layoverAirports: ["YYZ", "LAX"],
      workStartStations: [],
      filterAirports: ["YYZ", "YVR", "YEG"],
    });
    vi.spyOn(pairingService, "searchPairingIds").mockResolvedValue({
      query: "M49",
      rosterPeriodId: 4,
      limit: 20,
      options: [
        {
          value: "4960",
          label: "M4960 (2026-04-03 - 2026-04-05)",
          pairingId: "4960",
          pairingLabel: "M4960",
          startDate: "2026-04-03",
          endDate: "2026-04-05",
        },
        {
          value: "4970",
          label: "M4970 (2026-04-07 - 2026-04-08)",
          pairingId: "4970",
          pairingLabel: "M4970",
          startDate: "2026-04-07",
          endDate: "2026-04-08",
        },
      ],
    });
    vi.spyOn(pairingService, "getPairingNumberFilterOptions").mockResolvedValue({
      query: "",
      rosterPeriodId: 4,
      periodCode: searchPeriod.periodCode,
      limit: 30,
      options: [
        { value: "M4960", label: "M4960" },
        { value: "M4970", label: "M4970" },
      ],
      nextCursor: null,
      totalCount: 2,
    });
    vi.spyOn(pairingService, "searchPairingOccurrences").mockResolvedValue({
      pairingNumber: "M4959",
      rosterPeriodId: 4,
      periodCode: "Apr 2026",
      occurrences: [
        {
          occurrenceId: "496001:2026-04-03",
          pairingNumber: "M4959",
          pairingId: "496001",
          originDate: "2026-04-03",
          startDate: "2026-04-03",
          endDate: "2026-04-05",
          label: "M4959 · 2026-04-03",
        },
        {
          occurrenceId: "496002:2026-04-10",
          pairingNumber: "M4959",
          pairingId: "496002",
          originDate: "2026-04-10",
          startDate: "2026-04-10",
          endDate: "2026-04-12",
          label: "M4959 · 2026-04-10",
        },
      ],
    });
    vi.spyOn(pairingService, "getPairingDetails").mockImplementation(async (_periodCode, targets) => ({
      results: targets.map((target, index) => ({
        id: target.pairingId,
        pairingId: target.pairingId,
        pairingNumber: target.pairingId === "496001" ? "M4959" : `M${target.pairingId}`,
        base: "YYZ",
        originDate: target.originDate ?? (index === 0 ? "2026-04-03" : "2026-04-10"),
        endDate: target.originDate ?? (index === 0 ? "2026-04-05" : "2026-04-12"),
        endDateLabel: index === 0 ? "Apr 5, 2026" : "Apr 12, 2026",
        compositionLabel: "CA(1)FO(1)",
        reportTime: "0630",
        releaseTime: "1545",
        durationDays: 3,
        routeLabel: "YYZ-YVR-YYZ",
        priorityLabel: "P3",
        prioritySequence: "02",
        totalBlock: "5:50",
        totalCredit: "5:50",
        totalPay: "5:50",
        activeDates: [target.originDate ?? (index === 0 ? "2026-04-03" : "2026-04-10")],
        legs: [],
      })),
    }));
    vi.spyOn(biddingCalendarService, "getCurrentCalendar").mockResolvedValue({
      periodCode: "Apr 2026",
      bidContext: "Current",
      activeTierRange: ["T1", "T2", "T3", "T4", "T5", "T6", "T7"],
      events: [],
    });
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
    vi.restoreAllMocks();
  });

  it("renders the search criteria shell and pairing result cards", async () => {
    renderSearchPairingsPage();

    expect(screen.getByTestId("pairing-search-panel")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Search Pairings" })).toBeInTheDocument();
    expect(screen.getByText("SEARCH CRITERIA")).toBeInTheDocument();
    expect(screen.getByText("SEARCH RESULTS")).toBeInTheDocument();
    expect(screen.queryByTestId("pairing-search-criteria-actions")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "BID THESE PROPERTIES" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ADD MORE SEARCH CRITERIA" })).not.toBeInTheDocument();
    expect(screen.getByText("No search criteria selected.")).toBeInTheDocument();
    expect(screen.getByText("0 pairing numbers, 0 total results")).toBeInTheDocument();
    expect(screen.queryByTestId("pairing-search-mini-calendar")).not.toBeInTheDocument();
    expect(screen.queryByText("ACTIONS")).not.toBeInTheDocument();
  });

  it("returns to the pairing workbench from the header back button", async () => {
    const user = userEvent.setup();

    renderSearchPairingsPage();

    await user.click(screen.getByRole("button", { name: "Back to pairing workbench" }));

    expect(await screen.findByText("Bid workbench")).toBeInTheDocument();
    expect(screen.queryByTestId("pairing-search-panel")).not.toBeInTheDocument();
  });

  it("loads real preview results when opened from a single available pairing property", async () => {
    renderSearchPairingsPage({
      pathname: "/pairing/search",
      state: {
        previewProperty: buildSearchPreviewProperty(),
      },
    });

    expect(screen.getByRole("status", { name: "Loading pairing search preview..." })).toBeInTheDocument();
    expect(await screen.findByText("Layover at City")).toBeInTheDocument();
    const layoverCriteriaCard = screen.getByRole("article", { name: "Search criteria Layover at City" });
    const layoverCriteriaBid = screen.getByLabelText("Bid for search criteria Layover at City");
    expect(layoverCriteriaCard).toContainElement(layoverCriteriaBid);
    expect(layoverCriteriaBid).toHaveTextContent("Award · Any · YYZ");
    expect(layoverCriteriaBid.tagName).toBe("DIV");
    expect(layoverCriteriaBid.className).not.toContain("truncate");
    expect(screen.queryByText("ACTIONS")).not.toBeInTheDocument();
    expect(screen.getByTestId("pairing-search-criteria-actions-preview-150")).toContainElement(
      screen.getByRole("button", { name: "Edit search criteria Layover at City" }),
    );
    expect(screen.getByText("1 pairing numbers, 1 total results")).toBeInTheDocument();
    expect(screen.getByText("M4959")).toBeInTheDocument();
    expect(pairingService.previewSingleProperty).toHaveBeenCalledWith(
      expect.objectContaining({
        propertyCode: 150,
        name: "Layover at City",
      }),
      1,
      30,
      searchPeriod,
    );
    expect(screen.queryByRole("button", { name: "Preview search criteria Layover at City" })).not.toBeInTheDocument();
  });

  it("renders Pairing Number search criteria as an expandable grouped summary", async () => {
    const user = userEvent.setup();

    renderSearchPairingsPage({
      pathname: "/pairing/search",
      state: {
        previewProperty: buildSearchPreviewProperty({
          propertyCode: 102,
          name: "Pairing Number",
          action: "award",
          quantifier: null,
          bid: {
            type: "pairing-occurrence-list",
            occurrences: [
              { occurrenceId: "4101:2026-06-05", pairingId: "4101", pairingNumber: "E4101", originDate: "2026-06-05" },
              { occurrenceId: "4103:2026-06-05", pairingId: "4103", pairingNumber: "E4103", originDate: "2026-06-05" },
              { occurrenceId: "4103:2026-06-08", pairingId: "4103", pairingNumber: "E4103", originDate: "2026-06-08" },
              { occurrenceId: "4103:2026-06-10", pairingId: "4103", pairingNumber: "E4103", originDate: "2026-06-10" },
              { occurrenceId: "4103:2026-06-12", pairingId: "4103", pairingNumber: "E4103", originDate: "2026-06-12" },
              { occurrenceId: "4106:2026-06-02", pairingId: "4106", pairingNumber: "E4106", originDate: "2026-06-02" },
            ],
          },
        }),
      },
    });

    const criteriaBid = await screen.findByLabelText("Bid for search criteria Pairing Number");

    expect(criteriaBid).toHaveTextContent("Award · Pairing Number · 6 selected");
    expect(criteriaBid).toHaveTextContent("E4101");
    expect(criteriaBid).toHaveTextContent("Jun 05");
    expect(criteriaBid).toHaveTextContent("E4103");
    expect(criteriaBid).toHaveTextContent("Jun 08");
    expect(criteriaBid).toHaveTextContent("Jun 10");
    expect(criteriaBid).toHaveTextContent("+1 more");
    expect(criteriaBid).not.toHaveTextContent("Jun 12");
    expect(criteriaBid.className).not.toContain("truncate");

    await user.click(within(criteriaBid).getByRole("button", { name: "Show all 6 selected" }));

    expect(criteriaBid).toHaveTextContent("Jun 12");
    expect(within(criteriaBid).getByRole("button", { name: "Show less" })).toBeInTheDocument();
  });

  it("highlights mini calendar active dates by full ISO date across trailing month cells", async () => {
    const mayPreviewResponse = buildCriteriaPreviewResponse("M4959", 1);
    const mayResult = mayPreviewResponse.results[0]!;

    vi.mocked(pairingService.previewSingleProperty).mockResolvedValueOnce({
      ...mayPreviewResponse,
      results: [
        {
          ...mayResult,
          activeDates: ["2026-05-29", "2026-06-01"],
          legs: mayResult.legs.map((leg) => ({ ...leg, dutyDate: "0529" })),
        },
      ],
    });

    renderSearchPairingsPage({
      pathname: "/pairing/search",
      state: {
        draftMeta: {
          ...pairingPageData.rightPanel.draftMeta,
          periodCode: "May 2026",
          currentPeriod: {
            ...pairingPageData.rightPanel.draftMeta.currentPeriod!,
            periodCode: "May 2026",
            rpStartLocal: "2026-05-01",
            rpEndLocal: "2026-05-31",
          },
        },
        previewProperty: buildSearchPreviewProperty(),
      },
    });

    expect(await screen.findByTestId("pairing-search-mini-calendar")).toBeInTheDocument();
    const resultsList = screen.getByTestId("pairing-search-results-list");
    const resultDetail = within(resultsList).getByTestId("pairing-result-card-detail");
    const legPreview = within(resultDetail).getByTestId("pairing-result-card-leg-preview");

    expect(within(resultsList).getAllByText("M4959")).toHaveLength(1);
    expect(within(resultDetail).getByText("Start")).toBeInTheDocument();
    expect(within(resultDetail).getByText("Apr 3, 2026")).toBeInTheDocument();
    expect(within(resultDetail).getByText("Base")).toBeInTheDocument();
    expect(within(resultDetail).getByText("Composition")).toBeInTheDocument();
    expect(within(resultDetail).getByText("CA(1)FO(1)")).toBeInTheDocument();
    expect(within(resultDetail).getByText("Total Credit")).toBeInTheDocument();
    expect(within(resultDetail).getAllByText("5:50").length).toBeGreaterThanOrEqual(2);
    expect(within(resultDetail).getByText("Total BH")).toBeInTheDocument();
    expect(within(resultDetail).getByText("Total DP")).toBeInTheDocument();
    expect(within(resultDetail).getByText("9:30")).toBeInTheDocument();

    for (const header of ["Flight", "ALN", "Fleet", "Route", "PCK", "RPT", "STD", "STA", "BH", "Duty"]) {
      expect(within(legPreview).getByText(header)).toBeInTheDocument();
    }

    for (const value of ["FLY 601", "F8", "7M8", "YYZ → YVR", "06:00", "06:30", "07:30", "10:20", "5:50", "FDP 9:30"]) {
      expect(within(legPreview).getAllByText(value).length).toBeGreaterThan(0);
    }

    for (const fullOnlyHeader of ["QUAL", "ACC", "Ref", "ATD", "ATA", "DRP", "GT", "FT", "MRT"]) {
      expect(within(resultDetail).queryByText(fullOnlyHeader)).not.toBeInTheDocument();
    }

    expect(within(resultDetail).queryByText("DUTY")).not.toBeInTheDocument();
    expect(within(resultDetail).queryByText("FDP")).not.toBeInTheDocument();
    expect(within(resultDetail).queryByText("F/H")).not.toBeInTheDocument();
    expect(within(resultDetail).queryByText("D/H")).not.toBeInTheDocument();
    expect(within(resultDetail).queryByText("CRD")).not.toBeInTheDocument();
    expect(within(resultDetail).queryByText("FLTN")).not.toBeInTheDocument();
    expect(within(resultDetail).queryByText("DPS")).not.toBeInTheDocument();
    expect(within(resultDetail).queryByText("ARS")).not.toBeInTheDocument();
    expect(within(resultDetail).queryByText("BLKT")).not.toBeInTheDocument();
    expect(within(resultDetail).queryByText("EQP")).not.toBeInTheDocument();
    expect(within(resultDetail).queryByTestId("pairing-dialog-gantt-table")).not.toBeInTheDocument();
    expect(resultsList.querySelector('[class*="pairingBadgeSquare"]')).not.toBeInTheDocument();

    expect(document.querySelector('[data-date="2026-04-29"]')).toHaveAttribute("data-active", "false");
    expect(document.querySelector('[data-date="2026-05-29"]')).toHaveAttribute("data-active", "true");
    expect(document.querySelector('[data-date="2026-06-01"]')).toHaveAttribute("data-active", "true");
    expect(document.querySelector('[data-date="2026-05-31"]')).toHaveAttribute("data-active", "false");
  });

  it("loads current pairing rules preview for the initial tier", async () => {
    const existingProperties = pairingPageData.rightPanel.existingProperties.map((property) =>
      property.id === "existing-pairing-length"
        ? {
            ...property,
            propertyCode: 112,
            name: "Pairing Length",
            action: "award" as const,
            quantifier: null,
            bid: {
              type: "pairing-length-preference" as const,
              minDays: null,
              maxDays: 1,
              dateScope: null,
            },
          }
        : property);

    renderSearchPairingsPage({
      pathname: "/pairing/search",
      state: {
        previewMode: "current-rules",
        initialTier: "T4",
        existingProperties,
        draftMeta: pairingPageData.rightPanel.draftMeta,
      },
    });

    expect(screen.getByRole("status", { name: "Loading pairing search preview..." })).toBeInTheDocument();
    expect(await screen.findByTestId("pairing-search-current-rules-preview")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "T4" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Pairing Length: Award pairings up to 1 day long")).toBeInTheDocument();
    expect(screen.getAllByText("AND").length).toBeGreaterThan(0);
    expect(screen.getByText("1 pairing numbers, 1 total results")).toBeInTheDocument();
    expect(screen.getByText("M4959")).toBeInTheDocument();
    expect(pairingService.previewCurrentRules).toHaveBeenCalledWith(
      "T4",
      expect.arrayContaining([
        expect.objectContaining({
          id: "existing-pairing-length",
          propertyCode: 112,
        }),
      ]),
      1,
      30,
      searchPeriod,
    );
    expect(screen.queryByRole("button", { name: /BID THESE PROPERTIES/i })).not.toBeInTheDocument();
  });

  it("renders current rules Pairing Number criteria as a grouped readable summary", async () => {
    const user = userEvent.setup();

    renderSearchPairingsPage({
      pathname: "/pairing/search",
      state: {
        previewMode: "current-rules",
        initialTier: "T1",
        existingProperties: [
          buildLongPairingNumberExistingProperty(),
          ...pairingPageData.rightPanel.existingProperties,
        ],
        draftMeta: pairingPageData.rightPanel.draftMeta,
      },
    });

    const currentRulesPreview = await screen.findByTestId("pairing-search-current-rules-preview");
    const pairingNumberCondition = within(currentRulesPreview).getByLabelText(
      "Rule condition Pairing Number, Award · 25 selected",
    );

    expect(pairingNumberCondition).toHaveTextContent("Pairing Number");
    expect(pairingNumberCondition).toHaveTextContent("Award · 25 selected");
    expect(pairingNumberCondition).toHaveTextContent("E4101");
    expect(pairingNumberCondition).toHaveTextContent("Jun 05");
    expect(pairingNumberCondition).toHaveTextContent("E4103");
    expect(pairingNumberCondition).toHaveTextContent("Jun 08");
    expect(pairingNumberCondition).toHaveTextContent("+2 more");
    expect(pairingNumberCondition).toHaveTextContent("+9 more pairings");
    expect(pairingNumberCondition).not.toHaveTextContent("2026-06-05; E4103");

    await user.click(within(pairingNumberCondition).getByRole("button", { name: "Show all 25 selected" }));

    expect(pairingNumberCondition).toHaveTextContent("E4203");
    expect(pairingNumberCondition).toHaveTextContent("Jun 01");

    await user.click(within(pairingNumberCondition).getByRole("button", { name: "Show less" }));

    expect(pairingNumberCondition).not.toHaveTextContent("E4203");
  });

  it("uses the same counted Pairing Preference summary in Search Criteria", async () => {
    const pairingIds = Array.from({ length: 13 }, (_, index) => String(98938 + index));
    const source = pairingPageData.rightPanel.existingProperties[0]!;

    renderSearchPairingsPage({
      pathname: "/pairing/search",
      state: {
        previewMode: "current-rules",
        initialTier: "T3",
        existingProperties: [{
          ...source,
          id: "pairing-preference-v4507",
          propertyCode: 102,
          name: "Pairing Preference",
          action: "award",
          quantifier: null,
          bid: {
            type: "pairing-preference",
            pairingIds,
            pairingLabels: pairingIds.map(() => "V4507"),
          },
          tiers: source.tiers.map((tier) => ({
            ...tier,
            active: tier.label === "T3",
          })),
        }],
        draftMeta: pairingPageData.rightPanel.draftMeta,
      },
    });

    const currentRulesPreview = await screen.findByTestId("pairing-search-current-rules-preview");

    expect(within(currentRulesPreview).getByText(
      "Pairing Preference: Award pairings V4507 ×13",
    )).toBeInTheDocument();
    expect(currentRulesPreview).not.toHaveTextContent(pairingIds[0]!);
  });

  it("loads all visible pairings and adds the selected result as a Pairing Preference bid", async () => {
    const user = userEvent.setup();
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

    renderSearchPairingsPage({
      pathname: "/pairing/search",
      state: {
        previewMode: "all-pairings",
        draftMeta: pairingPageData.rightPanel.draftMeta,
      },
    });

    expect(screen.getByRole("status", { name: "Refreshing pairing search results" })).toBeInTheDocument();
    expect(screen.getByTestId("pairing-search-results-loading")).toBeInTheDocument();
    expect(await screen.findByText("Showing all pairings available for this bid period.")).toBeInTheDocument();
    expect(await screen.findByText("M4959")).toBeInTheDocument();
    expect(pairingService.previewAllPairings).toHaveBeenCalledWith(
      1,
      30,
      searchPeriod,
      {},
    );

    const addPairingButton = screen.getByRole("button", { name: "ADD PAIRING" });

    expect(addPairingButton.parentElement).toContainElement(screen.getByText("M4959"));

    await user.click(addPairingButton);
    const tierDialog = screen.getByRole("dialog", { name: "Choose pairing bid tier" });

    await user.click(within(tierDialog).getByRole("button", { name: "T5" }));
    await user.click(within(tierDialog).getByRole("button", { name: "ADD PAIRING" }));

    await waitFor(() => {
      expect(pairingService.addCurrentDraftProperty).toHaveBeenCalledWith(
        expect.objectContaining({
          propertyCode: 102,
          name: "Pairing Preference",
          action: "award",
          quantifier: null,
          pairingNumber: "M4959",
          bid: expect.objectContaining({
            type: "pairing-id-list",
            pairingIds: ["496001"],
            pairingLabels: ["M4959"],
          }),
          tiers: expect.arrayContaining([
            expect.objectContaining({ label: "T5", active: true }),
          ]),
        }),
        pairingPageData.rightPanel.draftMeta,
      );
    });
    await waitFor(() => {
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: biddingCalendarQueryKey });
    });
    expect(await screen.findByText("Pairing property added.")).toBeInTheDocument();
    expect(screen.getByTestId("pairing-search-panel")).toBeInTheDocument();
    expect(screen.queryByText("EXISTING PAIRING PROPERTIES")).not.toBeInTheDocument();
    expect(screen.queryByText("Showing all pairings available for this bid period.")).not.toBeInTheDocument();
    expect(screen.getAllByText("Pairing Preference").length).toBeGreaterThan(0);
    const pairingNumberCriteriaBid = screen.getByLabelText("Bid for search criteria Pairing Preference");
    expect(pairingNumberCriteriaBid).toHaveTextContent("Award · Pairing Preference · 1 selected");
    expect(pairingNumberCriteriaBid).toHaveTextContent("M4959");
    expect(pairingNumberCriteriaBid.tagName).toBe("DIV");
    expect(pairingNumberCriteriaBid.className).not.toContain("truncate");
    expect(screen.getByRole("article", { name: "Search criteria Pairing Preference" })).toContainElement(pairingNumberCriteriaBid);
    expect(screen.getByTestId("pairing-search-criteria-actions-all-pairing-added-search-added-property-key-1")).toContainElement(
      screen.getByRole("button", { name: "Remove search criteria Pairing Preference" }),
    );
    expect(screen.queryByText("APPLY TO TIERS")).not.toBeInTheDocument();
    expect(screen.queryByText("ACTIONS")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Toggle search criteria T5 for Pairing Preference" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "Remove search criteria Pairing Preference" }));

    await waitFor(() => {
      expect(pairingService.removeCurrentDraftProperty).toHaveBeenCalledWith(
        "search-added-property-key",
        {
          ...pairingPageData.rightPanel.draftMeta,
          draftVersion: 8,
        },
      );
    });
    await waitFor(() => {
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: biddingCalendarQueryKey });
    });
    expect(await screen.findByText("Pairing property deleted.")).toBeInTheDocument();
    expect(screen.getByText("Showing all pairings available for this bid period.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove search criteria Pairing Preference" })).not.toBeInTheDocument();
  });

  it("keeps All Pairings search read-only when the current bid period is closed", async () => {
    const closedPairingData = buildClosedPairingPageData();

    vi.mocked(pairingService.getPageData).mockResolvedValue(closedPairingData);

    renderSearchPairingsPage({
      pathname: "/pairing/search",
      state: {
        previewMode: "all-pairings",
        draftMeta: closedPairingData.rightPanel.draftMeta,
      },
    });

    expect(await screen.findByText("Showing all pairings available for this bid period.")).toBeInTheDocument();
    expect(await screen.findByText("M4959")).toBeInTheDocument();
    expect(pairingService.previewAllPairings).toHaveBeenCalledWith(
      1,
      30,
      searchPeriod,
      {},
    );
    expect(screen.queryByRole("button", { name: "ADD PAIRING" })).not.toBeInTheDocument();
    expect(pairingService.addCurrentDraftProperty).not.toHaveBeenCalled();
  });

  it("changes the All Pairings page size and reloads the first page", async () => {
    const user = userEvent.setup();

    vi.mocked(pairingService.previewAllPairings).mockImplementation(async (page, pageSize) => {
      const resolvedPage = page ?? 1;
      const resolvedPageSize = pageSize ?? 30;

      return {
        ...buildAllPairingsPreviewResponse(),
        summary: {
          pairingIdCount: 500,
          totalItems: 500,
        },
        pagination: {
          page: resolvedPage,
          pageSize: resolvedPageSize,
          totalItems: 500,
          totalPages: Math.ceil(500 / resolvedPageSize),
        },
      };
    });

    renderSearchPairingsPage({
      pathname: "/pairing/search",
      state: {
        previewMode: "all-pairings",
        draftMeta: pairingPageData.rightPanel.draftMeta,
      },
    });

    const pageSizeSelect = await screen.findByRole("combobox", { name: "Pairings per page" });

    expect(pageSizeSelect).toHaveValue("30");
    expect(within(pageSizeSelect).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "30/Page",
      "50/Page",
      "100/Page",
    ]);

    await waitFor(() => expect(pageSizeSelect).toBeEnabled());

    await user.selectOptions(pageSizeSelect, "50");

    await waitFor(() => {
      expect(pairingService.previewAllPairings).toHaveBeenLastCalledWith(
        1,
        50,
        searchPeriod,
        {},
      );
    });
    expect(pageSizeSelect).toHaveValue("50");
    expect(screen.getByRole("button", { name: "Go to pairing search page 10" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Go to pairing search page 10" }));

    await waitFor(() => {
      expect(pairingService.previewAllPairings).toHaveBeenLastCalledWith(
        10,
        50,
        searchPeriod,
        {},
      );
    });

    await user.selectOptions(pageSizeSelect, "100");

    await waitFor(() => {
      expect(pairingService.previewAllPairings).toHaveBeenLastCalledWith(
        1,
        100,
        searchPeriod,
        {},
      );
    });
    expect(pageSizeSelect).toHaveValue("100");
    expect(screen.getByRole("button", { name: "Go to pairing search page 5" })).toBeInTheDocument();

    await user.selectOptions(pageSizeSelect, "30");

    await waitFor(() => {
      expect(pairingService.previewAllPairings).toHaveBeenLastCalledWith(
        1,
        30,
        searchPeriod,
        {},
      );
    });
    expect(pageSizeSelect).toHaveValue("30");
  });

  it("keeps page size read-only outside the All Pairings preview", async () => {
    renderSearchPairingsPage({
      pathname: "/pairing/search",
      state: {
        previewMode: "current-rules",
        initialTier: "T4",
        existingProperties: pairingPageData.rightPanel.existingProperties,
        draftMeta: pairingPageData.rightPanel.draftMeta,
      },
    });

    expect(await screen.findByTestId("pairing-search-current-rules-preview")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Pairings per page" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Filter results by pairing number" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Filter results by airport" })).not.toBeInTheDocument();
    expect(screen.getByText("30/Page")).toBeInTheDocument();
  });

  it("filters all visible pairing results with multi-selects and a date range", async () => {
    const user = userEvent.setup();

    renderSearchPairingsPage({
      pathname: "/pairing/search",
      state: {
        previewMode: "all-pairings",
        draftMeta: pairingPageData.rightPanel.draftMeta,
      },
    });

    expect(await screen.findByText("M4959")).toBeInTheDocument();

    const pairingNumberFilter = screen.getByRole("combobox", { name: "Filter results by pairing number" });
    await user.type(pairingNumberFilter, "M49");
    await user.click(await screen.findByRole("option", { name: /M4960/ }));
    await user.type(pairingNumberFilter, "M49");
    await user.click(await screen.findByRole("option", { name: /M4970/ }));

    const airportFilter = screen.getByRole("combobox", { name: "Filter results by airport" });
    await user.click(airportFilter);
    await user.click(screen.getByRole("option", { name: "YYZ" }));
    await user.click(airportFilter);
    await user.click(screen.getByRole("option", { name: "YVR" }));

    await waitFor(() => {
      expect(pairingService.previewAllPairings).toHaveBeenLastCalledWith(
        1,
        30,
        searchPeriod,
        expect.objectContaining({
          pairingNumbers: ["M4960", "M4970"],
          airports: ["YYZ", "YVR"],
        }),
      );
    });

    await user.click(screen.getByRole("button", { name: "Remove M4960 from Pairing Number" }));

    await waitFor(() => {
      expect(pairingService.previewAllPairings).toHaveBeenLastCalledWith(
        1,
        30,
        searchPeriod,
        expect.objectContaining({
          pairingNumbers: ["M4970"],
        }),
      );
    });

    await user.click(screen.getByRole("button", { name: "Open date range picker for pairing results" }));
    await user.click(screen.getByRole("gridcell", { name: "Select 2026-04-03" }));
    await user.click(screen.getByRole("gridcell", { name: "Select 2026-04-05" }));
    fireEvent.change(screen.getByLabelText("Filter results from report time"), {
      target: { value: "15:53" },
    });
    fireEvent.change(screen.getByLabelText("Filter results to report time"), {
      target: { value: "08:59" },
    });

    await waitFor(() => {
      expect(pairingService.previewAllPairings).toHaveBeenLastCalledWith(
        1,
        30,
        searchPeriod,
        expect.objectContaining({
          originDateFrom: "2026-04-03",
          originDateTo: "2026-04-05",
          timeFrom: "15:53",
          timeTo: "08:59",
        }),
      );
    });

    await user.click(screen.getByRole("button", { name: "Clear" }));

    await waitFor(() => {
      expect(pairingService.previewAllPairings).toHaveBeenLastCalledWith(
        1,
        30,
        searchPeriod,
        {},
      );
    });
  });

  it("does not expose raw preview errors during initial load or result refresh", async () => {
    const rawError = new Error("Request failed with status code 400: internal response body");
    vi.mocked(pairingService.previewAllPairings).mockRejectedValueOnce(rawError);

    const firstRender = renderSearchPairingsPage({
      pathname: "/pairing/search",
      state: {
        previewMode: "all-pairings",
        draftMeta: pairingPageData.rightPanel.draftMeta,
      },
    });

    expect(await screen.findByText("Unable to refresh pairing results. Adjust the filters or try again."))
      .toBeInTheDocument();
    expect(screen.queryByText(/Request failed with status code 400|internal response body/i))
      .not.toBeInTheDocument();

    firstRender.unmount();
    queryClient.clear();
    vi.mocked(pairingService.previewAllPairings)
      .mockReset()
      .mockResolvedValueOnce(buildAllPairingsPreviewResponse())
      .mockRejectedValueOnce(rawError);

    renderSearchPairingsPage({
      pathname: "/pairing/search",
      state: {
        previewMode: "all-pairings",
        draftMeta: pairingPageData.rightPanel.draftMeta,
      },
    });

    expect(await screen.findByText("M4959")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Filter results from report time"), {
      target: { value: "15:53" },
    });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Unable to refresh pairing results. Adjust the filters or try again.");
    expect(alert).not.toHaveTextContent(/Request failed with status code 400|internal response body/i);
  });

  it("reruns current pairing rules preview when switching tiers", async () => {
    const user = userEvent.setup();

    renderSearchPairingsPage({
      pathname: "/pairing/search",
      state: {
        previewMode: "current-rules",
        initialTier: "T4",
        existingProperties: pairingPageData.rightPanel.existingProperties,
        draftMeta: pairingPageData.rightPanel.draftMeta,
      },
    });

    expect(await screen.findByTestId("pairing-search-current-rules-preview")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "T5" }));

    await waitFor(() => {
      expect(pairingService.previewCurrentRules).toHaveBeenCalledWith(
        "T5",
        expect.any(Array),
        1,
        30,
        searchPeriod,
      );
    });
    expect(screen.getByRole("tab", { name: "T5" })).toHaveAttribute("aria-selected", "true");
  });

  it("opens a configure dialog and keeps criteria unchanged when criteria editing is cancelled", async () => {
    const user = userEvent.setup();

    renderSearchPairingsPage({
      pathname: "/pairing/search",
      state: {
        previewProperty: buildSearchPreviewProperty(),
      },
    });

    expect(await screen.findByText("Layover at City")).toBeInTheDocument();
    await waitFor(() => expect(pairingService.previewSingleProperty).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: "Edit search criteria Layover at City" }));

    const configureDialog = screen.getByRole("dialog", { name: "Configure Layover at City" });

    expect(within(configureDialog).getByText("Configure Pairing Bid")).toBeInTheDocument();
    expect(screen.queryByText("EDIT BID")).not.toBeInTheDocument();

    await user.type(within(configureDialog).getByLabelText("BID Layover at City"), "LAX");
    await user.click(await screen.findByRole("option", { name: /LAX/ }));

    expect(screen.getByText("Award · Any · YYZ")).toBeInTheDocument();
    expect(pairingService.previewSingleProperty).toHaveBeenCalledTimes(1);

    await user.click(within(configureDialog).getByRole("button", { name: "CANCEL" }));

    expect(screen.queryByRole("dialog", { name: "Configure Layover at City" })).not.toBeInTheDocument();
    expect(screen.getByText("Award · Any · YYZ")).toBeInTheDocument();
    expect(screen.queryByText("Award · Any · YYZ, LAX")).not.toBeInTheDocument();
    expect(pairingService.previewSingleProperty).toHaveBeenCalledTimes(1);
  });

  it("rehydrates a saved Flight Legs per Duty rule when editing search criteria", async () => {
    const user = userEvent.setup();

    renderSearchPairingsPage({
      pathname: "/pairing/search",
      state: {
        previewProperty: buildSearchPreviewProperty({
          propertyCode: 107,
          name: "Flight Legs per Duty",
          action: "avoid",
          quantifier: "every",
          bid: { type: "flight-legs-per-duty", operator: ">", legs: 4, dateScope: null },
          tiers: buildTierOptions("T3"),
        }),
      },
    });

    expect(await screen.findByText("Flight Legs per Duty")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit search criteria Flight Legs per Duty" }));

    const configureDialog = screen.getByRole("dialog", { name: "Configure Flight Legs per Duty" });

    expect(within(configureDialog).getByRole("button", { name: "Avoid" })).toHaveAttribute("aria-pressed", "true");
    expect(within(configureDialog).getByRole("button", { name: "Every duty" })).toHaveAttribute("aria-pressed", "true");
    expect(within(configureDialog).getByRole("combobox", { name: "Flight Legs per Duty operator" })).toHaveValue(">");
    expect(within(configureDialog).getByRole("spinbutton", { name: "Flight Legs per Duty legs per duty" })).toHaveValue(4);
    expect(within(configureDialog).queryByText("Avoid pairings with every duty having more than 4 legs.")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(within(configureDialog).getByRole("button", { name: "UPDATE BID" })).toBeEnabled(),
    );
  });

  it("rehydrates a saved Month-End Carryover rule when editing search criteria", async () => {
    const user = userEvent.setup();

    renderSearchPairingsPage({
      pathname: "/pairing/search",
      state: {
        previewProperty: buildSearchPreviewProperty({
          propertyCode: 163,
          name: "Month-End Carryover",
          action: "avoid",
          quantifier: null,
          bid: { type: "month-end-carryover", operator: "Between", from: 2, to: 4 },
          tiers: buildTierOptions("T3"),
        }),
      },
    });

    expect(await screen.findByText("Month-End Carryover")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit search criteria Month-End Carryover" }));

    const configureDialog = screen.getByRole("dialog", { name: "Configure Month-End Carryover" });

    expect(within(configureDialog).getByRole("button", { name: "Avoid" })).toHaveAttribute("aria-pressed", "true");
    expect(within(configureDialog).getByRole("combobox", { name: "Month-End Carryover operator" })).toHaveValue("Between");
    expect(within(configureDialog).getByRole("spinbutton", { name: "Month-End Carryover carry-out from days" })).toHaveValue(2);
    expect(within(configureDialog).getByRole("spinbutton", { name: "Month-End Carryover carry-out to days" })).toHaveValue(4);
    await waitFor(() =>
      expect(within(configureDialog).getByRole("button", { name: "UPDATE BID" })).toBeEnabled(),
    );
  });

  it("rehydrates a saved Work Day Preference date range when editing search criteria", async () => {
    const user = userEvent.setup();

    renderSearchPairingsPage({
      pathname: "/pairing/search",
      state: {
        previewProperty: buildSearchPreviewProperty({
          propertyCode: 110,
          name: "Work Day Preference",
          action: "award",
          quantifier: null,
          bid: {
            type: "work-day-preference",
            days: [{ dayOfWeek: "TUE", checkInFrom: "06:00", checkInTo: "10:00" }],
            dateScope: { mode: "date_range", from: "2026-06-02", to: "2026-06-08" },
          },
          tiers: buildTierOptions("T3"),
        }),
      },
    });

    expect(await screen.findByText("Work Day Preference")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit search criteria Work Day Preference" }));

    const configureDialog = screen.getByRole("dialog", { name: "Configure Work Day Preference" });

    expect(within(configureDialog).queryByRole("button", { name: "Award" })).not.toBeInTheDocument();
    expect(within(configureDialog).getByRole("button", { name: "Tue" })).toHaveAttribute("aria-pressed", "true");
    expect(within(configureDialog).getByLabelText("Work Day Preference Tue check-in from")).toHaveValue("06:00");
    expect(within(configureDialog).getByRole("button", { name: "Date Range" })).toHaveAttribute("aria-pressed", "true");
    expect(within(configureDialog).getByRole("button", { name: "Open date picker for Work Day Preference event date range" })).toBeVisible();
    expect(within(configureDialog).getByText("2026-06-02")).toBeInTheDocument();
    expect(within(configureDialog).getByText("2026-06-08")).toBeInTheDocument();
    expect(within(configureDialog).queryByText("Between")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(within(configureDialog).getByRole("button", { name: "UPDATE BID" })).toBeEnabled(),
    );
  });

  it("keeps the search criteria Pairing Preference dialog bounded for many run dates", async () => {
    const user = userEvent.setup();
    const selectedOccurrences = Array.from({ length: 25 }, (_, index) => {
      const day = String(index + 1).padStart(2, "0");

      return {
        occurrenceId: `4960${day}:2026-04-${day}`,
        originDate: `2026-04-${day}`,
        pairingId: `4960${day}`,
        pairingNumber: "M4959",
      };
    });

    renderSearchPairingsPage({
      pathname: "/pairing/search",
      state: {
        previewProperty: buildSearchPreviewProperty({
          propertyCode: 102,
          name: "Pairing Number",
          action: "award",
          quantifier: null,
          bid: {
            type: "pairing-occurrence-list",
            occurrences: selectedOccurrences,
          },
          tiers: buildTierOptions("T1"),
          pairingNumber: "M4959",
        }),
      },
    });

    expect(await screen.findByText("Pairing Number")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit search criteria Pairing Number" }));
    const configureDialog = screen.getByRole("dialog", { name: "Configure Pairing Number" });

    expect(within(configureDialog).getByText("Configure Pairing Preference")).toBeInTheDocument();
    expect(within(configureDialog).getByText("PAIRINGS")).toBeInTheDocument();
    expect(configureDialog.className).toContain("max-h-[calc(100vh-32px)]");
    expect(configureDialog.className).toContain("w-[min(1120px,calc(100vw-32px))]");
    expect(within(configureDialog).getByRole("button", { name: "UPDATE BID" })).toBeInTheDocument();
  });

  it("reruns the preview search after confirming criteria bid edits in the configure dialog", async () => {
    const user = userEvent.setup();

    renderSearchPairingsPage({
      pathname: "/pairing/search",
      state: {
        previewProperty: buildSearchPreviewProperty(),
      },
    });

    expect(await screen.findByText("Layover at City")).toBeInTheDocument();
    await waitFor(() => expect(pairingService.previewSingleProperty).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: "Edit search criteria Layover at City" }));

    const configureDialog = screen.getByRole("dialog", { name: "Configure Layover at City" });

    expect(screen.queryByText("EDIT BID")).not.toBeInTheDocument();

    await user.type(within(configureDialog).getByLabelText("BID Layover at City"), "LAX");
    await user.click(await screen.findByRole("option", { name: /LAX/ }));

    expect(pairingService.previewSingleProperty).toHaveBeenCalledTimes(1);

    await user.click(within(configureDialog).getByRole("button", { name: "UPDATE BID" }));

    await waitFor(() =>
      expect(pairingService.previewSingleProperty).toHaveBeenCalledWith(
        expect.objectContaining({
          bid: expect.objectContaining({
            values: expect.arrayContaining(["YYZ", "LAX"]),
          }),
          propertyCode: 150,
        }),
        1,
        30,
        searchPeriod,
      ),
    );
    expect(screen.queryByRole("dialog", { name: "Configure Layover at City" })).not.toBeInTheDocument();
    expect(screen.getByText("Award · Any · YYZ, LAX")).toBeInTheDocument();
  });

  it("keeps catalog preview edits local without syncing a saved source", async () => {
    const user = userEvent.setup();

    renderSearchPairingsPage({
      pathname: "/pairing/search",
      state: {
        previewProperty: buildSearchPreviewProperty(),
        previewSource: { type: "catalog" },
      },
    });

    expect(await screen.findByText("Layover at City")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit search criteria Layover at City" }));
    const configureDialog = screen.getByRole("dialog", { name: "Configure Layover at City" });
    await user.type(within(configureDialog).getByLabelText("BID Layover at City"), "LAX");
    await user.click(await screen.findByRole("option", { name: /LAX/ }));
    await user.click(within(configureDialog).getByRole("button", { name: "UPDATE BID" }));

    expect(await screen.findByText("Award · Any · YYZ, LAX")).toBeInTheDocument();
    expect(pairingService.patchCurrentDraftProperty).not.toHaveBeenCalled();
    expect(pairingService.patchFavoriteProperty).not.toHaveBeenCalled();
  });

  it("syncs confirmed criteria edits back to the existing pairing property source", async () => {
    const user = userEvent.setup();

    renderSearchPairingsPage({
      pathname: "/pairing/search",
      state: {
        previewProperty: buildSearchPreviewProperty(),
        previewSource: {
          type: "existing",
          propertyGroupKey: "existing-layover-city",
        },
      },
    });

    expect(await screen.findByText("Layover at City")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit search criteria Layover at City" }));
    const configureDialog = screen.getByRole("dialog", { name: "Configure Layover at City" });
    await user.type(within(configureDialog).getByLabelText("BID Layover at City"), "LAX");
    await user.click(await screen.findByRole("option", { name: /LAX/ }));
    await user.click(within(configureDialog).getByRole("button", { name: "UPDATE BID" }));

    await waitFor(() =>
      expect(pairingService.patchCurrentDraftProperty).toHaveBeenCalledWith(
        "existing-layover-city",
        expect.objectContaining({
          id: "existing-layover-city",
          propertyCode: 150,
          name: "Layover at City",
          bid: expect.objectContaining({
            values: expect.arrayContaining(["YYZ", "LAX"]),
          }),
        }),
        pairingPageData.rightPanel.draftMeta,
      ),
    );
    expect(pairingService.patchFavoriteProperty).not.toHaveBeenCalled();
    expect(await screen.findByText("Pairing property updated.")).toBeInTheDocument();
  });

  it("keeps existing-source search criteria read-only when the current bid period is closed", async () => {
    const closedPairingData = buildClosedPairingPageData();

    vi.mocked(pairingService.getPageData).mockResolvedValue(closedPairingData);

    renderSearchPairingsPage({
      pathname: "/pairing/search",
      state: {
        previewProperty: buildSearchPreviewProperty(),
        previewSource: {
          type: "existing",
          propertyGroupKey: "existing-layover-city",
        },
        draftMeta: closedPairingData.rightPanel.draftMeta,
      },
    });

    expect(await screen.findByText("Layover at City")).toBeInTheDocument();
    const editButton = screen.getByRole("button", { name: "Edit search criteria Layover at City" });

    expect(editButton).toBeDisabled();
    fireEvent.click(editButton);
    expect(screen.queryByRole("dialog", { name: "Configure Layover at City" })).not.toBeInTheDocument();
    expect(pairingService.patchCurrentDraftProperty).not.toHaveBeenCalled();
  });

  it("syncs confirmed criteria edits back to the favorite source by favorite key", async () => {
    const user = userEvent.setup();

    renderSearchPairingsPage({
      pathname: "/pairing/search",
      state: {
        previewProperty: buildSearchPreviewProperty({
          favoriteKey: "10112",
          propertyId: 112,
          propertyCode: 112,
          name: "Pairing Length",
          quantifier: null,
          favorited: true,
          bid: {
            type: "pairing-length-preference",
            minDays: 2,
            maxDays: 3,
            dateScope: null,
            min: 1,
            max: 7,
          },
        }),
        previewSource: {
          type: "favorite",
          favoriteKey: "10112",
        },
      },
    });

    expect(await screen.findByText("Pairing Length")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit search criteria Pairing Length" }));
    const configureDialog = screen.getByRole("dialog", { name: "Configure Pairing Length" });
    expect(within(configureDialog).queryByText("LIMIT TO PAIRING START DATE")).not.toBeInTheDocument();
    await user.click(within(configureDialog).getByRole("button", { name: "Award" }));
    await user.click(within(configureDialog).getByRole("button", { name: "UPDATE BID" }));

    await waitFor(() =>
      expect(pairingService.patchFavoriteProperty).toHaveBeenCalledWith(
        "10112",
        expect.objectContaining({
          propertyCode: 112,
          name: "Pairing Length",
        }),
        pairingPageData.rightPanel.draftMeta,
      ),
    );
    expect(pairingService.patchCurrentDraftProperty).not.toHaveBeenCalled();
    expect(await screen.findByText("Favorite updated.")).toBeInTheDocument();
  });

  it("blocks favorite source edits when the favorite identity is missing", async () => {
    const user = userEvent.setup();

    renderSearchPairingsPage({
      pathname: "/pairing/search",
      state: {
        previewProperty: buildSearchPreviewProperty({
          favorited: true,
        }),
        previewSource: {
          type: "favorite",
          favoriteKey: "",
        },
      },
    });

    expect(await screen.findByText("Layover at City")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit search criteria Layover at City" }));
    const configureDialog = screen.getByRole("dialog", { name: "Configure Layover at City" });
    await user.type(within(configureDialog).getByLabelText("BID Layover at City"), "LAX");
    await user.click(await screen.findByRole("option", { name: /LAX/ }));
    await user.click(within(configureDialog).getByRole("button", { name: "UPDATE BID" }));

    expect(await screen.findByText("Unable to update favorite because its saved identity is missing.")).toBeInTheDocument();
    expect(pairingService.patchFavoriteProperty).not.toHaveBeenCalled();
    expect(pairingService.patchCurrentDraftProperty).not.toHaveBeenCalled();
    expect(screen.getByText("Award · Any · YYZ")).toBeInTheDocument();
  });

  it("keeps the search criteria visible and refreshes only the results area after confirming edits", async () => {
    const user = userEvent.setup();
    const previewCriteriaMock = vi.mocked(pairingService.previewSingleProperty);
    const pendingPreview = {
      resolve: null as ((value: ReturnType<typeof buildCriteriaPreviewResponse>) => void) | null,
    };

    previewCriteriaMock.mockReset();
    previewCriteriaMock
      .mockResolvedValueOnce(buildCriteriaPreviewResponse("M4959", 1))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            pendingPreview.resolve = resolve;
          }),
      );

    renderSearchPairingsPage({
      pathname: "/pairing/search",
      state: {
        previewProperty: buildSearchPreviewProperty(),
      },
    });

    expect(await screen.findByText("Layover at City")).toBeInTheDocument();
    expect(screen.getByText("M4959")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit search criteria Layover at City" }));
    const configureDialog = screen.getByRole("dialog", { name: "Configure Layover at City" });
    await user.type(within(configureDialog).getByLabelText("BID Layover at City"), "LAX");
    await user.click(await screen.findByRole("option", { name: /LAX/ }));
    await user.click(within(configureDialog).getByRole("button", { name: "UPDATE BID" }));

    expect(await screen.findByRole("status", { name: "Refreshing pairing search results" })).toBeInTheDocument();
    expect(screen.getByTestId("pairing-search-panel")).toBeInTheDocument();
    expect(screen.getByText("SEARCH CRITERIA")).toBeInTheDocument();
    expect(screen.queryByText("EDIT BID")).not.toBeInTheDocument();
    expect(within(screen.getByTestId("pairing-search-results-list")).queryByText("M4959")).not.toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Loading pairing search preview..." })).not.toBeInTheDocument();

    await waitFor(() => {
      if (!pendingPreview.resolve) {
        throw new Error("Expected the second preview request to be pending.");
      }
    });

    pendingPreview.resolve?.(buildCriteriaPreviewResponse("M4960", 1));

    expect(await screen.findByText("M4960")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Refreshing pairing search results" })).not.toBeInTheDocument();
  });
});
