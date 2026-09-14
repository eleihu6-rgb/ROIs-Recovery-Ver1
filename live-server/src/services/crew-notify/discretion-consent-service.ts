import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { env } from '../../config/index.js'
import { quoteIdentifier } from '../../utils/db-schema.js'
import { CrewNotifyServiceError, type CrewNotifyServiceOptions } from './crew-notify-service.js'

const dutyWindow = z.object({
  reportUtc: z.string().datetime(), releaseUtc: z.string().datetime(), fdpMin: z.number().int().nonnegative(),
}).strict().refine(v => Date.parse(v.releaseUtc) > Date.parse(v.reportUtc), 'Release must follow report')
export const discretionProposalSchema = z.object({
  airline: z.enum(['F8', 'ET']), pairingId: z.number().int().positive(), dutySeq: z.number().int().positive(),
  ruleSetId: z.number().int().positive(), before: dutyWindow, after: dutyWindow,
  extensionRequestedMin: z.number().int().positive(), reason: z.string().trim().min(1).max(500),
  expiresUtc: z.string().datetime(),
}).strict()
export type DiscretionProposal = z.infer<typeof discretionProposalSchema>
export type ConsentState = 'pending' | 'accepted' | 'rejected' | 'expired' | 'superseded'
/** One physical flight inside the duty the crew is being asked about. `revised*`
 *  carries the published estimate (or the recorded actual once operated) so the
 *  crew reads the delayed time next to the schedule, not prose. */
export interface ConsentDutyLeg {
  fltNum: string; depArp: string; arvArp: string
  schDepUtc: string | null; schArvUtc: string | null
  revisedDepUtc: string | null; revisedArvUtc: string | null
  delayMin: number
  /** True once the leg has a recorded actual departure that differs from schedule. */
  operated: boolean
}
/** Duty-level detail (FDP is a duty property, not a flight property): check-in /
 *  release, every flown leg with its schedule and revised time, and the FDP the
 *  crew is extending. An immutable snapshot carried with each consent request. */
export interface ConsentDutyDetail {
  pairingId: string; pairingLabel: string | null; dutySeq: string
  reportUtc: string; releaseUtc: string
  fdpBeforeMin: number; fdpAfterMin: number
  legs: ConsentDutyLeg[]
}
export interface ConsentRequest {
  discretionId: string; proposalId: string; crewId: string; captainCrewId: string; pairingId: string; dutyId: string;
  createdUtc: string; expiresUtc: string; plannedFdpMin: number; actualFdpMin: number;
  extensionRequestedMin: number; state: ConsentState; requester: string; sourceHash: string;
  proposal: DiscretionProposal; decidedUtc?: string; decidedBy?: string; decisionReason?: string; idempotencyKey?: string; supersededBy?: string;
  schDep: string; schArv: string; estDep: string; estArv: string;
  duty?: ConsentDutyDetail;
}
const schemaOf = (o: CrewNotifyServiceOptions) => quoteIdentifier(o.liveSchema ?? env.LIVE_SCHEMA)
const nowOf = (o: CrewNotifyServiceOptions) => o.now ?? new Date()
const utcIso = (value: unknown) => {
  const text = String(value)
  return new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(text) ? text : `${text}Z`).toISOString()
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

// Hash authoritative operational records, not browser data. Full roster context
// catches following-duty/rest changes as well as edits to this pairing.
export async function consentSource(o: CrewNotifyServiceOptions, pairingId: number, dutySeq: number) {
  const s = schemaOf(o)
  const result = await o.pgPool.query<{ source: { segments: Array<Record<string, unknown>>; flights: Array<Record<string, unknown>>; crews: string[]; [key: string]: unknown } }>(`
    with selected_segments as (
      select ps.* from ${s}.pairing_segment ps
      where ps.pairing_id = $1 and ps.duty_seq = $2 and ps.is_deleted = 0
    ), recipients as (
      select distinct rf.crew_id from ${s}.roster_flight rf
      join selected_segments ps on ps.flt_id = rf.flt_id
      where rf.pairing_id = $1 and rf.is_deleted = 0
    ) select jsonb_build_object(
      'pairing', (select to_jsonb(p) from ${s}.pairing p where p.id = $1 and p.is_deleted = 0),
      'segments', coalesce((select jsonb_agg(to_jsonb(ps) order by ps.id) from selected_segments ps), '[]'::jsonb),
      'flights', coalesce((select jsonb_agg(to_jsonb(f) order by f.id) from ${s}.flight f
        where f.id in (select flt_id from selected_segments)), '[]'::jsonb),
      'airlines', coalesce((select jsonb_agg(distinct c.filiale) from ${s}.crew c where c.crew_id in (select crew_id from recipients)), '[]'::jsonb),
      'crews', coalesce((select jsonb_agg(crew_id order by crew_id) from recipients), '[]'::jsonb),
      'rosters', coalesce((select jsonb_agg(to_jsonb(rf) order by rf.id) from ${s}.roster_flight rf
        where rf.crew_id in (select crew_id from recipients) and rf.is_deleted = 0), '[]'::jsonb)
    ) as source`, [pairingId, dutySeq])
  const source = result.rows[0]?.source
  if (!source?.segments.length || !source.crews.length || !source.pairing) {
    throw new CrewNotifyServiceError(409, 'The duty has no current assigned crew.')
  }
  const pairingLabel = (source.pairing as { pairing_label?: string | null } | null)?.pairing_label ?? null
  return { sourceHash: hash(source), crewIds: source.crews, segments: source.segments, flights: source.flights, airlines: source.airlines as string[], pairingLabel }
}

/** Build the crew-facing duty detail from the authoritative segments + flights. */
export function buildDutyDetail(
  source: { segments: Array<Record<string, unknown>>; flights: Array<Record<string, unknown>>; pairingLabel: string | null },
  before: { reportUtc: string; releaseUtc: string; fdpMin: number },
  after: { reportUtc: string; releaseUtc: string; fdpMin: number },
  pairingId: number, dutySeq: number,
): ConsentDutyDetail {
  const flightsById = new Map(source.flights.map(f => [String(f.id), f]))
  const optionalIso = (value: unknown) => (value == null ? null : utcIso(value))
  const legs = [...source.segments]
    .sort((a, b) => Number(a.seg_seq) - Number(b.seg_seq))
    .map(segment => {
      const flight = flightsById.get(String(segment.flt_id)) ?? {}
      const schDepUtc = optionalIso(flight.sch_dep_dt_utc)
      const schArvUtc = optionalIso(flight.sch_arv_dt_utc)
      const revisedDepUtc = optionalIso(flight.est_dep_dt_utc) ?? optionalIso(flight.act_dep_dt_utc)
      const revisedArvUtc = optionalIso(flight.est_arv_dt_utc) ?? optionalIso(flight.act_arv_dt_utc)
      const delayMin = schDepUtc && revisedDepUtc
        ? Math.max(Math.round((Date.parse(revisedDepUtc) - Date.parse(schDepUtc)) / 60000), 0) : 0
      const actDepUtc = optionalIso(flight.act_dep_dt_utc)
      return {
        fltNum: String(segment.flt_num ?? flight.flt_num ?? ''),
        depArp: String(segment.dep_arp ?? flight.dep_arp ?? ''),
        arvArp: String(segment.arv_arp ?? flight.arv_arp ?? ''),
        schDepUtc, schArvUtc, revisedDepUtc, revisedArvUtc, delayMin,
        operated: actDepUtc != null && schDepUtc != null && actDepUtc !== schDepUtc,
      }
    })
  return {
    pairingId: String(pairingId), pairingLabel: source.pairingLabel, dutySeq: String(dutySeq),
    reportUtc: before.reportUtc, releaseUtc: before.releaseUtc,
    fdpBeforeMin: before.fdpMin, fdpAfterMin: after.fdpMin, legs,
  }
}

export async function prepareConsent(o: CrewNotifyServiceOptions, pairingId: number, dutySeq: number, requester?: string) {
  const source = await consentSource(o, pairingId, dutySeq)
  const segment = [...source.segments].sort((a, b) => Number(a.seg_seq) - Number(b.seg_seq))[0]
  const lastSegment = [...source.segments].sort((a, b) => Number(b.seg_seq) - Number(a.seg_seq))[0]
  const unchangedSchedule = source.flights.every(f =>
    ['dep', 'arv'].every(side => ['est', 'act'].every(kind => f[`${kind}_${side}_dt_utc`] == null
      || Date.parse(String(f[`${kind}_${side}_dt_utc`])) === Date.parse(String(f[`sch_${side}_dt_utc`])))))
  const window = (kind: 'sch' | 'act') => {
    const report = segment.brief_start_utc ?? segment[`duty_${kind}_str_dt_utc`]
    const release = lastSegment.debrief_end_utc ?? segment[`duty_${kind}_end_dt_utc`]
    // No revised operational time means the calculated scheduled duty is still
    // the current duty. A changed estimate cannot use this baseline fallback.
    const fdp = segment[`duty_${kind}_fdp_min`] ?? (kind === 'act' && unchangedSchedule ? segment.duty_sch_fdp_min : null)
    if (!report || !release || fdp == null || !Number.isFinite(Number(fdp))) {
      throw new CrewNotifyServiceError(409, 'Authoritative duty report, release and FDP values must be calculated before requesting agreement.')
    }
    return { reportUtc: utcIso(report), releaseUtc: utcIso(release), fdpMin: Number(fdp) }
  }
  let previous: Awaited<ReturnType<typeof getControllerConsent>> | null = null
  let previousProposal: DiscretionProposal | null = null
  if (requester) {
    const latest = await o.pgPool.query<{ payload: ConsentRequest }>(`select payload from ${schemaOf(o)}.crew_notification
      where notif_type = 'fdp_discretion' and related_pairing_id = $1 and related_duty_id = $2
        and payload->>'requester' = $3 order by seq desc limit 1`, [String(pairingId), String(dutySeq), requester])
    if (latest.rows[0]) {
      previous = await getControllerConsent(o, latest.rows[0].payload.proposalId, requester)
      previousProposal = latest.rows[0].payload.proposal
    }
  }
  if (source.airlines?.length !== 1 || !['F8', 'ET'].includes(source.airlines[0])) throw new CrewNotifyServiceError(409, 'Assigned crews must share a supported crew-app airline.')
  const before = window('sch')
  const after = window('act')
  const duty = buildDutyDetail(source, before, after, pairingId, dutySeq)
  return { airline: source.airlines[0] as 'F8' | 'ET', before, after, duty, pairingLabel: source.pairingLabel, crewIds: source.crewIds, sourceHash: source.sourceHash, previous, previousProposal }
}

export async function createConsent(o: CrewNotifyServiceOptions, proposal: DiscretionProposal, requester: string) {
  if (Date.parse(proposal.expiresUtc) <= nowOf(o).getTime()) throw new CrewNotifyServiceError(400, 'Request expiry must be in the future.')
  const source = await consentSource(o, proposal.pairingId, proposal.dutySeq)
  const canonical = await prepareConsent(o, proposal.pairingId, proposal.dutySeq)
  const sameWindow = (a: typeof proposal.before, b: typeof proposal.before) =>
    Date.parse(a.reportUtc) === Date.parse(b.reportUtc) && Date.parse(a.releaseUtc) === Date.parse(b.releaseUtc) && a.fdpMin === b.fdpMin
  if (proposal.airline !== canonical.airline || !sameWindow(proposal.before, canonical.before) || !sameWindow(proposal.after, canonical.after)
    || canonical.sourceHash !== source.sourceHash) {
    throw new CrewNotifyServiceError(409, 'Duty details changed. Reload the authoritative proposal before sending.')
  }
  const proposalId = randomUUID()
  const requests: ConsentRequest[] = source.crewIds.map(crewId => ({
    discretionId: randomUUID(), proposalId, crewId, captainCrewId: '', pairingId: String(proposal.pairingId),
    dutyId: String(proposal.dutySeq), createdUtc: nowOf(o).toISOString(), expiresUtc: proposal.expiresUtc,
    plannedFdpMin: proposal.before.fdpMin, actualFdpMin: proposal.after.fdpMin,
    extensionRequestedMin: proposal.extensionRequestedMin, state: 'pending', requester, sourceHash: source.sourceHash, proposal,
    schDep: proposal.before.reportUtc, schArv: proposal.before.releaseUtc,
    estDep: proposal.after.reportUtc, estArv: proposal.after.releaseUtc,
    duty: canonical.duty,
  }))
  // One statement makes the complete recipient group atomic.
  await o.pgPool.query(`with inserted as (insert into ${schemaOf(o)}.crew_notification
    (airline, crew_id, notif_id, notif_type, title, body, related_pairing_id, related_duty_id, payload)
    select $1, item->>'crewId', item->>'discretionId', 'fdp_discretion', 'FDP extension agreement requested',
      $2, $3, $4, item from jsonb_array_elements($5::jsonb) item returning seq)
    update ${schemaOf(o)}.crew_notification set payload = payload || jsonb_build_object('supersededBy', $6::text)
    where notif_type = 'fdp_discretion' and related_pairing_id = $3 and related_duty_id = $4
      and payload->>'requester' = $7 and payload->>'proposalId' <> $6 and not (payload ? 'supersededBy')`,
  [proposal.airline, proposal.reason, String(proposal.pairingId), String(proposal.dutySeq), JSON.stringify(requests), proposalId, requester])
  return { proposalId, requests, consentComplete: false, proceedAllowed: false as const,
    proceedReason: 'Crew agreement and an independent regulatory assessment are required.' }
}

async function currentState(o: CrewNotifyServiceOptions, request: ConsentRequest): Promise<ConsentRequest> {
  if (request.supersededBy) return { ...request, state: 'superseded' }
  if (Date.parse(request.expiresUtc) <= nowOf(o).getTime()) return { ...request, state: 'expired' }
  try {
    const source = await consentSource(o, Number(request.pairingId), Number(request.dutyId))
    if (source.sourceHash !== request.sourceHash) return { ...request, state: 'superseded' }
  } catch (err) {
    if (err instanceof CrewNotifyServiceError && err.statusCode === 409) return { ...request, state: 'superseded' }
    throw err
  }
  return request
}

export async function getCrewConsent(o: CrewNotifyServiceOptions, input: { airline: string; crewId: string; discretionId: string }) {
  const result = await o.pgPool.query<{ payload: ConsentRequest }>(`select payload from ${schemaOf(o)}.crew_notification
    where airline = $1 and crew_id = $2 and notif_id = $3 and notif_type = 'fdp_discretion'`,
  [input.airline, input.crewId, input.discretionId])
  if (!result.rows[0]) throw new CrewNotifyServiceError(404, 'Request not found.')
  return currentState(o, result.rows[0].payload)
}

export async function listOpenConsents(o: CrewNotifyServiceOptions, airline: string, crewId: string) {
  const result = await o.pgPool.query<{ payload: ConsentRequest }>(`select payload from ${schemaOf(o)}.crew_notification
    where airline = $1 and crew_id = $2 and notif_type = 'fdp_discretion'
      and payload->>'state' = 'pending' and (payload->>'expiresUtc')::timestamptz > $3
    order by seq desc`, [airline, crewId, nowOf(o).toISOString()])
  const requests = await Promise.all(result.rows.map(row => currentState(o, row.payload)))
  return requests.filter(r => r.state === 'pending')
}

/** Every FDP-discretion request this crew has received, newest first — the
 *  pending ones plus the terminal history (accepted / rejected / expired /
 *  superseded) that the crew-app Home "Discretion" page lists. */
export async function listConsents(o: CrewNotifyServiceOptions, airline: string, crewId: string, limit = 30) {
  const result = await o.pgPool.query<{ payload: ConsentRequest }>(`select payload from ${schemaOf(o)}.crew_notification
    where airline = $1 and crew_id = $2 and notif_type = 'fdp_discretion'
    order by seq desc limit $3`, [airline, crewId, Math.min(Math.max(limit, 1), 100)])
  return Promise.all(result.rows.map(row => currentState(o, row.payload)))
}

export async function getControllerConsent(o: CrewNotifyServiceOptions, proposalId: string, requester: string) {
  const result = await o.pgPool.query<{ payload: ConsentRequest }>(`select payload from ${schemaOf(o)}.crew_notification
    where notif_type = 'fdp_discretion' and payload->>'proposalId' = $1 and payload->>'requester' = $2
    order by crew_id`, [proposalId, requester])
  if (!result.rows.length) throw new CrewNotifyServiceError(404, 'Request not found.')
  const requests = await Promise.all(result.rows.map(row => currentState(o, row.payload)))
  const consentComplete = requests.length > 0 && requests.every(r => r.state === 'accepted')
  return { proposalId, requests, consentComplete, proceedAllowed: false as const,
    proceedReason: consentComplete ? 'All crew agreed. Independent regulatory validation is still required before execution.' : 'All required crew must agree to the unchanged proposal.' }
}

export async function decideConsent(o: CrewNotifyServiceOptions, input: {
  airline: string; crewId: string; discretionId: string; decision: 'accept' | 'reject'; idempotencyKey: string; reason?: string;
}) {
  const request = await getCrewConsent(o, input)
  const state = input.decision === 'accept' ? 'accepted' : 'rejected'
  if (request.state === state && request.idempotencyKey === input.idempotencyKey) return request
  if (request.state !== 'pending') throw new CrewNotifyServiceError(409, `Request is ${request.state}; a new proposal is required.`)
  const decision = { state, decidedUtc: nowOf(o).toISOString(), decidedBy: input.crewId,
    decisionReason: input.reason ?? '', idempotencyKey: input.idempotencyKey }
  const result = await o.pgPool.query<{ payload: ConsentRequest }>(`update ${schemaOf(o)}.crew_notification
    set payload = payload || $4::jsonb where airline = $1 and crew_id = $2 and notif_id = $3
      and notif_type = 'fdp_discretion' and payload->>'state' = 'pending' returning payload`,
  [input.airline, input.crewId, input.discretionId, JSON.stringify(decision)])
  if (!result.rows[0]) {
    const latest = await getCrewConsent(o, input)
    if (latest.state === state && latest.idempotencyKey === input.idempotencyKey) return latest
    throw new CrewNotifyServiceError(409, 'Request already decided.')
  }
  return currentState(o, result.rows[0].payload)
}
