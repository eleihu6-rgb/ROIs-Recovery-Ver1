import type { Pool } from "pg";

import {
  parsePbsEfficientFlyingPercentileDefinition,
  parsePbsRedeyeDefinition,
  pbsBidDefinitionCodes,
  type PbsEfficientFlyingPercentileDefinition,
  type PbsRedeyeDefinition,
} from "../../../../packages/contracts/pbs-bid-definitions.js";
import type {
  PbsPairingBidAction,
  PbsPairingDraftProperty,
  PbsPairingEventDateScope,
} from "../../../../packages/contracts/pbs-pairing-bids.js";
import type { PbsBidFeedbackPairing } from "../../../../packages/contracts/pbs-bid-feedback.js";
import { stableHash } from "../../utils/stable-hash.js";
import { parseTimeBetweenFlightsDurationMinutes } from "../pairing/time-between-flights-config.js";

const MS_PER_DAY = 86_400_000;
const CLOCK_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIMESTAMP_WITHOUT_ZONE_PATTERN =
  /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?$/;

export type BidFeedbackMatcherPeriod = {
  rosterPeriodId: number;
  rosterPeriodKey?: string | null;
  periodCode: string;
  rpStartLocal?: string | null;
  rpEndLocal?: string | null;
};

export type BidFeedbackMatcherActorContext = {
  base: string | null;
  rank: string | null;
  zoneId: string | null;
};

export type BidFeedbackMatcherProperty = {
  key: string;
  property: PbsPairingDraftProperty;
};

export type BidFeedbackPairingMatch = {
  pairing: Omit<PbsBidFeedbackPairing, "rawScore" | "rawDirection" | "eligibility" | "matchedBids">;
  matchedPropertyKeys: string[];
};

export type BidFeedbackPairingMatcherContext = {
  identity: string;
  efficientFlying: PbsEfficientFlyingPercentileDefinition;
  redeye: PbsRedeyeDefinition;
};

export type BidFeedbackPairingMatcherInput = {
  pgPool: Pick<Pool, "query">;
  liveSchema: string;
  period: BidFeedbackMatcherPeriod;
  actorContext: BidFeedbackMatcherActorContext;
  properties: BidFeedbackMatcherProperty[];
  context?: BidFeedbackPairingMatcherContext;
  pairingIds?: string[];
};

export type BidFeedbackPairingMatcher = (
  input: Omit<BidFeedbackPairingMatcherInput, "pgPool" | "liveSchema">,
) => Promise<BidFeedbackPairingMatch[]>;

export type BidFeedbackLocalDateTime = {
  date: string;
  time: string;
  minutes: number;
  iso: string;
};

export type BidFeedbackLegFact = {
  dutySeq: number;
  segmentSeq: number;
  flightNumber: string;
  depAirport: string;
  depCity: string | null;
  arrAirport: string;
  arrCity: string | null;
  depLocal: BidFeedbackLocalDateTime | null;
  arrLocal: BidFeedbackLocalDateTime | null;
  depInstantMs: number | null;
  arrInstantMs: number | null;
  assignment: string;
  isFly: boolean;
  isDeadhead: boolean;
};

export type BidFeedbackDutyFact = {
  dutySeq: number;
  checkInLocal: BidFeedbackLocalDateTime | null;
  checkOutLocal: BidFeedbackLocalDateTime | null;
  endAirport: string;
  endCity: string | null;
  layoverHours: number | null;
  legs: BidFeedbackLegFact[];
};

export type BidFeedbackPairingFact = Omit<
  PbsBidFeedbackPairing,
  "rawScore" | "rawDirection" | "eligibility" | "matchedBids"
> & {
  assignmentGroup: string;
  assignment: string;
  startLocal: BidFeedbackLocalDateTime | null;
  endLocal: BidFeedbackLocalDateTime | null;
  durationDaysForSelection: number;
  creditHours: number | null;
  duties: BidFeedbackDutyFact[];
  legs: BidFeedbackLegFact[];
};

export type BidFeedbackSelectionInput = {
  facts: BidFeedbackPairingFact[];
  period: BidFeedbackMatcherPeriod;
  properties: BidFeedbackMatcherProperty[];
  context?: BidFeedbackPairingMatcherContext;
};

export type PairingFactRow = {
  pairing_id: string;
  pairing_label: string | null;
  base: string | null;
  base_zone_id: string | null;
  assignment_group: string | null;
  assignment: string | null;
  pairing_start_utc: string | Date | null;
  pairing_end_utc: string | Date | null;
  duration_days: number | string | null;
  tafb_days: number | string | null;
  rank_label: string | null;
  total_credit_minutes: string | number | null;
  duty_seq: number | string | null;
  seg_seq: number | string | null;
  flt_num: string | null;
  dep_arp: string | null;
  dep_city: string | null;
  arv_arp: string | null;
  arv_city: string | null;
  duty_end_arp: string | null;
  duty_end_city: string | null;
  duty_start_utc: string | Date | null;
  duty_end_utc: string | Date | null;
  duty_layover_minutes: string | number | null;
  leg_start_utc: string | Date | null;
  leg_end_utc: string | Date | null;
  seg_assignment: string | null;
};

type DictionaryRow = {
  parent_code: string | null;
  code: string | null;
  code_value: string | null;
};

export const EMPTY_BID_FEEDBACK_MATCHER_CONTEXT: BidFeedbackPairingMatcherContext = {
  identity: "definitions:none",
  efficientFlying: { available: false },
  redeye: { available: false },
};

const validateSchemaName = (schema: string): string => {
  if (!/^[a-z][a-z0-9_]*$/.test(schema)) {
    throw new Error(`Invalid live schema name: ${schema}`);
  }
  return schema;
};

const normalizeAction = (action: PbsPairingBidAction | null | undefined): "award" | "avoid" =>
  action === "avoid" ? "avoid" : "award";

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.flatMap((item) => {
      const text = asString(item);
      return text ? [text] : [];
    })
    : [];

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
};

const toSafeInteger = (value: unknown): number | null => {
  const numberValue = toNumber(value);
  return numberValue !== null && Number.isSafeInteger(numberValue) ? numberValue : null;
};

const normalizeCode = (value: unknown): string | null => {
  const text = asString(value);
  return text ? text.toUpperCase() : null;
};

const normalizeCodeSet = (values: unknown[]): Set<string> =>
  new Set(values.flatMap((value) => {
    const code = normalizeCode(value);
    return code ? [code] : [];
  }));

const parseClockMinutes = (value: unknown): number | null => {
  const text = asString(value);
  if (!text || !CLOCK_PATTERN.test(text)) return null;
  const [hours, minutes] = text.split(":").map((part) => Number.parseInt(part, 10));
  return (hours ?? 0) * 60 + (minutes ?? 0);
};

const isIsoDate = (value: unknown): value is string =>
  typeof value === "string" && ISO_DATE_PATTERN.test(value);

const toDate = (value: Date | string | null): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const trimmedValue = value.trim();
  const normalizedValue = TIMESTAMP_WITHOUT_ZONE_PATTERN.test(trimmedValue)
    ? `${trimmedValue.replace(" ", "T")}Z`
    : trimmedValue;
  const date = new Date(normalizedValue);
  return Number.isNaN(date.getTime()) ? null : date;
};

type ZoneDateTimeParts = {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
};

const dateTimePartsFormatterByZone = new Map<string, Intl.DateTimeFormat>();

const getDateTimePartsFormatter = (zoneId: string): Intl.DateTimeFormat => {
  const normalizedZoneId = zoneId.trim() || "UTC";
  const cachedFormatter = dateTimePartsFormatterByZone.get(normalizedZoneId);
  if (cachedFormatter) return cachedFormatter;

  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: normalizedZoneId,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    dateTimePartsFormatterByZone.set(normalizedZoneId, formatter);
    return formatter;
  } catch {
    return getDateTimePartsFormatter("UTC");
  }
};

const getZoneDateTimeParts = (date: Date, zoneId: string): ZoneDateTimeParts => {
  const values: Partial<ZoneDateTimeParts> = {};

  for (const part of getDateTimePartsFormatter(zoneId).formatToParts(date)) {
    if (part.type !== "literal") {
      values[part.type as keyof ZoneDateTimeParts] = part.value;
    }
  }

  return {
    year: values.year ?? "0000",
    month: values.month ?? "00",
    day: values.day ?? "00",
    hour: values.hour ?? "00",
    minute: values.minute ?? "00",
    second: values.second ?? "00",
  };
};

const toLocalDateTime = (
  value: Date | string | null,
  zoneId: string,
): BidFeedbackLocalDateTime | null => {
  const date = toDate(value);
  if (!date) return null;

  const parts = getZoneDateTimeParts(date, zoneId);
  const time = `${parts.hour}:${parts.minute}`;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time,
    minutes: Number.parseInt(parts.hour, 10) * 60 + Number.parseInt(parts.minute, 10),
    iso: `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`,
  };
};

const localDayNumber = (isoDate: string): number => {
  const [year, month, day] = isoDate.split("-").map((part) => Number.parseInt(part, 10));
  return Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1) / MS_PER_DAY;
};

const inclusiveDaySpan = (startDate: string | null | undefined, endDate: string | null | undefined): number => {
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) return 1;
  return Math.max(1, Math.round(localDayNumber(endDate) - localDayNumber(startDate)) + 1);
};

const weekdayByIsoDate = (isoDate: string): "SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" =>
  ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][new Date(`${isoDate}T00:00:00.000Z`).getUTCDay()] as
    | "SUN"
    | "MON"
    | "TUE"
    | "WED"
    | "THU"
    | "FRI"
    | "SAT";

const formatMinutesAsHhmm = (minutes: number | null): string => {
  if (minutes === null || !Number.isFinite(minutes)) return "0:00";
  const rounded = Math.max(0, Math.round(minutes));
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
};

const clockInWindow = (minutes: number, start: number, end: number, inclusiveEnd = false): boolean => {
  if (start <= end) {
    return minutes >= start && (inclusiveEnd ? minutes <= end : minutes < end);
  }
  return minutes >= start || (inclusiveEnd ? minutes <= end : minutes < end);
};

const compareNumber = (
  actual: number,
  bid: Record<string, unknown>,
  valueKey = "value",
): boolean => {
  const operator = asString(bid.operator) ?? "=";
  if (operator === "Between") {
    const from = toNumber(bid.from);
    const to = toNumber(bid.to);
    return from !== null && to !== null && from <= to && actual >= from && actual <= to;
  }

  const value = toNumber(bid[valueKey]);
  if (value === null) return false;
  if (operator === "<") return actual < value;
  if (operator === ">") return actual > value;
  return actual === value;
};

const compareClock = (minutes: number, bid: Record<string, unknown>): boolean => {
  const operator = asString(bid.operator) ?? "=";
  if (operator === "Between") {
    const from = parseClockMinutes(bid.from);
    const to = parseClockMinutes(bid.to);
    return from !== null && to !== null && from !== to && clockInWindow(minutes, from, to);
  }

  const value = parseClockMinutes(bid.value);
  if (value === null) return false;
  if (operator === "<") return minutes < value;
  if (operator === ">") return minutes > value;
  return minutes === value;
};

const scopeContains = (
  scope: PbsPairingEventDateScope | null | undefined,
  localDate: string | null | undefined,
): boolean => {
  if (!scope) return true;
  if (!isIsoDate(localDate)) return false;

  if (scope.mode === "specific_dates") {
    return scope.dates.includes(localDate);
  }
  return scope.from <= localDate && localDate <= scope.to;
};

const scopeOverlapsPairing = (
  scope: PbsPairingEventDateScope | null | undefined,
  pairing: BidFeedbackPairingFact,
): boolean => {
  if (!scope) return true;
  if (scope.mode === "specific_dates") {
    return scope.dates.some((date) => pairing.originDate <= date && date <= pairing.endDate);
  }
  return pairing.originDate <= scope.to && pairing.endDate >= scope.from;
};

const getDateScope = (bid: Record<string, unknown>): PbsPairingEventDateScope | null => {
  const dateScope = asRecord(bid.dateScope);
  if (!dateScope) return null;
  if (dateScope.mode === "specific_dates") {
    const dates = asStringArray(dateScope.dates).filter(isIsoDate);
    return dates.length > 0 ? { mode: "specific_dates", dates } : null;
  }
  if (dateScope.mode === "date_range" && isIsoDate(dateScope.from) && isIsoDate(dateScope.to) && dateScope.from <= dateScope.to) {
    return { mode: "date_range", from: dateScope.from, to: dateScope.to };
  }
  return null;
};

const matchesCode = (
  targetAirport: string | null | undefined,
  targetCity: string | null | undefined,
  wanted: Set<string>,
): boolean => {
  const airport = normalizeCode(targetAirport);
  const city = normalizeCode(targetCity);
  return (airport !== null && wanted.has(airport)) || (city !== null && wanted.has(city));
};

const finalFlyLeg = (pairing: BidFeedbackPairingFact): BidFeedbackLegFact | null =>
  pairing.legs.filter((leg) => leg.isFly).at(-1) ?? null;

const matchPairingPreference = (
  property: PbsPairingDraftProperty,
  bid: Record<string, unknown>,
  pairing: BidFeedbackPairingFact,
): boolean => {
  if (bid.type === "pairing-preference" || bid.type === "pairing-id-list") {
    const ids = normalizeCodeSet(asStringArray(bid.pairingIds));
    const labels = normalizeCodeSet(asStringArray(bid.pairingLabels));
    const pairingId = normalizeCode(pairing.pairingId);
    const pairingNumber = normalizeCode(pairing.pairingNumber);
    return (pairingId !== null && ids.has(pairingId)) || (pairingNumber !== null && labels.has(pairingNumber));
  }

  if (bid.type === "pairing-occurrence-list" && Array.isArray(bid.occurrences)) {
    return bid.occurrences.some((item) => {
      const occurrence = asRecord(item);
      return normalizeCode(occurrence?.pairingId) === normalizeCode(pairing.pairingId)
        && (!isIsoDate(occurrence?.originDate) || occurrence.originDate === pairing.originDate);
    });
  }

  if (property.propertyCode === 102 && bid.type === "tag-list") {
    const labels = normalizeCodeSet(asStringArray(bid.values));
    const pairingNumber = normalizeCode(pairing.pairingNumber);
    return pairingNumber !== null && labels.has(pairingNumber);
  }

  return false;
};

const buildAirportPreference = (
  property: PbsPairingDraftProperty,
  bid: Record<string, unknown>,
): {
  event: "landing" | "layover" | "landing_or_layover";
  wantedCodes: Set<string>;
  dateScope: PbsPairingEventDateScope | null;
  minLayoverHours: number | null;
} | null => {
  if (bid.type === "airport-preference") {
    const locationCodes = Array.isArray(bid.locations)
      ? bid.locations.flatMap((item) => {
        const record = asRecord(item);
        return record?.code ? [record.code] : [];
      })
      : [];
    const wantedCodes = normalizeCodeSet(locationCodes);
    if (wantedCodes.size === 0) return null;

    const minLayoverMinutes = parseTimeBetweenFlightsDurationMinutes(bid.minimumLayoverDuration);
    return {
      event: bid.event === "landing" || bid.event === "layover" || bid.event === "landing_or_layover"
        ? bid.event
        : "landing_or_layover",
      wantedCodes,
      dateScope: getDateScope(bid),
      minLayoverHours: minLayoverMinutes === null ? null : minLayoverMinutes / 60,
    };
  }

  const landingCodes = new Set([101, 155, 156]);
  const layoverCodes = new Set([104, 150, 151, 152]);
  if ((landingCodes.has(property.propertyCode) || layoverCodes.has(property.propertyCode))
    && (bid.type === "tag-list" || bid.type === "tag-list-date")) {
    const wantedCodes = normalizeCodeSet(asStringArray(bid.values));
    if (wantedCodes.size === 0) return null;
    return {
      event: landingCodes.has(property.propertyCode) ? "landing" : "layover",
      wantedCodes,
      dateScope: isIsoDate(bid.date) ? { mode: "specific_dates", dates: [bid.date] } : null,
      minLayoverHours: null,
    };
  }

  return null;
};

const matchAirportPreference = (
  property: PbsPairingDraftProperty,
  bid: Record<string, unknown>,
  pairing: BidFeedbackPairingFact,
): boolean => {
  const preference = buildAirportPreference(property, bid);
  if (!preference) return false;

  if (preference.event === "landing" || preference.event === "landing_or_layover") {
    const lastFlyLeg = finalFlyLeg(pairing);
    for (const leg of pairing.legs.filter((item) => item.isFly)) {
      if (leg === lastFlyLeg && normalizeCode(leg.arrAirport) === normalizeCode(pairing.base)) continue;
      if (scopeContains(preference.dateScope, leg.arrLocal?.date)
        && matchesCode(leg.arrAirport, leg.arrCity, preference.wantedCodes)) {
        return true;
      }
    }
  }

  if (preference.event === "layover" || preference.event === "landing_or_layover") {
    const lastDuty = pairing.duties.at(-1) ?? null;
    for (const duty of pairing.duties) {
      if (duty === lastDuty && normalizeCode(duty.endAirport) === normalizeCode(pairing.base)) continue;
      if (preference.minLayoverHours !== null
        && (duty.layoverHours === null || duty.layoverHours < preference.minLayoverHours)) {
        continue;
      }
      if (scopeContains(preference.dateScope, duty.checkOutLocal?.date)
        && matchesCode(duty.endAirport, duty.endCity, preference.wantedCodes)) {
        return true;
      }
    }
  }

  return false;
};

const efficientFlyingCutoffs = (
  facts: BidFeedbackPairingFact[],
  percentile: number,
): { efficient: number | null; inefficient: number | null } => {
  const distribution = facts
    .filter((fact) => fact.assignmentGroup === "FLY" && fact.creditHours !== null && fact.durationDaysForSelection > 0)
    .map((fact) => fact.creditHours! / fact.durationDaysForSelection)
    .sort((left, right) => left - right);
  if (distribution.length === 0) return { efficient: null, inefficient: null };

  const pct = Math.min(50, Math.max(1, Math.round(percentile) || 20));
  const k = Math.max(1, Math.round((distribution.length * pct) / 100));
  return {
    efficient: distribution[distribution.length - k] ?? null,
    inefficient: distribution[k - 1] ?? null,
  };
};

const matchEfficientFlying = (
  bid: Record<string, unknown>,
  pairing: BidFeedbackPairingFact,
  cutoffs: { efficient: number | null; inefficient: number | null },
): boolean => {
  if (bid.type !== "efficient-flying-preference" || pairing.assignmentGroup !== "FLY") return false;
  if (pairing.creditHours === null || pairing.durationDaysForSelection <= 0) return false;
  const averageCredit = pairing.creditHours / pairing.durationDaysForSelection;
  const inefficient = bid.mode === "inefficient";
  const cutoff = inefficient ? cutoffs.inefficient : cutoffs.efficient;
  if (cutoff === null) return false;
  return inefficient ? averageCredit <= cutoff : averageCredit >= cutoff;
};

const matchPairingCheckTime = (
  property: PbsPairingDraftProperty,
  bid: Record<string, unknown>,
  pairing: BidFeedbackPairingFact,
): boolean => {
  const dateScope = getDateScope(bid);

  if (bid.type === "pairing-check-time") {
    const local = bid.timeType === "check_out" ? pairing.duties.at(-1)?.checkOutLocal : pairing.duties[0]?.checkInLocal;
    return !!local && scopeContains(dateScope, local.date) && compareClock(local.minutes, bid);
  }

  if (property.propertyCode === 103 && (bid.type === "time-range" || bid.type === "time")) {
    const local = pairing.duties[0]?.checkInLocal;
    if (!local) return false;
    const legacyBid = bid.type === "time-range"
      ? { operator: "Between", from: bid.from, to: bid.to }
      : bid;
    return compareClock(local.minutes, legacyBid);
  }

  return false;
};

const matchFlightLegsPerDuty = (
  property: PbsPairingDraftProperty,
  bid: Record<string, unknown>,
  pairing: BidFeedbackPairingFact,
): boolean => {
  if (bid.type !== "flight-legs-per-duty" && property.propertyCode !== 107) return false;
  const dateScope = getDateScope(bid);
  const duties = pairing.duties.filter((duty) => scopeContains(dateScope, duty.checkInLocal?.date));
  if (duties.length === 0) return false;

  const matchesDuty = (duty: BidFeedbackDutyFact): boolean => {
    const flyLegCount = duty.legs.filter((leg) => leg.isFly).length;
    if (bid.type === "flight-legs-per-duty") return compareNumber(flyLegCount, bid, "legs");
    return compareNumber(flyLegCount, bid);
  };
  return property.quantifier === "every" ? duties.every(matchesDuty) : duties.some(matchesDuty);
};

const matchWorkDay = (
  property: PbsPairingDraftProperty,
  bid: Record<string, unknown>,
  pairing: BidFeedbackPairingFact,
): boolean => {
  if (bid.type !== "work-day-preference" || normalizeAction(property.action) !== "award") return false;
  if (!scopeOverlapsPairing(getDateScope(bid), pairing)) return false;

  const windows = Array.isArray(bid.days)
    ? bid.days.flatMap((item) => {
      const record = asRecord(item);
      const dayOfWeek = normalizeCode(record?.dayOfWeek);
      if (!dayOfWeek) return [];
      return [{
        dayOfWeek,
        checkInFrom: parseClockMinutes(record?.checkInFrom),
        checkInTo: parseClockMinutes(record?.checkInTo),
      }];
    })
    : [];
  if (windows.length === 0) return false;

  return pairing.duties.some((duty) => {
    if (!duty.checkInLocal) return false;
    const day = weekdayByIsoDate(duty.checkInLocal.date);
    const window = windows.find((item) => item.dayOfWeek === day);
    if (!window) return false;
    if (window.checkInFrom === null && window.checkInTo === null) return true;
    if (window.checkInFrom !== null && window.checkInTo !== null) {
      return window.checkInFrom !== window.checkInTo
        && clockInWindow(duty.checkInLocal.minutes, window.checkInFrom, window.checkInTo, true);
    }
    if (window.checkInFrom !== null) return duty.checkInLocal.minutes >= window.checkInFrom;
    return duty.checkInLocal.minutes <= window.checkInTo!;
  });
};

const matchPairingLength = (
  property: PbsPairingDraftProperty,
  bid: Record<string, unknown>,
  pairing: BidFeedbackPairingFact,
): boolean => {
  if (bid.type === "pairing-length-preference") {
    const minDays = toSafeInteger(bid.minDays);
    const maxDays = toSafeInteger(bid.maxDays);
    if (minDays === null || maxDays === null || minDays > maxDays) return false;
    return pairing.durationDaysForSelection >= minDays
      && pairing.durationDaysForSelection <= maxDays
      && scopeOverlapsPairing(getDateScope(bid), pairing);
  }

  if ((property.propertyCode === 112 || property.propertyCode === 131)
    && (bid.type === "stepper" || bid.type === "stepper-range")) {
    const minDays = bid.type === "stepper-range" ? toSafeInteger(bid.from) : toSafeInteger(bid.value);
    const maxDays = bid.type === "stepper-range" ? toSafeInteger(bid.to) : toSafeInteger(bid.value);
    return minDays !== null
      && maxDays !== null
      && minDays <= maxDays
      && pairing.durationDaysForSelection >= minDays
      && pairing.durationDaysForSelection <= maxDays;
  }

  return false;
};

const matchFlightNumber = (
  bid: Record<string, unknown>,
  pairing: BidFeedbackPairingFact,
): boolean => {
  if (bid.type !== "flight-number-preference") return false;
  const wantedNumbers = normalizeCodeSet(asStringArray(bid.flightNumbers));
  if (wantedNumbers.size === 0) return false;
  const dateScope = getDateScope(bid);
  return pairing.legs.some((leg) =>
    leg.isFly
    && wantedNumbers.has(leg.flightNumber)
    && scopeContains(dateScope, leg.depLocal?.date));
};

const legAirborneInWindow = (
  leg: BidFeedbackLegFact,
  startMinutes: number,
  endMinutes: number,
): boolean => {
  if (!leg.depLocal || !leg.arrLocal) return false;
  const depDay = localDayNumber(leg.depLocal.date);
  const arrDay = localDayNumber(leg.arrLocal.date);
  const depAbsoluteMinutes = depDay * 1440 + leg.depLocal.minutes;
  let arrAbsoluteMinutes = arrDay * 1440 + leg.arrLocal.minutes;
  if (arrAbsoluteMinutes <= depAbsoluteMinutes) arrAbsoluteMinutes += 1440;

  const dayNumbers = new Set([depDay, arrDay]);
  for (const dayNumber of dayNumbers) {
    const windowStart = dayNumber * 1440 + startMinutes;
    const windowEnd = dayNumber * 1440 + (startMinutes <= endMinutes ? endMinutes : endMinutes + 1440);
    if (depAbsoluteMinutes < windowEnd && arrAbsoluteMinutes > windowStart) return true;
  }

  return false;
};

const matchRedeye = (
  bid: Record<string, unknown>,
  pairing: BidFeedbackPairingFact,
  redeye: PbsRedeyeDefinition,
): boolean => {
  if (bid.type !== "redeye-preference" || !redeye.available) return false;
  const startMinutes = parseClockMinutes(redeye.startTime);
  const endMinutes = parseClockMinutes(redeye.endTime);
  if (startMinutes === null || endMinutes === null) return false;
  const dateScope = getDateScope(bid);
  return pairing.legs.some((leg) =>
    leg.isFly
    && scopeContains(dateScope, leg.depLocal?.date)
    && legAirborneInWindow(leg, startMinutes, endMinutes));
};

const matchMonthEndCarryover = (
  property: PbsPairingDraftProperty,
  bid: Record<string, unknown>,
  pairing: BidFeedbackPairingFact,
  period: BidFeedbackMatcherPeriod,
): boolean => {
  if (bid.type !== "month-end-carryover") return false;
  if (!scopeOverlapsPairing(null, pairing)) return false;
  if (!isIsoDate(period.rpEndLocal) || pairing.endDate <= period.rpEndLocal) return false;

  const carryOutDays = Math.round(localDayNumber(pairing.endDate) - localDayNumber(period.rpEndLocal));
  const threshold = normalizeAction(property.action) === "avoid" ? 1 : toSafeInteger(bid.days);
  if (threshold === null || threshold < 1 || threshold > 5) return false;
  return carryOutDays >= threshold;
};

const matchDeadhead = (
  bid: Record<string, unknown>,
  pairing: BidFeedbackPairingFact,
): boolean => {
  if (bid.type !== "deadhead-flying") return false;
  const dateScope = getDateScope(bid);
  if (bid.mode === "deadhead-only-duty") {
    return pairing.duties.some((duty) =>
      duty.legs.length > 0
      && duty.legs.every((leg) => leg.isDeadhead)
      && scopeContains(dateScope, duty.checkInLocal?.date));
  }

  return pairing.legs.some((leg) =>
    leg.isDeadhead && scopeContains(dateScope, leg.depLocal?.date));
};

const getTimeBetweenFlightsIntervals = (pairing: BidFeedbackPairingFact): number[] =>
  pairing.duties.flatMap((duty) => {
    const legs = [...duty.legs]
      .filter((leg) => leg.depInstantMs !== null && leg.arrInstantMs !== null)
      .sort((left, right) => left.segmentSeq - right.segmentSeq);
    const intervals: number[] = [];
    for (let index = 1; index < legs.length; index += 1) {
      const priorArrival = legs[index - 1]?.arrInstantMs;
      const currentDeparture = legs[index]?.depInstantMs;
      if (priorArrival === null || priorArrival === undefined || currentDeparture === null || currentDeparture === undefined) {
        continue;
      }
      intervals.push(Math.round((currentDeparture - priorArrival) / 60_000));
    }
    return intervals;
  });

const matchTimeBetweenFlights = (
  property: PbsPairingDraftProperty,
  bid: Record<string, unknown>,
  pairing: BidFeedbackPairingFact,
): boolean => {
  if (property.propertyCode !== 129 || bid.type !== "duration") return false;
  const threshold = parseTimeBetweenFlightsDurationMinutes(bid.value);
  if (threshold === null || threshold < 1 || threshold > 59_999) return false;

  const intervals = getTimeBetweenFlightsIntervals(pairing);
  if (intervals.length === 0) return false;
  const operator = asString(bid.operator) ?? "=";
  const matchesInterval = (minutes: number): boolean => {
    if (operator === "<") return minutes < threshold;
    if (operator === ">") return minutes > threshold;
    return minutes === threshold;
  };
  return property.quantifier === "every" ? intervals.every(matchesInterval) : intervals.some(matchesInterval);
};

const propertySelectsPairing = (
  input: {
    property: PbsPairingDraftProperty;
    pairing: BidFeedbackPairingFact;
    period: BidFeedbackMatcherPeriod;
    context: BidFeedbackPairingMatcherContext;
    efficiencyCutoffs: { efficient: number | null; inefficient: number | null };
  },
): boolean => {
  const bid = asRecord(input.property.bid);
  if (!bid) return false;

  return matchPairingPreference(input.property, bid, input.pairing)
    || matchAirportPreference(input.property, bid, input.pairing)
    || matchEfficientFlying(bid, input.pairing, input.efficiencyCutoffs)
    || matchPairingCheckTime(input.property, bid, input.pairing)
    || matchFlightLegsPerDuty(input.property, bid, input.pairing)
    || matchWorkDay(input.property, bid, input.pairing)
    || matchPairingLength(input.property, bid, input.pairing)
    || matchFlightNumber(bid, input.pairing)
    || matchRedeye(bid, input.pairing, input.context.redeye)
    || matchMonthEndCarryover(input.property, bid, input.pairing, input.period)
    || matchDeadhead(bid, input.pairing)
    || matchTimeBetweenFlights(input.property, bid, input.pairing);
};

export const selectBidFeedbackPairings = ({
  facts,
  period,
  properties,
  context = EMPTY_BID_FEEDBACK_MATCHER_CONTEXT,
}: BidFeedbackSelectionInput): BidFeedbackPairingMatch[] => {
  if (properties.length === 0 || facts.length === 0) return [];
  const efficiencyCutoffs = context.efficientFlying.available
    ? efficientFlyingCutoffs(facts, context.efficientFlying.percentile)
    : { efficient: null, inefficient: null };

  return facts
    .map((pairing) => {
      const matchedPropertyKeys = properties.flatMap(({ key, property }) =>
        propertySelectsPairing({
          property,
          pairing,
          period,
          context,
          efficiencyCutoffs,
        }) ? [key] : []);
      return matchedPropertyKeys.length > 0 ? { pairing: toFeedbackPairing(pairing), matchedPropertyKeys } : null;
    })
    .filter((item): item is BidFeedbackPairingMatch => item !== null);
};

const toFeedbackPairing = (
  fact: BidFeedbackPairingFact,
): BidFeedbackPairingMatch["pairing"] => ({
  pairingId: fact.pairingId,
  pairingNumber: fact.pairingNumber,
  rank: fact.rank,
  base: fact.base,
  zoneId: fact.zoneId,
  originDate: fact.originDate,
  endDate: fact.endDate,
  routeLabel: fact.routeLabel,
  reportTime: fact.reportTime,
  releaseTime: fact.releaseTime,
  totalCredit: fact.totalCredit,
  durationDays: fact.durationDays,
  tafbDays: fact.tafbDays,
});

const shouldLoadEfficientFlyingDefinition = (properties: BidFeedbackMatcherProperty[]): boolean =>
  properties.some(({ property }) => asRecord(property.bid)?.type === "efficient-flying-preference");

const shouldLoadRedeyeDefinition = (properties: BidFeedbackMatcherProperty[]): boolean =>
  properties.some(({ property }) => asRecord(property.bid)?.type === "redeye-preference");

export const loadBidFeedbackPairingMatcherContext = async ({
  pgPool,
  liveSchema,
  properties,
}: {
  pgPool: Pick<Pool, "query">;
  liveSchema: string;
  properties: BidFeedbackMatcherProperty[];
}): Promise<BidFeedbackPairingMatcherContext> => {
  const schema = validateSchemaName(liveSchema);
  const parentCodes = [
    ...(shouldLoadEfficientFlyingDefinition(properties) ? [pbsBidDefinitionCodes.efficientFlyingParent] : []),
    ...(shouldLoadRedeyeDefinition(properties) ? [pbsBidDefinitionCodes.redeyeParent] : []),
  ];
  if (parentCodes.length === 0) return EMPTY_BID_FEEDBACK_MATCHER_CONTEXT;

  const result = await pgPool.query<DictionaryRow>(
    `
      select parent_code, code, code_value
      from ${schema}.dictionary
      where parent_code = any($1::text[])
      order by parent_code, code, id
    `,
    [parentCodes],
  );

  const efficientRows = result.rows.filter((row) =>
    row.parent_code === pbsBidDefinitionCodes.efficientFlyingParent
    && row.code === pbsBidDefinitionCodes.efficientFlyingPercentile);
  const efficientFlying = efficientRows.length === 1
    ? parsePbsEfficientFlyingPercentileDefinition({ percentile: efficientRows[0]?.code_value })
    : { available: false as const };

  const redeyeValue = (code: string) => result.rows.find((row) =>
    row.parent_code === pbsBidDefinitionCodes.redeyeParent && row.code === code)?.code_value;
  const redeye = parsePbsRedeyeDefinition({
    startTime: redeyeValue(pbsBidDefinitionCodes.redeyeStartTime),
    endTime: redeyeValue(pbsBidDefinitionCodes.redeyeEndTime),
  });

  return {
    identity: stableHash({
      efficientFlying,
      redeye,
    }),
    efficientFlying,
    redeye,
  };
};

const formatRouteLabel = (legs: BidFeedbackLegFact[], assignment: string): string => {
  const routeLegs = legs.filter((leg) => leg.depAirport && leg.arrAirport);
  if (routeLegs.length === 0) return assignment;
  const airports = [routeLegs[0]?.depAirport, ...routeLegs.map((leg) => leg.arrAirport)]
    .filter((value): value is string => !!value);
  return airports.join("-");
};

const rowDateMs = (value: Date | string | null): number | null => {
  const date = toDate(value);
  return date ? date.getTime() : null;
};

export const mapBidFeedbackPairingFactRows = (rows: PairingFactRow[]): BidFeedbackPairingFact[] => {
  const factsById = new Map<string, BidFeedbackPairingFact>();
  const dutiesByPairingId = new Map<string, Map<number, BidFeedbackDutyFact>>();

  for (const row of rows) {
    const pairingId = String(row.pairing_id);
    const zoneId = row.base_zone_id?.trim() || "UTC";
    const startLocal = toLocalDateTime(row.pairing_start_utc, zoneId);
    const endLocal = toLocalDateTime(row.pairing_end_utc, zoneId);
    const existing = factsById.get(pairingId);
    const totalCreditMinutes = toNumber(row.total_credit_minutes) ?? 0;
    const fact = existing ?? {
      pairingId,
      pairingNumber: row.pairing_label?.trim() || pairingId,
      rank: row.rank_label?.trim() || "—",
      base: row.base?.trim().toUpperCase() || "",
      zoneId,
      originDate: startLocal?.date ?? "",
      endDate: endLocal?.date ?? startLocal?.date ?? "",
      routeLabel: row.assignment?.trim().toUpperCase() || "",
      reportTime: startLocal?.time ?? "--:--",
      releaseTime: endLocal?.time ?? "--:--",
      totalCredit: formatMinutesAsHhmm(totalCreditMinutes),
      durationDays: toSafeInteger(row.duration_days) ?? inclusiveDaySpan(startLocal?.date, endLocal?.date),
      durationDaysForSelection: inclusiveDaySpan(startLocal?.date, endLocal?.date),
      tafbDays: toSafeInteger(row.tafb_days),
      assignmentGroup: row.assignment_group?.trim().toUpperCase() || "",
      assignment: row.assignment?.trim().toUpperCase() || "",
      startLocal,
      endLocal,
      creditHours: totalCreditMinutes / 60,
      duties: [],
      legs: [],
    };

    factsById.set(pairingId, fact);
    if (row.duty_seq === null || row.seg_seq === null) continue;

    const dutySeq = toSafeInteger(row.duty_seq);
    const segmentSeq = toSafeInteger(row.seg_seq);
    if (dutySeq === null || segmentSeq === null) continue;

    const duties = dutiesByPairingId.get(pairingId) ?? new Map<number, BidFeedbackDutyFact>();
    const duty = duties.get(dutySeq) ?? {
      dutySeq,
      checkInLocal: toLocalDateTime(row.duty_start_utc, zoneId),
      checkOutLocal: toLocalDateTime(row.duty_end_utc, zoneId),
      endAirport: row.duty_end_arp?.trim().toUpperCase() || "",
      endCity: row.duty_end_city?.trim().toUpperCase() || null,
      layoverHours: (() => {
        const minutes = toNumber(row.duty_layover_minutes);
        return minutes === null ? null : minutes / 60;
      })(),
      legs: [],
    };
    duties.set(dutySeq, duty);
    dutiesByPairingId.set(pairingId, duties);
    if (!fact.duties.includes(duty)) fact.duties.push(duty);

    const assignment = row.seg_assignment?.trim().toUpperCase() || "";
    const leg: BidFeedbackLegFact = {
      dutySeq,
      segmentSeq,
      flightNumber: row.flt_num?.trim().toUpperCase() || "",
      depAirport: row.dep_arp?.trim().toUpperCase() || "",
      depCity: row.dep_city?.trim().toUpperCase() || null,
      arrAirport: row.arv_arp?.trim().toUpperCase() || "",
      arrCity: row.arv_city?.trim().toUpperCase() || null,
      depLocal: toLocalDateTime(row.leg_start_utc, zoneId),
      arrLocal: toLocalDateTime(row.leg_end_utc, zoneId),
      depInstantMs: rowDateMs(row.leg_start_utc),
      arrInstantMs: rowDateMs(row.leg_end_utc),
      assignment,
      isFly: assignment === "FLT" || assignment === "FLY",
      isDeadhead: assignment === "DH" || assignment === "DHD",
    };
    duty.legs.push(leg);
    fact.legs.push(leg);
  }

  return [...factsById.values()]
    .map((fact) => {
      fact.duties.sort((left, right) => left.dutySeq - right.dutySeq);
      fact.legs.sort((left, right) => left.dutySeq - right.dutySeq || left.segmentSeq - right.segmentSeq);
      for (const duty of fact.duties) {
        duty.legs.sort((left, right) => left.segmentSeq - right.segmentSeq);
      }
      const firstDuty = fact.duties[0];
      const lastDuty = fact.duties.at(-1);
      const reportLocal = firstDuty?.checkInLocal ?? fact.startLocal;
      const releaseLocal = lastDuty?.checkOutLocal ?? fact.endLocal;
      return {
        ...fact,
        originDate: fact.startLocal?.date ?? reportLocal?.date ?? "",
        endDate: fact.endLocal?.date ?? releaseLocal?.date ?? fact.startLocal?.date ?? "",
        routeLabel: formatRouteLabel(fact.legs, fact.assignment),
        reportTime: reportLocal?.time ?? "--:--",
        releaseTime: releaseLocal?.time ?? "--:--",
      };
    });
};

export const loadBidFeedbackPairingFacts = async ({
  pgPool,
  liveSchema,
  period,
  actorContext,
  pairingIds,
}: {
  pgPool: Pick<Pool, "query">;
  liveSchema: string;
  period: BidFeedbackMatcherPeriod;
  actorContext: BidFeedbackMatcherActorContext;
  pairingIds?: string[];
}): Promise<BidFeedbackPairingFact[]> => {
  const schema = validateSchemaName(liveSchema);
  const actorBase = actorContext.base?.trim().toUpperCase() ?? "";
  const actorRank = actorContext.rank?.trim().toUpperCase() ?? "";
  if (!isIsoDate(period.rpStartLocal) || !isIsoDate(period.rpEndLocal) || !actorBase) return [];
  const scopedPairingIds = [...new Set((pairingIds ?? [])
    .map((pairingId) => pairingId.trim())
    .filter((pairingId) => /^\d+$/.test(pairingId)))];

  const actorRankFilter = actorRank
    ? `
          and exists (
            select 1
            from ${schema}.pairing_composition actor_composition
            where actor_composition.pairing_id = p.id
              and actor_composition.is_deleted = 0
              and upper(btrim(actor_composition.acting_rank)) = $4::varchar
          )`
    : "";
  const pairingIdFilter = scopedPairingIds.length > 0
    ? `and p.id = any($${actorRank ? 5 : 4}::bigint[])`
    : "";
  const params: Array<string | string[]> = actorRank
    ? [period.rpStartLocal, period.rpEndLocal, actorBase, actorRank]
    : [period.rpStartLocal, period.rpEndLocal, actorBase];
  if (scopedPairingIds.length > 0) {
    params.push(scopedPairingIds);
  }

  const result = await pgPool.query<PairingFactRow>(
    `
      with bid_feedback_pairing_facts as materialized (
        select
          p.id::text as pairing_id,
          p.pairing_label,
          p.base,
          base_airport.zone_id as base_zone_id,
          p.assignment_group,
          p.assignment,
          p.sch_str_dt_utc as pairing_start_utc,
          p.sch_end_dt_utc as pairing_end_utc,
          p.duration_days,
          p.tafb as tafb_days
        from ${schema}.pairing p
        left join ${schema}.airport base_airport
          on upper(btrim(base_airport.airport)) = upper(btrim(p.base))
        where p.is_deleted = 0
          and upper(btrim(p.assignment_group)) in ('FLY', 'RES')
          and upper(btrim(p.base)) = $3::varchar
          ${actorRankFilter}
          ${pairingIdFilter}
          and (p.sch_str_dt_utc at time zone coalesce(nullif(base_airport.zone_id, ''), 'UTC'))::date <= $2::date
          and (p.sch_end_dt_utc at time zone coalesce(nullif(base_airport.zone_id, ''), 'UTC'))::date >= $1::date
      ),
      rank_rollup as materialized (
        select
          ranked.pairing_id,
          string_agg(ranked.acting_rank, '+' order by ranked.display_order, ranked.acting_rank) as rank_label
        from (
          select
            pc.pairing_id,
            upper(btrim(pc.acting_rank)) as acting_rank,
            min(coalesce(r.display_order, 2147483647)) as display_order
          from bid_feedback_pairing_facts p
          join ${schema}.pairing_composition pc
            on pc.pairing_id::text = p.pairing_id
           and pc.is_deleted = 0
          left join ${schema}.rank r
            on upper(btrim(r.rank)) = upper(btrim(pc.acting_rank))
          where nullif(btrim(coalesce(pc.acting_rank, '')), '') is not null
          group by pc.pairing_id, upper(btrim(pc.acting_rank))
        ) ranked
        group by ranked.pairing_id
      ),
      duty_credit as materialized (
        select
          credit.pairing_id,
          sum(credit.credit_minutes) as total_credit_minutes
        from (
          select distinct on (s.pairing_id, s.duty_seq)
            s.pairing_id::text as pairing_id,
            coalesce(s.duty_act_credited_minutes, s.duty_sch_credited_minutes, 0) as credit_minutes
          from ${schema}.pairing_segment s
          join bid_feedback_pairing_facts p
            on p.pairing_id = s.pairing_id::text
          where s.is_deleted = 0
          order by s.pairing_id, s.duty_seq, s.seg_seq
        ) credit
        group by credit.pairing_id
      )
      select
        p.pairing_id,
        p.pairing_label,
        p.base,
        p.base_zone_id,
        p.assignment_group,
        p.assignment,
        p.pairing_start_utc,
        p.pairing_end_utc,
        p.duration_days,
        p.tafb_days,
        rank_rollup.rank_label,
        coalesce(duty_credit.total_credit_minutes, 0)::text as total_credit_minutes,
        s.duty_seq,
        s.seg_seq,
        s.flt_num,
        s.dep_arp,
        dep_airport.city as dep_city,
        s.arv_arp,
        arr_airport.city as arv_city,
        s.duty_end_arp,
        duty_end_airport.city as duty_end_city,
        coalesce(s.brief_start_utc, s.duty_sch_str_dt_utc, s.sch_str_dt_utc) as duty_start_utc,
        coalesce(s.debrief_end_utc, s.duty_sch_end_dt_utc, s.sch_end_dt_utc) as duty_end_utc,
        coalesce(s.duty_sch_rest_min, s.duty_act_rest_min) as duty_layover_minutes,
        s.sch_str_dt_utc as leg_start_utc,
        s.sch_end_dt_utc as leg_end_utc,
        s.seg_assignment
      from bid_feedback_pairing_facts p
      left join duty_credit
        on duty_credit.pairing_id = p.pairing_id
      left join rank_rollup
        on rank_rollup.pairing_id::text = p.pairing_id
      left join ${schema}.pairing_segment s
        on s.pairing_id::text = p.pairing_id
       and s.is_deleted = 0
      left join ${schema}.airport dep_airport
        on upper(btrim(dep_airport.airport)) = upper(btrim(s.dep_arp))
      left join ${schema}.airport arr_airport
        on upper(btrim(arr_airport.airport)) = upper(btrim(s.arv_arp))
      left join ${schema}.airport duty_end_airport
        on upper(btrim(duty_end_airport.airport)) = upper(btrim(s.duty_end_arp))
      order by
        p.pairing_start_utc,
        p.pairing_label,
        p.pairing_id,
        s.duty_seq nulls last,
        s.seg_seq nulls last
    `,
    params,
  );

  return mapBidFeedbackPairingFactRows(result.rows);
};

export const matchBidFeedbackPairings = async ({
  pgPool,
  liveSchema,
  period,
  actorContext,
  properties,
  context,
  pairingIds,
}: BidFeedbackPairingMatcherInput): Promise<BidFeedbackPairingMatch[]> => {
  const facts = await loadBidFeedbackPairingFacts({ pgPool, liveSchema, period, actorContext, pairingIds });
  return selectBidFeedbackPairings({
    facts,
    period,
    properties,
    context: context ?? await loadBidFeedbackPairingMatcherContext({ pgPool, liveSchema, properties }),
  });
};
