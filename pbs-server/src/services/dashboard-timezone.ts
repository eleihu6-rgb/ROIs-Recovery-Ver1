import type { Pool, QueryResultRow } from "pg";

type PgPool = Pick<Pool, "query">;

type BaseTimeZoneRow = QueryResultRow & {
  zone_id: string | null;
};

export type DashboardBaseTimeZone = {
  zoneId: string;
  timezoneLabel: string;
};

const DEFAULT_ZONE_ID = "UTC";

const trimToNullable = (value: string | null | undefined) => {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
};

const dateTimeFormatterByZone = new Map<string, Intl.DateTimeFormat>();

const getDateTimeFormatter = (zoneId: string): Intl.DateTimeFormat => {
  const normalizedZoneId = trimToNullable(zoneId) ?? DEFAULT_ZONE_ID;
  const cachedFormatter = dateTimeFormatterByZone.get(normalizedZoneId);

  if (cachedFormatter) {
    return cachedFormatter;
  }

  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: normalizedZoneId,
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });

    dateTimeFormatterByZone.set(normalizedZoneId, formatter);
    return formatter;
  } catch {
    return getDateTimeFormatter(DEFAULT_ZONE_ID);
  }
};

const toDate = (value: Date | string | null | undefined) => {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatDashboardDateTimeLabel = (
  value: Date | string | null | undefined,
  zoneId: string,
) => {
  const date = toDate(value);

  if (!date) {
    return null;
  }

  const parts = new Map(
    getDateTimeFormatter(zoneId)
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return `${parts.get("month") ?? ""} ${parts.get("day") ?? ""}, ${parts.get("hour") ?? ""}:${parts.get("minute") ?? ""}`;
};

export const resolveDashboardBaseTimeZone = async (
  pgPool: PgPool | undefined,
  liveSchema: string | null,
  base: string | null | undefined,
): Promise<DashboardBaseTimeZone> => {
  const normalizedBase = trimToNullable(base)?.toUpperCase() ?? null;

  if (!pgPool || !liveSchema || !normalizedBase) {
    return {
      zoneId: DEFAULT_ZONE_ID,
      timezoneLabel: DEFAULT_ZONE_ID,
    };
  }

  let zoneId: string | null = null;

  try {
    const result = await pgPool.query<BaseTimeZoneRow>(`
      select tz.name::text as zone_id
      from (select $1::varchar as base) actor_base
      left join ${liveSchema}.airport airport
        on airport.airport = actor_base.base
      left join pg_timezone_names tz
        on tz.name = nullif(btrim(airport.zone_id), '')
      limit 1
    `, [normalizedBase]);

    zoneId = trimToNullable(result.rows[0]?.zone_id ?? null);
  } catch {
    zoneId = null;
  }

  if (!zoneId) {
    return {
      zoneId: DEFAULT_ZONE_ID,
      timezoneLabel: DEFAULT_ZONE_ID,
    };
  }

  return {
    zoneId,
    timezoneLabel: `${normalizedBase} Local Time`,
  };
};
