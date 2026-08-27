import {
  pbsDaysOffAaPropertyCodes,
  pbsDaysOffMutuallyExclusivePropertyCodes,
  pbsDaysOffUniquePerTierPropertyCodes,
} from "../../../../packages/contracts/pbs-days-off-bids.js";
import type { RuleBidExistingProperty } from "@/features/rule-bids/types";

const MINIMUM_DAYS_OFF_MIN = 1;
const MINIMUM_DAYS_OFF_MAX = 12;
const MAX_LINEHOLDER_TIER = 7;
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
const isValidIsoDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const activeTierLabels = (property: RuleBidExistingProperty) =>
  property.tiers
    .filter((tier) => tier.active)
    .map((tier) => tier.label);

const parseTierNumber = (tier: string) => Number.parseInt(tier.slice(1), 10);

const incrementCounter = (counter: Map<string, number>, key: string) => {
  counter.set(key, (counter.get(key) ?? 0) + 1);
};

export const validateDaysOffExistingProperties = (
  properties: RuleBidExistingProperty[],
): string[] => {
  const errors: string[] = [];
  const uniquePerTierCounts = new Map<string, number>();
  const uniquePerTierNames = new Map<string, string>();
  const mutexNamesByTier = new Map<string, string[]>();
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
      errors.push("Minimum Days Off Between Work Blocks must be between 1 and 12.");
    }

    if (FLAG_CODES.has(property.propertyCode) && property.bid.type !== "flag") {
      errors.push(`${property.name} must be a flag bid.`);
    }

    if (DATE_CODES.has(property.propertyCode)) {
      if (property.bid.type !== "date" || !isValidIsoDate(property.bid.value)) {
        errors.push(`${property.name} must use a valid date.`);
      }
    }

    if (property.minimumN !== null && property.minimumN !== undefined && property.minimumN < 1) {
      errors.push(`${property.name} Minimum N must be at least 1.`);
    }

    for (const tier of activeTierLabels(property)) {
      const tierNumber = parseTierNumber(tier);

      if (UNIQUE_PER_TIER_CODES.has(property.propertyCode)) {
        const key = `${property.propertyCode}:${tier}`;
        incrementCounter(uniquePerTierCounts, key);
        uniquePerTierNames.set(key, property.name);
      }

      if (MUTUALLY_EXCLUSIVE_CODES.has(property.propertyCode)) {
        const names = mutexNamesByTier.get(tier) ?? [];
        names.push(property.name);
        mutexNamesByTier.set(tier, names);
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

    const [, tier] = key.split(":");
    errors.push(`${uniquePerTierNames.get(key) ?? "This property"} can only be used once in ${tier}.`);
  }

  for (const tier of hasStartingStringByTier) {
    if (hasEndingStringByTier.has(tier)) {
      errors.push(`String of Days Off Starting on Date and Ending on Date cannot both be active in ${tier}.`);
    }
  }

  for (const [tier, names] of mutexNamesByTier.entries()) {
    if (names.length > 1) {
      errors.push(`Only one maximize or string Days Off property can be active in ${tier}.`);
    }
  }

  const minimumEntries = Array.from(minimumDaysOffByTier.entries())
    .map(([tierNumber, entry]) => ({ tierNumber, ...entry }))
    .filter((entry) => entry.tierNumber >= 1 && entry.tierNumber <= MAX_LINEHOLDER_TIER)
    .sort((left, right) => left.tierNumber - right.tierNumber);
  let inheritedMinimum: (typeof minimumEntries)[number] | null = null;

  for (const entry of minimumEntries) {
    if (inheritedMinimum && entry.value > inheritedMinimum.value) {
      errors.push(
        `Minimum Days Off Between Work Blocks in ${entry.label} cannot be greater than the earlier value from ${inheritedMinimum.label}.`,
      );
    }

    if (!inheritedMinimum || entry.value < inheritedMinimum.value) {
      inheritedMinimum = entry;
    }
  }

  return Array.from(new Set(errors));
};

export const getDaysOffInformationalMessages = (
  properties: RuleBidExistingProperty[],
): string[] => {
  const waiverTiers = properties
    .filter((property) => property.propertyCode === pbsDaysOffAaPropertyCodes.waiveMinimumDaysOff)
    .flatMap((property) => activeTierLabels(property))
    .map((label) => ({
      label,
      number: parseTierNumber(label),
    }))
    .filter((tier) => tier.number >= 1 && tier.number < MAX_LINEHOLDER_TIER)
    .sort((left, right) => left.number - right.number);

  const earliestWaiver = waiverTiers[0];

  if (!earliestWaiver) {
    return [];
  }

  return [
    `Waive Minimum Days Off from ${earliestWaiver.label} applies to later tiers in this draft.`,
  ];
};
