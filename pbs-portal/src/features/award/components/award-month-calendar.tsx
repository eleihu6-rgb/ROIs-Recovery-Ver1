import type { CSSProperties } from "react";
import type { AwardCalendarSegment, AwardPageData } from "@/features/award/types";

type AwardMonthCalendarProps = {
  calendar: AwardPageData["calendar"];
  selectedEventIds: string[];
  onSelectEvent: (eventId: string) => void;
};

const DAYS_PER_WEEK = 7;
const CELL_HEADER_HEIGHT = 24;
const SEGMENT_HORIZONTAL_INSET = 4;
const SEGMENT_HEIGHT = 22;
const MIN_SEGMENT_WIDTH = 14;
const LANE_GAP = 4;

const toneClassMap: Record<AwardCalendarSegment["tone"], string> = {
  blue: "bg-[#4FCFED]",
  green: "bg-[#3DC0A9]",
  yellow: "bg-[#F5B507]",
};

const formatCssNumber = (value: number) =>
  Number.isInteger(value) ? `${value}` : `${Number(value.toFixed(3))}`;

const getSegmentVisibleLabel = (label: string): string => {
  const detailStart = label.search(/\s(?:\d{2}:\d{2}|continues\b|until\b|[A-Z][a-z]{2}\s\d{2}\b)/);

  return detailStart > 0 ? label.slice(0, detailStart) : label;
};

const getSegmentStyle = (
  segment: AwardCalendarSegment,
  calendarCellHeight: number,
): CSSProperties => {
  const startPercent = (segment.startOffset / DAYS_PER_WEEK) * 100;
  const widthPercent = ((segment.endOffset - segment.startOffset) / DAYS_PER_WEEK) * 100;
  const rowTop = (segment.row - 1) * calendarCellHeight;
  const segmentTop = rowTop + CELL_HEADER_HEIGHT + 6 + segment.lane * (SEGMENT_HEIGHT + LANE_GAP);
  const startInset = segment.continuesBefore ? 0 : SEGMENT_HORIZONTAL_INSET;
  const endInset = segment.continuesAfter ? 0 : SEGMENT_HORIZONTAL_INSET;

  return {
    left: `calc(${formatCssNumber(startPercent)}% + ${startInset}px)`,
    top: `${formatCssNumber(segmentTop)}px`,
    width: `max(${MIN_SEGMENT_WIDTH}px, calc(${formatCssNumber(widthPercent)}% - ${startInset + endInset}px))`,
    height: `${SEGMENT_HEIGHT}px`,
  };
};

export const AwardMonthCalendar = ({
  calendar,
  selectedEventIds,
  onSelectEvent,
}: AwardMonthCalendarProps) => {
  const calendarWeeks = [];

  for (let index = 0; index < calendar.calendarCells.length; index += DAYS_PER_WEEK) {
    calendarWeeks.push(calendar.calendarCells.slice(index, index + DAYS_PER_WEEK));
  }

  return (
    <section
      aria-label="Award month calendar"
      className="h-full min-w-0 rounded-xl border border-[#e3e9f2] bg-white px-4 pb-4 pt-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)]"
      data-testid="award-month-calendar"
    >
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-base font-bold uppercase leading-6 text-[#101a33]">
          {calendar.monthLabel} Award Calendar
        </h2>
        <div className="flex items-center gap-4 text-xs font-medium leading-[15px] text-[#6f7485]">
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#4FCFED]" />
            Pairing
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#3DC0A9]" />
            Day Off
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#F5B507]" />
            Activity / Leave
          </span>
        </div>
      </div>

      <ol aria-label="Weekday labels" className="mt-6 grid grid-cols-7 text-sm leading-[18px] text-[#6f7485]">
        {calendar.weekdayLabels.map((weekDay) => (
          <li key={weekDay} className="list-none text-center">
            {weekDay}
          </li>
        ))}
      </ol>

      <div className="relative mt-3 w-full min-w-0" style={{ minHeight: `${calendar.calendarHeight}px` }}>
        <div aria-label="Award calendar cells">
          {calendarWeeks.map((week, weekIndex) => (
            <section key={`week-${weekIndex + 1}`} className="grid grid-cols-7">
              {week.map((cell) => (
                <article
                  key={`${weekIndex + 1}-${cell.isoDate || cell.monthLabel || ""}-${cell.day}`}
                  className={`relative overflow-hidden border border-[#EBEBEB] bg-white px-1 pt-1 ${
                    cell.weekend && !cell.muted ? "bg-[#F8FBFD]" : ""
                  } ${cell.muted ? "bg-[#FDFCFF]" : ""}`}
                  style={{ height: `${calendar.calendarCellHeight}px` }}
                >
                  <header className="relative z-10 flex justify-between text-xs leading-[15px]">
                    <p className={cell.muted ? "text-[#ACAEB9]" : "text-[#6f7485]"}>
                      {cell.monthLabel || ""}
                    </p>
                    <time className={cell.muted ? "text-[#ACAEB9]" : "font-semibold text-[#282c3b]"} dateTime={cell.isoDate || cell.day}>
                      {cell.day}
                    </time>
                  </header>
                </article>
              ))}
            </section>
          ))}
        </div>

        <ol aria-label="Award calendar time segments" className="absolute inset-0 z-20 list-none">
          {calendar.calendarSegments.map((segment) => (
            <li
              key={segment.id}
              aria-label={segment.ariaLabel}
              className={`absolute overflow-hidden text-white ${
                toneClassMap[segment.tone]
              } ${segment.continuesBefore ? "" : "rounded-l-sm"} ${
                segment.continuesAfter ? "" : "rounded-r-sm"
              } ${
                segment.conflict
                  ? "ring-2 ring-[#d83030] ring-offset-1"
                  : selectedEventIds.includes(segment.sourceEventId)
                  ? "ring-2 ring-[#2e91e5] ring-offset-1"
                  : ""
              }`}
              data-conflict={segment.conflict ? "true" : "false"}
              data-continues-after={segment.continuesAfter ? "true" : "false"}
              data-continues-before={segment.continuesBefore ? "true" : "false"}
              data-end-offset={formatCssNumber(segment.endOffset)}
              data-start-offset={formatCssNumber(segment.startOffset)}
              data-testid="award-calendar-time-segment"
              style={getSegmentStyle(segment, calendar.calendarCellHeight)}
              title={segment.title}
            >
              <button
                aria-label={segment.ariaLabel}
                aria-pressed={selectedEventIds.includes(segment.sourceEventId)}
                className="h-full w-full cursor-pointer overflow-hidden bg-transparent px-1 text-center text-sm font-semibold leading-[18px] text-white focus-visible:outline-none"
                type="button"
                onClick={() => onSelectEvent(segment.sourceEventId)}
              >
                <span className="inline-block max-w-full truncate pt-0.5">
                  {getSegmentVisibleLabel(segment.label)}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
};
