import type {
  PbsDashboardMessageCenter,
  PbsDashboardSummary,
} from "../../../../packages/contracts/pbs-dashboard-summary.js";
import type { DashboardMessagePanelData } from "@/features/dashboard/types";
import { DASHBOARD_EMPTY_VALUE } from "@/features/dashboard/dashboard-view-model";

const normalizeValue = (value?: string | number | null) => {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : DASHBOARD_EMPTY_VALUE;
};

const normalizeFleetValue = (value?: string | number | null) => {
  const normalized = normalizeValue(value);
  return normalized === DASHBOARD_EMPTY_VALUE ? "Other fleet" : normalized;
};

const emptyPreAssignments = {
  totalDuties: 0,
  daysTouched: 0,
  categories: [],
  details: [],
};

const formatDateLabel = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return normalizeValue(value);
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))));
};

const formatDateRangeLabel = (startDate: string, endDate: string) => {
  if (startDate === endDate) {
    return formatDateLabel(startDate);
  }

  return `${formatDateLabel(startDate)} - ${formatDateLabel(endDate)}`;
};

export const buildDashboardMessagePanelData = (
  messageCenter?: PbsDashboardMessageCenter | null,
): DashboardMessagePanelData => ({
  title: messageCenter?.title ?? "MESSAGE CENTER",
  baseLineAverage: normalizeValue(messageCenter?.baseLineAverage),
  preAssignments: messageCenter?.preAssignments
    ? {
      totalDuties: messageCenter.preAssignments.totalDuties,
      daysTouched: messageCenter.preAssignments.daysTouched,
      categories: messageCenter.preAssignments.categories.map((category) => ({
        code: category.code,
        label: normalizeValue(category.label),
        count: category.count,
      })),
      details: messageCenter.preAssignments.details.map((item) => ({
        id: item.id,
        type: item.type,
        code: normalizeValue(item.code),
        label: normalizeValue(item.label),
        dateText: formatDateRangeLabel(item.startDate, item.endDate),
        timeText: item.timeText,
      })),
    }
    : emptyPreAssignments,
  items: messageCenter?.fleetItems.map((item) => ({
    fleet: normalizeFleetValue(item.fleet),
    subFleet: normalizeValue(item.subFleet),
    pairingCount: item.pairingCount,
  })) ?? [],
});

export const buildDashboardMessagePanelDataFromSummary = (
  summary?: PbsDashboardSummary | null,
): DashboardMessagePanelData => buildDashboardMessagePanelData(summary?.messageCenter);
