import assert from "node:assert/strict";
import test from "node:test";
import { escapeCsvCell } from "./csv.js";

test("escapeCsvCell neutralizes spreadsheet formula prefixes for string values", () => {
  assert.equal(escapeCsvCell("=1+1"), "'=1+1");
  assert.equal(escapeCsvCell("+SUM(A1:A2)"), "'+SUM(A1:A2)");
  assert.equal(escapeCsvCell("-SUM(A1:A2)"), "'-SUM(A1:A2)");
  assert.equal(escapeCsvCell("@SUM(A1:A2)"), "'@SUM(A1:A2)");
  assert.equal(escapeCsvCell("  =1+1"), "'  =1+1");
  assert.equal(escapeCsvCell("\t=1+1"), "'\t=1+1");
});

test("escapeCsvCell preserves numbers and standard CSV quoting", () => {
  assert.equal(escapeCsvCell(-12), "-12");
  assert.equal(escapeCsvCell(null), "");
  assert.equal(escapeCsvCell("alpha,beta"), "\"alpha,beta\"");
  assert.equal(escapeCsvCell("alpha \"beta\""), "\"alpha \"\"beta\"\"\"");
  assert.equal(escapeCsvCell("=1,\"quoted\""), "\"'=1,\"\"quoted\"\"\"");
});
