import { pgTable, bigint, varchar, integer, smallint, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  userCode: varchar('user_code', { length: 30 }).notNull(),
  userName: varchar('user_name', { length: 100 }).notNull(),
  passwordHash: varchar('password_hash', { length: 200 }).notNull(),
  branchCode: varchar('branch_code', { length: 40 }).notNull(),
  pyAbbr: varchar('py_abbr', { length: 30 }).notNull(),
  gender: varchar('gender', { length: 1 }),
  tel: varchar('tel', { length: 40 }),
  effDt: timestamp('eff_dt').notNull(),
  expDt: timestamp('exp_dt'),
  adActive: smallint('ad_active').notNull().default(0),
  status: smallint('status').notNull().default(0),
  isAdmin: smallint('is_admin').notNull().default(0),
  interfaceUserId: varchar('interface_user_id', { length: 50 }),
  passwordAccess: varchar('password_access', { length: 1 }),
  portalAccess: varchar('portal_access', { length: 1 }),
  appAccess: varchar('app_access', { length: 1 }),
  isFirstLogin: varchar('is_first_login', { length: 10 }),
  email: varchar('email', { length: 100 }),
  tokenVersion: integer('token_version').notNull().default(0),
}, (table) => [
  uniqueIndex('uq_users_code').on(table.userCode),
])

export const userCustomer = pgTable('user_customer', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  userCode: varchar('user_code', { length: 20 }).notNull(),
  key: varchar('key', { length: 10 }).notNull(),
  val: varchar('val', { length: 400 }),
  division: varchar('division', { length: 10 }),
})

export const userDepartment = pgTable('user_department', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  branchCode: varchar('branch_code', { length: 20 }).notNull(),
  branchName: varchar('branch_name', { length: 50 }).notNull(),
  parentCode: varchar('parent_code', { length: 20 }),
  division: varchar('division', { length: 1 }),
  filiale: varchar('filiale', { length: 6 }),
  idx: smallint('idx'),
}, (table) => [
  uniqueIndex('uq_user_department').on(table.branchCode),
])

export const userProfile = pgTable('user_profile', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  userCode: varchar('user_code', { length: 30 }).notNull(),
  profileId: bigint('profile_id', { mode: 'number' }).notNull(),
}, (table) => [
  uniqueIndex('uq_user_profile').on(table.userCode, table.profileId),
])
