import type {
  PairingBidOperator,
  PairingBidValue,
  WorkDayPreferenceWindow,
} from "@/features/pairing/types";

export type TagListBid = Extract<PairingBidValue, { type: "tag-list" | "tag-list-date" }>;
export type PairingIdListBid = Extract<PairingBidValue, { type: "pairing-id-list" }>;

export const clampPairingBidNumber = (value: number, min?: number, max?: number) => {
  let nextValue = value;

  if (typeof min === "number") {
    nextValue = Math.max(min, nextValue);
  }

  if (typeof max === "number") {
    nextValue = Math.min(max, nextValue);
  }

  return nextValue;
};

export const normalizePairingBidTag = (token: string) => token.trim().toUpperCase();

export const parsePairingBidTagInput = (raw: string) =>
  raw
    .split(",")
    .map((token) => normalizePairingBidTag(token))
    .filter((token) => token.length > 0);

export const parsePairingBidNumberInput = (raw: string) => {
  if (raw === "") {
    return null;
  }

  const nextValue = Number(raw);
  return Number.isNaN(nextValue) ? null : nextValue;
};

const DURATION_PATTERN = /^(\d{1,3}):(\d{2})$/;
const TIME_OF_DAY_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const isValidOptionalWorkDayTime = (value: string | null) =>
  value == null || TIME_OF_DAY_PATTERN.test(value);

export const isCompleteWorkDayPreferenceWindow = (window: WorkDayPreferenceWindow) =>
  isValidOptionalWorkDayTime(window.checkInFrom)
  && isValidOptionalWorkDayTime(window.checkInTo)
  && (window.checkInFrom == null || window.checkInTo == null || window.checkInFrom !== window.checkInTo);

export const isValidPairingBidDuration = (raw: string) => {
  const match = raw.trim().match(DURATION_PATTERN);

  if (!match) {
    return false;
  }

  return Number.parseInt(match[2], 10) < 60;
};

export const normalizePairingBidPercent = (raw: string) => raw.trim().replace(/\s*%$/, "");

export const isValidPairingBidPercent = (raw: string) => {
  const value = normalizePairingBidPercent(raw);

  if (value.length === 0) {
    return false;
  }

  return /^[+-]?(?:\d+|\d*\.\d+)$/.test(value);
};

export const normalizePairingBidDuration = (raw: string) => {
  const value = raw.trim();
  const match = value.match(DURATION_PATTERN);

  if (!match || Number.parseInt(match[2], 10) >= 60) {
    return value;
  }

  const hours = match[1].length === 1 ? `0${match[1]}` : match[1];
  return `${hours}:${match[2]}`;
};

const toCompareOperator = (operator: PairingBidOperator) =>
  operator === "Between" || operator === "In" ? undefined : operator;

const isCompleteAirportPreferenceDateScope = (
  dateScope: Extract<PairingBidValue, { type: "airport-preference" }>["dateScope"],
) => {
  if (!dateScope) {
    return true;
  }

  if (dateScope.mode === "specific_dates") {
    return dateScope.dates.length > 0 && dateScope.dates.every((date) => /^\d{4}-\d{2}-\d{2}$/.test(date));
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(dateScope.from)
    && /^\d{4}-\d{2}-\d{2}$/.test(dateScope.to)
    && dateScope.to >= dateScope.from;
};

const isCompletePairingCheckTimeDateScope = (
  dateScope: Extract<PairingBidValue, { type: "pairing-check-time" }>["dateScope"],
) => {
  if (!dateScope) {
    return true;
  }

  if (dateScope.mode === "specific_dates") {
    return dateScope.dates.length > 0
      && dateScope.dates.every((date) => /^\d{4}-\d{2}-\d{2}$/.test(date));
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(dateScope.from)
    && /^\d{4}-\d{2}-\d{2}$/.test(dateScope.to)
    && dateScope.from <= dateScope.to;
};

const isCompletePairingLengthDateScope = (
  dateScope: Extract<PairingBidValue, { type: "pairing-length-preference" }>["dateScope"],
) => {
  if (!dateScope) {
    return true;
  }

  if (dateScope.mode === "specific_dates") {
    return dateScope.dates.length > 0
      && dateScope.dates.every((date) => /^\d{4}-\d{2}-\d{2}$/.test(date));
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(dateScope.from)
    && /^\d{4}-\d{2}-\d{2}$/.test(dateScope.to)
    && dateScope.from <= dateScope.to;
};

const isCompletePairingLengthBid = (
  bid: Extract<PairingBidValue, { type: "pairing-length-preference" }>,
) => {
  const min = bid.min ?? 1;
  const max = bid.max;
  const hasMin = bid.minDays != null;
  const hasMax = bid.maxDays != null;
  const isValidDayValue = (value: number | null) =>
    value == null
      || (Number.isSafeInteger(value)
        && value >= min
        && (max === undefined || value <= max));

  return (hasMin || hasMax)
    && isValidDayValue(bid.minDays)
    && isValidDayValue(bid.maxDays)
    && (bid.minDays == null || bid.maxDays == null || bid.minDays <= bid.maxDays)
    && isCompletePairingLengthDateScope(bid.dateScope);
};

const isCompleteMonthEndCarryoverBid = (
  bid: Extract<PairingBidValue, { type: "month-end-carryover" }>,
) => {
  const isPositiveInteger = (value: number | null | undefined): value is number =>
    value != null && Number.isSafeInteger(value) && value > 0;

  return bid.operator === "Between"
    ? isPositiveInteger(bid.from) && isPositiveInteger(bid.to) && bid.from <= bid.to
    : isPositiveInteger(bid.days);
};

const isCompleteFlightNumberPreferenceBid = (
  bid: Extract<PairingBidValue, { type: "flight-number-preference" }>,
) => {
  const dateScope = bid.dateScope;
  const hasDateScope = dateScope === null
    || dateScope === undefined
    || (dateScope.mode === "specific_dates"
      ? dateScope.dates.length > 0
        && dateScope.dates.every((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
      : dateScope.from.trim().length > 0 && dateScope.to.trim().length > 0 && dateScope.from <= dateScope.to);

  return bid.flightNumbers.some((value) => value.trim().length > 0)
    && hasDateScope;
};

const isCompleteRedeyePreferenceBid = (
  bid: Extract<PairingBidValue, { type: "redeye-preference" }>,
) => {
  const dateScope = bid.dateScope;

  return dateScope === null
    || dateScope === undefined
    || (dateScope.mode === "specific_dates"
      ? dateScope.dates.length > 0
        && dateScope.dates.every((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
      : /^\d{4}-\d{2}-\d{2}$/.test(dateScope.from)
        && /^\d{4}-\d{2}-\d{2}$/.test(dateScope.to)
        && dateScope.from <= dateScope.to);
};

const isCompleteDeadheadFlyingBid = (
  bid: Extract<PairingBidValue, { type: "deadhead-flying" }>,
) => {
  const dateScope = bid.dateScope;

  return (bid.mode === "any-deadhead" || bid.mode === "deadhead-only-duty")
    && (
      dateScope === null
      || dateScope === undefined
      || (dateScope.mode === "specific_dates"
        ? dateScope.dates.length > 0
          && dateScope.dates.every((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
        : /^\d{4}-\d{2}-\d{2}$/.test(dateScope.from)
          && /^\d{4}-\d{2}-\d{2}$/.test(dateScope.to)
          && dateScope.from <= dateScope.to)
    );
};

export const inferPairingBidOperator = (bid: PairingBidValue): PairingBidOperator => {
  if (
    bid.type === "pairing-check-time"
    || bid.type === "flight-legs-per-duty"
    || bid.type === "month-end-carryover"
  ) {
    return bid.operator;
  }

  if (
    bid.type === "time-range"
    || bid.type === "time-range-date"
    || bid.type === "date-range"
    || bid.type === "stepper-range"
    || bid.type === "stepper-range-date"
    || bid.type === "stepper-date-range"
    || bid.type === "days-off-on-pattern"
    || bid.type === "percent-range"
    || bid.type === "duration-range"
  ) {
    return "Between";
  }

  if (
    bid.type === "tag-list"
    || bid.type === "tag-list-date"
    || bid.type === "pairing-id-list"
    || bid.type === "date-or-dow-list"
    || bid.type === "pairing-occurrence-list"
    || bid.type === "crew-days-off-share"
    || bid.type === "employee-schedule-preference"
  ) {
    return "In";
  }

  if (bid.type === "time-condition-list") {
    const firstCondition = bid.conditions[0];
    return firstCondition?.operator ?? "=";
  }

  if (
    bid.type === "stepper"
    || bid.type === "date"
    || bid.type === "stepper-date"
    || bid.type === "time"
    || bid.type === "time-date"
    || bid.type === "percent"
    || bid.type === "duration"
  ) {
    return bid.operator ?? "=";
  }

  if (bid.type === "percent-or-duration") {
    return bid.operator ?? ">";
  }

  return "=";
};

export const transformPairingBidForOperator = (
  bid: PairingBidValue,
  nextOperator: PairingBidOperator,
): PairingBidValue => {
  if (bid.type === "stepper") {
    if (nextOperator === "Between") {
      return {
        type: "stepper-range",
        from: bid.value,
        to: bid.value,
        min: bid.min,
        max: bid.max,
      };
    }

    return { ...bid, operator: toCompareOperator(nextOperator) };
  }

  if (bid.type === "stepper-range") {
    if (nextOperator === "Between") {
      return bid;
    }

    return {
      type: "stepper",
      value: bid.from,
      min: bid.min,
      max: bid.max,
      operator: toCompareOperator(nextOperator),
    };
  }

  if (bid.type === "stepper-date") {
    if (nextOperator === "Between") {
      return {
        type: "stepper-range-date",
        from: bid.value,
        to: bid.value,
        date: bid.date,
        min: bid.min,
        max: bid.max,
      };
    }

    return { ...bid, operator: toCompareOperator(nextOperator) };
  }

  if (bid.type === "stepper-range-date") {
    if (nextOperator === "Between") {
      return bid;
    }

    return {
      type: "stepper-date",
      value: bid.from,
      date: bid.date,
      min: bid.min,
      max: bid.max,
      operator: toCompareOperator(nextOperator),
    };
  }

  if (bid.type === "time") {
    if (nextOperator === "Between") {
      return {
        type: "time-range",
        from: bid.value,
        to: bid.value,
      };
    }

    return { ...bid, operator: toCompareOperator(nextOperator) };
  }

  if (bid.type === "time-range") {
    if (nextOperator === "Between") {
      return bid;
    }

    return {
      type: "time",
      value: bid.from,
      operator: toCompareOperator(nextOperator),
    };
  }

  if (bid.type === "duration") {
    if (nextOperator === "Between") {
      return {
        type: "duration-range",
        from: bid.value,
        to: bid.value,
      };
    }

    return { ...bid, operator: toCompareOperator(nextOperator) };
  }

  if (bid.type === "duration-range") {
    if (nextOperator === "Between") {
      return bid;
    }

    return {
      type: "duration",
      value: bid.from,
      operator: toCompareOperator(nextOperator),
    };
  }

  if (bid.type === "time-condition-list") {
    if (nextOperator === "In") {
      return bid;
    }

    const firstCondition = bid.conditions[0];

    if (nextOperator === "Between") {
      const value = firstCondition?.operator === "Between" ? firstCondition.from : firstCondition?.value ?? "";

      return {
        ...bid,
        conditions: [{
          operator: "Between",
          from: value,
          to: firstCondition?.operator === "Between" ? firstCondition.to : value,
        }],
      };
    }

    const value = firstCondition?.operator === "Between" ? firstCondition.from : firstCondition?.value ?? "";

    return {
      ...bid,
      conditions: [{
        operator: nextOperator,
        value,
      }],
    };
  }

  if (bid.type === "time-date") {
    if (nextOperator === "Between") {
      return {
        type: "time-range-date",
        from: bid.value,
        to: bid.value,
        date: bid.date,
      };
    }

    return { ...bid, operator: toCompareOperator(nextOperator) };
  }

  if (bid.type === "time-range-date") {
    if (nextOperator === "Between") {
      return bid;
    }

    return {
      type: "time-date",
      value: bid.from,
      date: bid.date,
      operator: toCompareOperator(nextOperator),
    };
  }

  if (bid.type === "date-or-dow-list") {
    if (nextOperator === "Between") {
      const value = bid.dates[0] ?? "";
      return {
        type: "date-range",
        from: value,
        to: value,
      };
    }

    return bid;
  }

  if (bid.type === "date-range") {
    if (nextOperator === "In") {
      return {
        type: "date-or-dow-list",
        dates: bid.from.trim().length > 0 ? [bid.from] : [],
        daysOfWeek: [],
      };
    }

    return bid;
  }

  if (bid.type === "percent") {
    if (nextOperator === "Between") {
      return {
        type: "percent-range",
        from: bid.value,
        to: bid.value,
      };
    }

    return { ...bid, operator: toCompareOperator(nextOperator) };
  }

  if (bid.type === "percent-range") {
    if (nextOperator === "Between") {
      return bid;
    }

    return {
      type: "percent",
      value: bid.from,
      operator: toCompareOperator(nextOperator),
    };
  }

  if (bid.type === "percent-or-duration") {
    if (nextOperator !== "<" && nextOperator !== ">") {
      return bid;
    }

    return { ...bid, operator: nextOperator };
  }

  return bid;
};

export const isPairingBidComplete = (bid: PairingBidValue): boolean => {
  if (bid.type === "flag") {
    return true;
  }

  if (bid.type === "date" || bid.type === "time" || bid.type === "text" || bid.type === "percent") {
    return bid.value.trim().length > 0;
  }

  if (bid.type === "duration") {
    return isValidPairingBidDuration(bid.value);
  }

  if (bid.type === "percent-or-duration") {
    return bid.unit === "duration"
      ? isValidPairingBidDuration(bid.value)
      : isValidPairingBidPercent(bid.value);
  }

  if (bid.type === "stepper") {
    return true;
  }

  if (bid.type === "stepper-range") {
    return true;
  }

  if (bid.type === "stepper-date") {
    return bid.date.trim().length > 0;
  }

  if (bid.type === "stepper-range-date") {
    return bid.date.trim().length > 0;
  }

  if (bid.type === "stepper-date-range") {
    return bid.from.trim().length > 0 && bid.to.trim().length > 0;
  }

  if (bid.type === "pairing-length-preference") {
    return isCompletePairingLengthBid(bid);
  }

  if (bid.type === "month-end-carryover") {
    return isCompleteMonthEndCarryoverBid(bid);
  }

  if (bid.type === "flight-number-preference") {
    return isCompleteFlightNumberPreferenceBid(bid);
  }

  if (bid.type === "redeye-preference") {
    return isCompleteRedeyePreferenceBid(bid);
  }

  if (bid.type === "deadhead-flying") {
    return isCompleteDeadheadFlyingBid(bid);
  }

  if (bid.type === "time-range" || bid.type === "percent-range") {
    return bid.from.trim().length > 0 && bid.to.trim().length > 0;
  }

  if (bid.type === "date-range") {
    return bid.from.trim().length > 0 && bid.to.trim().length > 0 && bid.to >= bid.from;
  }

  if (bid.type === "duration-range") {
    return isValidPairingBidDuration(bid.from) && isValidPairingBidDuration(bid.to);
  }

  if (bid.type === "time-date") {
    return bid.value.trim().length > 0 && bid.date.trim().length > 0;
  }

  if (bid.type === "time-range-date") {
    return bid.from.trim().length > 0 && bid.to.trim().length > 0 && bid.date.trim().length > 0;
  }

  if (bid.type === "time-condition-list") {
    const firstCondition = bid.conditions[0];

    if (!firstCondition) {
      return false;
    }

    return firstCondition.operator === "Between"
      ? firstCondition.from.trim().length > 0 && firstCondition.to.trim().length > 0
      : firstCondition.value.trim().length > 0;
  }

  if (bid.type === "pairing-check-time") {
    return bid.operator === "Between"
      ? bid.from.trim().length > 0
        && bid.to.trim().length > 0
        && isCompletePairingCheckTimeDateScope(bid.dateScope)
      : bid.value.trim().length > 0 && isCompletePairingCheckTimeDateScope(bid.dateScope);
  }

  if (bid.type === "select") {
    return bid.value.trim().length > 0;
  }

  if (bid.type === "tag-list") {
    return bid.values.length > 0;
  }

  if (bid.type === "pairing-id-list") {
    return bid.pairingIds.length > 0;
  }

  if (bid.type === "date-or-dow-list") {
    return bid.dates.length > 0 || bid.daysOfWeek.length > 0;
  }

  if (bid.type === "work-day-preference") {
    return bid.days.length > 0
      && bid.days.every(isCompleteWorkDayPreferenceWindow);
  }

  if (bid.type === "airport-preference") {
    const locations = bid.locations.filter((location) =>
      /^[A-Za-z]{3}$/.test(location.code.trim())
      && (location.kind === "airport" || location.kind === "city"));

    return locations.length > 0
      && (bid.event === "landing" || bid.event === "layover" || bid.event === "landing_or_layover")
      && isCompleteAirportPreferenceDateScope(bid.dateScope)
      && (bid.minimumLayoverDuration == null
        || (bid.event !== "landing" && isValidPairingBidDuration(bid.minimumLayoverDuration)));
  }

  if (bid.type === "tag-list-date") {
    return bid.values.length > 0 && bid.date.trim().length > 0;
  }

  if (bid.type === "pairing-occurrence-list") {
    return bid.occurrences.length > 0;
  }

  if (bid.type === "crew-days-off-share") {
    return bid.employeeNumber.trim().length > 0 && bid.minimumDays > 0;
  }

  if (bid.type === "employee-schedule-preference") {
    const crewId = bid.crewId ?? (bid as { employeeNumber?: string }).employeeNumber ?? "";

    return crewId.trim().length > 0 && bid.days > 0;
  }

  if (bid.type === "days-off-on-pattern") {
    return bid.minDaysOff > 0
      && bid.minDaysOn > 0
      && bid.maxDaysOn > 0;
  }

  return false;
};
