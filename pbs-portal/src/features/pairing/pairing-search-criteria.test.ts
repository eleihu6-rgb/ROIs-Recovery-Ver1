import { describe, expect, it } from "vitest";
import { pairingPropertyPriorityOptions } from "@/features/pairing/pairing-property-catalog";
import {
  buildPairingAvailablePropertyFromSearchCriteria,
  buildPairingExistingPropertyFromSearchCriteria,
  buildPairingSearchCriteriaItemFromDialogDraft,
  buildPairingSearchTierOptionsForLabel,
  buildPairingSearchCriteriaItemFromAvailableProperty,
  buildPairingSearchCriteriaItemFromPreviewProperty,
  buildPairingSearchFallbackTierOptions,
  buildPairingSearchPickerProperties,
  getPairingCurrentRulesTierLabels,
  resolvePairingCurrentRulesTier,
} from "@/features/pairing/pairing-search-criteria";
import type {
  PairingAvailableProperty,
  PairingSearchPreviewProperty,
} from "@/features/pairing/types";

const availableProperty: PairingAvailableProperty = {
  id: "available-131",
  favoriteKey: "favorite-131",
  propertyId: 700131,
  propertyCode: 131,
  name: "Prefer Pairing Length",
  favorited: true,
  action: "award",
  quantifier: null,
  bid: { type: "stepper", value: 3, min: 1, max: 7 },
  tiers: [{ key: "t4", label: "T4", active: true }],
  actions: ["add", "preview"],
  pairingNumber: "M4959",
  pairingType: "Domestic",
  effectiveDateRange: {
    from: "2026-04-01",
    to: "2026-04-30",
  },
};

const unsupportedAvailableProperty: PairingAvailableProperty = {
  ...availableProperty,
  id: "available-999",
  favoriteKey: "favorite-999",
  propertyId: 700999,
  propertyCode: 999,
  name: "Unsupported Property",
};

describe("pairing search criteria helpers", () => {
  it("builds fallback T1 tier options", () => {
    expect(buildPairingSearchFallbackTierOptions()).toEqual([
      { key: "t1", label: "T1", active: true },
      { key: "t2", label: "T2", active: false },
      { key: "t3", label: "T3", active: false },
      { key: "t4", label: "T4", active: false },
      { key: "t5", label: "T5", active: false },
      { key: "t6", label: "T6", active: false },
      { key: "t7", label: "T7", active: false },
    ]);
  });

  it("builds tier options for the requested active label", () => {
    expect(buildPairingSearchTierOptionsForLabel("T3")).toEqual([
      { key: "t1", label: "T1", active: false },
      { key: "t2", label: "T2", active: false },
      { key: "t3", label: "T3", active: true },
      { key: "t4", label: "T4", active: false },
      { key: "t5", label: "T5", active: false },
      { key: "t6", label: "T6", active: false },
      { key: "t7", label: "T7", active: false },
    ]);
  });

  it("builds search criteria from preview properties with cloned nested fields and defaults", () => {
    const previewProperty: PairingSearchPreviewProperty = {
      favoriteKey: "favorite-132",
      propertyId: 700132,
      propertyCode: 132,
      name: "Avoid Aircraft Changes",
      action: "avoid",
      quantifier: "any",
      bid: { type: "tag-list", values: ["DFW"], suggestions: ["DFW", "LAX"] },
    };

    const criteriaItem = buildPairingSearchCriteriaItemFromPreviewProperty(previewProperty);

    expect(criteriaItem).toEqual({
      id: "preview-132",
      favoriteKey: "favorite-132",
      propertyId: 700132,
      propertyCode: 132,
      name: "Avoid Aircraft Changes",
      action: "avoid",
      quantifier: "any",
      bid: { type: "tag-list", values: ["DFW"], suggestions: ["DFW", "LAX"] },
      tiers: buildPairingSearchFallbackTierOptions(),
      favorited: false,
      pairingNumber: "",
      pairingType: "",
      effectiveDateRange: { from: "", to: "" },
    });
    expect(criteriaItem.bid).not.toBe(previewProperty.bid);
  });

  it("builds search criteria from available properties with fallback tiers", () => {
    const criteriaItem = buildPairingSearchCriteriaItemFromAvailableProperty(availableProperty, 2);

    expect(criteriaItem).toEqual({
      id: "criteria-131-3",
      favoriteKey: "favorite-131",
      propertyId: 700131,
      propertyCode: 131,
      name: "Prefer Pairing Length",
      action: "award",
      quantifier: null,
      bid: { type: "stepper", value: 3, min: 1, max: 7 },
      tiers: buildPairingSearchFallbackTierOptions(),
      favorited: true,
      pairingNumber: "M4959",
      pairingType: "Domestic",
      effectiveDateRange: {
        from: "2026-04-01",
        to: "2026-04-30",
      },
    });
    expect(criteriaItem.bid).not.toBe(availableProperty.bid);
    expect(criteriaItem.tiers).not.toBe(availableProperty.tiers);
    expect(criteriaItem.effectiveDateRange).not.toBe(availableProperty.effectiveDateRange);
  });

  it("round-trips search criteria through the configure dialog draft shape", () => {
    const criteriaItem = buildPairingSearchCriteriaItemFromAvailableProperty(availableProperty, 0);
    const dialogProperty = buildPairingAvailablePropertyFromSearchCriteria(criteriaItem);

    expect(dialogProperty).toEqual({
      ...availableProperty,
      id: "criteria-131-1",
      source: "favorite",
      tiers: buildPairingSearchFallbackTierOptions(),
      actions: ["add", "preview"],
    });
    expect(dialogProperty.bid).not.toBe(criteriaItem.bid);
    expect(dialogProperty.tiers).not.toBe(criteriaItem.tiers);
    expect(dialogProperty.effectiveDateRange).not.toBe(criteriaItem.effectiveDateRange);

    const updatedCriteriaItem = buildPairingSearchCriteriaItemFromDialogDraft(criteriaItem, {
      ...dialogProperty,
      action: "avoid",
      bid: { type: "stepper", value: 5, min: 1, max: 7 },
      tiers: buildPairingSearchTierOptionsForLabel("T5"),
      pairingNumber: "M5000",
      pairingType: "International",
      effectiveDateRange: { from: "2026-05-01", to: "2026-05-31" },
    });

    expect(updatedCriteriaItem).toEqual({
      ...criteriaItem,
      action: "avoid",
      bid: { type: "stepper", value: 5, min: 1, max: 7 },
      tiers: buildPairingSearchTierOptionsForLabel("T5"),
      pairingNumber: "M5000",
      pairingType: "International",
      effectiveDateRange: { from: "2026-05-01", to: "2026-05-31" },
    });
    expect(updatedCriteriaItem.bid).not.toBe(dialogProperty.bid);
    expect(updatedCriteriaItem.tiers).not.toBe(dialogProperty.tiers);
    expect(updatedCriteriaItem.effectiveDateRange).not.toBe(dialogProperty.effectiveDateRange);
  });

  it("builds picker properties from the base catalog with supported-code filtering, tabs, and query search", () => {
    const pairingNumberProperty: PairingAvailableProperty = {
      ...availableProperty,
      id: "available-102",
      propertyCode: 102,
      name: "Pairing Number",
      favorited: false,
    };
    const carryOutProperty: PairingAvailableProperty = {
      ...availableProperty,
      id: "available-163",
      propertyCode: 163,
      name: "Month-End Carryover",
      favorited: false,
    };
    const workStartStationProperty: PairingAvailableProperty = {
      ...availableProperty,
      id: "available-165",
      propertyCode: 165,
      name: "Work Start Station",
      favorited: false,
    };
    const airportPreferenceProperty: PairingAvailableProperty = {
      ...availableProperty,
      id: "available-168",
      propertyCode: 168,
      name: "Airport Preference",
      bid: { type: "airport-preference", event: "layover", locations: [], dateScope: null, minimumLayoverDuration: null },
      favorited: false,
    };

    const allProperties = buildPairingSearchPickerProperties(
      [
        availableProperty,
        unsupportedAvailableProperty,
        pairingNumberProperty,
        carryOutProperty,
        workStartStationProperty,
        airportPreferenceProperty,
      ],
      "",
      "all",
    );

    expect(allProperties.map((property) => property.propertyCode)).toEqual([131, 102, 163, 165, 168]);
    expect(allProperties[1].id).toBe("available-102");

    expect(
      buildPairingSearchPickerProperties([availableProperty], "length", "all")
        .map((property) => property.propertyCode),
    ).toEqual([131]);
    expect(
      buildPairingSearchPickerProperties([pairingNumberProperty], "102", "all")
        .map((property) => property.propertyCode),
    ).toEqual([102]);
    expect(
      buildPairingSearchPickerProperties([carryOutProperty], "month-end", "all")
        .map((property) => property.propertyCode),
    ).toEqual([163]);
    expect(
      buildPairingSearchPickerProperties([workStartStationProperty], "work start", "all")
        .map((property) => property.propertyCode),
    ).toEqual([165]);
    expect(
      buildPairingSearchPickerProperties([airportPreferenceProperty], "airport", "all")
        .map((property) => property.propertyCode),
    ).toEqual([168]);
    expect(
      buildPairingSearchPickerProperties([availableProperty, pairingNumberProperty], "", "favorites")
        .map((property) => property.propertyCode),
    ).toEqual([131]);
  });

  it("builds existing properties from criteria with cloned nested fields", () => {
    const criteriaItem = {
      ...buildPairingSearchCriteriaItemFromAvailableProperty(availableProperty, 0),
      tiers: buildPairingSearchTierOptionsForLabel("T4"),
    };

    const existingProperty = buildPairingExistingPropertyFromSearchCriteria(criteriaItem, 3);

    expect(existingProperty).toEqual({
      id: "existing-search-131-4",
      propertyCode: 131,
      name: "Prefer Pairing Length",
      action: "award",
      quantifier: null,
      bid: { type: "stepper", value: 3, min: 1, max: 7 },
      tiers: buildPairingSearchTierOptionsForLabel("T4"),
      priorityOptions: pairingPropertyPriorityOptions,
      pairingNumber: "M4959",
      pairingType: "Domestic",
      effectiveDateRange: {
        from: "2026-04-01",
        to: "2026-04-30",
      },
    });
    expect(existingProperty.bid).not.toBe(criteriaItem.bid);
    expect(existingProperty.tiers).not.toBe(criteriaItem.tiers);
    expect(existingProperty.priorityOptions).not.toBe(pairingPropertyPriorityOptions);
    expect(existingProperty.effectiveDateRange).not.toBe(criteriaItem.effectiveDateRange);
  });

  it("falls back to the matching template when criteria optional fields are empty", () => {
    const criteriaItem = {
      ...buildPairingSearchCriteriaItemFromAvailableProperty(availableProperty, 0),
      pairingNumber: "",
      pairingType: "",
      effectiveDateRange: { from: "", to: "" },
    };
    const template = {
      pairingNumber: "TEMPLATE-42",
      pairingType: "International",
      effectiveDateRange: { from: "2026-05-01", to: "2026-05-31" },
    };

    const existingProperty = buildPairingExistingPropertyFromSearchCriteria(
      criteriaItem,
      0,
      template,
    );

    expect(existingProperty.pairingNumber).toBe("TEMPLATE-42");
    expect(existingProperty.pairingType).toBe("International");
    expect(existingProperty.effectiveDateRange).toEqual({
      from: "2026-05-01",
      to: "2026-05-31",
    });
    expect(existingProperty.effectiveDateRange).not.toBe(template.effectiveDateRange);
  });

  it("resolves current-rules tiers with preferred tier fallback", () => {
    const l3Property = buildPairingExistingPropertyFromSearchCriteria(
      {
        ...buildPairingSearchCriteriaItemFromAvailableProperty(availableProperty, 0),
        id: "criteria-t3",
        tiers: buildPairingSearchTierOptionsForLabel("T3"),
      },
      0,
    );
    const l1Property = buildPairingExistingPropertyFromSearchCriteria(
      {
        ...buildPairingSearchCriteriaItemFromAvailableProperty(availableProperty, 1),
        id: "criteria-t1",
        tiers: buildPairingSearchTierOptionsForLabel("T1"),
      },
      1,
    );
    const tierLabels = getPairingCurrentRulesTierLabels([l3Property, l1Property]);

    expect(tierLabels).toEqual(["T1", "T3"]);
    expect(resolvePairingCurrentRulesTier(tierLabels, "T3")).toBe("T3");
    expect(resolvePairingCurrentRulesTier(tierLabels, "T5")).toBe("T1");
    expect(resolvePairingCurrentRulesTier([])).toBe("");
  });
});
