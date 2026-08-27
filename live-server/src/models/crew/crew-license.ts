import { pgTable, bigint, varchar, smallint, timestamp } from 'drizzle-orm/pg-core'

export const crewLicense = pgTable('crew_license', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  crewId: varchar('crew_id', { length: 30 }).notNull(),
  certificate: varchar('certificate', { length: 20 }).notNull(),
  licenseType: varchar('license_type', { length: 20 }).notNull(),
  licenseNo: varchar('license_no', { length: 20 }),
  effDt: timestamp('eff_dt').notNull(),
  renewedDt: timestamp('renewed_dt'),
  expDt: timestamp('exp_dt'),
  acTypes: varchar('ac_types', { length: 30 }),
  refLanguageId: bigint('ref_language_id', { mode: 'number' }),
  refInstructorId: bigint('ref_instructor_id', { mode: 'number' }),
  isValid: smallint('is_valid').notNull().default(1),
  remarks: varchar('remarks', { length: 70 }),
  interfaceCrewLicId: varchar('interface_crew_lic_id', { length: 20 }),
})

export const crewLicInstructor = pgTable('crew_lic_instructor', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  crewId: varchar('crew_id', { length: 30 }).notNull(),
  acType: varchar('ac_type', { length: 30 }).notNull(),
  crewLicenseId: bigint('crew_license_id', { mode: 'number' }).notNull(),
  instructor: varchar('instructor', { length: 30 }),
  effDt: timestamp('eff_dt').notNull(),
  renewedDt: timestamp('renewed_dt'),
  expDt: timestamp('exp_dt'),
})

export const crewLanguage = pgTable('crew_language', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  crewId: varchar('crew_id', { length: 30 }).notNull(),
  crewLicenseId: bigint('crew_license_id', { mode: 'number' }),
  language: varchar('language', { length: 20 }).notNull(),
  effDt: timestamp('eff_dt').notNull(),
  renewedDt: timestamp('renewed_dt'),
  expDt: timestamp('exp_dt'),
  languageLevel: varchar('language_level', { length: 10 }),
  isValid: smallint('is_valid').notNull().default(0),
  remarks: varchar('remarks', { length: 70 }),
})
