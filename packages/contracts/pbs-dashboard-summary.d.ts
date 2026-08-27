import type { PbsComputedPeriodStage } from "./pbs-current-period.js";
import type { PbsDashboardUserProfile } from "./pbs-dashboard-profile.js";

export declare const pbsDashboardSummaryRoutes: {
  readonly current: "/dashboard/summary";
};

export type PbsDashboardBidPackage = {
  rosterPeriodId: number;
  rpStartLocal: string;
  rpEndLocal: string;
  periodCode: string;
  businessNow: string;
  timezoneLabel: string;
  bidStartAt: string | null;
  bidCloseAt: string | null;
  bidStartLabel: string | null;
  bidCloseLabel: string | null;
  remainingLabel: string | null;
  computedStage: PbsComputedPeriodStage;
  targetedLine: number | null;
  targetedReserve: number | null;
  totalBidder: number | null;
};

export type PbsDashboardMessageCenter = {
  title: "MESSAGE CENTER";
  baseLineAverage: string | null;
  preAssignments: {
    totalDuties: number;
    daysTouched: number;
    categories: Array<{
      code: string;
      label: string;
      count: number;
    }>;
    details: Array<{
      id: string;
      type: "pairing" | "ground";
      code: string;
      label: string;
      startDate: string;
      endDate: string;
      timeText: string | null;
    }>;
  };
  fleetItems: Array<{
    fleet: string;
    subFleet: string | null;
    pairingCount?: number;
  }>;
  messages: Array<{
    id: string;
    title: string;
    body: string;
  }>;
};

export type PbsDashboardSummary = {
  profile: PbsDashboardUserProfile;
  bidPackage: PbsDashboardBidPackage;
  messageCenter: PbsDashboardMessageCenter;
};
