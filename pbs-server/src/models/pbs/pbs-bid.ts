import { bigint, integer, pgSchema, smallint, timestamp, varchar } from "drizzle-orm/pg-core";
import { env } from "../../config/index.js";

const pbsSchema = pgSchema(env.PBS_SCHEMA);

export const pbsBid = pbsSchema.table("pbs_bid", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar("created_by", { length: 30 }).notNull().default("system"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: varchar("updated_by", { length: 30 }).notNull().default("system"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  crewId: varchar("crew_id", { length: 30 }).notNull(),
  periodCode: varchar("period_code", { length: 20 }).notNull(),
  rosterPeriodId: bigint("roster_period_id", { mode: "number" }),
  bidContext: varchar("bid_context", { length: 24 }).notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  lastModifiedAt: timestamp("last_modified_at", { withTimezone: true }),
  draftVersion: integer("draft_version").notNull().default(0),
  isLocked: smallint("is_locked").notNull().default(0),
  totalTiers: smallint("total_tiers").notNull().default(0),
  status: varchar("status", { length: 20 }).notNull().default("DRAFT"),
  remarks: varchar("remarks", { length: 500 }),
});
