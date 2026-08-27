import type {
  ReserveDateScope,
  RuleBidValue,
  RulePropertyDefinition,
  SerializedBid,
} from "./rule-bid-types.js";
import { cloneReserveDateScope, cloneRuleBidValue } from "./rule-bid-clone.js";

export type {
  ReserveDateScope,
  RuleBidValue,
  RulePropertyDefinition,
  SerializedBid,
} from "./rule-bid-types.js";

type TimeConditionListBid = Extract<RuleBidValue, { type: "time-condition-list" }>;
type DateOrDowListBid = Extract<RuleBidValue, { type: "date-or-dow-list" }>;
type EmployeeSchedulePreferenceBid = Extract<RuleBidValue, { type: "employee-schedule-preference" }>;
type AirportPreferenceBid = Extract<RuleBidValue, { type: "airport-preference" }>;
type PairingPreferenceBid = Extract<RuleBidValue, { type: "pairing-preference" }>;
type PairingCheckTimeBid = Extract<RuleBidValue, { type: "pairing-check-time" }>;
type FlightLegsPerDutyBid = Extract<RuleBidValue, { type: "flight-legs-per-duty" }>;
type PairingLengthBid = Extract<RuleBidValue, { type: "pairing-length-preference" }>;
type MonthEndCarryoverBid = Extract<RuleBidValue, { type: "month-end-carryover" }>;
type DeadheadFlyingBid = Extract<RuleBidValue, { type: "deadhead-flying" }>;
type FlightNumberPreferenceBid = Extract<RuleBidValue, { type: "flight-number-preference" }>;
type RedeyePreferenceBid = Extract<RuleBidValue, { type: "redeye-preference" }>;
type CreditWindowPreferenceBid = Extract<RuleBidValue, { type: "credit-window-preference" }>;
type MinimumBaseLayoverBid = Extract<RuleBidValue, { type: "minimum-base-layover" }>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const normalizeTextValue = (value: unknown): string => String(value ?? "").trim();

const normalizeTextArray = (values: unknown): string[] =>
  Array.isArray(values)
    ? Array.from(new Set(values.map((value) => normalizeTextValue(value)).filter(Boolean))).sort()
    : [];

const normalizeTextArrayPreservingOrder = (values: unknown): string[] =>
  Array.isArray(values)
    ? values.map((value) => normalizeTextValue(value)).filter(Boolean)
    : [];

const getFallbackEmployeeSchedulePreferenceCrewId = (fallback: EmployeeSchedulePreferenceBid) =>
  fallback.crewId ?? (fallback as { employeeNumber?: string }).employeeNumber ?? "";

const parseEmployeeSchedulePreferenceMode = (
  mode: string | null,
): Pick<EmployeeSchedulePreferenceBid, "relationship" | "scheduleType"> => {
  if (mode === "different_pairing") {
    return { relationship: "apart", scheduleType: "work" };
  }

  if (mode === "opposite_days_off") {
    return { relationship: "apart", scheduleType: "days_off" };
  }

  if (mode === "same_pairing") {
    return { relationship: "together", scheduleType: "work" };
  }

  return { relationship: "together", scheduleType: "days_off" };
};

const parseReserveDateScope = (value: unknown): ReserveDateScope | null => {
  if (!value || typeof value !== "object" || !("mode" in value)) {
    return null;
  }

  const parsed = value as Partial<ReserveDateScope>;

  if (parsed.mode === "first_half" || parsed.mode === "second_half" || parsed.mode === "whole_month") {
    return { mode: parsed.mode };
  }

  if (parsed.mode === "date_range") {
    return {
      mode: "date_range",
      from: typeof parsed.from === "string" ? parsed.from : "",
      to: typeof parsed.to === "string" ? parsed.to : "",
    };
  }

  if (parsed.mode === "specific_dates") {
    return {
      mode: "specific_dates",
      dates: Array.isArray(parsed.dates)
        ? parsed.dates.filter((date): date is string => typeof date === "string")
        : [],
    };
  }

  return null;
};

const extractCompareOperator = (operator: string | null) =>
  operator === "<" || operator === ">" ? operator : undefined;

const parseAirportPreferenceBid = (
  value: unknown,
  fallback: AirportPreferenceBid,
): AirportPreferenceBid => {
  if (!isRecord(value) || value.type !== "airport-preference") {
    return fallback;
  }

  const event = value.event === "landing" || value.event === "landing_or_layover"
    ? value.event
    : "layover";
  const locationsByKey = new Map<string, AirportPreferenceBid["locations"][number]>();
  if (Array.isArray(value.locations)) {
    for (const location of value.locations) {
      if (!isRecord(location)) continue;
      const code = normalizeTextValue(location.code).toUpperCase();
      const kind = location.kind === "city" ? "city" : "airport";
      if (/^[A-Z]{3}$/.test(code)) {
        locationsByKey.set(`${kind}:${code}`, { code, kind });
      }
    }
  }
  const dateScope = isRecord(value.dateScope) && value.dateScope.mode === "specific_dates"
    ? { mode: "specific_dates" as const, dates: normalizeTextArray(value.dateScope.dates) }
    : isRecord(value.dateScope) && value.dateScope.mode === "date_range"
      ? { mode: "date_range" as const, from: normalizeTextValue(value.dateScope.from), to: normalizeTextValue(value.dateScope.to) }
      : null;

  return {
    type: "airport-preference",
    event,
    locations: Array.from(locationsByKey.values()),
    dateScope,
    minimumLayoverDuration: event === "landing" ? null : normalizeTextValue(value.minimumLayoverDuration) || null,
  };
};

const parsePairingLabels = (value: string | null): string[] | undefined => {
  if (!value) {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return undefined;
    }

    const labels = parsed.map((item) => normalizeTextValue(item)).filter(Boolean);
    return labels.length > 0 ? labels : undefined;
  } catch {
    return undefined;
  }
};

const parseOptionalPositiveInteger = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const parsePairingPreferenceBid = (
  value: unknown,
  fallback: PairingPreferenceBid,
): PairingPreferenceBid => {
  if (!isRecord(value) || value.type !== "pairing-preference") {
    return fallback;
  }

  const pairingIds = normalizeTextArrayPreservingOrder(value.pairingIds);
  const pairingLabels = normalizeTextArrayPreservingOrder(value.pairingLabels);

  return {
    type: "pairing-preference",
    pairingIds,
    ...(pairingLabels.length === pairingIds.length ? { pairingLabels } : {}),
  };
};

const parsePairingCheckTimeDateScope = (
  value: unknown,
): PairingCheckTimeBid["dateScope"] => {
  if (!isRecord(value)) {
    return null;
  }

  if (value.mode === "specific_dates") {
    return {
      mode: "specific_dates",
      dates: normalizeTextArrayPreservingOrder(value.dates),
    };
  }

  if (value.mode === "specific_date") {
    const date = normalizeTextValue(value.date);
    return { mode: "specific_dates", dates: date ? [date] : [] };
  }

  if (value.mode === "date_range") {
    return {
      mode: "date_range",
      from: normalizeTextValue(value.from),
      to: normalizeTextValue(value.to),
    };
  }

  return null;
};

const parsePairingCheckTimeBid = (
  value: unknown,
  fallback: PairingCheckTimeBid,
): PairingCheckTimeBid => {
  if (!isRecord(value) || value.type !== "pairing-check-time") {
    return fallback;
  }

  const timeType = value.timeType === "check_out" ? "check_out" : "check_in";
  const dateScope = parsePairingCheckTimeDateScope(value.dateScope);

  if (value.operator === "Between") {
    return {
      type: "pairing-check-time",
      timeType,
      operator: "Between",
      from: normalizeTextValue(value.from),
      to: normalizeTextValue(value.to),
      dateScope,
    };
  }

  return {
    type: "pairing-check-time",
    timeType,
    operator: value.operator === "<" || value.operator === ">" ? value.operator : "=",
    value: normalizeTextValue(value.value),
    dateScope,
  };
};

const parseStrictInteger = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(String(value ?? ""));
  return Number.isSafeInteger(parsed) ? parsed : Number.NaN;
};

const parseFlightLegsPerDutyBid = (
  value: unknown,
  fallback: FlightLegsPerDutyBid,
): FlightLegsPerDutyBid => {
  if (!isRecord(value) || value.type !== "flight-legs-per-duty") {
    return fallback.operator === "Between"
      ? { ...fallback, from: Number.NaN, to: Number.NaN }
      : { ...fallback, legs: Number.NaN };
  }

  const parsedDateScope = parsePairingCheckTimeDateScope(value.dateScope);
  const dateScope = parsedDateScope?.mode === "specific_dates"
    ? { ...parsedDateScope, dates: Array.from(new Set(parsedDateScope.dates)) }
    : parsedDateScope;
  if (value.operator === "Between") {
    return {
      type: "flight-legs-per-duty",
      operator: "Between",
      from: parseStrictInteger(value.from),
      to: parseStrictInteger(value.to),
      dateScope,
    };
  }

  return {
    type: "flight-legs-per-duty",
    operator: value.operator === "<" || value.operator === ">" ? value.operator : "=",
    legs: parseStrictInteger(value.legs),
    dateScope,
  };
};

const parsePairingLengthDateScope = (
  value: unknown,
): PairingLengthBid["dateScope"] => {
  if (!isRecord(value)) {
    return null;
  }

  if (value.mode === "specific_dates") {
    return { mode: "specific_dates", dates: normalizeTextArray(value.dates) };
  }

  if (value.mode !== "date_range") {
    return null;
  }

  return {
    mode: "date_range",
    from: normalizeTextValue(value.from),
    to: normalizeTextValue(value.to),
  };
};

const parsePairingLengthBid = (
  value: unknown,
  fallback: PairingLengthBid,
): PairingLengthBid => {
  if (!isRecord(value) || value.type !== "pairing-length-preference") {
    return fallback;
  }

  return {
    type: "pairing-length-preference",
    minDays: parseOptionalPositiveInteger(value.minDays),
    maxDays: parseOptionalPositiveInteger(value.maxDays),
    dateScope: parsePairingLengthDateScope(value.dateScope),
    min: parseOptionalPositiveInteger(value.min) ?? fallback.min,
    max: parseOptionalPositiveInteger(value.max) ?? fallback.max,
  };
};

const parseMonthEndCarryoverBid = (
  value: unknown,
  fallback: MonthEndCarryoverBid,
): MonthEndCarryoverBid => {
  if (!isRecord(value) || value.type !== "month-end-carryover") {
    return fallback;
  }

  if (value.operator === "Between") {
    return {
      type: "month-end-carryover",
      operator: "Between",
      from: parseOptionalPositiveInteger(value.from),
      to: parseOptionalPositiveInteger(value.to),
    };
  }

  return {
    type: "month-end-carryover",
    operator: value.operator === "<" || value.operator === ">" ? value.operator : "=",
    days: parseOptionalPositiveInteger(value.days),
  };
};

const parseDeadheadFlyingBid = (
  value: unknown,
  fallback: DeadheadFlyingBid,
): DeadheadFlyingBid => {
  if (
    !isRecord(value)
    || value.type !== "deadhead-flying"
    || (value.mode !== "any-deadhead" && value.mode !== "deadhead-only-duty")
  ) {
    return fallback;
  }

  const dateScope = isRecord(value.dateScope)
    ? value.dateScope.mode === "specific_dates"
      ? {
          mode: "specific_dates" as const,
          dates: normalizeTextArray(value.dateScope.dates),
        }
      : value.dateScope.mode === "date_range"
        ? {
            mode: "date_range" as const,
            from: normalizeTextValue(value.dateScope.from),
            to: normalizeTextValue(value.dateScope.to),
          }
        : null
    : null;

  return {
    type: "deadhead-flying",
    mode: value.mode,
    dateScope,
  };
};

const parseFlightNumberPreferenceDateScope = (
  value: unknown,
): FlightNumberPreferenceBid["dateScope"] => {
  if (!isRecord(value)) {
    return null;
  }

  if (value.mode === "specific_dates") {
    return {
      mode: "specific_dates",
      dates: Array.isArray(value.dates)
        ? [...new Set(value.dates.map((date) => normalizeTextValue(date)).filter(Boolean))]
        : [],
    };
  }

  if (value.mode === "date_range") {
    return { mode: "date_range", from: normalizeTextValue(value.from), to: normalizeTextValue(value.to) };
  }

  return null;
};

const parseFlightNumberPreferenceBid = (
  value: unknown,
  fallback: FlightNumberPreferenceBid,
): FlightNumberPreferenceBid => {
  if (!isRecord(value) || value.type !== "flight-number-preference") {
    return fallback;
  }

  return {
    type: "flight-number-preference",
    flightNumbers: Array.isArray(value.flightNumbers)
      ? value.flightNumbers.map((flightNumber) => normalizeTextValue(flightNumber).toUpperCase()).filter(Boolean)
      : [],
    dateScope: parseFlightNumberPreferenceDateScope(value.dateScope),
  };
};

const parseRedeyePreferenceDateScope = (
  value: unknown,
): RedeyePreferenceBid["dateScope"] => {
  if (!isRecord(value)) {
    return null;
  }

  if (value.mode === "specific_dates") {
    return { mode: "specific_dates", dates: normalizeTextArray(value.dates) };
  }

  if (value.mode === "date_range") {
    return { mode: "date_range", from: normalizeTextValue(value.from), to: normalizeTextValue(value.to) };
  }

  return null;
};

const parseRedeyePreferenceBid = (
  value: unknown,
  fallback: RedeyePreferenceBid,
): RedeyePreferenceBid => {
  if (!isRecord(value) || value.type !== "redeye-preference") {
    return fallback;
  }

  return {
    type: "redeye-preference",
    dateScope: parseRedeyePreferenceDateScope(value.dateScope),
  };
};

const parseCreditWindowPreferenceBid = (
  value: unknown,
  fallback: CreditWindowPreferenceBid,
): CreditWindowPreferenceBid => {
  if (!isRecord(value) || value.type !== "credit-window-preference") {
    return fallback;
  }

  return {
    type: "credit-window-preference",
    direction: value.direction === "less" ? "less" : "more",
  };
};

const parseMinimumBaseLayoverBid = (
  value: unknown,
  fallback: MinimumBaseLayoverBid,
): MinimumBaseLayoverBid => {
  if (!isRecord(value) || value.type !== "minimum-base-layover") {
    return fallback;
  }

  return {
    type: "minimum-base-layover",
    minimumDuration: normalizeTextValue(value.minimumDuration),
  };
};

const parsePatternNumber = (value: unknown, fallback: number) => {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
};

const parsePatternDateRange = (value: unknown) => {
  if (!isRecord(value) || typeof value.from !== "string" || typeof value.to !== "string") {
    return null;
  }

  return value.from.trim().length > 0 && value.to.trim().length > 0
    ? { from: value.from, to: value.to }
    : null;
};

const parseWorkDayPreferenceBid = (
  value: unknown,
  fallback: Extract<RuleBidValue, { type: "work-day-preference" }>,
) => {
  if (!isRecord(value) || value.type !== "work-day-preference" || !Array.isArray(value.days)) {
    return fallback;
  }

  const weekdays = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
  const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  const seen = new Set<string>();
  const days = value.days.flatMap((day) => {
    if (!isRecord(day) || !weekdays.includes(day.dayOfWeek as typeof weekdays[number]) || seen.has(String(day.dayOfWeek))) {
      return [];
    }

    const checkInFrom = day.checkInFrom == null ? null : String(day.checkInFrom);
    const checkInTo = day.checkInTo == null ? null : String(day.checkInTo);
    if (
      (checkInFrom != null && !timePattern.test(checkInFrom))
      || (checkInTo != null && !timePattern.test(checkInTo))
      || (checkInFrom != null && checkInFrom === checkInTo)
    ) {
      return [];
    }

    seen.add(String(day.dayOfWeek));
    return [{
      dayOfWeek: day.dayOfWeek as typeof weekdays[number],
      checkInFrom,
      checkInTo,
    }];
  });

  if (days.length === 0) {
    return fallback;
  }

  const dateScope = isRecord(value.dateScope) && value.dateScope.mode === "specific_dates"
    && Array.isArray(value.dateScope.dates)
    ? { mode: "specific_dates" as const, dates: value.dateScope.dates.filter((date): date is string => typeof date === "string") }
    : isRecord(value.dateScope) && value.dateScope.mode === "date_range"
      && typeof value.dateScope.from === "string" && typeof value.dateScope.to === "string"
      ? { mode: "date_range" as const, from: value.dateScope.from, to: value.dateScope.to }
      : null;

  return { type: "work-day-preference" as const, days, dateScope };
};

export { cloneRuleBidValue } from "./rule-bid-clone.js";
export { serializeRuleBid } from "./rule-bid-serialize.js";

export const deserializeRuleBid = <TBidValue extends RuleBidValue>(
  property: RulePropertyDefinition<TBidValue>,
  serialized: SerializedBid,
): TBidValue => {
  const fallback = cloneRuleBidValue(property.defaultBid);

  if (fallback.type === "flag") {
    return fallback;
  }

  if (fallback.type === "efficient-flying-preference") {
    if (serialized.operator !== "Json" || !serialized.paramA) {
      return fallback;
    }

    try {
      const parsed: unknown = JSON.parse(serialized.paramA);

      if (
        isRecord(parsed)
        && parsed.type === "efficient-flying-preference"
        && (parsed.mode === "efficient" || parsed.mode === "inefficient")
      ) {
        return {
          type: "efficient-flying-preference",
          mode: parsed.mode,
        } as TBidValue;
      }
    } catch {
      return fallback;
    }

    return fallback;
  }

  if (fallback.type === "date") {
    return {
      ...fallback,
      value: serialized.paramA ?? fallback.value,
      ...(extractCompareOperator(serialized.operator) ? { operator: extractCompareOperator(serialized.operator) } : {}),
    } as TBidValue;
  }

  if (fallback.type === "stepper") {
    if (serialized.operator === "Between") {
      const parsedFrom = Number.parseInt(serialized.paramA ?? "", 10);
      const parsedTo = Number.parseInt(serialized.paramB ?? "", 10);

      return {
        type: "stepper-range",
        from: Number.isNaN(parsedFrom) ? fallback.value : parsedFrom,
        to: Number.isNaN(parsedTo) ? fallback.value : parsedTo,
        min: fallback.min,
        max: fallback.max,
      } as TBidValue;
    }

    const parsed = Number.parseInt(serialized.paramA ?? "", 10);

    return {
      ...fallback,
      value: Number.isNaN(parsed) ? fallback.value : parsed,
      ...(extractCompareOperator(serialized.operator) ? { operator: extractCompareOperator(serialized.operator) } : {}),
    } as TBidValue;
  }

  if (fallback.type === "flight-legs-per-duty") {
    if (serialized.operator === "Json" && serialized.paramA) {
      try {
        return parseFlightLegsPerDutyBid(JSON.parse(serialized.paramA), fallback) as TBidValue;
      } catch {
        return (fallback.operator === "Between"
          ? { ...fallback, from: Number.NaN, to: Number.NaN }
          : { ...fallback, legs: Number.NaN }) as TBidValue;
      }
    }

    if (serialized.operator === "Between") {
      return {
        type: "flight-legs-per-duty",
        operator: "Between",
        from: parseStrictInteger(serialized.paramA),
        to: parseStrictInteger(serialized.paramB),
        dateScope: null,
      } as TBidValue;
    }

    return {
      type: "flight-legs-per-duty",
      operator: serialized.operator === "<" || serialized.operator === ">" ? serialized.operator : "=",
      legs: parseStrictInteger(serialized.paramA),
      dateScope: null,
    } as TBidValue;
  }

  if (fallback.type === "stepper-date") {
    if (serialized.operator === "Between") {
      const parsedFrom = Number.parseInt(serialized.paramA ?? "", 10);
      const parsedTo = Number.parseInt(serialized.paramB ?? "", 10);

      return {
        type: "stepper-range-date",
        from: Number.isNaN(parsedFrom) ? fallback.value : parsedFrom,
        to: Number.isNaN(parsedTo) ? fallback.value : parsedTo,
        date: serialized.paramC ?? fallback.date,
        min: fallback.min,
        max: fallback.max,
      } as TBidValue;
    }

    const parsed = Number.parseInt(serialized.paramA ?? "", 10);

    return {
      ...fallback,
      value: Number.isNaN(parsed) ? fallback.value : parsed,
      date: serialized.paramB ?? fallback.date,
      ...(extractCompareOperator(serialized.operator) ? { operator: extractCompareOperator(serialized.operator) } : {}),
    } as TBidValue;
  }

  if (fallback.type === "stepper-date-range") {
    const parsedValue = Number.parseInt(serialized.paramA ?? "", 10);

    return {
      ...fallback,
      value: Number.isNaN(parsedValue) ? fallback.value : parsedValue,
      from: serialized.paramB ?? fallback.from,
      to: serialized.paramC ?? fallback.to,
    } as TBidValue;
  }

  if (fallback.type === "days-off-on-pattern") {
    if (serialized.operator === "Json" && serialized.paramA) {
      try {
        const parsed = JSON.parse(serialized.paramA);

        if (isRecord(parsed)) {
          return {
            ...fallback,
            minDaysOff: parsePatternNumber(parsed.minDaysOff, fallback.minDaysOff),
            minDaysOn: parsePatternNumber(parsed.minDaysOn, fallback.minDaysOn),
            maxDaysOn: parsePatternNumber(parsed.maxDaysOn, fallback.maxDaysOn),
            dateRange: parsePatternDateRange(parsed.dateRange),
          } as TBidValue;
        }
      } catch {
        return fallback;
      }
    }

    const parsedMinDaysOff = Number.parseInt(serialized.paramA ?? "", 10);
    const parsedMinDaysOn = Number.parseInt(serialized.paramB ?? "", 10);
    const parsedMaxDaysOn = Number.parseInt(serialized.paramC ?? "", 10);

    return {
      ...fallback,
      minDaysOff: Number.isNaN(parsedMinDaysOff) ? fallback.minDaysOff : parsedMinDaysOff,
      minDaysOn: Number.isNaN(parsedMinDaysOn) ? fallback.minDaysOn : parsedMinDaysOn,
      maxDaysOn: Number.isNaN(parsedMaxDaysOn) ? fallback.maxDaysOn : parsedMaxDaysOn,
    } as TBidValue;
  }

  if (fallback.type === "credit-density-preference") {
    const parsedMaximumWorkingDays = Number.parseInt(serialized.paramB ?? "", 10);
    const strength = serialized.paramC === "normal" || serialized.paramC === "strong" || serialized.paramC === "must_try"
      ? serialized.paramC
      : fallback.strength;

    return {
      ...fallback,
      minimumTotalCredit: serialized.paramA ?? fallback.minimumTotalCredit,
      maximumWorkingDays: Number.isNaN(parsedMaximumWorkingDays)
        ? fallback.maximumWorkingDays
        : parsedMaximumWorkingDays,
      strength,
    } as TBidValue;
  }

  if (fallback.type === "minimum-base-layover") {
    if (serialized.operator === "Json" && serialized.paramA) {
      try {
        return parseMinimumBaseLayoverBid(JSON.parse(serialized.paramA), fallback) as TBidValue;
      } catch {
        return fallback;
      }
    }

    return {
      ...fallback,
      minimumDuration: serialized.paramA ?? fallback.minimumDuration,
    } as TBidValue;
  }

  if (fallback.type === "credit-window-preference") {
    if (serialized.operator === "Json" && serialized.paramA) {
      try {
        return parseCreditWindowPreferenceBid(JSON.parse(serialized.paramA), fallback) as TBidValue;
      } catch {
        return fallback;
      }
    }

    return fallback;
  }

  if (fallback.type === "time" || fallback.type === "duration") {
    if (fallback.type === "duration" && serialized.operator === "Between") {
      return {
        type: "duration-range",
        from: serialized.paramA ?? fallback.value,
        to: serialized.paramB ?? fallback.value,
      } as TBidValue;
    }

    return {
      ...fallback,
      value: serialized.paramA ?? fallback.value,
      ...(extractCompareOperator(serialized.operator) ? { operator: extractCompareOperator(serialized.operator) } : {}),
    } as TBidValue;
  }

  if (fallback.type === "time-range" || fallback.type === "date-range" || fallback.type === "duration-range") {
    if (fallback.type === "time-range" && serialized.operator && serialized.operator !== "Between") {
      return {
        type: "time",
        value: serialized.paramA ?? fallback.from,
        ...(extractCompareOperator(serialized.operator) ? { operator: extractCompareOperator(serialized.operator) } : {}),
      } as TBidValue;
    }

    if (fallback.type === "duration-range" && serialized.operator && serialized.operator !== "Between") {
      return {
        type: "duration",
        value: serialized.paramA ?? fallback.from,
        ...(extractCompareOperator(serialized.operator) ? { operator: extractCompareOperator(serialized.operator) } : {}),
      } as TBidValue;
    }

    return {
      ...fallback,
      from: serialized.paramA ?? fallback.from,
      to: serialized.paramB ?? fallback.to,
    } as TBidValue;
  }

  if (fallback.type === "time-condition-list") {
    if (serialized.operator === "Or" && serialized.paramA) {
      try {
        const conditions = JSON.parse(serialized.paramA);

        if (Array.isArray(conditions)) {
          return {
            ...fallback,
            conditions: conditions.flatMap((condition): TimeConditionListBid["conditions"] => {
              if (condition?.operator === "Between") {
                const from = String(condition.from ?? "");
                const to = String(condition.to ?? "");

                return from.trim().length > 0 && to.trim().length > 0 ? [{
                  operator: "Between",
                  from,
                  to,
                }] : [];
              }

              const operator = condition?.operator === "<" || condition?.operator === ">" ? condition.operator : "=";
              const value = String(condition?.value ?? "");

              return value.trim().length > 0 ? [{
                operator,
                value,
              }] : [];
            }),
          } as TBidValue;
        }
      } catch {
        return fallback;
      }
    }

    return fallback;
  }

  if (fallback.type === "time-range-date") {
    if (serialized.operator && serialized.operator !== "Between") {
      return {
        type: "time-date",
        value: serialized.paramA ?? fallback.from,
        date: serialized.paramB ?? fallback.date,
        ...(extractCompareOperator(serialized.operator) ? { operator: extractCompareOperator(serialized.operator) } : {}),
      } as TBidValue;
    }

    return {
      ...fallback,
      from: serialized.paramA ?? fallback.from,
      to: serialized.paramB ?? fallback.to,
      date: serialized.paramC ?? fallback.date,
    } as TBidValue;
  }

  if (fallback.type === "date-or-dow-list") {
    if (serialized.operator === "Between") {
      return {
        type: "date-range",
        from: serialized.paramA ?? "",
        to: serialized.paramB ?? "",
      } as TBidValue;
    }

    if (serialized.operator !== "In" || !serialized.paramA) {
      return fallback;
    }

    try {
      const parsed = JSON.parse(serialized.paramA) as Partial<DateOrDowListBid>;
      return {
        ...fallback,
        dates: Array.isArray(parsed.dates) ? parsed.dates.filter((value): value is string => typeof value === "string") : [],
        daysOfWeek: Array.isArray(parsed.daysOfWeek)
          ? parsed.daysOfWeek.filter((value): value is DateOrDowListBid["daysOfWeek"][number] =>
            value === "MON"
            || value === "TUE"
            || value === "WED"
            || value === "THU"
            || value === "FRI"
            || value === "SAT"
            || value === "SUN")
          : [],
      } as TBidValue;
    } catch {
      return fallback;
    }
  }

  if (fallback.type === "work-day-preference") {
    if (serialized.operator !== "Json" || !serialized.paramA) {
      return fallback;
    }

    try {
      return parseWorkDayPreferenceBid(JSON.parse(serialized.paramA), fallback) as TBidValue;
    } catch {
      return fallback;
    }
  }

  if (fallback.type === "airport-preference") {
    if (serialized.operator !== "Json" || !serialized.paramA) {
      return fallback;
    }

    try {
      return parseAirportPreferenceBid(JSON.parse(serialized.paramA), fallback) as TBidValue;
    } catch {
      return fallback;
    }
  }

  if (fallback.type === "pairing-preference") {
    if (serialized.operator === "Json" && serialized.paramA) {
      try {
        return parsePairingPreferenceBid(JSON.parse(serialized.paramA), fallback) as TBidValue;
      } catch {
        return fallback;
      }
    }

    const pairingIds = (serialized.paramA ?? "")
      .split(",")
      .map((token) => token.trim())
      .filter((token) => token.length > 0);
    const pairingLabels = parsePairingLabels(serialized.paramC);

    return {
      ...fallback,
      pairingIds: pairingIds.length > 0 ? pairingIds : [...fallback.pairingIds],
      pairingLabels: pairingLabels ?? (fallback.pairingLabels ? [...fallback.pairingLabels] : undefined),
    } as TBidValue;
  }

  if (fallback.type === "pairing-check-time") {
    if (serialized.operator !== "Json" || !serialized.paramA) {
      return fallback;
    }

    try {
      return parsePairingCheckTimeBid(JSON.parse(serialized.paramA), fallback) as TBidValue;
    } catch {
      return fallback;
    }
  }

  if (fallback.type === "pairing-length-preference") {
    if (serialized.operator !== "Json" || !serialized.paramA) {
      return fallback;
    }

    try {
      return parsePairingLengthBid(JSON.parse(serialized.paramA), fallback) as TBidValue;
    } catch {
      return fallback;
    }
  }

  if (fallback.type === "month-end-carryover") {
    if (serialized.operator !== "Json" || !serialized.paramA) {
      return fallback;
    }

    try {
      return parseMonthEndCarryoverBid(JSON.parse(serialized.paramA), fallback) as TBidValue;
    } catch {
      return fallback;
    }
  }

  if (fallback.type === "deadhead-flying") {
    if (serialized.operator !== "Json" || !serialized.paramA) {
      return fallback;
    }

    try {
      return parseDeadheadFlyingBid(JSON.parse(serialized.paramA), fallback) as TBidValue;
    } catch {
      return fallback;
    }
  }

  if (fallback.type === "flight-number-preference") {
    if (serialized.operator !== "Json" || !serialized.paramA) {
      return fallback;
    }

    try {
      return parseFlightNumberPreferenceBid(JSON.parse(serialized.paramA), fallback) as TBidValue;
    } catch {
      return fallback;
    }
  }

  if (fallback.type === "redeye-preference") {
    if (serialized.operator !== "Json" || !serialized.paramA) {
      return fallback;
    }

    try {
      return parseRedeyePreferenceBid(JSON.parse(serialized.paramA), fallback) as TBidValue;
    } catch {
      return fallback;
    }
  }

  if (fallback.type === "select") {
    return {
      ...fallback,
      value: serialized.paramA ?? fallback.value,
      options: [...fallback.options],
    } as TBidValue;
  }

  if (fallback.type === "reserve-call-type-date-scope") {
    let dateScope: ReserveDateScope = { mode: "whole_month" };

    if (serialized.paramB) {
      try {
        dateScope = parseReserveDateScope(JSON.parse(serialized.paramB)) ?? { mode: "whole_month" };
      } catch {
        dateScope = { mode: "whole_month" };
      }
    }

    return {
      ...fallback,
      callType: serialized.paramA ?? fallback.callType,
      options: [...fallback.options],
      dateScope,
    } as TBidValue;
  }

  if (fallback.type === "reserve-flying-date-pattern") {
    const strength = serialized.paramB === "normal" || serialized.paramB === "strong" || serialized.paramB === "must_try"
      ? serialized.paramB
      : fallback.strength;

    if (!serialized.paramA) {
      return {
        ...fallback,
        segments: fallback.segments.map((segment) =>
          segment.workType === "reserve"
            ? { ...segment, dateScope: cloneReserveDateScope(segment.dateScope) }
            : { ...segment, dateScope: cloneReserveDateScope(segment.dateScope) }),
        callTypeOptions: [...fallback.callTypeOptions],
        strength,
      } as TBidValue;
    }

    try {
      const parsedSegments = JSON.parse(serialized.paramA);
      const segments = Array.isArray(parsedSegments)
        ? parsedSegments.flatMap((segment): typeof fallback.segments => {
          const dateScope = parseReserveDateScope(segment?.dateScope);

          if (!dateScope) {
            return [];
          }

          if (segment?.workType === "reserve") {
            return [{
              workType: "reserve",
              callType: typeof segment.callType === "string" ? segment.callType : fallback.callTypeOptions[0] ?? "",
              dateScope,
            }];
          }

          if (segment?.workType === "flying") {
            return [{
              workType: "flying",
              dateScope,
            }];
          }

          return [];
        })
        : [];

      return {
        ...fallback,
        segments: segments.length > 0 ? segments : fallback.segments.map((segment) =>
          segment.workType === "reserve"
            ? { ...segment, dateScope: cloneReserveDateScope(segment.dateScope) }
            : { ...segment, dateScope: cloneReserveDateScope(segment.dateScope) }),
        callTypeOptions: [...fallback.callTypeOptions],
        strength,
      } as TBidValue;
    } catch {
      return fallback;
    }
  }

  if (fallback.type === "percent") {
    if (serialized.operator === "Between") {
      return {
        type: "percent-range",
        from: serialized.paramA ?? fallback.value,
        to: serialized.paramB ?? fallback.value,
      } as TBidValue;
    }

    return {
      ...fallback,
      value: serialized.paramA ?? fallback.value,
      ...(extractCompareOperator(serialized.operator) ? { operator: extractCompareOperator(serialized.operator) } : {}),
    } as TBidValue;
  }

  if (fallback.type === "percent-or-duration") {
    const unit = serialized.paramB === "duration" ? "duration" : "percent";

    return {
      ...fallback,
      unit,
      value: serialized.paramA ?? fallback.value,
      ...(extractCompareOperator(serialized.operator) ? { operator: extractCompareOperator(serialized.operator) } : {}),
    } as TBidValue;
  }

  if (fallback.type === "tag-list") {
    const values = (serialized.paramA ?? "")
      .split(",")
      .map((token) => token.trim())
      .filter((token) => token.length > 0);

    return {
      ...fallback,
      values: values.length > 0 ? values : [...fallback.values],
      suggestions: fallback.suggestions ? [...fallback.suggestions] : undefined,
    } as TBidValue;
  }

  if (fallback.type === "tag-list-date") {
    const values = (serialized.paramA ?? "")
      .split(",")
      .map((token) => token.trim())
      .filter((token) => token.length > 0);

    return {
      ...fallback,
      values: values.length > 0 ? values : [...fallback.values],
      date: serialized.paramB ?? fallback.date,
      suggestions: fallback.suggestions ? [...fallback.suggestions] : undefined,
    } as TBidValue;
  }

  if (fallback.type === "pairing-id-list") {
    const pairingIds = (serialized.paramA ?? "")
      .split(",")
      .map((token) => token.trim())
      .filter((token) => token.length > 0);
    let pairingLabels: string[] | undefined;

    if (serialized.paramC) {
      try {
        const parsedLabels = JSON.parse(serialized.paramC);
        pairingLabels = Array.isArray(parsedLabels)
          ? parsedLabels.filter((label): label is string =>
            typeof label === "string" && label.trim().length > 0)
          : undefined;
      } catch {
        pairingLabels = undefined;
      }
    }

    return {
      ...fallback,
      pairingIds: pairingIds.length > 0 ? pairingIds : [...fallback.pairingIds],
      pairingLabels: pairingLabels ?? (fallback.pairingLabels ? [...fallback.pairingLabels] : undefined),
    } as TBidValue;
  }

  if (fallback.type === "crew-days-off-share") {
    const parsedMinimumDays = Number.parseInt(serialized.paramB ?? "", 10);

    return {
      ...fallback,
      employeeNumber: serialized.paramA ?? fallback.employeeNumber,
      minimumDays: Number.isNaN(parsedMinimumDays) ? fallback.minimumDays : parsedMinimumDays,
    } as TBidValue;
  }

  if (fallback.type === "employee-schedule-preference") {
    const mode = parseEmployeeSchedulePreferenceMode(serialized.paramB);
    const newDays = Number.parseInt(serialized.paramC ?? "", 10);
    const legacyDays = Number.parseInt(serialized.paramB ?? "", 10);
    const hasNewMode = [
      "same_days_off",
      "opposite_days_off",
      "same_pairing",
      "different_pairing",
    ].includes(serialized.paramB ?? "");

    return {
      ...fallback,
      crewId: serialized.paramA ?? getFallbackEmployeeSchedulePreferenceCrewId(fallback),
      ...mode,
      thresholdType: serialized.operator === "Maximum" ? "maximum" : "minimum",
      days: hasNewMode
        ? Number.isNaN(newDays) ? fallback.days : newDays
        : Number.isNaN(legacyDays) ? fallback.days : legacyDays,
    } as TBidValue;
  }

  if (fallback.type === "text") {
    return {
      ...fallback,
      value: serialized.paramA ?? fallback.value,
    } as TBidValue;
  }

  return fallback;
};

export { formatRuleBid } from "./rule-bid-format.js";
