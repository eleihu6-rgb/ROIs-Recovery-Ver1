import {
  pbsLineAaPropertyCodes,
  pbsLineF8PropertyCodes,
  pbsLineLegacyPropertyCodes,
  pbsLineReservePropertyCodes,
  pbsLineReserveCallTypes,
  type PbsLineDraftProperty,
  type PbsLineMinimumBaseLayoverConfig,
  type PbsLineReserveDateScope,
} from "../../../../packages/contracts/pbs-line-bids.js";
import { pbsPairingF8PropertyCodes } from "../../../../packages/contracts/pbs-pairing-bids.js";
import { isValidIsoDate } from "../lineholder/date-utils.js";
import { LineholderBidServiceError, parseTierKey } from "../lineholder/shared.js";
import {
  formatLineDurationCompact,
  normalizeLineDurationPadded,
  parseLineDurationMinutes,
} from "./line-minimum-base-layover-config.js";

const MAX_LINEHOLDER_TIER = 7;
const TARGET_CREDIT_MIN = 40;
const TARGET_CREDIT_MAX = 110;
const TARGET_CREDIT_MIN_SPREAD = 5;
const WORK_BLOCK_MIN = 1;
const WORK_BLOCK_MAX = 12;
const COMMUTER_PATTERN_MIN = 1;
const COMMUTER_PATTERN_MAX = 14;
const CREDIT_DENSITY_MIN_CREDIT_MINUTES = 40 * 60;
const CREDIT_DENSITY_MAX_CREDIT_MINUTES = 120 * 60;
const CREDIT_DENSITY_MIN_WORKING_DAYS = 1;
const CREDIT_DENSITY_MAX_WORKING_DAYS = 31;
const CREDIT_DENSITY_STRENGTHS = new Set(["normal", "strong", "must_try"]);
const RESERVE_FLYING_PATTERN_MIN_SEGMENTS = 1;
const RESERVE_FLYING_PATTERN_MAX_SEGMENTS = 4;
const RESERVE_FLYING_PATTERN_STRENGTHS = CREDIT_DENSITY_STRENGTHS;
const LINE_RESERVE_CALL_TYPES = new Set<string>(pbsLineReserveCallTypes);
const MIN_PAIRING_MIX_TOTAL_DAYS = 3;
const MAX_PAIRING_MIX_TOTAL_DAYS = 6;

const LEGACY_FLAG_CODES = new Set<number>([
  pbsLineLegacyPropertyCodes.maxCreditWindow,
  pbsLineLegacyPropertyCodes.minCreditWindow,
  pbsLineLegacyPropertyCodes.clearScheduleAndStartNextBidGroup,
  pbsLineLegacyPropertyCodes.noSameDayPairings,
  pbsLineLegacyPropertyCodes.waiveNoSameDayDutyStarts,
]);

const AA_FLAG_CODES = new Set<number>([
  pbsLineAaPropertyCodes.maximizeCredit,
  pbsLineAaPropertyCodes.maximizeInternationalCredit,
  pbsLineAaPropertyCodes.allowMultiplePairings,
  pbsLineAaPropertyCodes.allowCoTerminalMixInWorkBlock,
  pbsLineAaPropertyCodes.clearBids,
  pbsLineAaPropertyCodes.waive24HoursRestInDomicile,
  pbsLineAaPropertyCodes.waiveMinimumDomicileRest,
  pbsLineAaPropertyCodes.waive30HoursIn7Days,
  pbsLineAaPropertyCodes.waiveCarryOverCredit,
]);

const AA_DATE_CODES = new Set<number>([
  pbsLineAaPropertyCodes.allowDoubleUpOnDate,
  pbsLineAaPropertyCodes.allowMultiplePairingsOnDate,
]);

const AA_UNIQUE_PER_TIER_CODES = new Set<number>([
  pbsLineAaPropertyCodes.targetCreditRange,
  pbsLineAaPropertyCodes.workBlockSize,
  pbsLineAaPropertyCodes.preferCadenceOnDayOfWeek,
  pbsLineAaPropertyCodes.commutableWorkBlock,
]);

const getPropertyLabel = (property: PbsLineDraftProperty) =>
  property.name.trim() || `Property ${property.propertyCode}`;

const isValidTimeOfDay = (value: string) => {
  const match = value.trim().match(/^(\d{2}):([0-5]\d)$/);

  if (!match) {
    return false;
  }

  const hours = Number.parseInt(match[1] ?? "", 10);
  return hours >= 0 && hours <= 23;
};

const parseCreditMinutes = (value: string) => {
  const match = value.trim().match(/^(\d{2,3}):([0-5]\d)$/);

  if (!match) {
    return null;
  }

  const hours = Number.parseInt(match[1] ?? "", 10);
  const minutes = Number.parseInt(match[2] ?? "", 10);
  return hours * 60 + minutes;
};

const getIsoDateDayOfMonth = (value: string) => value.slice(8, 10);

const enumerateDateRangeDayKeys = (from: string, to: string) => {
  const keys: string[] = [];
  const cursor = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);

  while (cursor <= end) {
    keys.push(`day:${String(cursor.getUTCDate()).padStart(2, "0")}`);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return keys;
};

const getReserveFlyingPatternDateKeys = (dateScope: PbsLineReserveDateScope) => {
  if (dateScope.mode === "whole_month") {
    return ["whole_month"];
  }

  if (dateScope.mode === "first_half") {
    return Array.from({ length: 15 }, (_value, index) => `day:${String(index + 1).padStart(2, "0")}`);
  }

  if (dateScope.mode === "second_half") {
    return Array.from({ length: 16 }, (_value, index) => `day:${String(index + 16).padStart(2, "0")}`);
  }

  if (dateScope.mode === "date_range") {
    return enumerateDateRangeDayKeys(dateScope.from, dateScope.to);
  }

  return dateScope.dates.map((date) => `day:${getIsoDateDayOfMonth(date)}`);
};

const validateReserveFlyingPatternDateScope = (dateScope: PbsLineReserveDateScope) => {
  if (dateScope.mode === "whole_month" || dateScope.mode === "first_half" || dateScope.mode === "second_half") {
    return;
  }

  if (dateScope.mode === "date_range") {
    if (!isValidIsoDate(dateScope.from) || !isValidIsoDate(dateScope.to)) {
      throw new LineholderBidServiceError(400, "Reserve / Flying Date Pattern date range must use valid dates.");
    }

    if (dateScope.to < dateScope.from) {
      throw new LineholderBidServiceError(
        400,
        "Reserve / Flying Date Pattern date range end date must be on or after start date.",
      );
    }

    return;
  }

  if (dateScope.dates.length === 0) {
    throw new LineholderBidServiceError(400, "Reserve / Flying Date Pattern specific dates cannot be empty.");
  }

  const uniqueDates = new Set<string>();

  for (const date of dateScope.dates) {
    if (!isValidIsoDate(date)) {
      throw new LineholderBidServiceError(400, "Reserve / Flying Date Pattern specific dates must be valid dates.");
    }

    if (uniqueDates.has(date)) {
      throw new LineholderBidServiceError(400, "Reserve / Flying Date Pattern specific dates cannot repeat.");
    }

    uniqueDates.add(date);
  }
};

const validateReserveFlyingPattern = (property: PbsLineDraftProperty) => {
  if (
    property.bid.type !== "reserve-flying-date-pattern"
    || property.bid.segments.length < RESERVE_FLYING_PATTERN_MIN_SEGMENTS
    || property.bid.segments.length > RESERVE_FLYING_PATTERN_MAX_SEGMENTS
    || !RESERVE_FLYING_PATTERN_STRENGTHS.has(property.bid.strength)
  ) {
    throw new LineholderBidServiceError(
      400,
      "Reserve / Flying Date Pattern must use 1-4 valid segments and a valid strength.",
    );
  }

  const dateKeys = new Set<string>();

  for (const segment of property.bid.segments) {
    if (segment.workType !== "reserve" && segment.workType !== "flying") {
      throw new LineholderBidServiceError(
        400,
        "Reserve / Flying Date Pattern segments must be reserve or flying.",
      );
    }

    if (segment.workType === "reserve" && !LINE_RESERVE_CALL_TYPES.has(segment.callType)) {
      throw new LineholderBidServiceError(
        400,
        "Reserve / Flying Date Pattern reserve segments must use a valid call type.",
      );
    }

    if (segment.workType === "flying" && "callType" in segment) {
      throw new LineholderBidServiceError(
        400,
        "Reserve / Flying Date Pattern flying segments cannot use a reserve call type.",
      );
    }

    validateReserveFlyingPatternDateScope(segment.dateScope);

    for (const dateKey of getReserveFlyingPatternDateKeys(segment.dateScope)) {
      if (dateKeys.has("whole_month") || dateKeys.has(dateKey) || dateKey === "whole_month" && dateKeys.size > 0) {
        throw new LineholderBidServiceError(
          400,
          "Reserve / Flying Date Pattern segments cannot overlap on the same date.",
        );
      }

      dateKeys.add(dateKey);
    }
  }
};

const validateCreditWindowPreference = (property: PbsLineDraftProperty) => {
  if (
    property.bid.type !== "credit-window-preference"
    || (property.bid.direction !== "more" && property.bid.direction !== "less")
  ) {
    throw new LineholderBidServiceError(
      400,
      "Credit Window Preference must use More credit or Less credit.",
    );
  }
};

const validateReserveLine = (property: PbsLineDraftProperty) => {
  if (property.bid.type !== "flag") {
    throw new LineholderBidServiceError(400, "Reserve must use a flag bid.");
  }

  if (property.action !== "award" && property.action !== "avoid") {
    throw new LineholderBidServiceError(400, "Reserve requires Award or Avoid.");
  }
};

const validateReserveShortCallDateScope = (
  dateScope: Extract<PbsLineDraftProperty["bid"], { type: "reserve-call-type-date-scope" }>["dateScope"],
) => {
  if (dateScope.mode === "whole_month" || dateScope.mode === "first_half" || dateScope.mode === "second_half") {
    return;
  }

  if (dateScope.mode === "date_range") {
    if (!isValidIsoDate(dateScope.from) || !isValidIsoDate(dateScope.to)) {
      throw new LineholderBidServiceError(400, "Reserve Preference date range must use valid YYYY-MM-DD dates.");
    }

    if (dateScope.to < dateScope.from) {
      throw new LineholderBidServiceError(400, "Reserve Preference date range end date must be on or after start date.");
    }

    return;
  }

  const dates = dateScope.dates.map((value) => value.trim()).filter((value) => value.length > 0);

  if (dates.length === 0) {
    throw new LineholderBidServiceError(400, "Reserve Preference requires at least one date.");
  }

  if (new Set(dates).size !== dates.length) {
    throw new LineholderBidServiceError(400, "Reserve Preference dates must be unique.");
  }

  if (!dates.every(isValidIsoDate)) {
    throw new LineholderBidServiceError(400, "Reserve Preference must use valid YYYY-MM-DD dates.");
  }
};

const validateReserveShortCall = (property: PbsLineDraftProperty) => {
  if (property.bid.type !== "reserve-call-type-date-scope") {
    throw new LineholderBidServiceError(
      400,
      "Reserve Preference must use a valid reserve call type and date scope.",
    );
  }

  if (property.action !== "award" && property.action !== "avoid") {
    throw new LineholderBidServiceError(400, "Reserve Preference requires Award or Avoid.");
  }

  if (!LINE_RESERVE_CALL_TYPES.has(property.bid.callType)) {
    throw new LineholderBidServiceError(400, "Reserve Preference must use a valid reserve call type.");
  }

  validateReserveShortCallDateScope(property.bid.dateScope);
};

type LineValidationOptions = {
  minimumBaseLayoverConfig?: PbsLineMinimumBaseLayoverConfig;
  isGrandfatheredMinimumBaseLayover?: (property: PbsLineDraftProperty) => boolean;
};

const validateMinimumBaseLayover = (
  property: PbsLineDraftProperty,
  config: PbsLineMinimumBaseLayoverConfig | undefined,
  isGrandfathered: boolean,
) => {
  if (property.bid.type !== "minimum-base-layover") {
    throw new LineholderBidServiceError(
      400,
      "Minimum Base Layover must use a valid duration like 13:00.",
    );
  }

  const duration = normalizeLineDurationPadded(property.bid.minimumDuration);
  const durationMinutes = duration ? parseLineDurationMinutes(duration) : null;

  if (durationMinutes === null) {
    throw new LineholderBidServiceError(
      400,
      "Minimum Base Layover must use a valid duration like 13:00.",
    );
  }

  if (config === undefined || isGrandfathered) {
    return;
  }

  if (!config.available) {
    throw new LineholderBidServiceError(400, "Minimum Base Layover configuration is unavailable.");
  }

  const minimumMinutes = parseLineDurationMinutes(config.minDuration);
  if (minimumMinutes === null || minimumMinutes <= 0) {
    throw new LineholderBidServiceError(400, "Minimum Base Layover configuration is unavailable.");
  }

  if (durationMinutes < minimumMinutes) {
    throw new LineholderBidServiceError(
      400,
      `Minimum Base Layover must be at least ${formatLineDurationCompact(config.minDuration)}.`,
    );
  }
};

const incrementCounter = (counter: Map<string, number>, key: string) => {
  counter.set(key, (counter.get(key) ?? 0) + 1);
};

const validateTier = (tier: string) => {
  const parsed = parseTierKey(tier);

  if (parsed.number > MAX_LINEHOLDER_TIER) {
    throw new LineholderBidServiceError(400, `Unsupported lineholder tier: ${tier}`);
  }

  return parsed.key;
};

const validatePairingMixValue = (value: string) => {
  const match = value.trim().match(/^(\d+)\s*,\s*(\d+)$/);

  if (!match) {
    return false;
  }

  const left = Number.parseInt(match[1] ?? "", 10);
  const right = Number.parseInt(match[2] ?? "", 10);
  const total = left + right;

  return Number.isInteger(left)
    && Number.isInteger(right)
    && left > 0
    && right > 0
    && total >= MIN_PAIRING_MIX_TOTAL_DAYS
    && total <= MAX_PAIRING_MIX_TOTAL_DAYS;
};

export const validateLineDraftProperties = (
  properties: PbsLineDraftProperty[],
  options: LineValidationOptions = {},
) => {
  const uniquePerTierCounts = new Map<string, number>();

  for (const property of properties) {
    if (property.propertyCode === pbsPairingF8PropertyCodes.efficientFlyingFirst) {
      throw new LineholderBidServiceError(
        400,
        "Efficient Flying First is a Pairing property and cannot be saved as a Line property.",
      );
    }

    const label = getPropertyLabel(property);

    if (LEGACY_FLAG_CODES.has(property.propertyCode) && property.bid.type !== "flag") {
      throw new LineholderBidServiceError(400, `${label} must be a flag bid.`);
    }

    if (
      property.propertyCode === pbsLineLegacyPropertyCodes.forgetLine
      && (property.bid.type !== "stepper" || property.bid.value < 1)
    ) {
      throw new LineholderBidServiceError(400, "Forget Line must be a positive line number.");
    }

    if (property.propertyCode === pbsLineLegacyPropertyCodes.minBaseLayover) {
      validateMinimumBaseLayover(
        property,
        options.minimumBaseLayoverConfig,
        options.isGrandfatheredMinimumBaseLayover?.(property) ?? false,
      );
    }

    if (
      property.propertyCode === pbsLineLegacyPropertyCodes.commuterPattern
      && (property.bid.type !== "days-off-on-pattern"
        || property.bid.minDaysOff < COMMUTER_PATTERN_MIN
        || property.bid.minDaysOff > COMMUTER_PATTERN_MAX
        || property.bid.minDaysOn < COMMUTER_PATTERN_MIN
        || property.bid.minDaysOn > COMMUTER_PATTERN_MAX
        || property.bid.maxDaysOn < property.bid.minDaysOn
        || property.bid.maxDaysOn > COMMUTER_PATTERN_MAX)
    ) {
      throw new LineholderBidServiceError(
        400,
        "Commuter Pattern must use valid work/off block values between 1 and 14.",
      );
    }

    if (
      property.propertyCode === pbsLineLegacyPropertyCodes.commuterPattern
      && property.bid.type === "days-off-on-pattern"
      && property.bid.dateRange
    ) {
      if (!isValidIsoDate(property.bid.dateRange.from) || !isValidIsoDate(property.bid.dateRange.to)) {
        throw new LineholderBidServiceError(400, "Commuter Pattern date range must use valid dates.");
      }

      if (property.bid.dateRange.to < property.bid.dateRange.from) {
        throw new LineholderBidServiceError(
          400,
          "Commuter Pattern date range end date must be on or after start date.",
        );
      }

      const windowDays = enumerateDateRangeDayKeys(property.bid.dateRange.from, property.bid.dateRange.to).length;
      const minimumCycleDays = property.bid.minDaysOn + property.bid.minDaysOff;

      if (windowDays < minimumCycleDays) {
        throw new LineholderBidServiceError(
          400,
          `Commuter Pattern date range must be at least ${minimumCycleDays} days long.`,
        );
      }
    }

    if (property.propertyCode === pbsLineLegacyPropertyCodes.mostFlyingInLeastDays) {
      const creditMinutes = property.bid.type === "credit-density-preference"
        ? parseCreditMinutes(property.bid.minimumTotalCredit)
        : null;

      if (
        property.bid.type !== "credit-density-preference"
        || creditMinutes === null
        || creditMinutes < CREDIT_DENSITY_MIN_CREDIT_MINUTES
        || creditMinutes > CREDIT_DENSITY_MAX_CREDIT_MINUTES
        || property.bid.maximumWorkingDays < CREDIT_DENSITY_MIN_WORKING_DAYS
        || property.bid.maximumWorkingDays > CREDIT_DENSITY_MAX_WORKING_DAYS
        || !CREDIT_DENSITY_STRENGTHS.has(property.bid.strength)
      ) {
        throw new LineholderBidServiceError(
          400,
          `${label} must use 40:00-120:00 credit and 1-31 working days.`,
        );
      }
    }

    if (property.propertyCode === pbsLineLegacyPropertyCodes.reserveFlyingDatePattern) {
      validateReserveFlyingPattern(property);
    }

    if (property.propertyCode === pbsLineF8PropertyCodes.creditWindowPreference) {
      validateCreditWindowPreference(property);
    }

    if (property.propertyCode === pbsLineAaPropertyCodes.reserve) {
      validateReserveLine(property);
    }

    if (property.propertyCode === pbsLineReservePropertyCodes.shortCallType) {
      validateReserveShortCall(property);
    }

    if (
      property.propertyCode === pbsLineAaPropertyCodes.targetCreditRange
      && (property.bid.type !== "stepper-range"
        || property.bid.from < TARGET_CREDIT_MIN
        || property.bid.to > TARGET_CREDIT_MAX
        || property.bid.from > property.bid.to
        || property.bid.to - property.bid.from < TARGET_CREDIT_MIN_SPREAD)
    ) {
      throw new LineholderBidServiceError(
        400,
        "Target Credit Range must be between 40 and 110 with at least 5 credits of spread.",
      );
    }

    if (
      property.propertyCode === pbsLineAaPropertyCodes.workBlockSize
      && (property.bid.type !== "stepper-range"
        || property.bid.from < WORK_BLOCK_MIN
        || property.bid.to > WORK_BLOCK_MAX
        || property.bid.from > property.bid.to)
    ) {
      throw new LineholderBidServiceError(400, "Work Block Size must be between 1 and 12.");
    }

    if (
      property.propertyCode === pbsLineAaPropertyCodes.preferCadenceOnDayOfWeek
      && (property.bid.type !== "select" || !property.bid.options.includes(property.bid.value))
    ) {
      throw new LineholderBidServiceError(400, "Prefer Cadence on Day-of-Week must use a valid weekday.");
    }

    if (
      property.propertyCode === pbsLineAaPropertyCodes.commutableWorkBlock
      && (property.bid.type !== "time-range"
        || !isValidTimeOfDay(property.bid.from)
        || !isValidTimeOfDay(property.bid.to))
    ) {
      throw new LineholderBidServiceError(400, "Commutable Work Block must use valid HH:MM times.");
    }

    if (
      property.propertyCode === pbsLineAaPropertyCodes.pairingMixInWorkBlock
      && (property.bid.type !== "tag-list"
        || property.bid.values.length === 0
        || !property.bid.values.every(validatePairingMixValue))
    ) {
      throw new LineholderBidServiceError(
        400,
        "Pairing Mix in a Work Block must use pairing length pairs totaling 3 to 6 days.",
      );
    }

    if (AA_FLAG_CODES.has(property.propertyCode) && property.bid.type !== "flag") {
      throw new LineholderBidServiceError(400, `${label} must be a flag bid.`);
    }

    if (
      AA_DATE_CODES.has(property.propertyCode)
      && (property.bid.type !== "date" || !isValidIsoDate(property.bid.value))
    ) {
      throw new LineholderBidServiceError(400, `${label} must use a valid date.`);
    }

    for (const tier of property.tiers) {
      const tierKey = validateTier(tier);

      if (AA_UNIQUE_PER_TIER_CODES.has(property.propertyCode)) {
        incrementCounter(uniquePerTierCounts, `${property.propertyCode}:${tierKey}`);
      }
    }
  }

  for (const [key, count] of uniquePerTierCounts.entries()) {
    if (count <= 1) {
      continue;
    }

    const [propertyCode, tier] = key.split(":");
    const property = properties.find((item) => String(item.propertyCode) === propertyCode);
    const propertyName = property ? getPropertyLabel(property) : `Property ${propertyCode}`;

    throw new LineholderBidServiceError(400, `${propertyName} can only be used once in ${tier}.`);
  }
};
