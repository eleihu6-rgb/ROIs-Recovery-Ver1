import type {Trip} from './tripCsv';
import type {PortalDuty} from './portalCapture';
import {airportZone} from '../settings/airportZones';
import {wallClockInZone} from '../settings/timeFormat';
import {z} from 'zod';

export interface EkRosterCredentials {
  airline?: string;
  crewId: string;
  password: string;
}

export interface EkRosterCrew {
  crewId: string;
  firstName: string;
  lastName: string;
  base: string;
  rank: string;
  nationality?: string | null;
}

export interface EkRosterFlight {
  flightId: string;
  flightNumber: string;
  carrier: string;
  departureAirport: string;
  arrivalAirport: string;
  departureUtc: string;
  arrivalUtc: string;
  departureLocal: string | null;
  arrivalLocal: string | null;
  fleet: string | null;
  registration: string | null;
  assignment: string;
  /** Rolling operational times (null when the airline has none yet). */
  estDepartureUtc?: string | null;
  estArrivalUtc?: string | null;
  actualDepartureUtc?: string | null;
  actualArrivalUtc?: string | null;
  /** Filed block time in minutes. */
  blockMinutes?: number | null;
}

export interface EkRosterPairing {
  pairingId: string;
  label: string;
  checkInUtc: string;
  releaseUtc: string;
  assignment: string;
  flights: EkRosterFlight[];
}

export interface EkRosterGroundDuty {
  dutyId?: string | null;
  /** The live-server sends NULL for day-off / leave rows (roster_flight.label is null). */
  label?: string | null;
  startUtc?: string | null;
  endUtc?: string | null;
  assignment?: string | null;
  departureAirport?: string | null;
  arrivalAirport?: string | null;
}

export interface EkRosterResponse {
  apiVersion: string;
  airline: string;
  crew: EkRosterCrew;
  pairings: EkRosterPairing[];
  groundDuties: EkRosterGroundDuty[];
}

const requiredString = z.string().min(1);
const UTC_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?Z?$/;

function isValidUtcTimestamp(value: string): boolean {
  const match = value.match(UTC_TIMESTAMP);
  if (!match) {
    return false;
  }
  const [, year, month, day, hour, minute, second = '0'] = match;
  const instant = new Date(Date.UTC(
    Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second),
  ));
  return instant.getUTCFullYear() === Number(year)
    && instant.getUTCMonth() === Number(month) - 1
    && instant.getUTCDate() === Number(day)
    && instant.getUTCHours() === Number(hour)
    && instant.getUTCMinutes() === Number(minute)
    && instant.getUTCSeconds() === Number(second);
}

const utcTimestamp = requiredString.refine(isValidUtcTimestamp);
const nullableString = z.string().nullable();
const nullableTimestamp = utcTimestamp.nullable();
const flightSchema = z.object({
  flightId: requiredString,
  flightNumber: requiredString,
  carrier: requiredString,
  departureAirport: requiredString,
  arrivalAirport: requiredString,
  departureUtc: utcTimestamp,
  arrivalUtc: utcTimestamp,
  departureLocal: nullableTimestamp,
  arrivalLocal: nullableTimestamp,
  fleet: nullableString,
  registration: nullableString,
  assignment: requiredString,
  // Operational detail (optional so the older EK crew-app API still validates).
  estDepartureUtc: utcTimestamp.nullable().optional(),
  estArrivalUtc: utcTimestamp.nullable().optional(),
  actualDepartureUtc: utcTimestamp.nullable().optional(),
  actualArrivalUtc: utcTimestamp.nullable().optional(),
  blockMinutes: z.number().nullable().optional(),
});
const pairingSchema = z.object({
  pairingId: requiredString,
  label: requiredString,
  checkInUtc: utcTimestamp,
  releaseUtc: utcTimestamp,
  assignment: requiredString,
  flights: z.array(flightSchema),
});
const groundDutySchema = z.object({
  dutyId: requiredString.nullable().optional(),
  // Day-off / leave rows carry no label and no flight number — the assignment
  // code ("DO", "AL", …) is the only identity they have. Nulls are the real
  // server values, so the transport schema must accept them instead of failing
  // the whole envelope (that bug rejected J4002's Sep 9 / Sep 17 duties).
  label: requiredString.nullable().optional(),
  startUtc: utcTimestamp.nullable().optional(),
  endUtc: utcTimestamp.nullable().optional(),
  assignment: requiredString.nullable().optional(),
  departureAirport: nullableString.optional(),
  arrivalAirport: nullableString.optional(),
});
// Carriers served by the ROIS live-server `/mobile-roster/session` envelope
// (F8 plus ET for the crew recovery solution). EK uses the older crew-app API.
const MOBILE_ROSTER_AIRLINES = new Set(['F8', 'ET']);
const SUPPORTED_ROSTER_AIRLINES = new Set(['EK', ...MOBILE_ROSTER_AIRLINES]);
export function isMobileRosterAirline(airline: unknown): boolean {
  return typeof airline === 'string' && MOBILE_ROSTER_AIRLINES.has(airline);
}
function isSupportedRosterAirline(airline: unknown): boolean {
  return typeof airline === 'string' && SUPPORTED_ROSTER_AIRLINES.has(airline);
}

const responseSchema = z.object({
  apiVersion: z.literal('1'),
  airline: z.enum(['EK', 'F8', 'ET']),
  crew: z.object({
    crewId: requiredString,
    firstName: requiredString,
    lastName: requiredString,
    base: requiredString,
    rank: requiredString,
    // ISO-2 country code; older servers don't send it.
    nationality: z.string().nullable().optional(),
  }),
  pairings: z.array(pairingSchema),
  groundDuties: z.array(groundDutySchema),
}).superRefine((value, context) => {
  const pairingIds = new Set<string>();
  const flightIds = new Set<string>();
  value.pairings.forEach((pairing, pairingIndex) => {
    if (pairingIds.has(pairing.pairingId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['pairings', pairingIndex, 'pairingId'],
        message: 'Duplicate pairing ID',
      });
    }
    pairingIds.add(pairing.pairingId);
    pairing.flights.forEach((flight, flightIndex) => {
      if (flightIds.has(flight.flightId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['pairings', pairingIndex, 'flights', flightIndex, 'flightId'],
          message: 'Duplicate flight ID',
        });
      }
      flightIds.add(flight.flightId);
    });
  });
});

const f8EnvelopeSchema = z.object({
  code: z.number(),
  message: z.string(),
}).passthrough();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeF8RosterEnvelopeData(value: unknown): unknown {
  if (!isRecord(value) || !Array.isArray(value.pairings)) {
    return value;
  }

  const envelopeAirline = typeof value.airline === 'string' ? value.airline : 'F8';

  return {
    ...value,
    pairings: value.pairings.map(pairing => {
      if (!isRecord(pairing) || !Array.isArray(pairing.flights)) {
        return pairing;
      }

      const pairingAssignment = typeof pairing.assignment === 'string' ? pairing.assignment : 'FLY';

      return {
        ...pairing,
        flights: pairing.flights.map(flight => {
          if (!isRecord(flight)) {
            return flight;
          }

          return {
            ...flight,
            carrier: typeof flight.carrier === 'string' ? flight.carrier : envelopeAirline,
            departureUtc: typeof flight.departureUtc === 'string' ? flight.departureUtc : flight.startUtc,
            arrivalUtc: typeof flight.arrivalUtc === 'string' ? flight.arrivalUtc : flight.endUtc,
            departureLocal: typeof flight.departureLocal === 'string' ? flight.departureLocal : null,
            arrivalLocal: typeof flight.arrivalLocal === 'string' ? flight.arrivalLocal : null,
            fleet: typeof flight.fleet === 'string' ? flight.fleet : null,
            registration: typeof flight.registration === 'string' ? flight.registration : null,
            // live-server sends `register` + est/act times off the flight row; the
            // app's flight shape names them est/actual.
            estDepartureUtc: typeof flight.estStartUtc === 'string' ? flight.estStartUtc : null,
            estArrivalUtc: typeof flight.estEndUtc === 'string' ? flight.estEndUtc : null,
            actualDepartureUtc: typeof flight.actStartUtc === 'string' ? flight.actStartUtc : null,
            actualArrivalUtc: typeof flight.actEndUtc === 'string' ? flight.actEndUtc : null,
            blockMinutes: typeof flight.blockMinutes === 'number' ? flight.blockMinutes : null,
            assignment: typeof flight.assignment === 'string' ? flight.assignment : pairingAssignment,
          };
        }),
      };
    }),
  };
}

function parseEkRosterResponse(value: unknown): EkRosterResponse {
  if (typeof value === 'object' && value !== null) {
    const candidate = value as {apiVersion?: unknown; airline?: unknown};
    if (candidate.apiVersion !== '1' || !isSupportedRosterAirline(candidate.airline)) {
      throw new Error('Unsupported roster API version');
    }
  }
  const result = responseSchema.safeParse(value);
  if (!result.success) {
    throw new Error('Invalid EK roster response');
  }
  return result.data;
}

function parseF8RosterEnvelope(value: unknown): EkRosterResponse {
  const result = f8EnvelopeSchema.safeParse(value);
  if (!result.success || !Object.prototype.hasOwnProperty.call(result.data, 'data')) {
    throw new Error('Invalid F8 roster envelope');
  }
  if (result.data.code !== 200) {
    throw new Error('F8 roster API rejected request');
  }
  try {
    return parseEkRosterResponse(normalizeF8RosterEnvelopeData(result.data.data));
  } catch {
    throw new Error('Invalid F8 roster envelope');
  }
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function toLegacyRosterUtc(value: string): string {
  const match = value.match(UTC_TIMESTAMP);
  if (!match) {
    throw new Error('Invalid EK roster response');
  }
  const [, year, month, day, hour, minute] = match;
  return `${day} ${MONTHS[Number(month) - 1]} ${year} ${hour}${minute}`;
}

export function mapEkRosterToTrips(value: unknown): Trip[] {
  const response = parseEkRosterResponse(value);
  if (response.apiVersion !== '1' || !isSupportedRosterAirline(response.airline)) {
    throw new Error('Unsupported roster API version');
  }
  return response.pairings.map(pairing => ({
    id: pairing.pairingId,
    crewId: response.crew.crewId,
    checkInDateUTC: toLegacyRosterUtc(pairing.checkInUtc),
    legs: pairing.flights.map(flight => ({
      crewId: response.crew.crewId,
      fltNumber: flight.flightNumber,
      flightDateUTC: toLegacyRosterUtc(flight.departureUtc),
      depArp: flight.departureAirport,
      arvDateUTC: toLegacyRosterUtc(flight.arrivalUtc),
      arvArp: flight.arrivalAirport,
      fleet: flight.fleet ?? '',
      hotel: '',
      ...(flight.departureLocal ? {localDepTime: flight.departureLocal} : {}),
      ...(flight.arrivalLocal ? {localArvTime: flight.arrivalLocal} : {}),
      // Operational detail for the destination / trip-details pages.
      ...(flight.registration ? {register: flight.registration} : {}),
      ...(flight.estDepartureUtc ? {estDepUtc: flight.estDepartureUtc} : {}),
      ...(flight.estArrivalUtc ? {estArvUtc: flight.estArrivalUtc} : {}),
      ...(flight.actualDepartureUtc ? {actDepUtc: flight.actualDepartureUtc} : {}),
      ...(flight.actualArrivalUtc ? {actArvUtc: flight.actualArrivalUtc} : {}),
      ...(typeof flight.blockMinutes === 'number' ? {blockMinutes: flight.blockMinutes} : {}),
      assignment: flight.assignment,
    })),
  }));
}

export function mapEkRosterToDuties(value: unknown): PortalDuty[] {
  const response = parseEkRosterResponse(value);

  return response.groundDuties.flatMap(duty => {
    // A duty with no window cannot be placed on a day. Skip it rather than
    // failing the whole login — one bad row must not cost the crew their roster.
    if (!duty.startUtc || !duty.endUtc) {
      return [];
    }
    const assignment = (duty.assignment ?? '').trim().toUpperCase();
    const label = (duty.label ?? '').trim() || assignment || 'Duty';
    const id = duty.dutyId
      ?? `${response.airline}:${response.crew.crewId}:${assignment}:${label}:${duty.startUtc}:${duty.endUtc}`;
    // `local*` is the AIRPORT-local wall clock: it decides which calendar day the
    // card lands on, and a day-off row is a local-day concept.
    const zone = airportZone(duty.departureAirport ?? undefined);
    const start = new Date(duty.startUtc);
    const end = new Date(duty.endUtc);
    return [{
      id,
      assignment,
      fltNum: (duty.label ?? '').trim(),
      dutyType: label,
      localStart: wallClockInZone(start, zone),
      localEnd: wallClockInZone(end, zone),
      startUTC: duty.startUtc,
      endUTC: duty.endUtc,
      briefStart: duty.startUtc,
      crewId: response.crew.crewId,
      carrier: response.airline,
      baseOffsetMin: isMobileRosterAirline(response.airline) ? 0 : undefined,
      airportCode: duty.departureAirport ?? undefined,
      raw: duty,
    }];
  });
}

export async function fetchEkRoster(
  apiBaseUrl: string,
  credentials: EkRosterCredentials,
  signal?: AbortSignal,
): Promise<EkRosterResponse> {
  const airline = credentials.airline?.trim().toUpperCase() || 'EK';
  const path = isMobileRosterAirline(airline) ? '/mobile-roster/session' : '/crew-app/v1/roster';
  const url = `${apiBaseUrl.replace(/\/$/, '')}${path}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      airline,
      crewId: credentials.crewId.trim().toUpperCase(),
      password: credentials.password,
    }),
    signal,
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error('Invalid crew credentials');
    if (response.status === 404) throw new Error('Crew roster not found');
    throw new Error('EK roster service unavailable');
  }
  const payload = await response.json();
  return isMobileRosterAirline(airline) ? parseF8RosterEnvelope(payload) : parseEkRosterResponse(payload);
}
