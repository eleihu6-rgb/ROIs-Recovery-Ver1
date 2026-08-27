import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { liveDictionary } from "../../models/index.js";

type Database = ReturnType<typeof drizzle>;

type BusinessTimeConfigRow = {
  code: string | null;
  code_value: string | null;
};

type BusinessTimeConfig = {
  anchorBusinessTime: Date | null;
  anchorRealTime: Date | null;
  mode: string;
  warnings: string[];
};

type BusinessTimeSnapshot = {
  now: Date;
  source: "system" | "override";
  warnings: string[];
};

type PbsBusinessClockOptions = {
  db: Pick<Database, "execute">;
  ttlMs?: number;
  now?: () => Date;
};

const BUSINESS_TIME_CONFIG_TTL_MS = 60_000;
const BUSINESS_TIME_MODE_KEY = "PBS_BUSINESS_TIME_MODE";
const BUSINESS_TIME_ANCHOR_KEY = "PBS_BUSINESS_TIME_ANCHOR";
const BUSINESS_TIME_ANCHOR_REAL_KEY = "PBS_BUSINESS_TIME_ANCHOR_REAL";

const normalizeTimestampValue = (value: string) => {
  let normalized = value.trim();

  if (normalized.length === 0) {
    return "";
  }

  normalized = normalized.replace(/^(\d{4}-\d{2}-\d{2})\s+/, "$1T");
  normalized = normalized.replace(/([+-]\d{2})$/, "$1:00");
  normalized = normalized.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");

  if (!/(?:z|[+-]\d{2}:\d{2})$/i.test(normalized)) {
    normalized = `${normalized}Z`;
  }

  return normalized;
};

const parseBusinessTimeValue = (value: string | null | undefined) => {
  const normalized = normalizeTimestampValue(value ?? "");

  if (normalized.length === 0) {
    return null;
  }

  const date = new Date(normalized);

  return Number.isNaN(date.getTime()) ? null : date;
};

const buildSystemConfig = (warnings: string[] = []): BusinessTimeConfig => ({
  anchorBusinessTime: null,
  anchorRealTime: null,
  mode: "ROLLING",
  warnings,
});

const mapRowsToConfig = (rows: BusinessTimeConfigRow[]): BusinessTimeConfig => {
  const values = new Map(
    rows
      .filter((row) => typeof row.code === "string")
      .map((row) => [row.code!.trim().toUpperCase(), row.code_value?.trim() ?? ""] as const),
  );
  const anchorRaw = values.get(BUSINESS_TIME_ANCHOR_KEY) ?? "";

  if (anchorRaw.length === 0) {
    return buildSystemConfig();
  }

  const mode = (values.get(BUSINESS_TIME_MODE_KEY) || "ROLLING").toUpperCase();

  if (mode !== "ROLLING") {
    return buildSystemConfig([`Unsupported PBS business time mode: ${mode}.`]);
  }

  const anchorBusinessTime = parseBusinessTimeValue(anchorRaw);
  const anchorRealTime = parseBusinessTimeValue(values.get(BUSINESS_TIME_ANCHOR_REAL_KEY));
  const warnings: string[] = [];

  if (!anchorBusinessTime) {
    warnings.push("Invalid PBS business time anchor.");
  }

  if (!anchorRealTime) {
    warnings.push("Invalid PBS business time real anchor.");
  }

  if (warnings.length > 0 || !anchorBusinessTime || !anchorRealTime) {
    return buildSystemConfig(warnings);
  }

  return {
    anchorBusinessTime,
    anchorRealTime,
    mode,
    warnings,
  };
};

export const createPbsBusinessClock = ({
  db,
  ttlMs = BUSINESS_TIME_CONFIG_TTL_MS,
  now = () => new Date(),
}: PbsBusinessClockOptions) => {
  let cachedConfig: {
    expiresAt: number;
    value: BusinessTimeConfig;
  } | null = null;

  const loadConfig = async (): Promise<BusinessTimeConfig> => {
    const currentRealTime = now().getTime();

    if (cachedConfig && cachedConfig.expiresAt > currentRealTime) {
      return cachedConfig.value;
    }

    try {
      const result = await db.execute<BusinessTimeConfigRow>(sql`
        select
          ${liveDictionary.code}::varchar as code,
          ${liveDictionary.codeValue}::varchar as code_value
        from ${liveDictionary}
        where ${liveDictionary.parentCode} = 'SYS_PARAM'
          and ${liveDictionary.code} in (
            ${BUSINESS_TIME_MODE_KEY},
            ${BUSINESS_TIME_ANCHOR_KEY},
            ${BUSINESS_TIME_ANCHOR_REAL_KEY}
          )
      `);
      const value = mapRowsToConfig(result.rows);
      cachedConfig = {
        expiresAt: currentRealTime + ttlMs,
        value,
      };

      return value;
    } catch (error) {
      const value = buildSystemConfig([
        error instanceof Error
          ? `Unable to load PBS business time config: ${error.message}.`
          : "Unable to load PBS business time config.",
      ]);
      cachedConfig = {
        expiresAt: currentRealTime + ttlMs,
        value,
      };

      return value;
    }
  };

  const getBusinessTimeSnapshot = async (): Promise<BusinessTimeSnapshot> => {
    const realNow = now();
    const config = await loadConfig();

    if (!config.anchorBusinessTime || !config.anchorRealTime) {
      return {
        now: new Date(realNow),
        source: "system",
        warnings: [...config.warnings],
      };
    }

    const elapsedMs = realNow.getTime() - config.anchorRealTime.getTime();

    return {
      now: new Date(config.anchorBusinessTime.getTime() + elapsedMs),
      source: "override",
      warnings: [...config.warnings],
    };
  };

  return {
    getBusinessTimeSnapshot,
    async getBusinessNow() {
      return (await getBusinessTimeSnapshot()).now;
    },
  };
};
