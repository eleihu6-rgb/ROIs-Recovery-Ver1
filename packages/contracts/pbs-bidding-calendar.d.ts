import type { PbsCurrentPeriod } from "./pbs-current-period.js";

export declare const pbsBiddingCalendarRoutes: {
  readonly current: "/bidding-calendar/current";
};

export type PbsBiddingCalendarEventType =
  | "prefer_off_bid"
  | "pairing_bid"
  | "planned_absence"
  | "weekend";

export type PbsBiddingCalendarEventTone =
  | "green"
  | "blue"
  | "yellow"
  | "muted";

export type PbsBiddingCalendarEventSource =
  | "pbs_bid_group"
  | "live_pairing"
  | "live_roster"
  | "computed";

export type PbsBiddingCalendarEvent = {
  id: string;
  type: PbsBiddingCalendarEventType;
  tier?: string;
  label: string;
  startDate: string;
  endDate: string;
  tone: PbsBiddingCalendarEventTone;
  source: PbsBiddingCalendarEventSource;
  readonly: boolean;
  metadata?: Record<string, string | number | boolean | null>;
};

export type PbsBiddingCalendarDayOffCapacity = {
  date: string;
  requestedDayOffCount: number;
  totalCrewCount: number;
  pairingDemandCount: number;
  reserveDemandCount: number;
  preAssignedDayOffCount: number;
  maxDaysOffCount: number;
};

export type PbsBiddingCalendarCurrentResponse = {
  currentPeriod?: PbsCurrentPeriod;
  periodCode: string;
  bidContext: "Current";
  activeTierRange: string[];
  events: PbsBiddingCalendarEvent[];
  dayOffCapacity?: PbsBiddingCalendarDayOffCapacity[];
  warnings?: string[];
};
