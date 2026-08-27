import type { PbsBiddingCalendarEvent } from "../../../../packages/contracts/pbs-bidding-calendar.js";

const splitDelimitedMetadata = (value: string | number | boolean | null | undefined) =>
  typeof value === "string"
    ? value.split(",").map((item) => item.trim()).filter(Boolean)
    : [];

const splitPairingDateRangeMetadata = (value: string | number | boolean | null | undefined) =>
  typeof value === "string"
    ? value.split(";").map((item) => item.trim()).filter(Boolean)
    : [];

const splitPairingBidEntryMetadata = (value: string | number | boolean | null | undefined) =>
  typeof value === "string"
    ? value.split(";").map((item) => item.trim()).filter(Boolean)
    : [];

const uniqueSortedValues = (values: string[]) =>
  Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort();

const readPairingMetadataValues = (
  event: PbsBiddingCalendarEvent,
  pluralKey: string,
  singularKey: string,
) => {
  const pluralValues = splitDelimitedMetadata(event.metadata?.[pluralKey]);
  const singularValue = event.metadata?.[singularKey];

  if (pluralValues.length > 0) {
    return pluralValues;
  }

  return typeof singularValue === "string" && singularValue.trim()
    ? [singularValue.trim()]
    : [];
};

const buildGroupedPairingLabelFromNumbers = (pairingNumbers: string[]) => {
  const uniquePairingNumbers = uniqueSortedValues(pairingNumbers);
  const firstPairingNumber = uniquePairingNumbers[0] ?? "Pairing";

  return uniquePairingNumbers.length > 1
    ? `${firstPairingNumber} +${uniquePairingNumbers.length - 1}`
    : firstPairingNumber;
};

const appendUnique = (target: string[], values: string[]) => {
  for (const value of values) {
    if (!target.includes(value)) {
      target.push(value);
    }
  }
};

const buildPairingEventDateRange = (event: PbsBiddingCalendarEvent) => {
  const pairingNumber = readPairingMetadataValues(event, "pairingNumbers", "pairingNumber")[0]
    ?? event.label.replace(/\s+\+\d+$/, "");
  const dateRange = event.startDate === event.endDate
    ? event.startDate
    : `${event.startDate} - ${event.endDate}`;

  return `${pairingNumber}:${dateRange}`;
};

const encodePairingBidEntryField = (value: string) => encodeURIComponent(value.trim());

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
  const pairingDateRanges: string[] = [];
  const pairingBidEntries: string[] = [];
  const startDate = currentEvent.startDate < nextEvent.startDate ? currentEvent.startDate : nextEvent.startDate;
  const endDate = currentEvent.endDate > nextEvent.endDate ? currentEvent.endDate : nextEvent.endDate;

  appendUnique(pairingDateRanges, splitPairingDateRangeMetadata(currentEvent.metadata?.pairingDateRanges));
  appendUnique(pairingDateRanges, splitPairingDateRangeMetadata(nextEvent.metadata?.pairingDateRanges));
  appendUnique(pairingDateRanges, [buildPairingEventDateRange(currentEvent), buildPairingEventDateRange(nextEvent)]);
  appendUnique(pairingBidEntries, splitPairingBidEntryMetadata(currentEvent.metadata?.pairingBidEntries));
  appendUnique(pairingBidEntries, splitPairingBidEntryMetadata(nextEvent.metadata?.pairingBidEntries));
  appendUnique(pairingBidEntries, [
    buildPairingEventBidEntry(currentEvent),
    buildPairingEventBidEntry(nextEvent),
  ].filter((value): value is string => value !== null));
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
      pairingDateRanges: pairingDateRanges.join("; "),
      originDate: originDates[0] ?? currentEvent.metadata?.originDate ?? null,
      originDates: originDates.join(","),
      pairingBidEntries: sortedPairingBidEntries.length > 0 ? sortedPairingBidEntries.join("; ") : null,
      pairingCount: pairingNumbers.length,
    },
  };
};

export const mergeOverlappingPairingEvents = (events: PbsBiddingCalendarEvent[]) => {
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
