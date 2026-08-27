import { StrictMode } from "react";
import { cleanup, render } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { BIDDING_CALENDAR_COLLAPSED_STORAGE_KEY } from "@/app/layout/bidding-calendar-collapse-state";
import { SharedBiddingWorkbenchLayout } from "@/app/layout/shared-bidding-workbench-layout";
import { AppProviders } from "@/app/providers/app-providers";
import { queryClient } from "@/shared/query/query-client";
import { biddingCalendarService } from "@/shared/services/bidding-calendar-service";
import { dashboardProfileService } from "@/shared/services/dashboard-profile-service";
import { daysOffService } from "@/shared/services/days-off-service";
import { pairingService } from "@/shared/services/pairing-service";
import { reserveService } from "@/shared/services/reserve-service";
import { tierService } from "@/shared/services/tier-service";
import { usePairingPoolCountsRefreshStore } from "@/features/pairing/pairing-pool-counts-refresh-store";
import { daysOffPageDataQueryKey } from "@/features/days-off/hooks/use-days-off-page-data";
import { buildCalendarDraftFromDaysOffPageData } from "@/features/days-off/days-off-calendar-prefer-off";
import type { CalendarDraftResponse } from "@/features/dashboard/dashboard-calendar-state";
import type { RuleBidExistingProperty, RuleBidPageData, RuleBidRightPanelData } from "@/features/rule-bids/types";
import { useBiddingCalendarStore } from "@/shared/store/use-bidding-calendar-store";

const LINEHOLDER_TIER_KEYS = ["T1", "T2", "T3", "T4", "T5", "T6", "T7"];

export const setViewportSize = (width: number, height = 1080) => {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
    writable: true,
  });

  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: height,
    writable: true,
  });
};

export const renderSharedWorkbench = (initialPath = "/pairing", withStrictMode = false) =>
  render(
    <AppProviders>
      {withStrictMode ? (
        <StrictMode>
          <MemoryRouter initialEntries={[initialPath]}>
            <Routes>
              <Route element={<SharedBiddingWorkbenchLayout />}>
                <Route
                  path="/pairing"
                  element={<Link to="/bid">Pairing workbench body</Link>}
                />
                <Route
                  path="/days-off"
                  element={<Link to="/pairing">Days off workbench body</Link>}
                />
                <Route
                  path="/bid"
                  element={<Link to="/pairing">Bid workbench body</Link>}
                />
              </Route>
            </Routes>
          </MemoryRouter>
        </StrictMode>
      ) : (
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route element={<SharedBiddingWorkbenchLayout />}>
              <Route
                path="/pairing"
                element={<Link to="/bid">Pairing workbench body</Link>}
              />
              <Route
                path="/days-off"
                element={<Link to="/pairing">Days off workbench body</Link>}
              />
              <Route
                path="/bid"
                element={<Link to="/pairing">Bid workbench body</Link>}
              />
            </Route>
          </Routes>
        </MemoryRouter>
      )}
    </AppProviders>,
  );

export const buildPairingTierOptionsForTest = (activeTiers: string[]) =>
  LINEHOLDER_TIER_KEYS.map((tier) => ({
    key: tier.toLowerCase(),
    label: tier,
    active: activeTiers.includes(tier),
  }));

const buildCalendarPairingDetailPreviewResponse = () => ({
  mode: "criteria_preview" as const,
  properties: [
    {
      propertyGroupKey: "calendar-detail-M4959",
      rowSeq: 1,
      propertyCode: 102,
      name: "Pairing Number",
      action: "award" as const,
      quantifier: null,
      bid: {
        type: "tag-list-date" as const,
        values: ["4959001"],
        date: "2026-04-06",
      },
      tiers: ["T1"],
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
      id: "4959001",
      pairingId: "4959001",
      pairingNumber: "M4959",
      base: "YVR",
      originDate: "2026-04-06",
      endDate: "2026-04-08",
      startDateLabel: "Apr 6, 2026",
      endDateLabel: "Apr 8, 2026",
      compositionLabel: "CA(1)",
      reportTime: "0630",
      releaseTime: "1830",
      durationDays: 3,
      routeLabel: "YVR-CUN",
      priorityLabel: "P0",
      prioritySequence: "00",
      totalBlock: "1214",
      totalCredit: "765",
      totalDp: "9:30",
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
          ganttQual: "FLY",
          ganttAirline: "F8",
          ganttFlight: "2810",
          ganttFleet: "7M8",
          ganttAcc: "D",
          ganttRef: "-240",
          ganttDep: "YVR",
          ganttPickup: "06:15",
          ganttReport: "06:30",
          ganttStd: "07:30",
          ganttAtd: "07:35",
          ganttArr: "CUN",
          ganttSta: "13:01",
          ganttAta: "13:05",
          ganttDropoff: "13:20",
          ganttGroundTime: "1:02",
          ganttBlockHour: "5:31",
          ganttFlightTime: "5:31",
          ganttMinimumRest: "10:00|10:00",
          ganttDuty: "LO 1 · FDP 8:30",
        },
        {
          id: "4959001-2-1",
          day: 2,
          dutyDate: "0407",
          dutyFdp: "0910",
          dutyFlyingHour: "0643",
          dutyHour: "1010",
          dutyCredit: "0645",
          flightNumber: "2811",
          departureStation: "CUN",
          arrivalStation: "YVR",
          departureTime: "1520",
          arrivalTime: "2203",
          blockTime: "0643",
          equipment: "7M8",
          ganttQual: "FLY",
          ganttAirline: "F8",
          ganttFlight: "2811",
          ganttFleet: "7M8",
          ganttAcc: "D",
          ganttRef: "-240",
          ganttDep: "CUN",
          ganttPickup: "14:15",
          ganttReport: "14:30",
          ganttStd: "15:20",
          ganttAtd: "15:25",
          ganttArr: "YVR",
          ganttSta: "22:03",
          ganttAta: "22:06",
          ganttDropoff: "22:20",
          ganttGroundTime: "",
          ganttBlockHour: "6:43",
          ganttFlightTime: "6:43",
          ganttMinimumRest: "",
          ganttDuty: "LO 2 · FDP 9:10",
        },
      ],
    },
  ],
});

const buildDaysOffDraftMetaForTest = (
  draft: CalendarDraftResponse["draft"],
): RuleBidRightPanelData["draftMeta"] => ({
  draftKey: draft.draftKey,
  bidId: draft.bidId,
  periodId: draft.periodId ?? 42,
  periodCode: draft.periodCode,
  draftVersion: draft.draftVersion,
  bidContext: draft.bidContext,
  remarks: "",
  currentPeriod: {
    id: draft.periodId ?? 42,
    rosterPeriodId: draft.periodId ?? 42,
    rosterPeriodKey: "2026RP04",
    periodCode: draft.periodCode,
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
});

const buildPreferOffPropertyFromDraft = (
  draft: CalendarDraftResponse["draft"],
  id = "days-off-prefer-off-1",
): RuleBidExistingProperty | null => {
  const dates = Array.from(new Set(draft.tiers.flatMap((tier) => tier.dates))).sort();

  if (dates.length === 0) {
    return null;
  }

  const activeTiers = new Set(
    draft.tiers
      .filter((tier) => tier.dates.length > 0)
      .map((tier) => tier.tier),
  );

  return {
    id,
    propertyCode: 201,
    name: "Prefer Off",
    bid: {
      type: "tag-list",
      values: dates,
      suggestions: [],
    },
    tiers: buildPairingTierOptionsForTest(Array.from(activeTiers)),
    allOrNothing: false,
    minimumN: null,
  };
};

export const buildDaysOffPageDataForTest = (
  draft: CalendarDraftResponse["draft"],
): RuleBidPageData => {
  const preferOffProperty = buildPreferOffPropertyFromDraft(draft);

  return {
    rightPanel: {
      draftMeta: buildDaysOffDraftMetaForTest(draft),
      existingTitle: "EXISTING DAYS OFF PROPERTIES",
      addButtonLabel: "ADD BID",
      addSectionTitle: "ADD DAYS OFF PROPERTIES",
      allPropertiesLabel: "ALL PROPERTIES",
      favoritedPropertiesLabel: "FAVORITED PROPERTIES",
      searchPlaceholder: "Search Properties",
      existingProperties: preferOffProperty ? [preferOffProperty] : [],
      availableProperties: [
        {
          id: "available-prefer-off",
          propertyCode: 201,
          name: "Prefer Off",
          favorited: false,
          bid: {
            type: "tag-list",
            values: [],
            suggestions: [],
          },
          tiers: buildPairingTierOptionsForTest([]),
          allOrNothing: false,
          minimumN: null,
        },
      ],
    },
  };
};

const buildCalendarPatchChangesForTest = (
  before: CalendarDraftResponse["draft"],
  after: CalendarDraftResponse["draft"],
) => {
  const changes: { date: string; tier: string; selected: boolean }[] = [];
  const beforeDatesByTier = new Map(before.tiers.map((tier) => [tier.tier, new Set(tier.dates)] as const));
  const afterDatesByTier = new Map(after.tiers.map((tier) => [tier.tier, new Set(tier.dates)] as const));
  const allDates = Array.from(new Set([
    ...before.tiers.flatMap((tier) => tier.dates),
    ...after.tiers.flatMap((tier) => tier.dates),
  ])).sort();

  for (const date of allDates) {
    for (const tier of LINEHOLDER_TIER_KEYS) {
      const hadDate = beforeDatesByTier.get(tier)?.has(date) ?? false;
      const hasDate = afterDatesByTier.get(tier)?.has(date) ?? false;

      if (hadDate !== hasDate) {
        changes.push({ date, tier, selected: hasDate });
      }
    }
  }

  return changes;
};

let lastCalendarPatchChangesForTest: { date: string; tier: string; selected: boolean }[] = [];
let daysOffPageDataForTest: RuleBidPageData;

export const getLastPatchedCalendarDraft = () => {
  const pageData = queryClient.getQueryData<RuleBidPageData>(daysOffPageDataQueryKey);

  if (!pageData) {
    throw new Error("Expected days off page data in query cache.");
  }

  const draft = buildCalendarDraftFromDaysOffPageData(pageData).draft;

  return {
    periodCode: draft.periodCode,
    draftVersion: 0,
    bidContext: draft.bidContext,
    tiers: draft.tiers,
  };
};

export const getLastCalendarPatchChanges = () => {
  return lastCalendarPatchChangesForTest;
};

export const getDaysOffCalendarMutationCallCount = () =>
  vi.mocked(daysOffService.addCurrentDraftProperty).mock.calls.length
  + vi.mocked(daysOffService.patchCurrentDraftProperty).mock.calls.length
  + vi.mocked(daysOffService.removeCurrentDraftProperty).mock.calls.length;

export const setDaysOffPageDataForTest = (pageData: RuleBidPageData) => {
  daysOffPageDataForTest = pageData;
  queryClient.setQueryData(daysOffPageDataQueryKey, daysOffPageDataForTest);
};

export const setupSharedWorkbenchTestMocks = () => {
  setViewportSize(1920);
  useBiddingCalendarStore.getState().resetActiveTierLabel();
  usePairingPoolCountsRefreshStore.getState().resetPairingPoolCountsRefresh();
  queryClient.clear();
  daysOffPageDataForTest = buildDaysOffPageDataForTest({
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
  lastCalendarPatchChangesForTest = [];
  const updateDaysOffPageDataForTest = (
    nextExistingProperties: RuleBidExistingProperty[],
    draftVersion: number,
  ) => {
    const beforeDraft = buildCalendarDraftFromDaysOffPageData(daysOffPageDataForTest).draft;
    const nextPageData = {
      ...daysOffPageDataForTest,
      rightPanel: {
        ...daysOffPageDataForTest.rightPanel,
        draftMeta: {
          ...daysOffPageDataForTest.rightPanel.draftMeta,
          draftVersion,
        },
        existingProperties: nextExistingProperties,
      },
    };
    const afterDraft = buildCalendarDraftFromDaysOffPageData(nextPageData).draft;

    lastCalendarPatchChangesForTest = buildCalendarPatchChangesForTest(beforeDraft, afterDraft);
    setDaysOffPageDataForTest(nextPageData);
  };
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
    dayOffCapacity: [
      {
        date: "2026-04-05",
        requestedDayOffCount: 23,
        totalCrewCount: 120,
        pairingDemandCount: 69,
        reserveDemandCount: 8,
        preAssignedDayOffCount: 10,
        maxDaysOffCount: 33,
      },
    ],
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
          groupSeq: 1,
          pairingNumber: "M4959",
          pairingId: "4959001",
          requestedPairingId: "M4959",
          originDate: "2026-04-06",
          occurrenceMode: "specific_date",
          actionId: "award",
        },
      },
      {
        id: "weekend-2026-04-05",
        type: "weekend",
        label: "Weekend",
        startDate: "2026-04-05",
        endDate: "2026-04-05",
        tone: "muted",
        source: "computed",
        readonly: true,
      },
    ],
  });
  vi.spyOn(dashboardProfileService, "getCurrentProfile").mockResolvedValue({
    id: "crew-1001",
    employeeNo: "1001",
    name: "Test Crew",
    email: null,
    base: "YVR",
    rank: "FA",
    division: "C",
    fleet: ["7M8"],
    languages: ["EN"],
    seniorityLabel: "1001",
    statusLabel: "Active",
    existingCreditLabel: "0:00",
    trainingMonthLabel: null,
    lastLoginLabel: null,
  });
  vi.spyOn(tierService, "getPageData").mockImplementation(
    () => new Promise<never>(() => undefined),
  );
  vi.spyOn(daysOffService, "getPageData").mockImplementation(async () => daysOffPageDataForTest);
  vi.spyOn(reserveService, "getCoverage").mockResolvedValue({
    rosterPeriodId: 42,
    rpStartLocal: "2026-04-01",
    rpEndLocal: "2026-04-30",
    periodCode: "Apr 2026",
    baseCode: "YVR",
    days: [
      {
        date: "2026-04-05",
        requiredReserveCount: 12,
        availableOffCount: 33,
      },
    ],
    warnings: [],
  });
  vi.spyOn(daysOffService, "addCurrentDraftProperty").mockImplementation(async (property, draftMeta) => {
    const propertyGroupKey = `days-off-prefer-off-${daysOffPageDataForTest.rightPanel.existingProperties.length + 1}`;
    const draftVersion = draftMeta.draftVersion + 1;

    updateDaysOffPageDataForTest(
      [
        ...daysOffPageDataForTest.rightPanel.existingProperties,
        {
          ...property,
          id: propertyGroupKey,
        },
      ],
      draftVersion,
    );

    return {
      saved: true,
      draftKey: draftMeta.draftKey,
      bidId: draftMeta.bidId,
      periodId: draftMeta.periodId,
      periodCode: draftMeta.periodCode,
      draftVersion,
      propertyGroupKey,
      rowSeq: daysOffPageDataForTest.rightPanel.existingProperties.length,
    };
  });
  vi.spyOn(daysOffService, "patchCurrentDraftProperty").mockImplementation(async (propertyGroupKey, property, draftMeta) => {
    const draftVersion = draftMeta.draftVersion + 1;

    updateDaysOffPageDataForTest(
      daysOffPageDataForTest.rightPanel.existingProperties.map((existingProperty) =>
        existingProperty.id === propertyGroupKey
          ? { ...property, id: propertyGroupKey }
          : existingProperty),
      draftVersion,
    );

    return {
      saved: true,
      draftKey: draftMeta.draftKey,
      bidId: draftMeta.bidId,
      periodId: draftMeta.periodId,
      periodCode: draftMeta.periodCode,
      draftVersion,
      propertyGroupKey,
      deleted: property.tiers.every((tier) => !tier.active),
      tiers: property.tiers.filter((tier) => tier.active).map((tier) => tier.label),
    };
  });
  vi.spyOn(daysOffService, "removeCurrentDraftProperty").mockImplementation(async (propertyGroupKey, draftMeta) => {
    const draftVersion = draftMeta.draftVersion + 1;

    updateDaysOffPageDataForTest(
      daysOffPageDataForTest.rightPanel.existingProperties.filter((property) => property.id !== propertyGroupKey),
      draftVersion,
    );

    return {
      saved: true,
      draftKey: draftMeta.draftKey,
      bidId: draftMeta.bidId,
      periodId: draftMeta.periodId,
      periodCode: draftMeta.periodCode,
      draftVersion,
    };
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
          tiers: [
            { key: "t1", label: "T1", active: true },
            { key: "t2", label: "T2", active: true },
            { key: "t3", label: "T3", active: false },
            { key: "t4", label: "T4", active: false },
            { key: "t5", label: "T5", active: false },
            { key: "t6", label: "T6", active: false },
            { key: "t7", label: "T7", active: false },
          ],
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
  vi.spyOn(pairingService, "searchPairingOccurrencesByDate").mockResolvedValue({
    originDate: "2026-04-04",
    rosterPeriodId: 42,
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
      {
        occurrenceId: "414601:2026-04-04",
        pairingNumber: "V4146",
        pairingId: "414601",
        originDate: "2026-04-04",
        startDate: "2026-04-04",
        endDate: "2026-04-05",
        label: "V4146 · 2026-04-04",
      },
    ],
  });
  vi.spyOn(pairingService, "previewCriteria").mockResolvedValue(buildCalendarPairingDetailPreviewResponse());
  vi.spyOn(pairingService, "getPairingDetails").mockResolvedValue({
    results: buildCalendarPairingDetailPreviewResponse().results,
  });
  vi.spyOn(pairingService, "addCurrentDraftProperty").mockResolvedValue({
    saved: true,
    draftKey: "pairing-draft-1",
    periodCode: "Apr 2026",
    draftVersion: 1,
    propertyGroupKey: "pairing-property-key-new",
    rowSeq: 1,
  });
  vi.spyOn(pairingService, "patchCurrentDraftProperty").mockImplementation(async (propertyGroupKey, property) => ({
    saved: true,
    draftKey: "pairing-draft-1",
    periodCode: "Apr 2026",
    draftVersion: 1,
    propertyGroupKey,
    deleted: property.tiers.every((tier) => !tier.active),
    tiers: property.tiers.filter((tier) => tier.active).map((tier) => tier.label),
  }));
};

export const cleanupSharedWorkbenchTest = () => {
  cleanup();
  window.localStorage.removeItem(BIDDING_CALENDAR_COLLAPSED_STORAGE_KEY);
  window.sessionStorage.removeItem("pbs.bid.calendar-date-mode");
  vi.useRealTimers();
  setViewportSize(1024);
  useBiddingCalendarStore.getState().resetActiveTierLabel();
  usePairingPoolCountsRefreshStore.getState().resetPairingPoolCountsRefresh();
  queryClient.clear();
  vi.restoreAllMocks();
};
