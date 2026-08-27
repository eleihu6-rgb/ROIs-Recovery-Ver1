import { sql } from "drizzle-orm";
import { bigint, integer, jsonb, pgSchema, smallint, timestamp, varchar } from "drizzle-orm/pg-core";
import { env } from "../../config/index.js";
import type { PbsDaysOffBidValue } from "../../../../packages/contracts/pbs-days-off-bids.js";

const pbsSchema = pgSchema(env.PBS_SCHEMA);

export const pbsBidDaysOffFavorite = pbsSchema.table("pbs_bid_days_off_favorite", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar("created_by", { length: 30 }).notNull().default("system"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: varchar("updated_by", { length: 30 }).notNull().default("system"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  bidId: bigint("bid_id", { mode: "number" }).notNull(),
  propertyId: bigint("property_id", { mode: "number" }).notNull(),
  propertyCode: integer("property_code").notNull(),
  favoriteName: varchar("favorite_name", { length: 120 }),
  action: varchar("action", { length: 20 }).$type<"award" | "avoid" | null>(),
  bidPayload: jsonb("bid_payload").$type<PbsDaysOffBidValue>().notNull().default(sql`'{}'::jsonb`),
  allOrNothing: smallint("all_or_nothing").notNull().default(0),
  minimumN: smallint("minimum_n"),
  maximumN: smallint("maximum_n"),
});
