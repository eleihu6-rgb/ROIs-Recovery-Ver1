import { useMemo } from "react";
import { cn } from "@/shared/lib/cn";
import type { MonthGridCalendarEntry } from "@/shared/components/calendar/types";

type MonthGridCalendarProps = {
  year: number;
  month: number;
  entries?: Record<string, MonthGridCalendarEntry>;
  selectedDate?: string;
  todayDate?: string;
  weekdayLabels?: string[];
  onSelectDate?: (isoDate: string) => void;
};

type CalendarCell = {
  key: string;
  isoDate: string;
  day: number;
  month: number;
  year: number;
  inCurrentMonth: boolean;
  monthLabel: string;
  entry?: MonthGridCalendarEntry;
};

const DEFAULT_WEEKDAY_LABELS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
});

const buildCalendarCells = (
  year: number,
  month: number,
  entries: Record<string, MonthGridCalendarEntry>,
) => {
  const firstDay = new Date(year, month - 1, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
  const startDate = new Date(year, month - 1, 1 - startOffset);

  return Array.from({ length: totalCells }, (_, index) => {
    const currentDate = new Date(startDate);
    currentDate.setDate(startDate.getDate() + index);

    const cellYear = currentDate.getFullYear();
    const cellMonth = currentDate.getMonth() + 1;
    const cellDay = currentDate.getDate();
    const isoDate = `${cellYear}-${String(cellMonth).padStart(2, "0")}-${String(cellDay).padStart(2, "0")}`;
    const inCurrentMonth = cellMonth === month && cellYear === year;
    const showMonthLabel = index === 0 || cellDay === 1;

    return {
      key: isoDate,
      isoDate,
      year: cellYear,
      month: cellMonth,
      day: cellDay,
      inCurrentMonth,
      monthLabel: showMonthLabel ? monthFormatter.format(currentDate).toUpperCase() : "",
      entry: entries[isoDate],
    } satisfies CalendarCell;
  });
};

export const MonthGridCalendar = ({
  year,
  month,
  entries = {},
  selectedDate = "",
  todayDate = "",
  weekdayLabels = DEFAULT_WEEKDAY_LABELS,
  onSelectDate,
}: MonthGridCalendarProps) => {
  const calendarCells = useMemo(
    () => buildCalendarCells(year, month, entries),
    [entries, month, year],
  );

  return (
    <div className="min-w-0">
      <div className="grid grid-cols-7 border-b border-[#e8edf5] text-sm leading-[18px] text-[#9ea5b3]">
        {weekdayLabels.map((weekday) => (
          <span key={weekday} className="px-[12px] pb-[12px] text-center">
            {weekday}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7" role="grid" aria-label="Month grid calendar">
        {calendarCells.map((cell) => {
          const isSelected = selectedDate === cell.isoDate;
          const isToday = todayDate === cell.isoDate;
          const isHighlighted = Boolean(cell.entry?.highlighted);
          const valueToneClass = !cell.inCurrentMonth
            ? "text-[#d0d4de]"
            : isHighlighted || isSelected
              ? "text-[#706cd5]"
              : "text-[#303543]";

          return (
            <div
              key={cell.key}
              aria-label={cell.isoDate}
              className={cn(
                "relative flex h-[85px] flex-col border-b border-r border-[#e8edf5] px-[10px] pt-[7px] first:border-l",
                cell.inCurrentMonth ? "bg-white" : "bg-[#fcfdff]",
              )}
              data-highlighted={isHighlighted ? "true" : "false"}
              data-iso-date={cell.isoDate}
              data-selected={isSelected ? "true" : "false"}
              data-today={isToday ? "true" : "false"}
              role="gridcell"
            >
              <div className="flex items-start justify-between text-xs leading-[15px]">
                <span className={cell.inCurrentMonth ? "text-[#9ea5b3]" : "text-[#d0d4de]"}>
                  {cell.monthLabel}
                </span>
                <div className="relative flex items-center justify-center">
                  {!isToday ? (
                    <span className={cell.inCurrentMonth ? "font-semibold text-[#4d4f5c]" : "text-[#d0d4de]"}>
                      {String(cell.day).padStart(2, "0")}
                    </span>
                  ) : (
                    <span className="absolute -right-[10px] -top-[8px] inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#706cd5] px-[4px] text-2xs font-semibold leading-none text-white">
                      {cell.day}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-1 items-center justify-center pb-[8px]">
                {cell.inCurrentMonth && onSelectDate ? (
                  <button
                    aria-label={`Select ${cell.isoDate}`}
                    aria-pressed={isSelected ? "true" : "false"}
                    className={cn(
                      "min-w-[32px] rounded-xl px-[6px] py-[2px] text-xl font-semibold leading-[28px] transition-colors",
                      valueToneClass,
                    )}
                    type="button"
                    onClick={() => onSelectDate(cell.isoDate)}
                  >
                    {cell.entry?.value || ""}
                  </button>
                ) : (
                  <span className={cn("text-xl font-semibold leading-[28px]", valueToneClass)}>
                    {cell.inCurrentMonth ? cell.entry?.value || "" : ""}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
