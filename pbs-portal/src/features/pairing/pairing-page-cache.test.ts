import { pairingPageData } from "@/features/pairing/mock";
import {
  patchPairingPageAvailableProperties,
  patchPairingPageDraftMeta,
  patchPairingPageExistingProperties,
  patchPairingPageFavoriteStatus,
} from "@/features/pairing/pairing-page-cache";
import type { PairingExistingProperty, PairingPageData } from "@/features/pairing/types";

const clonePairingPageData = (): PairingPageData => structuredClone(pairingPageData);

const replacementExistingProperty: PairingExistingProperty = {
  id: "existing-replacement",
  propertyCode: 131,
  name: "Prefer Pairing Length",
  action: "award",
  quantifier: "any",
  bid: { type: "stepper", value: 3, min: 1, max: 9 },
  tiers: [{ key: "t1", label: "T1", active: true }],
  priorityOptions: ["P1", "P2"],
  pairingNumber: "D00317",
  pairingType: "Regular",
  effectiveDateRange: { from: "2026-04-01", to: "2026-04-03" },
};

describe("pairing page cache helpers", () => {
  it("patches draft meta only when a patch value is present", () => {
    const data = clonePairingPageData();

    expect(patchPairingPageDraftMeta(data, {})).toBe(data);

    const patched = patchPairingPageDraftMeta(data, {
      bidId: 42,
      draftKey: "draft-42",
      draftVersion: data.rightPanel.draftMeta.draftVersion + 1,
      periodId: null,
    });

    expect(patched).not.toBe(data);
    expect(patched.rightPanel.draftMeta).toMatchObject({
      bidId: 42,
      draftKey: "draft-42",
      draftVersion: data.rightPanel.draftMeta.draftVersion + 1,
      periodId: null,
    });
    expect(data.rightPanel.draftMeta.bidId).toBeUndefined();
  });

  it("patches favorite status without changing unrelated available properties", () => {
    const data = clonePairingPageData();
    const untouchedProperty = data.rightPanel.availableProperties.find((property) => property.propertyCode !== 138);

    const favorited = patchPairingPageFavoriteStatus(data, 138, true, {
      favoriteKey: "favorite-138",
      propertyId: 900138,
    });

    const patchedProperty = favorited.rightPanel.availableProperties.find((property) => property.propertyCode === 138);

    expect(patchedProperty).toMatchObject({
      favorited: true,
      favoriteKey: "favorite-138",
      propertyId: 900138,
    });
    const sourceProperty = data.rightPanel.availableProperties.find((property) => property.propertyCode === 138);

    expect(sourceProperty).toMatchObject({ favorited: false });
    expect(sourceProperty?.favoriteKey).toBeUndefined();
    expect(sourceProperty?.propertyId).toBeUndefined();
    expect(
      favorited.rightPanel.availableProperties.find((property) => property.propertyCode === untouchedProperty?.propertyCode),
    ).toEqual(untouchedProperty);

    const unfavorited = patchPairingPageFavoriteStatus(favorited, 138, false);
    const unfavoritedProperty = unfavorited.rightPanel.availableProperties.find((property) => property.propertyCode === 138);

    expect(unfavoritedProperty).toMatchObject({ favorited: false });
    expect(unfavoritedProperty?.favoriteKey).toBeUndefined();
    expect(unfavoritedProperty?.propertyId).toBeUndefined();
  });

  it("replaces existing properties while preserving the rest of the page data", () => {
    const data = clonePairingPageData();
    const patched = patchPairingPageExistingProperties(data, [replacementExistingProperty]);

    expect(patched.rightPanel.existingProperties).toEqual([replacementExistingProperty]);
    expect(patched.rightPanel.availableProperties).toBe(data.rightPanel.availableProperties);
    expect(data.rightPanel.existingProperties).not.toEqual([replacementExistingProperty]);
  });

  it("replaces available properties while preserving the current draft identity", () => {
    const data = clonePairingPageData();
    const replacementAvailableProperties = data.rightPanel.availableProperties.map((property) => ({
      ...property,
      tiers: property.tiers.map((tier) => ({
        ...tier,
        active: property.source === "favorite" && tier.key === "T3",
      })),
    }));
    const patched = patchPairingPageAvailableProperties(data, replacementAvailableProperties);

    expect(patched.rightPanel.availableProperties).toEqual(replacementAvailableProperties);
    expect(patched.rightPanel.draftMeta).toBe(data.rightPanel.draftMeta);
    expect(patched.rightPanel.existingProperties).toBe(data.rightPanel.existingProperties);
  });
});
