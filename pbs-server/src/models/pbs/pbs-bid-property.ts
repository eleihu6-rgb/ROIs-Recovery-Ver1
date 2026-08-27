import { bigint, integer, pgSchema, smallint, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { env } from "../../config/index.js";

const pbsSchema = pgSchema(env.PBS_SCHEMA);

export const pbsBidProperty = pbsSchema.table("pbs_bid_property", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar("created_by", { length: 30 }).notNull().default("system"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: varchar("updated_by", { length: 30 }).notNull().default("system"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  propertyCode: smallint("property_code").notNull(),
  bidType: varchar("bid_type", { length: 20 }).notNull(),
  propertyName: varchar("property_name", { length: 100 }).notNull(),
  propertyNameLegacy: varchar("property_name_legacy", { length: 300 }),
  awardOrAvoid: varchar("award_or_avoid", { length: 50 }),
  anyOrEvery: varchar("any_or_every", { length: 30 }),
  operatorOptions: varchar("operator_options", { length: 100 }),
  validationJson: varchar("validation_json", { length: 500 }),
  tooltip: text("tooltip"),
  notes: varchar("notes", { length: 500 }),
  sourceType: varchar("source_type", { length: 20 }).notNull().default("legacy"),
  recommendedOrder: smallint("recommended_order"),
  recommendedUsageCount: integer("recommended_usage_count"),
  isActive: smallint("is_active").notNull().default(1),
});
