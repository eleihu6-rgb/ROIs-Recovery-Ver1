import { describe, expect, it } from "vitest";
import {
  buildPairingAvailablePropertiesPage,
  buildPairingPaginationItems,
  buildPairingTotalPages,
  clampPairingPage,
  doPairingDateRangesOverlap,
  filterPairingAvailableProperties,
} from "@/features/pairing/pairing-property-list";
import type {
  PairingAvailableProperty,
  PairingSearchForm,
} from "@/features/pairing/types";

const defaultSearchForm: PairingSearchForm = {
  pairingNumber: "",
  pairingType: "All Types",
  dateFrom: "",
  dateTo: "",
};

const buildProperty = (
  overrides: Partial<PairingAvailableProperty>,
): PairingAvailableProperty => ({
  id: "available-131",
  propertyCode: 131,
  name: "Prefer Pairing Length",
  favorited: false,
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
  ...overrides,
});

describe("pairing property list helpers", () => {
  it("builds compact pagination windows", () => {
    expect(buildPairingPaginationItems(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(buildPairingPaginationItems(5, 10)).toEqual([
      1,
      "ellipsis-start",
      4,
      5,
      6,
      "ellipsis-end",
      10,
    ]);
    expect(buildPairingPaginationItems(1, 10)).toEqual([1, 2, "ellipsis-end", 10]);
    expect(buildPairingPaginationItems(10, 10)).toEqual([1, "ellipsis-start", 9, 10]);
  });

  it("builds available property pages and clamps requested page numbers", () => {
    const properties = Array.from({ length: 23 }, (_, index) =>
      buildProperty({
        id: `property-${index + 1}`,
        propertyCode: 200 + index,
      }),
    );

    expect(clampPairingPage(0, 3)).toBe(1);
    expect(clampPairingPage(5, 3)).toBe(3);
    expect(buildPairingTotalPages(0, 10)).toBe(1);
    expect(buildPairingTotalPages(21, 10)).toBe(3);
    expect(buildPairingAvailablePropertiesPage(properties, 2, 10)).toMatchObject({
      totalItems: 23,
      totalPages: 3,
    });
    expect(buildPairingAvailablePropertiesPage(properties, 2, 10).items.map((property) => property.id)).toEqual([
      "property-11",
      "property-12",
      "property-13",
      "property-14",
      "property-15",
      "property-16",
      "property-17",
      "property-18",
      "property-19",
      "property-20",
    ]);
  });

  it("keeps the existing date overlap semantics", () => {
    expect(doPairingDateRangesOverlap("2026-04-01", "2026-04-30", "", "")).toBe(true);
    expect(doPairingDateRangesOverlap("2026-04-01", "2026-04-30", "2026-04-15", "")).toBe(true);
    expect(doPairingDateRangesOverlap("2026-04-01", "2026-04-30", "", "2026-04-15")).toBe(true);
    expect(doPairingDateRangesOverlap("2026-04-01", "2026-04-30", "2026-05-01", "2026-05-31")).toBe(false);
    expect(doPairingDateRangesOverlap("", "", "2026-05-01", "2026-05-31")).toBe(true);
  });

  it("filters available properties by tab, keyword, pairing number, type, and date", () => {
    const properties = [
      buildProperty({ id: "domestic-length", source: "catalog", favorited: false, recommendedSortOrder: 1 }),
      buildProperty({ id: "favorite-length", source: "favorite", favorited: true }),
      buildProperty({
        id: "international-layover",
        name: "Layover at City",
        pairingNumber: "I7101",
        pairingType: "International",
        effectiveDateRange: {
          from: "2026-05-01",
          to: "2026-05-31",
        },
      }),
      buildProperty({
        id: "domestic-credit",
        name: "Minimum Credit",
        pairingNumber: "M5000",
      }),
      buildProperty({
        id: "catalog-only-property",
        name: "Pairing Number",
        pairingNumber: "",
        pairingType: "All Types",
        effectiveDateRange: {
          from: "",
          to: "",
        },
      }),
    ];

    expect(filterPairingAvailableProperties(
      properties,
      "favorited",
      "",
      defaultSearchForm,
    ).map((property) => property.id)).toEqual(["favorite-length"]);

    expect(filterPairingAvailableProperties(
      properties,
      "all",
      " layover ",
      defaultSearchForm,
    ).map((property) => property.id)).toEqual(["international-layover"]);

    expect(filterPairingAvailableProperties(
      properties,
      "all",
      "",
      { ...defaultSearchForm, pairingNumber: "m49" },
    ).map((property) => property.id)).toEqual(["domestic-length"]);

    expect(filterPairingAvailableProperties(
      properties,
      "all",
      "",
      {
        ...defaultSearchForm,
        pairingType: "International",
        dateFrom: "2026-05-10",
        dateTo: "2026-05-20",
      },
    ).map((property) => property.id)).toEqual(["international-layover"]);

    expect(filterPairingAvailableProperties(
      properties,
      "all",
      "",
      { ...defaultSearchForm, dateFrom: "2026-05-10", dateTo: "2026-05-20" },
    ).map((property) => property.id)).toEqual(["international-layover", "catalog-only-property"]);
  });

  it("keeps recommended properties first only in all properties results", () => {
    const properties = [
      buildProperty({ id: "minimum-credit", propertyCode: 151, name: "Pairing Credit" }),
      buildProperty({
        id: "pairing-number",
        propertyCode: 102,
        name: "Pairing Number",
        favorited: false,
        recommendedSortOrder: 1,
      }),
      buildProperty({ id: "layover", propertyCode: 150, name: "Pairing Layover" }),
      buildProperty({
        id: "favorite-pairing-number",
        source: "favorite",
        favorited: true,
        propertyCode: 102,
        name: "Pairing Number",
      }),
      buildProperty({
        id: "favorite-credit",
        source: "favorite",
        favorited: true,
        propertyCode: 151,
        name: "Minimum Credit",
      }),
    ];

    expect(filterPairingAvailableProperties(
      properties,
      "all",
      "",
      defaultSearchForm,
    ).map((property) => property.id)).toEqual(["pairing-number", "minimum-credit", "layover"]);

    expect(filterPairingAvailableProperties(
      properties,
      "all",
      "pairing",
      defaultSearchForm,
    ).map((property) => property.id)).toEqual(["pairing-number", "minimum-credit", "layover"]);

    expect(filterPairingAvailableProperties(
      properties,
      "favorited",
      "",
      defaultSearchForm,
    ).map((property) => property.id)).toEqual(["favorite-pairing-number", "favorite-credit"]);
  });
});
