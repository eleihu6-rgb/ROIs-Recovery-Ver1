vi.mock("@/shared/services/request", () => ({
  request: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import { pbsPairingBidRoutes } from "../../../../packages/contracts/pbs-pairing-bids.js";
import { pbsSearchPairingRoutes } from "../../../../packages/contracts/pbs-search-pairings.js";
import type { PairingAvailableProperty, PairingExistingProperty, PairingRightPanelData } from "@/features/pairing/types";
import { pairingService } from "@/shared/services/pairing-service";
import { request } from "@/shared/services/request";

const draftMeta: PairingRightPanelData["draftMeta"] = {
  draftKey: "2",
  bidId: 2,
  periodId: 9,
  draftVersion: 1042,
  periodCode: "Apr 2026",
  bidContext: "Current",
  remarks: "unchanged",
};
const searchPeriod = { rosterPeriodId: 9, periodCode: "Jun 2026" } as const;
const aprilSearchPeriod = { rosterPeriodId: 8, periodCode: "Apr 2026" } as const;

const pairingProperty: PairingAvailableProperty = {
  id: "available-134",
  propertyCode: 134,
  name: "Report Between",
  source: "catalog",
  favorited: false,
  action: "award",
  quantifier: null,
  bid: {
    type: "time-range",
    from: "09:00",
    to: "18:30",
  },
  tiers: [
    { key: "t1", label: "T1", active: false },
    { key: "t2", label: "T2", active: true },
  ],
  actions: ["add", "preview"],
  pairingNumber: "D00324",
  pairingType: "Regular",
  effectiveDateRange: {
    from: "2026-04-01",
    to: "2026-04-30",
  },
};

const existingPairingProperty: PairingExistingProperty = {
  ...pairingProperty,
  id: "existing-report-between",
  priorityOptions: [],
};

describe("pairingService", () => {
  beforeEach(() => {
    vi.mocked(request.post).mockResolvedValue({
      saved: true,
      favoriteKey: "9003",
      propertyId: 134,
      propertyCode: 134,
      name: "Report Between",
      action: "award",
      quantifier: null,
      bid: {
        type: "time-range",
        from: "09:00",
        to: "18:30",
      },
    });
    vi.mocked(request.delete).mockResolvedValue({ saved: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("saves a configured Pairing favorite with the lightweight current bid snapshot", async () => {
    await pairingService.saveConfiguredFavoriteProperty(pairingProperty, draftMeta);

    expect(request.post).toHaveBeenCalledWith(
      pbsPairingBidRoutes.currentFavorites,
      {
        draftKey: "2",
        bidId: 2,
        periodCode: "Apr 2026",
        draftVersion: 1042,
        property: {
          propertyCode: 134,
          name: "Report Between",
          action: "award",
          quantifier: null,
          bid: {
            type: "time-range",
            from: "09:00",
            to: "18:30",
          },
        },
      },
    );
  });

  it("removes a configured Pairing favorite by favorite key and current bid identity", async () => {
    await pairingService.unfavoriteProperty("9003", draftMeta);

    expect(request.delete).toHaveBeenCalledWith(
      pbsPairingBidRoutes.favoriteByKey("9003"),
      {
        params: {
          draftKey: "2",
          bidId: 2,
          periodCode: "Apr 2026",
          draftVersion: 1042,
        },
      },
    );
  });

  it("patches a configured Pairing favorite by favorite key", async () => {
    await pairingService.patchFavoriteProperty("9003", pairingProperty, draftMeta);

    expect(request.patch).toHaveBeenCalledWith(
      pbsPairingBidRoutes.favoriteByKey("9003"),
      {
        draftKey: "2",
        bidId: 2,
        periodCode: "Apr 2026",
        draftVersion: 1042,
        property: {
          propertyCode: 134,
          name: "Report Between",
          action: "award",
          quantifier: null,
          bid: {
            type: "time-range",
            from: "09:00",
            to: "18:30",
          },
        },
      },
    );
  });

  it("searches crew ids for pairing employee-number controls", async () => {
    vi.mocked(request.get).mockResolvedValue({
      query: "PET",
      limit: 20,
      options: [],
    });

    await pairingService.searchCrewIds("pet", 20);

    expect(request.get).toHaveBeenCalledWith(
      pbsSearchPairingRoutes.crewIds,
      {
        params: {
          query: "pet",
          limit: 20,
        },
      },
    );
  });

  it("counts current pairing rules for one tier using the lightweight counts route", async () => {
    vi.mocked(request.post).mockResolvedValue({
      mode: "current_rules_counts",
      periodCode: "Apr 2026",
      tier: "T2",
      computedAt: "2026-06-11T00:00:00.000Z",
      summary: {
        activePropertyCount: 1,
        allRules: {
          pairingIdCount: 12,
          totalItems: 18,
        },
      },
      rows: [],
    });

    await pairingService.countCurrentRules("T2", [existingPairingProperty], aprilSearchPeriod);

    expect(request.post).toHaveBeenCalledWith(
      pbsSearchPairingRoutes.currentRulesCounts,
      {
        periodCode: "Apr 2026",
        rosterPeriodId: 8,
        tier: "T2",
        properties: [
          {
            propertyGroupKey: "existing-report-between",
            rowSeq: 1,
            propertyCode: 134,
            name: "Report Between",
            action: "award",
            quantifier: null,
            bid: {
              type: "time-range",
              from: "09:00",
              to: "18:30",
            },
            tiers: ["T2"],
          },
        ],
      },
    );
  });

  it("counts AA-style current pairing tier pools using all existing properties", async () => {
    vi.mocked(request.post).mockResolvedValue({
      mode: "current_rules_tier_pools",
      periodCode: "Apr 2026",
      computedAt: "2026-06-22T00:00:00.000Z",
      packageTotal: {
        pairingIdCount: 100,
        totalItems: 120,
      },
      rows: [],
    });

    await pairingService.countCurrentRuleTierPools(["T1", "T2"], [existingPairingProperty], aprilSearchPeriod);

    expect(request.post).toHaveBeenCalledWith(
      pbsSearchPairingRoutes.currentRulesTierPools,
      {
        periodCode: "Apr 2026",
        rosterPeriodId: 8,
        tiers: ["T1", "T2"],
        properties: [
          {
            propertyGroupKey: "existing-report-between",
            rowSeq: 1,
            propertyCode: 134,
            name: "Report Between",
            action: "award",
            quantifier: null,
            bid: {
              type: "time-range",
              from: "09:00",
              to: "18:30",
            },
            tiers: ["T2"],
          },
        ],
      },
    );
  });

  it("searches flight numbers for pairing flight-number controls", async () => {
    vi.mocked(request.get).mockResolvedValue({
      query: "19",
      limit: 20,
      options: [],
    });

    await pairingService.searchFlightNumbers("19", 20, "recovery-charter-network");

    expect(request.get).toHaveBeenCalledWith(
      pbsSearchPairingRoutes.flightNumbers,
      {
        params: {
          query: "19",
          limit: 20,
          type: "recovery-charter-network",
        },
      },
    );
  });

  it("preserves the FLY-only scope in all-pairings preview requests", async () => {
    await pairingService.previewAllPairings(2, 30, searchPeriod, {
      pairingScope: "fly",
      query: " cram ",
    });

    expect(request.post).toHaveBeenCalledWith(
      pbsSearchPairingRoutes.preview,
      {
        periodCode: "Jun 2026",
        rosterPeriodId: 9,
        preview: {
          mode: "all_pairings",
          page: 2,
          pageSize: 30,
          filters: {
            pairingScope: "fly",
            query: "CRAM",
          },
        },
      },
    );
  });

  it("loads a cursor page of Pairing Number result filter options", async () => {
    vi.mocked(request.get).mockResolvedValue({
      query: "",
      rosterPeriodId: 9,
      periodCode: "Jun 2026",
      limit: 30,
      options: [{ value: "M4959", label: "M4959" }],
      nextCursor: "next-page",
      totalCount: 40,
    });
    const controller = new AbortController();

    await pairingService.getPairingNumberFilterOptions(
      searchPeriod,
      "",
      "cursor-1",
      30,
      controller.signal,
    );

    expect(request.get).toHaveBeenCalledWith(
      pbsSearchPairingRoutes.pairingNumberFilterOptions,
      {
        params: {
          periodCode: "Jun 2026",
          rosterPeriodId: 9,
          query: "",
          limit: 30,
          cursor: "cursor-1",
        },
        signal: controller.signal,
      },
    );
  });

  it("normalizes multi-select result filters before previewing all pairings", async () => {
    await pairingService.previewAllPairings(1, 30, searchPeriod, {
      pairingNumbers: [" m4959 ", "M4959", " m4960 "],
      airports: [" yvr ", "YYZ", ""],
      layoverAirports: [" yyc ", "YYC", " yhz "],
    });

    expect(request.post).toHaveBeenCalledWith(
      pbsSearchPairingRoutes.preview,
      {
        periodCode: "Jun 2026",
        rosterPeriodId: 9,
        preview: {
          mode: "all_pairings",
          page: 1,
          pageSize: 30,
          filters: {
            pairingNumbers: ["M4959", "M4960"],
            airports: ["YVR", "YYZ"],
            layoverAirports: ["YYC", "YHZ"],
          },
        },
      },
    );
  });

  it("previews one pairing row through the single-property request contract", async () => {
    await pairingService.previewSingleProperty(
      {
        propertyCode: 103,
        name: "Pairing Check-In / Check-Out Time",
        action: "avoid",
        quantifier: null,
        bid: {
          type: "pairing-check-time",
          timeType: "check_in",
          operator: "Between",
          from: "03:00",
          to: "11:00",
          dateScope: { mode: "date_range", from: "2026-06-08", to: "2026-06-11" },
        },
      },
      2,
      30,
      searchPeriod,
    );

    expect(request.post).toHaveBeenCalledWith(
      pbsSearchPairingRoutes.preview,
      {
        periodCode: "Jun 2026",
        rosterPeriodId: 9,
        preview: {
          property: {
            propertyCode: 103,
            name: "Pairing Check-In / Check-Out Time",
            action: "avoid",
            quantifier: null,
            bid: {
              type: "pairing-check-time",
              timeType: "check_in",
              operator: "Between",
              from: "03:00",
              to: "11:00",
              dateScope: { mode: "date_range", from: "2026-06-08", to: "2026-06-11" },
            },
          },
          page: 2,
          pageSize: 30,
        },
      },
    );
  });

  it("does not add a pairing scope to independent all-pairings requests", async () => {
    await pairingService.previewAllPairings(1, 30, searchPeriod);

    expect(request.post).toHaveBeenCalledWith(
      pbsSearchPairingRoutes.preview,
      {
        periodCode: "Jun 2026",
        rosterPeriodId: 9,
        preview: {
          mode: "all_pairings",
          page: 1,
          pageSize: 30,
        },
      },
    );
  });
});
