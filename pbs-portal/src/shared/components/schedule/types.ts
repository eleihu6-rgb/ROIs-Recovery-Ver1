export type ScheduleTierTone = "blue" | "green" | "red" | "yellow" | "empty";

export type ScheduleTierRow = {
  label: string;
  active?: boolean;
  cells: ScheduleTierTone[];
};

export type ScheduleCalendarCell = {
  monthLabel?: string;
  day: string;
  muted?: boolean;
  weekend?: boolean;
  isoDate?: string;
  metricBadges?: ScheduleCalendarMetricBadge[];
  dayOffCapacity?: {
    requestedDayOffCount: number;
    totalCrewCount: number;
    pairingDemandCount: number;
    reserveDemandCount: number;
    preAssignedDayOffCount: number;
    maxDaysOffCount: number;
  };
};

export type ScheduleCalendarMetricBadge = {
  type: "days_off" | "reserve";
  label: "DO" | "RES";
  numerator: number;
  denominator: number;
  ariaLabel: string;
};

export type ScheduleCalendarEventTone = "blue" | "green" | "yellow";

export type ScheduleCalendarSourceEvent = {
  id: string;
  type: string;
  tier?: string;
  label: string;
  startDate: string;
  endDate: string;
  readonly: boolean;
  metadata?: Record<string, string | number | boolean | null>;
};

export type ScheduleCalendarEvent = {
  row: number;
  colStart: number;
  colSpan: number;
  top: number;
  label: string;
  tone: ScheduleCalendarEventTone;
  ariaLabel?: string;
  selectable?: boolean;
  sourceEvent?: ScheduleCalendarSourceEvent;
};

export type SchedulePanelData = {
  title: string;
  monthLabel: string;
  dayLabels: string[];
  tierRows: ScheduleTierRow[];
  weekdayLabels: string[];
  calendarCells: ScheduleCalendarCell[];
  calendarEvents: ScheduleCalendarEvent[];
};
