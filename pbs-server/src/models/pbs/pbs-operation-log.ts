import { bigint, pgSchema, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { env } from "../../config/index.js";

const pbsSchema = pgSchema(env.PBS_SCHEMA);

export const pbsOperationLog = pbsSchema.table("pbs_operation_log", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar("created_by", { length: 30 }).notNull().default("system"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: varchar("updated_by", { length: 30 }).notNull().default("system"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  pbsUserId: bigint("pbs_user_id", { mode: "number" }).notNull(),
  crewId: varchar("crew_id", { length: 30 }).notNull(),
  bidId: bigint("bid_id", { mode: "number" }),
  operation: varchar("operation", { length: 30 }).notNull(),
  targetType: varchar("target_type", { length: 30 }),
  targetId: bigint("target_id", { mode: "number" }),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  ipAddress: varchar("ip_address", { length: 45 }),
  operatedAt: timestamp("operated_at", { withTimezone: true }).notNull().defaultNow(),
});
