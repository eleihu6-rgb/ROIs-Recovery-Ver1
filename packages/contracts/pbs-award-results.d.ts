import type { PbsCurrentPeriod } from "./pbs-current-period.js";

export declare const pbsAwardRoutes: {
  readonly current: "/award/current";
  readonly periods: "/award/periods";
  readonly periodById: (rosterPeriodId: number) => string;
};

export declare const PBS_AWARD_COMMENT_PREFIX: "PBS_AWARD_";
export declare const PBS_AWARD_EXPLANATION_V1_PREFIX: "PBS_AWARD_V1|";

export declare const isReservedPbsAwardComment: (value: unknown) => boolean;
export declare const parsePbsAwardExplanationComment: (value: unknown) => string | null;
export declare const isPbsAwardExplanationComment: (value: unknown) => boolean;

export type PbsAwardItemType = "pairing" | "day_off" | "activity";

export type PbsAwardAvailability = "AVAILABLE" | "PUBLISH_PENDING" | "SCHEDULED" | "UNCONFIGURED";

export type PbsAwardLifecycleStage =
  | "UNCONFIGURED"
  | "SCHEDULED"
  | "PUBLISH_PENDING"
  | "PUBLISHED"
  | "FINAL"
  | "MIS_AWARD_CLOSED";

export type PbsAwardPeriodSummary = {
  rosterPeriodId: number;
  periodCode: string;
  rpStart: string;
  rpEnd: string;
  lifecycleStage: PbsAwardLifecycleStage;
  awardPublishAt: string;
  awardFinalAt: string;
  misAwardDeadlineAt: string;
  firstPublishedAt: string;
  latestPublishedAt: string;
};

export type PbsAwardPeriodListResponse = {
  periods: PbsAwardPeriodSummary[];
};

export type PbsAwardUpcomingPeriod = {
  rosterPeriodId: number;
  periodCode: string;
  rpStart: string;
  rpEnd: string;
  lifecycleStage: PbsAwardLifecycleStage;
  awardPublishAt: string | null;
  awardFinalAt: string | null;
  misAwardDeadlineAt: string | null;
};

export type PbsAwardEventTone = "blue" | "green" | "yellow";

export type PbsAwardTimeZoneInfo = {
  base: string | null;
  zoneId: string;
  timezoneLabel: string;
  fallback: boolean;
};

export type PbsAwardCalendarEvent = {
  id: string;
  type: PbsAwardItemType;
  label: string;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  tone: PbsAwardEventTone;
  readonly: true;
  sourceItemIds?: string[];
  metadata?: Record<string, string | number | boolean | null>;
};

export type PbsAwardLeg = {
  id: string;
  dutySeq?: number | null;
  segmentSeq?: number | null;
  day: string;
  flightNumber: string | null;
  deadhead: boolean;
  depAirport: string | null;
  arrAirport: string | null;
  depTime: string | null;
  arrTime: string | null;
  blockMinutes: number | null;
  creditMinutes: number | null;
  equipment: string | null;
  equipmentMissing?: boolean;
};

export type PbsAwardItem = {
  id: string;
  type: PbsAwardItemType;
  label: string;
  pairingId: string | null;
  pairingCode: string | null;
  assignment: string | null;
  assignmentGroup: string | null;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  base: string | null;
  fleet: string | null;
  position: string | null;
  matchedTier: string | null;
  awardPriority: string | null;
  explanation: string | null;
  creditMinutes: number | null;
  creditMissingReason?: string | null;
  blockMinutes: number | null;
  tafbDays: number | null;
  legEquipmentMissingReason?: string | null;
  legs: PbsAwardLeg[];
};

export type PbsAwardReasonReportItem = {
  id: string;
  kind: "awarded_pairing";
  pairingId: string;
  pairingCode: string;
  startDate: string;
  endDate: string;
  explanation: string;
};

export type PbsAwardReasonReport = {
  available: boolean;
  disabledReason?: string;
  items: PbsAwardReasonReportItem[];
};

export type PbsAwardCurrentResponse = {
  currentPeriod?: PbsCurrentPeriod;
  rosterPeriodId?: number | null;
  periodCode: string;
  published: boolean;
  availability?: PbsAwardAvailability;
  lifecycleStage?: PbsAwardLifecycleStage;
  upcomingPeriod?: PbsAwardUpcomingPeriod | null;
  rpStart?: string | null;
  rpEnd?: string | null;
  awardPublishAt?: string | null;
  awardFinalAt?: string | null;
  misAwardDeadlineAt?: string | null;
  firstPublishedAt?: string | null;
  latestPublishedAt?: string | null;
  timeZone: PbsAwardTimeZoneInfo;
  summary: {
    tier: string | null;
    offDays: number;
    creditMinutes: number | null;
    premiumMinutes: number | null;
    pairingCount: number;
    activityCount: number;
    warnings: string[];
  };
  calendar: {
    monthLabel: string;
    weekdayLabels: string[];
    events: PbsAwardCalendarEvent[];
  };
  items: PbsAwardItem[];
  reasonReport: PbsAwardReasonReport;
};
