import assert from "node:assert/strict";
import test from "node:test";
import {
  assertConfiguredFavoriteCanBeSaved,
  FAVORITE_EXPLICIT_DATE_ERROR_MESSAGE,
} from "./favorite-eligibility.js";

class TestFavoriteError extends Error {
  readonly statusCode = 400;
}

const createError = (message: string) => new TestFavoriteError(message);

test("configured favorite guard rejects an explicit date before persistence", () => {
  assert.throws(
    () => assertConfiguredFavoriteCanBeSaved(
      { type: "date", value: "2026-08-03" },
      { kind: "generic" },
      createError,
    ),
    (error: unknown) => error instanceof TestFavoriteError
      && error.statusCode === 400
      && error.message === FAVORITE_EXPLICIT_DATE_ERROR_MESSAGE,
  );
});

test("configured favorite guard allows reusable recurring settings", () => {
  assert.doesNotThrow(() => assertConfiguredFavoriteCanBeSaved(
    { type: "date-or-dow-list", dates: [], daysOfWeek: ["MON", "FRI"] },
    { kind: "generic" },
    createError,
  ));
});
