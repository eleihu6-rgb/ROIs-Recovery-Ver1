import assert from "node:assert/strict";
import test from "node:test";
import {
  cloneDaysOffPropertyCatalogContext,
  filterVisibleDaysOffPropertyCatalog,
  type DaysOffPropertyCatalogContext,
} from "./days-off-property-catalog.js";

const buildCatalogContext = (): DaysOffPropertyCatalogContext => {
  const visibleProperty: DaysOffPropertyCatalogContext["catalog"][number] = {
    propertyCode: 201,
    name: "Prefer Off",
    defaultBid: {
      type: "select",
      value: "Sat",
      options: ["Sat", "Sun"],
    },
  };
  const hiddenProperty: DaysOffPropertyCatalogContext["catalog"][number] = {
    propertyCode: 211,
    name: "Minimum Days Off Between Work Blocks",
    defaultBid: { type: "flag" },
  };

  return {
    catalog: [visibleProperty],
    catalogByCode: new Map([
      [visibleProperty.propertyCode, visibleProperty],
      [hiddenProperty.propertyCode, hiddenProperty],
    ]),
    propertyIdentityByCode: new Map([
      [201, { propertyCode: 201, propertyDefinitionId: 700201 }],
      [211, { propertyCode: 211, propertyDefinitionId: 700211 }],
    ]),
    recommendedPropertyCodes: [201],
    recommendedOrderByCode: new Map([[201, 1]]),
  };
};

test("cloneDaysOffPropertyCatalogContext clones catalog once and maps by cloned entries", () => {
  const sourceContext = buildCatalogContext();
  const clonedContext = cloneDaysOffPropertyCatalogContext(sourceContext);
  const clonedProperty = clonedContext.catalog[0];

  assert.deepEqual(clonedContext.catalog, sourceContext.catalog);
  assert.notEqual(clonedProperty, sourceContext.catalog[0]);
  assert.equal(clonedContext.catalogByCode.get(201), clonedProperty);
  assert.notEqual(clonedContext.catalogByCode.get(211), sourceContext.catalogByCode.get(211));
  assert.notEqual(clonedProperty?.defaultBid, sourceContext.catalog[0]?.defaultBid);
  assert.deepEqual(clonedContext.recommendedPropertyCodes, [201]);
  assert.notEqual(clonedContext.recommendedPropertyCodes, sourceContext.recommendedPropertyCodes);
  assert.deepEqual(Array.from(clonedContext.recommendedOrderByCode.entries()), [[201, 1]]);
  assert.notEqual(clonedContext.recommendedOrderByCode, sourceContext.recommendedOrderByCode);

  const sourceProperty = sourceContext.catalog[0];

  if (clonedProperty?.defaultBid.type === "select" && sourceProperty?.defaultBid.type === "select") {
    assert.notEqual(clonedProperty.defaultBid.options, sourceProperty.defaultBid.options);
  }
});

test("filterVisibleDaysOffPropertyCatalog returns the catalog already resolved by database visibility", () => {
  const sourceContext = buildCatalogContext();

  assert.deepEqual(
    filterVisibleDaysOffPropertyCatalog(sourceContext.catalog).map((property) => property.propertyCode),
    [201],
  );
});
