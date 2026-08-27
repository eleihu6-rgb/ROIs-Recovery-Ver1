import { describe, expect, it } from "vitest";
import {
  arePairingExistingPropertiesEqual,
  arePairingTierOptionsEqual,
  arePairingSearchCriteriaItemsEqual,
} from "@/features/pairing/pairing-property-equality";
import type {
  PairingExistingProperty,
  PairingSearchCriteriaItem,
} from "@/features/pairing/types";

const buildProperty = (
  overrides: Partial<PairingExistingProperty> = {},
): PairingExistingProperty => ({
  id: "existing-131-1",
  propertyCode: 131,
  name: "Prefer Pairing Length",
  action: "award",
  quantifier: null,
  bid: { type: "stepper", value: 3, min: 1, max: 7 },
  tiers: [
    { key: "T1", label: "T1", active: true },
    { key: "T2", label: "T2" },
  ],
  priorityOptions: ["Prefer Pairing Length"],
  pairingNumber: "M4959",
  pairingType: "Domestic",
  effectiveDateRange: {
    from: "2026-04-01",
    to: "2026-04-30",
  },
  ...overrides,
});

const buildCriteriaItem = (
  overrides: Partial<PairingSearchCriteriaItem> = {},
): PairingSearchCriteriaItem => ({
  id: "criteria-131-1",
  favoriteKey: "favorite-131",
  propertyId: 700131,
  propertyCode: 131,
  name: "Prefer Pairing Length",
  action: "award",
  quantifier: null,
  bid: { type: "stepper", value: 3, min: 1, max: 7 },
  tiers: [
    { key: "T1", label: "T1", active: true },
    { key: "T2", label: "T2" },
  ],
  favorited: true,
  pairingNumber: "M4959",
  pairingType: "Domestic",
  effectiveDateRange: {
    from: "2026-04-01",
    to: "2026-04-30",
  },
  ...overrides,
});

describe("pairing property equality helpers", () => {
  it("treats cloned existing properties as equal", () => {
    const property = buildProperty();

    expect(arePairingExistingPropertiesEqual([property], [structuredClone(property)])).toBe(true);
  });

  it("detects bid, tier, and ordering changes", () => {
    const property = buildProperty();

    expect(arePairingExistingPropertiesEqual([property], [
      buildProperty({ bid: { type: "stepper", value: 4, min: 1, max: 7 } }),
    ])).toBe(false);

    expect(arePairingExistingPropertiesEqual([property], [
      buildProperty({
        tiers: [
          { key: "T1", label: "T1" },
          { key: "T2", label: "T2", active: true },
        ],
      }),
    ])).toBe(false);

    expect(arePairingExistingPropertiesEqual([property, buildProperty({ id: "existing-132-2" })], [
      buildProperty({ id: "existing-132-2" }),
      property,
    ])).toBe(false);
  });

  it("preserves explicit tier active semantics", () => {
    expect(arePairingTierOptionsEqual(
      [{ key: "T1", label: "T1" }],
      [{ key: "T1", label: "T1", active: false }],
    )).toBe(false);
  });

  it("compares search criteria items without serializing the entire array", () => {
    const item = buildCriteriaItem();

    expect(arePairingSearchCriteriaItemsEqual([item], [structuredClone(item)])).toBe(true);
    expect(arePairingSearchCriteriaItemsEqual([item], [
      buildCriteriaItem({ favorited: false }),
    ])).toBe(false);
    expect(arePairingSearchCriteriaItemsEqual([item], [
      buildCriteriaItem({
        effectiveDateRange: {
          from: "2026-04-02",
          to: "2026-04-30",
        },
      }),
    ])).toBe(false);
  });
});
