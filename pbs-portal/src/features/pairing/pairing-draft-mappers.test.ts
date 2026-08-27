import type { PbsPairingCurrentDraftResponse } from "../../../../packages/contracts/pbs-pairing-bids.js";
import { mapPairingDraftResponseToPageData } from "@/features/pairing/pairing-draft-mappers";
import { filterPairingAvailableProperties } from "@/features/pairing/pairing-property-list";

const buildPairingResponse = (): PbsPairingCurrentDraftResponse => ({
  draft: {
    draftKey: "current:F8030:Apr 2026",
    bidId: 9001,
    periodId: 202604,
    draftVersion: 1,
    periodCode: "Apr 2026",
    bidContext: "Current",
    remarks: "",
    properties: [],
  },
  propertyCatalog: [
    {
      propertyCode: 168,
      name: "Airport Preference",
      defaultBid: { type: "airport-preference", event: "layover", locations: [], dateScope: null, minimumLayoverDuration: null },
      supportedActions: ["award", "avoid"],
    },
    {
      propertyCode: 102,
      name: "Pairing Number",
      defaultBid: { type: "pairing-id-list", pairingIds: [] },
      supportedActions: ["award", "avoid"],
    },
    {
      propertyCode: 105,
      name: "Pairing Total Credit",
      defaultBid: { type: "duration", value: "08:00" },
      supportedActions: ["award", "avoid"],
    },
  ],
  favoriteProperties: [],
  recommendedPropertyCodes: [102, 168],
});

describe("mapPairingDraftResponseToPageData", () => {
  it("orders backend recommended catalog properties first in the all tab without creating favorites", () => {
    const pageData = mapPairingDraftResponseToPageData(buildPairingResponse());
    const allProperties = filterPairingAvailableProperties(
      pageData.rightPanel.availableProperties,
      "all",
      "",
      {
        pairingNumber: "",
        pairingType: "All Types",
        dateFrom: "",
        dateTo: "",
      },
    );
    const favoriteProperties = filterPairingAvailableProperties(
      pageData.rightPanel.availableProperties,
      "favorited",
      "",
      {
        pairingNumber: "",
        pairingType: "All Types",
        dateFrom: "",
        dateTo: "",
      },
    );

    expect(allProperties.map((property) => property.propertyCode)).toEqual([102, 168, 105]);
    expect(allProperties[0]).toMatchObject({
      id: "available-102",
      source: "catalog",
      favorited: false,
      recommendedSortOrder: 1,
    });
    expect(favoriteProperties).toEqual([]);
    expect(pageData.rightPanel.availableProperties.find((property) => property.propertyCode === 105)).toMatchObject({
      favorited: false,
    });
  });

  it("builds existing priority options from backend visible catalog", () => {
    const response = buildPairingResponse();

    response.draft.properties = [
      {
        propertyGroupKey: "airport-preference-1",
        rowSeq: 1,
        propertyCode: 168,
        name: "Airport Preference",
        action: "award",
        quantifier: null,
        bid: { type: "airport-preference", event: "layover", locations: [{ code: "YYZ", kind: "airport" }], dateScope: null, minimumLayoverDuration: null },
        tiers: ["T1"],
      },
    ];

    const pageData = mapPairingDraftResponseToPageData(response);

    expect(pageData.rightPanel.existingProperties[0]?.priorityOptions).toEqual([
      "Airport Preference",
      "Pairing Number",
      "Pairing Total Credit",
    ]);
  });
});
