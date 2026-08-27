import { pgTable, bigint, varchar, integer, smallint, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

export const warn = pgTable('warn', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  warnName: varchar('warn_name', { length: 100 }).notNull(),
  fileName: varchar('file_name', { length: 50 }),
  iconName: varchar('icon_name', { length: 50 }),
})

export const warnAuth = pgTable('warn_auth', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  warnId: bigint('warn_id', { mode: 'number' }).notNull(),
  userName: varchar('user_name', { length: 30 }).notNull(),
  warnDays: integer('warn_days').notNull().default(30),
  isStart: varchar('is_start', { length: 2 }),
}, (table) => [
  uniqueIndex('uq_warn_auth').on(table.warnId, table.userName),
])

export const warnColumn = pgTable('warn_column', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  warnId: bigint('warn_id', { mode: 'number' }).notNull(),
  columnCode: varchar('column_code', { length: 100 }).notNull(),
  columnName: varchar('column_name', { length: 50 }),
  columnIdx: smallint('column_idx'),
}, (table) => [
  uniqueIndex('uq_warn_column').on(table.warnId, table.columnCode),
])

export const warnNotice = pgTable('warn_notice', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  warnId: bigint('warn_id', { mode: 'number' }).notNull(),
  informationNotice: varchar('information_notice', { length: 100 }),
})

export const warnParameter = pgTable('warn_parameter', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  warnId: bigint('warn_id', { mode: 'number' }).notNull(),
  parameterName: varchar('parameter_name', { length: 100 }),
  parameterBind: varchar('parameter_bind', { length: 20 }),
})

export const warnProfile = pgTable('warn_profile', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  profileId: bigint('profile_id', { mode: 'number' }).notNull(),
  warnId: bigint('warn_id', { mode: 'number' }).notNull(),
  warnDays: integer('warn_days').notNull(),
  isStart: varchar('is_start', { length: 1 }).notNull(),
})
