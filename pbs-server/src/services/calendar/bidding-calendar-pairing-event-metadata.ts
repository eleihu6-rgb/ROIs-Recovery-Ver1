import type { PbsBiddingCalendarEvent } from "../../../../packages/contracts/pbs-bidding-calendar.js";

const splitMetadata = (
  value: string | number | boolean | null | undefined,
  delimiter: "," | ";",
) =>
  typeof value === "string"
    ? value.split(delimiter).map((item) => item.trim()).filter(Boolean)
    : [];

export const splitDelimitedMetadata = (value: string | number | boolean | null | undefined) =>
  splitMetadata(value, ",");

export const splitPairingDateRangeMetadata = (
  value: string | number | boolean | null | undefined,
) => splitMetadata(value, ";");

export const splitPairingBidEntryMetadata = (
  value: string | number | boolean | null | undefined,
) => splitMetadata(value, ";");

export const uniqueSortedValues = (values: string[]) =>
  Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort();

export const mergeUniqueValues = (valueGroups: string[][]) => {
  const values = new Set<string>();

  valueGroups.forEach((group) => {
    group.forEach((value) => {
      const trimmedValue = value.trim();

      if (trimmedValue) {
        values.add(trimmedValue);
      }
    });
  });

  return Array.from(values);
};

export const buildGroupedPairingLabelFromNumbers = (pairingNumbers: string[]) => {
  const uniquePairingNumbers = uniqueSortedValues(pairingNumbers);
  const firstPairingNumber = uniquePairingNumbers[0] ?? "Pairing";

  return uniquePairingNumbers.length > 1
    ? `${firstPairingNumber} +${uniquePairingNumbers.length - 1}`
    : firstPairingNumber;
};

export const readPairingMetadataValues = (
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
