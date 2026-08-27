import assert from "node:assert/strict";
import test from "node:test";
import {
  pbsStandingLineholderPropertyRegistry,
  pbsStandingReservePropertyRegistry,
} from "./pbs-standing-bids.js";

test("Standing registries describe available editors without deciding database visibility", () => {
  const lineholderRegistryByCode = new Map(
    pbsStandingLineholderPropertyRegistry.map((property) => [property.propertyCode, property]),
  );

  assert.equal(lineholderRegistryByCode.get(201)?.bidType, "DaysOff");
  assert.equal(lineholderRegistryByCode.get(204)?.bidType, "DaysOff");
  assert.equal(lineholderRegistryByCode.get(218)?.bidType, "DaysOff");
  assert.equal(lineholderRegistryByCode.get(102)?.bidType, "Pairing");
  assert.equal(lineholderRegistryByCode.get(168)?.bidType, "Pairing");
  assert.equal(lineholderRegistryByCode.get(410)?.bidType, "Line");
  assert.equal(lineholderRegistryByCode.get(427)?.bidType, "Line");
  assert.equal(lineholderRegistryByCode.get(427)?.name, "Reserve");
  assert.deepEqual(lineholderRegistryByCode.get(427)?.defaultBid, { type: "flag" });
  assert.equal(lineholderRegistryByCode.get(427)?.defaultAction, "award");
  assert.deepEqual(lineholderRegistryByCode.get(427)?.supportedActions, ["award", "avoid"]);
});

test("Standing weekday editor defaults never contain concrete dates", () => {
  for (const property of [
    ...pbsStandingLineholderPropertyRegistry,
    ...pbsStandingReservePropertyRegistry,
  ]) {
    if (property.defaultBid.type === "date-or-dow-list") {
      assert.deepEqual(property.defaultBid.dates, []);
    }
  }
});

test("Reserve Standing registry includes existing and future database-toggleable editors", () => {
  assert.deepEqual(
    pbsStandingReservePropertyRegistry
      .map((property) => property.propertyCode)
      .sort((left, right) => left - right),
    [301, 302, 311, 312, 313, 314],
  );
});

test("Standing Reserve registry keeps Line Reserve hidden from reserve-only mode", () => {
  assert.equal(
    pbsStandingReservePropertyRegistry.some((property) => property.propertyCode === 427),
    false,
  );
});
