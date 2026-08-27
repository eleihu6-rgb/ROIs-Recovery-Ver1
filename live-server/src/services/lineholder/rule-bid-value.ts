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
type WorkDayPreferenceBid = Extract<RuleBidValue, { type: "work-day-preference" }>;
type EmployeeSchedulePreferenceBid = Extract<RuleBidValue, { type: "employee-schedule-preference" }>;
type AirportPreferenceBid = Extract<RuleBidValue, { type: "airport-preference" }>;
type PairingPreferenceBid = Extract<RuleBidValue, { type: "pairing-preference" }>;
type PairingLengthBid = Extract<RuleBidValue, { type: "pairing-length-preference" }>;
type RedeyePreferenceBid = Extract<RuleBidValue, { type: "redeye-preference" }>;
type DeadheadFlyingBid = Extract<RuleBidValue, { type: "deadhead-flying" }>;

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

const parseOptionalPositiveInteger = (value: unknown) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : null;
};

const parseAirportPreferenceDateScope = (
  value: unknown,
): AirportPreferenceBid["dateScope"] => {
  if (!isRecord(value)) {
    return null;
  }

  if (value.mode === "specific_dates") {
    return { mode: "specific_dates", dates: normalizeTextArray(value.dates) };
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

const parseAirportPreferenceLocations = (value: unknown) => {
  const locationsByKey = new Map<string, AirportPreferenceBid["locations"][number]>();

  if (Array.isArray(value)) {
    for (const location of value) {
      if (!isRecord(location)) continue;
      const code = normalizeTextValue(location.code).toUpperCase();
      const kind = location.kind === "city" ? "city" : "airport";
      if (/^[A-Z]{3}$/.test(code)) {
        locationsByKey.set(`${kind}:${code}`, { code, kind });
      }
    }
  }

  return Array.from(locationsByKey.values());
};

const parseLegacyAirportPreferenceLocations = (value: unknown) => {
  const locationsByKey = new Map<string, AirportPreferenceBid["locations"][number]>();

  if (Array.isArray(value)) {
    for (const airport of normalizeTextArray(value)) {
      const code = airport.toUpperCase();
      if (/^[A-Z]{3}$/.test(code)) {
        locationsByKey.set(`airport:${code}`, { code, kind: "airport" });
      }
    }
  }

  return Array.from(locationsByKey.values());
};

const parseLegacyAirportPreferenceDateScope = (value: unknown): AirportPreferenceBid["dateScope"] => {
  if (!isRecord(value)) {
    return null;
  }

  if (value.mode === "specific_dates") {
    return { mode: "specific_dates", dates: normalizeTextArray(value.dates) };
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

const parseLegacyAirportPreferenceMinimumLayoverDuration = (
  value: unknown,
) => {
  if (!isRecord(value)) {
    return null;
  }

  if (value.operator === "Between") {
    return normalizeTextValue(value.from) || null;
  }

  return normalizeTextValue(value.value) || null;
};

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
  const locations = parseAirportPreferenceLocations(value.locations);
  const fallbackLocations = locations.length > 0
    ? locations
    : parseLegacyAirportPreferenceLocations(value.airports);
  const dateScope = parseAirportPreferenceDateScope(value.dateScope)
    ?? parseLegacyAirportPreferenceDateScope(value.dateCondition);
  const minimumLayoverDuration = event === "landing"
    ? null
    : normalizeTextValue(value.minimumLayoverDuration)
      || parseLegacyAirportPreferenceMinimumLayoverDuration(value.layoverDuration);

  return {
    type: "airport-preference",
    event,
    locations: fallbackLocations,
    dateScope,
    minimumLayoverDuration,
  };
};

const workDayValues = new Set<WorkDayPreferenceBid["days"][number]["dayOfWeek"]>([
  "MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN",
]);

const parseWorkDayPreferenceBid = (
  value: unknown,
  fallback: WorkDayPreferenceBid,
): WorkDayPreferenceBid => {
  if (!isRecord(value) || value.type !== "work-day-preference" || !Array.isArray(value.days)) {
    return fallback;
  }

  const days = value.days.flatMap((day): WorkDayPreferenceBid["days"] => {
    if (!isRecord(day) || !workDayValues.has(day.dayOfWeek as WorkDayPreferenceBid["days"][number]["dayOfWeek"])) {
      return [];
    }

    return [{
      dayOfWeek: day.dayOfWeek as WorkDayPreferenceBid["days"][number]["dayOfWeek"],
      checkInFrom: normalizeTextValue(day.checkInFrom) || null,
      checkInTo: normalizeTextValue(day.checkInTo) || null,
    }];
  });

  if (days.length === 0) {
    return fallback;
  }

  return {
    type: "work-day-preference",
    days,
    dateScope: parsePairingLengthDateScope(value.dateScope),
  };
};

const parseFlightNumberPreferenceBid = (
  value: unknown,
  fallback: Extract<RuleBidValue, { type: "flight-number-preference" }>,
): Extract<RuleBidValue, { type: "flight-number-preference" }> => {
  if (!isRecord(value) || value.type !== "flight-number-preference") {
    return fallback;
  }

  return {
    type: "flight-number-preference",
    flightNumbers: Array.isArray(value.flightNumbers)
      ? [...new Set(value.flightNumbers.map((flightNumber) => normalizeTextValue(flightNumber).toUpperCase()).filter(Boolean))]
      : [],
    dateScope: parsePairingLengthDateScope(value.dateScope),
  };
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
    dateScope: parsePairingLengthDateScope(value.dateScope),
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

  return {
    type: "deadhead-flying",
    mode: value.mode,
    dateScope: parsePairingLengthDateScope(value.dateScope),
  };
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

  if (fallback.type === "pairing-preference") {
    if (serialized.operator === "Json" && serialized.paramA) {
      try {
        return parsePairingPreferenceBid(JSON.parse(serialized.paramA), fallback) as TBidValue;
      } catch {
        return fallback;
      }
    }

    return cloneRuleBidValue(fallback);
  }

  if (fallback.type === "pairing-length-preference") {
    if (serialized.operator === "Json" && serialized.paramA) {
      try {
        return parsePairingLengthBid(JSON.parse(serialized.paramA), fallback) as TBidValue;
      } catch {
        return fallback;
      }
    }

    return cloneRuleBidValue(fallback);
  }

  if (fallback.type === "flight-number-preference") {
    if (serialized.operator === "Json" && serialized.paramA) {
      try {
        return parseFlightNumberPreferenceBid(JSON.parse(serialized.paramA), fallback) as TBidValue;
      } catch {
        return fallback;
      }
    }

    return cloneRuleBidValue(fallback);
  }

  if (fallback.type === "redeye-preference") {
    if (serialized.operator === "Json" && serialized.paramA) {
      try {
        return parseRedeyePreferenceBid(JSON.parse(serialized.paramA), fallback) as TBidValue;
      } catch {
        return fallback;
      }
    }

    return cloneRuleBidValue(fallback);
  }

  if (fallback.type === "deadhead-flying") {
    if (serialized.operator === "Json" && serialized.paramA) {
      try {
        return parseDeadheadFlyingBid(JSON.parse(serialized.paramA), fallback) as TBidValue;
      } catch {
        return fallback;
      }
    }

    return cloneRuleBidValue(fallback);
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
