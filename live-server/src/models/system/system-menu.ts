import { pgTable, bigint, varchar, integer, timestamp } from 'drizzle-orm/pg-core'

export const systemMenu = pgTable('system_menu', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  menuCode: varchar('menu_code', { length: 50 }).notNull(),
  menuName: varchar('menu_name', { length: 50 }).notNull(),
  parentMenuCode: varchar('parent_menu_code', { length: 50 }).notNull(),
  factoryName: varchar('factory_name', { length: 300 }),
  pngName: varchar('png_name', { length: 50 }),
  systemType: varchar('system_type', { length: 1 }).notNull(),
  systemSource: integer('system_source'),
  idx: integer('idx'),
  isHidden: varchar('is_hidden', { length: 5 }),
  apiUris: varchar('api_uris', { length: 2000 }),
  icon: varchar('icon', { length: 50 }),
})
