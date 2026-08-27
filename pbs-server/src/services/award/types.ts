import type { Pool } from "pg";
import type { drizzle } from "drizzle-orm/node-postgres";
import type {
  PbsAwardCurrentResponse,
  PbsAwardPeriodListResponse,
} from "../../../../packages/contracts/pbs-award-results.js";
import type { LineholderDraftActor } from "../lineholder/shared.js";

type Database = ReturnType<typeof drizzle>;

export interface PbsAwardResultsService {
  getCurrentAward: (actor: LineholderDraftActor) => Promise<PbsAwardCurrentResponse>;
  getAwardPeriods: (actor: LineholderDraftActor) => Promise<PbsAwardPeriodListResponse>;
  getAwardByPeriodId: (actor: LineholderDraftActor, rosterPeriodId: number) => Promise<PbsAwardCurrentResponse>;
}

export type CreatePbsAwardResultsServiceOptions = {
  db: Database;
  pgPool: Pool;
  liveSchema: string;
  pbsSchema: string;
};

export type AwardRosterRow = {
  publish_id: string | null;
  roster_id: string | null;
  crew_id: string;
  pairing_id: string | null;
  pairing_label: string | null;
  assignment_group: string | null;
  assignment: string | null;
  label: string | null;
  flt_id: string | null;
  flt_dt: string | null;
  start_utc: string | Date | null;
  end_utc: string | Date | null;
  dep_arp: string | null;
  arv_arp: string | null;
  position: string | null;
  acting_rank: string | null;
  active_rank: string | null;
  duty_seq: number | null;
  seg_seq: number | null;
  seq_order: number | null;
  sch_credit_minutes: string | number | null;
  act_credit_minutes: string | number | null;
  tafb_days: string | number | null;
  base: string | null;
  fleet: string | null;
  fleet_seg: string | null;
  comments: string | null;
  source: string | null;
  request_source: string | null;
  request_id: string | null;
};

export type AwardResultRow = {
  awarded_tier: number | string | null;
  status: string | null;
  published_at: string | Date | null;
  item_type: string | null;
  pairing_id: string | null;
  date_off: string | Date | null;
  matched_tier: number | string | null;
  rejection_reason: string | null;
};
