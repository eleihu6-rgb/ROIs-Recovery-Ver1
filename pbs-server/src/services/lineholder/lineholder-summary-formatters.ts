import type { PbsLineholderCurrentSummaryResponse } from "../../../../packages/contracts/pbs-lineholder-summary.js";
import {
  formatPbsPairingLengthSummary,
  pbsPairingF8PropertyCodes,
  type PbsPairingLengthDateScope,
} from "../../../../packages/contracts/pbs-pairing-bids.js";

type SummaryAction = PbsLineholderCurrentSummaryResponse["summaryItems"][number]["action"];
type SummaryBidType = PbsLineholderCurrentSummaryResponse["summaryItems"][number]["bidType"];

export type LineholderSummaryFormatInput = {
  bidType: SummaryBidType;
  action: SummaryAction;
  propertyCode: number;
  label: string;
  operator: string | null;
  paramA: string | null;
  paramB: string | null;
  paramC: string | null;
};

type ReserveDateScope =
  | { mode: "whole_month" }
  | { mode: "first_half" }
  | { mode: "second_half" }
  | { mode: "date_range"; from?: string; to?: string }
  | { mode: "specific_dates"; dates?: string[] };

type ReserveFlyingSegment =
  | { workType: "reserve"; callType?: string; dateScope?: ReserveDateScope }
  | { workType: "flying"; dateScope?: ReserveDateScope };

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const safeParseJson = (value: string | null): unknown => {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const normalizeList = (value: string | null) =>
  (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

export const formatSummaryDate = (value: string) => {
  if (!ISO_DATE_PATTERN.test(value)) {
    return value;
  }

  const [yearText, monthText, dayText] = value.split("-");
  const year = Number.parseInt(yearText ?? "", 10);
  const month = Number.parseInt(monthText ?? "", 10);
  const day = Number.parseInt(dayText ?? "", 10);

  if (!Number.isSafeInteger(year) || !Number.isSafeInteger(month) || !Number.isSafeInteger(day)) {
    return value;
  }

  return `${MONTH_LABELS[month - 1] ?? monthText} ${day}, ${year}`;
};

const formatList = (values: string[]) => values.join(", ");

const formatMaybeDateList = (value: string | null) =>
  formatList(normalizeList(value).map(formatSummaryDate));

const parseDateOrDowList = (value: string | null) => {
  const parsed = safeParseJson(value);

  if (!isRecord(parsed)) {
    return formatMaybeDateList(value);
  }

  const dates = Array.isArray(parsed.dates)
    ? parsed.dates.filter((date): date is string => typeof date === "string")
    : [];
  const daysOfWeek = Array.isArray(parsed.daysOfWeek)
    ? parsed.daysOfWeek.filter((day): day is string => typeof day === "string")
    : [];

  return formatList([
    ...dates.map(formatSummaryDate),
    ...daysOfWeek.map((day) => day.slice(0, 1) + day.slice(1).toLowerCase()),
  ]);
};

const formatRange = (from: string | null, to: string | null, formatter: (value: string) => string = (value) => value) =>
  from && to ? `between ${formatter(from)} and ${formatter(to)}` : formatter(from ?? to ?? "");

const formatComparison = (
  operator: string | null,
  paramA: string | null,
  paramB: string | null,
  unit = "",
  formatter: (value: string) => string = (value) => value,
) => {
  const suffix = unit ? ` ${unit}` : "";

  if (operator === "Between") {
    return formatRange(paramA, paramB, formatter) + suffix;
  }

  const value = formatter(paramA ?? "");

  if (operator === "<") {
    return `less than ${value}${suffix}`;
  }

  if (operator === ">") {
    return `greater than ${value}${suffix}`;
  }

  if (operator === "=") {
    return `${value}${suffix}`;
  }

  return `${value}${suffix}`.trim();
};

const formatMonthEndCarryoverComparison = (input: LineholderSummaryFormatInput) => {
  const parsed = input.operator === "Json" ? safeParseJson(input.paramA) : null;

  if (isRecord(parsed) && parsed.type === "month-end-carryover") {
    if (parsed.operator === "Between") {
      return typeof parsed.from === "number" && typeof parsed.to === "number"
        ? `between ${parsed.from} and ${parsed.to} days`
        : "";
    }

    if (
      (parsed.operator === "<" || parsed.operator === "=" || parsed.operator === ">")
      && typeof parsed.days === "number"
    ) {
      return formatComparison(parsed.operator, String(parsed.days), null, "days");
    }
  }

  return formatComparison(input.operator, input.paramA, input.paramB, "days");
};

const formatDeadheadFlyingSummary = (input: LineholderSummaryFormatInput) => {
  const parsed = input.operator === "Json" ? safeParseJson(input.paramA) : null;

  if (!isRecord(parsed) || parsed.type !== "deadhead-flying") {
    return null;
  }

  const mode = parsed.mode === "any-deadhead"
    ? "pairings with any deadhead"
    : parsed.mode === "deadhead-only-duty"
      ? "pairings with a deadhead-only duty"
      : null;
  if (!mode) {
    return null;
  }

  const dateScope = isRecord(parsed.dateScope)
    ? parsed.dateScope.mode === "specific_dates" && Array.isArray(parsed.dateScope.dates)
      ? ` on ${parsed.dateScope.dates
        .filter((date): date is string => typeof date === "string")
        .map(formatSummaryDate)
        .join(", ")}`
      : parsed.dateScope.mode === "date_range"
        && typeof parsed.dateScope.from === "string"
        && typeof parsed.dateScope.to === "string"
        ? ` from ${formatSummaryDate(parsed.dateScope.from)} to ${formatSummaryDate(parsed.dateScope.to)}`
        : ""
    : "";

  return `${mode}${dateScope}`;
};

const formatFallbackValue = (
  operator: string | null,
  paramA: string | null,
  paramB: string | null,
  paramC: string | null,
) => {
  if (operator === "Between" && paramA && paramB) {
    return `${paramA} - ${paramB}`;
  }

  if (paramA && paramB && paramC) {
    return `${paramA} / ${paramB} / ${paramC}`;
  }

  if (paramA && paramB) {
    return `${paramA} - ${paramB}`;
  }

  if (paramA) {
    return paramA;
  }

  return "Enabled";
};

const formatFallbackReadableText = (
  action: SummaryAction,
  label: string,
  operator: string | null,
  value: string,
) => {
  if (action === "Award") {
    return operator && operator !== "In" ? `Award ${label} ${operator} ${value}` : `Award ${label}: ${value}`;
  }

  if (action === "Avoid") {
    return operator && operator !== "In" ? `Avoid ${label} ${operator} ${value}` : `Avoid ${label}: ${value}`;
  }

  return operator && operator !== "In" ? `Set ${label} ${operator} ${value}` : `Set ${label}: ${value}`;
};

const actionWord = (action: SummaryAction) => action === "Avoid" ? "Avoid" : "Award";

const quantifierWord = (value: string | null) => value === "every" ? "every" : "any";

const plural = (single: string, count: number, many = `${single}s`) => count === 1 ? single : many;

const formatPairingIds = (paramA: string | null, paramC: string | null) => {
  const labels = safeParseJson(paramC);
  if (Array.isArray(labels) && labels.every((label) => typeof label === "string") && labels.length > 0) {
    return labels.join(", ");
  }

  return formatList(normalizeList(paramA));
};

const parsePairingPreferenceLabels = (input: LineholderSummaryFormatInput) => {
  if (input.operator !== "Json") {
    return null;
  }

  const parsed = safeParseJson(input.paramA);
  if (
    !isRecord(parsed)
    || parsed.type !== "pairing-preference"
    || !Array.isArray(parsed.pairingIds)
    || !Array.isArray(parsed.pairingLabels)
  ) {
    return null;
  }

  const pairingIds = parsed.pairingIds.filter((id): id is string => typeof id === "string");
  const pairingLabels = parsed.pairingLabels
    .filter((label): label is string => typeof label === "string")
    .map((label) => label.trim())
    .filter((label) => label.length > 0);

  if (
    pairingLabels.length === 0
    || pairingLabels.length !== pairingIds.length
    || pairingIds.length !== parsed.pairingIds.length
    || pairingLabels.length !== parsed.pairingLabels.length
  ) {
    return null;
  }

  return pairingLabels;
};

const formatPairingPreferenceLabels = (pairingLabels: string[]) => {
  const countsByLabel = new Map<string, number>();

  for (const label of pairingLabels) {
    countsByLabel.set(label, (countsByLabel.get(label) ?? 0) + 1);
  }

  const hasRepeatedLabel = Array.from(countsByLabel.values()).some((count) => count > 1);

  return hasRepeatedLabel
    ? Array.from(countsByLabel.entries())
      .map(([label, count]) => `${label} ×${count}`)
      .join(", ")
    : pairingLabels.join(", ");
};

const formatPairingPreference = (input: LineholderSummaryFormatInput) => {
  const pairingLabels = parsePairingPreferenceLabels(input);
  if (!pairingLabels) {
    return null;
  }

  return withAction(
    input,
    `${plural("pairing", pairingLabels.length)} ${formatPairingPreferenceLabels(pairingLabels)}`,
  );
};

const withAction = (input: LineholderSummaryFormatInput, text: string) =>
  `${actionWord(input.action)} ${text}`;

const formatPairingCheckTimeSummary = (input: LineholderSummaryFormatInput) => {
  if (input.operator !== "Json") {
    return null;
  }

  const parsed = safeParseJson(input.paramA);

  if (!isRecord(parsed) || parsed.type !== "pairing-check-time") {
    return null;
  }

  const timeType = parsed.timeType === "check_out" ? "check-out" : "check-in";
  const time = parsed.operator === "Between"
    && typeof parsed.from === "string"
    && typeof parsed.to === "string"
    ? formatRange(parsed.from, parsed.to)
    : (parsed.operator === "=" || parsed.operator === "<" || parsed.operator === ">")
      && typeof parsed.value === "string"
      ? formatComparison(parsed.operator, parsed.value, null)
      : null;

  if (!time) {
    return null;
  }

  const dateScope = isRecord(parsed.dateScope)
    ? parsed.dateScope.mode === "specific_dates" && Array.isArray(parsed.dateScope.dates)
      ? ` on ${parsed.dateScope.dates
        .filter((date): date is string => typeof date === "string")
        .map(formatSummaryDate)
        .join(", ")}`
      : parsed.dateScope.mode === "specific_date" && typeof parsed.dateScope.date === "string"
        ? ` on ${formatSummaryDate(parsed.dateScope.date)}`
      : parsed.dateScope.mode === "date_range"
        && typeof parsed.dateScope.from === "string"
        && typeof parsed.dateScope.to === "string"
        ? ` from ${formatSummaryDate(parsed.dateScope.from)} to ${formatSummaryDate(parsed.dateScope.to)}`
        : ""
    : "";

  return `pairings checking ${timeType} ${time}${dateScope}`;
};

const formatFlightLegsPerDutySummary = (input: LineholderSummaryFormatInput) => {
  if (input.operator !== "Json") {
    return `pairings with ${quantifierWord(input.paramC)} duty legs ${formatComparison(
      input.operator,
      input.paramA,
      input.paramB,
    )}`;
  }

  const parsed = safeParseJson(input.paramA);
  if (!isRecord(parsed) || parsed.type !== "flight-legs-per-duty") {
    return null;
  }

  const comparison = parsed.operator === "Between"
    && typeof parsed.from === "number"
    && typeof parsed.to === "number"
    ? `between ${parsed.from} and ${parsed.to}`
    : (parsed.operator === "=" || parsed.operator === "<" || parsed.operator === ">")
      && typeof parsed.legs === "number"
      ? `${parsed.operator} ${parsed.legs}`
      : null;
  if (!comparison) {
    return null;
  }

  const dateScope = isRecord(parsed.dateScope)
    ? parsed.dateScope.mode === "specific_dates" && Array.isArray(parsed.dateScope.dates)
      ? ` on ${parsed.dateScope.dates
        .filter((date): date is string => typeof date === "string")
        .map(formatSummaryDate)
        .join(", ")}`
      : parsed.dateScope.mode === "date_range"
        && typeof parsed.dateScope.from === "string"
        && typeof parsed.dateScope.to === "string"
        ? ` from ${formatSummaryDate(parsed.dateScope.from)} to ${formatSummaryDate(parsed.dateScope.to)}`
        : ""
    : "";

  return `pairings with ${quantifierWord(input.paramC)} duty having ${comparison} flying legs${dateScope}`;
};

const formatAirportPreferenceSummary = (input: LineholderSummaryFormatInput) => {
  if (input.operator !== "Json") {
    return null;
  }

  const parsed = safeParseJson(input.paramA);

  if (!isRecord(parsed) || parsed.type !== "airport-preference") {
    return null;
  }

  const locations = Array.isArray(parsed.locations)
    ? parsed.locations
      .map((location) => isRecord(location) && typeof location.code === "string" ? location.code.trim().toUpperCase() : "")
      .filter((code) => code.length > 0)
    : [];

  if (locations.length === 0) {
    return null;
  }

  const eventPhrase = parsed.event === "layover"
    ? "layover at"
    : parsed.event === "both" || parsed.event === "landing_or_layover"
      ? "landing or layover at"
      : "landing at";
  const dateScope = isRecord(parsed.dateScope)
    ? parsed.dateScope.mode === "specific_dates" && Array.isArray(parsed.dateScope.dates)
      ? ` on ${parsed.dateScope.dates
        .filter((date): date is string => typeof date === "string")
        .map(formatSummaryDate)
        .join(", ")}`
      : parsed.dateScope.mode === "date_range"
        && typeof parsed.dateScope.from === "string"
        && typeof parsed.dateScope.to === "string"
        ? ` from ${formatSummaryDate(parsed.dateScope.from)} to ${formatSummaryDate(parsed.dateScope.to)}`
        : ""
    : "";
  const layoverDuration = typeof parsed.minimumLayoverDuration === "string"
    && parsed.minimumLayoverDuration.trim().length > 0
    ? ` with preferred layover at least ${parsed.minimumLayoverDuration.trim()}`
    : "";

  return `pairings ${eventPhrase} ${locations.join(", ")}${dateScope}${layoverDuration}`;
};

type StructuredPairingSummary = {
  value: string;
  pairingPhrase: string;
};

type StructuredPairingSummaryFormatter = (
  input: LineholderSummaryFormatInput,
  bid: Record<string, unknown>,
) => StructuredPairingSummary | null;

type StructuredPairingSummaryFormatterDefinition = {
  propertyCode: number;
  format: StructuredPairingSummaryFormatter;
};

const capitalizeFirst = (value: string) => value.length > 0
  ? value.slice(0, 1).toUpperCase() + value.slice(1)
  : value;

const stripPairingsPrefix = (value: string) => capitalizeFirst(
  value.replace(/^pairings(?: with)?\s+/i, ""),
);

const formatStructuredDateScope = (
  value: unknown,
  scopeKind: "event" | "starting" = "event",
): string | null => {
  if (value == null) {
    return "";
  }

  if (!isRecord(value)) {
    return null;
  }

  if (value.mode === "specific_dates") {
    if (
      !Array.isArray(value.dates)
      || value.dates.length === 0
      || value.dates.some((date) => typeof date !== "string" || !ISO_DATE_PATTERN.test(date))
    ) {
      return null;
    }

    const dates = [...new Set(value.dates as string[])]
      .sort()
      .map(formatSummaryDate)
      .join(", ");

    return `${scopeKind === "starting" ? "starting on" : "on"} ${dates}`;
  }

  if (
    value.mode !== "date_range"
    || typeof value.from !== "string"
    || typeof value.to !== "string"
    || !ISO_DATE_PATTERN.test(value.from)
    || !ISO_DATE_PATTERN.test(value.to)
    || value.from > value.to
  ) {
    return null;
  }

  return `${scopeKind === "starting" ? "starting from" : "from"} ${formatSummaryDate(value.from)} to ${formatSummaryDate(value.to)}`;
};

const formatPairingPreferenceStructuredSummary: StructuredPairingSummaryFormatter = (input) => {
  const labels = parsePairingPreferenceLabels(input);
  const formattedLabels = labels ? formatPairingPreferenceLabels(labels) : null;

  return labels && formattedLabels
    ? {
        value: formattedLabels,
        pairingPhrase: `${plural("pairing", labels.length)} ${formattedLabels}`,
      }
    : null;
};

const formatAirportPreferenceStructuredSummary: StructuredPairingSummaryFormatter = (input) => {
  const pairingPhrase = formatAirportPreferenceSummary(input);

  return pairingPhrase
    ? { value: stripPairingsPrefix(pairingPhrase), pairingPhrase }
    : null;
};

const formatPairingCheckTimeStructuredSummary: StructuredPairingSummaryFormatter = (input) => {
  const pairingPhrase = formatPairingCheckTimeSummary(input);

  return pairingPhrase
    ? { value: stripPairingsPrefix(pairingPhrase), pairingPhrase }
    : null;
};

const formatFlightLegsStructuredSummary: StructuredPairingSummaryFormatter = (input) => {
  const pairingPhrase = formatFlightLegsPerDutySummary(input);

  return pairingPhrase
    ? { value: stripPairingsPrefix(pairingPhrase), pairingPhrase }
    : null;
};

const formatWorkDayStructuredSummary: StructuredPairingSummaryFormatter = (_input, bid) => {
  if (!Array.isArray(bid.days) || bid.days.length === 0) {
    return null;
  }

  const dayOrder = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
  const windows = bid.days.map((window) => {
    if (
      !isRecord(window)
      || typeof window.dayOfWeek !== "string"
      || !dayOrder.includes(window.dayOfWeek)
      || (window.checkInFrom != null && typeof window.checkInFrom !== "string")
      || (window.checkInTo != null && typeof window.checkInTo !== "string")
    ) {
      return null;
    }

    const checkInFrom = window.checkInFrom;
    const checkInTo = window.checkInTo;
    const from = typeof checkInFrom === "string" ? checkInFrom.trim() : "";
    const to = typeof checkInTo === "string" ? checkInTo.trim() : "";
    if (from && to && from === to) {
      return null;
    }

    const dayLabel = window.dayOfWeek.slice(0, 1) + window.dayOfWeek.slice(1).toLowerCase();
    const value = from && to
      ? `${dayLabel} ${from}-${to}`
      : from
        ? `${dayLabel} after ${from}`
        : to
          ? `${dayLabel} before ${to}`
          : dayLabel;

    return {
      order: dayOrder.indexOf(window.dayOfWeek),
      value,
    };
  });

  if (windows.some((window) => window === null)) {
    return null;
  }

  const dateScope = formatStructuredDateScope(bid.dateScope);
  if (dateScope === null) {
    return null;
  }

  const value = `${windows
    .filter((window): window is NonNullable<typeof window> => window !== null)
    .sort((left, right) => left.order - right.order)
    .map((window) => window.value)
    .join("; ")}${dateScope ? ` ${dateScope}` : ""}`;

  return { value, pairingPhrase: `pairings with duty check-in ${value}` };
};

const formatPairingLengthStructuredSummary: StructuredPairingSummaryFormatter = (input, bid) => {
  const minDays = bid.minDays;
  const maxDays = bid.maxDays;
  const isOptionalPositiveInteger = (value: unknown) => value == null
    || (typeof value === "number" && Number.isSafeInteger(value) && value > 0);

  if (
    !isOptionalPositiveInteger(minDays)
    || !isOptionalPositiveInteger(maxDays)
    || (minDays == null && maxDays == null)
    || (typeof minDays === "number" && typeof maxDays === "number" && minDays > maxDays)
  ) {
    return null;
  }

  const summary = formatPbsPairingLengthSummary({
    action: input.action === "Avoid" ? "avoid" : "award",
    dateScope: bid.dateScope as PbsPairingLengthDateScope | null | undefined,
    maxDays: typeof maxDays === "number" ? maxDays : null,
    minDays: typeof minDays === "number" ? minDays : null,
  });

  if (!summary) {
    return null;
  }

  const actionPrefix = input.action === "Avoid" ? "Avoid " : "Award ";
  const pairingPhrase = summary.slice(actionPrefix.length);
  const value = stripPairingsPrefix(pairingPhrase);

  return {
    value,
    pairingPhrase,
  };
};

const formatMonthEndCarryoverStructuredSummary: StructuredPairingSummaryFormatter = (input) => {
  const comparison = formatMonthEndCarryoverComparison(input);

  return comparison
    ? {
        value: capitalizeFirst(comparison),
        pairingPhrase: `pairings with month-end carryover ${comparison}`,
      }
    : null;
};

const formatDeadheadStructuredSummary: StructuredPairingSummaryFormatter = (input) => {
  const pairingPhrase = formatDeadheadFlyingSummary(input);

  return pairingPhrase
    ? { value: stripPairingsPrefix(pairingPhrase), pairingPhrase }
    : null;
};

const formatFlightNumberStructuredSummary: StructuredPairingSummaryFormatter = (_input, bid) => {
  if (!Array.isArray(bid.flightNumbers)) {
    return null;
  }

  const flightNumbers = bid.flightNumbers
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim().toUpperCase())
    .filter((value) => value.length > 0);
  const dateScope = formatStructuredDateScope(bid.dateScope);

  if (flightNumbers.length === 0 || flightNumbers.length !== bid.flightNumbers.length || dateScope === null) {
    return null;
  }

  const value = `${flightNumbers.join(", ")}${dateScope ? ` ${dateScope}` : ""}`;
  return {
    value,
    pairingPhrase: `pairings with ${plural("flight", flightNumbers.length)} ${value}`,
  };
};

const formatRedeyeStructuredSummary: StructuredPairingSummaryFormatter = (_input, bid) => {
  const dateScope = formatStructuredDateScope(bid.dateScope);

  if (dateScope === null) {
    return null;
  }

  return {
    value: `Redeye${dateScope ? ` ${dateScope}` : ""}`,
    pairingPhrase: `pairings with a redeye flight${dateScope ? ` ${dateScope}` : ""}`,
  };
};

const formatEfficientFlyingStructuredSummary: StructuredPairingSummaryFormatter = (_input, bid) => {
  if (bid.mode === "efficient") {
    return {
      value: "Efficient flying",
      pairingPhrase: "efficient flying pairings",
    };
  }

  if (bid.mode === "inefficient") {
    return {
      value: "Inefficient flying",
      pairingPhrase: "inefficient flying pairings",
    };
  }

  return null;
};

export const STRUCTURED_PAIRING_SUMMARY_FORMATTERS: Readonly<
  Record<string, StructuredPairingSummaryFormatterDefinition>
> = Object.freeze({
  "pairing-preference": { propertyCode: 102, format: formatPairingPreferenceStructuredSummary },
  "airport-preference": { propertyCode: 168, format: formatAirportPreferenceStructuredSummary },
  "pairing-check-time": { propertyCode: 103, format: formatPairingCheckTimeStructuredSummary },
  "flight-legs-per-duty": { propertyCode: 107, format: formatFlightLegsStructuredSummary },
  "work-day-preference": { propertyCode: 110, format: formatWorkDayStructuredSummary },
  "pairing-length-preference": { propertyCode: 112, format: formatPairingLengthStructuredSummary },
  "flight-number-preference": { propertyCode: 116, format: formatFlightNumberStructuredSummary },
  "redeye-preference": { propertyCode: 117, format: formatRedeyeStructuredSummary },
  "deadhead-flying": { propertyCode: 122, format: formatDeadheadStructuredSummary },
  "month-end-carryover": { propertyCode: 163, format: formatMonthEndCarryoverStructuredSummary },
  "efficient-flying-preference": {
    propertyCode: pbsPairingF8PropertyCodes.efficientFlyingFirst,
    format: formatEfficientFlyingStructuredSummary,
  },
});

const formatStructuredPairingSummary = (
  input: LineholderSummaryFormatInput,
): StructuredPairingSummary | null => {
  if (input.operator !== "Json") {
    return null;
  }

  const parsed = safeParseJson(input.paramA);
  if (!isRecord(parsed) || typeof parsed.type !== "string") {
    return null;
  }

  const definition = STRUCTURED_PAIRING_SUMMARY_FORMATTERS[parsed.type];
  return definition?.propertyCode === input.propertyCode
    ? definition.format(input, parsed)
    : null;
};

const formatPairingText = (input: LineholderSummaryFormatInput) => {
  if (input.operator === "Json") {
    return null;
  }

  const airportPreferenceSummary = formatAirportPreferenceSummary(input);

  if (airportPreferenceSummary) {
    return withAction(input, airportPreferenceSummary);
  }

  const list = formatList(normalizeList(input.paramA));
  const dateOrDow = parseDateOrDowList(input.paramA);
  const dateOrDowPhrase = input.operator === "Between"
    ? formatRange(input.paramA, input.paramB, formatSummaryDate)
    : `on ${dateOrDow}`;
  const quantifier = quantifierWord(input.paramC);
  const comparison = (unit = "", formatter?: (value: string) => string) =>
    formatComparison(input.operator, input.paramA, input.paramB, unit, formatter);

  switch (input.propertyCode) {
    case 101:
      return withAction(input, `pairings landing in ${list}`);
    case 102: {
      if (input.operator === "Json") {
        return formatPairingPreference(input);
      }

      const ids = formatPairingIds(input.paramA, input.paramC);
      return withAction(input, `${plural("pairing", normalizeList(ids).length)} ${ids}`);
    }
    case 103: {
      const checkTimeSummary = formatPairingCheckTimeSummary(input);
      return checkTimeSummary ? withAction(input, checkTimeSummary) : null;
    }
    case 104:
      return withAction(input, `pairings with ${quantifier} layover in ${list}`);
    case 105:
      return withAction(input, `pairings with total credit ${comparison()}`);
    case 106:
      return withAction(input, `pairings departing on ${dateOrDow}`);
    case 107: {
      const flightLegsSummary = formatFlightLegsPerDutySummary(input);
      return flightLegsSummary ? withAction(input, flightLegsSummary) : null;
    }
    case 108:
      return withAction(input, `pairings with total legs ${comparison()}`);
    case 109:
      return withAction(input, `pairings with average daily credit ${comparison()}`);
    case 110:
      return withAction(input, `pairings with ${quantifier} duty on ${dateOrDow}`);
    case 164:
      return withAction(input, `pairings departing ${comparison("", (value) => value)}`);
    case 112:
      return withAction(input, `pairings with length ${comparison("days")}`);
    case 113:
      return withAction(input, `pairings with TAFB ${comparison()}`);
    case 114:
      return withAction(input, `pairings with ${quantifier} enroute check-in ${comparison()}`);
    case 115:
      return withAction(input, `pairings with ${quantifier} leg with employee ${list}`);
    case 116:
      return withAction(input, `pairings with flight ${list}`);
    case 117:
      return withAction(input, "pairings with a redeye leg");
    case 118:
      return withAction(input, `pairings with ${quantifier} duty duration ${comparison()}`);
    case 119:
      return withAction(input, `pairings with ${quantifier} layover duration ${comparison()}`);
    case 120:
      return withAction(input, `pairings with any duty time ${comparison()}`);
    case 121:
      return withAction(input, `pairings with average daily block time ${comparison()}`);
    case 122: {
      const deadheadSummary = formatDeadheadFlyingSummary(input);
      return deadheadSummary ? withAction(input, deadheadSummary) : null;
    }
    case 123:
      return withAction(input, `pairings with ${quantifier} layover on ${dateOrDow}`);
    case 124:
      return withAction(input, `pairings with first duty legs ${comparison()}`);
    case 125: {
      const value = input.paramB === "percent" && input.paramA ? `${input.paramA}%` : input.paramA ?? "";
      return withAction(input, `pairings with credit per TAFB ${formatComparison(input.operator, value, null)}`);
    }
    case 126:
      return withAction(input, `pairings with ${quantifier} enroute check-out ${comparison()}`);
    case 127:
      return withAction(input, `pairings with total block time ${comparison()}`);
    case 128:
      return withAction(input, "pairings with a deadhead day");
    case 129:
      return withAction(input, `pairings with ${quantifier} time between flights ${comparison()}`);
    case 130:
      return withAction(input, `pairings with last duty legs ${comparison()}`);
    case 163:
      return withAction(input, `pairings with month-end carryover ${formatMonthEndCarryoverComparison(input)}`);
    case 166:
      return withAction(input, `pairings with ${quantifier} enroute check-in ${dateOrDowPhrase}`);
    case 167:
      return withAction(input, `pairings with ${quantifier} enroute check-out ${dateOrDowPhrase}`);
    default:
      return null;
  }
};

const formatDaysOffText = (input: LineholderSummaryFormatInput) => {
  const dates = formatMaybeDateList(input.paramA);
  const formatEmployeeSchedulePreference = () => {
    if (
      input.paramB === "same_days_off"
      || input.paramB === "opposite_days_off"
      || input.paramB === "same_pairing"
      || input.paramB === "different_pairing"
    ) {
      const relationPhrase = input.paramB === "opposite_days_off" || input.paramB === "different_pairing"
        ? "apart from"
        : "together with";
      const schedulePhrase = input.paramB === "same_pairing" || input.paramB === "different_pairing"
        ? "work days"
        : "days off";
      const threshold = input.operator === "Maximum" ? "at most" : "at least";

      return `Award ${threshold} ${input.paramC} ${schedulePhrase} ${relationPhrase} employee ${input.paramA}`;
    }

    return `Award at least ${input.paramB} shared days off with employee ${input.paramA}`;
  };

  switch (input.propertyCode) {
    case 201:
      return `Award day off on ${dates}`;
    case 202:
      return `Award at most ${input.paramA} consecutive days on`;
    case 203:
      return `Award at least ${input.paramA} consecutive days off`;
    case 204:
      return `Award at least ${input.paramA} consecutive days off from ${formatSummaryDate(input.paramB ?? "")} to ${formatSummaryDate(input.paramC ?? "")}`;
    case 205:
      return `Award ${input.paramA} days off followed by ${input.paramB}-${input.paramC} days on`;
    case 206:
      return formatEmployeeSchedulePreference();
    default:
      return null;
  }
};

const formatStrength = (value: string | null) => {
  if (value === "must_try") {
    return "must-try priority";
  }

  if (value === "strong") {
    return "strong priority";
  }

  return "normal priority";
};

const parseReserveDateScope = (value: string | null): ReserveDateScope | null => {
  const parsed = safeParseJson(value);
  return isRecord(parsed) && typeof parsed.mode === "string"
    ? parsed as ReserveDateScope
    : null;
};

const formatReserveDateScopePhrase = (dateScope: ReserveDateScope | null) => {
  if (!dateScope) {
    return "";
  }

  if (dateScope.mode === "whole_month") {
    return "for the whole bid month";
  }

  if (dateScope.mode === "first_half") {
    return "in the first half of the bid month";
  }

  if (dateScope.mode === "second_half") {
    return "in the second half of the bid month";
  }

  if (dateScope.mode === "date_range") {
    return `from ${formatSummaryDate(dateScope.from ?? "")} to ${formatSummaryDate(dateScope.to ?? "")}`;
  }

  const dates = (dateScope.dates ?? []).map(formatSummaryDate);
  return dates.length > 0 ? `on ${formatList(dates)}` : "on selected dates";
};

const formatCommuterPattern = (input: LineholderSummaryFormatInput) => {
  if (input.operator === "Json") {
    const parsed = safeParseJson(input.paramA);

    if (isRecord(parsed)) {
      const minDaysOff = parsed.minDaysOff ?? "";
      const minDaysOn = parsed.minDaysOn ?? "";
      const maxDaysOn = parsed.maxDaysOn ?? "";
      const dateRange = isRecord(parsed.dateRange)
        && typeof parsed.dateRange.from === "string"
        && typeof parsed.dateRange.to === "string"
        ? ` from ${formatSummaryDate(parsed.dateRange.from)} to ${formatSummaryDate(parsed.dateRange.to)}`
        : "";

      return `Award commuter pattern with ${minDaysOff} days off followed by ${minDaysOn}-${maxDaysOn} days on${dateRange}`;
    }
  }

  return `Award commuter pattern with ${input.paramA} days off followed by ${input.paramB}-${input.paramC} days on`;
};

const formatCreditWindowPreference = (input: LineholderSummaryFormatInput) => {
  const parsed = input.operator === "Json" ? safeParseJson(input.paramA) : null;

  if (!isRecord(parsed) || parsed.type !== "credit-window-preference") {
    return null;
  }

  if (parsed.direction === "more") {
    return "More credit";
  }

  return parsed.direction === "less" ? "Less credit" : null;
};

const formatReserveLine = (input: LineholderSummaryFormatInput) =>
  input.action === "Avoid"
    ? "No reserve for the whole bid month"
    : "Award reserve-only for the whole bid month";

const formatLineText = (input: LineholderSummaryFormatInput) => {
  switch (input.propertyCode) {
    case 401:
      return "Award max credit window";
    case 402:
      return "Award minimum credit window";
    case 429:
      return formatCreditWindowPreference(input);
    case 403:
      return "Clear schedule and start the next bid group";
    case 404:
      return "Avoid same-day pairings";
    case 405:
      return "Waive no same-day duty starts";
    case 406:
      return `Forget line ${input.paramA}`;
    case 407:
      return `Award at least ${input.paramA} base layover`;
    case 408:
      return formatCommuterPattern(input);
    case 409:
      return `Award at least ${input.paramA} credit in ${input.paramB} or fewer working days, ${formatStrength(input.paramC)}`;
    case 410:
      return formatReserveFlyingPattern(input);
    case 427:
      return formatReserveLine(input);
    default:
      return null;
  }
};

const formatReserveFlyingPattern = (input: LineholderSummaryFormatInput) => {
  const parsed = safeParseJson(input.paramA);
  const segments = Array.isArray(parsed) ? parsed as ReserveFlyingSegment[] : [];

  if (segments.length === 0) {
    return null;
  }

  const segmentText = segments.map((segment) => {
    const scope = formatReserveDateScopePhrase(segment.dateScope ?? null);

    if (segment.workType === "reserve") {
      return `${segment.callType ?? "Reserve"} reserve ${scope}`.trim();
    }

    return `flying ${scope}`.trim();
  }).join("; ");

  return `Award reserve / flying pattern: ${segmentText}, ${formatStrength(input.paramB)}`;
};

const formatReserveText = (input: LineholderSummaryFormatInput) => {
  switch (input.propertyCode) {
    case 301:
      return `Award ${input.paramA} short call ${formatReserveDateScopePhrase(parseReserveDateScope(input.paramB))}`.trim();
    case 302:
      return `Award reserve day on ${formatMaybeDateList(input.paramA)}`;
    case 311:
      return `Award reserve day off on ${formatMaybeDateList(input.paramA)}`;
    default:
      return null;
  }
};

export const formatLineholderSummaryItemText = (input: LineholderSummaryFormatInput) => {
  const structuredPairingSummary = input.bidType === "Pairing"
    ? formatStructuredPairingSummary(input)
    : null;
  const pairingText = input.bidType === "Pairing"
    ? structuredPairingSummary
      ? withAction(input, structuredPairingSummary.pairingPhrase)
      : formatPairingText(input)
    : null;
  const isUnreadableStructuredPairing = input.bidType === "Pairing"
    && input.operator === "Json"
    && structuredPairingSummary === null;
  const isUnreadablePairingPreference = isUnreadableStructuredPairing && input.propertyCode === 102;
  const lineText = input.bidType === "Line" ? formatLineText(input) : null;
  const fallbackValue = formatFallbackValue(input.operator, input.paramA, input.paramB, input.paramC);
  const value = structuredPairingSummary?.value
    ?? (input.propertyCode === 427 ? lineText : null)
    ?? (isUnreadablePairingPreference
      ? "Pairing preference needs review"
      : isUnreadableStructuredPairing
        ? "Condition needs review"
        : fallbackValue);
  const readableText = (
    input.bidType === "Pairing"
      ? pairingText
      : input.bidType === "DaysOff"
        ? formatDaysOffText(input)
        : input.bidType === "Line"
          ? lineText
          : input.bidType === "Reserve"
            ? formatReserveText(input)
            : null
  ) ?? (
    isUnreadablePairingPreference
      ? `${actionWord(input.action)} pairing preference needs review`
      : isUnreadableStructuredPairing
        ? `${actionWord(input.action)} ${input.label} needs review`
      : formatFallbackReadableText(input.action, input.label, input.operator, value)
  );

  return {
    isReviewOnly: isUnreadableStructuredPairing,
    value,
    readableText,
  };
};

export const formatLineholderSummaryConditionValue = (
  operator: string | null,
  paramA: string | null,
  paramB: string | null,
  paramC: string | null,
) => operator === "Json"
  ? "Condition needs review"
  : formatFallbackValue(operator, paramA, paramB, paramC);
