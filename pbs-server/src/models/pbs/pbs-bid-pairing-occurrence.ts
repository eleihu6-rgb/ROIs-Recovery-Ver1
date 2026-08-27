import { bigint, date, pgSchema, smallint, timestamp, varchar } from "drizzle-orm/pg-core";
import { env } from "../../config/index.js";

const pbsSchema = pgSchema(env.PBS_SCHEMA);

export const pbsBidPairingOccurrence = pbsSchema.table("pbs_bid_pairing_occurrence", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar("created_by", { length: 30 }).notNull().default("system"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: varchar("updated_by", { length: 30 }).notNull().default("system"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  bidId: bigint("bid_id", { mode: "number" }).notNull(),
  groupId: bigint("group_id", { mode: "number" }).notNull(),
  propertyGroupKey: varchar("property_group_key", { length: 36 }).notNull(),
  tierId: bigint("tier_id", { mode: "number" }).notNull(),
  tier: smallint("tier").notNull(),
  pairingNumber: varchar("pairing_number", { length: 100 }).notNull(),
  originDate: date("origin_date", { mode: "string" }).notNull(),
  pairingId: varchar("pairing_id", { length: 40 }).notNull(),
  occurrenceId: varchar("occurrence_id", { length: 80 }),
  source: varchar("source", { length: 20 }).notNull().default("portal"),
  isDeleted: smallint("is_deleted").notNull().default(0),
});
