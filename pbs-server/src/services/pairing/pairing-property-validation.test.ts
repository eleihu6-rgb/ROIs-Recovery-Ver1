import assert from "node:assert/strict";
import test from "node:test";
import { validatePairingPropertyPayload } from "./pairing-property-validation.js";

test("validatePairingPropertyPayload accepts unified pairing check-time payloads", () => {
  assert.equal(
    validatePairingPropertyPayload({
      propertyCode: 103,
      action: "award",
      quantifier: null,
      bid: {
        type: "pairing-check-time",
        timeType: "check_out",
        operator: "Between",
        from: "14:00",
        to: "22:00",
        dateScope: { mode: "date_range", from: "2026-06-15", to: "2026-06-21" },
      },
    }, "Jun 2026"),
    null,
  );
});

test("validatePairingPropertyPayload validates check-time event dates and period bounds", () => {
  const buildProperty = (dates: string[]) => ({
    propertyCode: 103,
    action: "award" as const,
    quantifier: null,
    bid: {
      type: "pairing-check-time",
      timeType: "check_in",
      operator: "=" as const,
      value: "09:00",
      dateScope: { mode: "specific_dates" as const, dates },
    },
  });

  assert.equal(validatePairingPropertyPayload(buildProperty([]), "Jun 2026"),
    "Pairing Check-In / Check-Out Time date scope is invalid.");
  assert.equal(validatePairingPropertyPayload(buildProperty(["2026-06-03", "2026-06-18"]), "Jun 2026"), null);
  assert.equal(validatePairingPropertyPayload(buildProperty(["2026-07-01"]), "Jun 2026"),
    "Event dates must be within the current bid period.");
  assert.equal(validatePairingPropertyPayload(buildProperty(["2026-06-03"])),
    "Event dates must be within the current bid period.");
});

test("validatePairingPropertyPayload validates Time Between Flights duration and quantifier", () => {
  assert.equal(
    validatePairingPropertyPayload({
      propertyCode: 129,
      action: "award",
      quantifier: "every",
      bid: { type: "duration", value: "01:15", operator: "=" },
    }, "Jun 2026"),
    null,
  );
  assert.equal(
    validatePairingPropertyPayload({
      propertyCode: 129,
      action: "award",
      quantifier: "any",
      bid: { type: "duration", value: "01:75", operator: ">" },
    }, "Jun 2026"),
    "Time Between Flights requires a duration and <, =, or > comparison.",
  );
});

test("validatePairingPropertyPayload rejects legacy pairing check-time payloads", () => {
  assert.equal(
    validatePairingPropertyPayload({
      propertyCode: 103,
      action: "award",
      quantifier: null,
      bid: { type: "time-range", from: "14:00", to: "22:00" },
    }, "Jun 2026"),
    "Pairing Check-In / Check-Out Time requires pairing-check-time bid.",
  );
});

test("validatePairingPropertyPayload accepts Flight Number Preference payloads", () => {
  assert.equal(
    validatePairingPropertyPayload({
      propertyCode: 116,
      action: "avoid",
      quantifier: null,
      bid: {
        type: "flight-number-preference",
        flightNumbers: ["0601", "0609"],
        dateScope: { mode: "specific_dates", dates: ["2026-06-03", "2026-06-18"] },
      },
    }, "Jun 2026"),
    null,
  );
});

test("validatePairingPropertyPayload rejects legacy Flight Number tag-list payloads", () => {
  assert.equal(
    validatePairingPropertyPayload({
      propertyCode: 116,
      action: "award",
      quantifier: "any",
      bid: { type: "tag-list", values: ["0601"] },
    }),
    "Flight Number Preference is invalid.",
  );
});

test("validatePairingPropertyPayload accepts Flight Number Preference without a matching-flight bound", () => {
  assert.equal(
    validatePairingPropertyPayload({
      propertyCode: 116,
      action: "award",
      quantifier: null,
      bid: {
        type: "flight-number-preference",
        flightNumbers: ["0601"],
        dateScope: null,
      },
    }),
    null,
  );
});

test("validatePairingPropertyPayload rejects Flight Number Preference with a legacy quantifier", () => {
  assert.equal(
    validatePairingPropertyPayload({
      propertyCode: 116,
      action: "award",
      quantifier: "any",
      bid: {
        type: "flight-number-preference",
        flightNumbers: ["0601"],
        dateScope: null,
      },
    }),
    "Flight Number Preference is invalid.",
  );
});

test("validatePairingPropertyPayload accepts Redeye Preference payloads", () => {
  assert.equal(
    validatePairingPropertyPayload({
      propertyCode: 117,
      action: "avoid",
      quantifier: null,
      bid: {
        type: "redeye-preference",
        dateScope: { mode: "date_range", from: "2026-06-03", to: "2026-06-18" },
      },
    }, "Jun 2026"),
    null,
  );

  assert.equal(
    validatePairingPropertyPayload({
      propertyCode: 117,
      action: "award",
      quantifier: null,
      bid: {
        type: "redeye-preference",
        dateScope: { mode: "specific_dates", dates: ["2026-06-03", "2026-06-18"] },
      },
    }, "Jun 2026"),
    null,
  );
});

test("validatePairingPropertyPayload rejects legacy Redeye flag payloads", () => {
  assert.equal(
    validatePairingPropertyPayload({
      propertyCode: 117,
      action: "award",
      quantifier: "any",
      bid: { type: "flag" },
    }),
    "Redeye Preference is invalid.",
  );
});

test("validatePairingPropertyPayload rejects invalid Redeye Preference payloads", () => {
  assert.equal(
    validatePairingPropertyPayload({
      propertyCode: 117,
      action: "award",
      quantifier: null,
      bid: { type: "tag-list", values: ["Y"] },
    }, "Jun 2026"),
    "Redeye Preference is invalid.",
  );

  assert.equal(
    validatePairingPropertyPayload({
      propertyCode: 117,
      action: "award",
      quantifier: null,
      bid: {
        type: "redeye-preference",
        dateScope: { mode: "date_range", from: "2026-06-18", to: "2026-06-03" },
      },
    }, "Jun 2026"),
    "Redeye Preference is invalid.",
  );

  assert.equal(
    validatePairingPropertyPayload({
      propertyCode: 117,
      action: "award",
      quantifier: "any",
      bid: { type: "redeye-preference", dateScope: null },
    }),
    "Redeye Preference does not support Any or Every.",
  );

  assert.equal(
    validatePairingPropertyPayload({
      propertyCode: 117,
      action: "avoid",
      quantifier: null,
      bid: {
        type: "redeye-preference",
        dateScope: { mode: "specific_dates", dates: ["2026-07-01"] },
      },
    }, "Jun 2026"),
    "Redeye Preference flight dates must be within the current bid period.",
  );
});

test("validatePairingPropertyPayload accepts complete airport preference layover payloads", () => {
  assert.equal(
    validatePairingPropertyPayload({
      propertyCode: 168,
      action: "award",
      quantifier: null,
      bid: {
        type: "airport-preference",
        event: "layover",
        locations: [{ code: "YYZ", kind: "airport" }],
        dateScope: { mode: "date_range", from: "2026-06-15", to: "2026-06-21" },
        minimumLayoverDuration: "12:00",
      },
    }, "Jun 2026"),
    null,
  );
});

test("validatePairingPropertyPayload rejects airport preference without locations", () => {
  assert.equal(
    validatePairingPropertyPayload({
      propertyCode: 168,
      action: "award",
      quantifier: null,
      bid: {
        type: "airport-preference",
        event: "layover",
        locations: [],
      },
    }),
    "Airport Preference requires at least one airport or city.",
  );
});

test("validatePairingPropertyPayload rejects airport preference landing with layover duration", () => {
  assert.equal(
    validatePairingPropertyPayload({
      propertyCode: 168,
      action: "award",
      quantifier: null,
      bid: {
        type: "airport-preference",
        event: "landing",
        locations: [{ code: "YVR", kind: "airport" }],
        minimumLayoverDuration: "12:00",
      },
    }),
    "Airport Preference layover duration is invalid.",
  );
});

test("validatePairingPropertyPayload rejects reversed airport preference date ranges", () => {
  assert.equal(
    validatePairingPropertyPayload({
      propertyCode: 168,
      action: "award",
      quantifier: null,
      bid: {
        type: "airport-preference",
        event: "layover",
        locations: [{ code: "YYZ", kind: "airport" }],
        dateScope: { mode: "date_range", from: "2026-06-21", to: "2026-06-15" },
      },
    }),
    "Airport Preference date scope is invalid.",
  );
});

test("validatePairingPropertyPayload accepts Work Day Preference weekday windows and optional event dates", () => {
  assert.equal(
    validatePairingPropertyPayload({
      propertyCode: 110,
      action: "award",
      quantifier: null,
      bid: {
        type: "work-day-preference",
        days: [
          { dayOfWeek: "MON", checkInFrom: "06:00", checkInTo: "10:00" },
          { dayOfWeek: "WED", checkInFrom: "12:00", checkInTo: "16:00" },
        ],
        dateScope: { mode: "specific_dates", dates: ["2026-06-15"] },
      },
    }, "Jun 2026"),
    null,
  );

  assert.equal(
    validatePairingPropertyPayload({
      propertyCode: 110,
      action: "award",
      quantifier: null,
      bid: {
        type: "work-day-preference",
        days: [{ dayOfWeek: "FRI", checkInFrom: "22:00", checkInTo: "04:00" }],
        dateScope: { mode: "date_range", from: "2026-06-15", to: "2026-06-21" },
      },
    }, "Jun 2026"),
    null,
  );

  assert.equal(
    validatePairingPropertyPayload({
      propertyCode: 110,
      action: "award",
      quantifier: null,
      bid: {
        type: "work-day-preference",
        days: [
          { dayOfWeek: "MON", checkInFrom: null, checkInTo: null },
          { dayOfWeek: "WED", checkInFrom: "06:00", checkInTo: null },
          { dayOfWeek: "FRI", checkInFrom: null, checkInTo: "10:00" },
        ],
        dateScope: null,
      },
    }, "Jun 2026"),
    null,
  );
});

test("validatePairingPropertyPayload rejects legacy and invalid Work Day Preference payloads", () => {
  assert.equal(
    validatePairingPropertyPayload({
      propertyCode: 110,
      action: "award",
      quantifier: "any",
      bid: { type: "date-or-dow-list", dates: [], daysOfWeek: ["MON"] },
    }),
    "Work Day Preference requires work-day-preference bid.",
  );

  assert.equal(
    validatePairingPropertyPayload({
      propertyCode: 110,
      action: "award",
      quantifier: null,
      bid: {
        type: "work-day-preference",
        days: [{ dayOfWeek: "MON", checkInFrom: "06:00", checkInTo: "06:00" }],
        dateScope: null,
      },
    }),
    "Work Day Preference is invalid.",
  );
});

test("validatePairingPropertyPayload accepts Pairing Length with optional start-date range", () => {
  assert.equal(
    validatePairingPropertyPayload({
      propertyCode: 112,
      action: "award",
      quantifier: null,
      bid: {
        type: "pairing-length-preference",
        minDays: 1,
        maxDays: 3,
        dateScope: { mode: "date_range", from: "2026-06-03", to: "2026-06-18" },
        min: 1,
        max: 7,
      },
    }),
    null,
  );

  const specificDatesProperty = {
    propertyCode: 112,
    action: "award" as const,
    quantifier: null,
    bid: {
      type: "pairing-length-preference",
      minDays: 1,
      maxDays: 3,
      dateScope: { mode: "specific_dates", dates: ["2026-06-03", "2026-06-18"] },
    },
  };

  assert.equal(validatePairingPropertyPayload(specificDatesProperty), null);
  assert.equal(validatePairingPropertyPayload(specificDatesProperty, "Jun 2026"), null);
  assert.equal(
    validatePairingPropertyPayload({
      ...specificDatesProperty,
      bid: {
        ...specificDatesProperty.bid,
        dateScope: { mode: "specific_dates", dates: ["2026-07-03"] },
      },
    }, "Jun 2026"),
    "Pairing Length start dates must be within the current bid period.",
  );
});

test("validatePairingPropertyPayload names Pairing Length validation errors", () => {
  assert.equal(
    validatePairingPropertyPayload({
      propertyCode: 112,
      action: "award",
      quantifier: null,
      bid: { type: "time-range", from: "06:00", to: "12:00" },
    }),
    "Pairing Length requires pairing-length bid.",
  );

  assert.equal(
    validatePairingPropertyPayload({
      propertyCode: 112,
      action: "award",
      quantifier: null,
      bid: {
        type: "pairing-length-preference",
        minDays: 4,
        maxDays: 2,
        dateScope: null,
      },
    }),
    "Pairing Length days are invalid.",
  );

  assert.equal(
    validatePairingPropertyPayload({
      propertyCode: 112,
      action: "award",
      quantifier: null,
      bid: {
        type: "pairing-length-preference",
        minDays: 1,
        maxDays: 3,
        dateScope: { mode: "date_range", from: "2026-06-18", to: "2026-06-03" },
      },
    }),
    "Pairing Length date scope is invalid.",
  );

  assert.equal(
    validatePairingPropertyPayload({
      propertyCode: 112,
      action: "award",
      quantifier: null,
      bid: {
        type: "pairing-length-preference",
        minDays: 1,
        maxDays: 3,
        dateScope: { mode: "specific_dates", dates: [] },
      },
    }),
    "Pairing Length date scope is invalid.",
  );
});

test("validatePairingPropertyPayload accepts Month-End Carryover payloads", () => {
  assert.equal(
    validatePairingPropertyPayload({
      propertyCode: 163,
      action: "avoid",
      quantifier: null,
      bid: {
        type: "month-end-carryover",
        operator: ">",
        days: 6,
      },
    }),
    null,
  );

  assert.equal(
    validatePairingPropertyPayload({
      propertyCode: 163,
      action: "award",
      quantifier: null,
      bid: {
        type: "month-end-carryover",
        operator: "Between",
        from: 2,
        to: 4,
      },
    }),
    null,
  );
});

test("validatePairingPropertyPayload rejects legacy and incomplete Month-End Carryover payloads", () => {
  assert.equal(
    validatePairingPropertyPayload({
      propertyCode: 163,
      action: "avoid",
      quantifier: null,
      bid: { type: "stepper", value: 5, min: 1, max: 14, operator: ">" },
    }),
    "Month-End Carryover is invalid.",
  );

  assert.equal(
    validatePairingPropertyPayload({
      propertyCode: 163,
      action: "avoid",
      quantifier: "any",
      bid: { type: "month-end-carryover", operator: ">", days: 6 },
    }),
    "Month-End Carryover does not support Any or Every.",
  );

  assert.equal(
    validatePairingPropertyPayload({
      propertyCode: 163,
      action: "avoid",
      quantifier: null,
      bid: { type: "month-end-carryover", operator: ">", days: 0 },
    }),
    "Month-End Carryover is invalid.",
  );

  assert.equal(
    validatePairingPropertyPayload({
      propertyCode: 163,
      action: "avoid",
      quantifier: null,
      bid: { type: "month-end-carryover", operator: "Between", from: 4, to: 2 },
    }),
    "Month-End Carryover is invalid.",
  );
});

test("validatePairingPropertyPayload accepts Deadhead Flying payloads", () => {
  assert.equal(
    validatePairingPropertyPayload({
      propertyCode: 122,
      action: "award",
      quantifier: null,
      bid: { type: "deadhead-flying", mode: "any-deadhead" },
    }),
    null,
  );

  assert.equal(
    validatePairingPropertyPayload({
      propertyCode: 122,
      action: "avoid",
      quantifier: null,
      bid: {
        type: "deadhead-flying",
        mode: "deadhead-only-duty",
        dateScope: { mode: "specific_dates", dates: ["2026-01-03", "2026-01-07"] },
      },
    }, "Jan 2026"),
    null,
  );

  assert.equal(
    validatePairingPropertyPayload({
      propertyCode: 122,
      action: "award",
      quantifier: null,
      bid: {
        type: "deadhead-flying",
        mode: "any-deadhead",
        dateScope: { mode: "date_range", from: "2026-01-10", to: "2026-01-15" },
      },
    }, "Jan 2026"),
    null,
  );
});

test("validatePairingPropertyPayload rejects legacy and incomplete Deadhead Flying payloads", () => {
  assert.equal(
    validatePairingPropertyPayload({
      propertyCode: 122,
      action: "award",
      quantifier: null,
      bid: { type: "stepper", value: 2, min: 0, max: 8, operator: ">" },
    }),
    "Deadhead Flying is invalid.",
  );

  assert.equal(
    validatePairingPropertyPayload({
      propertyCode: 122,
      action: "award",
      quantifier: null,
      bid: {
        type: "deadhead-flying",
        mode: "any-deadhead",
        dateScope: { mode: "specific_dates", dates: ["2026-02-01"] },
      },
    }, "Jan 2026"),
    "Deadhead Flying flight dates must be within the current bid period.",
  );

  assert.equal(
    validatePairingPropertyPayload({
      propertyCode: 122,
      action: "award",
      quantifier: "any",
      bid: { type: "deadhead-flying", mode: "any-deadhead" },
    }),
    "Deadhead Flying does not support Any or Every.",
  );

  assert.equal(
    validatePairingPropertyPayload({
      propertyCode: 122,
      action: "award",
      quantifier: null,
      bid: { type: "deadhead-flying", mode: "any-deadhead", legs: 2 },
    }),
    "Deadhead Flying is invalid.",
  );

  assert.equal(
    validatePairingPropertyPayload({
      propertyCode: 122,
      action: "avoid",
      quantifier: null,
      bid: { type: "deadhead-flying", mode: "deadhead-legs", operator: "Between", from: 3, to: 1 },
    }),
    "Deadhead Flying is invalid.",
  );

  assert.equal(
    validatePairingPropertyPayload({
      propertyCode: 122,
      action: "avoid",
      quantifier: null,
      bid: {
        type: "deadhead-flying",
        mode: "deadhead-only-duty",
        dateScope: { mode: "date_range", from: "2026-01-20", to: "2026-01-10" },
      },
    }),
    "Deadhead Flying is invalid.",
  );
});

test("validatePairingPropertyPayload accepts strict Flight Legs per Duty Between and event dates", () => {
  assert.equal(
    validatePairingPropertyPayload({
      propertyCode: 107,
      action: "award",
      quantifier: "every",
      bid: {
        type: "flight-legs-per-duty",
        operator: "Between",
        from: 2,
        to: 4,
        dateScope: { mode: "specific_dates", dates: ["2026-04-03", "2026-04-10"] },
      },
    }, "Apr 2026"),
    null,
  );
});

test("validatePairingPropertyPayload rejects legacy, reversed, and out-of-period Flight Legs payloads", () => {
  assert.equal(
    validatePairingPropertyPayload({
      propertyCode: 107,
      action: "award",
      quantifier: "any",
      bid: { type: "stepper", value: 2, min: 1, max: 8, operator: ">" },
    }),
    "Flight Legs per Duty is invalid.",
  );

  assert.equal(
    validatePairingPropertyPayload({
      propertyCode: 107,
      action: "award",
      quantifier: "any",
      bid: { type: "flight-legs-per-duty", operator: "Between", from: 5, to: 2 },
    }),
    "Flight Legs per Duty is invalid.",
  );

  assert.equal(
    validatePairingPropertyPayload({
      propertyCode: 107,
      action: "award",
      quantifier: "any",
      bid: {
        type: "flight-legs-per-duty",
        operator: "=",
        legs: 2,
        dateScope: { mode: "date_range", from: "2026-03-31", to: "2026-04-02" },
      },
    }, "Apr 2026"),
    "Event dates must be within the current bid period.",
  );
});
