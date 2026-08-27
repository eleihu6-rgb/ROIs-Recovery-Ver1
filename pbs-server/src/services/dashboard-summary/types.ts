import type {
  PbsDashboardSummary,
} from "../../../../packages/contracts/pbs-dashboard-summary.js";
import type { LineholderDraftActor } from "../lineholder/shared.js";

export type DashboardSummaryActor = LineholderDraftActor;

export interface PbsDashboardSummaryService {
  getCurrentSummary: (actor: DashboardSummaryActor) => Promise<PbsDashboardSummary>;
}
