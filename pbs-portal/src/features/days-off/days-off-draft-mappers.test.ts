import { mapDaysOffDraftResponseToPageData } from "@/features/days-off/days-off-draft-mappers";
import { daysOffPageData } from "@/features/days-off/mock";

describe("mapDaysOffDraftResponseToPageData", () => {
  it("keeps catalog rows in All and maps configured favorites as reusable favorite rows", () => {
    const data = mapDaysOffDraftResponseToPageData({
      preferOffConfig: structuredClone(daysOffPageData.preferOffConfig),
      draft: {
        draftKey: "2",
        bidId: 2,
        periodId: 10,
        draftVersion: 7,
        periodCode: "Apr 2026",
        bidContext: "Current",
        remarks: "",
        properties: [
          {
            propertyGroupKey: "existing-201",
            rowSeq: 1,
            propertyCode: 201,
            name: "Prefer Off",
            bid: { type: "tag-list", values: ["Between 2026-04-10 - 2026-04-12"], suggestions: [] },
            tiers: ["T1"],
            allOrNothing: true,
            minimumN: 2,
          },
        ],
      },
      propertyCatalog: [
        {
          propertyCode: 201,
          name: "Prefer Off",
          defaultBid: { type: "tag-list", values: [], suggestions: [] },
        },
        {
          propertyCode: 203,
          name: "Min Consecutive Days Off",
          defaultBid: { type: "stepper", value: 2, min: 1, max: 14 },
        },
      ],
      favoriteProperties: [
        {
          favoriteKey: "favorite-201",
          propertyId: 900201,
          propertyCode: 201,
          name: "Prefer Off",
          bid: { type: "tag-list", values: ["2026-04-10"], suggestions: [] },
          allOrNothing: true,
          minimumN: 1,
        },
        {
          favoriteKey: "favorite-203",
          propertyId: 900203,
          propertyCode: 203,
          name: "Min Consecutive Days Off",
          bid: { type: "stepper", value: 2, min: 1, max: 14 },
          allOrNothing: false,
          minimumN: null,
        },
      ],
      recommendedPropertyCodes: [201, 203],
    });

    expect(data.rightPanel.showModifiers).toBe(false);
    expect(data.rightPanel.existingProperties[0]).toMatchObject({
      id: "existing-201",
      name: "Prefer Off",
      allOrNothing: true,
      minimumN: 2,
    });
    expect(data.preferOffConfig?.weekend.startDayCode).toBe("SAT");
    expect(data.rightPanel.availableProperties).toHaveLength(4);
    expect(data.rightPanel.availableProperties[0]).toMatchObject({
      id: "available-201",
      source: "catalog",
      name: "Prefer Off",
      favorited: false,
      recommendedSortOrder: 1,
      bid: { type: "tag-list", values: [], suggestions: [] },
    });
    expect(data.rightPanel.availableProperties[1]).toMatchObject({
      id: "available-203",
      source: "catalog",
      name: "Min Consecutive Days Off",
      propertyCode: 203,
      recommendedSortOrder: 2,
    });
    expect(data.rightPanel.availableProperties[2]).toMatchObject({
      id: "favorite-favorite-201",
      source: "favorite",
      name: "Prefer Off",
      favorited: true,
      favoriteKey: "favorite-201",
      bid: { type: "tag-list", values: ["2026-04-10"], suggestions: [] },
      allOrNothing: true,
      minimumN: 1,
    });
    expect(data.rightPanel.availableProperties[2]?.tiers.filter((tier) => tier.active).map((tier) => tier.label)).toEqual([]);
    expect(data.rightPanel.availableProperties[3]).toMatchObject({
      id: "favorite-favorite-203",
      source: "favorite",
      name: "Min Consecutive Days Off",
      propertyCode: 203,
      favoriteKey: "favorite-203",
    });
  });
});
