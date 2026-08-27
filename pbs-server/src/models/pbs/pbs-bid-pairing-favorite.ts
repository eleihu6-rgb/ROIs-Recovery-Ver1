import { bigint, integer, pgSchema, timestamp, varchar } from "drizzle-orm/pg-core";
import { env } from "../../config/index.js";

const pbsSchema = pgSchema(env.PBS_SCHEMA);

export const pbsBidPairingFavorite = pbsSchema.table("pbs_bid_pairing_favorite", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar("created_by", { length: 30 }).notNull().default("system"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: varchar("updated_by", { length: 30 }).notNull().default("system"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  bidId: bigint("bid_id", { mode: "number" }).notNull(),
  propertyId: bigint("property_id", { mode: "number" }).notNull(),
  propertyCode: integer("property_code").notNull(),
});
