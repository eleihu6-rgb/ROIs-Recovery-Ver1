// Crew-app absence (sick leave) submission + history client.
//
// Mirrors the shape of ../notifications/notificationsApi.ts (plain global
// `fetch`, credentials in the POST body, live-server envelope unwrap, light
// zod parse) for the endpoints added by Crew Recovery Story 101 and its
// history follow-up.
//
// Backend contract (live-server — src/routes/crew-notify/crew-notify.ts).
// Served for every airline whose mobile roster live-server answers
// (F8 / ET / EK; `usesLiveServerAbsence`): Emirates keeps its notifications on
// the EVACC gateway, but the crew-recovery absence record is ROIS's.
//   POST /crew-app/v1/absence { airline, crewId, password, type, fromDate, toDate, note? }
//   -> { code, data: { absenceId, assignment, fromDate, toDate, removedPairingIds,
//        retainedPairingIds, groundDays, notificationId }, message }
//   POST /crew-app/v1/absences { airline, crewId, password, fromDate, toDate }
//   -> { code, data: { absences: [{ id, absenceType, assignment, fromDate,
//        toDate, status, note, createdAt }] }, message }
//      The window is the caller's; the server scopes the rows to the verified
//      crew id and returns requests overlapping it, cancelled ones included.
//
// The routes validate the body with zod BEFORE auth: a malformed body (e.g. bad
// date format) comes back as HTTP 200 with envelope `code: 400` and the zod
// error text in `message`; a service-level rejection (unsupported type, range
// too long, credential failure, overlapping absence) comes back as a real HTTP
// 400/401/403/409 with a human `message` in the same envelope shape
// (src/services/absence/crew-absence-service.ts). Both paths are normalized
// here into a single thrown `Error` carrying the server's message, falling
// back to a generic per-status message only when the body can't be read.
import {z} from 'zod';
import {airlineByCode} from '../auth/airlines';
import {usesLiveServerAbsence} from '../travel/ekRosterApi';

export type AbsenceType = 'sick';

export interface SubmitAbsenceParams {
  airline: string;
  crewId: string;
  password: string;
  type: AbsenceType;
  /** Crew-base local date, 'YYYY-MM-DD'. */
  fromDate: string;
  /** Crew-base local date, 'YYYY-MM-DD', inclusive. */
  toDate: string;
  note?: string;
}

export interface ListAbsencesParams {
  airline: string;
  crewId: string;
  password: string;
  /** Crew-base local date, 'YYYY-MM-DD'. */
  fromDate: string;
  /** Crew-base local date, 'YYYY-MM-DD', inclusive. */
  toDate: string;
}

const absenceResultSchema = z
  .object({
    absenceId: z.number(),
    assignment: z.string(),
    fromDate: z.string(),
    toDate: z.string(),
    removedPairingIds: z.array(z.number()).default([]),
    retainedPairingIds: z.array(z.number()).optional(),
    groundDays: z.number(),
    notificationId: z.string().nullable(),
  })
  .passthrough();

export type SubmitAbsenceResult = z.infer<typeof absenceResultSchema>;

const absenceRecordSchema = z
  .object({
    id: z.number(),
    absenceType: z.string(),
    assignment: z.string(),
    fromDate: z.string(),
    toDate: z.string(),
    status: z.string(),
    note: z.string(),
    createdAt: z.string(),
  })
  .passthrough();

/** One submitted absence row as the crew sees it. */
export type AbsenceRecord = z.infer<typeof absenceRecordSchema>;

const absenceListSchema = z.object({absences: z.array(absenceRecordSchema)}).passthrough();

// live-server (F8/ET) wraps every response in `{ code, data, message }`, same
// as notificationsApi — see unwrapLiveServerEnvelope there.
const envelopeSchema = z
  .object({code: z.number(), data: z.unknown(), message: z.string().optional()})
  .passthrough();

function envelopeMessage(payload: unknown): string | undefined {
  const parsed = envelopeSchema.safeParse(payload);
  return parsed.success ? parsed.data.message : undefined;
}

function submitFallbackForStatus(status: number): string {
  if (status === 400) return 'Invalid absence request.';
  if (status === 401) return 'Invalid crew credentials';
  if (status === 403) return 'Not authorised for this request';
  if (status === 409) return 'An absence already covers part of this range.';
  return 'Unable to submit the absence request.';
}

function historyFallbackForStatus(status: number): string {
  if (status === 400) return 'Invalid absence request.';
  if (status === 401) return 'Invalid crew credentials';
  if (status === 403) return 'Not authorised for this request';
  return 'Unable to load your submitted requests.';
}

/** Crew-base local calendar date, the 'YYYY-MM-DD' the absence contract uses. */
export function toApiDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Inclusive first → last day of the calendar month containing `now`, in the
 * device's local calendar — the scope of the Absence history screen.
 */
export function currentMonthRange(now: Date = new Date()): {fromDate: string; toDate: string} {
  const year = now.getFullYear();
  const month = now.getMonth();
  // Day 0 of the next month is the last day of this one (handles leap years).
  return {fromDate: toApiDate(new Date(year, month, 1)), toDate: toApiDate(new Date(year, month + 1, 0))};
}

/** Base URL of the crew-app contract, or a thrown reason why this airline has none.
 *  Absence follows the ROSTER service, not `apiBaseUrl`: Emirates keeps
 *  notifications/FDP on the EVACC gateway while its roster — and therefore its
 *  absence record — is ROIS live-server (see Airline.rosterApiBaseUrl). */
function crewAppUrl(airline: string): string {
  if (!usesLiveServerAbsence(airline)) {
    throw new Error(`${airlineByCode(airline).name} crew app does not support absence requests yet`);
  }
  const config = airlineByCode(airline);
  const apiBaseUrl = config.rosterApiBaseUrl ?? config.apiBaseUrl;
  if (!apiBaseUrl) {
    throw new Error(`${airlineByCode(airline).name} crew API is not configured`);
  }
  return `${apiBaseUrl.replace(/\/$/, '')}/crew-app/v1`;
}

/**
 * POSTs one crew-app absence request (submit + history share the same
 * credential-in-body call and envelope unwrap) and returns the unwrapped
 * `data`. Errors are normalized per the file header.
 */
async function postAbsence(
  credentials: {airline: string; crewId: string; password: string},
  path: string,
  body: Record<string, unknown>,
  fallbackForStatus: (status: number) => string,
  signal?: AbortSignal,
): Promise<unknown> {
  const airline = (credentials.airline || '').trim().toUpperCase();
  const url = `${crewAppUrl(airline)}${path}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      airline,
      crewId: credentials.crewId.trim().toUpperCase(),
      password: credentials.password,
      ...body,
    }),
    signal,
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // No/invalid body — fall through to the status-based message below.
  }

  if (!response.ok) {
    throw new Error(envelopeMessage(payload) ?? fallbackForStatus(response.status));
  }

  const parsedEnvelope = envelopeSchema.safeParse(payload);
  if (!parsedEnvelope.success) {
    throw new Error('Invalid absence response');
  }
  if (parsedEnvelope.data.code !== 200) {
    throw new Error(parsedEnvelope.data.message ?? fallbackForStatus(parsedEnvelope.data.code));
  }

  return parsedEnvelope.data.data;
}

export async function submitAbsence(
  params: SubmitAbsenceParams,
  signal?: AbortSignal,
): Promise<SubmitAbsenceResult> {
  const data = await postAbsence(
    params,
    '/absence',
    {
      type: params.type,
      fromDate: params.fromDate,
      toDate: params.toDate,
      ...(params.note?.trim() ? {note: params.note.trim()} : {}),
    },
    submitFallbackForStatus,
    signal,
  );

  const result = absenceResultSchema.safeParse(data);
  if (!result.success) {
    throw new Error('Invalid absence response');
  }
  return result.data;
}

/**
 * The crew's own submitted absences overlapping the window, newest first.
 * `fromDate`/`toDate` are the scope the caller passes — the history screen
 * passes `currentMonthRange()`.
 */
export async function listAbsences(
  params: ListAbsencesParams,
  signal?: AbortSignal,
): Promise<AbsenceRecord[]> {
  const data = await postAbsence(
    params,
    '/absences',
    {fromDate: params.fromDate, toDate: params.toDate},
    historyFallbackForStatus,
    signal,
  );

  const result = absenceListSchema.safeParse(data);
  if (!result.success) {
    throw new Error('Invalid absence response');
  }
  return result.data.absences;
}
