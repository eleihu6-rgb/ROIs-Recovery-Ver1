import type { PbsLineCurrentDraftResponse } from "../../../../packages/contracts/pbs-line-bids.js";
import {
  mapExistingPropertiesToLineDraftDocument,
  mapLineDraftResponseToPageData,
} from "@/features/line/line-draft-mappers";

const buildLineResponse = (): PbsLineCurrentDraftResponse => ({
  draft: {
    draftKey: "current:F8030:Apr 2026",
    bidId: 9001,
    periodId: 202604,
    draftVersion: 3,
    periodCode: "Apr 2026",
    bidContext: "Current",
    remarks: "",
    properties: [
      {
        propertyGroupKey: "line-property-406",
        rowSeq: 1,
        propertyCode: 406,
        name: "Forget Line",
        bid: { type: "stepper", value: 12, min: 1, max: 999 },
        tiers: ["T1", "T3"],
      },
      {
        propertyGroupKey: "line-property-407",
        rowSeq: 2,
        propertyCode: 407,
        name: "Minimum Base Layover",
        bid: { type: "minimum-base-layover", minimumDuration: "013:00" },
        tiers: ["T2"],
      },
    ],
  },
  propertyCatalog: [
    {
      propertyCode: 429,
      name: "Credit Window Preference",
      defaultBid: {
        type: "credit-window-preference",
        direction: "more",
      },
    },
    { propertyCode: 403, name: "Clear Schedule and Start Next Bid Group", defaultBid: { type: "flag" } },
    { propertyCode: 404, name: "No Same Day Pairings", defaultBid: { type: "flag" } },
    { propertyCode: 405, name: "Waive No Same Day Duty Starts", defaultBid: { type: "flag" } },
    { propertyCode: 406, name: "Forget Line", defaultBid: { type: "stepper", value: 1, min: 1, max: 999 } },
    { propertyCode: 407, name: "Minimum Base Layover", defaultBid: { type: "minimum-base-layover", minimumDuration: "" } },
    {
      propertyCode: 408,
      name: "Commuter Pattern",
      defaultBid: { type: "days-off-on-pattern", minDaysOff: 4, minDaysOn: 4, maxDaysOn: 5, min: 1, max: 14 },
    },
    {
      propertyCode: 428,
      name: "Efficient Flying First",
      defaultAction: "award",
      supportedActions: ["award", "avoid"],
      defaultBid: { type: "flag" },
    },
  ],
  favoriteProperties: [
    {
      favoriteKey: "favorite-403",
      propertyId: 403,
      propertyCode: 403,
      name: "Clear Schedule and Start Next Bid Group",
      bid: { type: "flag" },
    },
  ],
  recommendedPropertyCodes: [429, 404, 405],
});

describe("line draft mappers", () => {
  it("maps the visible Line catalog without injecting hidden legacy or AA extensions", () => {
    const pageData = mapLineDraftResponseToPageData(buildLineResponse());
    const catalogProperties = pageData.rightPanel.availableProperties.filter((property) => property.source === "catalog");
    const availableCodes = catalogProperties.map((property) => property.propertyCode);
    const availableNames = catalogProperties.map((property) => property.name);

    expect(availableCodes).toEqual([429, 403, 404, 405, 406, 407, 408]);
    expect(availableNames).toContain("Credit Window Preference");
    expect(availableNames).toContain("Clear Schedule and Start Next Bid Group");
    expect(availableNames).toContain("No Same Day Pairings");
    expect(availableNames).toContain("Commuter Pattern");
    expect(availableNames).not.toContain("Efficient Flying First");
    expect(availableNames).not.toContain("Target Credit Range");
  });

  it("maps Line favorite state from the service response", () => {
    const pageData = mapLineDraftResponseToPageData(buildLineResponse());
    const clearSchedule = pageData.rightPanel.availableProperties.find((property) => property.propertyCode === 403);
    const creditWindow = pageData.rightPanel.availableProperties.find((property) => property.propertyCode === 429);
    const forgetLine = pageData.rightPanel.availableProperties.find((property) => property.propertyCode === 406);
    const favoriteClearSchedule = pageData.rightPanel.availableProperties.find((property) =>
      property.source === "favorite" && property.propertyCode === 403);

    expect(clearSchedule).toMatchObject({
      source: "catalog",
      favorited: false,
    });
    expect(favoriteClearSchedule).toMatchObject({
      favoriteKey: "favorite-403",
      propertyId: 403,
      favorited: true,
    });
    expect(creditWindow).toMatchObject({
      favorited: false,
      recommendedSortOrder: 1,
    });
    expect(forgetLine?.favorited).toBe(false);
  });

  it("uses stable property group keys for existing Line properties", () => {
    const pageData = mapLineDraftResponseToPageData(buildLineResponse());

    expect(pageData.rightPanel.existingProperties[0]?.id).toBe("line-property-406");
    expect(pageData.rightPanel.existingProperties[1]?.id).toBe("line-property-407");
  });

  it("displays Reserve 427 as Mixed Line Bid while preserving the saved name", () => {
    const response = buildLineResponse();
    response.draft.properties.push({
      propertyGroupKey: "line-property-427",
      rowSeq: 3,
      propertyCode: 427,
      name: "Reserve",
      action: "avoid",
      bid: { type: "flag" },
      tiers: ["T1"],
    });
    response.propertyCatalog.push({
      propertyCode: 427,
      name: "Reserve",
      defaultAction: "award",
      supportedActions: ["award", "avoid"],
      defaultBid: { type: "flag" },
    });
    response.favoriteProperties.push({
      favoriteKey: "favorite-427",
      propertyId: 427,
      propertyCode: 427,
      name: "Reserve",
      action: "award",
      bid: { type: "flag" },
    });

    const pageData = mapLineDraftResponseToPageData(response);
    const available427 = pageData.rightPanel.availableProperties.filter((property) =>
      property.propertyCode === 427);
    const existing427 = pageData.rightPanel.existingProperties.find((property) =>
      property.propertyCode === 427);
    const draft = mapExistingPropertiesToLineDraftDocument(
      pageData.rightPanel.existingProperties,
      pageData.rightPanel.draftMeta,
    );

    expect(available427.map((property) => property.name)).toEqual([
      "Mixed Line Bid",
      "Mixed Line Bid",
    ]);
    expect(existing427).toMatchObject({
      name: "Mixed Line Bid",
      action: "avoid",
    });
    expect(draft.properties.find((property) => property.propertyCode === 427)).toMatchObject({
      name: "Reserve",
      action: "avoid",
      bid: { type: "flag" },
      tiers: ["T1"],
    });
  });

  it("merges split Line properties when only tiers differ", () => {
    const response = buildLineResponse();
    response.draft.properties = [
      {
        propertyGroupKey: "line-property-402-t2",
        rowSeq: 1,
        propertyCode: 402,
        name: "Min Credit Window",
        bid: { type: "flag" },
        tiers: ["T2"],
      },
      {
        propertyGroupKey: "line-property-402-t1",
        rowSeq: 2,
        propertyCode: 402,
        name: "Min Credit Window",
        bid: { type: "flag" },
        tiers: ["T1"],
      },
    ];

    const pageData = mapLineDraftResponseToPageData(response);

    expect(pageData.rightPanel.existingProperties).toHaveLength(1);
    expect(pageData.rightPanel.existingProperties[0]).toMatchObject({
      id: "line-property-402-t2",
      propertyCode: 402,
    });
    expect(pageData.rightPanel.existingProperties[0]?.tiers.filter((tier) => tier.active).map((tier) => tier.label)).toEqual([
      "T1",
      "T2",
    ]);
  });

  it("maps saved Forget Line and Minimum Base Layover values back into a draft document", () => {
    const pageData = mapLineDraftResponseToPageData(buildLineResponse());
    const draft = mapExistingPropertiesToLineDraftDocument(
      pageData.rightPanel.existingProperties,
      pageData.rightPanel.draftMeta,
    );

    expect(draft.properties).toMatchObject([
      {
        rowSeq: 1,
        propertyCode: 406,
        name: "Forget Line",
        bid: { type: "stepper", value: 12, min: 1, max: 999 },
        tiers: ["T1", "T3"],
      },
      {
        rowSeq: 2,
        propertyCode: 407,
        name: "Minimum Base Layover",
        bid: { type: "minimum-base-layover", minimumDuration: "013:00" },
        tiers: ["T2"],
      },
    ]);
  });
});
