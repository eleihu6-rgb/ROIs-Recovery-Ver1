import { bigint, integer, numeric, pgSchema, smallint, timestamp, varchar } from "drizzle-orm/pg-core";
import { env } from "../../config/index.js";

const pbsSchema = pgSchema(env.PBS_SCHEMA);

export const pbsAwardResult = pbsSchema.table("pbs_award_result", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar("created_by", { length: 30 }).notNull().default("system"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: varchar("updated_by", { length: 30 }).notNull().default("system"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  rosterPeriodId: bigint("roster_period_id", { mode: "number" }).notNull(),
  periodCode: varchar("period_code", { length: 20 }).notNull(),
  crewId: varchar("crew_id", { length: 30 }).notNull(),
  bidId: bigint("bid_id", { mode: "number" }),
  seniorityRank: integer("seniority_rank"),
  awardedTier: smallint("awarded_tier"),
  totalPairings: smallint("total_pairings").notNull().default(0),
  totalDaysOff: smallint("total_days_off").notNull().default(0),
  satisfactionScore: numeric("satisfaction_score", { precision: 5, scale: 2 }),
  runAt: timestamp("run_at", { withTimezone: true }).notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  status: varchar("status", { length: 20 }).notNull().default("PENDING"),
  remarks: varchar("remarks", { length: 500 }),
});
