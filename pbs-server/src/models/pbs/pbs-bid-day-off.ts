import { bigint, date, pgSchema, timestamp, varchar, smallint } from "drizzle-orm/pg-core";
import { env } from "../../config/index.js";

const pbsSchema = pgSchema(env.PBS_SCHEMA);

export const pbsBidDayOff = pbsSchema.table("pbs_bid_day_off", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar("created_by", { length: 30 }).notNull().default("system"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: varchar("updated_by", { length: 30 }).notNull().default("system"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  bidId: bigint("bid_id", { mode: "number" }).notNull(),
  tierId: bigint("tier_id", { mode: "number" }).notNull(),
  tier: smallint("tier").notNull(),
  bidDate: date("bid_date").notNull(),
  requestType: varchar("request_type", { length: 20 }).notNull().default("DAY_OFF"),
});
