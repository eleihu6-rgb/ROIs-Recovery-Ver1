import assert from "node:assert/strict";
import test from "node:test";

import {
  containsExplicitCalendarDate,
  pbsFavoriteDateSemanticContexts,
} from "./pbs-favorite-eligibility.js";

const generic = pbsFavoriteDateSemanticContexts.generic;
const preferOff = {
  kind: "prefer-off",
  preferOffConfig: {
    weekdays: [
      { code: "MON", name: "Monday", order: 1, isoDay: 1 },
      { code: "SAT", name: "Saturday", order: 6, isoDay: 6 },
    ],
    weekend: { available: true },
  },
};

test("favorite date classification rejects omitted and unknown semantic contexts", () => {
  assert.throws(
    () => containsExplicitCalendarDate({ type: "flag" }),
    /semantic context/i,
  );
  assert.throws(
    () => containsExplicitCalendarDate({ type: "flag" }, { kind: "unknown" }),
    /semantic context/i,
  );
});

test("favorite date classification recognizes direct and nested calendar dates", () => {
  const dateBoundBids = [
    { type: "date", value: "2026-06-02" },
    { type: "stepper-date", value: 3, date: "2026-06-02" },
    { type: "stepper-range-date", from: 2, to: 4, date: "2026-06-02" },
    { type: "stepper-date-range", value: 3, from: "2026-06-02", to: "" },
    { type: "days-off-on-pattern", minDaysOff: 4, minDaysOn: 4, maxDaysOn: 5, dateRange: { from: "2026-06-02", to: "2026-06-20" } },
    { type: "time-date", value: "14:00", date: "2026-06-02" },
    { type: "time-range-date", from: "14:00", to: "22:00", date: "2026-06-02" },
    { type: "date-range", from: "2026-06-02", to: "2026-06-20" },
    { type: "date-or-dow-list", dates: ["bad", "2026-06-02"], daysOfWeek: [] },
    { type: "work-day-preference", days: [], dateScope: { mode: "specific_dates", dates: ["2026-06-02"] } },
    { type: "airport-preference", event: "landing", locations: [], dateScope: { mode: "date_range", from: "2026-06-02", to: "2026-06-20" } },
    { type: "pairing-check-time", timeType: "check_in", operator: "=", value: "14:00", dateScope: { mode: "specific_dates", dates: ["2026-06-02"] } },
    { type: "flight-legs-per-duty", operator: "=", legs: 3, dateScope: { mode: "date_range", from: "2026-06-02", to: "2026-06-20" } },
    { type: "pairing-length-preference", minDays: 2, maxDays: null, dateScope: { mode: "specific_dates", dates: ["2026-06-02"] } },
    { type: "deadhead-flying", mode: "any-deadhead", dateScope: { mode: "specific_dates", dates: ["2026-06-02"] } },
    { type: "flight-number-preference", flightNumbers: ["7013"], dateScope: { mode: "date_range", from: "2026-06-02", to: "2026-06-20" } },
    { type: "redeye-preference", dateScope: { mode: "specific_dates", dates: ["2026-06-02"] } },
    { type: "reserve-call-type-date-scope", callType: "PRAM", options: ["PRAM"], dateScope: { mode: "specific_dates", dates: ["2026-06-02"] } },
    { type: "reserve-flying-date-pattern", segments: [{ workType: "flying", dateScope: { mode: "date_range", from: "2026-06-02", to: "2026-06-20" } }], callTypeOptions: [], strength: "normal" },
    { type: "tag-list-date", values: ["7013"], date: "2026-06-02" },
    { type: "pairing-occurrence-list", occurrences: [{ pairingNumber: "1001", originDate: "2026-06-02", pairingId: "10" }] },
  ];

  for (const bid of dateBoundBids) {
    assert.equal(containsExplicitCalendarDate(bid, generic), true, bid.type);
  }
});

test("favorite date classification keeps recurring, relative and date-free bids reusable", () => {
  const reusableBids = [
    { type: "flag" },
    { type: "efficient-flying-preference", mode: "efficient" },
    { type: "stepper", value: 3 },
    { type: "stepper-range", from: 2, to: 4 },
    { type: "stepper-date-range", value: 3, from: "", to: "bad" },
    { type: "days-off-on-pattern", minDaysOff: 4, minDaysOn: 4, maxDaysOn: 5, dateRange: null },
    { type: "credit-density-preference", minimumTotalCredit: "20:00", maximumWorkingDays: 4, strength: "normal" },
    { type: "minimum-base-layover", minimumDuration: "10:00" },
    { type: "credit-window-preference", direction: "more" },
    { type: "time", value: "14:00" },
    { type: "time-range", from: "14:00", to: "22:00" },
    { type: "time-condition-list", conditions: [{ operator: "=", value: "14:00" }] },
    { type: "duration", value: "10:00" },
    { type: "duration-range", from: "10:00", to: "12:00" },
    { type: "date-or-dow-list", dates: ["bad"], daysOfWeek: ["MON"] },
    { type: "work-day-preference", days: [{ dayOfWeek: "MON", checkInFrom: "14:00", checkInTo: "22:00" }], dateScope: null },
    { type: "pairing-preference", pairingIds: ["10"] },
    { type: "airport-preference", event: "landing", locations: [], dateScope: null },
    { type: "pairing-check-time", timeType: "check_in", operator: "=", value: "14:00", dateScope: null },
    { type: "flight-legs-per-duty", operator: "=", legs: 3, dateScope: null },
    { type: "pairing-length-preference", minDays: 2, maxDays: null, dateScope: null },
    { type: "month-end-carryover", operator: "=", days: 1 },
    { type: "deadhead-flying", mode: "any-deadhead", dateScope: null },
    { type: "flight-number-preference", flightNumbers: ["7013"], dateScope: null },
    { type: "redeye-preference", dateScope: null },
    { type: "select", value: "PRAM", options: ["PRAM"] },
    { type: "reserve-call-type-date-scope", callType: "PRAM", options: ["PRAM"], dateScope: { mode: "whole_month" } },
    { type: "reserve-flying-date-pattern", segments: [{ workType: "flying", dateScope: { mode: "first_half" } }], callTypeOptions: [], strength: "normal" },
    { type: "tag-list", values: ["2026-06-02"] },
    { type: "pairing-id-list", pairingIds: ["10"] },
    { type: "pairing-occurrence-list", occurrences: [{ pairingNumber: "1001", originDate: "bad", pairingId: "10" }] },
    { type: "crew-days-off-share", employeeNumber: "19", minimumDays: 2 },
    { type: "employee-schedule-preference", crewId: "19", relationship: "together", scheduleType: "work", thresholdType: "minimum", days: 2 },
    { type: "percent", value: "20" },
    { type: "percent-range", from: "20", to: "40" },
    { type: "percent-or-duration", unit: "percent", value: "20" },
    { type: "text", value: "YVR" },
  ];

  for (const bid of reusableBids) {
    assert.equal(containsExplicitCalendarDate(bid, generic), false, bid.type);
  }
});

test("favorite date classification only parses tag lists as dates in Prefer Off context", () => {
  assert.equal(
    containsExplicitCalendarDate({ type: "tag-list", values: ["2026-06-02"] }, generic),
    false,
  );
  assert.equal(
    containsExplicitCalendarDate({ type: "tag-list", values: ["2026-06-02"] }, preferOff),
    true,
  );
  assert.equal(
    containsExplicitCalendarDate({ type: "tag-list", values: ["Between 2026-06-02 - 2026-06-20"] }, preferOff),
    true,
  );
  assert.equal(
    containsExplicitCalendarDate({ type: "tag-list", values: ["Monday", "Window 18:00-23:59"] }, preferOff),
    false,
  );
  assert.equal(
    containsExplicitCalendarDate({ type: "tag-list", values: ["Weekends", "Window 18:00-23:59"] }, preferOff),
    false,
  );
});

test("favorite date classification rejects unknown bid types instead of silently allowing them", () => {
  assert.throws(
    () => containsExplicitCalendarDate({ type: "future-date-rule" }, generic),
    /Unsupported PBS favorite bid type/,
  );
});
