import type {
  PbsDashboardUserProfile,
} from "../../../../packages/contracts/pbs-dashboard-profile.js";

export type DashboardProfileActor = {
  crewId: string;
  rosterPeriodKey?: string;
};

export interface PbsDashboardProfileService {
  getCurrentProfile: (actor: DashboardProfileActor) => Promise<PbsDashboardUserProfile>;
}
