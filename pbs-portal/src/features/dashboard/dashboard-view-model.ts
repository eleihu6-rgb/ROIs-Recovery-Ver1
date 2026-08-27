import type { DashboardScheduleData } from "@/features/dashboard/types";

export const DASHBOARD_EMPTY_VALUE = "-";
export const DASHBOARD_WEEKDAY_LABELS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export const createEmptyDashboardScheduleData = (
  title = "BIDDING CALENDAR",
): DashboardScheduleData => ({
  title,
  monthLabel: DASHBOARD_EMPTY_VALUE,
  dayLabels: [],
  tierRows: [],
  weekdayLabels: DASHBOARD_WEEKDAY_LABELS,
  calendarCells: [],
  calendarEvents: [],
});
