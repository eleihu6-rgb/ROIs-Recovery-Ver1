import assert from "node:assert/strict";
import test from "node:test";
import {
  clonePairingPropertyCatalogContext,
  type PairingPropertyCatalogContext,
} from "./pairing-property-catalog.js";

const buildCatalogContext = (): PairingPropertyCatalogContext => ({
  catalog: [
    {
      propertyCode: 132,
      name: "Prefer Pairing Length",
      defaultAction: "award",
      defaultBid: {
        type: "stepper",
        value: 3,
        min: 1,
        max: 7,
      },
      supportedActions: ["award", "avoid"],
      supportedOperators: ["=", "<", ">"],
      supportedQuantifiers: ["any", "every"],
      defaultQuantifier: "any",
    },
  ],
  catalogByCode: new Map([
    [
      132,
      {
        propertyCode: 132,
        name: "Prefer Pairing Length",
        defaultAction: "award",
        defaultBid: {
          type: "stepper",
          value: 3,
          min: 1,
          max: 7,
        },
        supportedActions: ["award", "avoid"],
        supportedOperators: ["=", "<", ">"],
        supportedQuantifiers: ["any", "every"],
        defaultQuantifier: "any",
      },
    ],
    [
      162,
      {
        propertyCode: 162,
        name: "Prefer Positions Order",
        defaultBid: {
          type: "select",
          value: "04,02,01,03",
          options: ["04,02,01,03", "01,02"],
        },
      },
    ],
  ]),
  propertyIdentityByCode: new Map([
    [132, { propertyCode: 132, propertyDefinitionId: 700132 }],
  ]),
  recommendedPropertyCodes: [132],
  recommendedOrderByCode: new Map([[132, 1]]),
});

test("clonePairingPropertyCatalogContext clones catalog fields and maps by cloned entries", () => {
  const sourceContext = buildCatalogContext();
  const clonedContext = clonePairingPropertyCatalogContext(sourceContext);
  const clonedProperty = clonedContext.catalog[0];
  const sourceProperty = sourceContext.catalog[0];

  assert.deepEqual(clonedContext.catalog, sourceContext.catalog);
  assert.notEqual(clonedProperty, sourceProperty);
  assert.equal(clonedContext.catalogByCode.get(132), clonedProperty);
  assert.notEqual(clonedContext.catalogByCode.get(162), sourceContext.catalogByCode.get(162));
  assert.notEqual(clonedProperty?.defaultBid, sourceProperty?.defaultBid);
  assert.equal(clonedProperty?.defaultAction, "award");
  assert.notEqual(clonedProperty?.supportedActions, sourceProperty?.supportedActions);
  assert.notEqual(clonedProperty?.supportedOperators, sourceProperty?.supportedOperators);
  assert.notEqual(clonedProperty?.supportedQuantifiers, sourceProperty?.supportedQuantifiers);
  assert.deepEqual(clonedContext.recommendedPropertyCodes, [132]);
  assert.notEqual(clonedContext.recommendedPropertyCodes, sourceContext.recommendedPropertyCodes);
  assert.deepEqual(Array.from(clonedContext.recommendedOrderByCode.entries()), [[132, 1]]);
  assert.notEqual(clonedContext.recommendedOrderByCode, sourceContext.recommendedOrderByCode);
});
