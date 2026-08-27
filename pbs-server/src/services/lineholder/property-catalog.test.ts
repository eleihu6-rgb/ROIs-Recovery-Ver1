import assert from "node:assert/strict";
import test from "node:test";
import {
  resolvePropertyCatalogByContext,
  resolveRecommendedPropertyCodes,
} from "./property-catalog.js";

const createCatalogDb = (rows: Record<string, unknown>[]) => ({
  select() {
    return {
      from() {
        return this;
      },
      leftJoin() {
        return this;
      },
      where() {
        return this;
      },
      orderBy() {
        return Promise.resolve(rows);
      },
    };
  },
}) as unknown as Parameters<typeof resolvePropertyCatalogByContext>[0];

test("resolveRecommendedPropertyCodes keeps visible supported defaults ordered by configured rank", () => {
  const supportedPropertyCodes = new Set([101, 102, 103, 105]);

  assert.deepEqual(
    resolveRecommendedPropertyCodes(
      [
        { propertyCode: 105, isVisibleInPortal: 1, recommendedOrder: 3 },
        { propertyCode: 101, isVisibleInPortal: 1, recommendedOrder: 2 },
        { propertyCode: 102, isVisibleInPortal: 1, recommendedOrder: 1 },
        { propertyCode: 103, isVisibleInPortal: 0, recommendedOrder: 4 },
        { propertyCode: 999, isVisibleInPortal: 1, recommendedOrder: 5 },
        { propertyCode: 104, isVisibleInPortal: 1, recommendedOrder: null },
      ],
      supportedPropertyCodes,
    ),
    [102, 101, 105],
  );
});

test("context visibility controls the catalog without removing hidden saved-property definitions", async () => {
  const db = createCatalogDb([
    {
      propertyDefinitionId: 10,
      propertyCode: 102,
      bidType: "Pairing",
      propertyName: "Pairing Preference",
      recommendedOrder: 1,
      contextId: 100,
      isVisibleInPortal: 0,
      contextDisplayOrder: 1,
    },
    {
      propertyDefinitionId: 11,
      propertyCode: 168,
      bidType: "Pairing",
      propertyName: "Airport Preference",
      recommendedOrder: 2,
      contextId: 101,
      isVisibleInPortal: 1,
      contextDisplayOrder: 2,
    },
  ]);

  const result = await resolvePropertyCatalogByContext(db, {
    bidTypes: ["Pairing"],
    bidContext: "StandingLineholder",
    propertyRegistry: [
      { propertyCode: 102, name: "Pairing Preference" },
      { propertyCode: 168, name: "Airport Preference" },
    ],
    clonePropertyDefinition: (property) => ({ ...property }),
  });

  assert.deepEqual(result.catalog.map((property) => property.propertyCode), [168]);
  assert.deepEqual([...result.catalogByCode.keys()], [102, 168]);
  assert.deepEqual([...result.propertyIdentityByCode.keys()], [102, 168]);
  assert.deepEqual(result.recommendedPropertyCodes, [168]);
});

test("a visible database property without a registered editor fails as a configuration error", async () => {
  const db = createCatalogDb([
    {
      propertyDefinitionId: 12,
      propertyCode: 999,
      bidType: "Pairing",
      propertyName: "Unregistered Property",
      recommendedOrder: null,
      contextId: 102,
      isVisibleInPortal: 1,
      contextDisplayOrder: 1,
    },
  ]);

  await assert.rejects(
    () => resolvePropertyCatalogByContext(db, {
      bidTypes: ["Pairing"],
      bidContext: "Current",
      propertyRegistry: [{ propertyCode: 998, name: "Other Registered Property" }],
      clonePropertyDefinition: (property) => ({ ...property }),
    }),
    /visible in Current but has no registered editor/,
  );
});

test("an active database property without a context row fails instead of falling back to a global flag", async () => {
  const db = createCatalogDb([
    {
      propertyDefinitionId: 13,
      propertyCode: 168,
      bidType: "Pairing",
      propertyName: "Airport Preference",
      recommendedOrder: null,
      contextId: null,
      isVisibleInPortal: null,
      contextDisplayOrder: null,
    },
  ]);

  await assert.rejects(
    () => resolvePropertyCatalogByContext(db, {
      bidTypes: ["Pairing"],
      bidContext: "StandingLineholder",
      propertyRegistry: [{ propertyCode: 168, name: "Airport Preference" }],
      clonePropertyDefinition: (property) => ({ ...property }),
    }),
    /missing StandingLineholder visibility configuration/,
  );
});

test("a visible inactive property fails instead of disappearing silently", async () => {
  const db = createCatalogDb([
    {
      propertyDefinitionId: 14,
      propertyCode: 168,
      bidType: "Pairing",
      propertyName: "Airport Preference",
      isActive: 0,
      recommendedOrder: null,
      contextId: 104,
      isVisibleInPortal: 1,
      contextDisplayOrder: 1,
    },
  ]);

  await assert.rejects(
    () => resolvePropertyCatalogByContext(db, {
      bidTypes: ["Pairing"],
      bidContext: "Current",
      propertyRegistry: [{ propertyCode: 168, name: "Airport Preference" }],
      clonePropertyDefinition: (property) => ({ ...property }),
    }),
    /visible in Current but inactive/,
  );
});
