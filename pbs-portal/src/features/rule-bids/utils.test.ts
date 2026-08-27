import {
  areRuleBidExistingPropertiesEqual,
  buildRuleBidAvailableCategoryFilters,
  buildRuleBidAvailablePropertiesPage,
  buildRuleBidExistingPropertyFromAvailable,
  buildRuleBidHydrationKey,
  buildRuleBidPaginationItems,
  buildRuleBidViewResetKey,
  clampRuleBidPage,
  filterRuleBidAvailableProperties,
  getRuleBidSaveErrorMessage,
  hasDuplicateRuleBidExistingProperty,
  findRuleBidExistingPropertyTierMerge,
  mergeRuleBidExistingPropertyActiveTiers,
  removeRuleBidExistingPropertyById,
  toggleRuleBidAvailablePropertyFavoriteById,
  updateRuleBidExistingPropertyBid,
  updateRuleBidExistingPropertyTier,
  updateRuleBidExistingPropertyModifiers,
  buildRuleBidSavedExistingPropertiesAfterAdd,
} from "@/features/rule-bids/utils";
import {
  isRuleBidDraftConflictError,
  isRuleBidMissingFavoriteError,
} from "@/features/rule-bids/rule-bid-errors";
import type {
  RuleBidAvailableProperty,
  RuleBidExistingProperty,
  RuleBidRightPanelData,
} from "@/features/rule-bids/types";

const buildRightPanelData = (
  overrides: Partial<RuleBidRightPanelData> = {},
): RuleBidRightPanelData => ({
  draftMeta: {
    draftKey: "draft-1",
    bidId: 101,
    periodId: 202604,
    draftVersion: 7,
    periodCode: "Apr 2026",
    bidContext: "Current",
    remarks: "Initial remarks",
  },
  existingTitle: "Existing Days Off Properties",
  addButtonLabel: "Add Property",
  addSectionTitle: "Add Days Off Property",
  allPropertiesLabel: "All Properties",
  favoritedPropertiesLabel: "Favorites",
  searchPlaceholder: "Search days off properties",
  showModifiers: true,
  existingProperties: [
    {
      id: "existing-212",
      propertyCode: 212,
      name: "Maximize Weekend Days Off",
      bid: { type: "flag" },
      tiers: [{ key: "t1", label: "T1", active: true }],
      allOrNothing: false,
      minimumN: null,
    },
  ],
  availableProperties: [
    {
      id: "available-212",
      propertyCode: 212,
      name: "Maximize Weekend Days Off",
      favorited: true,
      bid: { type: "flag" },
      tiers: [{ key: "t1", label: "T1", active: true }],
      allOrNothing: false,
      minimumN: null,
    },
  ],
  ...overrides,
});

describe("rule bid utils", () => {
  it("builds an existing property from an available property with cloned nested values", () => {
    const property: RuleBidAvailableProperty = {
      id: "available-212",
      propertyCode: 212,
      name: "Maximize Weekend Days Off",
      favorited: true,
      bid: {
        type: "select",
        value: "Sat",
        options: ["Sat", "Sun"],
      },
      tiers: [{ key: "t1", label: "T1", active: true }],
      allOrNothing: true,
      minimumN: 2,
      maximumN: null,
    };

    const existingProperty = buildRuleBidExistingPropertyFromAvailable(property, "property-group-1");

    expect(existingProperty).toEqual({
      id: "property-group-1",
      propertyCode: 212,
      name: "Maximize Weekend Days Off",
      action: null,
      supportedActions: undefined,
      bid: {
        type: "select",
        value: "Sat",
        options: ["Sat", "Sun"],
      },
      tiers: [{ key: "t1", label: "T1", active: true }],
      allOrNothing: true,
      minimumN: 2,
      maximumN: null,
    });
    expect(existingProperty.bid).not.toBe(property.bid);
    expect(existingProperty.tiers[0]).not.toBe(property.tiers[0]);
  });

  it("clones tag-list bid arrays for Line extension properties", () => {
    const property: RuleBidAvailableProperty = {
      id: "available-417",
      propertyCode: 417,
      name: "Pairing Mix in a Work Block",
      favorited: false,
      bid: {
        type: "tag-list",
        values: ["3,1"],
        suggestions: ["1,2", "2,2", "3,1"],
      },
      tiers: [{ key: "t1", label: "T1", active: true }],
    };

    const existingProperty = buildRuleBidExistingPropertyFromAvailable(property, "property-group-417");

    expect(existingProperty.bid).toEqual(property.bid);
    if (existingProperty.bid.type === "tag-list" && property.bid.type === "tag-list") {
      expect(existingProperty.bid.values).not.toBe(property.bid.values);
      expect(existingProperty.bid.suggestions).not.toBe(property.bid.suggestions);
    }
  });

  it("defaults missing days off modifiers when building an existing property", () => {
    const property: RuleBidAvailableProperty = {
      id: "available-211",
      propertyCode: 211,
      name: "Minimum Days Off Between Work Blocks",
      favorited: false,
      bid: { type: "flag" },
      tiers: [{ key: "t1", label: "T1", active: true }],
    };

    expect(buildRuleBidExistingPropertyFromAvailable(property, "property-group-2")).toMatchObject({
      allOrNothing: false,
      minimumN: null,
    });
  });

  it("updates existing property bid, tier, and modifiers by id", () => {
    const properties: RuleBidExistingProperty[] = [
      {
        id: "existing-212",
        propertyCode: 212,
        name: "Maximize Weekend Days Off",
        bid: { type: "flag" },
        tiers: [
          { key: "t1", label: "T1", active: true },
          { key: "t2", label: "T2", active: false },
        ],
        allOrNothing: false,
        minimumN: null,
      },
      {
        id: "existing-213",
        propertyCode: 213,
        name: "Golden Week Vacation",
        bid: { type: "flag" },
        tiers: [{ key: "t1", label: "T1", active: true }],
        allOrNothing: false,
        minimumN: null,
      },
    ];
    const nextBid = { type: "select" as const, value: "Sat", options: ["Sat", "Sun"] };

    const withBid = updateRuleBidExistingPropertyBid(properties, "existing-212", nextBid);
    const withTier = updateRuleBidExistingPropertyTier(withBid, "existing-212", "t2");
    const withModifiers = updateRuleBidExistingPropertyModifiers(withTier, "existing-212", {
      allOrNothing: true,
      minimumN: 2,
    });

    expect(withModifiers[0]).toMatchObject({
      bid: nextBid,
      tiers: [
        { key: "t1", label: "T1", active: true },
        { key: "t2", label: "T2", active: true },
      ],
      allOrNothing: true,
      minimumN: 2,
    });
    expect(withBid[0].bid).not.toBe(nextBid);
    expect(withModifiers[1]).toBe(properties[1]);
  });

  it("removes existing properties by id", () => {
    const properties: RuleBidExistingProperty[] = [
      {
        id: "existing-212",
        propertyCode: 212,
        name: "Maximize Weekend Days Off",
        bid: { type: "flag" },
        tiers: [{ key: "t1", label: "T1", active: true }],
        allOrNothing: false,
        minimumN: null,
      },
      {
        id: "existing-213",
        propertyCode: 213,
        name: "Golden Week Vacation",
        bid: { type: "flag" },
        tiers: [{ key: "t1", label: "T1", active: true }],
        allOrNothing: false,
        minimumN: null,
      },
    ];

    expect(removeRuleBidExistingPropertyById(properties, "existing-212")).toEqual([properties[1]]);
  });

  it("builds saved existing properties after add with cloned nested values", () => {
    const currentProperties: RuleBidExistingProperty[] = [
      {
        id: "existing-212",
        propertyCode: 212,
        name: "Maximize Weekend Days Off",
        bid: { type: "flag" },
        tiers: [{ key: "t1", label: "T1", active: true }],
        allOrNothing: false,
        minimumN: null,
      },
    ];
    const pendingProperty: RuleBidExistingProperty = {
      id: "existing-213-2",
      propertyCode: 213,
      name: "Golden Week Vacation",
      bid: { type: "select", value: "Sat", options: ["Sat", "Sun"] },
      tiers: [{ key: "t1", label: "T1", active: true }],
      allOrNothing: true,
      minimumN: 2,
    };

    const savedProperties = buildRuleBidSavedExistingPropertiesAfterAdd(
      currentProperties,
      pendingProperty,
      "property-group-213",
    );

    expect(savedProperties).toEqual([
      {
        ...currentProperties[0],
        action: null,
        maximumN: null,
      },
      {
        ...pendingProperty,
        action: null,
        id: "property-group-213",
        maximumN: null,
      },
    ]);
    expect(savedProperties[0]).not.toBe(currentProperties[0]);
    expect(savedProperties[1]).not.toBe(pendingProperty);
    expect(savedProperties[1].bid).not.toBe(pendingProperty.bid);
    expect(savedProperties[1].tiers[0]).not.toBe(pendingProperty.tiers[0]);
  });

  it("detects exact duplicate existing properties by code, bid, tiers, and modifiers", () => {
    const existingProperties: RuleBidExistingProperty[] = [
      {
        id: "existing-212",
        propertyCode: 212,
        name: "Maximize Weekend Days Off",
        bid: { type: "flag" },
        tiers: [
          { key: "t1", label: "T1", active: true },
          { key: "t2", label: "T2", active: false },
        ],
        allOrNothing: false,
        minimumN: null,
      },
    ];

    expect(hasDuplicateRuleBidExistingProperty(existingProperties, {
      ...existingProperties[0],
      id: "pending-212",
      tiers: [
        { key: "t2", label: "T2", active: false },
        { key: "t1", label: "T1", active: true },
      ],
    })).toBe(true);
    expect(hasDuplicateRuleBidExistingProperty(existingProperties, {
      ...existingProperties[0],
      id: "pending-212-t2",
      tiers: [{ key: "t2", label: "T2", active: true }],
    })).toBe(false);
  });

  it("merges active tiers for the same property, bid, and modifiers", () => {
    const existingProperty: RuleBidExistingProperty = {
      id: "existing-402-t2",
      propertyCode: 402,
      name: "Min Credit Window",
      bid: { type: "flag" },
      tiers: [
        { key: "t1", label: "T1", active: false },
        { key: "t2", label: "T2", active: true },
      ],
      allOrNothing: false,
      minimumN: null,
    };
    const candidate: RuleBidExistingProperty = {
      ...existingProperty,
      id: "pending-402-t1",
      tiers: [
        { key: "t1", label: "T1", active: true },
        { key: "t2", label: "T2", active: false },
      ],
    };

    const mergeResult = findRuleBidExistingPropertyTierMerge([existingProperty], candidate);

    expect(mergeResult?.hasNewActiveTier).toBe(true);
    expect(mergeResult?.mergedProperty.tiers).toEqual([
      { key: "t1", label: "T1", active: true },
      { key: "t2", label: "T2", active: true },
    ]);
    expect(mergeRuleBidExistingPropertyActiveTiers(existingProperty, candidate).id).toBe("existing-402-t2");
  });

  it("toggles local available favorite state by id", () => {
    const properties: RuleBidAvailableProperty[] = [
      {
        id: "available-212",
        propertyCode: 212,
        name: "Maximize Weekend Days Off",
        favorited: true,
        favoriteKey: "favorite-212",
        propertyId: 900212,
        bid: { type: "flag" },
        tiers: [{ key: "t1", label: "T1", active: true }],
        allOrNothing: false,
        minimumN: null,
      },
      {
        id: "available-213",
        propertyCode: 213,
        name: "Golden Week Vacation",
        favorited: false,
        bid: { type: "flag" },
        tiers: [{ key: "t1", label: "T1", active: true }],
        allOrNothing: false,
        minimumN: null,
      },
    ];

    const nextProperties = toggleRuleBidAvailablePropertyFavoriteById(properties, "available-212");

    expect(nextProperties[0]).toMatchObject({
      favorited: false,
      favoriteKey: "favorite-212",
      propertyId: 900212,
    });
    expect(nextProperties[1]).toBe(properties[1]);
  });

  it("compares existing properties by draft-relevant fields", () => {
    const properties: RuleBidExistingProperty[] = [
      {
        id: "existing-212",
        propertyCode: 212,
        name: "Maximize Weekend Days Off",
        bid: {
          type: "select",
          value: "Sat",
          options: ["Sat", "Sun"],
        },
        tiers: [{ key: "t1", label: "T1", active: true }],
        allOrNothing: false,
        minimumN: null,
      },
    ];

    expect(areRuleBidExistingPropertiesEqual(properties, structuredClone(properties))).toBe(true);
    expect(areRuleBidExistingPropertiesEqual(
      properties,
      [
        {
          ...structuredClone(properties[0]),
          tiers: [{ key: "t1", label: "T1", active: false }],
        },
      ],
    )).toBe(false);
    expect(areRuleBidExistingPropertiesEqual(
      properties,
      [
        {
          ...structuredClone(properties[0]),
          minimumN: 1,
        },
      ],
    )).toBe(false);
  });

  it("builds compact pagination windows", () => {
    expect(buildRuleBidPaginationItems(3, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(buildRuleBidPaginationItems(1, 10)).toEqual([1, 2, "ellipsis-end", 10]);
    expect(buildRuleBidPaginationItems(5, 10)).toEqual([1, "ellipsis-start", 4, 5, 6, "ellipsis-end", 10]);
    expect(buildRuleBidPaginationItems(10, 10)).toEqual([1, "ellipsis-start", 9, 10]);
  });

  it("clamps page numbers to the available page range", () => {
    expect(clampRuleBidPage(0, 5)).toBe(1);
    expect(clampRuleBidPage(3, 5)).toBe(3);
    expect(clampRuleBidPage(9, 5)).toBe(5);
  });

  it("builds available property pages with total counts", () => {
    const properties: RuleBidAvailableProperty[] = Array.from({ length: 5 }, (_, index) => ({
      id: `available-${index + 1}`,
      propertyCode: 210 + index,
      name: `Property ${index + 1}`,
      favorited: index % 2 === 0,
      bid: { type: "flag" },
      tiers: [{ key: "t1", label: "T1", active: true }],
    }));

    expect(buildRuleBidAvailablePropertiesPage(properties, 2, 2)).toEqual({
      items: [properties[2], properties[3]],
      totalItems: 5,
      totalPages: 3,
    });
    expect(buildRuleBidAvailablePropertiesPage([], 1, 10)).toEqual({
      items: [],
      totalItems: 0,
      totalPages: 1,
    });
  });

  it("builds hydration keys from draft identity, properties, and panel labels", () => {
    const data = buildRightPanelData();
    const parsedKey = JSON.parse(buildRuleBidHydrationKey(data));

    expect(parsedKey).toEqual({
      draftMeta: {
        draftKey: "draft-1",
        bidId: 101,
        periodId: 202604,
        periodCode: "Apr 2026",
        bidContext: "Current",
        remarks: "Initial remarks",
      },
      existingProperties: data.existingProperties,
      availableProperties: data.availableProperties,
      labels: {
        existingTitle: "Existing Days Off Properties",
        addButtonLabel: "Add Property",
        addSectionTitle: "Add Days Off Property",
        allPropertiesLabel: "All Properties",
        favoritedPropertiesLabel: "Favorites",
        searchPlaceholder: "Search days off properties",
        showModifiers: true,
      },
    });
    expect(buildRuleBidHydrationKey(data)).toBe(
      buildRuleBidHydrationKey({
        ...data,
        draftMeta: {
          ...data.draftMeta,
          draftVersion: 8,
        },
      }),
    );
    expect(buildRuleBidHydrationKey(data)).not.toBe(
      buildRuleBidHydrationKey({
        ...data,
        availableProperties: [],
      }),
    );
  });

  it("builds view reset keys from period context and view labels only", () => {
    const data = buildRightPanelData();
    const parsedKey = JSON.parse(buildRuleBidViewResetKey(data));

    expect(parsedKey).toEqual({
      draftMeta: {
        periodCode: "Apr 2026",
        bidContext: "Current",
      },
      labels: {
        existingTitle: "Existing Days Off Properties",
        addSectionTitle: "Add Days Off Property",
        allPropertiesLabel: "All Properties",
        favoritedPropertiesLabel: "Favorites",
        searchPlaceholder: "Search days off properties",
        showModifiers: true,
      },
    });
    expect(buildRuleBidViewResetKey(data)).toBe(
      buildRuleBidViewResetKey({
        ...data,
        addButtonLabel: "Add",
        availableProperties: [],
        existingProperties: [],
      }),
    );
    expect(buildRuleBidViewResetKey(data)).not.toBe(
      buildRuleBidViewResetKey({
        ...data,
        searchPlaceholder: "Search rules",
      }),
    );
  });

  it("resolves save error messages from API responses, Error instances, and fallback text", () => {
    expect(getRuleBidSaveErrorMessage({
      response: {
        data: {
          message: "Tier T2 conflicts with this property.",
        },
      },
    })).toBe("Tier T2 conflicts with this property.");

    expect(getRuleBidSaveErrorMessage(new Error("Network timeout"))).toBe("Network timeout");

    expect(getRuleBidSaveErrorMessage({
      response: {
        data: {
          message: "   ",
        },
      },
    })).toBe("Unable to save this draft. Please review the highlighted issues and try again.");

    expect(getRuleBidSaveErrorMessage(null)).toBe(
      "Unable to save this draft. Please review the highlighted issues and try again.",
    );
  });

  it("recognizes only HTTP 409 responses as draft conflicts", () => {
    expect(isRuleBidDraftConflictError({ response: { status: 409 } })).toBe(true);
    expect(isRuleBidDraftConflictError({ response: { status: 400 } })).toBe(false);
    expect(isRuleBidDraftConflictError(new Error("Conflict"))).toBe(false);
  });

  it("recognizes only HTTP 404 responses as missing favorites", () => {
    expect(isRuleBidMissingFavoriteError({ response: { status: 404 } })).toBe(true);
    expect(isRuleBidMissingFavoriteError({ response: { status: 409 } })).toBe(false);
    expect(isRuleBidMissingFavoriteError(new Error("Missing"))).toBe(false);
  });

  it("filters available properties by tab and keyword", () => {
    const properties: RuleBidAvailableProperty[] = [
      {
        id: "available-weekend",
        propertyCode: 212,
        name: "Maximize Weekend Days Off",
        favorited: false,
        recommendedSortOrder: 2,
        bid: { type: "flag" },
        tiers: [{ key: "t1", label: "T1", active: true }],
      },
      {
        id: "available-work-blocks",
        propertyCode: 211,
        name: "Minimum Days Off Between Work Blocks",
        favorited: false,
        bid: { type: "flag" },
        tiers: [{ key: "t1", label: "T1", active: true }],
      },
      {
        id: "available-golden-week",
        propertyCode: 213,
        name: "Golden Week Vacation",
        favorited: false,
        recommendedSortOrder: 1,
        bid: { type: "flag" },
        tiers: [{ key: "t1", label: "T1", active: true }],
      },
      {
        id: "favorite-prefer-off",
        source: "favorite",
        propertyCode: 201,
        name: "Prefer Off",
        favorited: true,
        bid: { type: "tag-list", values: ["2026-04-10"] },
        tiers: [{ key: "t1", label: "T1", active: true }],
      },
    ];

    expect(filterRuleBidAvailableProperties(properties, "all", "").map((property) => property.id)).toEqual([
      "available-golden-week",
      "available-weekend",
      "available-work-blocks",
    ]);
    expect(filterRuleBidAvailableProperties(properties, "favorited", "").map((property) => property.id)).toEqual([
      "favorite-prefer-off",
    ]);
    expect(filterRuleBidAvailableProperties(properties, "all", " work ").map((property) => property.id)).toEqual([
      "available-work-blocks",
    ]);
    expect(filterRuleBidAvailableProperties(properties, "favorited", "week")).toEqual([]);
  });

  it("builds category filters and applies category before keyword search", () => {
    const properties: RuleBidAvailableProperty[] = [
      {
        id: "available-prefer-off",
        propertyCode: 201,
        name: "Prefer Off",
        categoryLabel: "Days Off",
        categorySortOrder: 1,
        favorited: false,
        bid: { type: "flag" },
        tiers: [{ key: "t1", label: "T1", active: true }],
      },
      {
        id: "available-landing",
        propertyCode: 101,
        name: "Any Landing In Airport",
        categoryLabel: "Pairing",
        categorySortOrder: 2,
        favorited: false,
        bid: { type: "tag-list", values: [] },
        tiers: [{ key: "t1", label: "T1", active: true }],
      },
      {
        id: "available-credit",
        propertyCode: 401,
        name: "Max Credit Window",
        categoryLabel: "Line",
        categorySortOrder: 3,
        favorited: false,
        bid: { type: "flag" },
        tiers: [{ key: "t1", label: "T1", active: true }],
      },
      {
        id: "favorite-prefer-off",
        source: "favorite",
        propertyCode: 201,
        name: "Prefer Off",
        categoryLabel: "Days Off",
        categorySortOrder: 1,
        favorited: true,
        bid: { type: "flag" },
        tiers: [{ key: "t1", label: "T1", active: true }],
      },
    ];

    expect(buildRuleBidAvailableCategoryFilters(properties, "all")).toEqual([
      { key: "all", label: "All", count: 3, sortOrder: 0 },
      { key: "days-off", label: "Days Off", count: 1, sortOrder: 1 },
      { key: "pairing", label: "Pairing", count: 1, sortOrder: 2 },
      { key: "line", label: "Line", count: 1, sortOrder: 3 },
    ]);
    expect(buildRuleBidAvailableCategoryFilters(properties, "favorited")).toEqual([
      { key: "all", label: "All", count: 1, sortOrder: 0 },
      { key: "days-off", label: "Days Off", count: 1, sortOrder: 1 },
    ]);
    expect(filterRuleBidAvailableProperties(properties, "all", "", "pairing").map((property) => property.id)).toEqual([
      "available-landing",
    ]);
    expect(filterRuleBidAvailableProperties(properties, "all", "credit", "pairing")).toEqual([]);
    expect(filterRuleBidAvailableProperties(properties, "all", "credit", "all").map((property) => property.id)).toEqual([
      "available-credit",
    ]);
  });
});
