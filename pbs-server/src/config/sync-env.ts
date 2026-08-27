import { z } from "zod";

const identifierPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

const identifierSchema = z.string()
  .min(1)
  .refine((value) => identifierPattern.test(value), "must be a valid SQL identifier");

const syncEnvSchema = z.object({
  SOURCE_DATABASE_URL: z.string().min(1),
  TARGET_DATABASE_URL: z.string().trim().optional(),
  DATABASE_URL: z.string().trim().optional(),
  LIVE_SCHEMA: identifierSchema.default("f8"),
  SOURCE_SCHEMA: identifierSchema.default("f8"),
  PBS_SCHEMA: identifierSchema.default("f8_pbs"),
  TARGET_SCHEMA: identifierSchema.optional(),
  PBS_SYNC_CREW_ID_FIELD: identifierSchema.default("user_code"),
  PBS_SYNC_UPDATED_BY: z.string().trim().min(1).default("pbs-user-sync"),
  PBS_USER_EFFECTIVE_DATE_LOCK_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
});

export type SyncEnv = {
  sourceDatabaseUrl: string;
  targetDatabaseUrl: string;
  sourceSchema: string;
  targetSchema: string;
  crewIdField: string;
  updatedBy: string;
  effectiveDateLockTimeoutMs: number;
};

export const parseSyncEnv = (rawEnv: NodeJS.ProcessEnv): SyncEnv => {
  const parsed = syncEnvSchema.parse(rawEnv);
  const targetDatabaseUrl = parsed.TARGET_DATABASE_URL || parsed.DATABASE_URL || parsed.SOURCE_DATABASE_URL;

  return {
    sourceDatabaseUrl: parsed.SOURCE_DATABASE_URL,
    targetDatabaseUrl,
    sourceSchema: parsed.SOURCE_SCHEMA,
    targetSchema: parsed.TARGET_SCHEMA ?? parsed.PBS_SCHEMA,
    crewIdField: parsed.PBS_SYNC_CREW_ID_FIELD,
    updatedBy: parsed.PBS_SYNC_UPDATED_BY,
    effectiveDateLockTimeoutMs: parsed.PBS_USER_EFFECTIVE_DATE_LOCK_TIMEOUT_MS,
  };
};
