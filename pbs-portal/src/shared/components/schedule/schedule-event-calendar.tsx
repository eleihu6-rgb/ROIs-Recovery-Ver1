import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useScaledPageCanvasPortalTarget } from "@/shared/components/layout/scaled-page-canvas";
import {
  convertScheduleActionPopoverPlacementToPortal,
  resolveScheduleActionPopoverPlacement,
} from "@/shared/components/schedule/schedule-action-popover-position";
import { cn } from "@/shared/lib/cn";
import type {
  ScheduleCalendarCell,
  ScheduleCalendarEvent,
  ScheduleCalendarMetricBadge,
  ScheduleCalendarEventTone,
} from "@/shared/components/schedule/types";

type ScheduleEventCalendarProps = {
  contentMinWidth?: number;
  density?: "regular" | "compact";
  calendarHeight?: number;
  calendarCellHeight?: number;
  weekdayLabels: string[];
  calendarCells: ScheduleCalendarCell[];
  calendarEvents: ScheduleCalendarEvent[];
  activeDates?: string[];
  actionPopover?: ScheduleCalendarActionPopover | null;
  dateActionLabel?: (isoDate: string) => string;
  onToggleDate?: (isoDate: string, anchor: ScheduleCalendarActionAnchor) => void;
  onSelectWeekday?: (weekdayIndex: number, weekdayLabel: string, anchor: ScheduleCalendarActionAnchor) => void;
  onEventSelect?: (event: ScheduleCalendarEvent) => void;
};

const DAYS_PER_WEEK = 7;
const CALENDAR_CELL_HEIGHT = 103;
const CALENDAR_EVENT_SIDE_OFFSET = 4;
const ACTION_POPOVER_WIDTH = 260;
const WEEKDAY_LABEL_HEIGHT = 18;
const WEEKDAY_TO_CALENDAR_GAP = 12;
const ACTION_POPOVER_GAP = 8;
const ACTION_POPOVER_EDGE_PADDING = 8;

type PortalPopoverPosition = {
  left: number;
  maxHeight: number;
  top: number;
};

export type ScheduleCalendarActionAnchor =
  | {
    type: "cell";
    row: number;
    col: number;
  }
  | {
    type: "weekday";
    col: number;
  }
  | {
    type: "center";
  };

export type ScheduleCalendarActionPopover = {
  anchor: ScheduleCalendarActionAnchor;
  tierLabel: string;
  description: string;
  content?: ReactNode;
  confirmLabel: string;
  confirmDisabled?: boolean;
  confirmPending?: boolean;
  confirmPendingLabel?: string;
  cancelDisabled?: boolean;
  width?: number;
  onConfirm: () => void;
  onCancel: () => void;
};

const eventToneClassMap: Record<ScheduleCalendarEventTone, string> = {
  blue: "bg-[#4FCFED]",
  green: "bg-[#3DC0A9]",
  yellow: "bg-[#F5B507]",
};

const calendarCellClassName = "group/schedule-cell relative border border-[#EBEBEB] bg-white px-1 pt-1";
const compactCalendarCellClassName = "group/schedule-cell relative border border-[#EBEBEB] bg-white px-1 pt-0.5";
const editableCalendarOverlayClassName = "absolute inset-0 z-10 cursor-pointer appearance-none border-0 bg-transparent p-0 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#706cd5]";
const weekdayActionClassName = "cursor-pointer appearance-none border-0 bg-transparent p-0 text-sm font-normal leading-[18px] text-[#6f7485] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#706cd5]";
const compactWeekdayActionClassName = "cursor-pointer appearance-none border-0 bg-transparent p-0 text-xs font-normal leading-4 text-[#6f7485] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#706cd5]";
const calendarMetricBadgeGroupClassName = "pointer-events-none absolute bottom-1 left-1/2 z-30 flex -translate-x-1/2 flex-col items-stretch gap-0 overflow-hidden rounded-sm shadow-[0_1px_2px_rgba(40,45,60,0.14)]";
const calendarMetricBadgeBaseClassName = "pointer-events-none inline-flex h-3 min-w-16 items-center justify-center px-1 text-center font-mono font-bold leading-none text-white tabular-nums whitespace-nowrap [font-size:var(--text-3xs,0.5625rem)]";
const calendarMetricBadgeZoomClassName = "pointer-events-none absolute bottom-6 left-1/2 z-40 hidden -translate-x-1/2 flex-col items-stretch gap-0 overflow-hidden rounded shadow-[0_8px_18px_rgba(40,45,60,0.22)] group-hover/schedule-cell:flex group-focus-within/schedule-cell:flex";
const calendarMetricBadgeZoomRowClassName = "pointer-events-none inline-flex h-5 min-w-24 items-center justify-center px-2 text-center font-mono text-xs font-normal leading-none text-white tabular-nums whitespace-nowrap before:content-[attr(data-metric-label)]";

const formatCssNumber = (value: number) =>
  Number.isInteger(value) ? `${value}` : `${Number(value.toFixed(3))}`;

const getMetricBadgeToneClassName = (metricBadge: ScheduleCalendarMetricBadge): string => {
  if (metricBadge.numerator > metricBadge.denominator) {
    return "bg-[#D94C4C]";
  }

  if (metricBadge.numerator === metricBadge.denominator) {
    return "bg-[#F5B507]";
  }

  return "bg-[#3DC0A9]";
};

const getMetricBadgeText = (metricBadge: ScheduleCalendarMetricBadge): string =>
  `${metricBadge.label} ${metricBadge.numerator}/${metricBadge.denominator}`;

const getVisualScale = (element: HTMLElement): number => {
  const rect = element.getBoundingClientRect();
  const widthScale = element.offsetWidth > 0 ? rect.width / element.offsetWidth : 0;
  const heightScale = element.offsetHeight > 0 ? rect.height / element.offsetHeight : 0;

  return widthScale || heightScale || 1;
};

const getActionPopoverLeft = (col: number, popoverWidth: number) => {
  const centerPercent = formatCssNumber(((col - 0.5) / DAYS_PER_WEEK) * 100);
  const halfWidth = formatCssNumber(popoverWidth / 2);

  return [
    `clamp(${ACTION_POPOVER_EDGE_PADDING}px,`,
    `calc(${centerPercent}% - ${halfWidth}px),`,
    `calc(100% - ${popoverWidth + ACTION_POPOVER_EDGE_PADDING}px))`,
  ].join(" ");
};

export const ScheduleEventCalendar = ({
  contentMinWidth,
  density = "regular",
  calendarHeight = 515,
  calendarCellHeight = CALENDAR_CELL_HEIGHT,
  weekdayLabels,
  calendarCells,
  calendarEvents,
  activeDates = [],
  actionPopover,
  dateActionLabel = (isoDate) => `Toggle day off for ${isoDate}`,
  onToggleDate,
  onSelectWeekday,
  onEventSelect,
}: ScheduleEventCalendarProps) => {
  const calendarWeeks: ScheduleCalendarCell[][] = [];
  const activeDateSet = new Set(activeDates);
  const isCompact = density === "compact";
  const calendarRootRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const portalTarget = useScaledPageCanvasPortalTarget();
  const [portalPopoverPosition, setPortalPopoverPosition] = useState<PortalPopoverPosition | null>(null);

  for (let index = 0; index < calendarCells.length; index += DAYS_PER_WEEK) {
    calendarWeeks.push(calendarCells.slice(index, index + DAYS_PER_WEEK));
  }

  const getEventStyle = (event: ScheduleCalendarEvent) => ({
    left: `calc(${event.colStart - 1} * (100% / ${DAYS_PER_WEEK}) + ${CALENDAR_EVENT_SIDE_OFFSET}px)`,
    top: `${(event.row - 1) * calendarCellHeight + event.top}px`,
    width: `calc(${event.colSpan} * (100% / ${DAYS_PER_WEEK}) - ${CALENDAR_EVENT_SIDE_OFFSET * 2}px)`,
  });

  const getActionPopoverStyle = (anchor: ScheduleCalendarActionAnchor, popoverWidth = ACTION_POPOVER_WIDTH) => {
    if (anchor.type === "center") {
      return {
        left: "50%",
        top: `${Math.max(120, calendarHeight / 2)}px`,
        transform: "translate(-50%, -50%)",
      };
    }

    if (anchor.type === "weekday") {
      const top = `-${WEEKDAY_LABEL_HEIGHT + WEEKDAY_TO_CALENDAR_GAP + ACTION_POPOVER_GAP}px`;

      return {
        left: getActionPopoverLeft(anchor.col, popoverWidth),
        top,
        transform: "translateY(-100%)",
      };
    }

    if (anchor.row <= 1) {
      return {
        left: getActionPopoverLeft(anchor.col, popoverWidth),
        top: `${calendarCellHeight + ACTION_POPOVER_GAP}px`,
      };
    }

    return {
      left: getActionPopoverLeft(anchor.col, popoverWidth),
      top: `${(anchor.row - 1) * calendarCellHeight - ACTION_POPOVER_GAP}px`,
      transform: "translateY(-100%)",
    };
  };

  const widthStyle = contentMinWidth ? { minWidth: `${contentMinWidth}px` } : undefined;
  const handleActionPopoverOutsideClick = (): void => {
    if (!actionPopover || actionPopover.cancelDisabled) {
      return;
    }

    actionPopover.onCancel();
  };

  useLayoutEffect(() => {
    if (!actionPopover || !portalTarget) {
      setPortalPopoverPosition(null);
      return undefined;
    }

    const updatePosition = (): void => {
      const calendarRoot = calendarRootRef.current;
      const popover = popoverRef.current;
      const boundary = calendarRoot?.closest<HTMLElement>('[data-uiid="dashboard-schedule-panel"]')
        ?? portalTarget;

      if (!calendarRoot || !popover) {
        return;
      }

      const anchor = actionPopover.anchor.type === "cell"
        ? calendarRoot.querySelector<HTMLElement>(
          `[data-schedule-cell-row="${actionPopover.anchor.row}"][data-schedule-cell-col="${actionPopover.anchor.col}"]`,
        )
        : actionPopover.anchor.type === "weekday"
          ? calendarRoot.parentElement?.querySelector<HTMLElement>(
            `[data-schedule-weekday-col="${actionPopover.anchor.col}"]`,
          ) ?? null
          : boundary;

      if (!anchor) {
        return;
      }

      const portalRect = portalTarget.getBoundingClientRect();
      const scale = getVisualScale(portalTarget);
      const placement = resolveScheduleActionPopoverPlacement({
        anchorRect: anchor.getBoundingClientRect(),
        boundaryRect: boundary.getBoundingClientRect(),
        popoverRect: popover.getBoundingClientRect(),
        preferredDirection: actionPopover.anchor.type === "center"
          ? "center"
          : actionPopover.anchor.type === "weekday"
            ? "up"
            : "down",
      });
      const nextPosition = convertScheduleActionPopoverPlacementToPortal({
        placement,
        portalRect,
        scale,
      });

      setPortalPopoverPosition((currentPosition) =>
        currentPosition
        && Math.abs(currentPosition.left - nextPosition.left) < 0.5
        && Math.abs(currentPosition.top - nextPosition.top) < 0.5
        && Math.abs(currentPosition.maxHeight - nextPosition.maxHeight) < 0.5
          ? currentPosition
          : nextPosition);
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(updatePosition);
    const boundary = calendarRootRef.current?.closest<HTMLElement>('[data-uiid="dashboard-schedule-panel"]');

    [popoverRef.current, calendarRootRef.current, boundary, portalTarget].forEach((element) => {
      if (element) {
        resizeObserver?.observe(element);
      }
    });

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      resizeObserver?.disconnect();
    };
  }, [actionPopover, portalTarget]);

  const actionPopoverLayer = actionPopover ? (
    <>
      <button
        aria-label="Close calendar action popover"
        className={cn(
          "inset-0 z-[25] cursor-default appearance-none border-0 bg-transparent p-0",
          portalTarget ? "pointer-events-auto absolute" : "fixed",
        )}
        data-testid="schedule-action-popover-dismiss"
        tabIndex={-1}
        type="button"
        onClick={handleActionPopoverOutsideClick}
      />
      <div
        ref={popoverRef}
        className="pointer-events-auto absolute z-30 flex flex-col overflow-hidden rounded-3xl border border-[#d8dde6] bg-white px-4 py-3 shadow-[0_16px_40px_rgba(45,49,66,0.14)]"
        data-testid="schedule-action-popover"
        style={portalTarget
          ? {
            left: portalPopoverPosition?.left ?? 0,
            maxHeight: portalPopoverPosition?.maxHeight,
            top: portalPopoverPosition?.top ?? 0,
            visibility: portalPopoverPosition ? "visible" : "hidden",
            width: `${actionPopover.width ?? ACTION_POPOVER_WIDTH}px`,
          }
          : {
            width: `${actionPopover.width ?? ACTION_POPOVER_WIDTH}px`,
            ...getActionPopoverStyle(actionPopover.anchor, actionPopover.width),
          }}
      >
        <p className="shrink-0 text-xs font-semibold uppercase tracking-[0.04em] text-[#6f7485]">
          {actionPopover.tierLabel}
        </p>
        <p className="mt-1 shrink-0 text-sm font-medium leading-5 text-[#40424f]">
          {actionPopover.description}
        </p>
        {actionPopover.content ? (
          <div className="mt-3 min-h-0 flex-1 overflow-hidden">
            {actionPopover.content}
          </div>
        ) : null}
        <div className="mt-3 flex shrink-0 flex-wrap justify-end gap-2">
          <button
            className="h-[30px] cursor-pointer rounded-lg border border-[#d8dde6] bg-white px-3 text-xs font-medium text-[#7f8392] hover:bg-[#f8f9fb] disabled:cursor-not-allowed disabled:opacity-55"
            disabled={actionPopover.cancelDisabled}
            type="button"
            onClick={actionPopover.onCancel}
          >
            Cancel
          </button>
          <button
            className="h-[30px] cursor-pointer rounded-lg bg-[#706cd5] px-3 text-xs font-semibold text-white hover:bg-[#615ec1] disabled:cursor-not-allowed disabled:bg-[#b8b6e8]"
            disabled={actionPopover.confirmDisabled || actionPopover.confirmPending}
            type="button"
            onClick={actionPopover.onConfirm}
          >
            {actionPopover.confirmPending
              ? actionPopover.confirmPendingLabel ?? actionPopover.confirmLabel
              : actionPopover.confirmLabel}
          </button>
        </div>
      </div>
    </>
  ) : null;

  return (
    <>
      <ol
        aria-label="Weekday labels"
        className={cn(
          "grid grid-cols-7 text-[#6f7485]",
          isCompact ? "mt-3 text-xs leading-4" : "mt-6 text-sm leading-[18px]",
        )}
        style={widthStyle}
      >
        {weekdayLabels.map((weekDay, index) => (
          <li key={weekDay} className="list-none text-center" data-schedule-weekday-col={index + 1}>
            {onSelectWeekday ? (
              <button
                aria-label={`Add day off bids for ${weekDay}`}
                className={isCompact ? compactWeekdayActionClassName : weekdayActionClassName}
                type="button"
                onClick={() => onSelectWeekday(index, weekDay, { type: "weekday", col: index + 1 })}
              >
                {weekDay}
              </button>
            ) : weekDay}
          </li>
        ))}
      </ol>

      <div
        ref={calendarRootRef}
        className={isCompact ? "relative mt-2" : "relative mt-3"}
        style={{ ...widthStyle, minHeight: `${calendarHeight}px` }}
      >
        <div aria-label="Schedule calendar cells">
          {calendarWeeks.map((week, weekIndex) => (
            <section key={`week-${weekIndex + 1}`} className="grid grid-cols-7">
              {week.map((cell, dayIndex) => {
                const canToggleCell = Boolean(onToggleDate && cell.isoDate && !cell.muted);
                const metricBadges = cell.muted ? [] : cell.metricBadges ?? [];

                return (
                  <article
                    key={`${weekIndex + 1}-${cell.isoDate || cell.monthLabel || ""}-${cell.day}`}
                    className={cn(
                      isCompact ? compactCalendarCellClassName : calendarCellClassName,
                      canToggleCell ? "cursor-pointer" : "",
                      cell.weekend && !cell.muted ? "bg-[#F8FBFD]" : "",
                      cell.muted ? "bg-[#FDFCFF]" : "",
                    )}
                    data-schedule-cell-col={dayIndex + 1}
                    data-schedule-cell-row={weekIndex + 1}
                    style={{ height: `${calendarCellHeight}px` }}
                  >
                    {canToggleCell ? (
                      <button
                        aria-label={dateActionLabel(cell.isoDate!)}
                        aria-pressed={activeDateSet.has(cell.isoDate!) ? "true" : "false"}
                        className={editableCalendarOverlayClassName}
                        type="button"
                        onClick={() => onToggleDate!(cell.isoDate!, {
                          type: "cell",
                          row: weekIndex + 1,
                          col: dayIndex + 1,
                        })}
                      />
                    ) : null}
                    <header className="flex justify-between text-xs leading-[15px]">
                      <p className={cell.muted ? "text-[#ACAEB9]" : "text-[#6f7485]"}>
                        {cell.monthLabel || ""}
                      </p>
                      <time className={cell.muted ? "text-[#ACAEB9]" : "font-semibold text-[#282c3b]"} dateTime={cell.isoDate || cell.day}>
                        {cell.day}
                      </time>
                    </header>
                    {metricBadges.length > 0 ? (
                      <div
                        className={calendarMetricBadgeGroupClassName}
                        data-metric-badge-count={metricBadges.length}
                        data-testid="schedule-calendar-metric-badge-group"
                      >
                        {metricBadges.map((metricBadge) => (
                          <span
                            key={metricBadge.type}
                            aria-label={metricBadge.ariaLabel}
                            className={cn(calendarMetricBadgeBaseClassName, getMetricBadgeToneClassName(metricBadge))}
                          >
                            {getMetricBadgeText(metricBadge)}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {metricBadges.length > 0 ? (
                      <div
                        aria-hidden="true"
                        className={calendarMetricBadgeZoomClassName}
                        data-testid="schedule-calendar-metric-badge-zoom"
                      >
                        {metricBadges.map((metricBadge) => (
                          <span
                            key={metricBadge.type}
                            className={cn(calendarMetricBadgeZoomRowClassName, getMetricBadgeToneClassName(metricBadge))}
                            data-metric-label={getMetricBadgeText(metricBadge)}
                            data-testid="schedule-calendar-metric-badge-zoom-row"
                          />
                        ))}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </section>
          ))}
        </div>

        <ol aria-label="Schedule calendar events" className="pointer-events-none absolute inset-0 z-20">
          {calendarEvents.map((event) => {
            const canSelectEvent = Boolean(onEventSelect && event.selectable);

            return (
              <li
                key={`${event.sourceEvent?.id ?? event.label}-${event.row}-${event.colStart}-${event.top}`}
                className={cn(
                  "absolute h-[22px] list-none rounded-sm text-center text-sm font-semibold leading-[18px] text-white",
                  canSelectEvent ? "pointer-events-auto" : "",
                  eventToneClassMap[event.tone],
                )}
                style={getEventStyle(event)}
              >
                {canSelectEvent ? (
                  <button
                    aria-label={event.ariaLabel ?? `View calendar event ${event.label}`}
                    className="h-full w-full cursor-pointer appearance-none border-0 bg-transparent p-0 text-center text-sm font-semibold leading-[18px] text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#282c3b]"
                    type="button"
                    onClick={() => onEventSelect!(event)}
                  >
                    <span className="inline-block pt-[2px]">{event.label}</span>
                  </button>
                ) : (
                  <p className="inline-block pt-[2px]">{event.label}</p>
                )}
              </li>
            );
          })}
        </ol>

        {actionPopoverLayer && !portalTarget ? actionPopoverLayer : null}
      </div>
      {actionPopoverLayer && portalTarget
        ? createPortal(actionPopoverLayer, portalTarget)
        : null}
    </>
  );
};
