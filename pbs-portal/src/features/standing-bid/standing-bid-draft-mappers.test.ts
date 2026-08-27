import type { PbsStandingCurrentResponse } from "../../../../packages/contracts/pbs-standing-bids.js";
import {
  mapExistingPropertiesToStandingDraftDocument,
  mapStandingBidResponseToPageData,
} from "@/features/standing-bid/standing-bid-draft-mappers";

const buildStandingResponse = (): PbsStandingCurrentResponse => ({
  currentPeriod: {
    id: null,
    periodCode: "Standing Bid",
    filiale: null,
    status: "OPEN",
    computedStage: "OPEN",
    bidOpenAt: null,
    bidCloseAt: null,
    canEditBid: true,
    readOnlyReason: null,
  },
  lineholderDraft: {
    draftKey: "100",
    bidId: 100,
    periodId: null,
    draftVersion: 2,
    periodCode: "STANDING",
    bidContext: "StandingLineholder",
    remarks: "",
    properties: [
      {
        propertyGroupKey: "standing-day-off",
        rowSeq: 1,
        bidType: "DaysOff",
        propertyCode: 218,
        name: "Day of Week Off",
        bid: { type: "select", value: "Sat", options: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] },
        tiers: ["T1", "T2"],
      },
      {
        propertyGroupKey: "standing-efficient-flying",
        rowSeq: 2,
        bidType: "Pairing",
        propertyCode: 428,
        name: "Efficient Flying First",
        action: "award",
        bid: { type: "efficient-flying-preference", mode: "efficient" },
        tiers: ["T3"],
      },
    ],
  },
  preferOffConfig: {
    weekdays: [
      { code: "MON", name: "Monday", order: 1, isoDay: 1 },
      { code: "TUE", name: "Tuesday", order: 2, isoDay: 2 },
      { code: "WED", name: "Wednesday", order: 3, isoDay: 3 },
      { code: "THU", name: "Thursday", order: 4, isoDay: 4 },
      { code: "FRI", name: "Friday", order: 5, isoDay: 5 },
      { code: "SAT", name: "Saturday", order: 6, isoDay: 6 },
      { code: "SUN", name: "Sunday", order: 7, isoDay: 7 },
    ],
    weekend: { available: false },
  },
  reserveDraft: {
    draftVersion: 0,
    periodId: null,
    periodCode: "STANDING",
    bidContext: "StandingReserve",
    remarks: "",
    properties: [],
  },
  propertyCatalog: {
    lineholder: [
      {
        bidType: "DaysOff",
        propertyCode: 201,
        name: "Prefer Off",
        defaultBid: { type: "date-or-dow-list", dates: [], daysOfWeek: ["SAT"] },
      },
      {
        bidType: "DaysOff",
        propertyCode: 218,
        name: "Day of Week Off",
        defaultBid: { type: "select", value: "Sat", options: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] },
      },
      {
        bidType: "Pairing",
        propertyCode: 168,
        name: "Airport Preference",
        defaultAction: "award",
        supportedActions: ["award", "avoid"],
        defaultBid: { type: "tag-list", values: [] },
      },
      {
        bidType: "Pairing",
        propertyCode: 428,
        name: "Efficient Flying First",
        defaultAction: "award",
        supportedActions: ["award", "avoid"],
        defaultBid: { type: "efficient-flying-preference", mode: "efficient" },
      },
      {
        bidType: "Line",
        propertyCode: 429,
        name: "Credit Window Preference",
        defaultBid: {
          type: "credit-window-preference",
          direction: "more",
        },
      },
      {
        bidType: "Line",
        propertyCode: 410,
        name: "Reserve / Flying Date Pattern",
        defaultBid: {
          type: "reserve-flying-date-pattern",
          segments: [{ workType: "reserve", callType: "PRAM", dateScope: { mode: "whole_month" } }],
          callTypeOptions: ["PRAM", "PRPM", "CRAM", "CRPM"],
          strength: "normal",
        },
      },
      {
        bidType: "Line",
        propertyCode: 407,
        name: "Minimum Base Layover",
        defaultBid: { type: "minimum-base-layover", minimumDuration: "013:00" },
      },
    ],
    reserve: [
      {
        bidType: "Reserve",
        propertyCode: 301,
        name: "Short Call Type",
        defaultBid: {
          type: "reserve-call-type-date-scope",
          callType: "PRAM",
          options: ["PRAM", "PRPM", "CRAM", "CRPM"],
          dateScope: { mode: "whole_month" },
        },
      },
      {
        bidType: "Reserve",
        propertyCode: 313,
        name: "Reserve Work Block Size",
        defaultBid: { type: "stepper-range", from: 3, to: 5, min: 3, max: 6 },
      },
      {
        bidType: "Reserve",
        propertyCode: 314,
        name: "Waive to Allow Carry over to be Days Off",
        defaultBid: { type: "flag" },
      },
    ],
  },
});

describe("standing bid draft mappers", () => {
  it("maps both Standing contexts into one page while retaining independent draft metadata", () => {
    const pageData = mapStandingBidResponseToPageData(buildStandingResponse());

    expect(pageData.contexts.lineholder.draftMeta).toMatchObject({
      bidContext: "StandingLineholder",
      periodCode: "STANDING",
      draftVersion: 2,
      currentPeriod: {
        canEditBid: true,
      },
    });
    expect(pageData.contexts.reserve.draftMeta).toMatchObject({
      bidContext: "StandingReserve",
      periodCode: "STANDING",
      draftVersion: 0,
    });
    expect(pageData.rightPanel.existingTitle).toBe("EXISTING STANDING BID");
    expect(pageData.rightPanel.addSectionTitle).toBe("ADD STANDING BID");
    expect(pageData.rightPanel.existingProperties).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "standing-day-off",
        sourceContext: "lineholder",
        propertyCode: 218,
        bid: expect.objectContaining({ type: "select", value: "Sat" }),
      }),
      expect.objectContaining({
        id: "standing-efficient-flying",
        sourceContext: "lineholder",
        propertyCode: 428,
        bid: expect.objectContaining({ type: "efficient-flying-preference", mode: "efficient" }),
      }),
    ]));
    expect(pageData.rightPanel.availableProperties.find((property) => property.propertyCode === 201)).toMatchObject({
      categoryLabel: "Days Off",
      categorySortOrder: 1,
      bid: { type: "date-or-dow-list", dates: [], daysOfWeek: ["SAT"] },
    });
    expect(pageData.rightPanel.availableProperties.find((property) => property.propertyCode === 168)).toMatchObject({
      categoryLabel: "Pairing",
      categorySortOrder: 2,
      action: "award",
      supportedActions: ["award", "avoid"],
      favorited: false,
    });
    expect(pageData.rightPanel.availableProperties.find((property) => property.propertyCode === 428)).toMatchObject({
      categoryLabel: "Pairing",
      categorySortOrder: 2,
      action: "award",
      supportedActions: ["award", "avoid"],
      favorited: false,
    });
    expect(pageData.rightPanel.availableProperties.find((property) => property.propertyCode === 429)).toMatchObject({
      categoryLabel: "Roster",
      categorySortOrder: 3,
    });
    expect(pageData.rightPanel.availableProperties.find((property) => property.propertyCode === 407)).toMatchObject({
      categoryLabel: "Roster",
      categorySortOrder: 3,
      bid: { type: "minimum-base-layover", minimumDuration: "013:00" },
    });
    expect(pageData.rightPanel.availableProperties.find((property) => property.propertyCode === 218)).toMatchObject({
      categoryLabel: "Days Off",
      categorySortOrder: 1,
    });
  });

  it("maps all Reserve Standing properties into the Roster category while retaining reserve context", () => {
    const pageData = mapStandingBidResponseToPageData(buildStandingResponse());
    const reserveProperties = pageData.rightPanel.availableProperties.filter(
      (property) => property.sourceContext === "reserve",
    );

    expect(reserveProperties.map((property) => property.propertyCode).sort()).toEqual([301, 313, 314]);
    expect(pageData.rightPanel.availableProperties.find((property) => property.propertyCode === 301)).toMatchObject({
      categoryLabel: "Roster",
      categorySortOrder: 3,
      sourceContext: "reserve",
    });
    expect(pageData.rightPanel.availableProperties.find((property) => property.propertyCode === 313)).toMatchObject({
      categoryLabel: "Roster",
      categorySortOrder: 3,
      sourceContext: "reserve",
    });
    expect(pageData.rightPanel.availableProperties.find((property) => property.propertyCode === 314)).toMatchObject({
      categoryLabel: "Roster",
      categorySortOrder: 3,
      sourceContext: "reserve",
    });
  });

  it("displays Standing Line Reserve 427 as Mixed Line Bid while preserving the saved name", () => {
    const response = buildStandingResponse();
    response.lineholderDraft.properties.push({
      propertyGroupKey: "standing-line-427",
      rowSeq: 3,
      bidType: "Line",
      propertyCode: 427,
      name: "Reserve",
      action: "award",
      bid: { type: "flag" },
      tiers: ["T2"],
    });
    response.propertyCatalog.lineholder.push({
      bidType: "Line",
      propertyCode: 427,
      name: "Reserve",
      defaultAction: "award",
      supportedActions: ["award", "avoid"],
      defaultBid: { type: "flag" },
    });

    const pageData = mapStandingBidResponseToPageData(response);
    const available427 = pageData.rightPanel.availableProperties.find((property) =>
      property.propertyCode === 427);
    const existing427 = pageData.rightPanel.existingProperties.find((property) =>
      property.propertyCode === 427);
    const draft = mapExistingPropertiesToStandingDraftDocument(
      pageData.rightPanel.existingProperties.filter((property) => property.sourceContext === "lineholder"),
      pageData.contexts.lineholder.draftMeta,
    );

    expect(available427).toMatchObject({
      name: "Mixed Line Bid",
      categoryLabel: "Roster",
      action: "award",
    });
    expect(existing427).toMatchObject({
      name: "Mixed Line Bid",
      categoryLabel: "Roster",
      action: "award",
    });
    expect(draft.properties.find((property) => property.propertyCode === 427)).toMatchObject({
      name: "Reserve",
      action: "award",
      bid: { type: "flag" },
      tiers: ["T2"],
    });
  });

  it("keeps the saved category for an existing property hidden from the current catalog", () => {
    const response = buildStandingResponse();

    response.propertyCatalog.lineholder = response.propertyCatalog.lineholder.filter(
      (property) => property.propertyCode !== 218,
    );

    const pageData = mapStandingBidResponseToPageData(response);

    expect(pageData.rightPanel.availableProperties.some(
      (property) => property.propertyCode === 218,
    )).toBe(false);
    expect(pageData.rightPanel.existingProperties.find(
      (property) => property.propertyCode === 218,
    )).toMatchObject({
      categoryLabel: "Days Off",
      categorySortOrder: 1,
      sourceContext: "lineholder",
    });
  });

  it("sorts unified Existing rows by smallest Tier and category without changing context order", () => {
    const response = buildStandingResponse();

    response.reserveDraft.properties = [{
      propertyGroupKey: "standing-reserve-block",
      rowSeq: 1,
      bidType: "Reserve",
      propertyCode: 313,
      name: "Reserve Work Block Size",
      bid: { type: "stepper-range", from: 3, to: 5, min: 3, max: 6 },
      tiers: ["T1", "T4"],
    }];

    const pageData = mapStandingBidResponseToPageData(response);

    expect(pageData.rightPanel.existingProperties.map((property) => property.id)).toEqual([
      "standing-day-off",
      "standing-reserve-block",
      "standing-efficient-flying",
    ]);
    expect(response.lineholderDraft.properties.map((property) => property.rowSeq)).toEqual([1, 2]);
    expect(response.reserveDraft.properties.map((property) => property.rowSeq)).toEqual([1]);
  });

  it("maps existing Standing rows back into the save payload", () => {
    const pageData = mapStandingBidResponseToPageData(buildStandingResponse());
    const draft = mapExistingPropertiesToStandingDraftDocument(
      pageData.rightPanel.existingProperties.filter((property) => property.sourceContext === "lineholder"),
      pageData.contexts.lineholder.draftMeta,
    );

    expect(draft).toMatchObject({
      draftKey: "100",
      bidId: 100,
      periodId: null,
      periodCode: "STANDING",
      bidContext: "StandingLineholder",
      properties: expect.arrayContaining([
        expect.objectContaining({
          propertyGroupKey: "standing-day-off",
          rowSeq: 1,
          propertyCode: 218,
          name: "Day of Week Off",
          bid: expect.objectContaining({ type: "select", value: "Sat" }),
          tiers: ["T1", "T2"],
        }),
        expect.objectContaining({
          propertyGroupKey: "standing-efficient-flying",
          rowSeq: 2,
          propertyCode: 428,
          name: "Efficient Flying First",
          action: "award",
          bid: expect.objectContaining({ type: "efficient-flying-preference", mode: "efficient" }),
          tiers: ["T3"],
        }),
      ]),
    });
  });

  it("keeps reusable Standing bids and rejects concrete dates in the save payload", () => {
    const pageData = mapStandingBidResponseToPageData(buildStandingResponse());
    const reusableDraft = mapExistingPropertiesToStandingDraftDocument([
      {
        id: "prefer-off",
        propertyCode: 201,
        name: "Prefer Off",
        bid: { type: "date-or-dow-list", dates: [], daysOfWeek: ["SAT"] },
        tiers: [{ key: "T1", label: "T1", active: true }],
      },
      {
        id: "line-pattern",
        propertyCode: 410,
        name: "Reserve / Flying Date Pattern",
        bid: {
          type: "reserve-flying-date-pattern",
          segments: [{ workType: "reserve", callType: "PRAM", dateScope: { mode: "first_half" } }],
          callTypeOptions: ["PRAM", "PRPM", "CRAM", "CRPM"],
          strength: "normal",
        },
        tiers: [{ key: "T1", label: "T1", active: true }],
      },
      {
        id: "minimum-base-layover",
        propertyCode: 407,
        name: "Minimum Base Layover",
        bid: { type: "minimum-base-layover", minimumDuration: "013:00" },
        tiers: [{ key: "T1", label: "T1", active: true }],
      },
      {
        id: "long-stretch-off",
        propertyCode: 204,
        name: "Long Stretch Off / Compressed Flying",
        bid: { type: "stepper-date-range", value: 8, from: "", to: "", min: 1, max: 14 },
        tiers: [{ key: "T1", label: "T1", active: true }],
      },
    ], pageData.contexts.lineholder.draftMeta);

    expect(reusableDraft.properties).toMatchObject([
      { propertyCode: 201, bid: { type: "date-or-dow-list", dates: [], daysOfWeek: ["SAT"] } },
      {
        propertyCode: 410,
        bid: {
          type: "reserve-flying-date-pattern",
          segments: [{ workType: "reserve", dateScope: { mode: "first_half" } }],
        },
      },
      { propertyCode: 407, bid: { type: "minimum-base-layover", minimumDuration: "013:00" } },
      {
        propertyCode: 204,
        bid: { type: "stepper-date-range", value: 8, from: "", to: "" },
      },
    ]);

    expect(() => mapExistingPropertiesToStandingDraftDocument([
      {
        id: "date-bound-prefer-off",
        propertyCode: 201,
        name: "Prefer Off",
        bid: { type: "date-or-dow-list", dates: ["2026-06-01"], daysOfWeek: ["SAT"] },
        tiers: [{ key: "T1", label: "T1", active: true }],
      },
    ], pageData.contexts.lineholder.draftMeta)).toThrow("Date-bound bids are not valid for Standing Bid.");

    expect(() => mapExistingPropertiesToStandingDraftDocument([
      {
        id: "dated-long-stretch-off",
        propertyCode: 204,
        name: "Long Stretch Off / Compressed Flying",
        bid: {
          type: "stepper-date-range",
          value: 8,
          from: "2026-06-01",
          to: "2026-06-10",
          min: 1,
          max: 14,
        },
        tiers: [{ key: "T1", label: "T1", active: true }],
      },
    ], pageData.contexts.lineholder.draftMeta)).toThrow("Date-bound bids are not valid for Standing Bid.");
  });

  it("rejects reserve date scopes that bind Standing Bid to concrete dates", () => {
    const pageData = mapStandingBidResponseToPageData(buildStandingResponse());

    expect(() => mapExistingPropertiesToStandingDraftDocument([
      {
        id: "short-call-specific-date",
        propertyCode: 301,
        name: "Short Call Type",
        bid: {
          type: "reserve-call-type-date-scope",
          callType: "PRAM",
          options: ["PRAM", "PRPM", "CRAM", "CRPM"],
          dateScope: { mode: "date_range", from: "2026-06-01", to: "2026-06-10" },
        },
        tiers: [{ key: "T1", label: "T1", active: true }],
      },
    ], pageData.contexts.reserve.draftMeta)).toThrow("Date-bound bids are not valid for Standing Bid.");
  });
});
