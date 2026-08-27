import assert from "node:assert/strict";
import test from "node:test";
import { pbsPairingPropertyCatalog } from "../../../../packages/contracts/pbs-pairing-bids.js";
import {
  STRUCTURED_PAIRING_SUMMARY_FORMATTERS,
  formatLineholderSummaryConditionValue,
  formatLineholderSummaryItemText,
} from "./lineholder-summary-formatters.js";
import { serializeRuleBid } from "./rule-bid-value.js";
import type { RuleBidValue } from "./rule-bid-types.js";
import type { LineholderSummaryFormatInput } from "./lineholder-summary-formatters.js";

const buildInput = (patch: Partial<LineholderSummaryFormatInput> & Pick<LineholderSummaryFormatInput, "bidType" | "propertyCode" | "label">): LineholderSummaryFormatInput => ({
  action: "SetCondition",
  operator: "In",
  paramA: null,
  paramB: null,
  paramC: null,
  ...patch,
});

test("formats common Pairing summary rows as readable bid text", () => {
  assert.equal(
    formatLineholderSummaryItemText(buildInput({
      bidType: "Pairing",
      propertyCode: 101,
      label: "Any Landing In Airport",
      action: "Award",
      paramA: "ABD",
    })).readableText,
    "Award pairings landing in ABD",
  );

  assert.equal(
    formatLineholderSummaryItemText(buildInput({
      bidType: "Pairing",
      propertyCode: 102,
      label: "Pairing Number",
      action: "Award",
      paramA: "11963,11962",
    })).readableText,
    "Award pairings 11963, 11962",
  );

  const singlePairingPreference = formatLineholderSummaryItemText(buildInput({
    bidType: "Pairing",
    propertyCode: 102,
    label: "Pairing Number",
    action: "Award",
    operator: "Json",
    paramA: JSON.stringify({
      type: "pairing-preference",
      pairingIds: ["987654321"],
      pairingLabels: ["CRAM"],
    }),
  }));
  assert.equal(singlePairingPreference.readableText, "Award pairing CRAM");
  assert.equal(singlePairingPreference.value, "CRAM");
  assert.equal(singlePairingPreference.isReviewOnly, false);

  assert.equal(
    formatLineholderSummaryItemText(buildInput({
      bidType: "Pairing",
      propertyCode: 102,
      label: "Pairing Number",
      action: "Award",
      operator: "Json",
      paramA: JSON.stringify({
        type: "pairing-preference",
        pairingIds: ["987654321", "987654322"],
        pairingLabels: ["CRAM", "ABC123"],
      }),
    })).readableText,
    "Award pairings CRAM, ABC123",
  );

  const repeatedPairingLabels = formatLineholderSummaryItemText(buildInput({
    bidType: "Pairing",
    propertyCode: 102,
    label: "Pairing Preference",
    action: "Award",
    operator: "Json",
    paramA: JSON.stringify({
      type: "pairing-preference",
      pairingIds: ["98991", "99126", "99196", "99661", "99923", "100129", "100602"],
      pairingLabels: ["C4107", "C4107", "C4107", "C4130", "C4130", "C4130", "C4155"],
    }),
  }));
  assert.equal(
    repeatedPairingLabels.readableText,
    "Award pairings C4107 ×3, C4130 ×3, C4155 ×1",
  );
  assert.equal(repeatedPairingLabels.value, "C4107 ×3, C4130 ×3, C4155 ×1");
  assert.equal(repeatedPairingLabels.isReviewOnly, false);

  assert.equal(
    formatLineholderSummaryItemText(buildInput({
      bidType: "Pairing",
      propertyCode: 102,
      label: "Pairing Number",
      action: "Avoid",
      operator: "Json",
      paramA: JSON.stringify({
        type: "pairing-preference",
        pairingIds: ["987654321"],
        pairingLabels: ["CRAM"],
      }),
    })).readableText,
    "Avoid pairing CRAM",
  );

  const missingPairingLabel = formatLineholderSummaryItemText(buildInput({
    bidType: "Pairing",
    propertyCode: 102,
    label: "Pairing Number",
    action: "Award",
    operator: "Json",
    paramA: JSON.stringify({
      type: "pairing-preference",
      pairingIds: ["987654321"],
    }),
  }));
  assert.equal(missingPairingLabel.readableText, "Award pairing preference needs review");
  assert.equal(missingPairingLabel.value, "Pairing preference needs review");
  assert.equal(missingPairingLabel.isReviewOnly, true);
  assert.ok(!missingPairingLabel.readableText.includes("987654321"));
  assert.ok(!missingPairingLabel.value.includes("pairingIds"));

  assert.equal(
    formatLineholderSummaryItemText(buildInput({
      bidType: "Pairing",
      propertyCode: 103,
      label: "Pairing Check-In / Check-Out Time",
      action: "Avoid",
      operator: "Json",
      paramA: JSON.stringify({
        type: "pairing-check-time",
        timeType: "check_out",
        operator: "Between",
        from: "09:00",
        to: "12:00",
        dateScope: { mode: "specific_dates", dates: ["2026-06-15", "2026-06-18"] },
      }),
    })).readableText,
    "Avoid pairings checking check-out between 09:00 and 12:00 on Jun 15, 2026, Jun 18, 2026",
  );

  const airportPreference = formatLineholderSummaryItemText(buildInput({
    bidType: "Pairing",
    propertyCode: 168,
    label: "Airport Preference",
    action: "Award",
    operator: "Json",
    paramA: JSON.stringify({
      type: "airport-preference",
      event: "landing",
      locations: [{ code: "YEG", kind: "airport" }],
      dateScope: { mode: "specific_dates", dates: ["2026-06-01", "2026-06-02"] },
      minimumLayoverDuration: null,
    }),
  }));

  assert.equal(
    airportPreference.readableText,
    "Award pairings landing at YEG on Jun 1, 2026, Jun 2, 2026",
  );
  assert.ok(!airportPreference.readableText.includes("{\"type\""));

  assert.equal(
    formatLineholderSummaryItemText(buildInput({
      bidType: "Pairing",
      propertyCode: 107,
      label: "Flight Legs per Duty",
      action: "Award",
      operator: "Json",
      paramC: "every",
      paramA: JSON.stringify({
        type: "flight-legs-per-duty",
        operator: "Between",
        from: 2,
        to: 4,
        dateScope: { mode: "date_range", from: "2026-06-15", to: "2026-06-18" },
      }),
    })).readableText,
    "Award pairings with every duty having between 2 and 4 flying legs from Jun 15, 2026 to Jun 18, 2026",
  );

  assert.equal(
    formatLineholderSummaryItemText(buildInput({
      bidType: "Pairing",
      propertyCode: 163,
      label: "Month-End Carryover",
      action: "Avoid",
      operator: "Json",
      paramA: JSON.stringify({
        type: "month-end-carryover",
        operator: ">",
        days: 6,
      }),
    })).readableText,
    "Avoid pairings with month-end carryover greater than 6 days",
  );

  assert.equal(
    formatLineholderSummaryItemText(buildInput({
      bidType: "Pairing",
      propertyCode: 163,
      label: "Month-End Carryover",
      action: "Award",
      operator: "Json",
      paramA: JSON.stringify({
        type: "month-end-carryover",
        operator: "Between",
        from: 2,
        to: 4,
      }),
    })).readableText,
    "Award pairings with month-end carryover between 2 and 4 days",
  );

  assert.equal(
    formatLineholderSummaryItemText(buildInput({
      bidType: "Pairing",
      propertyCode: 122,
      label: "Deadhead Flying",
      action: "Award",
      operator: "Json",
      paramA: JSON.stringify({
        type: "deadhead-flying",
        mode: "any-deadhead",
        dateScope: { mode: "specific_dates", dates: ["2026-07-03", "2026-07-08"] },
      }),
    })).readableText,
    "Award pairings with any deadhead on Jul 3, 2026, Jul 8, 2026",
  );

  assert.equal(
    formatLineholderSummaryItemText(buildInput({
      bidType: "Pairing",
      propertyCode: 122,
      label: "Deadhead Flying",
      action: "Avoid",
      operator: "Json",
      paramA: JSON.stringify({
        type: "deadhead-flying",
        mode: "deadhead-only-duty",
        dateScope: { mode: "date_range", from: "2026-07-10", to: "2026-07-12" },
      }),
    })).readableText,
    "Avoid pairings with a deadhead-only duty from Jul 10, 2026 to Jul 12, 2026",
  );
});

test("formats structured Pairing Length and Flight Number summaries without JSON", () => {
  const pairingLength = formatLineholderSummaryItemText(buildInput({
    bidType: "Pairing",
    propertyCode: 112,
    label: "Pairing Length",
    action: "Award",
    operator: "Json",
    paramA: JSON.stringify({
      type: "pairing-length-preference",
      minDays: 2,
      maxDays: 3,
      dateScope: null,
      min: 1,
      max: 7,
    }),
  }));
  const flightNumbers = formatLineholderSummaryItemText(buildInput({
    bidType: "Pairing",
    propertyCode: 116,
    label: "Flight Number Preference",
    action: "Award",
    operator: "Json",
    paramA: JSON.stringify({
      type: "flight-number-preference",
      flightNumbers: ["I7013", "I7153"],
      dateScope: { mode: "specific_dates", dates: ["2026-06-30"] },
    }),
  }));

  assert.deepEqual(pairingLength, {
    isReviewOnly: false,
    value: "2–3 days long",
    readableText: "Award pairings 2–3 days long",
  });
  assert.deepEqual(flightNumbers, {
    isReviewOnly: false,
    value: "I7013, I7153 on Jun 30, 2026",
    readableText: "Award pairings with flights I7013, I7153 on Jun 30, 2026",
  });

  for (const summary of [pairingLength, flightNumbers]) {
    assert.ok(!summary.value.includes("{\"type\""));
    assert.ok(!summary.readableText.includes("{\"type\""));
  }
});

test("formats Pairing Length bounds and structured date scopes", () => {
  const cases = [
    {
      bid: { type: "pairing-length-preference", minDays: null, maxDays: 1, dateScope: null },
      value: "Up to 1 day long",
      readableText: "Award pairings up to 1 day long",
    },
    {
      action: "Avoid" as const,
      bid: { type: "pairing-length-preference", minDays: 1, maxDays: null, dateScope: null },
      value: "At least 1 day long",
      readableText: "Avoid pairings at least 1 day long",
    },
    {
      bid: { type: "pairing-length-preference", minDays: 2, maxDays: 2, dateScope: null },
      value: "2 days long",
      readableText: "Award pairings 2 days long",
    },
    {
      bid: { type: "pairing-length-preference", minDays: 2, maxDays: null, dateScope: null },
      value: "At least 2 days long",
      readableText: "Award pairings at least 2 days long",
    },
    {
      bid: { type: "pairing-length-preference", minDays: null, maxDays: 3, dateScope: null },
      value: "Up to 3 days long",
      readableText: "Award pairings up to 3 days long",
    },
    {
      bid: {
        type: "pairing-length-preference",
        minDays: 2,
        maxDays: 3,
        dateScope: { mode: "specific_dates", dates: ["2026-06-30"] },
      },
      value: "2–3 days long starting on Jun 30, 2026",
      readableText: "Award pairings 2–3 days long starting on Jun 30, 2026",
    },
    {
      bid: {
        type: "pairing-length-preference",
        minDays: 2,
        maxDays: 3,
        dateScope: { mode: "date_range", from: "2026-06-01", to: "2026-06-10" },
      },
      value: "2–3 days long starting from Jun 1, 2026 to Jun 10, 2026",
      readableText: "Award pairings 2–3 days long starting from Jun 1, 2026 to Jun 10, 2026",
    },
  ];

  for (const expected of cases) {
    assert.deepEqual(formatLineholderSummaryItemText(buildInput({
      bidType: "Pairing",
      propertyCode: 112,
      label: "Pairing Length",
      action: expected.action ?? "Award",
      operator: "Json",
      paramA: JSON.stringify(expected.bid),
    })), {
      isReviewOnly: false,
      value: expected.value,
      readableText: expected.readableText,
    });
  }
});

test("formats single Flight Number and date ranges", () => {
  const summary = formatLineholderSummaryItemText(buildInput({
    bidType: "Pairing",
    propertyCode: 116,
    label: "Flight Number Preference",
    action: "Avoid",
    operator: "Json",
    paramA: JSON.stringify({
      type: "flight-number-preference",
      flightNumbers: ["i7013"],
      dateScope: { mode: "date_range", from: "2026-06-01", to: "2026-06-10" },
    }),
  }));

  assert.deepEqual(summary, {
    isReviewOnly: false,
    value: "I7013 from Jun 1, 2026 to Jun 10, 2026",
    readableText: "Avoid pairings with flight I7013 from Jun 1, 2026 to Jun 10, 2026",
  });
});

test("formats structured Work Day and Redeye summaries with stable ordering", () => {
  const workDay = formatLineholderSummaryItemText(buildInput({
    bidType: "Pairing",
    propertyCode: 110,
    label: "Work Day Preference",
    action: "Award",
    operator: "Json",
    paramA: JSON.stringify({
      type: "work-day-preference",
      days: [
        { dayOfWeek: "WED", checkInFrom: "12:00", checkInTo: "18:00" },
        { dayOfWeek: "MON", checkInFrom: "03:00", checkInTo: "11:00" },
        { dayOfWeek: "FRI", checkInFrom: null, checkInTo: null },
      ],
      dateScope: { mode: "specific_dates", dates: ["2026-06-30"] },
    }),
  }));
  const redeye = formatLineholderSummaryItemText(buildInput({
    bidType: "Pairing",
    propertyCode: 117,
    label: "Redeye Preference",
    action: "Avoid",
    operator: "Json",
    paramA: JSON.stringify({
      type: "redeye-preference",
      dateScope: { mode: "date_range", from: "2026-06-01", to: "2026-06-10" },
    }),
  }));

  assert.deepEqual(workDay, {
    isReviewOnly: false,
    value: "Mon 03:00-11:00; Wed 12:00-18:00; Fri on Jun 30, 2026",
    readableText: "Award pairings with duty check-in Mon 03:00-11:00; Wed 12:00-18:00; Fri on Jun 30, 2026",
  });
  assert.deepEqual(redeye, {
    isReviewOnly: false,
    value: "Redeye from Jun 1, 2026 to Jun 10, 2026",
    readableText: "Avoid pairings with a redeye flight from Jun 1, 2026 to Jun 10, 2026",
  });

  const openEndedWorkDay = formatLineholderSummaryItemText(buildInput({
    bidType: "Pairing",
    propertyCode: 110,
    label: "Work Day Preference",
    action: "Award",
    operator: "Json",
    paramA: JSON.stringify({
      type: "work-day-preference",
      days: [{ dayOfWeek: "MON", checkInFrom: "03:00", checkInTo: null }],
      dateScope: null,
    }),
  }));
  const invalidWorkDay = formatLineholderSummaryItemText(buildInput({
    bidType: "Pairing",
    propertyCode: 110,
    label: "Work Day Preference",
    action: "Award",
    operator: "Json",
    paramA: JSON.stringify({
      type: "work-day-preference",
      days: [{ dayOfWeek: "MON", checkInFrom: "03:00", checkInTo: "03:00" }],
      dateScope: null,
    }),
  }));
  const undatedRedeye = formatLineholderSummaryItemText(buildInput({
    bidType: "Pairing",
    propertyCode: 117,
    label: "Redeye Preference",
    action: "Award",
    operator: "Json",
    paramA: JSON.stringify({ type: "redeye-preference", dateScope: null }),
  }));

  assert.deepEqual(openEndedWorkDay, {
    isReviewOnly: false,
    value: "Mon after 03:00",
    readableText: "Award pairings with duty check-in Mon after 03:00",
  });
  assert.equal(invalidWorkDay.isReviewOnly, true);
  assert.equal(invalidWorkDay.value, "Condition needs review");
  assert.deepEqual(undatedRedeye, {
    isReviewOnly: false,
    value: "Redeye",
    readableText: "Award pairings with a redeye flight",
  });
});

test("keeps structured Pairing formatter coverage aligned with Json serialization", () => {
  const serializedJsonBidTypes = pbsPairingPropertyCatalog
    .map((property) => property.defaultBid as RuleBidValue)
    .filter((bid) => serializeRuleBid(bid).operator === "Json")
    .map((bid) => bid.type)
    .sort();
  const formatterBidTypes = Object.keys(STRUCTURED_PAIRING_SUMMARY_FORMATTERS).sort();

  assert.deepEqual(formatterBidTypes, serializedJsonBidTypes);
});

test("uses review-only text instead of leaking malformed or mismatched Pairing JSON", () => {
  for (const paramA of [
    "{not-json",
    JSON.stringify({
      type: "flight-number-preference",
      flightNumbers: ["I7013"],
      dateScope: null,
    }),
    JSON.stringify({
      type: "pairing-length-preference",
      minDays: 2,
      maxDays: 3,
      dateScope: { mode: "specific_dates", dates: [] },
    }),
  ]) {
    const summary = formatLineholderSummaryItemText(buildInput({
      bidType: "Pairing",
      propertyCode: 112,
      label: "Pairing Length",
      action: "Award",
      operator: "Json",
      paramA,
    }));

    assert.deepEqual(summary, {
      isReviewOnly: true,
      value: "Condition needs review",
      readableText: "Award Pairing Length needs review",
    });
    assert.ok(!summary.value.includes("{\"type\""));
    assert.ok(!summary.readableText.includes("{\"type\""));
  }

  assert.equal(
    formatLineholderSummaryConditionValue(
      "Json",
      JSON.stringify({ type: "pairing-length-preference", minDays: 2, maxDays: 3 }),
      null,
      null,
    ),
    "Condition needs review",
  );
});

test("formats enroute Pairing summary rows as readable bid text", () => {
  assert.equal(
    formatLineholderSummaryItemText(buildInput({
      bidType: "Pairing",
      propertyCode: 126,
      label: "Any/Every Enroute Check-Out Time",
      action: "Avoid",
      operator: "<",
      paramA: "22:30",
      paramC: "every",
    })).readableText,
    "Avoid pairings with every enroute check-out less than 22:30",
  );

  assert.equal(
    formatLineholderSummaryItemText(buildInput({
      bidType: "Pairing",
      propertyCode: 166,
      label: "Any/Every Enroute Check-In Date / Day",
      action: "Award",
      paramA: JSON.stringify({
        dates: ["2026-04-03"],
        daysOfWeek: ["FRI"],
      }),
      paramC: "any",
    })).readableText,
    "Award pairings with any enroute check-in on Apr 3, 2026, Fri",
  );

  assert.equal(
    formatLineholderSummaryItemText(buildInput({
      bidType: "Pairing",
      propertyCode: 167,
      label: "Any/Every Enroute Check-Out Date / Day",
      action: "Avoid",
      operator: "Between",
      paramA: "2026-04-03",
      paramB: "2026-04-10",
      paramC: "every",
    })).readableText,
    "Avoid pairings with every enroute check-out between Apr 3, 2026 and Apr 10, 2026",
  );
});

test("formats visible Days Off rows as readable bid text", () => {
  assert.equal(
    formatLineholderSummaryItemText(buildInput({
      bidType: "DaysOff",
      propertyCode: 201,
      label: "Prefer Off",
      paramA: "2026-06-10",
    })).readableText,
    "Award day off on Jun 10, 2026",
  );

  assert.equal(
    formatLineholderSummaryItemText(buildInput({
      bidType: "DaysOff",
      propertyCode: 204,
      label: "Long Stretch Off / Compressed Flying",
      operator: "Between",
      paramA: "3",
      paramB: "2026-06-10",
      paramC: "2026-06-20",
    })).readableText,
    "Award at least 3 consecutive days off from Jun 10, 2026 to Jun 20, 2026",
  );

  assert.equal(
    formatLineholderSummaryItemText(buildInput({
      bidType: "DaysOff",
      propertyCode: 206,
      label: "Employee Schedule Preference",
      operator: "Minimum",
      paramA: "F8030",
      paramB: "opposite_days_off",
      paramC: "2",
    })).readableText,
    "Award at least 2 days off apart from employee F8030",
  );
});

test("formats visible Line rows as readable bid text", () => {
  const awardReserve = formatLineholderSummaryItemText(buildInput({
      bidType: "Line",
      propertyCode: 427,
      label: "Reserve",
      action: "Award",
    }));

  assert.equal(awardReserve.value, "Award reserve-only for the whole bid month");
  assert.equal(awardReserve.readableText, "Award reserve-only for the whole bid month");

  const avoidReserve = formatLineholderSummaryItemText(buildInput({
      bidType: "Line",
      propertyCode: 427,
      label: "Reserve",
      action: "Avoid",
    }));

  assert.equal(avoidReserve.value, "No reserve for the whole bid month");
  assert.equal(avoidReserve.readableText, "No reserve for the whole bid month");

  assert.equal(
    formatLineholderSummaryItemText(buildInput({
      bidType: "Line",
      propertyCode: 401,
      label: "Max Credit Window",
      operator: null,
    })).readableText,
    "Award max credit window",
  );

  assert.equal(
    formatLineholderSummaryItemText(buildInput({
      bidType: "Line",
      propertyCode: 429,
      label: "Credit Window Preference",
      operator: "Json",
      paramA: JSON.stringify({
        type: "credit-window-preference",
        direction: "less",
      }),
    })).readableText,
    "Less credit",
  );

  assert.equal(
    formatLineholderSummaryItemText(buildInput({
      bidType: "Line",
      propertyCode: 409,
      label: "Most Flying In Least Working Days (Configured)",
      operator: "=",
      paramA: "75:00",
      paramB: "15",
      paramC: "strong",
    })).readableText,
    "Award at least 75:00 credit in 15 or fewer working days, strong priority",
  );

  assert.equal(
    formatLineholderSummaryItemText(buildInput({
      bidType: "Line",
      propertyCode: 408,
      label: "Commuter Pattern",
      operator: "Json",
      paramA: JSON.stringify({
        minDaysOff: 4,
        minDaysOn: 4,
        maxDaysOn: 5,
        dateRange: { from: "2026-04-02", to: "2026-04-18" },
      }),
    })).readableText,
    "Award commuter pattern with 4 days off followed by 4-5 days on from Apr 2, 2026 to Apr 18, 2026",
  );

  assert.equal(
    formatLineholderSummaryItemText(buildInput({
      bidType: "Line",
      propertyCode: 410,
      label: "Reserve / Flying Date Pattern",
      operator: "Pattern",
      paramA: JSON.stringify([
        { workType: "reserve", callType: "PRAM", dateScope: { mode: "first_half" } },
        { workType: "flying", dateScope: { mode: "second_half" } },
      ]),
      paramB: "must_try",
    })).readableText,
    "Award reserve / flying pattern: PRAM reserve in the first half of the bid month; flying in the second half of the bid month, must-try priority",
  );
});

test("formats visible Reserve rows without leaking date-scope JSON", () => {
  assert.equal(
    formatLineholderSummaryItemText(buildInput({
      bidType: "Reserve",
      propertyCode: 302,
      label: "Reserve Day On",
      paramA: "2026-06-24",
    })).readableText,
    "Award reserve day on Jun 24, 2026",
  );

  assert.equal(
    formatLineholderSummaryItemText(buildInput({
      bidType: "Reserve",
      propertyCode: 301,
      label: "Short Call Type",
      paramA: "PRAM",
      paramB: "{\"mode\":\"whole_month\"}",
    })).readableText,
    "Award PRAM short call for the whole bid month",
  );

  assert.equal(
    formatLineholderSummaryItemText(buildInput({
      bidType: "Reserve",
      propertyCode: 301,
      label: "Short Call Type",
      paramA: "CRPM",
      paramB: JSON.stringify({ mode: "specific_dates", dates: ["2026-06-10", "2026-06-12"] }),
    })).readableText,
    "Award CRPM short call on Jun 10, 2026, Jun 12, 2026",
  );
});

test("keeps a safe fallback for unsupported or malformed rows", () => {
  assert.equal(
    formatLineholderSummaryItemText(buildInput({
      bidType: "Line",
      propertyCode: 999,
      label: "Unknown Line Property",
      operator: "Between",
      paramA: "1",
      paramB: "3",
    })).readableText,
    "Set Unknown Line Property Between 1 - 3",
  );

  assert.equal(
    formatLineholderSummaryItemText(buildInput({
      bidType: "Reserve",
      propertyCode: 301,
      label: "Short Call Type",
      paramA: "PRAM",
      paramB: "{not-json",
    })).readableText,
    "Award PRAM short call",
  );
});
