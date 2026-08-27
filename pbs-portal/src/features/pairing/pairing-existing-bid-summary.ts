import {
  formatPairingBidSummaryPrefix,
  formatPairingBidValue,
} from "@/features/pairing/pairing-bid-summary";
import { buildBidPropertySummary } from "@/features/bid/bid-property-summary";
import { formatPbsPairingLengthSummary } from "../../../../packages/contracts/pbs-pairing-bids.js";
import type { PbsEfficientFlyingConfig } from "../../../../packages/contracts/pbs-pairing-bids.js";
import type {
  PairingBidValue,
  PairingExistingProperty,
  PairingOccurrenceBidItem,
} from "@/features/pairing/types";

const EMPTY_BID_SUMMARY = "--";
const COLLAPSED_GROUP_LIMIT = 3;
const COLLAPSED_VALUE_LIMIT = 3;
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LABEL_WITH_DATE_PATTERN = /^\s*(.+?)\s+on\s+(.+?)\s*$/i;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export type ExistingPairingBidSummaryGroup = {
  key: string;
  label: string;
  values: string[];
  rawValues: string[];
};

export type ExistingPairingBidTextSummary = {
  kind: "text";
  value: string;
  title: string;
};

export type ExistingPairingBidGroupedSummary = {
  kind: "grouped-list";
  headline: string;
  groups: ExistingPairingBidSummaryGroup[];
  totalItemCount: number;
  collapsedGroupLimit: number;
  collapsedValueLimit: number;
  title: string;
};

export type ExistingPairingBidSummary =
  | ExistingPairingBidTextSummary
  | ExistingPairingBidGroupedSummary;

type ExistingPairingBidSummaryOptions = {
  efficientFlyingConfig?: PbsEfficientFlyingConfig;
  includePropertyNameInHeadline?: boolean;
};

type GroupInput = {
  label: string;
  rawValue: string;
};

const formatSelectedCount = (count: number): string => `${count} selected`;

const formatFriendlyDate = (rawValue: string): string => {
  const match = ISO_DATE_PATTERN.exec(rawValue.trim());

  if (!match) {
    return rawValue.trim();
  }

  const monthIndex = Number(match[2]) - 1;
  const day = match[3];
  const month = MONTH_LABELS[monthIndex];

  return month ? `${month} ${day}` : rawValue.trim();
};

const sortRawValues = (values: string[]): string[] => [...values].sort((left, right) => left.localeCompare(right));

const buildGroupedSummaryGroups = (items: GroupInput[]): ExistingPairingBidSummaryGroup[] => {
  const rawValuesByLabel = new Map<string, Set<string>>();

  for (const item of items) {
    const label = item.label.trim();
    const rawValue = item.rawValue.trim();

    if (label.length === 0) {
      continue;
    }

    const rawValues = rawValuesByLabel.get(label) ?? new Set<string>();

    if (rawValue.length > 0) {
      rawValues.add(rawValue);
    }

    rawValuesByLabel.set(label, rawValues);
  }

  return Array.from(rawValuesByLabel.entries()).map(([label, rawValueSet]) => {
    const rawValues = sortRawValues(Array.from(rawValueSet));

    return {
      key: label,
      label,
      values: rawValues.map(formatFriendlyDate),
      rawValues,
    };
  });
};

const parsePairingLabel = (label: string, pairingId: string): GroupInput => {
  const trimmedLabel = label.trim();
  const fallbackLabel = trimmedLabel.length > 0 ? trimmedLabel : pairingId.trim();
  const match = LABEL_WITH_DATE_PATTERN.exec(trimmedLabel);

  if (!match) {
    return {
      label: fallbackLabel,
      rawValue: "",
    };
  }

  return {
    label: match[1].trim(),
    rawValue: match[2].trim(),
  };
};

const buildPairingIdListGroups = (
  bid: Extract<PairingBidValue, { type: "pairing-id-list" }>,
): { groups: ExistingPairingBidSummaryGroup[]; totalItemCount: number } => {
  const totalItemCount = Math.max(bid.pairingIds.length, bid.pairingLabels?.length ?? 0);
  const items = Array.from({ length: totalItemCount }, (_, index) =>
    parsePairingLabel(
      bid.pairingLabels?.[index] ?? bid.pairingIds[index] ?? "",
      bid.pairingIds[index] ?? "",
    ));

  return {
    groups: buildGroupedSummaryGroups(items),
    totalItemCount,
  };
};

const buildPairingOccurrenceGroups = (
  occurrences: PairingOccurrenceBidItem[],
): { groups: ExistingPairingBidSummaryGroup[]; totalItemCount: number } => ({
    groups: buildGroupedSummaryGroups(
      occurrences.map((occurrence) => ({
        label: occurrence.pairingNumber,
        rawValue: occurrence.originDate,
      })),
    ),
    totalItemCount: occurrences.length,
  });

const buildPairingNumberGroups = (
  bid: PairingBidValue,
): { groups: ExistingPairingBidSummaryGroup[]; totalItemCount: number } | null => {
  if (bid.type === "pairing-id-list") {
    return buildPairingIdListGroups(bid);
  }

  if (bid.type === "pairing-occurrence-list") {
    return buildPairingOccurrenceGroups(bid.occurrences);
  }

  return null;
};

const buildTextSummary = (property: PairingExistingProperty): ExistingPairingBidTextSummary => {
  if (
    property.bid.type === "pairing-length-preference"
    && (property.action === "award" || property.action === "avoid")
  ) {
    const pairingLengthSummary = formatPbsPairingLengthSummary({
      action: property.action,
      dateScope: property.bid.dateScope,
      maxDays: property.bid.maxDays,
      minDays: property.bid.minDays,
    });

    if (pairingLengthSummary) {
      return {
        kind: "text",
        value: pairingLengthSummary,
        title: pairingLengthSummary,
      };
    }
  }

  const summaryPrefix = formatPairingBidSummaryPrefix(property);
  const bidSummary = formatPairingBidValue(property.bid);
  const value = summaryPrefix ? `${summaryPrefix} · ${bidSummary}` : bidSummary;

  return {
    kind: "text",
    value,
    title: value,
  };
};

export const buildExistingPairingBidSummary = (
  property: PairingExistingProperty,
  options: ExistingPairingBidSummaryOptions = {},
): ExistingPairingBidSummary => {
  const isCurrentStructuredProperty = (
    property.bid.type === "pairing-preference"
    || property.bid.type === "pairing-check-time"
    || property.bid.type === "flight-legs-per-duty"
    || property.bid.type === "work-day-preference"
    || property.bid.type === "pairing-length-preference"
    || property.bid.type === "flight-number-preference"
    || property.bid.type === "redeye-preference"
    || property.bid.type === "deadhead-flying"
    || property.bid.type === "month-end-carryover"
    || property.bid.type === "airport-preference"
    || property.bid.type === "efficient-flying-preference"
    || (property.propertyCode === 129 && property.bid.type === "duration")
  );

  if (isCurrentStructuredProperty) {
    const summary = buildBidPropertySummary(
      "pairing",
      property,
      undefined,
      options.efficientFlyingConfig,
    );

    if (summary.kind === "text") {
      return {
        kind: "text",
        value: summary.text,
        title: summary.title,
      };
    }

    return {
      kind: "grouped-list",
      headline: summary.headline,
      groups: summary.groups,
      totalItemCount: summary.totalItemCount,
      collapsedGroupLimit: summary.collapsedGroupLimit,
      collapsedValueLimit: summary.collapsedValueLimit,
      title: summary.title,
    };
  }

  const grouped = property.propertyCode === 102 ? buildPairingNumberGroups(property.bid) : null;

  if (!grouped || grouped.totalItemCount === 0 || grouped.groups.length === 0) {
    return buildTextSummary(property);
  }

  const summaryPrefix = formatPairingBidSummaryPrefix(property);
  const includePropertyNameInHeadline = options.includePropertyNameInHeadline ?? true;
  const headlineSegments = [
    summaryPrefix,
    includePropertyNameInHeadline ? property.name : null,
    formatSelectedCount(grouped.totalItemCount),
  ].filter((segment): segment is string => Boolean(segment));
  const headline = headlineSegments.join(" · ");
  const groupLines = grouped.groups.map((group) => {
    const valueSummary = group.values.length > 0 ? group.values.join(", ") : EMPTY_BID_SUMMARY;

    return `${group.label}: ${valueSummary}`;
  });

  return {
    kind: "grouped-list",
    headline,
    groups: grouped.groups,
    totalItemCount: grouped.totalItemCount,
    collapsedGroupLimit: COLLAPSED_GROUP_LIMIT,
    collapsedValueLimit: COLLAPSED_VALUE_LIMIT,
    title: [headline, ...groupLines].join("\n"),
  };
};
