import type { ScheduleCalendarEvent } from "@/shared/components/schedule/types";
import type { PairingSearchResult } from "@/features/pairing/types";
import { pairingService } from "@/shared/services/pairing-service";
import type { PairingSearchPeriodReference } from "@/shared/services/pairing-service";

export type PairingCalendarDetailTarget = {
  originDate: string | null;
  pairingId: string;
  pairingNumber: string;
};

type PairingCalendarDetailDateRange = {
  endDate: string;
  pairingNumber: string;
  startDate: string;
};

type PairingCalendarBidEntry = {
  endDate: string;
  originDate: string;
  pairingId: string;
  pairingNumber: string;
  propertyGroupKey: string;
  startDate: string;
};

export const readCalendarEventMetadata = (event: ScheduleCalendarEvent, key: string) => {
  const value = event.sourceEvent?.metadata?.[key];

  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return null;
};

const formatPairingMode = (mode: string | null) => {
  if (mode === "specific_date") {
    return "Specific Date";
  }

  if (mode === "entire_month") {
    return "Entire Month";
  }

  return "-";
};

const formatCompactIsoDate = (value: string | null | undefined) => {
  const trimmedValue = value?.trim();
  const match = trimmedValue?.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  return match ? `${match[1]}${match[2]}${match[3]}` : trimmedValue || "-";
};

const formatDelimitedMetadata = (value: string | null) =>
  value?.split(",").map((item) => item.trim()).filter(Boolean).join(", ") ?? null;

export const splitDelimitedMetadata = (value: string | null) =>
  value?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];

const decodePairingBidEntryField = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const parsePairingBidEntries = (value: string | null): PairingCalendarBidEntry[] =>
  value?.split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item): PairingCalendarBidEntry | null => {
      const [
        propertyGroupKey = "",
        pairingNumber = "",
        pairingId = "",
        originDate = "",
        startDate = "",
        endDate = "",
      ] = item.split("|").map(decodePairingBidEntryField);

      if (!propertyGroupKey || !pairingNumber || !pairingId) {
        return null;
      }

      return {
        propertyGroupKey,
        pairingNumber,
        pairingId,
        originDate,
        startDate,
        endDate: endDate || startDate,
      };
    })
    .filter((entry): entry is PairingCalendarBidEntry => entry !== null) ?? [];

const extractPairingDateRangeTargets = (
  value: string | null,
  pairingIdByNumber: Map<string, string>,
): PairingCalendarDetailTarget[] =>
  value?.split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item): PairingCalendarDetailTarget | null => {
      const [rawPairingNumber = "", rawRange = ""] = item.split(":");
      const pairingNumber = rawPairingNumber.trim();
      const pairingId = pairingIdByNumber.get(pairingNumber) ?? "";
      const originDate = rawRange.trim().slice(0, 10);

      return pairingNumber && pairingId && /^\d{4}-\d{2}-\d{2}$/.test(originDate)
        ? { pairingNumber, pairingId, originDate }
        : null;
    })
    .filter((target): target is PairingCalendarDetailTarget => target !== null) ?? [];

export const buildPairingDetailTargets = (event: ScheduleCalendarEvent): PairingCalendarDetailTarget[] => {
  const bidEntries = parsePairingBidEntries(readCalendarEventMetadata(event, "pairingBidEntries"));

  if (bidEntries.length > 0) {
    const targetsByKey = new Map<string, PairingCalendarDetailTarget>();

    for (const entry of bidEntries) {
      const targetKey = `${entry.pairingId}:${entry.originDate || "all"}`;

      if (targetsByKey.has(targetKey)) {
        continue;
      }

      targetsByKey.set(targetKey, {
        pairingId: entry.pairingId,
        pairingNumber: entry.pairingNumber,
        originDate: entry.originDate || null,
      });
    }

    return Array.from(targetsByKey.values());
  }

  const pairingNumbers = splitDelimitedMetadata(readCalendarEventMetadata(event, "pairingNumbers"));
  const pairingIds = splitDelimitedMetadata(readCalendarEventMetadata(event, "pairingIds"))
    .concat(splitDelimitedMetadata(readCalendarEventMetadata(event, "pairingId")));
  const pairingIdByNumber = new Map(
    pairingNumbers.map((pairingNumber, index) => [pairingNumber, pairingIds[index] ?? ""]),
  );
  const singlePairingNumber = readCalendarEventMetadata(event, "pairingNumber") ?? event.label.replace(/\s+\+\d+$/, "");
  const resolvedPairingNumbers = pairingNumbers.length > 0 ? pairingNumbers : splitDelimitedMetadata(singlePairingNumber);
  const originDates = splitDelimitedMetadata(readCalendarEventMetadata(event, "originDates"));
  const singleOriginDate = readCalendarEventMetadata(event, "originDate");
  const dateRangeTargets = extractPairingDateRangeTargets(readCalendarEventMetadata(event, "pairingDateRanges"), pairingIdByNumber);
  const targetsByKey = new Map<string, PairingCalendarDetailTarget>();

  for (const target of dateRangeTargets) {
    targetsByKey.set(`${target.pairingId}:${target.originDate ?? "all"}`, target);
  }

  resolvedPairingNumbers.forEach((pairingNumber, index) => {
    if (dateRangeTargets.some((target) => target.pairingNumber === pairingNumber)) {
      return;
    }

    const pairingId = pairingIdByNumber.get(pairingNumber) ?? pairingIds[index] ?? "";

    if (!pairingId) {
      return;
    }

    const originDate = originDates[index]
      ?? (originDates.length === 1 ? originDates[0] : null)
      ?? singleOriginDate
      ?? null;
    const targetKey = `${pairingId}:${originDate ?? "all"}`;

    if (targetsByKey.has(targetKey)) {
      return;
    }

    targetsByKey.set(targetKey, {
      pairingId,
      pairingNumber,
      originDate,
    });
  });

  return Array.from(targetsByKey.values());
};

export const loadPairingDetailResults = async (
  targets: PairingCalendarDetailTarget[],
  period: PairingSearchPeriodReference,
) => {
  const response = await pairingService.getPairingDetails(
    period,
    targets.map((target) => ({
      pairingId: target.pairingId,
      ...(target.originDate ? { originDate: target.originDate } : {}),
    })),
  );
  const resultsById = new Map<string, PairingSearchResult>();

  for (const result of response.results) {
    resultsById.set(result.id, result);
  }

  return Array.from(resultsById.values());
};

const parsePairingDetailDateRanges = (value: string | null): PairingCalendarDetailDateRange[] =>
  value?.split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item): PairingCalendarDetailDateRange | null => {
      const separatorIndex = item.indexOf(":");

      if (separatorIndex < 0) {
        return null;
      }

      const pairingNumber = item.slice(0, separatorIndex).trim();
      const rawDateRange = item.slice(separatorIndex + 1).trim();
      const [rawStartDate = "", rawEndDate] = rawDateRange.split(/\s+-\s+/);
      const startDate = rawStartDate.trim();
      const endDate = (rawEndDate ?? rawStartDate).trim();

      return pairingNumber && startDate
        ? {
          pairingNumber,
          startDate,
          endDate: endDate || startDate,
        }
        : null;
    })
    .filter((range): range is PairingCalendarDetailDateRange => range !== null) ?? [];

export const buildPairingDetailRows = (event: ScheduleCalendarEvent) => {
  const bidEntries = parsePairingBidEntries(readCalendarEventMetadata(event, "pairingBidEntries"));
  const mode = formatPairingMode(readCalendarEventMetadata(event, "occurrenceMode"));
  const tier = event.sourceEvent?.tier ?? "-";

  if (bidEntries.length > 0) {
    return bidEntries.map((entry, index) => ({
      rowKey: `${entry.propertyGroupKey}:${entry.pairingNumber}:${entry.originDate}:${entry.startDate}:${entry.endDate}:${index}`,
      propertyGroupKey: entry.propertyGroupKey,
      pairingNumber: entry.pairingNumber,
      internalId: entry.pairingId || "-",
      tier,
      originDate: formatCompactIsoDate(entry.originDate),
      startDate: formatCompactIsoDate(entry.startDate),
      endDate: formatCompactIsoDate(entry.endDate),
      mode,
    }));
  }

  const metadataPairingNumbers = splitDelimitedMetadata(readCalendarEventMetadata(event, "pairingNumbers"));
  const fallbackPairingNumber = readCalendarEventMetadata(event, "pairingNumber")
    ?? event.label.replace(/\s+\+\d+$/, "");
  const pairingNumbers = metadataPairingNumbers.length > 0
    ? metadataPairingNumbers
    : splitDelimitedMetadata(fallbackPairingNumber);
  const internalIds = splitDelimitedMetadata(readCalendarEventMetadata(event, "pairingIds"))
    .concat(splitDelimitedMetadata(readCalendarEventMetadata(event, "pairingId")));
  const propertyGroupKeys = splitDelimitedMetadata(readCalendarEventMetadata(event, "propertyGroupKeys"))
    .concat(splitDelimitedMetadata(readCalendarEventMetadata(event, "propertyGroupKey")));
  const originDates = splitDelimitedMetadata(readCalendarEventMetadata(event, "originDates"));
  const singleOriginDate = readCalendarEventMetadata(event, "originDate");
  const pairingRanges = parsePairingDetailDateRanges(readCalendarEventMetadata(event, "pairingDateRanges"));
  const pairingInternalIdByNumber = new Map(
    pairingNumbers.map((pairingNumber, index) => [pairingNumber, internalIds[index] ?? "-"]),
  );
  const pairingOriginDateByNumber = new Map(
    pairingNumbers.map((pairingNumber, index) => [pairingNumber, originDates[index] ?? null]),
  );
  const pairingNumbersWithRanges = new Set(pairingRanges.map((range) => range.pairingNumber));
  const fallbackRanges = pairingNumbers
    .filter((pairingNumber) => !pairingNumbersWithRanges.has(pairingNumber))
    .map((pairingNumber) => ({
      pairingNumber,
      startDate: event.sourceEvent?.startDate ?? "",
      endDate: event.sourceEvent?.endDate ?? "",
    }));
  const rowRanges = pairingRanges.length > 0
    ? [...pairingRanges, ...fallbackRanges]
    : fallbackRanges;

  return rowRanges.map((range, index) => ({
    rowKey: `${propertyGroupKeys[index] ?? "unknown"}:${range.pairingNumber}:${range.startDate}:${range.endDate}:${index}`,
    propertyGroupKey: propertyGroupKeys[index] ?? (propertyGroupKeys.length === 1 ? propertyGroupKeys[0] : null),
    pairingNumber: range.pairingNumber,
    internalId: pairingInternalIdByNumber.get(range.pairingNumber) ?? internalIds[index] ?? "-",
    tier,
    originDate: formatCompactIsoDate(
      pairingOriginDateByNumber.get(range.pairingNumber)
      ?? (originDates.length === 1 ? originDates[0] : null)
      ?? singleOriginDate,
    ),
    startDate: formatCompactIsoDate(range.startDate),
    endDate: formatCompactIsoDate(range.endDate),
    mode,
  }));
};

export const formatPairingNumbersForLabel = (event: ScheduleCalendarEvent) =>
  formatDelimitedMetadata(readCalendarEventMetadata(event, "pairingNumbers"))
    ?? readCalendarEventMetadata(event, "pairingNumber")
    ?? event.label;
