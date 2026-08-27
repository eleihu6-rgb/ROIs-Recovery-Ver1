import type { Pool } from "pg";
import type { PbsAirportPreferenceLayoverHoursConfig } from "../../../../packages/contracts/pbs-search-pairings.js";
import {
  DEFAULT_PAIRING_ZONE_ID,
  buildActorZoneCte,
  buildPairingLocalOriginDateExpression,
} from "./pairing-local-date-sql.js";

export const AIRPORT_PREFERENCE_LAYOVER_HOURS_CONFIG_CODE = "PBS_AIRPORT_PREFERENCE_LAYOVER_HOURS_RANGE";
export const DEFAULT_AIRPORT_PREFERENCE_LAYOVER_HOURS: PbsAirportPreferenceLayoverHoursConfig = {
  minHours: 13,
  maxHours: 18,
  stepHours: 1,
  defaultHours: 13,
};

export type PairingAirportOptions = {
  airportPreferenceLayoverHours: PbsAirportPreferenceLayoverHoursConfig;
  airportPreferenceOptions: Array<{
    code: string;
    kind: "airport" | "city";
    label: string;
    events: Array<"landing" | "layover">;
  }>;
  filterAirports: string[];
  landingAirports: string[];
  layoverAirports: string[];
  workStartStations: string[];
};

type AirportRow = {
  role: string;
  airport: string;
  airport_preference_landing: boolean | null;
  airport_name: string | null;
  city: string | null;
};

type DictionaryConfigRow = {
  code_value: string | null;
};

const isSafeInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value);

export const parseAirportPreferenceLayoverHoursConfig = (
  rawValue: unknown,
): PbsAirportPreferenceLayoverHoursConfig => {
  if (typeof rawValue !== "string" || rawValue.trim().length === 0) {
    return DEFAULT_AIRPORT_PREFERENCE_LAYOVER_HOURS;
  }

  try {
    const parsed: unknown = JSON.parse(rawValue);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return DEFAULT_AIRPORT_PREFERENCE_LAYOVER_HOURS;
    }

    const record = parsed as Record<string, unknown>;
    const minHours = record.min;
    const maxHours = record.max;
    const stepHours = record.step;
    const defaultHours = record.default;

    if (
      !isSafeInteger(minHours)
      || !isSafeInteger(maxHours)
      || !isSafeInteger(stepHours)
      || !isSafeInteger(defaultHours)
      || minHours < 0
      || maxHours < minHours
      || stepHours < 1
      || defaultHours < minHours
      || defaultHours > maxHours
    ) {
      return DEFAULT_AIRPORT_PREFERENCE_LAYOVER_HOURS;
    }

    return { minHours, maxHours, stepHours, defaultHours };
  } catch {
    return DEFAULT_AIRPORT_PREFERENCE_LAYOVER_HOURS;
  }
};

const loadAirportPreferenceLayoverHoursConfig = async (
  pgPool: Pool,
  schema: string,
) => {
  const result = await pgPool.query<DictionaryConfigRow>(
    `
    select code_value
    from ${schema}.dictionary
    where parent_code = 'SYS_PARAM'
      and code = $1
    limit 1
    `,
    [AIRPORT_PREFERENCE_LAYOVER_HOURS_CONFIG_CODE],
  );

  return parseAirportPreferenceLayoverHoursConfig(result.rows[0]?.code_value ?? null);
};

export const executePairingAirportOptionsQuery = async ({
  pgPool,
  schema,
  actorBase,
  periodStartDate,
  periodEndDate,
}: {
  pgPool: Pool;
  schema: string;
  actorBase: string;
  periodStartDate: string;
  periodEndDate: string;
}): Promise<PairingAirportOptions> => {
  const airportPreferenceLayoverHours = await loadAirportPreferenceLayoverHoursConfig(pgPool, schema);
  const localPeriodFilter = `${buildPairingLocalOriginDateExpression({
    schema,
    zoneExpression: "actor_zone.zone_id",
  })} between $3::date and $4::date`;
  const result = await pgPool.query<AirportRow>(
    `
    with ${buildActorZoneCte({
      actorBasePlaceholder: "$1",
      defaultZonePlaceholder: "$2",
      schema,
    })}
    select source.role, source.airport, source.airport_preference_landing, airport.airport_name, airport.city
    from (
      select
        'landing'::text as role,
        upper(s.arv_arp) as airport,
        bool_or(exists (
          select 1
          from ${schema}.pairing_segment later_s
          where later_s.pairing_id = s.pairing_id
            and later_s.is_deleted = 0
            and (
              later_s.duty_seq > s.duty_seq
              or (
                later_s.duty_seq = s.duty_seq
                and later_s.seg_seq > s.seg_seq
              )
            )
        )) as airport_preference_landing
      from ${schema}.pairing_segment s
      join ${schema}.pairing p on p.id = s.pairing_id
      cross join actor_zone
      where p.is_deleted = 0
        and s.is_deleted = 0
        and p.base = $1
        and ${localPeriodFilter}
        and s.arv_arp is not null
      group by upper(s.arv_arp)

      union all

      select 'layover'::text, upper(s.duty_end_arp), false
      from ${schema}.pairing_segment s
      join ${schema}.pairing p on p.id = s.pairing_id
      cross join actor_zone
      where p.is_deleted = 0
        and s.is_deleted = 0
        and s.duty_layover_nits > 0
        and p.base = $1
        and ${localPeriodFilter}
        and s.duty_end_arp is not null
      group by upper(s.duty_end_arp)

      union all

      select 'work_start'::text, upper(first_duty.duty_str_arp), false
      from (
        select distinct on (s.pairing_id)
          s.pairing_id,
          s.duty_str_arp
        from ${schema}.pairing_segment s
        join ${schema}.pairing p on p.id = s.pairing_id
        cross join actor_zone
        where p.is_deleted = 0
          and s.is_deleted = 0
          and p.base = $1
          and ${localPeriodFilter}
          and s.duty_str_arp is not null
        order by s.pairing_id, s.duty_seq, s.seg_seq
      ) first_duty
      group by upper(first_duty.duty_str_arp)

      union all

      select 'filter'::text, upper(filter_airport.airport), false
      from ${schema}.pairing_segment s
      join ${schema}.pairing p on p.id = s.pairing_id
      cross join actor_zone
      cross join lateral (values
        (s.dep_arp),
        (s.arv_arp),
        (s.duty_str_arp),
        (s.duty_end_arp)
      ) filter_airport(airport)
      where p.is_deleted = 0
        and s.is_deleted = 0
        and p.base = $1
        and ${localPeriodFilter}
        and nullif(btrim(filter_airport.airport), '') is not null
      group by upper(filter_airport.airport)
    ) source
    left join ${schema}.airport airport
      on airport.airport = source.airport
    order by source.role, source.airport
    `,
    [actorBase, DEFAULT_PAIRING_ZONE_ID, periodStartDate, periodEndDate],
  );

  const landingAirports: string[] = [];
  const layoverAirports: string[] = [];
  const workStartStations: string[] = [];
  const filterAirports: string[] = [];
  const airportPreferenceOptionsByKey = new Map<string, {
    code: string;
    kind: "airport" | "city";
    label: string;
    events: Set<"landing" | "layover">;
  }>();

  const addAirportPreferenceOption = (
    code: string,
    kind: "airport" | "city",
    label: string,
    event: "landing" | "layover",
  ) => {
    const key = `${kind}:${code}`;
    const existing = airportPreferenceOptionsByKey.get(key);

    if (existing) {
      existing.events.add(event);
      return;
    }

    airportPreferenceOptionsByKey.set(key, { code, kind, label, events: new Set([event]) });
  };

  for (const row of result.rows) {
    if (row.role === "landing") {
      landingAirports.push(row.airport);
      if (row.airport_preference_landing) {
        addAirportPreferenceOption(
          row.airport,
          "airport",
          row.airport_name ? `${row.airport} · ${row.airport_name}` : row.airport,
          "landing",
        );
        if (row.city) addAirportPreferenceOption(row.city.toUpperCase(), "city", row.city.toUpperCase(), "landing");
      }
    } else if (row.role === "layover") {
      layoverAirports.push(row.airport);
      addAirportPreferenceOption(
        row.airport,
        "airport",
        row.airport_name ? `${row.airport} · ${row.airport_name}` : row.airport,
        "layover",
      );
      if (row.city) addAirportPreferenceOption(row.city.toUpperCase(), "city", row.city.toUpperCase(), "layover");
    } else if (row.role === "work_start") {
      workStartStations.push(row.airport);
    } else {
      filterAirports.push(row.airport);
    }
  }

  const airportPreferenceOptions = Array.from(airportPreferenceOptionsByKey.values())
    .map((option) => ({
      ...option,
      events: Array.from(option.events).sort(),
    }))
    .sort((left, right) => left.kind.localeCompare(right.kind) || left.code.localeCompare(right.code));

  return {
    airportPreferenceLayoverHours,
    airportPreferenceOptions,
    filterAirports,
    landingAirports,
    layoverAirports,
    workStartStations,
  };
};
