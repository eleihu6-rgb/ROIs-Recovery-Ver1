import { CalendarDaysIcon, XMarkIcon } from "@heroicons/react/24/outline";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { listPbsPeriodDates } from "../../../../../packages/contracts/pbs-prefer-off.js";
import { cn } from "@/shared/lib/cn";

type PreferOffCalendarPickerProps = {
  calendarLabel?: string;
  clearLabel?: string;
  density?: "compact" | "default" | "filter";
  disabled?: boolean;
  mode: "multiple" | "range" | "single";
  openLabel?: string;
  periodCode: string;
  periodEndDate?: string;
  periodStartDate?: string;
  rangeFrom?: string;
  rangeTo?: string;
  removeDateLabel?: (date: string) => string;
  selectedDate?: string;
  selectedDates?: string[];
  onRangeChange?: (from: string, to: string) => void;
  onSelectedDateChange?: (date: string) => void;
  onSelectedDatesChange?: (dates: string[]) => void;
};

type PopoverPosition = {
  left: number;
  maxHeight: number;
  scale: number;
  top: number;
};

const CALENDAR_WIDTH = 320;
const CALENDAR_HEIGHT = 344;
const VIEWPORT_MARGIN = 12;
const DAY_MS = 86_400_000;
const WEEKDAY_LABELS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), Math.max(min, max));

const getVisualScale = (element: HTMLElement): number => {
  const layoutWidth = element.offsetWidth;

  if (layoutWidth <= 0) {
    return 1;
  }

  const rect = element.getBoundingClientRect();
  const scale = rect.width / layoutWidth;

  return Number.isFinite(scale) && scale > 0 ? scale : 1;
};

const getMonthCells = (periodDates: string[]): Array<{ date: string; day: number; inPeriod: boolean }> => {
  const firstDate = periodDates[0];

  if (!firstDate) {
    return [];
  }

  const first = new Date(`${firstDate}T00:00:00.000Z`);
  const start = new Date(first.getTime() - first.getUTCDay() * DAY_MS);
  const periodDateSet = new Set(periodDates);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start.getTime() + index * DAY_MS);
    const isoDate = date.toISOString().slice(0, 10);

    return {
      date: isoDate,
      day: date.getUTCDate(),
      inPeriod: periodDateSet.has(isoDate),
    };
  });
};

const getMonthTitle = (periodDates: string[]): string => {
  const firstDate = periodDates[0];

  if (!firstDate) {
    return "Bid period unavailable";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(`${firstDate}T00:00:00.000Z`));
};

export const PreferOffCalendarPicker = ({
  calendarLabel = "Prefer Off calendar",
  clearLabel = "Clear Prefer Off dates",
  density = "default",
  disabled = false,
  mode,
  openLabel = "Open Prefer Off calendar",
  periodEndDate = "",
  periodStartDate = "",
  rangeFrom = "",
  rangeTo = "",
  removeDateLabel = (date) => `Remove Prefer Off date ${date}`,
  selectedDate = "",
  selectedDates = [],
  onRangeChange,
  onSelectedDateChange,
  onSelectedDatesChange,
}: PreferOffCalendarPickerProps) => {
  const anchorRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<PopoverPosition>({
    left: 0,
    maxHeight: CALENDAR_HEIGHT,
    scale: 1,
    top: 0,
  });
  const periodDates = useMemo(
    () => listPbsPeriodDates(periodStartDate, periodEndDate),
    [periodEndDate, periodStartDate],
  );
  const cells = useMemo(() => getMonthCells(periodDates), [periodDates]);
  const selectedDateSet = useMemo(() => new Set(selectedDates), [selectedDates]);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    const rect = anchor?.getBoundingClientRect();

    if (!anchor || !rect) {
      return;
    }

    const scale = getVisualScale(anchor);
    const visualWidth = CALENDAR_WIDTH * scale;
    const visualHeight = CALENDAR_HEIGHT * scale;
    const gap = 6 * scale;
    const left = clamp(rect.left, VIEWPORT_MARGIN, window.innerWidth - visualWidth - VIEWPORT_MARGIN);
    const belowTop = rect.bottom + gap;
    const aboveTop = rect.top - visualHeight - gap;
    const top = belowTop + visualHeight <= window.innerHeight - VIEWPORT_MARGIN
      ? belowTop
      : aboveTop >= VIEWPORT_MARGIN
        ? aboveTop
        : clamp(belowTop, VIEWPORT_MARGIN, window.innerHeight - visualHeight - VIEWPORT_MARGIN);
    const availableVisualHeight = Math.max(
      window.innerHeight - top - VIEWPORT_MARGIN,
      160 * scale,
    );
    const maxHeight = Math.min(CALENDAR_HEIGHT, availableVisualHeight / scale);

    setPosition({ left, maxHeight, scale, top });
  }, []);

  const openPicker = () => {
    if (disabled || periodDates.length === 0) {
      return;
    }

    updatePosition();
    setIsOpen(true);
  };

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (!(target instanceof Node)
        || anchorRef.current?.contains(target)
        || popoverRef.current?.contains(target)) {
        return;
      }

      setIsOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [isOpen, updatePosition]);

  const selectDate = (date: string) => {
    if (mode === "single") {
      onSelectedDateChange?.(date);
      setIsOpen(false);
      return;
    }

    if (mode === "multiple") {
      const nextDates = selectedDateSet.has(date)
        ? selectedDates.filter((item) => item !== date)
        : [...selectedDates, date].sort();
      onSelectedDatesChange?.(nextDates);
      return;
    }

    if (!rangeFrom || rangeTo) {
      onRangeChange?.(date, "");
      return;
    }

    onRangeChange?.(
      date < rangeFrom ? date : rangeFrom,
      date < rangeFrom ? rangeFrom : date,
    );
    setIsOpen(false);
  };

  const clear = () => {
    if (mode === "single") {
      onSelectedDateChange?.("");
    } else if (mode === "multiple") {
      onSelectedDatesChange?.([]);
    } else {
      onRangeChange?.("", "");
    }
  };

  const hasValue = mode === "single" ? Boolean(selectedDate) : mode === "multiple" ? selectedDates.length > 0 : Boolean(rangeFrom || rangeTo);
  const triggerDensityClass = density === "compact"
    ? "h-[25px] gap-1 rounded-xl px-1.5"
    : density === "filter"
      ? "h-8 gap-1.5 rounded-md px-2"
      : "min-h-10 gap-2 rounded-lg px-3 py-1.5";
  const valueGapClass = density === "compact" ? "gap-1" : density === "filter" ? "gap-1.5" : "gap-1.5";
  const rangeClass = density === "compact"
    ? "gap-1 [font-size:var(--text-3xs,0.5625rem)] [line-height:var(--text-3xs--line-height,0.75rem)]"
    : density === "filter"
      ? "gap-2 text-xs leading-4"
      : "gap-3 text-sm";
  const clearButtonClass = density === "compact" ? "h-4 w-4 rounded-xl" : density === "filter" ? "h-5 w-5 rounded-md" : "h-6 w-6 rounded-md";
  const clearIconClass = density === "compact" ? "h-2.5 w-2.5" : "h-3.5 w-3.5";
  const openButtonClass = density === "compact" ? "h-4 w-4 rounded-xl" : density === "filter" ? "h-5 w-5 rounded-md" : "h-6 w-6 rounded-md";
  const openIconClass = density === "compact" ? "h-3 w-3" : "h-4 w-4";
  const calendar = isOpen
    ? createPortal(
        <div
          ref={popoverRef}
          className="fixed z-[90] w-[320px] overflow-y-auto rounded-xl border border-[#dfe4ee] bg-white p-4 shadow-[0_18px_50px_rgb(20_24_38_/_18%)]"
          data-testid="prefer-off-calendar-popover"
          style={{
            left: position.left,
            maxHeight: position.maxHeight,
            top: position.top,
            transform: `scale(${position.scale})`,
            transformOrigin: "top left",
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mb-3 flex items-center justify-between">
            <p className="m-0 text-sm font-bold leading-5 text-[#303543]">{getMonthTitle(periodDates)}</p>
            {mode === "range" && rangeFrom && !rangeTo ? (
              <span className="text-xs font-semibold text-[#6866cc]">Select an end date</span>
            ) : null}
          </div>
          <div className="grid grid-cols-7 gap-1 pb-2 text-center text-2xs font-bold leading-4 text-[#8d93a5]">
            {WEEKDAY_LABELS.map((weekday) => <span key={weekday}>{weekday}</span>)}
          </div>
          <div aria-label={calendarLabel} className="grid grid-cols-7 gap-1" role="grid">
            {cells.map((cell) => {
              const isSelected = mode === "multiple"
                ? selectedDateSet.has(cell.date)
                : mode === "single"
                  ? cell.date === selectedDate
                  : cell.date === rangeFrom || cell.date === rangeTo;
              const isInRange = mode === "range"
                && Boolean(rangeFrom && rangeTo)
                && cell.date > rangeFrom
                && cell.date < rangeTo;

              return (
                <button
                  key={cell.date}
                  aria-label={`Select ${cell.date}`}
                  aria-pressed={isSelected ? "true" : "false"}
                  className={cn(
                    "inline-flex h-8 items-center justify-center rounded-lg border text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8f93ff]",
                    !cell.inPeriod
                      ? "cursor-not-allowed border-transparent bg-transparent text-[#c8ced9]"
                      : isSelected
                        ? "cursor-pointer border-[#6866cc] bg-[#6866cc] text-white"
                        : isInRange
                          ? "cursor-pointer border-[#d8d7fb] bg-[#efefff] text-[#5653b4]"
                          : "cursor-pointer border-transparent bg-white text-[#303543] hover:border-[#9a98e5] hover:bg-[#f4f3ff]",
                  )}
                  disabled={!cell.inPeriod}
                  role="gridcell"
                  type="button"
                  onClick={() => selectDate(cell.date)}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div>
      <div
        ref={anchorRef}
        className={cn(
          "flex items-center border bg-white transition focus-within:border-[#7774d7] focus-within:ring-2 focus-within:ring-[#7774d7]/15",
          triggerDensityClass,
          disabled ? "cursor-not-allowed border-[#e3e7ee] bg-[#f5f7fa]" : "border-[#cfd6e4]",
        )}
        data-density={density}
        onClick={openPicker}
      >
        <div className={cn(
          "flex min-w-0 flex-1 flex-wrap items-center",
          valueGapClass,
        )}>
          {mode === "multiple" ? selectedDates.map((date) => (
            <span
              key={date}
              className="inline-flex h-7 items-center gap-1 rounded-md bg-[#eff0fb] px-2 text-xs font-semibold text-[#5653b4]"
            >
              {date}
              <button
                aria-label={removeDateLabel(date)}
                className="inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded text-[#7774d7] hover:bg-white"
                disabled={disabled}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectedDatesChange?.(selectedDates.filter((item) => item !== date));
                }}
              >
                <XMarkIcon className="h-3 w-3" />
              </button>
            </span>
          )) : null}
          {mode === "multiple" && selectedDates.length === 0 ? (
            <span className="text-sm font-medium text-[#9aa1af]">Select dates</span>
          ) : null}
          {mode === "single" ? (
            <span className={selectedDate ? "text-sm font-semibold text-[#303543]" : "text-sm font-medium text-[#9aa1af]"}>
              {selectedDate || "Select date"}
            </span>
          ) : null}
          {mode === "range" ? (
            <div className={cn(
              "grid w-full grid-cols-[1fr_auto_1fr] items-center font-semibold",
              rangeClass,
            )}>
              <span className={cn("whitespace-nowrap", rangeFrom ? "text-[#303543]" : "text-[#9aa1af]")}>{rangeFrom || "Start date"}</span>
              <span className={cn(
                "font-bold text-[#9aa1af]",
                density === "compact" ? "[font-size:var(--text-3xs,0.5625rem)]" : "text-xs",
              )}>TO</span>
              <span className={cn("whitespace-nowrap", rangeTo ? "text-[#303543]" : "text-[#9aa1af]")}>{rangeTo || "End date"}</span>
            </div>
          ) : null}
        </div>
        {hasValue ? (
          <button
            aria-label={clearLabel}
            className={cn(
              "inline-flex cursor-pointer items-center justify-center text-[#8d93a5] hover:bg-[#f0f2f6] hover:text-[#5653b4]",
              clearButtonClass,
            )}
            disabled={disabled}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              clear();
            }}
          >
            <XMarkIcon className={clearIconClass} />
          </button>
        ) : null}
        <button
          aria-label={openLabel}
          className={cn(
            "inline-flex cursor-pointer items-center justify-center text-[#6f7485] hover:text-[#5653b4] disabled:cursor-not-allowed disabled:opacity-45",
            openButtonClass,
          )}
          disabled={disabled}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            openPicker();
          }}
        >
          <CalendarDaysIcon className={openIconClass} />
        </button>
      </div>
      {calendar}
    </div>
  );
};
