import type {
  ScheduleCalendarCell,
  ScheduleCalendarEvent,
  ScheduleCalendarEventTone,
  ScheduleTierRow,
  ScheduleTierTone,
  SchedulePanelData
} from '@/shared/components/schedule/types';

export type DashboardHeaderItem = {
  key: string;
  label: string;
  path?: string;
  active?: boolean;
};

export type DashboardInfoRow = {
  label: string;
  value: string;
  highlight?: boolean;
};

export type DashboardInfoGrid = {
  headers: string[][];
  values: string[][];
};

export type DashboardMessageItem = {
  fleet: string;
  subFleet: string | null;
  pairingCount?: number;
};

export type DashboardPreAssignmentCategory = {
  code: string;
  label: string;
  count: number;
};

export type DashboardPreAssignmentItem = {
  id: string;
  type: "pairing" | "ground";
  code: string;
  label: string;
  dateText: string;
  timeText: string | null;
};

export type DashboardPreAssignmentData = {
  totalDuties: number;
  daysTouched: number;
  categories: DashboardPreAssignmentCategory[];
  details: DashboardPreAssignmentItem[];
};

export type TierTone = ScheduleTierTone;
export type TierRow = ScheduleTierRow;
export type CalendarCell = ScheduleCalendarCell;
export type CalendarEventTone = ScheduleCalendarEventTone;
export type CalendarEvent = ScheduleCalendarEvent;
export type DashboardScheduleData = SchedulePanelData;

export type DashboardUserPanelData = {
  name: string;
  email: string;
  bidInfoTitle: string;
  bidInfoRows: DashboardInfoRow[];
  userInfoTitle: string;
  userInfoGrid: DashboardInfoGrid;
};

export type DashboardMessagePanelData = {
  title: string;
  baseLineAverage: string;
  preAssignments: DashboardPreAssignmentData;
  items: DashboardMessageItem[];
};
