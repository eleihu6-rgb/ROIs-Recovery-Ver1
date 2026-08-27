import type { Pool } from "pg";
import type {
  PbsPairingAirportOption,
  PbsPairingReferenceOptionsResponse,
} from "../../../../packages/contracts/pbs-pairing-bids.js";

const REFERENCE_OPTIONS_CACHE_TTL_MS = 10 * 60 * 1000;

const validateLiveSchema = (liveSchema: string) => {
  if (!/^[a-z][a-z0-9_]*$/.test(liveSchema)) {
    throw new Error(`Invalid live schema name: ${liveSchema}`);
  }

  return liveSchema;
};

const cloneReferenceOptions = (
  options: PbsPairingReferenceOptionsResponse,
): PbsPairingReferenceOptionsResponse => ({
  airports: options.airports.map((airport) => ({ ...airport })),
  cities: options.cities.map((city) => ({ ...city })),
});

type CreatePairingReferenceOptionsLoaderOptions = {
  pgPool?: Pool;
  liveSchema?: string;
};

export const createPairingReferenceOptionsLoader = ({
  pgPool,
  liveSchema,
}: CreatePairingReferenceOptionsLoaderOptions) => {
  const schema = pgPool && liveSchema ? validateLiveSchema(liveSchema) : null;
  let cache: {
    expiresAt: number;
    value: PbsPairingReferenceOptionsResponse;
  } | null = null;

  return async (): Promise<PbsPairingReferenceOptionsResponse> => {
    const now = Date.now();

    if (cache && cache.expiresAt > now) {
      return cloneReferenceOptions(cache.value);
    }

    if (!pgPool || !schema) {
      return { airports: [], cities: [] };
    }

    const result = await pgPool.query<PbsPairingAirportOption>(`
      select
        airport as code,
        airport_name as name,
        airport_icao as icao,
        airport_abbr as abbr,
        city
      from ${schema}.airport
      where airport is not null
        and btrim(airport) <> ''
        and city is not null
        and btrim(city) <> ''
      order by airport
    `);
    const airports = result.rows.map((row) => ({
      code: row.code.trim().toUpperCase(),
      name: row.name?.trim() || null,
      icao: row.icao?.trim() || null,
      abbr: row.abbr?.trim() || null,
      city: row.city.trim().toUpperCase(),
    }));
    const cities = Array.from(new Set(airports.map((airport) => airport.city)))
      .sort()
      .map((code) => ({ code }));
    const value = { airports, cities };

    cache = {
      expiresAt: now + REFERENCE_OPTIONS_CACHE_TTL_MS,
      value,
    };

    return cloneReferenceOptions(value);
  };
};
