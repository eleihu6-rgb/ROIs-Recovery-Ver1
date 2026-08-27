import { pgTable, bigint, varchar, integer, timestamp, uniqueIndex, jsonb } from 'drizzle-orm/pg-core'

export const profile = pgTable('profile', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  profileName: varchar('profile_name', { length: 50 }).notNull(),
  profileCode: varchar('profile_code', { length: 50 }),
  filiale: varchar('filiale', { length: 6 }).notNull(),
  division: varchar('division', { length: 1 }).notNull(),
  idx: integer('idx'),
})

export const profileAuthorization = pgTable('profile_authorization', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  profileId: bigint('profile_id', { mode: 'number' }).notNull(),
  authType: varchar('auth_type', { length: 30 }).notNull(),
  authValues: jsonb('auth_values').notNull().$type<string[]>(),
}, (table) => [
  uniqueIndex('uq_profile_authorization').on(table.profileId, table.authType),
])

export const profileCtrlPrivilege = pgTable('profile_ctrl_privilege', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  profileId: bigint('profile_id', { mode: 'number' }).notNull(),
  menuCode: varchar('menu_code', { length: 50 }).notNull(),
  menuCtlCode: varchar('menu_ctl_code', { length: 50 }).notNull(),
  isHidden: varchar('is_hidden', { length: 5 }),
})

export const profileMenuPrivilege = pgTable('profile_menu_privilege', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  profileId: bigint('profile_id', { mode: 'number' }).notNull(),
  menuCode: varchar('menu_code', { length: 50 }).notNull(),
  isHidden: varchar('is_hidden', { length: 5 }),
})
