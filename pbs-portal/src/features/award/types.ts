import type { ScheduleCalendarCell, ScheduleCalendarEventTone } from "@/shared/components/schedule/types";
import type {
  PbsAwardCurrentResponse,
  PbsAwardItem,
  PbsAwardLeg,
} from "../../../../packages/contracts/pbs-award-results.js";

export type AwardSummaryData = {
  period: string;
  duties: string;
  daysOff: string;
  pairings: string;
  creditHours: string;
  blockHours: string;
};

export type AwardDetailRow = {
  label: string;
  value: string;
};

export type AwardDisplayLeg = PbsAwardLeg & {
  blockLabel: string;
  creditLabel: string;
};

export type AwardDisplayItem = Omit<PbsAwardItem, "legs"> & {
  dateRangeLabel: string;
  timeRangeLabel: string;
  creditLabel: string;
  blockLabel: string;
  tafbLabel: string;
  routeLabel: string;
  dataNotices: string[];
  legs: AwardDisplayLeg[];
};

export type AwardCalendarSegment = {
  id: string;
  sourceEventId: string;
  row: number;
  startOffset: number;
  endOffset: number;
  startMinuteIndex: number;
  endMinuteIndex: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
  lane: number;
  laneCount: number;
  label: string;
  tone: ScheduleCalendarEventTone;
  conflict: boolean;
  ariaLabel: string;
  title: string;
};

export type AwardRosterGroup = {
  id: string;
  sourceItemIds: string[];
  calendarEventIds: string[];
  item: AwardDisplayItem;
};

export type AwardPageData = {
  title: string;
  rosterPeriodId: number | null;
  periodCode: string;
  published: boolean;
  availability: NonNullable<PbsAwardCurrentResponse["availability"]>;
  awardPublishAt: string | null;
  awardFinalAt: string | null;
  misAwardDeadlineAt: string | null;
  lifecycleStage: PbsAwardCurrentResponse["lifecycleStage"];
  upcomingPeriod: PbsAwardCurrentResponse["upcomingPeriod"];
  latestPublishedAt: string | null;
  timeZone: PbsAwardCurrentResponse["timeZone"];
  report: PbsAwardCurrentResponse["reasonReport"];
  summary: AwardSummaryData;
  calendar: {
    monthLabel: string;
    weekdayLabels: string[];
    calendarCells: ScheduleCalendarCell[];
    calendarSegments: AwardCalendarSegment[];
    calendarCellHeight: number;
    calendarHeight: number;
  };
  items: AwardDisplayItem[];
  rosterGroups: AwardRosterGroup[];
  warnings: string[];
};
