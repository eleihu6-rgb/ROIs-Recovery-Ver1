import type {
  PbsBiddingCalendarCurrentResponse,
} from "../../../../packages/contracts/pbs-bidding-calendar.js";
import type { LineholderDraftActor } from "../lineholder/shared.js";

export interface PbsBiddingCalendarService {
  getCurrentCalendar: (actor: LineholderDraftActor) => Promise<PbsBiddingCalendarCurrentResponse>;
}
