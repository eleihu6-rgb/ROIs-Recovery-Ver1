import {
  LINEHOLDER_TIER_KEYS,
  applyDatesToSelectedTiers,
  type CalendarDayOffAction,
  type CalendarDraftResponse,
} from "@/features/dashboard/dashboard-calendar-state";
import type {
  RuleBidExistingProperty,
  RuleBidPageData,
  RuleBidTierOption,
} from "@/features/rule-bids/types";
import { requireCurrentRuleBidContext } from "@/features/rule-bids/draft-context";

export const PREFER_OFF_PROPERTY_CODE = 201;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATE_RANGE_PATTERN = /^Between (\d{4}-\d{2}-\d{2}) - (\d{4}-\d{2}-\d{2})$/;

const parseIsoDate = (value: string) => {
  if (!ISO_DATE_PATTERN.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10) === value ? date : null;
};

const listIsoDatesInRange = (startDate: string, endDate: string) => {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);

  if (!start || !end || start.getTime() > end.getTime()) {
    return [];
  }

  const dates: string[] = [];
  const cursor = new Date(start);

  while (cursor.getTime() <= end.getTime()) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
};

const sortTierLabels = (tiers: string[]) =>
  [...tiers].sort((left, right) =>
    LINEHOLDER_TIER_KEYS.indexOf(left) - LINEHOLDER_TIER_KEYS.indexOf(right));

const createTierOptions = (activeTiers: string[]): RuleBidTierOption[] => {
  const activeTierSet = new Set(activeTiers);

  return LINEHOLDER_TIER_KEYS.map((tier) => ({
    key: tier.toLowerCase(),
    label: tier,
    active: activeTierSet.has(tier),
  }));
};

export const extractPreferOffCalendarDates = (property: RuleBidExistingProperty) => {
  if (property.propertyCode !== PREFER_OFF_PROPERTY_CODE || property.bid.type !== "tag-list") {
    return [];
  }

  return Array.from(
    new Set(
      property.bid.values.flatMap((value) => {
        if (parseIsoDate(value)) {
          return [value];
        }

        const rangeMatch = value.match(DATE_RANGE_PATTERN);

        if (rangeMatch) {
          return listIsoDatesInRange(rangeMatch[1]!, rangeMatch[2]!);
        }

        return [];
      }),
    ),
  ).sort();
};

export const isCalendarManagedPreferOffProperty = (property: RuleBidExistingProperty) => (
  property.propertyCode === PREFER_OFF_PROPERTY_CODE
  && property.bid.type === "tag-list"
  && property.bid.values.length > 0
  && property.bid.values.every((value) => parseIsoDate(value) !== null)
);

export const buildCalendarDraftFromDaysOffPageData = (
  pageData: RuleBidPageData,
): CalendarDraftResponse => {
  const datesByTier = new Map<string, Set<string>>();

  for (const property of pageData.rightPanel.existingProperties) {
    const dates = extractPreferOffCalendarDates(property);

    if (dates.length === 0) {
      continue;
    }

    const activeTiers = property.tiers
      .filter((tier) => tier.active)
      .map((tier) => tier.label);

    for (const tier of activeTiers) {
      const tierDates = datesByTier.get(tier) ?? new Set<string>();

      for (const date of dates) {
        tierDates.add(date);
      }

      datesByTier.set(tier, tierDates);
    }
  }

  return {
    draft: {
      draftKey: pageData.rightPanel.draftMeta.draftKey,
      bidId: pageData.rightPanel.draftMeta.bidId,
      periodId: pageData.rightPanel.draftMeta.periodId,
      periodCode: pageData.rightPanel.draftMeta.periodCode,
      draftVersion: pageData.rightPanel.draftMeta.draftVersion,
      bidContext: requireCurrentRuleBidContext(pageData.rightPanel.draftMeta.bidContext, "Days Off calendar"),
      tiers: LINEHOLDER_TIER_KEYS.flatMap((tier) => {
        const dates = Array.from(datesByTier.get(tier) ?? []).sort();

        return dates.length > 0 ? [{ tier, dates }] : [];
      }),
    },
  };
};

const buildDateTiers = (draft: Pick<CalendarDraftResponse["draft"], "tiers">) => {
  const tiersByDate = new Map<string, Set<string>>();

  for (const tier of draft.tiers) {
    for (const date of tier.dates) {
      const tiers = tiersByDate.get(date) ?? new Set<string>();
      tiers.add(tier.tier);
      tiersByDate.set(date, tiers);
    }
  }

  return tiersByDate;
};

export const buildCalendarManagedPreferOffProperties = (
  draft: Pick<CalendarDraftResponse["draft"], "tiers">,
  existingCalendarProperties: RuleBidExistingProperty[],
): RuleBidExistingProperty[] => {
  const datesByTierKey = new Map<string, string[]>();

  for (const [date, tierSet] of buildDateTiers(draft)) {
    const tiers = sortTierLabels(Array.from(tierSet));
    const tierKey = tiers.join("|");
    const dates = datesByTierKey.get(tierKey) ?? [];
    dates.push(date);
    datesByTierKey.set(tierKey, dates);
  }

  return Array.from(datesByTierKey.entries())
    .sort(([leftTierKey], [rightTierKey]) => leftTierKey.localeCompare(rightTierKey))
    .map(([tierKey, dates], index) => {
      const tiers = tierKey.split("|").filter((tier) => tier.length > 0);
      const existingProperty = existingCalendarProperties[index];

      return {
        id: existingProperty?.id ?? `calendar-prefer-off-${index + 1}`,
        propertyCode: PREFER_OFF_PROPERTY_CODE,
        name: "Prefer Off",
        bid: {
          type: "tag-list",
          values: [...dates].sort(),
          suggestions: [],
        },
        tiers: createTierOptions(tiers),
        allOrNothing: true,
        minimumN: null,
        maximumN: null,
      };
    });
};

export const buildPreferOffCalendarTargetProperties = (
  currentDraft: CalendarDraftResponse,
  action: CalendarDayOffAction,
  blockedTiersByDate: Map<string, Set<string>>,
  existingProperties: RuleBidExistingProperty[],
) => {
  const existingCalendarProperties = existingProperties.filter(isCalendarManagedPreferOffProperty);
  const nextTiers = applyDatesToSelectedTiers(
    currentDraft.draft.tiers,
    action.isoDates,
    action.selectedTiers,
    blockedTiersByDate,
  );

  return buildCalendarManagedPreferOffProperties({ tiers: nextTiers }, existingCalendarProperties);
};
