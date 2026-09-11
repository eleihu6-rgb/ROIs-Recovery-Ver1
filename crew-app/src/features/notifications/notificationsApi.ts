// Crew-app notification + FDP-discretion client.
//
// Mirrors the shape of ../travel/ekRosterApi.ts exactly: plain global `fetch`
// (no axios), credentials in the POST body (no auth header), status-code →
// human Error mapping, optional AbortSignal, and a light zod parse of the
// response. All four endpoints append to an `apiBaseUrl` that already ends in
// `/api` (e.g. dev fallback `http://127.0.0.1:8000/api`), so the paths here are
// `/crew-app/v1/...`.
//
// Backend contract (ROIs-Suit-aiGen-EVACC · backend/crew_notify/router.py),
// gated behind ENABLE_EK_CREW_APP_TEST_GATEWAY=1:
//   POST /crew-app/v1/notifications                     {airline,crewId,password,since?}
//   POST /crew-app/v1/notifications/{notifId}/read      {airline,crewId,password}
//   POST /crew-app/v1/discretion/{discretionId}         {airline,crewId,password}
//   POST /crew-app/v1/discretion/{discretionId}/decision {airline,crewId,password,decision,idempotencyKey,reason?}
import {z} from 'zod';

export interface CrewNotifyCredentials {
  airline: string;
  crewId: string;
  password: string;
}

export type NotificationType =
  | 'flight_change'
  | 'fdp_discretion'
  | 'fdp_update'
  | 'info';

export type DiscretionState =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'expired'
  | 'superseded';

export type DecisionChoice = 'accept' | 'reject';

// ── zod schemas (passthrough — tolerate extra backend fields) ────────────────
const notificationSchema = z
  .object({
    notifId: z.string(),
    crewId: z.string(),
    type: z.string(),
    createdUtc: z.string(),
    title: z.string(),
    body: z.string(),
    status: z.string().optional().default('unread'),
    readUtc: z.string().nullable().optional(),
    seq: z.number().optional().default(0),
    relatedPairingId: z.string().nullable().optional(),
    relatedFlightId: z.string().nullable().optional(),
    relatedDutyId: z.string().nullable().optional(),
    discretionId: z.string().nullable().optional(),
  })
  .passthrough();

const auditSchema = z
  .object({
    event: z.string(),
    atUtc: z.string(),
    actor: z.string().nullable().optional(),
    detail: z.string().nullable().optional(),
  })
  .passthrough();

const discretionSchema = z
  .object({
    discretionId: z.string(),
    crewId: z.string(),
    captainCrewId: z.string(),
    pairingId: z.string(),
    dutyId: z.string(),
    createdUtc: z.string(),
    expiresUtc: z.string().nullable().optional(),
    plannedFdpMin: z.number().nullable().optional(),
    actualFdpMin: z.number().nullable().optional(),
    limitMin: z.number().nullable().optional(),
    extensionRequestedMin: z.number(),
    state: z.string(),
    decidedUtc: z.string().nullable().optional(),
    decidedBy: z.string().nullable().optional(),
    decisionReason: z.string().nullable().optional(),
    supersededBy: z.string().nullable().optional(),
    schDep: z.string().nullable().optional(),
    actDep: z.string().nullable().optional(),
    schArv: z.string().nullable().optional(),
    actArv: z.string().nullable().optional(),
    audit: z.array(auditSchema).optional().default([]),
  })
  .passthrough();

const listResponseSchema = z
  .object({
    cursor: z.number().optional().default(0),
    notifications: z.array(notificationSchema).default([]),
    openDiscretions: z.array(discretionSchema).default([]),
  })
  .passthrough();

export type CrewNotification = z.infer<typeof notificationSchema>;
export type DiscretionRequest = z.infer<typeof discretionSchema>;
export type NotificationsFeed = z.infer<typeof listResponseSchema>;

function normalizeCredentials(c: CrewNotifyCredentials) {
  return {
    airline: (c.airline || 'EK').trim().toUpperCase(),
    crewId: c.crewId.trim().toUpperCase(),
    password: c.password,
  };
}

function base(apiBaseUrl: string): string {
  return apiBaseUrl.replace(/\/$/, '');
}

// Shared status-code → human message mapping (matches ekRosterApi.ts).
function throwForStatus(status: number): never {
  if (status === 401) throw new Error('Invalid crew credentials');
  if (status === 403) throw new Error('Not authorised for this request');
  if (status === 404) throw new Error('Request not found');
  if (status === 409) throw new Error('Request already decided');
  throw new Error('Crew notification service unavailable');
}

async function postJson(
  url: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    throwForStatus(response.status);
  }
  return response.json();
}

export async function fetchNotifications(
  apiBaseUrl: string,
  credentials: CrewNotifyCredentials,
  since?: number,
  signal?: AbortSignal,
): Promise<NotificationsFeed> {
  const body = {...normalizeCredentials(credentials), ...(since ? {since} : {})};
  const raw = await postJson(`${base(apiBaseUrl)}/crew-app/v1/notifications`, body, signal);
  const result = listResponseSchema.safeParse(raw);
  if (!result.success) {
    throw new Error('Invalid notifications response');
  }
  return result.data;
}

export async function markNotificationRead(
  apiBaseUrl: string,
  credentials: CrewNotifyCredentials,
  notifId: string,
  signal?: AbortSignal,
): Promise<void> {
  await postJson(
    `${base(apiBaseUrl)}/crew-app/v1/notifications/${encodeURIComponent(notifId)}/read`,
    normalizeCredentials(credentials),
    signal,
  );
}

export async function fetchDiscretion(
  apiBaseUrl: string,
  credentials: CrewNotifyCredentials,
  discretionId: string,
  signal?: AbortSignal,
): Promise<DiscretionRequest> {
  const raw = await postJson(
    `${base(apiBaseUrl)}/crew-app/v1/discretion/${encodeURIComponent(discretionId)}`,
    normalizeCredentials(credentials),
    signal,
  );
  const result = discretionSchema.safeParse(raw);
  if (!result.success) {
    throw new Error('Invalid discretion response');
  }
  return result.data;
}

export async function submitDiscretionDecision(
  apiBaseUrl: string,
  credentials: CrewNotifyCredentials,
  discretionId: string,
  decision: DecisionChoice,
  idempotencyKey: string,
  reason?: string,
  signal?: AbortSignal,
): Promise<DiscretionRequest> {
  const body = {
    ...normalizeCredentials(credentials),
    decision,
    idempotencyKey,
    ...(reason ? {reason} : {}),
  };
  const raw = await postJson(
    `${base(apiBaseUrl)}/crew-app/v1/discretion/${encodeURIComponent(discretionId)}/decision`,
    body,
    signal,
  );
  const result = discretionSchema.safeParse(raw);
  if (!result.success) {
    throw new Error('Invalid discretion response');
  }
  return result.data;
}
