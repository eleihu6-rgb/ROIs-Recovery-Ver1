import type { PbsLineBidValue } from "../../../../packages/contracts/pbs-line-bids.js";
import type { JsonValue } from "./line-rules-types.js";

export const stableJsonStringify = (value: JsonValue): string => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableJsonStringify).join(",")}]`;
  }

  const entries = Object.entries(value)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));

  return `{${entries.map(([key, entryValue]) =>
    `${JSON.stringify(key)}:${stableJsonStringify(entryValue)}`).join(",")}}`;
};

export const compactDateScope = (
  dateScope: Extract<PbsLineBidValue, { type: "reserve-flying-date-pattern" }>["segments"][number]["dateScope"],
): JsonValue => {
  if (dateScope.mode === "date_range") {
    return {
      mode: dateScope.mode,
      from: dateScope.from,
      to: dateScope.to,
    };
  }

  if (dateScope.mode === "specific_dates") {
    return {
      mode: dateScope.mode,
      dates: [...dateScope.dates],
    };
  }

  return { mode: dateScope.mode };
};

export const buildLineRuleParameters = (bid: PbsLineBidValue): JsonValue => {
  if (bid.type === "flag") {
    return {};
  }

  if (bid.type === "date") {
    return {
      date: bid.value,
      operator: bid.operator ?? "=",
    };
  }

  if (bid.type === "stepper") {
    return {
      operator: bid.operator ?? "=",
      value: bid.value,
    };
  }

  if (bid.type === "stepper-range") {
    return {
      from: bid.from,
      to: bid.to,
    };
  }

  if (bid.type === "stepper-date") {
    return {
      date: bid.date,
      operator: bid.operator ?? "=",
      value: bid.value,
    };
  }

  if (bid.type === "stepper-range-date") {
    return {
      date: bid.date,
      from: bid.from,
      to: bid.to,
    };
  }

  if (bid.type === "stepper-date-range") {
    return {
      from: bid.from,
      to: bid.to,
      value: bid.value,
    };
  }

  if (bid.type === "days-off-on-pattern") {
    return {
      maxDaysOn: bid.maxDaysOn,
      maxDaysOff: bid.minDaysOff,
      minDaysOff: bid.minDaysOff,
      minDaysOn: bid.minDaysOn,
    };
  }

  if (bid.type === "credit-density-preference") {
    return {
      maximumWorkingDays: bid.maximumWorkingDays,
      minimumTotalCredit: bid.minimumTotalCredit,
      strength: bid.strength,
    };
  }

  if (bid.type === "minimum-base-layover") {
    return {
      minimumDuration: bid.minimumDuration,
    };
  }

  if (bid.type === "credit-window-preference") {
    return {
      direction: bid.direction,
    };
  }

  if (bid.type === "time") {
    return {
      operator: bid.operator ?? "=",
      value: bid.value,
    };
  }

  if (bid.type === "time-range") {
    return {
      from: bid.from,
      to: bid.to,
    };
  }

  if (bid.type === "time-date") {
    return {
      date: bid.date,
      operator: bid.operator ?? "=",
      value: bid.value,
    };
  }

  if (bid.type === "time-range-date") {
    return {
      date: bid.date,
      from: bid.from,
      to: bid.to,
    };
  }

  if (bid.type === "date-range") {
    return {
      from: bid.from,
      to: bid.to,
    };
  }

  if (bid.type === "select") {
    return { value: bid.value };
  }

  if (bid.type === "reserve-call-type-date-scope") {
    return {
      callType: bid.callType,
      dateScope: compactDateScope(bid.dateScope),
    };
  }

  if (bid.type === "reserve-flying-date-pattern") {
    return {
      segments: bid.segments.map<JsonValue>((segment) => {
        if (segment.workType === "reserve") {
          const reserveSegment: { [key: string]: JsonValue } = {
            workType: "reserve",
            callType: segment.callType,
            dateScope: compactDateScope(segment.dateScope),
          };

          return reserveSegment;
        }

        const flyingSegment: { [key: string]: JsonValue } = {
          workType: "flying",
          dateScope: compactDateScope(segment.dateScope),
        };

        return flyingSegment;
      }),
      strength: bid.strength,
    };
  }

  if (bid.type === "tag-list") {
    return { values: [...bid.values] };
  }

  if (bid.type === "tag-list-date") {
    return {
      date: bid.date,
      values: [...bid.values],
    };
  }

  if (bid.type === "crew-days-off-share") {
    return {
      crewId: bid.employeeNumber,
      relationship: "together",
      scheduleType: "days_off",
      mode: "same_days_off",
      thresholdType: "minimum",
      days: bid.minimumDays,
    };
  }

  if (bid.type === "employee-schedule-preference") {
    const mode = bid.relationship === "apart"
      ? bid.scheduleType === "work" ? "different_pairing" : "opposite_days_off"
      : bid.scheduleType === "work" ? "same_pairing" : "same_days_off";

    return {
      crewId: bid.crewId ?? (bid as { employeeNumber?: string }).employeeNumber ?? "",
      ...(bid.crewName ? { crewName: bid.crewName } : {}),
      relationship: bid.relationship,
      scheduleType: bid.scheduleType,
      mode,
      thresholdType: bid.thresholdType,
      days: bid.days,
    };
  }

  if (bid.type === "percent") {
    return {
      operator: bid.operator ?? "=",
      value: bid.value,
    };
  }

  if (bid.type === "percent-range") {
    return {
      from: bid.from,
      to: bid.to,
    };
  }

  if (bid.type === "text") {
    return { value: bid.value };
  }

  const _exhaustive: never = bid;
  return _exhaustive;
};
