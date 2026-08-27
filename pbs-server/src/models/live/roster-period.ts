import { bigint, pgSchema, smallint, timestamp, varchar } from "drizzle-orm/pg-core";
import { env } from "../../config/index.js";

const liveSchema = pgSchema(env.LIVE_SCHEMA);

export const liveRosterPeriod = liveSchema.table("roster_period", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar("created_by", { length: 30 }).notNull().default("system"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedBy: varchar("updated_by", { length: 30 }).notNull().default("system"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  year: varchar("year", { length: 5 }).notNull(),
  name: varchar("name", { length: 50 }).notNull(),
  rosterPeriod: varchar("roster_period", { length: 100 }).notNull(),
  rpStart: timestamp("rp_start").notNull(),
  rpEnd: timestamp("rp_end").notNull(),
  rosterPublicationDate: timestamp("roster_publication_date"),
  paidDate: timestamp("paid_date"),
  lockStatus: smallint("lock_status").notNull().default(0),
  pbsPeriodCode: varchar("pbs_period_code", { length: 20 }),
  pbsBidOpenAt: timestamp("pbs_bid_open_at"),
  pbsBidCloseAt: timestamp("pbs_bid_close_at"),
  pbsAwardPublishAt: timestamp("pbs_award_publish_at"),
  pbsStatus: varchar("pbs_status", { length: 20 }).notNull().default("DRAFT"),
});
