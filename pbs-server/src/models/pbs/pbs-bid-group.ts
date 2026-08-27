import { bigint, jsonb, pgSchema, smallint, timestamp, varchar } from "drizzle-orm/pg-core";
import { env } from "../../config/index.js";

const pbsSchema = pgSchema(env.PBS_SCHEMA);

export const pbsBidGroup = pbsSchema.table("pbs_bid_group", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar("created_by", { length: 30 }).notNull().default("system"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: varchar("updated_by", { length: 30 }).notNull().default("system"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  tierId: bigint("tier_id", { mode: "number" }).notNull(),
  bidId: bigint("bid_id", { mode: "number" }).notNull(),
  groupSeq: smallint("group_seq").notNull(),
  propertyGroupKey: varchar("property_group_key", { length: 36 }).notNull(),
  bidType: varchar("bid_type", { length: 20 }),
  actionId: smallint("action_id"),
  legacyPropertyCode: smallint("property_id").notNull(),
  propertyDefinitionId: bigint("property_definition_id", { mode: "number" }).notNull(),
  operator: varchar("operator", { length: 20 }),
  paramA: varchar("param_a", { length: 1000 }),
  paramB: varchar("param_b", { length: 200 }),
  paramC: varchar("param_c", { length: 200 }),
  preferenceJson: jsonb("preference_json").$type<{ creditPriority?: "higher" | "lower" }>(),
  limitN: smallint("limit_n"),
  allOrNothing: smallint("all_or_nothing"),
  minimumN: smallint("minimum_n"),
  totalConditions: smallint("total_conditions").notNull().default(0),
});
