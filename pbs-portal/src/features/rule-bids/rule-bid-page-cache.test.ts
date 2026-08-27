import {
  applyRuleBidConfiguredFavorite,
  applyRuleBidAvailablePropertyFavoriteStatus,
  patchRuleBidPageConfiguredFavorite,
  patchRuleBidPageDraftMeta,
  patchRuleBidPageExistingProperties,
  patchRuleBidPageFavoriteStatus,
  patchRuleBidPageUnfavoriteByKey,
} from "@/features/rule-bids/rule-bid-page-cache";
import type {
  RuleBidAvailableProperty,
  RuleBidExistingProperty,
  RuleBidPageData,
} from "@/features/rule-bids/types";

const buildRuleBidPageData = (): RuleBidPageData => ({
  rightPanel: {
    draftMeta: {
      draftKey: "draft-1",
      bidId: 1,
      periodId: 10,
      periodCode: "Apr 2026",
      draftVersion: 0,
      bidContext: "Current",
      remarks: "",
    },
    existingTitle: "EXISTING DAYS OFF PROPERTIES",
    addButtonLabel: "ADD MORE PROPERTIES",
    addSectionTitle: "ADD DAYS OFF PROPERTIES",
    allPropertiesLabel: "ALL PROPERTIES",
    favoritedPropertiesLabel: "FAVORITED PROPERTIES",
    searchPlaceholder: "Search Properties",
    showModifiers: true,
    existingProperties: [
      {
        id: "existing-211",
        propertyCode: 211,
        name: "Minimum Days Off Between Work Blocks",
        bid: { type: "stepper", value: 2, min: 1, max: 12 },
        tiers: [{ key: "t1", label: "T1", active: true }],
        allOrNothing: false,
        minimumN: 1,
      },
    ],
    availableProperties: [
      {
        id: "available-212",
        propertyCode: 212,
        name: "Maximize Weekend Days Off",
        favorited: false,
        bid: { type: "flag" },
        tiers: [{ key: "t1", label: "T1", active: true }],
      },
      {
        id: "available-215",
        favoriteKey: "favorite-215",
        propertyId: 900215,
        propertyCode: 215,
        name: "String of Days Off Starting on Date",
        favorited: true,
        bid: { type: "date", value: "2026-04-01" },
        tiers: [{ key: "t2", label: "T2", active: true }],
      },
    ],
  },
});

const buildReplacementExistingProperty = (): RuleBidExistingProperty => ({
  id: "existing-213",
  propertyCode: 213,
  name: "Maximize Total Days Off",
  action: null,
  bid: { type: "select", value: "Sat", options: ["Sat", "Sun"] },
  tiers: [{ key: "t3", label: "T3", active: true }],
  allOrNothing: true,
  minimumN: 2,
});

describe("rule bid page cache helpers", () => {
  it("patches draft meta and preserves the original data when the patch is empty", () => {
    const data = buildRuleBidPageData();

    expect(patchRuleBidPageDraftMeta(data, {})).toBe(data);

    const patched = patchRuleBidPageDraftMeta(data, {
      draftKey: "draft-2",
      bidId: 2,
      periodId: null,
      periodCode: "May 2026",
      draftVersion: 1,
    });

    expect(patched).not.toBe(data);
    expect(patched.rightPanel.draftMeta).toMatchObject({
      draftKey: "draft-2",
      bidId: 2,
      periodId: null,
      periodCode: "May 2026",
      draftVersion: 1,
    });
    expect(data.rightPanel.draftMeta.periodCode).toBe("Apr 2026");
  });

  it("applies favorite status to available properties without mutating the source array", () => {
    const data = buildRuleBidPageData();
    const sourceProperties = data.rightPanel.availableProperties;

    const patchedProperties = applyRuleBidAvailablePropertyFavoriteStatus(sourceProperties, 212, true, {
      favoriteKey: "favorite-212",
      propertyId: 900212,
    });

    expect(patchedProperties).not.toBe(sourceProperties);
    expect(patchedProperties.find((property) => property.propertyCode === 212)).toMatchObject({
      favorited: true,
      favoriteKey: "favorite-212",
      propertyId: 900212,
    });
    const sourceProperty = sourceProperties.find((property) => property.propertyCode === 212);

    expect(sourceProperty).toMatchObject({ favorited: false });
    expect(sourceProperty?.favoriteKey).toBeUndefined();
    expect(sourceProperty?.propertyId).toBeUndefined();
  });

  it("patches page favorite status and unfavorites by stable favorite key", () => {
    const data = buildRuleBidPageData();
    const favorited = patchRuleBidPageFavoriteStatus(data, 212, true, {
      favoriteKey: "favorite-212",
      propertyId: 900212,
    });

    expect(favorited.rightPanel.availableProperties.find((property) => property.propertyCode === 212)).toMatchObject({
      favorited: true,
      favoriteKey: "favorite-212",
      propertyId: 900212,
    });
    const sourceProperty = data.rightPanel.availableProperties.find((property) => property.propertyCode === 212);

    expect(sourceProperty).toMatchObject({ favorited: false });
    expect(sourceProperty?.favoriteKey).toBeUndefined();
    expect(sourceProperty?.propertyId).toBeUndefined();

    const unfavorited = patchRuleBidPageUnfavoriteByKey(favorited, "favorite-212");
    const unfavoritedProperty = unfavorited.rightPanel.availableProperties.find((property) => property.propertyCode === 212);

    expect(unfavoritedProperty).toMatchObject({ favorited: false });
    expect(unfavoritedProperty?.favoriteKey).toBeUndefined();
    expect(unfavoritedProperty?.propertyId).toBeUndefined();
    expect(unfavorited.rightPanel.availableProperties.find((property) => property.propertyCode === 215)).toMatchObject({
      favorited: true,
      favoriteKey: "favorite-215",
      propertyId: 900215,
    });
  });

  it("adds configured favorites as reusable favorite rows and removes them by favorite key", () => {
    const data = buildRuleBidPageData();
    const patched = patchRuleBidPageConfiguredFavorite(data, {
      favoriteKey: "favorite-201",
      propertyId: 900201,
      propertyCode: 201,
      name: "Prefer Off",
      bid: { type: "tag-list", values: ["2026-04-10"] },
      allOrNothing: true,
      minimumN: 1,
    });
    const favorite = patched.rightPanel.availableProperties.find((property) => property.id === "favorite-favorite-201");

    expect(favorite).toMatchObject({
      source: "favorite",
      favorited: true,
      favoriteKey: "favorite-201",
      propertyCode: 201,
      allOrNothing: true,
      minimumN: 1,
    });
    expect(favorite?.tiers.filter((tier) => tier.active).map((tier) => tier.label)).toEqual([]);
    expect(data.rightPanel.availableProperties.some((property) => property.id === "favorite-favorite-201")).toBe(false);
    if (favorite) {
      favorite.tiers = favorite.tiers.map((tier) => ({ ...tier, active: tier.label === "T2" }));
    }

    const replaced = applyRuleBidConfiguredFavorite(patched.rightPanel.availableProperties, {
      favoriteKey: "favorite-201",
      propertyId: 900201,
      propertyCode: 201,
      name: "Prefer Off",
      bid: { type: "tag-list", values: ["2026-04-11"] },
      allOrNothing: false,
      minimumN: null,
    });

    expect(replaced.filter((property) => property.favoriteKey === "favorite-201")).toHaveLength(1);
    expect(replaced.find((property) => property.favoriteKey === "favorite-201")?.bid).toEqual({
      type: "tag-list",
      values: ["2026-04-11"],
      suggestions: undefined,
    });
    expect(
      replaced.find((property) => property.favoriteKey === "favorite-201")
        ?.tiers.filter((tier) => tier.active).map((tier) => tier.label),
    ).toEqual(["T2"]);

    const removed = patchRuleBidPageUnfavoriteByKey(patched, "favorite-201");
    expect(removed.rightPanel.availableProperties.some((property) => property.favoriteKey === "favorite-201")).toBe(false);
  });

  it("clones patched existing properties before writing them into page data", () => {
    const data = buildRuleBidPageData();
    const replacement = buildReplacementExistingProperty();
    const patched = patchRuleBidPageExistingProperties(data, [replacement]);
    const patchedProperty = patched.rightPanel.existingProperties[0] as RuleBidExistingProperty;

    expect(patchedProperty).toEqual({
      ...replacement,
      supportedActions: undefined,
      maximumN: null,
    });
    expect(patchedProperty).not.toBe(replacement);
    expect(patchedProperty.tiers[0]).not.toBe(replacement.tiers[0]);
    expect(patchedProperty.bid).not.toBe(replacement.bid);
    expect(data.rightPanel.existingProperties[0]?.id).toBe("existing-211");
  });

  it("clones available properties when patching page favorite state", () => {
    const data = buildRuleBidPageData();
    const sourceProperty = data.rightPanel.availableProperties[0] as RuleBidAvailableProperty;
    const patched = patchRuleBidPageFavoriteStatus(data, sourceProperty.propertyCode, true, {
      favoriteKey: "favorite-212",
      propertyId: 900212,
    });
    const patchedProperty = patched.rightPanel.availableProperties[0] as RuleBidAvailableProperty;

    expect(patchedProperty).not.toBe(sourceProperty);
    expect(patchedProperty.tiers[0]).not.toBe(sourceProperty.tiers[0]);
    expect(patchedProperty).toMatchObject({
      favorited: true,
      favoriteKey: "favorite-212",
      propertyId: 900212,
    });
  });
});
