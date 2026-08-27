import { bigint, integer, pgSchema, smallint, timestamp, varchar } from "drizzle-orm/pg-core";
import { env } from "../../config/index.js";

const pbsSchema = pgSchema(env.PBS_SCHEMA);

export const pbsUser = pbsSchema.table("pbs_user", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar("created_by", { length: 30 }).notNull().default("system"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: varchar("updated_by", { length: 30 }).notNull().default("system"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  crewId: varchar("crew_id", { length: 30 }).notNull(),
  userCode: varchar("user_code", { length: 30 }).notNull(),
  userName: varchar("user_name", { length: 100 }).notNull(),
  passwordHash: varchar("password_hash", { length: 200 }).notNull(),
  branchCode: varchar("branch_code", { length: 40 }).notNull(),
  pyAbbr: varchar("py_abbr", { length: 30 }).notNull(),
  gender: varchar("gender", { length: 1 }),
  tel: varchar("tel", { length: 40 }),
  effDt: timestamp("eff_dt", { withTimezone: true }).notNull(),
  expDt: timestamp("exp_dt", { withTimezone: true }),
  adActive: smallint("ad_active").notNull().default(0),
  status: smallint("status").notNull().default(0),
  isAdmin: smallint("is_admin").notNull().default(0),
  interfaceUserId: varchar("interface_user_id", { length: 50 }),
  passwordAccess: varchar("password_access", { length: 1 }),
  portalAccess: varchar("portal_access", { length: 1 }),
  appAccess: varchar("app_access", { length: 1 }),
  isFirstLogin: varchar("is_first_login", { length: 10 }),
  email: varchar("email", { length: 100 }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  lastLoginIp: varchar("last_login_ip", { length: 45 }),
  failedLoginCount: smallint("failed_login_count").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
  tokenVersion: integer("token_version").notNull().default(0),
  division: varchar("division", { length: 1 }),
});
