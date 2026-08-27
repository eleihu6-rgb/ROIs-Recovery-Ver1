import { bigint, pgSchema, smallint, timestamp, varchar } from "drizzle-orm/pg-core";
import { env } from "../../config/index.js";

const pbsSchema = pgSchema(env.PBS_SCHEMA);

export const pbsBidCondition = pbsSchema.table("pbs_bid_condition", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar("created_by", { length: 30 }).notNull().default("system"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: varchar("updated_by", { length: 30 }).notNull().default("system"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  groupId: bigint("group_id", { mode: "number" }).notNull(),
  bidId: bigint("bid_id", { mode: "number" }).notNull(),
  nodeSeq: smallint("node_seq").notNull(),
  andOrOr: varchar("and_or_or", { length: 3 }).notNull().default("AND"),
  legacyPropertyCode: smallint("property_id").notNull(),
  propertyDefinitionId: bigint("property_definition_id", { mode: "number" }).notNull(),
  operator: varchar("operator", { length: 20 }),
  paramA: varchar("param_a", { length: 1000 }),
  paramB: varchar("param_b", { length: 200 }),
  paramC: varchar("param_c", { length: 200 }),
});
