import {
  pbsPairingPropertyCatalog,
  type PbsPairingPropertyDefinition,
} from "../../../../packages/contracts/pbs-pairing-bids.js";
import type {
  PbsBiddingCalendarEvent,
} from "../../../../packages/contracts/pbs-bidding-calendar.js";
import type { PbsPairingOccurrence } from "../../../../packages/contracts/pbs-search-pairings.js";
import type { PbsWeekendInterval } from "../../../../packages/contracts/pbs-prefer-off.js";
import { isValidIsoDate } from "../lineholder/date-utils.js";
import { deserializeRuleBid } from "../lineholder/rule-bid-value.js";
import { normalizePairingBidIds } from "../pairing-search/pairing-id-utils.js";
import { listIsoDatesInRange } from "./bidding-calendar-date-utils.js";
import {
  buildGroupedPairingLabelFromNumbers,
  mergeUniqueValues,
  readPairingMetadataValues,
  splitPairingBidEntryMetadata,
  splitPairingDateRangeMetadata,
  uniqueSortedValues,
} from "./bidding-calendar-pairing-event-metadata.js";

export type PairingBidRow = {
  propertyGroupKey: string;
  groupSeq: number;
  tier: number;
  actionId: number | null;
  operator: string | null;
  paramA: string | null;
  paramB: string | null;
  paramC: string | null;
};

export type DayOffDatesByTier = Map<number, Set<string>>;
export type WeekendIntervalsByTier = Map<number, PbsWeekendInterval[]>;

const occurrenceOverlapsWeekendIntervals = (
  occurrence: PbsPairingOccurrence,
  intervals: PbsWeekendInterval[] | undefined,
) => {
  if (!intervals || intervals.length === 0) {
    return false;
  }

  if (!occurrence.startLocal || !occurrence.endLocal) {
    return intervals.some((interval) =>
      listIsoDatesInRange(occurrence.startDate, occurrence.endDate)
        .some((date) => interval.dates.includes(date)));
  }

  return intervals.some((interval) => {
    const intervalStart = `${interval.startDate}T${interval.startTime}:00`;
    const intervalEnd = `${interval.endDate}T${interval.endTime}:00`;
    return occurrence.startLocal! < intervalEnd && occurrence.endLocal! > intervalStart;
  });
};

export const occurrenceConflictsWithDaysOff = (
  occurrence: PbsPairingOccurrence,
  dates: Set<string> | undefined,
  weekendIntervals: PbsWeekendInterval[] | undefined,
  nonWeekendDates: Set<string> | undefined,
) => {
  if (!occurrenceTouchesDates(occurrence, dates)) {
    return false;
  }

  if (occurrenceTouchesDates(occurrence, nonWeekendDates)) {
    return true;
  }

  return !weekendIntervals || occurrenceOverlapsWeekendIntervals(occurrence, weekendIntervals);
};

export const SPECIFIC_PAIRING_PROPERTY_CODE = 102;
const AVOID_ACTION_ID = 2;

export const isAvoidPairingBidRow = (row: Pick<PairingBidRow, "actionId">) =>
  row.actionId === AVOID_ACTION_ID;

const PAIRING_ID_DEFINITION = pbsPairingPropertyCatalog.find(
  (property) => property.propertyCode === SPECIFIC_PAIRING_PROPERTY_CODE,
) as PbsPairingPropertyDefinition | undefined;

export const extractSpecificPairingIds = (row: PairingBidRow) => {
  if (!PAIRING_ID_DEFINITION || !row.paramA?.trim()) {
    return [];
  }

  const bid = deserializeRuleBid(PAIRING_ID_DEFINITION, {
    operator: row.operator,
    paramA: row.paramA,
    paramB: row.paramB,
    paramC: row.paramC,
  });

  if (bid.type === "pairing-id-list") {
    return normalizePairingBidIds(bid.pairingIds);
  }

  if (bid.type === "pairing-preference") {
    return normalizePairingBidIds(bid.pairingIds);
  }

  return normalizePairingBidIds(row.paramA.split(","));
};

const sortPairingOccurrences = (occurrences: PbsPairingOccurrence[]) =>
  [...occurrences].sort((left, right) => {
    const numberCompare = left.pairingNumber.localeCompare(right.pairingNumber);

    if (numberCompare !== 0) {
      return numberCompare;
    }

    return left.pairingId.localeCompare(right.pairingId);
  });

const buildGroupedPairingLabel = (occurrences: PbsPairingOccurrence[]) => {
  const firstPairingNumber = occurrences[0]?.pairingNumber ?? "Pairing";

  return occurrences.length > 1
    ? `${firstPairingNumber} +${occurrences.length - 1}`
    : firstPairingNumber;
};

const buildGroupedPairingEndDate = (occurrences: PbsPairingOccurrence[]) =>
  occurrences
    .map((occurrence) => occurrence.endDate)
    .sort()
    .at(-1) ?? occurrences[0]?.endDate ?? "";

const serializePairingDateRanges = (occurrences: PbsPairingOccurrence[]) =>
  occurrences
    .map((occurrence) =>
      `${occurrence.pairingNumber}:${occurrence.startDate === occurrence.endDate
        ? occurrence.startDate
        : `${occurrence.startDate} - ${occurrence.endDate}`}`)
    .join("; ");

const buildPairingEventDateRange = (event: PbsBiddingCalendarEvent) => {
  const pairingNumber = readPairingMetadataValues(event, "pairingNumbers", "pairingNumber")[0]
    ?? event.label.replace(/\s+\+\d+$/, "")
    ?? "Pairing";
  const dateRange = event.startDate === event.endDate
    ? event.startDate
    : `${event.startDate} - ${event.endDate}`;

  return `${pairingNumber}:${dateRange}`;
};

const encodePairingBidEntryField = (value: string) => encodeURIComponent(value.trim());

const buildPairingBidEntry = (
  propertyGroupKey: string,
  occurrence: PbsPairingOccurrence,
) => [
  propertyGroupKey,
  occurrence.pairingNumber,
  occurrence.pairingId,
  occurrence.originDate,
  occurrence.startDate,
  occurrence.endDate,
].map(encodePairingBidEntryField).join("|");

const buildPairingEventBidEntry = (event: PbsBiddingCalendarEvent) => {
  const propertyGroupKey = readPairingMetadataValues(event, "propertyGroupKeys", "propertyGroupKey")[0];
  const pairingNumber = readPairingMetadataValues(event, "pairingNumbers", "pairingNumber")[0]
    ?? event.label.replace(/\s+\+\d+$/, "");
  const pairingId = readPairingMetadataValues(event, "pairingIds", "pairingId")[0] ?? "";
  const originDate = readPairingMetadataValues(event, "originDates", "originDate")[0]
    ?? (typeof event.metadata?.originDate === "string" ? event.metadata.originDate : "")
    ?? "";

  if (!propertyGroupKey || !pairingNumber) {
    return null;
  }

  return [
    propertyGroupKey,
    pairingNumber,
    pairingId,
    originDate,
    event.startDate,
    event.endDate,
  ].map(encodePairingBidEntryField).join("|");
};

const serializePairingBidEntries = (
  propertyGroupKey: string,
  occurrences: PbsPairingOccurrence[],
) => occurrences.map((occurrence) => buildPairingBidEntry(propertyGroupKey, occurrence)).join("; ");

const buildPairingBidEntrySortKey = (entry: string) => {
  const [, pairingNumber = "", , originDate = "", startDate = "", endDate = ""] = entry.split("|");

  return `${pairingNumber}|${originDate}|${startDate}|${endDate}`;
};

const sortPairingBidEntries = (entries: string[]) =>
  [...entries].sort((left, right) =>
    buildPairingBidEntrySortKey(left).localeCompare(buildPairingBidEntrySortKey(right)));

const combinePairingEvents = (
  currentEvent: PbsBiddingCalendarEvent,
  nextEvent: PbsBiddingCalendarEvent,
): PbsBiddingCalendarEvent => {
  const pairingNumbers = uniqueSortedValues([
    ...readPairingMetadataValues(currentEvent, "pairingNumbers", "pairingNumber"),
    ...readPairingMetadataValues(nextEvent, "pairingNumbers", "pairingNumber"),
    currentEvent.label.replace(/\s+\+\d+$/, ""),
    nextEvent.label.replace(/\s+\+\d+$/, ""),
  ]);
  const pairingIds = uniqueSortedValues([
    ...readPairingMetadataValues(currentEvent, "pairingIds", "pairingId"),
    ...readPairingMetadataValues(nextEvent, "pairingIds", "pairingId"),
  ]);
  const requestedPairingIds = uniqueSortedValues([
    ...readPairingMetadataValues(currentEvent, "requestedPairingIds", "requestedPairingId"),
    ...readPairingMetadataValues(nextEvent, "requestedPairingIds", "requestedPairingId"),
  ]);
  const propertyGroupKeys = uniqueSortedValues([
    ...readPairingMetadataValues(currentEvent, "propertyGroupKeys", "propertyGroupKey"),
    ...readPairingMetadataValues(nextEvent, "propertyGroupKeys", "propertyGroupKey"),
  ]);
  const originDates = uniqueSortedValues([
    ...readPairingMetadataValues(currentEvent, "originDates", "originDate"),
    ...readPairingMetadataValues(nextEvent, "originDates", "originDate"),
  ]);
  const startDate = currentEvent.startDate < nextEvent.startDate ? currentEvent.startDate : nextEvent.startDate;
  const endDate = currentEvent.endDate > nextEvent.endDate ? currentEvent.endDate : nextEvent.endDate;

  const pairingDateRanges = mergeUniqueValues([
    splitPairingDateRangeMetadata(currentEvent.metadata?.pairingDateRanges),
    splitPairingDateRangeMetadata(nextEvent.metadata?.pairingDateRanges),
    [buildPairingEventDateRange(currentEvent), buildPairingEventDateRange(nextEvent)],
  ]);
  const pairingBidEntries = mergeUniqueValues([
    splitPairingBidEntryMetadata(currentEvent.metadata?.pairingBidEntries),
    splitPairingBidEntryMetadata(nextEvent.metadata?.pairingBidEntries),
    [
      buildPairingEventBidEntry(currentEvent),
      buildPairingEventBidEntry(nextEvent),
    ].filter((value): value is string => value !== null),
  ]);
  const sortedPairingBidEntries = sortPairingBidEntries(pairingBidEntries);

  return {
    ...currentEvent,
    id: `pairing-bid-merged-${currentEvent.tier ?? "all"}-${startDate}-${endDate}-${propertyGroupKeys.join("-") || currentEvent.id}`,
    label: buildGroupedPairingLabelFromNumbers(pairingNumbers),
    startDate,
    endDate,
    metadata: {
      ...currentEvent.metadata,
      propertyGroupKey: propertyGroupKeys[0] ?? currentEvent.metadata?.propertyGroupKey ?? null,
      propertyGroupKeys: propertyGroupKeys.join(","),
      pairingNumber: pairingNumbers[0] ?? null,
      pairingNumbers: pairingNumbers.join(","),
      pairingId: pairingIds[0] ?? null,
      pairingIds: pairingIds.join(","),
      requestedPairingId: requestedPairingIds[0] ?? null,
      requestedPairingIds: requestedPairingIds.join(","),
      pairingDateRanges: pairingDateRanges.length > 0 ? pairingDateRanges.join("; ") : null,
      originDate: originDates[0] ?? currentEvent.metadata?.originDate ?? null,
      originDates: originDates.join(","),
      pairingBidEntries: sortedPairingBidEntries.length > 0 ? sortedPairingBidEntries.join("; ") : null,
      pairingCount: pairingNumbers.length,
    },
  };
};

const mergeOverlappingPairingEvents = (events: PbsBiddingCalendarEvent[]) => {
  const mergedEvents: PbsBiddingCalendarEvent[] = [];
  const pairingEventsByTier = new Map<string, PbsBiddingCalendarEvent[]>();

  for (const event of events) {
    if (event.type !== "pairing_bid" || !event.tier) {
      mergedEvents.push(event);
      continue;
    }

    const tierEvents = pairingEventsByTier.get(event.tier) ?? [];
    tierEvents.push(event);
    pairingEventsByTier.set(event.tier, tierEvents);
  }

  for (const tierEvents of pairingEventsByTier.values()) {
    const sortedEvents = [...tierEvents].sort((left, right) => {
      if (left.startDate !== right.startDate) {
        return left.startDate.localeCompare(right.startDate);
      }

      if (left.endDate !== right.endDate) {
        return left.endDate.localeCompare(right.endDate);
      }

      return left.label.localeCompare(right.label);
    });

    for (const event of sortedEvents) {
      const currentEvent = mergedEvents.at(-1);

      if (
        currentEvent
        && currentEvent.type === "pairing_bid"
        && currentEvent.tier === event.tier
        && currentEvent.tone === event.tone
        && event.startDate <= currentEvent.endDate
      ) {
        mergedEvents[mergedEvents.length - 1] = combinePairingEvents(currentEvent, event);
        continue;
      }

      mergedEvents.push(event);
    }
  }

  return mergedEvents;
};

export const occurrenceTouchesDates = (
  occurrence: Pick<PbsPairingOccurrence, "startDate" | "endDate">,
  dates: Set<string> | undefined,
) => {
  if (!dates || dates.size === 0) {
    return false;
  }

  return listIsoDatesInRange(occurrence.startDate, occurrence.endDate)
    .some((date) => dates.has(date));
};

export type PairingDayOffConflict = {
  tier: number;
  date: string;
  pairingNumber: string;
  originDate: string;
  occurrenceMode: "entire_month" | "specific_date";
  propertyGroupKey: string;
};

export const findPairingDayOffConflicts = (
  bidRows: PairingBidRow[],
  occurrencesByPairingId: Map<string, PbsPairingOccurrence[]>,
  dayOffDatesByTier: DayOffDatesByTier,
  weekendIntervalsByTier: WeekendIntervalsByTier = new Map(),
  nonWeekendDatesByTier: DayOffDatesByTier = new Map(),
) => {
  const conflictsByKey = new Map<string, PairingDayOffConflict>();

  for (const row of bidRows) {
    if (isAvoidPairingBidRow(row)) {
      continue;
    }

    const dayOffDates = dayOffDatesByTier.get(row.tier);

    if (!dayOffDates || dayOffDates.size === 0) {
      continue;
    }

    const selectedOriginDate = row.paramB && isValidIsoDate(row.paramB) ? row.paramB : null;

    for (const pairingId of extractSpecificPairingIds(row)) {
      const normalizedPairingId = pairingId.trim();
      const occurrences = occurrencesByPairingId.get(normalizedPairingId) ?? [];
      const matchingOccurrences = selectedOriginDate
        ? occurrences.filter((occurrence) => occurrence.originDate === selectedOriginDate)
        : occurrences;

      for (const occurrence of matchingOccurrences) {
        if (!occurrenceConflictsWithDaysOff(
          occurrence,
          dayOffDates,
          weekendIntervalsByTier.get(row.tier),
          nonWeekendDatesByTier.get(row.tier),
        )) {
          continue;
        }

        for (const date of listIsoDatesInRange(occurrence.startDate, occurrence.endDate)) {
          if (!dayOffDates.has(date)) {
            continue;
          }

          const conflictKey = `${row.tier}:${date}:${row.propertyGroupKey}:${occurrence.occurrenceId}`;
          conflictsByKey.set(conflictKey, {
            tier: row.tier,
            date,
            pairingNumber: occurrence.pairingNumber,
            originDate: occurrence.originDate,
            occurrenceMode: selectedOriginDate ? "specific_date" : "entire_month",
            propertyGroupKey: row.propertyGroupKey,
          });
        }
      }
    }
  }

  return Array.from(conflictsByKey.values()).sort((left, right) => {
    if (left.date !== right.date) {
      return left.date.localeCompare(right.date);
    }

    if (left.tier !== right.tier) {
      return left.tier - right.tier;
    }

    return left.pairingNumber.localeCompare(right.pairingNumber);
  });
};

export const buildPairingEvents = (
  bidRows: PairingBidRow[],
  occurrencesByPairingId: Map<string, PbsPairingOccurrence[]>,
  dayOffDatesByTier: DayOffDatesByTier = new Map(),
  weekendIntervalsByTier: WeekendIntervalsByTier = new Map(),
  nonWeekendDatesByTier: DayOffDatesByTier = new Map(),
) => {
  const events: PbsBiddingCalendarEvent[] = [];
  const missingPairingIds = new Set<string>();

  for (const row of bidRows) {
    if (isAvoidPairingBidRow(row)) {
      continue;
    }

    const selectedOriginDate = row.paramB && isValidIsoDate(row.paramB) ? row.paramB : null;
    const selectedOriginDateOccurrences: PbsPairingOccurrence[] = [];
    const selectedOriginDateRequestedIds: string[] = [];
    const dayOffDates = dayOffDatesByTier.get(row.tier);

    for (const pairingId of extractSpecificPairingIds(row)) {
      const normalizedPairingId = pairingId.trim();
      const occurrences = occurrencesByPairingId.get(normalizedPairingId) ?? [];
      const originDateOccurrences = selectedOriginDate
        ? occurrences.filter((occurrence) => occurrence.originDate === selectedOriginDate)
        : occurrences;

      if (originDateOccurrences.length === 0) {
        missingPairingIds.add(pairingId);
        continue;
      }

      const matchingOccurrences = selectedOriginDate
        ? originDateOccurrences
        : originDateOccurrences.filter((occurrence) => !occurrenceConflictsWithDaysOff(
          occurrence,
          dayOffDates,
          weekendIntervalsByTier.get(row.tier),
          nonWeekendDatesByTier.get(row.tier),
        ));

      if (matchingOccurrences.length === 0) {
        continue;
      }

      if (selectedOriginDate) {
        selectedOriginDateOccurrences.push(...matchingOccurrences);
        selectedOriginDateRequestedIds.push(pairingId);
        continue;
      }

      for (const occurrence of matchingOccurrences) {
        events.push({
          id: `pairing-bid-${row.propertyGroupKey}-${row.tier}-${occurrence.pairingId}-${occurrence.originDate}`,
          type: "pairing_bid",
          tier: `T${row.tier}`,
          label: occurrence.pairingNumber,
          startDate: occurrence.startDate,
          endDate: occurrence.endDate,
          tone: "blue",
          source: "pbs_bid_group",
          readonly: true,
          metadata: {
            propertyGroupKey: row.propertyGroupKey,
            groupSeq: row.groupSeq,
            pairingNumber: occurrence.pairingNumber,
            pairingId: occurrence.pairingId,
            requestedPairingId: pairingId,
            originDate: occurrence.originDate,
            occurrenceMode: selectedOriginDate ? "specific_date" : "entire_month",
            pairingBidEntries: serializePairingBidEntries(row.propertyGroupKey, [occurrence]),
            actionId: row.actionId,
          },
        });
      }
    }

    if (!selectedOriginDate || selectedOriginDateOccurrences.length === 0) {
      continue;
    }

    const groupedOccurrences = sortPairingOccurrences(selectedOriginDateOccurrences);
    const firstOccurrence = groupedOccurrences[0];

    if (!firstOccurrence) {
      continue;
    }

    events.push({
      id: `pairing-bid-${row.propertyGroupKey}-${row.tier}-${selectedOriginDate}`,
      type: "pairing_bid",
      tier: `T${row.tier}`,
      label: buildGroupedPairingLabel(groupedOccurrences),
      startDate: selectedOriginDate,
      endDate: buildGroupedPairingEndDate(groupedOccurrences),
      tone: "blue",
      source: "pbs_bid_group",
      readonly: true,
      metadata: {
        propertyGroupKey: row.propertyGroupKey,
        groupSeq: row.groupSeq,
        pairingNumber: firstOccurrence.pairingNumber,
        pairingNumbers: groupedOccurrences.map((occurrence) => occurrence.pairingNumber).join(","),
        pairingId: firstOccurrence.pairingId,
        pairingIds: groupedOccurrences.map((occurrence) => occurrence.pairingId).join(","),
        requestedPairingId: selectedOriginDateRequestedIds[0] ?? firstOccurrence.pairingNumber,
        requestedPairingIds: selectedOriginDateRequestedIds.join(","),
        pairingDateRanges: serializePairingDateRanges(groupedOccurrences),
        originDate: selectedOriginDate,
        occurrenceMode: "specific_date",
        pairingBidEntries: serializePairingBidEntries(row.propertyGroupKey, groupedOccurrences),
        pairingCount: groupedOccurrences.length,
        actionId: row.actionId,
      },
    });
  }

  return {
    events: mergeOverlappingPairingEvents(events),
    missingPairingIds: Array.from(missingPairingIds).sort(),
  };
};
