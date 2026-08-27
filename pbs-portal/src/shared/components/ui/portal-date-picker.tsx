import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEventHandler,
} from "react";
import { createPortal } from "react-dom";
import { IsoDateInput } from "@/shared/components/ui/iso-date-input";
import { cn } from "@/shared/lib/cn";

type PortalDatePickerProps = {
  ariaLabel: string;
  className?: string;
  defaultMonth?: string;
  disabled?: boolean;
  value: string;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  onValueChange: (value: string) => void;
};

type CalendarMonth = {
  monthIndex: number;
  year: number;
};

type CalendarCell = {
  day: number;
  inCurrentMonth: boolean;
  isoDate: string;
  key: string;
};

type PopoverPosition = {
  left: number;
  maxHeight: number;
  scale: number;
  top: number;
};

const DATE_PICKER_WIDTH = 288;
const DATE_PICKER_HEIGHT = 324;
const VIEWPORT_MARGIN = 12;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_MONTH_PATTERN = /^(\d{4})-(\d{2})$/;
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY_LABELS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

const getVisualScale = (element: HTMLElement): number => {
  const layoutWidth = element.offsetWidth;

  if (layoutWidth <= 0) {
    return 1;
  }

  const rect = element.getBoundingClientRect();
  const scale = rect.width / layoutWidth;

  return Number.isFinite(scale) && scale > 0 ? scale : 1;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), Math.max(min, max));

const formatIsoDate = (year: number, monthIndex: number, day: number): string =>
  `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const getDaysInMonth = (year: number, monthIndex: number): number =>
  new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

const parseIsoDate = (value: string): (CalendarMonth & { day: number }) | null => {
  const match = value.match(ISO_DATE_PATTERN);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);

  if (monthIndex < 0 || monthIndex > 11 || day < 1 || day > getDaysInMonth(year, monthIndex)) {
    return null;
  }

  return { day, monthIndex, year };
};

const parseMonth = (value?: string): CalendarMonth | null => {
  if (!value) {
    return null;
  }

  const date = parseIsoDate(value);

  if (date) {
    return { monthIndex: date.monthIndex, year: date.year };
  }

  const monthMatch = value.match(ISO_MONTH_PATTERN);

  if (!monthMatch) {
    return null;
  }

  const monthIndex = Number(monthMatch[2]) - 1;

  if (monthIndex < 0 || monthIndex > 11) {
    return null;
  }

  return { monthIndex, year: Number(monthMatch[1]) };
};

const getInitialMonth = (value: string, defaultMonth?: string): CalendarMonth => {
  const parsedValue = parseMonth(value);

  if (parsedValue) {
    return parsedValue;
  }

  const parsedDefaultMonth = parseMonth(defaultMonth);

  if (parsedDefaultMonth) {
    return parsedDefaultMonth;
  }

  const now = new Date();
  return { monthIndex: now.getMonth(), year: now.getFullYear() };
};

const buildCalendarCells = ({ monthIndex, year }: CalendarMonth): CalendarCell[] => {
  const firstDayOffset = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const startDay = 1 - firstDayOffset;

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(Date.UTC(year, monthIndex, startDay + index));
    const cellYear = date.getUTCFullYear();
    const cellMonthIndex = date.getUTCMonth();
    const day = date.getUTCDate();
    const isoDate = formatIsoDate(cellYear, cellMonthIndex, day);

    return {
      day,
      inCurrentMonth: cellYear === year && cellMonthIndex === monthIndex,
      isoDate,
      key: isoDate,
    };
  });
};

const shiftMonth = ({ monthIndex, year }: CalendarMonth, offset: number): CalendarMonth => {
  const date = new Date(Date.UTC(year, monthIndex + offset, 1));

  return { monthIndex: date.getUTCMonth(), year: date.getUTCFullYear() };
};

const getDateButtonLabel = (isoDate: string): string => {
  const parsedDate = parseIsoDate(isoDate);

  if (!parsedDate) {
    return `Select ${isoDate}`;
  }

  return `Select ${MONTH_LABELS[parsedDate.monthIndex]} ${parsedDate.day}, ${parsedDate.year}`;
};

export const PortalDatePicker = ({
  ariaLabel,
  className,
  defaultMonth,
  disabled = false,
  value,
  onKeyDown,
  onValueChange,
}: PortalDatePickerProps) => {
  const anchorRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState<CalendarMonth>(() => getInitialMonth(value, defaultMonth));
  const [position, setPosition] = useState<PopoverPosition>({
    left: 0,
    maxHeight: DATE_PICKER_HEIGHT,
    scale: 1,
    top: 0,
  });
  const cells = useMemo(() => buildCalendarCells(visibleMonth), [visibleMonth]);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    const rect = anchor?.getBoundingClientRect();

    if (!anchor || !rect) {
      return;
    }

    const scale = getVisualScale(anchor);
    const visualWidth = DATE_PICKER_WIDTH * scale;
    const visualHeight = DATE_PICKER_HEIGHT * scale;
    const gap = 6 * scale;
    const left = clamp(
      rect.left,
      VIEWPORT_MARGIN,
      window.innerWidth - visualWidth - VIEWPORT_MARGIN,
    );
    const belowTop = rect.bottom + gap;
    const aboveTop = rect.top - visualHeight - gap;
    const hasSpaceBelow = belowTop + visualHeight <= window.innerHeight - VIEWPORT_MARGIN;
    const hasSpaceAbove = aboveTop >= VIEWPORT_MARGIN;
    const top = hasSpaceBelow
      ? belowTop
      : hasSpaceAbove
        ? aboveTop
        : clamp(belowTop, VIEWPORT_MARGIN, window.innerHeight - visualHeight - VIEWPORT_MARGIN);
    const availableVisualHeight = Math.max(
      window.innerHeight - top - VIEWPORT_MARGIN,
      160 * scale,
    );
    const maxHeight = Math.min(DATE_PICKER_HEIGHT, availableVisualHeight / scale);

    setPosition({ left, maxHeight, scale, top });
  }, []);

  const openPicker = useCallback(() => {
    if (disabled) {
      return;
    }

    setVisibleMonth(getInitialMonth(value, defaultMonth));
    setIsOpen(true);
  }, [defaultMonth, disabled, value]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (anchorRef.current?.contains(target) || popoverRef.current?.contains(target)) {
        return;
      }

      setIsOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);

    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [isOpen]);

  const handleInputKeyDown: KeyboardEventHandler<HTMLInputElement> = (event) => {
    if (event.key === "Escape") {
      setIsOpen(false);
      return;
    }

    onKeyDown?.(event);
  };

  const monthTitle = `${MONTH_LABELS[visibleMonth.monthIndex].toUpperCase()} ${visibleMonth.year}`;

  const picker = isOpen
    ? createPortal(
      <div
        ref={popoverRef}
        className="fixed z-[90] w-[288px] overflow-y-auto rounded-2xl border border-[#dfe4ee] bg-white p-3 shadow-[0_18px_50px_rgb(20_24_38_/_18%)]"
        data-testid="portal-date-picker-popover"
        style={{
          left: position.left,
          maxHeight: position.maxHeight,
          top: position.top,
          transform: `scale(${position.scale})`,
          transformOrigin: "top left",
        }}
      >
        <div className="mb-3 flex items-center justify-between">
          <button
            aria-label="Previous month"
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-[#d8dde6] bg-white text-[#6f7485] transition hover:bg-[#f4f6fb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8f93ff]"
            type="button"
            onClick={() => setVisibleMonth((current) => shiftMonth(current, -1))}
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <p className="m-0 text-sm font-bold leading-5 text-[#303543]">{monthTitle}</p>
          <button
            aria-label="Next month"
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-[#d8dde6] bg-white text-[#6f7485] transition hover:bg-[#f4f6fb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8f93ff]"
            type="button"
            onClick={() => setVisibleMonth((current) => shiftMonth(current, 1))}
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 pb-2 text-center text-2xs font-bold leading-4 text-[#8d93a5]">
          {WEEKDAY_LABELS.map((weekday) => (
            <span key={weekday}>{weekday}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1" role="grid" aria-label={`${ariaLabel} calendar`}>
          {cells.map((cell) => {
            const isSelected = value === cell.isoDate;

            return (
              <button
                key={cell.key}
                aria-label={getDateButtonLabel(cell.isoDate)}
                aria-pressed={isSelected ? "true" : "false"}
                className={cn(
                  "inline-flex h-8 cursor-pointer items-center justify-center rounded-lg border text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8f93ff]",
                  isSelected
                    ? "border-[#6866cc] bg-[#6866cc] text-white"
                    : cell.inCurrentMonth
                      ? "border-[#e4e8f0] bg-white text-[#303543] hover:border-[#9a98e5] hover:bg-[#f4f3ff]"
                      : "border-[#edf1f6] bg-[#fcfdff] text-[#c6ccd8] hover:border-[#d8dde6]",
                )}
                role="gridcell"
                type="button"
                onClick={() => {
                  onValueChange(cell.isoDate);
                  setIsOpen(false);
                }}
              >
                {String(cell.day).padStart(2, "0")}
              </button>
            );
          })}
        </div>
      </div>,
      document.body,
    )
    : null;

  return (
    <div ref={anchorRef} className="relative">
      <IsoDateInput
        aria-label={ariaLabel}
        className={cn("pr-10", className)}
        disabled={disabled}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onClick={openPicker}
        onKeyDown={handleInputKeyDown}
      />
      <button
        aria-label={`Open date picker for ${ariaLabel}`}
        className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent p-0 text-[#6f7485] transition hover:text-[#6866cc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8f93ff] disabled:cursor-not-allowed disabled:opacity-45"
        disabled={disabled}
        type="button"
        onClick={openPicker}
      >
        <CalendarDaysIcon className="h-4 w-4" />
      </button>
      {picker}
    </div>
  );
};
