import {
  clampPairingBidNumber,
  inferPairingBidOperator,
  isPairingBidComplete,
  isValidPairingBidDuration,
  normalizePairingBidDuration,
  parsePairingBidNumberInput,
  parsePairingBidTagInput,
  transformPairingBidForOperator,
} from "@/features/pairing/pairing-bid-control-logic";

describe("pairing bid control logic", () => {
  it("normalizes tag and number inputs", () => {
    expect(parsePairingBidTagInput(" m4959, c4103 ,, ")).toEqual(["M4959", "C4103"]);
    expect(parsePairingBidNumberInput("4")).toBe(4);
    expect(parsePairingBidNumberInput("")).toBeNull();
    expect(parsePairingBidNumberInput("bad")).toBeNull();
    expect(clampPairingBidNumber(9, 1, 7)).toBe(7);
    expect(isValidPairingBidDuration("112:30")).toBe(true);
    expect(isValidPairingBidDuration("08:75")).toBe(false);
    expect(normalizePairingBidDuration("8:00")).toBe("08:00");
  });

  it("infers the visible operator from bid shape", () => {
    expect(inferPairingBidOperator({ type: "stepper", value: 2 })).toBe("=");
    expect(inferPairingBidOperator({ type: "time-range", from: "09:00", to: "18:00" })).toBe("Between");
    expect(inferPairingBidOperator({ type: "duration-range", from: "08:00", to: "12:00" })).toBe("Between");
    expect(inferPairingBidOperator({ type: "percent-or-duration", unit: "percent", value: "75", operator: ">" })).toBe(">");
    expect(inferPairingBidOperator({
      type: "time-condition-list",
      conditions: [{ operator: "Between", from: "09:00", to: "18:00" }],
    })).toBe("Between");
    expect(inferPairingBidOperator({
      type: "pairing-check-time",
      timeType: "check_in",
      operator: "Between",
      from: "09:00",
      to: "18:00",
      dateScope: null,
    })).toBe("Between");
    expect(inferPairingBidOperator({ type: "tag-list", values: ["M4959"] })).toBe("In");
    expect(inferPairingBidOperator({ type: "date-or-dow-list", dates: [], daysOfWeek: ["MON"] })).toBe("In");
  });

  it("transforms compare bids into range bids and back", () => {
    expect(transformPairingBidForOperator(
      { type: "stepper-date", value: 2, date: "2026-04-09", min: 1, max: 7 },
      "Between",
    )).toEqual({
      type: "stepper-range-date",
      from: 2,
      to: 2,
      date: "2026-04-09",
      min: 1,
      max: 7,
    });

    expect(transformPairingBidForOperator(
      { type: "time-range", from: "09:00", to: "18:00" },
      ">",
    )).toEqual({
      type: "time",
      value: "09:00",
      operator: ">",
    });

    expect(transformPairingBidForOperator(
      { type: "time-condition-list", conditions: [] },
      "Between",
    )).toEqual({
      type: "time-condition-list",
      conditions: [{ operator: "Between", from: "", to: "" }],
    });

    expect(transformPairingBidForOperator(
      { type: "duration", value: "08:00" },
      "Between",
    )).toEqual({
      type: "duration-range",
      from: "08:00",
      to: "08:00",
    });

    expect(transformPairingBidForOperator(
      { type: "duration-range", from: "08:00", to: "12:00" },
      ">",
    )).toEqual({
      type: "duration",
      value: "08:00",
      operator: ">",
    });

    expect(transformPairingBidForOperator(
      { type: "percent-or-duration", unit: "percent", value: "75", operator: ">" },
      "<",
    )).toEqual({
      type: "percent-or-duration",
      unit: "percent",
      value: "75",
      operator: "<",
    });

    expect(transformPairingBidForOperator(
      { type: "date-or-dow-list", dates: ["2026-04-03"], daysOfWeek: ["MON"] },
      "Between",
    )).toEqual({
      type: "date-range",
      from: "2026-04-03",
      to: "2026-04-03",
    });

    expect(transformPairingBidForOperator(
      { type: "date-range", from: "2026-04-03", to: "2026-04-10" },
      "In",
    )).toEqual({
      type: "date-or-dow-list",
      dates: ["2026-04-03"],
      daysOfWeek: [],
    });
  });

  it("requires valid duration values before a pairing bid is complete", () => {
    expect(isPairingBidComplete({ type: "duration", value: "08:00" })).toBe(true);
    expect(isPairingBidComplete({ type: "duration", value: "s" })).toBe(false);
    expect(isPairingBidComplete({ type: "duration", value: "08:75" })).toBe(false);
    expect(isPairingBidComplete({ type: "percent-or-duration", unit: "percent", value: "75", operator: ">" })).toBe(true);
    expect(isPairingBidComplete({ type: "percent-or-duration", unit: "duration", value: "007:00", operator: ">" })).toBe(true);
    expect(isPairingBidComplete({ type: "percent-or-duration", unit: "duration", value: "s", operator: ">" })).toBe(false);
    expect(isPairingBidComplete({
      type: "pairing-check-time",
      timeType: "check_out",
      operator: "Between",
      from: "14:00",
      to: "22:00",
      dateScope: { mode: "date_range", from: "2026-06-15", to: "2026-06-21" },
    })).toBe(true);
    expect(isPairingBidComplete({
      type: "pairing-check-time",
      timeType: "check_out",
      operator: "Between",
      from: "14:00",
      to: "",
      dateScope: null,
    })).toBe(false);
    expect(isPairingBidComplete({ type: "duration-range", from: "08:00", to: "112:30" })).toBe(true);
    expect(isPairingBidComplete({ type: "duration-range", from: "08:00", to: "12" })).toBe(false);
  });

  it("requires date-or-dow values and valid date ranges", () => {
    expect(isPairingBidComplete({ type: "date-or-dow-list", dates: [], daysOfWeek: [] })).toBe(false);
    expect(isPairingBidComplete({ type: "date-or-dow-list", dates: ["2026-04-03"], daysOfWeek: [] })).toBe(true);
    expect(isPairingBidComplete({ type: "date-or-dow-list", dates: [], daysOfWeek: ["MON"] })).toBe(true);
    expect(isPairingBidComplete({ type: "work-day-preference", days: [], dateScope: null })).toBe(false);
    expect(isPairingBidComplete({
      type: "work-day-preference",
      days: [{ dayOfWeek: "MON", checkInFrom: null, checkInTo: null }],
      dateScope: null,
    })).toBe(true);
    expect(isPairingBidComplete({
      type: "work-day-preference",
      days: [{ dayOfWeek: "MON", checkInFrom: "06:00", checkInTo: null }],
      dateScope: null,
    })).toBe(true);
    expect(isPairingBidComplete({
      type: "work-day-preference",
      days: [{ dayOfWeek: "MON", checkInFrom: null, checkInTo: "10:00" }],
      dateScope: null,
    })).toBe(true);
    expect(isPairingBidComplete({
      type: "work-day-preference",
      days: [{ dayOfWeek: "MON", checkInFrom: "06:00", checkInTo: "10:00" }],
      dateScope: null,
    })).toBe(true);
    expect(isPairingBidComplete({
      type: "work-day-preference",
      days: [{ dayOfWeek: "MON", checkInFrom: "06:00", checkInTo: "06:00" }],
      dateScope: null,
    })).toBe(false);
    expect(isPairingBidComplete({ type: "date-range", from: "2026-04-10", to: "2026-04-03" })).toBe(false);
  });

  it("requires complete airport preference fields before saving", () => {
    expect(isPairingBidComplete({ type: "airport-preference", event: "layover", locations: [] })).toBe(false);
    expect(isPairingBidComplete({ type: "airport-preference", event: "layover", locations: [{ code: "YYZ", kind: "airport" }] })).toBe(true);
    expect(isPairingBidComplete({
      type: "airport-preference",
      event: "layover",
      locations: [{ code: "YYZ", kind: "airport" }],
      dateScope: { mode: "date_range", from: "2026-06-21", to: "2026-06-15" },
    })).toBe(false);
    expect(isPairingBidComplete({
      type: "airport-preference",
      event: "landing",
      locations: [{ code: "YVR", kind: "airport" }],
      minimumLayoverDuration: "12:00",
    })).toBe(false);
    expect(isPairingBidComplete({
      type: "airport-preference",
      event: "landing_or_layover",
      locations: [{ code: "YTO", kind: "city" }],
      dateScope: { mode: "date_range", from: "2026-06-15", to: "2026-06-21" },
      minimumLayoverDuration: "12:00",
    })).toBe(true);
  });
});
