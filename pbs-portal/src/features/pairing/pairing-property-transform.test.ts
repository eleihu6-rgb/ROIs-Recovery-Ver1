import { describe, expect, it } from "vitest";
import { pairingPropertyPriorityOptions } from "@/features/pairing/pairing-property-catalog";
import {
  buildPairingSearchPreviewProperty,
  buildPairingRightPanelHydrationKey,
  buildSavedPairingExistingPropertiesAfterAdd,
  cloneAvailableProperties,
  cloneExistingProperties,
  cloneExistingPropertyFromAvailable,
  clonePairingTierOptions,
  cloneSearchCriteriaItem,
  createPairingTierOptions,
  getActivePairingTierLabels,
  removePairingExistingPropertyById,
  replacePairingExistingPropertyById,
  togglePairingTierOptions,
  updatePairingAvailablePropertyAction,
  updatePairingAvailablePropertyBid,
  updatePairingAvailablePropertyTier,
  updatePairingAvailablePropertyQuantifier,
} from "@/features/pairing/pairing-property-transform";
import type {
  PairingAvailableProperty,
  PairingBidValue,
  PairingExistingProperty,
  PairingRightPanelData,
  PairingSearchCriteriaItem,
  PairingSearchForm,
} from "@/features/pairing/types";

const availableProperty: PairingAvailableProperty = {
  id: "available-131",
  propertyCode: 131,
  name: "Prefer Pairing Length",
  favorited: true,
  favoriteKey: "favorite-131",
  propertyId: 700131,
  action: "award",
  quantifier: null,
  bid: { type: "stepper", value: 3, min: 1, max: 7 },
  tiers: [{ key: "T1", label: "T1", active: true }],
  actions: ["add", "preview"],
  pairingNumber: "M4959",
  pairingType: "Domestic",
  effectiveDateRange: {
    from: "2026-04-01",
    to: "2026-04-30",
  },
};

const existingProperty: PairingExistingProperty = {
  id: "existing-131-1",
  propertyCode: 131,
  name: "Prefer Pairing Length",
  action: "award",
  quantifier: null,
  bid: { type: "stepper", value: 3, min: 1, max: 7 },
  tiers: [{ key: "T1", label: "T1", active: true }],
  priorityOptions: ["Prefer Pairing Length"],
  pairingNumber: "M4959",
  pairingType: "Domestic",
  effectiveDateRange: {
    from: "2026-04-01",
    to: "2026-04-30",
  },
};

const rightPanelDraftMeta: PairingRightPanelData["draftMeta"] = {
  draftKey: "draft-1",
  bidId: 101,
  periodId: 202604,
  draftVersion: 7,
  periodCode: "Apr 2026",
  bidContext: "Current",
  remarks: "Initial remarks",
};

const initialSearchForm: PairingSearchForm = {
  pairingNumber: "M4959",
  pairingType: "Domestic",
  dateFrom: "2026-04-01",
  dateTo: "2026-04-30",
};

describe("pairing property transform helpers", () => {
  it("creates and clones pairing tier options", () => {
    const tiers = createPairingTierOptions(["T2", "T4"]);
    const clone = clonePairingTierOptions(tiers);

    expect(tiers).toEqual([
      { key: "t1", label: "T1", active: false },
      { key: "t2", label: "T2", active: true },
      { key: "t3", label: "T3", active: false },
      { key: "t4", label: "T4", active: true },
      { key: "t5", label: "T5", active: false },
      { key: "t6", label: "T6", active: false },
      { key: "t7", label: "T7", active: false },
    ]);
    expect(clone).toEqual(tiers);
    expect(clone[0]).not.toBe(tiers[0]);
  });

  it("toggles pairing tier options but keeps at least one active tier", () => {
    const tiers = createPairingTierOptions(["T1", "T3"]);

    expect(togglePairingTierOptions(tiers, "t3")).toEqual([
      { key: "t1", label: "T1", active: true },
      { key: "t2", label: "T2", active: false },
      { key: "t3", label: "T3", active: false },
      { key: "t4", label: "T4", active: false },
      { key: "t5", label: "T5", active: false },
      { key: "t6", label: "T6", active: false },
      { key: "t7", label: "T7", active: false },
    ]);

    expect(togglePairingTierOptions(createPairingTierOptions(["T1"]), "t1")).toEqual(
      createPairingTierOptions(["T1"]),
    );

    expect(togglePairingTierOptions(createPairingTierOptions(["T1"]), "t2")[1]).toEqual({
      key: "t2",
      label: "T2",
      active: true,
    });
  });

  it("returns unique active pairing tier labels in numeric order", () => {
    expect(getActivePairingTierLabels([
      {
        ...existingProperty,
        id: "existing-t3",
        tiers: [
          { key: "t3", label: "T3", active: true },
          { key: "t1", label: "T1", active: true },
        ],
      },
      {
        ...existingProperty,
        id: "existing-t2",
        tiers: [
          { key: "t2", label: "T2", active: true },
          { key: "t3", label: "T3", active: true },
        ],
      },
    ])).toEqual(["T1", "T2", "T3"]);
  });

  it("builds right panel hydration keys from draft identity, existing properties, and search form", () => {
    const parsedKey = JSON.parse(buildPairingRightPanelHydrationKey(
      rightPanelDraftMeta,
      [existingProperty],
      initialSearchForm,
    ));

    expect(parsedKey).toEqual({
      draftMeta: {
        draftKey: "draft-1",
        bidId: 101,
        periodId: 202604,
        periodCode: "Apr 2026",
        bidContext: "Current",
        remarks: "Initial remarks",
      },
      existingProperties: [existingProperty],
      initialSearchForm,
    });
    expect(buildPairingRightPanelHydrationKey(
      rightPanelDraftMeta,
      [existingProperty],
      initialSearchForm,
    )).toBe(buildPairingRightPanelHydrationKey(
      {
        ...rightPanelDraftMeta,
        draftVersion: 8,
      },
      [existingProperty],
      initialSearchForm,
    ));
    expect(buildPairingRightPanelHydrationKey(
      rightPanelDraftMeta,
      [existingProperty],
      initialSearchForm,
    )).not.toBe(buildPairingRightPanelHydrationKey(
      rightPanelDraftMeta,
      [],
      initialSearchForm,
    ));
    expect(buildPairingRightPanelHydrationKey(
      rightPanelDraftMeta,
      [existingProperty],
      initialSearchForm,
    )).not.toBe(buildPairingRightPanelHydrationKey(
      {
        ...rightPanelDraftMeta,
        remarks: "Updated remarks",
      },
      [existingProperty],
      initialSearchForm,
    ));
  });

  it("builds existing properties from available properties with cloned nested fields", () => {
    const existing = cloneExistingPropertyFromAvailable(availableProperty, 2);

    expect(existing).toEqual({
      id: "existing-available-131-3",
      propertyCode: 131,
      name: "Prefer Pairing Length",
      action: "award",
      quantifier: null,
      bid: { type: "stepper", value: 3, min: 1, max: 7 },
      tiers: [{ key: "T1", label: "T1", active: true }],
      priorityOptions: pairingPropertyPriorityOptions,
      pairingNumber: "M4959",
      pairingType: "Domestic",
      effectiveDateRange: {
        from: "2026-04-01",
        to: "2026-04-30",
      },
    });
    expect(existing.bid).not.toBe(availableProperty.bid);
    expect(existing.tiers).not.toBe(availableProperty.tiers);
    expect(existing.effectiveDateRange).not.toBe(availableProperty.effectiveDateRange);
    expect(existing.priorityOptions).not.toBe(pairingPropertyPriorityOptions);
  });

  it("deep-clones existing and available property arrays", () => {
    const [existingClone] = cloneExistingProperties([existingProperty]);
    const [availableClone] = cloneAvailableProperties([availableProperty]);

    expect(existingClone).toEqual(existingProperty);
    expect(existingClone).not.toBe(existingProperty);
    expect(existingClone.bid).not.toBe(existingProperty.bid);
    expect(existingClone.tiers).not.toBe(existingProperty.tiers);
    expect(existingClone.priorityOptions).not.toBe(existingProperty.priorityOptions);
    expect(existingClone.effectiveDateRange).not.toBe(existingProperty.effectiveDateRange);

    expect(availableClone).toEqual(availableProperty);
    expect(availableClone).not.toBe(availableProperty);
    expect(availableClone.bid).not.toBe(availableProperty.bid);
    expect(availableClone.tiers).not.toBe(availableProperty.tiers);
    expect(availableClone.actions).not.toBe(availableProperty.actions);
    expect(availableClone.effectiveDateRange).not.toBe(availableProperty.effectiveDateRange);
  });

  it("updates available property bid, action, quantifier, and tier by id", () => {
    const otherProperty = {
      ...availableProperty,
      id: "available-132",
      propertyCode: 132,
      name: "Avoid Redeye",
    };
    const properties = [
      {
        ...availableProperty,
        tiers: createPairingTierOptions(["T1"]),
      },
      otherProperty,
    ];
    const nextBid: PairingBidValue = { type: "select", value: "Redeye", options: ["Redeye"] };

    const bidUpdated = updatePairingAvailablePropertyBid(properties, availableProperty.id, nextBid);
    expect(bidUpdated[0]?.bid).toEqual(nextBid);
    expect(bidUpdated[0]?.bid).not.toBe(nextBid);
    expect(bidUpdated[1]).toBe(otherProperty);

    expect(updatePairingAvailablePropertyAction(properties, availableProperty.id, "avoid")[0]?.action).toBe("avoid");
    expect(updatePairingAvailablePropertyQuantifier(properties, availableProperty.id, "every")[0]?.quantifier).toBe(
      "every",
    );
    expect(updatePairingAvailablePropertyTier(properties, availableProperty.id, "t2")[0]?.tiers).toEqual(
      createPairingTierOptions(["T1", "T2"]),
    );
  });

  it("replaces, removes, and saves pairing existing properties without mutating nested values", () => {
    const replacement = {
      ...existingProperty,
      name: "Replacement Property",
      tiers: createPairingTierOptions(["T3"]),
    };
    const pendingProperty = {
      ...existingProperty,
      id: "pending-property",
      tiers: createPairingTierOptions(["T2"]),
    };

    expect(replacePairingExistingPropertyById([existingProperty], replacement)).toEqual([replacement]);
    expect(removePairingExistingPropertyById([existingProperty, pendingProperty], existingProperty.id)).toEqual([
      pendingProperty,
    ]);

    const saved = buildSavedPairingExistingPropertiesAfterAdd(
      [existingProperty, pendingProperty],
      pendingProperty.id,
      "saved-property-key",
    );

    expect(saved[1]).toMatchObject({ id: "saved-property-key" });
    expect(saved[1]?.bid).not.toBe(pendingProperty.bid);
    expect(saved[1]?.tiers).not.toBe(pendingProperty.tiers);
    expect(saved[1]?.effectiveDateRange).not.toBe(pendingProperty.effectiveDateRange);
  });

  it("builds a search preview property with cloned nested fields", () => {
    const preview = buildPairingSearchPreviewProperty(availableProperty);

    expect(preview).toEqual({
      favoriteKey: "favorite-131",
      propertyId: 700131,
      propertyCode: 131,
      name: "Prefer Pairing Length",
      action: "award",
      quantifier: null,
      bid: { type: "stepper", value: 3, min: 1, max: 7 },
      tiers: [{ key: "T1", label: "T1", active: true }],
      favorited: true,
      pairingNumber: "M4959",
      pairingType: "Domestic",
      effectiveDateRange: {
        from: "2026-04-01",
        to: "2026-04-30",
      },
    });
    expect(preview.bid).not.toBe(availableProperty.bid);
    expect(preview.tiers).not.toBe(availableProperty.tiers);
    expect(preview.effectiveDateRange).not.toBe(availableProperty.effectiveDateRange);
  });

  it("deep-clones search criteria items", () => {
    const item: PairingSearchCriteriaItem = {
      id: "criteria-131-1",
      favoriteKey: "favorite-131",
      propertyId: 700131,
      propertyCode: 131,
      name: "Prefer Pairing Length",
      action: "award",
      quantifier: null,
      bid: { type: "stepper", value: 3, min: 1, max: 7 },
      tiers: [{ key: "T1", label: "T1", active: true }],
      favorited: true,
      pairingNumber: "M4959",
      pairingType: "Domestic",
      effectiveDateRange: {
        from: "2026-04-01",
        to: "2026-04-30",
      },
    };

    const clone = cloneSearchCriteriaItem(item);

    expect(clone).toEqual(item);
    expect(clone).not.toBe(item);
    expect(clone.bid).not.toBe(item.bid);
    expect(clone.tiers).not.toBe(item.tiers);
    expect(clone.effectiveDateRange).not.toBe(item.effectiveDateRange);
  });
});
