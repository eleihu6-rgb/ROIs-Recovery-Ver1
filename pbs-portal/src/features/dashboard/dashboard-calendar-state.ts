import type { PbsBiddingCalendarEvent } from "../../../../packages/contracts/pbs-bidding-calendar.js";
import type { PbsPairingOccurrence } from "../../../../packages/contracts/pbs-search-pairings.js";

export type CalendarDraftTier = {
  tier: string;
  dates: string[];
};

export type CalendarDraftResponse = {
  draft: {
    draftKey?: string;
    bidId?: number;
    periodId?: number | null;
    draftVersion: number;
    periodCode: string;
    bidContext: "Current";
    tiers: CalendarDraftTier[];
  };
};

export type CalendarDayOffAction = {
  type: "date" | "weekday";
  isoDates: string[];
  selectedTiers: string[];
};

export const LINEHOLDER_TIER_KEYS = ["T1", "T2", "T3", "T4", "T5", "T6", "T7"];

export const parseDraftTierNumber = (tier: string) => {
  const match = tier.match(/^T(?:IER-)?(\d+)$/i);
  const tierNumber = Number.parseInt(match?.[1] ?? "", 10);

  return Number.isSafeInteger(tierNumber) ? tierNumber : 1;
};

export const toDraftTierLabel = (activeTierLabel: string) => {
  const tierNumber = parseDraftTierNumber(activeTierLabel);

  return `T${Math.min(Math.max(tierNumber, 1), LINEHOLDER_TIER_KEYS.length)}`;
};

export const sortTierKeys = (tiers: string[]) =>
  [...tiers].sort((left, right) => parseDraftTierNumber(left) - parseDraftTierNumber(right));

export const buildDefaultSelectedTiers = (activeTier: string) => {
  const activeTierNumber = parseDraftTierNumber(activeTier);

  return LINEHOLDER_TIER_KEYS.filter((tier) => parseDraftTierNumber(tier) >= activeTierNumber);
};

export const calendarDraftHasDate = (
  draftResponse: CalendarDraftResponse | null,
  tier: string,
  date: string,
) => {
  const draftTier = draftResponse?.draft.tiers.find((item) => item.tier === tier);

  return draftTier?.dates.includes(date) ?? false;
};

export const isPairingBlockedForDayOff = (
  blockedTiersByDate: Map<string, Set<string>>,
  date: string,
  tier: string,
) => blockedTiersByDate.get(date)?.has(tier) ?? false;

export const normalizeCalendarDraftTiers = (tiers: CalendarDraftTier[]) => {
  const datesByTier = new Map<string, Set<string>>();

  for (const tier of tiers) {
    if (!LINEHOLDER_TIER_KEYS.includes(tier.tier)) {
      continue;
    }

    datesByTier.set(tier.tier, new Set(tier.dates));
  }

  return LINEHOLDER_TIER_KEYS.flatMap((tier) => {
    const dates = Array.from(datesByTier.get(tier) ?? []).sort();

    return dates.length > 0 ? [{ tier, dates }] : [];
  });
};

export const findTiersContainingDates = (
  draftResponse: CalendarDraftResponse | null,
  targetDates: string[],
) => {
  const targetDateSet = new Set(targetDates);

  if (!draftResponse || targetDateSet.size === 0) {
    return [];
  }

  return LINEHOLDER_TIER_KEYS.filter((tierKey) => {
    const tier = draftResponse.draft.tiers.find((item) => item.tier === tierKey);

    return tier?.dates.some((date) => targetDateSet.has(date)) ?? false;
  });
};

export const applyDatesToSelectedTiers = (
  tiers: CalendarDraftTier[],
  targetDates: string[],
  selectedTiers: string[],
  blockedTiersByDate: Map<string, Set<string>> = new Map(),
) => {
  const targetDateSet = new Set(targetDates);
  const selectedTierSet = new Set(selectedTiers);
  const existingDatesByTier = new Map(
    tiers.map((tier) => [tier.tier, new Set(tier.dates)] as const),
  );

  return normalizeCalendarDraftTiers(
    LINEHOLDER_TIER_KEYS.map((tier) => {
      const dates = new Set(existingDatesByTier.get(tier) ?? []);

      for (const date of targetDateSet) {
        if (selectedTierSet.has(tier)) {
          if (dates.has(date) || !isPairingBlockedForDayOff(blockedTiersByDate, date, tier)) {
            dates.add(date);
          }
        } else {
          dates.delete(date);
        }
      }

      return {
        tier,
        dates: Array.from(dates).sort(),
      };
    }),
  );
};

export const countBlockedDayOffAdditions = (
  action: CalendarDayOffAction,
  draftResponse: CalendarDraftResponse | null,
  blockedTiersByDate: Map<string, Set<string>>,
) => {
  let blockedCount = 0;

  for (const date of action.isoDates) {
    for (const tier of action.selectedTiers) {
      if (
        !calendarDraftHasDate(draftResponse, tier, date)
        && isPairingBlockedForDayOff(blockedTiersByDate, date, tier)
      ) {
        blockedCount += 1;
      }
    }
  }

  return blockedCount;
};

export const countBlockedDayOffTargets = (
  action: CalendarDayOffAction,
  draftResponse: CalendarDraftResponse | null,
  blockedTiersByDate: Map<string, Set<string>>,
) => {
  let blockedCount = 0;

  for (const date of action.isoDates) {
    for (const tier of LINEHOLDER_TIER_KEYS) {
      if (
        !calendarDraftHasDate(draftResponse, tier, date)
        && isPairingBlockedForDayOff(blockedTiersByDate, date, tier)
      ) {
        blockedCount += 1;
      }
    }
  }

  return blockedCount;
};

export const canSaveCalendarAction = (
  action: CalendarDayOffAction,
  draftResponse: CalendarDraftResponse | null,
  blockedTiersByDate: Map<string, Set<string>>,
) => {
  for (const date of action.isoDates) {
    for (const tier of LINEHOLDER_TIER_KEYS) {
      const hasExistingDate = calendarDraftHasDate(draftResponse, tier, date);
      const selected = action.selectedTiers.includes(tier);

      if (selected === hasExistingDate) {
        continue;
      }

      if (selected && isPairingBlockedForDayOff(blockedTiersByDate, date, tier)) {
        continue;
      }

      return true;
    }
  }

  return false;
};

export const isPendingCalendarTierDisabled = (
  action: CalendarDayOffAction,
  tier: string,
  draftResponse: CalendarDraftResponse | null,
  blockedTiersByDate: Map<string, Set<string>>,
) => {
  if (action.type === "weekday") {
    return false;
  }

  return action.isoDates.every((date) =>
    !calendarDraftHasDate(draftResponse, tier, date)
    && isPairingBlockedForDayOff(blockedTiersByDate, date, tier));
};

export const formatBlockedDayOffMessage = (blockedCount: number) =>
  blockedCount === 1
    ? "1 tier/date entry is blocked by a pairing bid."
    : `${blockedCount} tier/date entries are blocked by pairing bids.`;

const parseIsoDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
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

const addBlockedTier = (
  tiersByDate: Map<string, Set<string>>,
  date: string,
  tier: string,
) => {
  const blockedTiers = tiersByDate.get(date) ?? new Set<string>();
  blockedTiers.add(tier);
  tiersByDate.set(date, blockedTiers);
};

export const buildPairingBlockedTiersByDate = (events: PbsBiddingCalendarEvent[] = []) => {
  const blockedTiersByDate = new Map<string, Set<string>>();

  for (const event of events) {
    if (event.type !== "pairing_bid" || !event.tier) {
      continue;
    }

    for (const date of listIsoDatesInRange(event.startDate, event.endDate)) {
      addBlockedTier(blockedTiersByDate, date, event.tier);
    }
  }

  return blockedTiersByDate;
};

export const buildDayOffTiersByDate = (
  events: PbsBiddingCalendarEvent[] = [],
  draftResponse: CalendarDraftResponse | null = null,
) => {
  const tiersByDate = new Map<string, Set<string>>();

  for (const event of events) {
    if (event.type !== "prefer_off_bid" || !event.tier) {
      continue;
    }

    for (const date of listIsoDatesInRange(event.startDate, event.endDate)) {
      addBlockedTier(tiersByDate, date, event.tier);
    }
  }

  for (const tier of draftResponse?.draft.tiers ?? []) {
    for (const date of tier.dates) {
      addBlockedTier(tiersByDate, date, tier.tier);
    }
  }

  return tiersByDate;
};

export const buildPairingDayOffBlockedTiers = (
  occurrences: PbsPairingOccurrence[],
  selectedOccurrenceIds: string[],
  dayOffTiersByDate: Map<string, Set<string>>,
) => {
  const selectedOccurrenceIdSet = new Set(selectedOccurrenceIds);
  const blockedTiers = new Set<string>();

  for (const occurrence of occurrences) {
    if (!selectedOccurrenceIdSet.has(occurrence.occurrenceId)) {
      continue;
    }

    for (const date of listIsoDatesInRange(occurrence.startDate, occurrence.endDate)) {
      for (const tier of dayOffTiersByDate.get(date) ?? []) {
        blockedTiers.add(tier);
      }
    }
  }

  return blockedTiers;
};
