vi.mock("@/shared/services/request", () => ({
  request: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import { pbsLineBidRoutes } from "../../../../packages/contracts/pbs-line-bids.js";
import type { RuleBidAvailableProperty, RuleBidRightPanelData } from "@/features/rule-bids/types";
import { lineService } from "@/shared/services/line-service";
import { request } from "@/shared/services/request";

const draftMeta: RuleBidRightPanelData["draftMeta"] = {
  draftKey: "87",
  bidId: 87,
  periodId: 9,
  draftVersion: 6,
  periodCode: "Jun 2026",
  bidContext: "Current",
  remarks: "",
};

const reserveProperty: RuleBidAvailableProperty = {
  id: "available-427",
  propertyCode: 427,
  name: "Mixed Line Bid",
  source: "catalog",
  favorited: false,
  action: "award",
  bid: { type: "flag" },
  tiers: [
    { key: "t1", label: "T1", active: true },
    { key: "t2", label: "T2", active: false },
  ],
};

describe("lineService", () => {
  beforeEach(() => {
    vi.mocked(request.get).mockResolvedValue({
      available: false,
    });
    vi.mocked(request.post).mockResolvedValue({
      saved: true,
      draftKey: "87",
      bidId: 87,
      periodId: 9,
      periodCode: "Jun 2026",
      draftVersion: 7,
      propertyGroupKey: "line-property-427",
      rowSeq: 1,
      favoriteKey: "line-configured-427",
      propertyId: 427,
      propertyCode: 427,
      name: "Reserve",
      action: "award",
      bid: { type: "flag" },
      tiers: ["T1"],
    });
    vi.mocked(request.patch).mockResolvedValue({
      saved: true,
      draftKey: "87",
      bidId: 87,
      periodId: 9,
      periodCode: "Jun 2026",
      draftVersion: 7,
      favoriteKey: "line-configured-427",
      propertyId: 427,
      propertyCode: 427,
      name: "Reserve",
      action: "award",
      bid: { type: "flag" },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("loads Line credit window configuration from the contract route", async () => {
    await lineService.getCreditWindowConfig();

    expect(request.get).toHaveBeenCalledWith(pbsLineBidRoutes.creditWindowConfig);
  });

  it("loads Line minimum base layover configuration from the contract route", async () => {
    await lineService.getMinimumBaseLayoverConfig();

    expect(request.get).toHaveBeenCalledWith(pbsLineBidRoutes.minimumBaseLayoverConfig);
  });

  it("posts Mixed Line Bid as the canonical Line Reserve payload", async () => {
    await lineService.addCurrentDraftProperty(reserveProperty, draftMeta);

    expect(request.post).toHaveBeenCalledWith(
      pbsLineBidRoutes.currentProperties,
      {
        draftKey: "87",
        bidId: 87,
        periodCode: "Jun 2026",
        bidContext: "Current",
        draftVersion: 6,
        remarks: "",
        property: {
          propertyCode: 427,
          name: "Reserve",
          action: "award",
          bid: { type: "flag" },
          tiers: ["T1"],
        },
      },
    );
  });

  it("posts Line Reserve action and flag in the configured favorite payload", async () => {
    const response = await lineService.saveConfiguredFavoriteProperty(reserveProperty, draftMeta);

    expect(request.post).toHaveBeenCalledWith(
      pbsLineBidRoutes.currentFavorites,
      {
        draftKey: "87",
        bidId: 87,
        periodCode: "Jun 2026",
        bidContext: "Current",
        draftVersion: 6,
        property: {
          propertyCode: 427,
          name: "Reserve",
          action: "award",
          bid: { type: "flag" },
        },
      },
    );
    expect(response.action).toBe("award");
    expect(response.name).toBe("Mixed Line Bid");
  });

  it("patches a configured Line favorite without Tx fields", async () => {
    const response = await lineService.patchFavoriteProperty("line-configured-427", reserveProperty, draftMeta);

    expect(request.patch).toHaveBeenCalledWith(
      pbsLineBidRoutes.favoriteByKey("line-configured-427"),
      {
        draftKey: "87",
        bidId: 87,
        periodCode: "Jun 2026",
        bidContext: "Current",
        draftVersion: 6,
        property: {
          propertyCode: 427,
          name: "Reserve",
          action: "award",
          bid: { type: "flag" },
        },
      },
    );
    expect(response.name).toBe("Mixed Line Bid");
  });
});
