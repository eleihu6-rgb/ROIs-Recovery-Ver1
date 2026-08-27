import { pgTable, bigint, varchar, timestamp } from 'drizzle-orm/pg-core'

export const auditLoginHistory = pgTable('audit_login_history', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  userName: varchar('user_name', { length: 50 }),
  ip: varchar('ip', { length: 45 }),
  machine: varchar('machine', { length: 50 }),
  osuser: varchar('osuser', { length: 50 }),
  loginTime: timestamp('login_time').notNull().defaultNow(),
  logoutTime: timestamp('logout_time'),
  loginType: varchar('login_type', { length: 20 }),
  result: varchar('result', { length: 100 }),
})
