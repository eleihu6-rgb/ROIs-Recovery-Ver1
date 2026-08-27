import assert from "node:assert/strict";
import test from "node:test";
import { validateSchemaName } from "./schema-identifier.js";

test("validateSchemaName accepts lowercase schema identifiers", () => {
  assert.equal(validateSchemaName("f8", "live schema name"), "f8");
  assert.equal(validateSchemaName("f8_pbs", "PBS schema name"), "f8_pbs");
});

test("validateSchemaName rejects unsafe or uppercase schema identifiers", () => {
  assert.throws(
    () => validateSchemaName("F8", "live schema name"),
    /Invalid live schema name: F8/,
  );
  assert.throws(
    () => validateSchemaName("f8-pbs", "PBS schema name"),
    /Invalid PBS schema name: f8-pbs/,
  );
  assert.throws(
    () => validateSchemaName("1f8", "live schema name"),
    /Invalid live schema name: 1f8/,
  );
});
