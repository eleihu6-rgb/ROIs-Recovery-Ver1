vi.mock("@/shared/services/request", () => ({
  request: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import { pbsReserveBidRoutes } from "../../../../packages/contracts/pbs-reserve-bids.js";
import type { RuleBidAvailableProperty, RuleBidRightPanelData } from "@/features/rule-bids/types";
import { reserveService } from "@/shared/services/reserve-service";
import { request } from "@/shared/services/request";

const draftMeta: RuleBidRightPanelData["draftMeta"] = {
  draftKey: "42",
  bidId: 42,
  periodId: 9,
  draftVersion: 3,
  periodCode: "May 2026",
  bidContext: "Current",
  remarks: "keep",
};

const reservePreferenceProperty: RuleBidAvailableProperty = {
  id: "reserve-preference-PRAM",
  propertyCode: 301,
  name: "Reserve Preference",
  favorited: false,
  bid: {
    type: "reserve-call-type-date-scope",
    callType: "PRAM",
    options: ["CRAM", "CRPM", "PRAM"],
    dateScope: { mode: "specific_dates", dates: ["2026-05-01", "2026-05-03"] },
  },
  tiers: [
    { key: "t1", label: "T1", active: true },
    { key: "t2", label: "T2", active: false },
  ],
};

describe("reserveService", () => {
  beforeEach(() => {
    vi.mocked(request.post).mockResolvedValue({
      saved: true,
      draftKey: "42",
      bidId: 42,
      periodId: 9,
      periodCode: "May 2026",
      draftVersion: 4,
      propertyGroupKey: "reserve-property-301",
      rowSeq: 1,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("posts Reserve Preference date-scope bids through the reserve mutation mapper", async () => {
    await reserveService.addCurrentDraftProperty(reservePreferenceProperty, draftMeta);

    expect(request.post).toHaveBeenCalledWith(
      pbsReserveBidRoutes.currentProperties,
      {
        draftKey: "42",
        bidId: 42,
        periodCode: "May 2026",
        bidContext: "Current",
        draftVersion: 3,
        remarks: "keep",
        property: {
          propertyCode: 301,
          name: "Reserve Preference",
          bid: {
            type: "reserve-call-type-date-scope",
            callType: "PRAM",
            options: ["CRAM", "CRPM", "PRAM"],
            dateScope: { mode: "specific_dates", dates: ["2026-05-01", "2026-05-03"] },
          },
          tiers: ["T1"],
        },
      },
    );
  });
});
