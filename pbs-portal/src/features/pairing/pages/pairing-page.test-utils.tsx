import { StrictMode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { SharedBiddingWorkbenchLayout } from "@/app/layout/shared-bidding-workbench-layout";
import { AppProviders } from "@/app/providers/app-providers";
import { pairingPageData } from "@/features/pairing/mock";
import { PairingPage } from "@/features/pairing/pages/pairing-page";
import type { PairingRightPanelPresentation } from "@/features/pairing/components/pairing-right-panel";
import { SearchPairingsPage } from "@/features/pairing/pages/search-pairings-page";
import { queryClient } from "@/shared/query/query-client";
import { biddingCalendarService } from "@/shared/services/bidding-calendar-service";
import { pairingService } from "@/shared/services/pairing-service";
import { useBiddingCalendarStore } from "@/shared/store/use-bidding-calendar-store";
import { usePairingPoolCountsRefreshStore } from "@/features/pairing/pairing-pool-counts-refresh-store";

const AVAILABLE_PROPERTIES_PAGE_SIZE = 10;

const buildCurrentRulesPreviewResponse = (tier = "T4") => ({
  mode: "current_rules_preview" as const,
  tier,
  properties: [
    {
      propertyGroupKey: "existing-pairing-length",
      rowSeq: 1,
      propertyCode: 131,
      name: "Prefer Pairing Length",
      action: null,
      quantifier: null,
      bid: {
        type: "stepper" as const,
        value: 3,
        min: 1,
        max: 7,
      },
      tiers: [tier],
    },
  ],
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
      id: "1",
      pairingId: "M4965",
      pairingNumber: "M4965",
      base: "YYZ",
      originDate: "2026-04-03",
      endDate: "2026-04-05",
      endDateLabel: "Apr 5, 2026",
      reportTime: "0630",
      releaseTime: "1545",
      durationDays: 3,
      routeLabel: "YYZ-YVR",
      priorityLabel: "P3",
      prioritySequence: "02",
      totalBlock: "0550",
      totalCredit: "550",
      totalPay: "550",
      activeDates: ["2026-04-03", "2026-04-10"],
      legs: [
        {
          id: "1-1-1",
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
        },
      ],
    },
  ],
});

const buildCriteriaPreviewResponse = () => {
  const previewResponse = buildCurrentRulesPreviewResponse("T1");

  return {
    mode: "criteria_preview" as const,
    properties: previewResponse.properties,
    summary: previewResponse.summary,
    pagination: previewResponse.pagination,
    results: previewResponse.results,
  };
};

export const buildAllPairingsPreviewResponse = () => {
  const previewResponse = buildCurrentRulesPreviewResponse("T1");
  const template = previewResponse.results[0]!;

  return {
    mode: "all_pairings_preview" as const,
    summary: { pairingIdCount: 2, totalItems: 2 },
    pagination: { ...previewResponse.pagination, totalItems: 2 },
    results: [
      template,
      {
        ...template,
        id: "496001",
        pairingId: "496001",
        pairingNumber: "M4959",
      },
    ],
  };
};

const emptyPoolCount = {
  pairingIdCount: 0,
  totalItems: 0,
};

const rowPoolCountsByPropertyId = new Map([
  ["existing-duty-period", { pairingIdCount: 80, totalItems: 90 }],
  ["existing-pairing-type", { pairingIdCount: 64, totalItems: 70 }],
  ["existing-credit-ratio", { pairingIdCount: 35, totalItems: 40 }],
  ["existing-pairing-length", { pairingIdCount: 70, totalItems: 85 }],
  ["existing-pairing-length-on-date", { pairingIdCount: 18, totalItems: 22 }],
  ["existing-pairing-length-secondary", { pairingIdCount: 20, totalItems: 30 }],
]);

export const buildCurrentRulesCountsResponse = (tier = "T1") => {
  const activeProperties = pairingPageData.rightPanel.existingProperties.filter((property) =>
    property.tiers.some((option) => option.active && option.label === tier),
  );
  const allRules = activeProperties.length === 0
    ? null
    : {
        pairingIdCount: tier === "T4" ? 42 : 12,
        totalItems: tier === "T4" ? 57 : 18,
      };

  return {
    mode: "current_rules_counts" as const,
    periodCode: pairingPageData.rightPanel.draftMeta.periodCode,
    tier,
    computedAt: "2026-06-11T00:00:00.000Z",
    summary: {
      activePropertyCount: activeProperties.length,
      allRules,
    },
    rows: pairingPageData.rightPanel.existingProperties.map((property, index) => ({
      propertyGroupKey: property.id,
      rowSeq: index + 1,
      propertyCode: property.propertyCode,
      name: property.name,
      rule: rowPoolCountsByPropertyId.get(property.id) ?? emptyPoolCount,
      funnel: activeProperties.some((activeProperty) => activeProperty.id === property.id)
        ? allRules ?? emptyPoolCount
        : emptyPoolCount,
    })),
  };
};

export const expectedAvailablePropertiesSummary = `Total ${
  pairingPageData.rightPanel.availableProperties.filter((property) => property.source !== "favorite").length
} items`;

export const expectedFavoritePropertiesSummary = `Total ${
  pairingPageData.rightPanel.availableProperties.filter((property) => property.favorited).length
} items`;

export const showAllPairingProperties = async (user: ReturnType<typeof userEvent.setup>) => {
  const allPropertiesTab = await screen.findByRole("button", { name: "ALL PROPERTIES" });

  if (allPropertiesTab.getAttribute("aria-pressed") !== "true") {
    await user.click(allPropertiesTab);
  }
};

const getAvailablePropertyPage = (propertyCode: number) => {
  const propertyIndex = pairingPageData.rightPanel.availableProperties.findIndex(
    (property) => property.propertyCode === propertyCode,
  );

  if (propertyIndex < 0) {
    throw new Error(`Expected available pairing property fixture for code ${propertyCode}.`);
  }

  return Math.floor(propertyIndex / AVAILABLE_PROPERTIES_PAGE_SIZE) + 1;
};

export const goToAvailablePropertyPage = async (
  user: ReturnType<typeof userEvent.setup>,
  propertyCode: number,
) => {
  await showAllPairingProperties(user);

  const page = getAvailablePropertyPage(propertyCode);
  const pageButton = await screen.findByRole("button", {
    name: `Go to available properties page ${page}`,
  });

  await user.click(pageButton);
};

export const renderPairingPage = (
  withStrictMode = false,
  presentation?: PairingRightPanelPresentation,
) =>
  render(
    <AppProviders>
      {withStrictMode ? (
        <StrictMode>
          <MemoryRouter initialEntries={["/pairing"]}>
            <Routes>
              <Route element={<SharedBiddingWorkbenchLayout />}>
                <Route path="/bid" element={<PairingPage presentation={presentation} />} />
                <Route path="/pairing" element={<PairingPage presentation={presentation} />} />
                <Route path="/pairing/search" element={<SearchPairingsPage />} />
                <Route path="/bid/pairing/search" element={<SearchPairingsPage />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </StrictMode>
      ) : (
        <MemoryRouter initialEntries={["/pairing"]}>
          <Routes>
            <Route element={<SharedBiddingWorkbenchLayout />}>
              <Route path="/bid" element={<PairingPage presentation={presentation} />} />
              <Route path="/pairing" element={<PairingPage presentation={presentation} />} />
              <Route path="/pairing/search" element={<SearchPairingsPage />} />
              <Route path="/bid/pairing/search" element={<SearchPairingsPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      )}
    </AppProviders>,
  );

export const setupPairingPageTestMocks = () => {
  let addPropertyResponseSequence = 0;

  useBiddingCalendarStore.getState().resetActiveTierLabel();
  usePairingPoolCountsRefreshStore.getState().resetPairingPoolCountsRefresh();
  vi.spyOn(pairingService, "getPageData").mockResolvedValue(structuredClone(pairingPageData));
  vi.spyOn(pairingService, "addCurrentDraftProperty").mockImplementation(async () => ({
    saved: true,
    propertyGroupKey: `pairing-property-key-added-${addPropertyResponseSequence += 1}`,
    rowSeq: 7,
  }));
  vi.spyOn(pairingService, "removeCurrentDraftProperty").mockResolvedValue({ saved: true, draftVersion: 1 });
  vi.spyOn(pairingService, "patchCurrentDraftProperty").mockImplementation(async (propertyGroupKey, property) => ({
    saved: true,
    draftVersion: 1,
    propertyGroupKey,
    deleted: property.tiers.every((tier) => !tier.active),
    tiers: property.tiers.filter((tier) => tier.active).map((tier) => tier.label),
  }));
  vi.spyOn(pairingService, "saveConfiguredFavoriteProperty").mockImplementation(async (property) => ({
    saved: true,
    favoriteKey: `configured-${property.propertyCode}`,
    propertyId: property.propertyId ?? property.propertyCode,
    propertyCode: property.propertyCode,
    name: property.name,
    action: property.action,
    quantifier: property.quantifier,
    bid: property.bid,
  }));
  vi.spyOn(pairingService, "patchFavoriteProperty").mockImplementation(async (favoriteKey, property) => ({
    saved: true,
    favoriteKey,
    propertyId: property.propertyId ?? property.propertyCode,
    propertyCode: property.propertyCode,
    name: property.name,
    action: property.action,
    quantifier: property.quantifier,
    bid: property.bid,
  }));
  vi.spyOn(pairingService, "unfavoriteProperty").mockResolvedValue({ saved: true });
  vi.spyOn(pairingService, "previewCurrentRules").mockImplementation(async (tier) =>
    buildCurrentRulesPreviewResponse(tier),
  );
  vi.spyOn(pairingService, "countCurrentRules").mockImplementation(async (tier) =>
    buildCurrentRulesCountsResponse(tier),
  );
  vi.spyOn(pairingService, "previewCriteria").mockResolvedValue(buildCriteriaPreviewResponse());
  vi.spyOn(pairingService, "previewSingleProperty").mockResolvedValue(buildCriteriaPreviewResponse());
  vi.spyOn(pairingService, "previewAllPairings").mockResolvedValue(buildAllPairingsPreviewResponse());
  vi.spyOn(pairingService, "getReferenceOptions").mockResolvedValue({
    airports: [
      { code: "DFW", name: "DALLAS-FORT WORTH INTL", icao: null, abbr: null, city: "DFW" },
      { code: "LAX", name: "LOS ANGELES INTL", icao: null, abbr: null, city: "LAX" },
    ],
    cities: [
      { code: "DFW" },
      { code: "LAX" },
      { code: "SAN" },
    ],
  });
  vi.spyOn(pairingService, "getAirportOptions").mockResolvedValue({
    airportPreferenceLayoverHours: { minHours: 13, maxHours: 18, stepHours: 1, defaultHours: 13 },
    airportPreferenceOptions: [
      { code: "YVR", kind: "airport", label: "YVR · Vancouver", events: ["landing"] },
      { code: "YYZ", kind: "airport", label: "YYZ · Toronto Pearson", events: ["layover"] },
    ],
    landingAirports: ["YVR"],
    layoverAirports: ["YYZ"],
    workStartStations: ["YVR"],
    filterAirports: ["YVR", "YYZ"],
  });
  vi.spyOn(pairingService, "getTimeBetweenFlightsBounds").mockResolvedValue({
    minimumMinutes: 45,
    maximumMinutes: 260,
  });
  vi.spyOn(pairingService, "searchPairingIds").mockResolvedValue({
    query: "m49",
    rosterPeriodId: 4,
    limit: 20,
    options: [
      {
        value: "496001",
        label: "M4959 (2026-04-03 - 2026-04-05)",
        pairingId: "496001",
        pairingLabel: "M4959",
        startDate: "2026-04-03",
        endDate: "2026-04-05",
      },
    ],
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
  vi.spyOn(pairingService, "searchPairingOccurrencesByDate").mockResolvedValue({
    originDate: "2026-04-04",
    rosterPeriodId: 4,
    periodCode: "Apr 2026",
    occurrences: [
      {
        occurrenceId: "496001:2026-04-04",
        pairingNumber: "M4959",
        pairingId: "496001",
        originDate: "2026-04-04",
        startDate: "2026-04-04",
        endDate: "2026-04-06",
        label: "M4959 · 2026-04-04",
      },
    ],
  });
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
  queryClient.clear();
};

export const cleanupPairingPageTest = () => {
  cleanup();
  useBiddingCalendarStore.getState().resetActiveTierLabel();
  usePairingPoolCountsRefreshStore.getState().resetPairingPoolCountsRefresh();
  vi.restoreAllMocks();
};
