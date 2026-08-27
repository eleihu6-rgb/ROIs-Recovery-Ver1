import { bigint, date, pgSchema, smallint, timestamp, varchar } from "drizzle-orm/pg-core";
import { env } from "../../config/index.js";

const pbsSchema = pgSchema(env.PBS_SCHEMA);

export const pbsAwardItem = pbsSchema.table("pbs_award_item", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar("created_by", { length: 30 }).notNull().default("system"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: varchar("updated_by", { length: 30 }).notNull().default("system"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  awardResultId: bigint("award_result_id", { mode: "number" }).notNull(),
  crewId: varchar("crew_id", { length: 30 }).notNull(),
  itemType: varchar("item_type", { length: 20 }).notNull(),
  pairingId: bigint("pairing_id", { mode: "number" }),
  dateOff: date("date_off"),
  matchedTier: smallint("matched_tier"),
  matchedGroupSeq: smallint("matched_group_seq"),
  matchedGroupId: bigint("matched_group_id", { mode: "number" }),
  matchedPropertyGroupKey: varchar("matched_property_group_key", { length: 36 }),
  isAwarded: smallint("is_awarded").notNull().default(1),
  rejectionReason: varchar("rejection_reason", { length: 200 }),
});
