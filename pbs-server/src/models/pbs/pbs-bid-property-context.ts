import { bigint, index, integer, pgSchema, smallint, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { env } from "../../config/index.js";
import { pbsBidProperty } from "./pbs-bid-property.js";

const pbsSchema = pgSchema(env.PBS_SCHEMA);

export const pbsBidPropertyContext = pbsSchema.table("pbs_bid_property_context", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar("created_by", { length: 30 }).notNull().default("system"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: varchar("updated_by", { length: 30 }).notNull().default("system"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  propertyId: bigint("property_id", { mode: "number" })
    .notNull()
    .references(() => pbsBidProperty.id),
  bidContext: varchar("bid_context", { length: 24 }).notNull(),
  isVisibleInPortal: smallint("is_visible_in_portal").notNull().default(0),
  displayOrder: integer("display_order"),
}, (table) => [
  uniqueIndex("uq_pbs_bid_property_context").on(table.propertyId, table.bidContext),
  index("idx_pbs_bid_property_context_catalog").on(
    table.bidContext,
    table.isVisibleInPortal,
    table.displayOrder,
    table.propertyId,
  ),
]);
