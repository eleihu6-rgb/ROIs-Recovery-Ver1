import test from "node:test";
import assert from "node:assert/strict";
import {
  expectedPbsUserNormalizationSchema,
  parsePbsUserNormalizationCommand,
} from "./normalize-pbs-user-effective-dates-core.js";

test("PBS user normalization defaults to read-only for an explicit environment", () => {
  assert.deepEqual(
    parsePbsUserNormalizationCommand(["--environment", "development"]),
    {
      apply: false,
      environment: "development",
      expectedCount: null,
    },
  );
});

test("PBS user normalization apply requires a non-negative expected count", () => {
  assert.deepEqual(
    parsePbsUserNormalizationCommand([
      "--environment",
      "sit",
      "--apply",
      "--expected-count",
      "612",
    ]),
    {
      apply: true,
      environment: "sit",
      expectedCount: 612,
    },
  );

  assert.throws(
    () => parsePbsUserNormalizationCommand(["--environment", "uat", "--apply"]),
    /--apply requires --expected-count/,
  );
  assert.throws(
    () => parsePbsUserNormalizationCommand([
      "--environment",
      "uat",
      "--apply",
      "--expected-count",
      "-1",
    ]),
  );
});

test("PBS user normalization rejects unknown environments and arguments", () => {
  assert.throws(
    () => parsePbsUserNormalizationCommand(["--environment", "prod"]),
  );
  assert.throws(
    () => parsePbsUserNormalizationCommand([
      "--environment",
      "development",
      "--force",
    ]),
    /Unsupported argument/,
  );
});

test("PBS user normalization maps each environment to its fixed schema", () => {
  assert.equal(expectedPbsUserNormalizationSchema("development"), "f8_pbs");
  assert.equal(expectedPbsUserNormalizationSchema("sit"), "f8_pbs");
  assert.equal(expectedPbsUserNormalizationSchema("uat"), "f8_pbs");
});
