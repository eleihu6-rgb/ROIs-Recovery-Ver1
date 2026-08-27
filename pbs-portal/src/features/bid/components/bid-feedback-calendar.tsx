import { useMemo } from "react";
import type { CSSProperties } from "react";
import type { PbsBidFeedbackDayOff, PbsBidFeedbackPairing } from "../../../../../packages/contracts/pbs-bid-feedback.js";
import { cn } from "@/shared/lib/cn";

type CalendarCell = {
  day: string;
  isoDate: string;
  muted: boolean;
};

type CalendarEvent = {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  tone: "pairing" | "day-off";
  ineligible: boolean;
};

type CalendarSegment = CalendarEvent & {
  lane: number;
  startOffset: number;
  endOffset: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
};

type CalendarWeek = {
  index: number;
  cells: CalendarCell[];
  segments: CalendarSegment[];
  laneCount: number;
  height: number;
  weekStartMinute: number;
  weekEndMinute: number;
};

const MINUTES_PER_DAY = 1_440;
const DAY_MS = 86_400_000;
const DAYS_PER_WEEK = 7;
const MIN_WEEK_HEIGHT = 92;
const HEADER_HEIGHT = 24;
const SEGMENT_HEIGHT = 20;
const LANE_GAP = 3;
const SEGMENT_TOP_OFFSET = 5;
const WEEK_PADDING_BOTTOM = 8;
const WEEKDAY_LABELS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

const parseIsoDateMs = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed)) return null;

  return new Date(parsed).toISOString().slice(0, 10) === value ? parsed : null;
};

const formatIsoDate = (value: number) => new Date(value).toISOString().slice(0, 10);

const startOfMondayWeek = (value: number) => {
  const day = new Date(value).getUTCDay();
  const mondayOffset = (day + 6) % DAYS_PER_WEEK;

  return value - mondayOffset * DAY_MS;
};

const minuteIndex = (date: string, time: string, fallback: number) => {
  const [hour, minute] = /^\d{2}:\d{2}$/.test(time) ? time.split(":").map(Number) : [0, fallback];
  const day = parseIsoDateMs(date);
  return day === null ? null : day / 60_000 + (hour ?? 0) * 60 + (minute ?? fallback);
};

const buildCalendarWeeks = (periodStart: string, periodEnd: string): CalendarWeek[] => {
  const start = parseIsoDateMs(periodStart);
  const end = parseIsoDateMs(periodEnd);

  if (start === null || end === null || start > end) return [];

  const calendarStart = startOfMondayWeek(start);
  const calendarEnd = startOfMondayWeek(end) + (DAYS_PER_WEEK - 1) * DAY_MS;
  const weeks: CalendarWeek[] = [];

  for (let weekStart = calendarStart, index = 0; weekStart <= calendarEnd; weekStart += DAYS_PER_WEEK * DAY_MS, index += 1) {
    const cells = Array.from({ length: DAYS_PER_WEEK }, (_, dayIndex) => {
      const dayMs = weekStart + dayIndex * DAY_MS;
      const isoDate = formatIsoDate(dayMs);

      return {
        day: isoDate.slice(8, 10),
        isoDate,
        muted: dayMs < start || dayMs > end,
      };
    });

    weeks.push({
      index,
      cells,
      segments: [],
      laneCount: 1,
      height: MIN_WEEK_HEIGHT,
      weekStartMinute: weekStart / 60_000,
      weekEndMinute: (weekStart + DAYS_PER_WEEK * DAY_MS) / 60_000,
    });
  }

  return weeks;
};

const buildWeekStrips = (events: CalendarEvent[], periodStart: string, periodEnd: string): CalendarWeek[] =>
  buildCalendarWeeks(periodStart, periodEnd).map((week) => {
    const rowSegments = events.flatMap((event) => {
      const start = minuteIndex(event.startDate, event.startTime, 0);
      const rawEnd = minuteIndex(event.endDate, event.endTime, MINUTES_PER_DAY);
      if (start === null || rawEnd === null) return [];
      const end = rawEnd <= start ? rawEnd + MINUTES_PER_DAY : rawEnd;
      const segmentStart = Math.max(start, week.weekStartMinute);
      const segmentEnd = Math.min(end, week.weekEndMinute);
      if (segmentStart >= segmentEnd) return [];
      return [{
        ...event,
        lane: 0,
        startOffset: (segmentStart - week.weekStartMinute) / MINUTES_PER_DAY,
        endOffset: (segmentEnd - week.weekStartMinute) / MINUTES_PER_DAY,
        continuesBefore: segmentStart > start,
        continuesAfter: segmentEnd < end,
      }];
    }).sort((left, right) => left.startOffset - right.startOffset || right.endOffset - left.endOffset);
    const laneEnds: number[] = [];
    for (const segment of rowSegments) {
      const available = laneEnds.findIndex((end) => end <= segment.startOffset);
      segment.lane = available < 0 ? laneEnds.length : available;
      laneEnds[segment.lane] = segment.endOffset;
    }

    const laneCount = Math.max(laneEnds.length, 1);

    return {
      ...week,
      segments: rowSegments,
      laneCount,
      height: Math.max(
        MIN_WEEK_HEIGHT,
        HEADER_HEIGHT + SEGMENT_TOP_OFFSET + laneCount * (SEGMENT_HEIGHT + LANE_GAP) + WEEK_PADDING_BOTTOM,
      ),
    };
  });

const segmentStyle = (segment: CalendarSegment): CSSProperties => ({
  left: `${(segment.startOffset / DAYS_PER_WEEK) * 100}%`,
  top: `${HEADER_HEIGHT + SEGMENT_TOP_OFFSET + segment.lane * (SEGMENT_HEIGHT + LANE_GAP)}px`,
  width: `${((segment.endOffset - segment.startOffset) / DAYS_PER_WEEK) * 100}%`,
  height: `${SEGMENT_HEIGHT}px`,
});

export const BidFeedbackCalendar = ({
  pairings,
  daysOff,
  periodStart,
  periodEnd,
}: {
  pairings: PbsBidFeedbackPairing[];
  daysOff: PbsBidFeedbackDayOff[];
  periodStart: string;
  periodEnd: string;
}) => {
  const events = useMemo<CalendarEvent[]>(() => [
    ...pairings.filter((pairing) => pairing.rawDirection === "award").map((pairing) => ({
      id: `pairing:${pairing.pairingId}`,
      label: pairing.pairingNumber,
      startDate: pairing.originDate,
      endDate: pairing.endDate,
      startTime: pairing.reportTime,
      endTime: pairing.releaseTime,
      tone: "pairing" as const,
      ineligible: pairing.eligibility?.status === "ineligible",
    })),
    ...daysOff.map((item) => ({
      id: `day-off:${item.date}`,
      label: `OFF ${item.tier}`,
      startDate: item.date,
      endDate: item.date,
      startTime: "00:00",
      endTime: "24:00",
      tone: "day-off" as const,
      ineligible: false,
    })),
  ], [daysOff, pairings]);
  const weeks = useMemo(() => buildWeekStrips(events, periodStart, periodEnd), [events, periodEnd, periodStart]);

  return (
    <div data-testid="bid-feedback-calendar">
      <div className="mb-2 flex items-center justify-end gap-4 text-xs text-[var(--muted-foreground)]">
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-[#4fcfed]" />Award Pairing</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-[#4fcfed] ring-2 ring-inset ring-[#d83030]" />Award Pairing, not eligible</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-[#3dc0a9]" />Days Off</span>
      </div>
      <div className="grid grid-cols-7 text-center text-xs font-semibold text-[var(--muted-foreground)]">
        {WEEKDAY_LABELS.map((day) => <span key={day} className="pb-2">{day}</span>)}
      </div>
      <div className="space-y-2">
        {weeks.map((week, weekIndex) => (
          <div
            key={week.index}
            className="relative overflow-hidden"
            data-lane-count={week.laneCount}
            data-testid="bid-feedback-calendar-week"
            data-week-index={weekIndex}
            style={{ height: `${week.height}px` }}
          >
            <div className="grid h-full grid-cols-7">
              {week.cells.map((cell, cellIndex) => (
                <div
                  key={`${week.index}:${cell.isoDate}`}
                  className={cn(
                    "border border-[var(--border)] px-2 py-1",
                    cell.muted ? "bg-[var(--muted)]/30" : "bg-[var(--background)]",
                  )}
                  data-date={cell.isoDate}
                  data-week-day-index={cellIndex}
                >
                  <span className="block text-right text-xs text-[var(--muted-foreground)]">{cell.day}</span>
                </div>
              ))}
            </div>
            {week.segments.map((segment) => (
              <div
                key={`${segment.id}:${week.index}`}
                aria-label={`${segment.label}, ${segment.startDate} ${segment.startTime} to ${segment.endDate} ${segment.endTime}`}
                className={cn(
                  "absolute z-10 overflow-hidden px-1 text-center text-xs font-semibold leading-5 text-white",
                  segment.tone === "pairing" ? "bg-[#4fcfed]" : "bg-[#3dc0a9]",
                  segment.continuesBefore ? "" : "rounded-l-sm",
                  segment.continuesAfter ? "" : "rounded-r-sm",
                  segment.ineligible ? "ring-2 ring-[#d83030] ring-inset" : "",
                )}
                data-testid="bid-feedback-calendar-segment"
                style={segmentStyle(segment)}
                title={`${segment.label} · ${segment.startDate} ${segment.startTime}–${segment.endDate} ${segment.endTime}`}
              >
                <span className="block truncate">{segment.label}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
