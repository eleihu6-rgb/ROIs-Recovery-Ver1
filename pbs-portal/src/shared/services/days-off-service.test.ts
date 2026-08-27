vi.mock("@/shared/services/request", () => ({
  request: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import { pbsDaysOffBidRoutes } from "../../../../packages/contracts/pbs-days-off-bids.js";
import type { RuleBidAvailableProperty, RuleBidExistingProperty, RuleBidRightPanelData } from "@/features/rule-bids/types";
import { daysOffService } from "@/shared/services/days-off-service";
import { request } from "@/shared/services/request";

const draftMeta: RuleBidRightPanelData["draftMeta"] = {
  draftKey: "2",
  bidId: 2,
  periodId: 9,
  draftVersion: 1027,
  periodCode: "Apr 2026",
  bidContext: "Current",
  remarks: "unchanged",
};

describe("daysOffService", () => {
  beforeEach(() => {
    vi.mocked(request.post).mockResolvedValue({
      saved: true,
      propertyGroupKey: "property-key",
      rowSeq: 1,
      draftVersion: 1028,
    });
    vi.mocked(request.put).mockResolvedValue({
      saved: true,
      propertyGroupKey: "property-key",
      tiers: ["T2"],
      draftVersion: 1028,
    });
    vi.mocked(request.patch).mockResolvedValue({
      saved: true,
      favoriteKey: "favorite-201",
      propertyId: 201,
      propertyCode: 201,
      name: "Prefer Off",
      bid: { type: "tag-list", values: ["2026-04-19"] },
      draftVersion: 1028,
    });
    vi.mocked(request.delete).mockResolvedValue({
      saved: true,
      draftVersion: 1028,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("adds a Days Off property with the lightweight mutation payload", async () => {
    const property: RuleBidAvailableProperty = {
      id: "available-201",
      propertyCode: 201,
      name: "Prefer Off",
      favorited: false,
      bid: {
        type: "tag-list",
        values: ["2026-04-19", "2026-04-20"],
        suggestions: ["2026-04-21"],
      },
      tiers: [
        { key: "t1", label: "T1", active: false },
        { key: "t2", label: "T2", active: true },
      ],
      allOrNothing: false,
      minimumN: null,
    };

    await daysOffService.addCurrentDraftProperty(property, draftMeta);

    expect(request.post).toHaveBeenCalledWith(
      pbsDaysOffBidRoutes.currentProperties,
      {
        draftKey: "2",
        bidId: 2,
        periodCode: "Apr 2026",
        draftVersion: 1027,
        propertyCode: 201,
        action: null,
        bid: {
          type: "tag-list",
          values: ["2026-04-19", "2026-04-20"],
        },
        tiers: ["T2"],
        allOrNothing: false,
        minimumN: null,
        maximumN: null,
      },
    );
  });

  it("updates a Days Off property with PUT and does not send UI-only fields", async () => {
    const property: RuleBidExistingProperty = {
      id: "property-key",
      propertyCode: 201,
      name: "Prefer Off",
      bid: {
        type: "tag-list",
        values: ["Between 2026-04-19 - 2026-04-22"],
        suggestions: ["2026-04-30"],
      },
      tiers: [
        { key: "t1", label: "T1", active: false },
        { key: "t2", label: "T2", active: true },
      ],
      allOrNothing: true,
      minimumN: 1,
    };

    await daysOffService.patchCurrentDraftProperty("property-key", property, draftMeta);

    expect(request.put).toHaveBeenCalledWith(
      pbsDaysOffBidRoutes.currentPropertyByKey("property-key"),
      {
        draftKey: "2",
        bidId: 2,
        periodCode: "Apr 2026",
        draftVersion: 1027,
        action: null,
        bid: {
          type: "tag-list",
          values: ["Between 2026-04-19 - 2026-04-22"],
        },
        tiers: ["T2"],
        allOrNothing: true,
        minimumN: 1,
        maximumN: null,
      },
    );
    expect(request.patch).not.toHaveBeenCalled();
  });

  it("deletes a Days Off property with stable draft identity query fields", async () => {
    await daysOffService.removeCurrentDraftProperty("property-key", draftMeta);

    expect(request.delete).toHaveBeenCalledWith(
      pbsDaysOffBidRoutes.currentPropertyByKey("property-key"),
      {
        params: {
          draftKey: "2",
          bidId: 2,
          periodCode: "Apr 2026",
          draftVersion: 1027,
        },
      },
    );
  });

  it("saves a configured Days Off favorite with the current bid snapshot", async () => {
    const property: RuleBidAvailableProperty = {
      id: "available-201",
      propertyCode: 201,
      name: "Prefer Off",
      favorited: false,
      bid: {
        type: "tag-list",
        values: ["2026-04-19", "Window 08:00-18:00"],
        suggestions: ["2026-04-20"],
      },
      tiers: [
        { key: "t1", label: "T1", active: true },
        { key: "t2", label: "T2", active: false },
      ],
      allOrNothing: true,
      minimumN: 1,
    };

    await daysOffService.favoriteProperty(property, draftMeta);

    expect(request.post).toHaveBeenLastCalledWith(
      pbsDaysOffBidRoutes.currentFavorites,
      {
        draftKey: "2",
        bidId: 2,
        periodCode: "Apr 2026",
        draftVersion: 1027,
        propertyCode: 201,
        action: null,
        bid: {
          type: "tag-list",
          values: ["2026-04-19", "Window 08:00-18:00"],
        },
        allOrNothing: true,
        minimumN: 1,
        maximumN: null,
      },
    );
  });

  it("removes a configured Days Off favorite by favorite key", async () => {
    await daysOffService.unfavoriteProperty("favorite-201", draftMeta);

    expect(request.delete).toHaveBeenCalledWith(
      pbsDaysOffBidRoutes.favoriteByKey("favorite-201"),
      {
        params: {
          draftKey: "2",
          bidId: 2,
          periodCode: "Apr 2026",
          draftVersion: 1027,
        },
      },
    );
  });

  it("patches a configured Days Off favorite without Tx fields", async () => {
    const property: RuleBidAvailableProperty = {
      id: "favorite-201",
      favoriteKey: "favorite-201",
      propertyCode: 201,
      name: "Prefer Off",
      source: "favorite",
      favorited: true,
      bid: { type: "tag-list", values: ["2026-04-19"] },
      tiers: [{ key: "t2", label: "T2", active: true }],
    };

    await daysOffService.patchFavoriteProperty("favorite-201", property, draftMeta);

    expect(request.patch).toHaveBeenCalledWith(
      pbsDaysOffBidRoutes.favoriteByKey("favorite-201"),
      expect.not.objectContaining({ tiers: expect.anything() }),
    );
  });
});
