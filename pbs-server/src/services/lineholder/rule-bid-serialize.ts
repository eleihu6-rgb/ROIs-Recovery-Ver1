import type { RuleBidValue, SerializedBid } from "./rule-bid-types.js";

const buildEmployeeSchedulePreferenceMode = (
  bid: Extract<RuleBidValue, { type: "employee-schedule-preference" }>,
) => {
  if (bid.relationship === "apart") {
    return bid.scheduleType === "work" ? "different_pairing" : "opposite_days_off";
  }

  return bid.scheduleType === "work" ? "same_pairing" : "same_days_off";
};

const getEmployeeSchedulePreferenceCrewId = (
  bid: Extract<RuleBidValue, { type: "employee-schedule-preference" }>,
) => bid.crewId ?? (bid as { employeeNumber?: string }).employeeNumber ?? "";

export const serializeRuleBid = (bid: RuleBidValue): SerializedBid => {
  if (bid.type === "flag") {
    return {
      operator: null,
      paramA: null,
      paramB: null,
      paramC: null,
    };
  }

  if (bid.type === "efficient-flying-preference") {
    return {
      operator: "Json",
      paramA: JSON.stringify(bid),
      paramB: null,
      paramC: null,
    };
  }

  if (bid.type === "date") {
    return {
      operator: bid.operator ?? "=",
      paramA: bid.value,
      paramB: null,
      paramC: null,
    };
  }

  if (bid.type === "stepper") {
    return {
      operator: bid.operator ?? "=",
      paramA: String(bid.value),
      paramB: null,
      paramC: null,
    };
  }

  if (bid.type === "flight-legs-per-duty") {
    return {
      operator: "Json",
      paramA: JSON.stringify(bid),
      paramB: null,
      paramC: null,
    };
  }

  if (bid.type === "stepper-range") {
    return {
      operator: "Between",
      paramA: String(bid.from),
      paramB: String(bid.to),
      paramC: null,
    };
  }

  if (bid.type === "time" || bid.type === "duration") {
    return {
      operator: bid.operator ?? "=",
      paramA: bid.value,
      paramB: null,
      paramC: null,
    };
  }

  if (bid.type === "stepper-date") {
    return {
      operator: bid.operator ?? "=",
      paramA: String(bid.value),
      paramB: bid.date,
      paramC: null,
    };
  }

  if (bid.type === "stepper-range-date") {
    return {
      operator: "Between",
      paramA: String(bid.from),
      paramB: String(bid.to),
      paramC: bid.date,
    };
  }

  if (bid.type === "stepper-date-range") {
    return {
      operator: "Between",
      paramA: String(bid.value),
      paramB: bid.from,
      paramC: bid.to,
    };
  }

  if (bid.type === "days-off-on-pattern") {
    if (bid.dateRange) {
      return {
        operator: "Json",
        paramA: JSON.stringify({
          minDaysOff: bid.minDaysOff,
          minDaysOn: bid.minDaysOn,
          maxDaysOn: bid.maxDaysOn,
          dateRange: bid.dateRange,
        }),
        paramB: null,
        paramC: null,
      };
    }

    return {
      operator: "Between",
      paramA: String(bid.minDaysOff),
      paramB: String(bid.minDaysOn),
      paramC: String(bid.maxDaysOn),
    };
  }

  if (bid.type === "credit-density-preference") {
    return {
      operator: "=",
      paramA: bid.minimumTotalCredit,
      paramB: String(bid.maximumWorkingDays),
      paramC: bid.strength,
    };
  }

  if (bid.type === "minimum-base-layover") {
    return {
      operator: "=",
      paramA: bid.minimumDuration,
      paramB: null,
      paramC: null,
    };
  }

  if (bid.type === "credit-window-preference") {
    return {
      operator: "Json",
      paramA: JSON.stringify(bid),
      paramB: null,
      paramC: null,
    };
  }

  if (bid.type === "time-range" || bid.type === "date-range" || bid.type === "duration-range") {
    return {
      operator: "Between",
      paramA: bid.from,
      paramB: bid.to,
      paramC: null,
    };
  }

  if (bid.type === "time-condition-list") {
    return {
      operator: "Or",
      paramA: JSON.stringify(bid.conditions),
      paramB: null,
      paramC: null,
    };
  }

  if (bid.type === "date-or-dow-list") {
    return {
      operator: "In",
      paramA: JSON.stringify({
        dates: bid.dates,
        daysOfWeek: bid.daysOfWeek,
      }),
      paramB: null,
      paramC: null,
    };
  }

  if (bid.type === "work-day-preference") {
    return {
      operator: "Json",
      paramA: JSON.stringify(bid),
      paramB: null,
      paramC: null,
    };
  }

  if (bid.type === "airport-preference") {
    return {
      operator: "Json",
      paramA: JSON.stringify(bid),
      paramB: null,
      paramC: null,
    };
  }

  if (bid.type === "time-date") {
    return {
      operator: bid.operator ?? "=",
      paramA: bid.value,
      paramB: bid.date,
      paramC: null,
    };
  }

  if (bid.type === "time-range-date") {
    return {
      operator: "Between",
      paramA: bid.from,
      paramB: bid.to,
      paramC: bid.date,
    };
  }

  if (bid.type === "select") {
    return {
      operator: "=",
      paramA: bid.value,
      paramB: null,
      paramC: null,
    };
  }

  if (bid.type === "reserve-call-type-date-scope") {
    return {
      operator: "In",
      paramA: bid.callType,
      paramB: JSON.stringify(bid.dateScope),
      paramC: null,
    };
  }

  if (bid.type === "reserve-flying-date-pattern") {
    return {
      operator: "Pattern",
      paramA: JSON.stringify(bid.segments),
      paramB: bid.strength,
      paramC: null,
    };
  }

  if (bid.type === "percent") {
    return {
      operator: bid.operator ?? "=",
      paramA: bid.value,
      paramB: null,
      paramC: null,
    };
  }

  if (bid.type === "percent-range") {
    return {
      operator: "Between",
      paramA: bid.from,
      paramB: bid.to,
      paramC: null,
    };
  }

  if (bid.type === "percent-or-duration") {
    return {
      operator: bid.operator ?? ">",
      paramA: bid.value,
      paramB: bid.unit,
      paramC: null,
    };
  }

  if (bid.type === "tag-list") {
    return {
      operator: "In",
      paramA: bid.values.join(","),
      paramB: null,
      paramC: null,
    };
  }

  if (bid.type === "tag-list-date") {
    return {
      operator: "In",
      paramA: bid.values.join(","),
      paramB: bid.date,
      paramC: null,
    };
  }

  if (bid.type === "pairing-id-list") {
    return {
      operator: "In",
      paramA: bid.pairingIds.join(","),
      paramB: null,
      paramC: bid.pairingLabels ? JSON.stringify(bid.pairingLabels) : null,
    };
  }

  if (bid.type === "pairing-occurrence-list") {
    return {
      operator: "In",
      paramA: Array.from(new Set(bid.occurrences.map((occurrence) => occurrence.pairingId))).join(","),
      paramB: null,
      paramC: null,
    };
  }

  if (bid.type === "pairing-preference") {
    return {
      operator: "Json",
      paramA: JSON.stringify(bid),
      paramB: null,
      paramC: null,
    };
  }

  if (bid.type === "pairing-check-time") {
    return {
      operator: "Json",
      paramA: JSON.stringify(bid),
      paramB: null,
      paramC: null,
    };
  }

  if (bid.type === "pairing-length-preference") {
    return {
      operator: "Json",
      paramA: JSON.stringify(bid),
      paramB: null,
      paramC: null,
    };
  }

  if (bid.type === "month-end-carryover") {
    return {
      operator: "Json",
      paramA: JSON.stringify(bid),
      paramB: null,
      paramC: null,
    };
  }

  if (bid.type === "deadhead-flying") {
    return {
      operator: "Json",
      paramA: JSON.stringify(bid),
      paramB: null,
      paramC: null,
    };
  }

  if (bid.type === "flight-number-preference") {
    return {
      operator: "Json",
      paramA: JSON.stringify(bid),
      paramB: null,
      paramC: null,
    };
  }

  if (bid.type === "redeye-preference") {
    return {
      operator: "Json",
      paramA: JSON.stringify(bid),
      paramB: null,
      paramC: null,
    };
  }

  if (bid.type === "crew-days-off-share") {
    return {
      operator: "In",
      paramA: bid.employeeNumber.trim(),
      paramB: String(bid.minimumDays),
      paramC: null,
    };
  }

  if (bid.type === "employee-schedule-preference") {
    return {
      operator: bid.thresholdType === "maximum" ? "Maximum" : "Minimum",
      paramA: getEmployeeSchedulePreferenceCrewId(bid).trim(),
      paramB: buildEmployeeSchedulePreferenceMode(bid),
      paramC: String(bid.days),
    };
  }

  if (bid.type === "text") {
    return {
      operator: "=",
      paramA: bid.value,
      paramB: null,
      paramC: null,
    };
  }

  return {
    operator: null,
    paramA: null,
    paramB: null,
    paramC: null,
  };
};
