import { and, eq, inArray } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/node-postgres";
import { liveDictionary } from "../../models/index.js";
import { SimulatedCrewPortalError } from "./simulated-crew-portal-error.js";

const SYS_PARAM_PARENT_CODE = "SYS_PARAM";
const PORTAL_PUBLIC_URL_CODE = "PBS_PORTAL_PUBLIC_URL";
const LOGIN_TTL_SECONDS_CODE = "PBS_SIMULATED_LOGIN_TTL_SECONDS";
const DEFAULT_LOGIN_TTL_SECONDS = 300;
const MAX_LOGIN_TTL_SECONDS = 3600;
const MAX_DICTIONARY_CODE_VALUE_LENGTH = 50;
const CONFIG_AUDIT_USER_MAX_LENGTH = 30;
const CONFIG_ROW_DEFINITIONS = {
  [PORTAL_PUBLIC_URL_CODE]: {
    name: "PBS portal public URL for simulated crew login",
    idx: 22,
  },
  [LOGIN_TTL_SECONDS_CODE]: {
    name: "PBS simulated login token TTL seconds",
    idx: 23,
  },
} as const;

type Db = ReturnType<typeof drizzle>;

export interface SimulatedCrewPortalConfig {
  portalPublicUrl: string;
  loginTtlSeconds: number;
}

export interface SaveSimulatedCrewPortalConfigInput {
  portalPublicUrl: string;
  loginTtlSeconds: number;
  updatedBy: string;
}

const trimAuditUser = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return "pbs-admin";
  return trimmed.length > CONFIG_AUDIT_USER_MAX_LENGTH
    ? trimmed.slice(0, CONFIG_AUDIT_USER_MAX_LENGTH)
    : trimmed;
};

const isHttpPortalUrl = (url: URL): boolean =>
  url.protocol === "http:" || url.protocol === "https:";

const normalizeConfiguredPortalPublicUrl = (value: string | null | undefined): string => {
  const trimmed = value?.trim() ?? "";

  if (!trimmed) {
    throw new SimulatedCrewPortalError(500, "Simulated crew portal URL is not configured.");
  }

  try {
    const url = new URL(trimmed);
    if (!isHttpPortalUrl(url)) {
      throw new Error("invalid protocol");
    }
    return url.toString().replace(/\/+$/, "");
  } catch {
    throw new SimulatedCrewPortalError(500, "Simulated crew portal URL configuration is invalid.");
  }
};

const normalizeOptionalPortalPublicUrl = (value: string | null | undefined): string => {
  const trimmed = value?.trim() ?? "";

  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    if (!isHttpPortalUrl(url)) {
      throw new Error("invalid protocol");
    }
    return url.toString().replace(/\/+$/, "");
  } catch {
    throw new SimulatedCrewPortalError(500, "Simulated crew portal URL configuration is invalid.");
  }
};

const normalizePortalPublicUrlInput = (value: string): string => {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new SimulatedCrewPortalError(400, "Portal URL is required.");
  }

  let normalized = "";
  try {
    const url = new URL(trimmed);
    if (!isHttpPortalUrl(url)) {
      throw new Error("invalid protocol");
    }
    normalized = url.toString().replace(/\/+$/, "");
  } catch {
    throw new SimulatedCrewPortalError(400, "Portal URL must be a valid http or https URL.");
  }

  if (normalized.length > MAX_DICTIONARY_CODE_VALUE_LENGTH) {
    throw new SimulatedCrewPortalError(400, "Portal URL must be 50 characters or fewer.");
  }

  return normalized;
};

const parseLoginTtlSeconds = (value: string | null | undefined): number => {
  const trimmed = value?.trim() ?? "";

  if (!trimmed) {
    return DEFAULT_LOGIN_TTL_SECONDS;
  }

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > MAX_LOGIN_TTL_SECONDS) {
    throw new SimulatedCrewPortalError(500, "Simulated login TTL configuration is invalid.");
  }

  return parsed;
};

const validateLoginTtlSecondsInput = (value: number): number => {
  if (!Number.isInteger(value) || value <= 0 || value > MAX_LOGIN_TTL_SECONDS) {
    throw new SimulatedCrewPortalError(400, "Token TTL Seconds must be an integer from 1 to 3600.");
  }

  return value;
};

const loadConfigRows = async (db: Db): Promise<Map<string, string | null>> => {
  const rows = await db
    .select({
      code: liveDictionary.code,
      codeValue: liveDictionary.codeValue,
    })
    .from(liveDictionary)
    .where(and(
      eq(liveDictionary.parentCode, SYS_PARAM_PARENT_CODE),
      inArray(liveDictionary.code, [PORTAL_PUBLIC_URL_CODE, LOGIN_TTL_SECONDS_CODE]),
    ))
    .limit(2);

  const values = new Map<string, string | null>();
  for (const row of rows) {
    if (row.code) {
      values.set(row.code, row.codeValue);
    }
  }

  return values;
};

export const loadSimulatedCrewPortalConfig = async (db: Db): Promise<SimulatedCrewPortalConfig> => {
  const values = await loadConfigRows(db);

  return {
    portalPublicUrl: normalizeConfiguredPortalPublicUrl(values.get(PORTAL_PUBLIC_URL_CODE)),
    loginTtlSeconds: parseLoginTtlSeconds(values.get(LOGIN_TTL_SECONDS_CODE)),
  };
};

export const loadSimulatedCrewPortalAdminConfig = async (db: Db): Promise<SimulatedCrewPortalConfig> => {
  const values = await loadConfigRows(db);

  return {
    portalPublicUrl: normalizeOptionalPortalPublicUrl(values.get(PORTAL_PUBLIC_URL_CODE)),
    loginTtlSeconds: parseLoginTtlSeconds(values.get(LOGIN_TTL_SECONDS_CODE)),
  };
};

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === "object"
  && error !== null
  && "code" in error
  && (error as { code?: unknown }).code === "23505";

const updateDictionaryValue = async (
  db: Db,
  code: keyof typeof CONFIG_ROW_DEFINITIONS,
  codeValue: string,
  updatedBy: string,
): Promise<boolean> => {
  const updatedRows = await db
    .update(liveDictionary)
    .set({
      codeValue,
      name: CONFIG_ROW_DEFINITIONS[code].name,
      updatedBy,
      updatedAt: new Date(),
    })
    .where(and(
      eq(liveDictionary.parentCode, SYS_PARAM_PARENT_CODE),
      eq(liveDictionary.code, code),
    ))
    .returning({ id: liveDictionary.id });

  return updatedRows.length > 0;
};

const upsertDictionaryValue = async (
  db: Db,
  code: keyof typeof CONFIG_ROW_DEFINITIONS,
  codeValue: string,
  updatedBy: string,
): Promise<void> => {
  const wasUpdated = await updateDictionaryValue(db, code, codeValue, updatedBy);
  if (wasUpdated) return;

  try {
    await db.insert(liveDictionary).values({
      createdBy: updatedBy,
      createdAt: new Date(),
      updatedBy,
      updatedAt: new Date(),
      parentCode: SYS_PARAM_PARENT_CODE,
      code,
      name: CONFIG_ROW_DEFINITIONS[code].name,
      idx: CONFIG_ROW_DEFINITIONS[code].idx,
      codeValue,
    });
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }
    await updateDictionaryValue(db, code, codeValue, updatedBy);
  }
};

export const saveSimulatedCrewPortalAdminConfig = async (
  db: Db,
  input: SaveSimulatedCrewPortalConfigInput,
): Promise<SimulatedCrewPortalConfig> => {
  const portalPublicUrl = normalizePortalPublicUrlInput(input.portalPublicUrl);
  const loginTtlSeconds = validateLoginTtlSecondsInput(input.loginTtlSeconds);
  const updatedBy = trimAuditUser(input.updatedBy);

  await upsertDictionaryValue(db, PORTAL_PUBLIC_URL_CODE, portalPublicUrl, updatedBy);
  await upsertDictionaryValue(db, LOGIN_TTL_SECONDS_CODE, String(loginTtlSeconds), updatedBy);

  return {
    portalPublicUrl,
    loginTtlSeconds,
  };
};
