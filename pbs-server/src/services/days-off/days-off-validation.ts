import {
  pbsDaysOffAaPropertyCodes,
  pbsDaysOffMutuallyExclusivePropertyCodes,
  pbsDaysOffUniquePerTierPropertyCodes,
  type PbsDaysOffDraftProperty,
} from "../../../../packages/contracts/pbs-days-off-bids.js";
import { expandPreferOffBidValues } from "../../../../packages/contracts/pbs-prefer-off.js";
import type { PbsPreferOffConfig } from "../../../../packages/contracts/pbs-prefer-off.js";
import {
  isIsoDateInRange,
  isValidIsoDate,
  parseIsoDate,
} from "../lineholder/date-utils.js";
import { LineholderBidServiceError } from "../lineholder/shared.js";

const PREFER_OFF_PROPERTY_CODE = 201;
const MINIMUM_DAYS_OFF_MIN = 1;
const MINIMUM_DAYS_OFF_MAX = 12;
const MIN_CONSECUTIVE_DAYS_OFF_IN_WINDOW_CODE = 204;
const MIN_CONSECUTIVE_DAYS_OFF_MIN = 1;
const MIN_CONSECUTIVE_DAYS_OFF_MAX = 14;
const DAYS_OFF_ON_PATTERN_CODE = 205;
const DAYS_OFF_ON_PATTERN_MIN = 1;
const EMPLOYEE_SCHEDULE_PREFERENCE_CODE = 206;
const EMPLOYEE_SCHEDULE_PREFERENCE_DAYS_MIN = 1;
const EMPLOYEE_SCHEDULE_PREFERENCE_DAYS_MAX = 31;
const MAX_LINEHOLDER_TIER = 7;
const DAY_MS = 86_400_000;
const MUTUALLY_EXCLUSIVE_CODES = new Set<number>(pbsDaysOffMutuallyExclusivePropertyCodes);
const UNIQUE_PER_TIER_CODES = new Set<number>(pbsDaysOffUniquePerTierPropertyCodes);
const FLAG_CODES = new Set<number>([
  pbsDaysOffAaPropertyCodes.maximizeWeekendDaysOff,
  pbsDaysOffAaPropertyCodes.maximizeTotalDaysOff,
  pbsDaysOffAaPropertyCodes.maximizeBlockOfDaysOff,
  pbsDaysOffAaPropertyCodes.waiveMinimumDaysOff,
]);
const DATE_CODES = new Set<number>([
  pbsDaysOffAaPropertyCodes.stringOfDaysOffStartingOnDate,
  pbsDaysOffAaPropertyCodes.stringOfDaysOffEndingOnDate,
]);

type DaysOffDraftValidationOptions = {
  rpStartLocal?: string;
  rpEndLocal?: string;
  preferOffConfig?: PbsPreferOffConfig;
};

const getPropertyLabel = (property: PbsDaysOffDraftProperty) =>
  property.name.trim() || `Property ${property.propertyCode}`;

const incrementCounter = (counter: Map<string, number>, key: string) => {
  counter.set(key, (counter.get(key) ?? 0) + 1);
};

const parseTierNumber = (tier: string) => {
  const tierNumber = Number.parseInt(tier.slice(1), 10);

  if (!Number.isInteger(tierNumber) || tierNumber < 1 || tierNumber > MAX_LINEHOLDER_TIER) {
    throw new LineholderBidServiceError(400, `Unsupported lineholder tier: ${tier}`);
  }

  return tierNumber;
};

const validatePreferOffProperty = (
  property: PbsDaysOffDraftProperty,
  options: DaysOffDraftValidationOptions,
) => {
  if (property.bid.type !== "tag-list") {
    throw new LineholderBidServiceError(400, "Prefer Off must use dates, a date range, days of week, or weekends.");
  }

  if (property.tiers.length === 0) {
    throw new LineholderBidServiceError(400, "Prefer Off requires at least one tier.");
  }

  const expansion = expandPreferOffBidValues(
    property.bid.values,
    options.rpStartLocal ?? "",
    options.rpEndLocal ?? "",
    options.preferOffConfig,
  );

  if (expansion.error === "invalid_period") {
    throw new LineholderBidServiceError(400, "Prefer Off requires a valid bid period.");
  }

  if (expansion.error === "weekend_unavailable") {
    throw new LineholderBidServiceError(400, "Prefer Off weekend configuration is unavailable.");
  }

  if (
    expansion.error === "invalid_range"
    && expansion.rangeFrom
    && expansion.rangeTo
    && expansion.rangeFrom > expansion.rangeTo
  ) {
    throw new LineholderBidServiceError(400, "Prefer Off date range end date must be on or after start date.");
  }

  if (expansion.error === "outside_period" || expansion.error === "invalid_range") {
    throw new LineholderBidServiceError(400, "Prefer Off dates must be inside the current bid period.");
  }

  if (!expansion.isTimeWindowValid) {
    throw new LineholderBidServiceError(400, "Prefer Off time window must use a valid same-day From and To time.");
  }

  if (!expansion.isValid) {
    throw new LineholderBidServiceError(400, "Prefer Off must contain one valid selection type.");
  }
};

const getInclusiveDateWindowDays = (from: string, to: string) => {
  const fromDate = parseIsoDate(from);
  const toDate = parseIsoDate(to);

  if (!fromDate || !toDate) {
    return null;
  }

  return Math.floor((toDate.getTime() - fromDate.getTime()) / DAY_MS) + 1;
};

export const validateDaysOffDraftProperties = (
  properties: PbsDaysOffDraftProperty[],
  options: DaysOffDraftValidationOptions = {},
) => {
  const uniquePerTierCounts = new Map<string, number>();
  const mutexLabelsByTier = new Map<string, string[]>();
  const hasStartingStringByTier = new Set<string>();
  const hasEndingStringByTier = new Set<string>();
  const minimumDaysOffByTier = new Map<number, {
    label: string;
    value: number;
  }>();

  for (const property of properties) {
    if (
      property.propertyCode === pbsDaysOffAaPropertyCodes.minimumDaysOffBetweenWorkBlocks
      && (property.bid.type !== "stepper"
        || property.bid.value < MINIMUM_DAYS_OFF_MIN
        || property.bid.value > MINIMUM_DAYS_OFF_MAX)
    ) {
      throw new LineholderBidServiceError(
        400,
        "Minimum Days Off Between Work Blocks must be between 1 and 12.",
      );
    }

    if (FLAG_CODES.has(property.propertyCode) && property.bid.type !== "flag") {
      throw new LineholderBidServiceError(400, `${getPropertyLabel(property)} must be a flag bid.`);
    }

    if (DATE_CODES.has(property.propertyCode)) {
      if (property.bid.type !== "date" || !isValidIsoDate(property.bid.value)) {
        throw new LineholderBidServiceError(400, `${getPropertyLabel(property)} must use a valid date.`);
      }

      if (
        options.rpStartLocal
        && options.rpEndLocal
        && !isIsoDateInRange(property.bid.value, options.rpStartLocal, options.rpEndLocal)
      ) {
        throw new LineholderBidServiceError(
          400,
          `${getPropertyLabel(property)} date must be inside the current roster period.`,
          "DATE_OUTSIDE_ROSTER_PERIOD",
        );
      }
    }

    if (property.propertyCode === PREFER_OFF_PROPERTY_CODE) {
      validatePreferOffProperty(property, options);
    }

    if (property.propertyCode === MIN_CONSECUTIVE_DAYS_OFF_IN_WINDOW_CODE) {
      const propertyLabel = getPropertyLabel(property);

      if (
        property.bid.type !== "stepper-date-range"
        || property.bid.value < MIN_CONSECUTIVE_DAYS_OFF_MIN
        || property.bid.value > MIN_CONSECUTIVE_DAYS_OFF_MAX
      ) {
        throw new LineholderBidServiceError(
          400,
          `${propertyLabel} must be between 1 and 14 consecutive days.`,
        );
      }

      if (!isValidIsoDate(property.bid.from) || !isValidIsoDate(property.bid.to)) {
        throw new LineholderBidServiceError(
          400,
          `${propertyLabel} must use a valid date window.`,
        );
      }

      if (property.bid.from > property.bid.to) {
        throw new LineholderBidServiceError(
          400,
          `${propertyLabel} end date must be on or after start date.`,
        );
      }

      const windowDays = getInclusiveDateWindowDays(property.bid.from, property.bid.to);

      if (windowDays !== null && windowDays < property.bid.value) {
        throw new LineholderBidServiceError(
          400,
          `${propertyLabel} date range must be at least ${property.bid.value} days long.`,
        );
      }

      if (
        options.rpStartLocal
        && options.rpEndLocal
        && (
          !isIsoDateInRange(property.bid.from, options.rpStartLocal, options.rpEndLocal)
          || !isIsoDateInRange(property.bid.to, options.rpStartLocal, options.rpEndLocal)
        )
      ) {
        throw new LineholderBidServiceError(
          400,
          `${propertyLabel} date window must be inside the current roster period.`,
          "DATE_OUTSIDE_ROSTER_PERIOD",
        );
      }
    }

    if (property.propertyCode === DAYS_OFF_ON_PATTERN_CODE) {
      if (property.bid.type !== "days-off-on-pattern") {
        throw new LineholderBidServiceError(
          400,
          "Days Off / Days On Pattern must include days on and days off values.",
        );
      }

      const values = [property.bid.minDaysOff, property.bid.minDaysOn, property.bid.maxDaysOn];
      const maxValue = typeof property.bid.max === "number" ? property.bid.max : null;
      const hasInvalidValue = values.some((value) =>
        !Number.isSafeInteger(value)
        || value < DAYS_OFF_ON_PATTERN_MIN
        || (maxValue !== null && value > maxValue));

      if (hasInvalidValue) {
        throw new LineholderBidServiceError(
          400,
          "Days Off / Days On Pattern values must be between 1 and 14.",
        );
      }

      if (property.bid.minDaysOn > property.bid.maxDaysOn) {
        throw new LineholderBidServiceError(
          400,
          "Days Off / Days On Pattern max days on must be greater than or equal to min days on.",
        );
      }
    }

    if (property.propertyCode === EMPLOYEE_SCHEDULE_PREFERENCE_CODE) {
      const crewId = property.bid.type === "employee-schedule-preference"
        ? property.bid.crewId ?? (property.bid as { employeeNumber?: string }).employeeNumber ?? ""
        : property.bid.type === "crew-days-off-share"
          ? property.bid.employeeNumber
          : "";

      if (
        (property.bid.type !== "crew-days-off-share" && property.bid.type !== "employee-schedule-preference")
        || crewId.trim().length === 0
      ) {
        throw new LineholderBidServiceError(
          400,
          "Employee Schedule Preference must include a crew.",
        );
      }

      const days = property.bid.type === "crew-days-off-share" ? property.bid.minimumDays : property.bid.days;

      if (!Number.isSafeInteger(days) || days < EMPLOYEE_SCHEDULE_PREFERENCE_DAYS_MIN || days > EMPLOYEE_SCHEDULE_PREFERENCE_DAYS_MAX) {
        throw new LineholderBidServiceError(
          400,
          "Employee Schedule Preference days must be between 1 and 31.",
        );
      }
    }

    if (property.minimumN !== null && property.minimumN !== undefined && property.minimumN < 1) {
      throw new LineholderBidServiceError(400, `${getPropertyLabel(property)} Minimum N must be at least 1.`);
    }

    for (const tier of property.tiers) {
      const tierNumber = parseTierNumber(tier);

      if (UNIQUE_PER_TIER_CODES.has(property.propertyCode)) {
        incrementCounter(uniquePerTierCounts, `${property.propertyCode}:${tier}`);
      }

      if (MUTUALLY_EXCLUSIVE_CODES.has(property.propertyCode)) {
        const labels = mutexLabelsByTier.get(tier) ?? [];
        labels.push(getPropertyLabel(property));
        mutexLabelsByTier.set(tier, labels);
      }

      if (property.propertyCode === pbsDaysOffAaPropertyCodes.stringOfDaysOffStartingOnDate) {
        hasStartingStringByTier.add(tier);
      }

      if (property.propertyCode === pbsDaysOffAaPropertyCodes.stringOfDaysOffEndingOnDate) {
        hasEndingStringByTier.add(tier);
      }

      if (
        property.propertyCode === pbsDaysOffAaPropertyCodes.minimumDaysOffBetweenWorkBlocks
        && property.bid.type === "stepper"
        && !minimumDaysOffByTier.has(tierNumber)
      ) {
        minimumDaysOffByTier.set(tierNumber, {
          label: tier,
          value: property.bid.value,
        });
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

  for (const tier of hasStartingStringByTier) {
    if (hasEndingStringByTier.has(tier)) {
      throw new LineholderBidServiceError(
        400,
        `String of Days Off Starting on Date and Ending on Date cannot both be active in ${tier}.`,
      );
    }
  }

  for (const [tier, labels] of mutexLabelsByTier.entries()) {
    if (labels.length <= 1) {
      continue;
    }

    throw new LineholderBidServiceError(
      400,
      `Only one maximize or string Days Off property can be active in ${tier}.`,
    );
  }

  const minimumEntries = Array.from(minimumDaysOffByTier.entries())
    .map(([tierNumber, entry]) => ({ tierNumber, ...entry }))
    .sort((left, right) => left.tierNumber - right.tierNumber);
  let inheritedMinimum: (typeof minimumEntries)[number] | null = null;

  for (const entry of minimumEntries) {
    if (inheritedMinimum && entry.value > inheritedMinimum.value) {
      throw new LineholderBidServiceError(
        400,
        `Minimum Days Off Between Work Blocks in ${entry.label} cannot be greater than the earlier value from ${inheritedMinimum.label}.`,
      );
    }

    if (!inheritedMinimum || entry.value < inheritedMinimum.value) {
      inheritedMinimum = entry;
    }
  }
};
