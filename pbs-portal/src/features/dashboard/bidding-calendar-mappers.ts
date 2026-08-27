import type {
  PbsBiddingCalendarCurrentResponse,
  PbsBiddingCalendarDayOffCapacity,
  PbsBiddingCalendarEvent,
} from "../../../../packages/contracts/pbs-bidding-calendar.js";
import type {
  PbsReserveCoverageResponse,
} from "../../../../packages/contracts/pbs-reserve-bids.js";
import { buildCalendarCellsForRange } from "@/features/dashboard/dashboard-calendar-grid";
import { mergeOverlappingPairingEvents } from "@/features/dashboard/bidding-calendar-pairing-events";
import type { DashboardScheduleData, TierRow } from "@/features/dashboard/types";
import type { CalendarDraftResponse } from "@/features/dashboard/dashboard-calendar-state";
import type {
  ScheduleCalendarEvent,
  ScheduleCalendarEventTone,
  ScheduleCalendarMetricBadge,
  ScheduleTierTone,
} from "@/shared/components/schedule/types";

type CalendarEventForRender = PbsBiddingCalendarEvent & {
  tone: ScheduleCalendarEventTone;
};

type RawEventSegment = {
  row: number;
  colStart: number;
  colSpan: number;
  startIndex: number;
  endIndex: number;
  label: string;
  tone: ScheduleCalendarEventTone;
  sourceEvent: PbsBiddingCalendarEvent;
};

type BuildDashboardScheduleOptions = {
  reserveCoverage?: PbsReserveCoverageResponse | null;
};

const FALLBACK_TIER_RANGE = ["T1", "T2", "T3", "T4", "T5", "T6", "T7"];
const DEFAULT_ACTIVE_TIER = "T1";
const EVENT_TOP_START = 24;
const EVENT_TOP_STEP = 25;
const TIER_TONE_RANK: Record<ScheduleTierTone, number> = {
  empty: 0,
  blue: 1,
  red: 2,
  yellow: 3,
  green: 4,
};
const METRIC_BADGE_ORDER: Record<ScheduleCalendarMetricBadge["type"], number> = {
  days_off: 0,
  reserve: 1,
};

const toTierLabel = (tier: string) => {
  const tierNumber = Number.parseInt(tier.replace(/^T/i, ""), 10);

  if (!Number.isSafeInteger(tierNumber)) {
    return tier.toUpperCase();
  }

  return `TIER-${String(tierNumber).padStart(2, "0")}`;
};

const toDraftTier = (activeTierLabel: string) => {
  const match = activeTierLabel.match(/^TIER-(\d+)$/i);

  if (!match) {
    return null;
  }

  return `T${Number.parseInt(match[1]!, 10)}`;
};

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

const asRenderableEvent = (event: PbsBiddingCalendarEvent): CalendarEventForRender | null => {
  if (event.type === "weekend" || event.tone === "muted") {
    return null;
  }

  if (event.tone !== "blue" && event.tone !== "green" && event.tone !== "yellow") {
    return null;
  }

  return {
    ...event,
    tone: event.tone,
  };
};

const buildDayOffOverrideEvents = (
  dayOffDraftResponse?: CalendarDraftResponse | null,
): PbsBiddingCalendarEvent[] => {
  if (!dayOffDraftResponse) {
    return [];
  }

  return dayOffDraftResponse.draft.tiers.flatMap((tier) =>
    tier.dates.map((date) => ({
      id: `day-off-draft-${tier.tier}-${date}`,
      type: "prefer_off_bid" as const,
      tier: tier.tier,
      label: "Off",
      startDate: date,
      endDate: date,
      tone: "green" as const,
      source: "pbs_bid_group" as const,
      readonly: false,
    })),
  );
};

const resolveDisplayEvents = (
  response: PbsBiddingCalendarCurrentResponse,
  dayOffDraftResponse?: CalendarDraftResponse | null,
) => {
  const dayOffOverrideEvents = buildDayOffOverrideEvents(dayOffDraftResponse);

  if (dayOffOverrideEvents.length === 0) {
    return response.events;
  }

  return [
    ...response.events.filter((event) => event.type !== "prefer_off_bid"),
    ...dayOffOverrideEvents,
  ];
};

const markWeekendCells = (
  calendarCells: DashboardScheduleData["calendarCells"],
  events: PbsBiddingCalendarEvent[],
) => {
  const weekendDates = new Set(
    events
      .filter((event) => event.type === "weekend")
      .flatMap((event) => listIsoDatesInRange(event.startDate, event.endDate)),
  );

  return calendarCells.map((cell) => (
    cell.isoDate && weekendDates.has(cell.isoDate)
      ? { ...cell, weekend: true }
      : cell
  ));
};

const buildDayOffMetricBadge = (
  capacity: PbsBiddingCalendarDayOffCapacity,
): ScheduleCalendarMetricBadge => ({
  type: "days_off",
  label: "DO",
  numerator: capacity.requestedDayOffCount,
  denominator: capacity.maxDaysOffCount,
  ariaLabel: [
    `DO days off requests for ${capacity.date}: ${capacity.requestedDayOffCount} of ${capacity.maxDaysOffCount}`,
    `Crew ${capacity.totalCrewCount}`,
    `Pairing demand ${capacity.pairingDemandCount}`,
    `Reserve demand ${capacity.reserveDemandCount}`,
    `Pre-assigned days off ${capacity.preAssignedDayOffCount}`,
  ].join(" · "),
});

const buildReserveMetricBadge = (
  day: PbsReserveCoverageResponse["days"][number],
): ScheduleCalendarMetricBadge => ({
  type: "reserve",
  label: "RES",
  numerator: day.requiredReserveCount,
  denominator: day.availableOffCount,
  ariaLabel: `RES reserve coverage for ${day.date}: need ${day.requiredReserveCount}; off ${day.availableOffCount}`,
});

const upsertMetricBadge = (
  cell: DashboardScheduleData["calendarCells"][number],
  badge: ScheduleCalendarMetricBadge,
): DashboardScheduleData["calendarCells"][number] => ({
  ...cell,
  metricBadges: [
    ...(cell.metricBadges ?? []).filter((metricBadge) => metricBadge.type !== badge.type),
    badge,
  ].sort((left, right) => METRIC_BADGE_ORDER[left.type] - METRIC_BADGE_ORDER[right.type]),
});

const applyDayOffCapacity = (
  calendarCells: DashboardScheduleData["calendarCells"],
  dayOffCapacity: PbsBiddingCalendarDayOffCapacity[] | undefined,
): DashboardScheduleData["calendarCells"] => {
  if (!dayOffCapacity || dayOffCapacity.length === 0) {
    return calendarCells;
  }

  const capacityByDate = new Map(dayOffCapacity.map((capacity) => [capacity.date, capacity] as const));

  return calendarCells.map((cell) => {
    if (!cell.isoDate || cell.muted) {
      return cell;
    }

    const capacity = capacityByDate.get(cell.isoDate);

    if (!capacity) {
      return cell;
    }

    return upsertMetricBadge({
      ...cell,
      dayOffCapacity: {
        requestedDayOffCount: capacity.requestedDayOffCount,
        totalCrewCount: capacity.totalCrewCount,
        pairingDemandCount: capacity.pairingDemandCount,
        reserveDemandCount: capacity.reserveDemandCount,
        preAssignedDayOffCount: capacity.preAssignedDayOffCount,
        maxDaysOffCount: capacity.maxDaysOffCount,
      },
    }, buildDayOffMetricBadge(capacity));
  });
};

const applyReserveCoverageMetric = (
  calendarCells: DashboardScheduleData["calendarCells"],
  reserveCoverage: PbsReserveCoverageResponse | null | undefined,
): DashboardScheduleData["calendarCells"] => {
  if (!reserveCoverage || reserveCoverage.days.length === 0) {
    return calendarCells;
  }

  const coverageByDate = new Map(reserveCoverage.days.map((day) => [day.date, day] as const));

  return calendarCells.map((cell) => {
    if (!cell.isoDate || cell.muted) {
      return cell;
    }

    const coverageDay = coverageByDate.get(cell.isoDate);

    if (!coverageDay) {
      return cell;
    }

    return upsertMetricBadge(cell, buildReserveMetricBadge(coverageDay));
  });
};

const applyTone = (
  cells: ScheduleTierTone[],
  dayIndex: number,
  tone: ScheduleTierTone,
) => {
  const currentTone = cells[dayIndex] ?? "empty";

  if (TIER_TONE_RANK[tone] >= TIER_TONE_RANK[currentTone]) {
    cells[dayIndex] = tone;
  }
};

const buildTierRows = (
  periodDates: string[],
  activeTierRange: string[],
  events: PbsBiddingCalendarEvent[],
): TierRow[] => {
  const tiers = activeTierRange.length > 0 ? activeTierRange : FALLBACK_TIER_RANGE;
  const dayIndexByDate = new Map(periodDates.map((date, index) => [date, index] as const));
  const cellsByTier = new Map(
    tiers.map((tier) => [
      tier,
      Array.from({ length: periodDates.length }, () => "empty" as ScheduleTierTone),
    ] as const),
  );

  for (const event of events) {
    const renderableEvent = asRenderableEvent(event);

    if (!renderableEvent?.tier) {
      continue;
    }

    const tierCells = cellsByTier.get(renderableEvent.tier);

    if (!tierCells) {
      continue;
    }

    for (const isoDate of listIsoDatesInRange(renderableEvent.startDate, renderableEvent.endDate)) {
      const dayIndex = dayIndexByDate.get(isoDate);

      if (dayIndex === undefined) {
        continue;
      }

      applyTone(tierCells, dayIndex, renderableEvent.tone);
    }
  }

  return tiers.map((tier, index) => ({
    label: toTierLabel(tier),
    active: index === 0,
    cells: cellsByTier.get(tier)
      ?? Array.from({ length: periodDates.length }, () => "empty" as ScheduleTierTone),
  }));
};

const buildRawSegments = (
  events: PbsBiddingCalendarEvent[],
  activeTier: string | null,
  calendarCells: DashboardScheduleData["calendarCells"],
): RawEventSegment[] => {
  const cellIndexByIsoDate = new Map(
    calendarCells
      .map((cell, index) => [cell.isoDate, index] as const)
      .filter((entry): entry is [string, number] => typeof entry[0] === "string"),
  );
  const segments: RawEventSegment[] = [];

  for (const event of events) {
    const renderableEvent = asRenderableEvent(event);

    if (!renderableEvent || (activeTier && renderableEvent.tier && renderableEvent.tier !== activeTier)) {
      continue;
    }

    const cellIndexes = listIsoDatesInRange(renderableEvent.startDate, renderableEvent.endDate)
      .map((isoDate) => cellIndexByIsoDate.get(isoDate))
      .filter((cellIndex): cellIndex is number => cellIndex !== undefined)
      .sort((left, right) => left - right);

    if (cellIndexes.length === 0) {
      continue;
    }

    let segmentStart = cellIndexes[0]!;
    let previousIndex = cellIndexes[0]!;

    for (const cellIndex of cellIndexes.slice(1)) {
      if (cellIndex === previousIndex + 1 && Math.floor(cellIndex / 7) === Math.floor(previousIndex / 7)) {
        previousIndex = cellIndex;
        continue;
      }

      segments.push({
        row: Math.floor(segmentStart / 7) + 1,
        colStart: (segmentStart % 7) + 1,
        colSpan: previousIndex - segmentStart + 1,
        startIndex: segmentStart,
        endIndex: previousIndex,
        label: renderableEvent.label,
        tone: renderableEvent.tone,
        sourceEvent: renderableEvent,
      });
      segmentStart = cellIndex;
      previousIndex = cellIndex;
    }

    segments.push({
      row: Math.floor(segmentStart / 7) + 1,
      colStart: (segmentStart % 7) + 1,
      colSpan: previousIndex - segmentStart + 1,
      startIndex: segmentStart,
      endIndex: previousIndex,
      label: renderableEvent.label,
      tone: renderableEvent.tone,
      sourceEvent: renderableEvent,
    });
  }

  return segments;
};

const isDayOffSegment = (segment: RawEventSegment) =>
  segment.sourceEvent.type === "prefer_off_bid" && segment.label === "Off";

const canMergeSegment = (left: RawEventSegment, right: RawEventSegment) => {
  if (
    left.row !== right.row
    || left.label !== right.label
    || left.tone !== right.tone
  ) {
    return false;
  }

  if (isDayOffSegment(left) && isDayOffSegment(right)) {
    return left.sourceEvent.tier === right.sourceEvent.tier
      && right.startIndex <= left.endIndex + 1;
  }

  return left.sourceEvent.id === right.sourceEvent.id
    && left.endIndex + 1 === right.startIndex;
};

const mergeAdjacentSegments = (segments: RawEventSegment[]) => {
  const sortedSegments = [...segments].sort((left, right) => {
    if (left.row !== right.row) {
      return left.row - right.row;
    }

    if (left.startIndex !== right.startIndex) {
      return left.startIndex - right.startIndex;
    }

    return left.label.localeCompare(right.label);
  });
  const mergedSegments: RawEventSegment[] = [];

  for (const segment of sortedSegments) {
    const previousSegment = mergedSegments.at(-1);

    if (
      previousSegment
      && canMergeSegment(previousSegment, segment)
    ) {
      previousSegment.endIndex = Math.max(previousSegment.endIndex, segment.endIndex);
      previousSegment.colSpan = previousSegment.endIndex - previousSegment.startIndex + 1;
      continue;
    }

    mergedSegments.push({ ...segment });
  }

  return mergedSegments;
};

const buildCalendarEvents = (
  events: PbsBiddingCalendarEvent[],
  activeTier: string | null,
  calendarCells: DashboardScheduleData["calendarCells"],
): ScheduleCalendarEvent[] => {
  const rowSlotEndIndexes = new Map<number, number[]>();

  return mergeAdjacentSegments(buildRawSegments(events, activeTier, calendarCells)).map((segment) => {
    const rowSlots = rowSlotEndIndexes.get(segment.row) ?? [];
    const slotIndex = rowSlots.findIndex((endIndex) => endIndex < segment.startIndex);
    const resolvedSlotIndex = slotIndex === -1 ? rowSlots.length : slotIndex;

    rowSlots[resolvedSlotIndex] = segment.endIndex;
    rowSlotEndIndexes.set(segment.row, rowSlots);

    const isPairingBid = segment.sourceEvent.type === "pairing_bid";

    return {
      row: segment.row,
      colStart: segment.colStart,
      colSpan: segment.colSpan,
      top: EVENT_TOP_START + resolvedSlotIndex * EVENT_TOP_STEP,
      label: segment.label,
      tone: segment.tone,
      sourceEvent: segment.sourceEvent,
      ...(isPairingBid ? {
        ariaLabel: `View pairing bid ${segment.label}`,
        selectable: true,
      } : {}),
    };
  });
};

export const buildDashboardScheduleDataFromBiddingCalendar = (
  response: PbsBiddingCalendarCurrentResponse,
  activeTierLabel: string,
  dayOffDraftResponse?: CalendarDraftResponse | null,
  options: BuildDashboardScheduleOptions = {},
): DashboardScheduleData => {
  const periodStart = response.currentPeriod?.rpStartLocal ?? "";
  const periodEnd = response.currentPeriod?.rpEndLocal ?? "";
  const periodDates = listIsoDatesInRange(periodStart, periodEnd);

  if (periodDates.length === 0) {
    throw new Error("Bidding calendar roster period range is unavailable.");
  }

  const displayEvents = mergeOverlappingPairingEvents(resolveDisplayEvents(response, dayOffDraftResponse));
  const calendarCellsWithDayOffCapacity = applyDayOffCapacity(
    markWeekendCells(buildCalendarCellsForRange(periodStart, periodEnd), displayEvents),
    response.dayOffCapacity,
  );
  const calendarCells = applyReserveCoverageMetric(calendarCellsWithDayOffCapacity, options.reserveCoverage);
  const activeTier = toDraftTier(activeTierLabel) ?? DEFAULT_ACTIVE_TIER;

  return {
    title: "BIDDING CALENDAR",
    monthLabel: `${response.periodCode.toUpperCase()} · ${periodStart} – ${periodEnd}`,
    dayLabels: periodDates.map((date) => date.slice(-2)),
    tierRows: buildTierRows(periodDates, response.activeTierRange, displayEvents),
    weekdayLabels: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"],
    calendarCells,
    calendarEvents: buildCalendarEvents(displayEvents, activeTier, calendarCells),
  };
};
