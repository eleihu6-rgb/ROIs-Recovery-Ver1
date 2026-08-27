import { useMemo } from "react";
import { cn } from "@/shared/lib/cn";

type AwardMiniCalendarProps = {
  month: number;
  year?: number;
  highlightedDays?: number[];
  weekdayLabels?: string[];
};

const DEFAULT_WEEKDAY_LABELS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

type AwardMiniCalendarCell = {
  key: string;
  day: number;
  inCurrentMonth: boolean;
};

const buildAwardMiniCalendarCells = (year: number, month: number) => {
  const firstDay = new Date(year, month - 1, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
  const startDate = new Date(year, month - 1, 1 - startOffset);

  return Array.from({ length: totalCells }, (_, index) => {
    const currentDate = new Date(startDate);
    currentDate.setDate(startDate.getDate() + index);
    const cellMonth = currentDate.getMonth() + 1;
    const day = currentDate.getDate();

    return {
      key: `${year}-${String(cellMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      day,
      inCurrentMonth: cellMonth === month,
    } satisfies AwardMiniCalendarCell;
  });
};

export const AwardMiniCalendar = ({
  month,
  year = new Date().getFullYear(),
  highlightedDays = [],
  weekdayLabels = DEFAULT_WEEKDAY_LABELS,
}: AwardMiniCalendarProps) => {
  const cells = useMemo(() => buildAwardMiniCalendarCells(year, month), [month, year]);

  return (
    <div className="w-[318px] rounded-2xl border border-[#e9edf4] bg-white px-[18px] pb-[14px] pt-[12px]">
      <div className="grid grid-cols-7 gap-x-[10px] pb-[10px] text-center text-xs font-medium leading-[15px] text-[#9ca3b2]">
        {weekdayLabels.map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-x-[10px] gap-y-[10px]" role="grid" aria-label="Award month calendar">
        {cells.map((cell) => {
          const isHighlighted = cell.inCurrentMonth && highlightedDays.includes(cell.day);

          return (
            <span
              key={cell.key}
              aria-label={isHighlighted ? `Day ${cell.day} highlighted` : `Day ${cell.day}`}
              className={cn(
                "inline-flex h-[29px] w-[29px] items-center justify-center rounded-lg border text-sm font-medium leading-4",
                isHighlighted
                  ? "border-[#6f6cd3] bg-[#6f6cd3] text-white"
                  : cell.inCurrentMonth
                    ? "border-[#e4e8f0] bg-white text-[#7f8392]"
                    : "border-[#edf1f6] bg-[#fcfdff] text-[#d3d7df]",
              )}
              role="gridcell"
            >
              {String(cell.day).padStart(2, "0")}
            </span>
          );
        })}
      </div>
    </div>
  );
};
