import type {
  PbsAwardCalendarEvent,
  PbsAwardCurrentResponse,
  PbsAwardEventTone,
  PbsAwardItem,
  PbsAwardLeg,
} from "../../../../packages/contracts/pbs-award-results.js";
import { buildCalendarCellsForRange } from "@/features/dashboard/dashboard-calendar-grid";
import type {
  AwardCalendarSegment,
  AwardDisplayItem,
  AwardDisplayLeg,
  AwardPageData,
  AwardRosterGroup,
} from "@/features/award/types";
import type { ScheduleCalendarEventTone } from "@/shared/components/schedule/types";

const DAYS_PER_WEEK = 7;
const CALENDAR_CELL_HEIGHT = 103;
const AWARD_CALENDAR_MIN_HEIGHT = 635;
const MS_PER_DAY = 86_400_000;
const MINUTES_PER_DAY = 1_440;
const MISSING_PUBLISHED_DATA_LABEL = "Missing data";

type RawCalendarSegment = Omit<AwardCalendarSegment, "lane" | "laneCount" | "conflict">;

const formatMinutes = (minutes: number | null): string => {
  if (minutes === null) {
    return "--";
  }

  const sign = minutes < 0 ? "-" : "";
  const absolute = Math.abs(minutes);
  const hours = Math.floor(absolute / 60);
  const minutePart = String(absolute % 60).padStart(2, "0");

  return `${sign}${hours}:${minutePart}`;
};

const formatMissingAwareMinutes = (minutes: number | null, missingReason: string | null | undefined): string =>
  missingReason ? MISSING_PUBLISHED_DATA_LABEL : formatMinutes(minutes);

const formatTime = (time: string | null): string => {
  if (!time || !/^\d{4}$/.test(time)) {
    return "--";
  }

  return `${time.slice(0, 2)}:${time.slice(2)}`;
};

const formatDate = (isoDate: string): string => {
  const parsed = new Date(`${isoDate}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime())) {
    return isoDate;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    timeZone: "UTC",
  }).format(parsed);
};

const formatDateRange = (startDate: string, endDate: string): string =>
  startDate === endDate
    ? formatDate(startDate)
    : `${formatDate(startDate)} - ${formatDate(endDate)}`;

const isoDateToDayIndex = (isoDate: string): number | null => {
  const parsed = Date.parse(`${isoDate}T00:00:00.000Z`);

  return Number.isNaN(parsed) ? null : Math.floor(parsed / MS_PER_DAY);
};

const formatTafbDays = (startDate: string, endDate: string, isPairing: boolean): string => {
  if (!isPairing) {
    return "--";
  }

  const startDayIndex = isoDateToDayIndex(startDate);
  const endDayIndex = isoDateToDayIndex(endDate);

  if (startDayIndex === null || endDayIndex === null || endDayIndex < startDayIndex) {
    return MISSING_PUBLISHED_DATA_LABEL;
  }

  const dayCount = endDayIndex - startDayIndex + 1;

  return `${dayCount} ${dayCount === 1 ? "day" : "days"}`;
};

const formatPeriodRange = (rpStart: string, rpEnd: string): string =>
  `${formatDate(rpStart.slice(0, 10))} ~ ${formatDate(rpEnd.slice(0, 10))}`;

const buildAwardCalendarCells = (
  rpStart: string,
  rpEnd: string,
) => buildCalendarCellsForRange(rpStart.slice(0, 10), rpEnd.slice(0, 10));

const formatTimeRange = (startTime: string | null, endTime: string | null): string => {
  if (!startTime && !endTime) {
    return "--";
  }

  return `${formatTime(startTime)} - ${formatTime(endTime)}`;
};

const buildRouteLabel = (legs: PbsAwardLeg[]): string => {
  const routeStops: string[] = [];

  for (const leg of legs) {
    if (leg.depAirport && routeStops.length === 0) {
      routeStops.push(leg.depAirport);
    }

    if (leg.arrAirport && routeStops.at(-1) !== leg.arrAirport) {
      routeStops.push(leg.arrAirport);
    }
  }

  return routeStops.length >= 2 ? routeStops.join("-") : "--";
};

const toRenderableTone = (tone: PbsAwardEventTone): ScheduleCalendarEventTone => tone;

const markWeekendCells = (cells: AwardPageData["calendar"]["calendarCells"]) =>
  cells.map((cell) => {
    if (!cell.isoDate) {
      return cell;
    }

    const date = new Date(`${cell.isoDate}T00:00:00.000Z`);
    const weekday = date.getUTCDay();

    return weekday === 0 || weekday === 6
      ? { ...cell, weekend: true }
      : cell;
  });

const dateToMinuteIndex = (isoDate: string): number | null => {
  const parsed = Date.parse(`${isoDate}T00:00:00.000Z`);

  return Number.isNaN(parsed) ? null : Math.floor(parsed / MS_PER_DAY) * MINUTES_PER_DAY;
};

const timeToMinute = (time: string | null, fallback: number): number => {
  if (!time || !/^\d{4}$/.test(time)) {
    return fallback;
  }

  const hours = Number.parseInt(time.slice(0, 2), 10);
  const minutes = Number.parseInt(time.slice(2), 10);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return fallback;
  }

  return Math.min(Math.max(hours * 60 + minutes, 0), MINUTES_PER_DAY);
};

const formatSegmentMinute = (minute: number): string => {
  if (minute >= MINUTES_PER_DAY) {
    return "24:00";
  }

  const boundedMinute = Math.min(Math.max(minute, 0), MINUTES_PER_DAY);
  const hours = Math.floor(boundedMinute / 60);
  const minutes = boundedMinute % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

const minuteOfDayFromIndex = (minuteIndex: number): number => {
  const minute = minuteIndex % MINUTES_PER_DAY;

  return minute < 0 ? minute + MINUTES_PER_DAY : minute;
};

const isoDateFromMinuteIndex = (minuteIndex: number): string =>
  new Date(Math.floor(minuteIndex / MINUTES_PER_DAY) * MS_PER_DAY).toISOString().slice(0, 10);

const buildSegmentLabel = (
  event: PbsAwardCalendarEvent,
  segmentStartMinuteIndex: number,
  segmentEndMinuteIndex: number,
  eventStartMinuteIndex: number,
  eventEndMinuteIndex: number,
): string => {
  const baseLabel = event.type === "day_off" ? "DO" : event.label;
  const startsBeforeSegment = eventStartMinuteIndex < segmentStartMinuteIndex;
  const endsAfterSegment = eventEndMinuteIndex > segmentEndMinuteIndex;

  if (startsBeforeSegment && endsAfterSegment) {
    return `${baseLabel} continues`;
  }

  if (startsBeforeSegment) {
    return `${baseLabel} until ${formatDate(isoDateFromMinuteIndex(segmentEndMinuteIndex))} ${formatSegmentMinute(minuteOfDayFromIndex(segmentEndMinuteIndex))}`;
  }

  if (endsAfterSegment) {
    return `${baseLabel} ${formatDate(isoDateFromMinuteIndex(segmentStartMinuteIndex))} ${formatSegmentMinute(minuteOfDayFromIndex(segmentStartMinuteIndex))}-continues`;
  }

  if (event.startDate === event.endDate) {
    return `${baseLabel} ${formatTime(event.startTime)}-${formatTime(event.endTime)}`;
  }

  return `${baseLabel} ${formatTime(event.startTime)}-${formatDate(event.endDate)} ${formatTime(event.endTime)}`;
};

const doSegmentsOverlap = (left: RawCalendarSegment, right: RawCalendarSegment): boolean =>
  left.sourceEventId !== right.sourceEventId
  && left.startMinuteIndex < right.endMinuteIndex
  && right.startMinuteIndex < left.endMinuteIndex;

const assignSegmentLanes = (segments: RawCalendarSegment[]): AwardCalendarSegment[] => {
  const byRow = new Map<number, RawCalendarSegment[]>();

  for (const segment of segments) {
    const rowSegments = byRow.get(segment.row) ?? [];

    rowSegments.push(segment);
    byRow.set(segment.row, rowSegments);
  }

  const resolvedSegments: AwardCalendarSegment[] = [];

  for (const rowSegments of byRow.values()) {
    const laneEnds: number[] = [];
    const sortedSegments = [...rowSegments].sort((left, right) => {
      if (left.startOffset !== right.startOffset) {
        return left.startOffset - right.startOffset;
      }

      return right.endOffset - left.endOffset;
    });
    const laneAssignments = new Map<string, number>();

    for (const segment of sortedSegments) {
      const availableLane = laneEnds.findIndex((endOffset) => endOffset <= segment.startOffset);
      const lane = availableLane === -1 ? laneEnds.length : availableLane;

      laneEnds[lane] = segment.endOffset;
      laneAssignments.set(segment.id, lane);
    }

    const laneCount = Math.max(laneEnds.length, 1);

    for (const segment of sortedSegments) {
      const conflict = sortedSegments.some((candidate) =>
        candidate.id !== segment.id && doSegmentsOverlap(segment, candidate),
      );

      resolvedSegments.push({
        ...segment,
        lane: laneAssignments.get(segment.id) ?? 0,
        laneCount,
        conflict,
      });
    }
  }

  return resolvedSegments.sort((left, right) => {
    if (left.row !== right.row) {
      return left.row - right.row;
    }

    if (left.startOffset !== right.startOffset) {
      return left.startOffset - right.startOffset;
    }

    return left.endOffset - right.endOffset;
  });
};

const buildAwardCalendarSegments = (
  events: PbsAwardCalendarEvent[],
  calendarCells: AwardPageData["calendar"]["calendarCells"],
): AwardCalendarSegment[] => {
  const calendarWeeks = [];

  for (let index = 0; index < calendarCells.length; index += DAYS_PER_WEEK) {
    calendarWeeks.push(calendarCells.slice(index, index + DAYS_PER_WEEK));
  }

  const rawSegments: RawCalendarSegment[] = [];

  for (const event of events) {
    const eventStartDayIndex = dateToMinuteIndex(event.startDate);
    const eventEndDayIndex = dateToMinuteIndex(event.endDate);

    if (eventStartDayIndex === null || eventEndDayIndex === null) {
      continue;
    }

    const eventStartMinuteIndex = eventStartDayIndex + timeToMinute(event.startTime, 0);
    const rawEventEndMinuteIndex = eventEndDayIndex + timeToMinute(event.endTime, MINUTES_PER_DAY);
    const eventEndMinuteIndex = rawEventEndMinuteIndex <= eventStartMinuteIndex
      ? eventStartMinuteIndex + 1
      : rawEventEndMinuteIndex;

    for (const [weekIndex, week] of calendarWeeks.entries()) {
      const anchorCellIndex = week.findIndex((cell) => typeof cell.isoDate === "string");
      const anchorDate = anchorCellIndex >= 0 ? week[anchorCellIndex]?.isoDate : undefined;

      if (!anchorDate) {
        continue;
      }

      const anchorMinuteIndex = dateToMinuteIndex(anchorDate);

      if (anchorMinuteIndex === null) {
        continue;
      }

      const weekStartMinuteIndex = anchorMinuteIndex - anchorCellIndex * MINUTES_PER_DAY;
      const weekEndMinuteIndex = weekStartMinuteIndex + DAYS_PER_WEEK * MINUTES_PER_DAY;
      const segmentStartMinuteIndex = Math.max(eventStartMinuteIndex, weekStartMinuteIndex);
      const segmentEndMinuteIndex = Math.min(eventEndMinuteIndex, weekEndMinuteIndex);

      if (segmentStartMinuteIndex >= segmentEndMinuteIndex) {
        continue;
      }

      const segmentLabel = buildSegmentLabel(
        event,
        segmentStartMinuteIndex,
        segmentEndMinuteIndex,
        eventStartMinuteIndex,
        eventEndMinuteIndex,
      );
      const startOffset = (segmentStartMinuteIndex - weekStartMinuteIndex) / MINUTES_PER_DAY;
      const endOffset = (segmentEndMinuteIndex - weekStartMinuteIndex) / MINUTES_PER_DAY;

      rawSegments.push({
        id: `${event.id}-week-${weekIndex + 1}-${startOffset.toFixed(4)}-${endOffset.toFixed(4)}`,
        sourceEventId: event.id,
        row: weekIndex + 1,
        startOffset,
        endOffset,
        startMinuteIndex: segmentStartMinuteIndex,
        endMinuteIndex: segmentEndMinuteIndex,
        continuesBefore: segmentStartMinuteIndex > eventStartMinuteIndex,
        continuesAfter: segmentEndMinuteIndex < eventEndMinuteIndex,
        label: segmentLabel,
        tone: toRenderableTone(event.tone),
        ariaLabel: `${event.label} from ${formatDate(event.startDate)} ${formatTime(event.startTime)} to ${formatDate(event.endDate)} ${formatTime(event.endTime)}`,
        title: `${event.label} · ${formatDate(event.startDate)} ${formatTime(event.startTime)} - ${formatDate(event.endDate)} ${formatTime(event.endTime)}`,
      });
    }
  }

  return assignSegmentLanes(rawSegments);
};

const mapLeg = (
  leg: PbsAwardLeg,
  seenDutySeqs: Set<number>,
  creditMissingReason: string | null | undefined,
): AwardDisplayLeg => {
  const isRepeatedDuty = leg.dutySeq !== null
    && leg.dutySeq !== undefined
    && seenDutySeqs.has(leg.dutySeq);

  if (leg.dutySeq !== null && leg.dutySeq !== undefined) {
    seenDutySeqs.add(leg.dutySeq);
  }

  return {
    ...leg,
    blockLabel: formatMinutes(leg.blockMinutes),
    creditLabel: creditMissingReason
      ? MISSING_PUBLISHED_DATA_LABEL
      : isRepeatedDuty
      ? "--"
      : formatMinutes(leg.creditMinutes),
  };
};

const mapItem = (item: PbsAwardCurrentResponse["items"][number]): AwardDisplayItem => {
  const seenDutySeqs = new Set<number>();
  const dataNotices = [
    item.creditMissingReason,
    item.legEquipmentMissingReason,
  ].filter((notice): notice is string => typeof notice === "string" && notice.length > 0);

  return {
    ...item,
    dateRangeLabel: formatDateRange(item.startDate, item.endDate),
    timeRangeLabel: formatTimeRange(item.startTime, item.endTime),
    creditLabel: formatMissingAwareMinutes(item.creditMinutes, item.creditMissingReason),
    blockLabel: formatMinutes(item.blockMinutes),
    tafbLabel: formatTafbDays(item.startDate, item.endDate, item.type === "pairing"),
    routeLabel: buildRouteLabel(item.legs),
    dataNotices,
    legs: item.legs.map((leg) => mapLeg(leg, seenDutySeqs, item.creditMissingReason)),
  };
};

const sumNullableMinutes = (values: Array<number | null>): number | null => {
  const presentValues = values.filter((value): value is number => value !== null);

  if (presentValues.length === 0) {
    return null;
  }

  return presentValues.reduce((total, value) => total + value, 0);
};

const uniqueNotices = (values: Array<string | null | undefined>): string[] =>
  Array.from(new Set(values.filter((value): value is string => Boolean(value))));

const mergeRosterItems = (groupId: string, sourceItems: PbsAwardItem[]): PbsAwardItem => {
  const sortedItems = [...sourceItems].sort((left, right) =>
    `${left.startDate}T${left.startTime ?? ""}`.localeCompare(
      `${right.startDate}T${right.startTime ?? ""}`,
    ));
  const firstItem = sortedItems[0]!;
  const lastItem = sortedItems.reduce((latest, item) =>
    `${item.endDate}T${item.endTime ?? ""}` > `${latest.endDate}T${latest.endTime ?? ""}`
      ? item
      : latest,
  );
  const creditMissingReasons = uniqueNotices(
    sortedItems.map((item) => item.creditMissingReason),
  );
  const equipmentMissingReasons = uniqueNotices(
    sortedItems.map((item) => item.legEquipmentMissingReason),
  );

  return {
    ...firstItem,
    id: groupId,
    startDate: firstItem.startDate,
    startTime: firstItem.startTime,
    endDate: lastItem.endDate,
    endTime: lastItem.endTime,
    creditMinutes: creditMissingReasons.length > 0
      ? null
      : sumNullableMinutes(sortedItems.map((item) => item.creditMinutes)),
    creditMissingReason: creditMissingReasons.join(" ") || null,
    blockMinutes: sumNullableMinutes(sortedItems.map((item) => item.blockMinutes)),
    tafbDays: sortedItems.length === 1 ? firstItem.tafbDays : null,
    legEquipmentMissingReason: equipmentMissingReasons.join(" ") || null,
    legs: sortedItems.flatMap((item) => item.legs),
  };
};

const buildRosterGroups = (
  events: PbsAwardCalendarEvent[],
  sourceItems: PbsAwardItem[],
): AwardRosterGroup[] => {
  const itemById = new Map(sourceItems.map((item) => [item.id, item]));
  const parentByItemId = new Map(sourceItems.map((item) => [item.id, item.id]));
  const findRoot = (itemId: string): string => {
    const parentId = parentByItemId.get(itemId) ?? itemId;

    if (parentId === itemId) {
      return itemId;
    }

    const rootId = findRoot(parentId);
    parentByItemId.set(itemId, rootId);
    return rootId;
  };
  const eventItemIds = events.map((event) => {
    const candidateIds = event.sourceItemIds?.length
      ? event.sourceItemIds
      : [event.id];
    const validIds = Array.from(
      new Set(candidateIds.filter((itemId) => itemById.has(itemId))),
    );

    for (const itemId of validIds.slice(1)) {
      parentByItemId.set(findRoot(itemId), findRoot(validIds[0]!));
    }

    return { eventId: event.id, itemIds: validIds };
  });
  const itemsByRoot = new Map<string, PbsAwardItem[]>();

  for (const item of sourceItems) {
    const rootId = findRoot(item.id);
    const groupItems = itemsByRoot.get(rootId) ?? [];

    groupItems.push(item);
    itemsByRoot.set(rootId, groupItems);
  }

  const eventIdsByRoot = new Map<string, string[]>();

  for (const { eventId, itemIds } of eventItemIds) {
    if (itemIds.length === 0) {
      continue;
    }

    const rootId = findRoot(itemIds[0]!);
    const groupEventIds = eventIdsByRoot.get(rootId) ?? [];

    if (!groupEventIds.includes(eventId)) {
      groupEventIds.push(eventId);
      eventIdsByRoot.set(rootId, groupEventIds);
    }
  }

  return Array.from(itemsByRoot.entries()).map(([rootId, groupItems]) => {
    const calendarEventIds = eventIdsByRoot.get(rootId) ?? [];
    const id = calendarEventIds[0] ?? groupItems[0]!.id;

    return {
      id,
      sourceItemIds: groupItems.map((item) => item.id),
      calendarEventIds,
      item: mapItem(mergeRosterItems(id, groupItems)),
    };
  });
};

export const mapAwardResponseToPageData = (response: PbsAwardCurrentResponse): AwardPageData => {
  if (!response.rpStart || !response.rpEnd) {
    throw new Error("Award roster period range is unavailable.");
  }

  const calendarCells = markWeekendCells(buildAwardCalendarCells(response.rpStart, response.rpEnd));
  const weekCount = Math.max(1, Math.ceil(calendarCells.length / DAYS_PER_WEEK));
  const calendarHeight = Math.max(weekCount * CALENDAR_CELL_HEIGHT, AWARD_CALENDAR_MIN_HEIGHT);
  const calendarCellHeight = Math.ceil(calendarHeight / weekCount);
  const items = response.items.map(mapItem);
  const rosterGroups = buildRosterGroups(response.calendar.events, response.items);
  const hasMissingCredit = items.some((item) => item.creditMissingReason);

  return {
    title: "AWARD RESULTS",
    rosterPeriodId: response.rosterPeriodId ?? null,
    periodCode: response.periodCode,
    published: response.published,
    availability: response.availability ?? (response.published ? "AVAILABLE" : "PUBLISH_PENDING"),
    awardPublishAt: response.awardPublishAt ?? null,
    awardFinalAt: response.awardFinalAt ?? null,
    misAwardDeadlineAt: response.misAwardDeadlineAt ?? null,
    lifecycleStage: response.lifecycleStage,
    upcomingPeriod: response.upcomingPeriod ?? null,
    latestPublishedAt: response.latestPublishedAt ?? null,
    timeZone: response.timeZone,
    report: response.reasonReport,
    summary: {
      period: formatPeriodRange(response.rpStart, response.rpEnd),
      duties: String(items.length),
      daysOff: String(response.summary.offDays),
      pairings: String(response.summary.pairingCount),
      creditHours: formatMissingAwareMinutes(response.summary.creditMinutes, hasMissingCredit ? "missing" : null),
      blockHours: formatMinutes(sumNullableMinutes(items.map((item) => item.blockMinutes))),
    },
    calendar: {
      monthLabel: response.calendar.monthLabel,
      weekdayLabels: response.calendar.weekdayLabels,
      calendarCells,
      calendarSegments: buildAwardCalendarSegments(response.calendar.events, calendarCells),
      calendarCellHeight,
      calendarHeight: calendarCellHeight * weekCount,
    },
    items,
    rosterGroups,
    warnings: response.summary.warnings,
  };
};
