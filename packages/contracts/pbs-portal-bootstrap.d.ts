import type { PbsBiddingCalendarCurrentResponse } from "./pbs-bidding-calendar.js";
import type { PbsDashboardUserProfile } from "./pbs-dashboard-profile.js";
import type { PbsLineholderCurrentSummaryResponse } from "./pbs-lineholder-summary.js";

export declare const pbsPortalBootstrapRoutes: {
  readonly current: "/portal/bootstrap";
};

export type PbsPortalBootstrapResponse = {
  profile: PbsDashboardUserProfile;
  biddingCalendar: PbsBiddingCalendarCurrentResponse;
  lineholderSummary: PbsLineholderCurrentSummaryResponse;
};
