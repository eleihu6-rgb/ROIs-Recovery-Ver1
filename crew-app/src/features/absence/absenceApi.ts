// Crew-app absence (sick leave) submission client.
//
// Mirrors the shape of ../notifications/notificationsApi.ts (plain global
// `fetch`, credentials in the POST body, live-server envelope unwrap, light
// zod parse) for the one new endpoint added by Crew Recovery Story 101.
//
// Backend contract (live-server, ROIS live-server airlines only —
// src/routes/crew-notify/crew-notify.ts):
//   POST /crew-app/v1/absence { airline, crewId, password, type, fromDate, toDate, note? }
//   -> { code, data: { absenceId, assignment, fromDate, toDate, removedPairingIds,
//        retainedPairingIds, groundDays, notificationId }, message }
//
// The route validates the body with zod BEFORE auth: a malformed body (e.g. bad
// date format) comes back as HTTP 200 with envelope `code: 400` and the zod
// error text in `message`; a service-level rejection (unsupported type, range
// too long, credential failure, overlapping absence) comes back as a real HTTP
// 400/401/403/409 with a human `message` in the same envelope shape
// (src/services/absence/crew-absence-service.ts). Both paths are normalized
// here into a single thrown `Error` carrying the server's message, falling
// back to a generic per-status message only when the body can't be read.
import {z} from 'zod';
import {airlineByCode} from '../auth/airlines';
import {usesLiveServerEnvelope} from '../travel/ekRosterApi';

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

// live-server (F8/ET) wraps every response in `{ code, data, message }`, same
// as notificationsApi — see unwrapLiveServerEnvelope there.
const envelopeSchema = z
  .object({code: z.number(), data: z.unknown(), message: z.string().optional()})
  .passthrough();

function envelopeMessage(payload: unknown): string | undefined {
  const parsed = envelopeSchema.safeParse(payload);
  return parsed.success ? parsed.data.message : undefined;
}

function fallbackForStatus(status: number): string {
  if (status === 400) return 'Invalid absence request.';
  if (status === 401) return 'Invalid crew credentials';
  if (status === 403) return 'Not authorised for this request';
  if (status === 409) return 'An absence already covers part of this range.';
  return 'Unable to submit the absence request.';
}

function normalizeCredentials(p: SubmitAbsenceParams) {
  return {
    airline: (p.airline || '').trim().toUpperCase(),
    crewId: p.crewId.trim().toUpperCase(),
    password: p.password,
    type: p.type,
    fromDate: p.fromDate,
    toDate: p.toDate,
    ...(p.note?.trim() ? {note: p.note.trim()} : {}),
  };
}

export async function submitAbsence(
  params: SubmitAbsenceParams,
  signal?: AbortSignal,
): Promise<SubmitAbsenceResult> {
  const normalized = normalizeCredentials(params);
  if (!usesLiveServerEnvelope(normalized.airline)) {
    throw new Error(`${airlineByCode(normalized.airline).name} crew app does not support absence requests yet`);
  }
  const apiBaseUrl = airlineByCode(normalized.airline).apiBaseUrl;
  if (!apiBaseUrl) {
    throw new Error(`${airlineByCode(normalized.airline).name} crew API is not configured`);
  }

  const url = `${apiBaseUrl.replace(/\/$/, '')}/crew-app/v1/absence`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(normalized),
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

  const result = absenceResultSchema.safeParse(parsedEnvelope.data.data);
  if (!result.success) {
    throw new Error('Invalid absence response');
  }
  return result.data;
}
