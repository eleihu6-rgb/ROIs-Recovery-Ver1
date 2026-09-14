import { describe, expect, it, vi } from 'vitest'
vi.mock('../../../config/index.js', () => ({ env: { LIVE_SCHEMA: 'f8_sit_live' } }))
import { createConsent, decideConsent, discretionProposalSchema, getControllerConsent, getCrewConsent, listConsents, prepareConsent, type ConsentRequest } from '../discretion-consent-service.js'
import type { CrewNotifyServiceOptions } from '../crew-notify-service.js'
const now = new Date('2026-09-12T10:00:00Z')
const proposal = discretionProposalSchema.parse({
  airline: 'ET', pairingId: 987654, dutySeq: 1, ruleSetId: 1,
  before: { reportUtc: '2026-09-12T08:00:00Z', releaseUtc: '2026-09-12T18:00:00Z', fdpMin: 570 },
  after: { reportUtc: '2026-09-12T08:00:00Z', releaseUtc: '2026-09-12T19:00:00Z', fdpMin: 630 },
  extensionRequestedMin: 60, reason: 'Technical delay on return to base', expiresUtc: '2026-09-12T11:00:00Z',
})
// Complete ADD–ASO–ADD duty and all assigned seats; source hash includes unchanged outbound leg.
const source = { airlines: ['ET'], pairing: { id: 987654 }, segments: [{ id: 1, flt_id: 21, duty_sch_str_dt_utc: proposal.before.reportUtc, duty_sch_end_dt_utc: proposal.before.releaseUtc, duty_sch_fdp_min: 570, duty_act_str_dt_utc: proposal.after.reportUtc, duty_act_end_dt_utc: proposal.after.releaseUtc, duty_act_fdp_min: 630 }, { id: 2, flt_id: 22 }],
  flights: [{ id: 21, dep_arp: 'ADD', arv_arp: 'ASO' }, { id: 22, dep_arp: 'ASO', arv_arp: 'ADD' }],
  crews: ['S2CA', 'S2FO'], rosters: [{ crew_id: 'S2CA', flt_id: 21 }, { crew_id: 'S2CA', flt_id: 22 }, { crew_id: 'S2FO', flt_id: 21 }, { crew_id: 'S2FO', flt_id: 22 }] }
function pool() {
  const rows: ConsentRequest[] = []
  const state = { source }
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (sql.includes('with selected_segments')) return { rows: [{ source: state.source }] }
    if (sql.includes('insert into')) { rows.forEach(r => { r.supersededBy = String(values[5]) }); rows.push(...JSON.parse(String(values[4]))); return { rows: [] } }
    if (sql.includes('update ')) {
      const row = rows.find(r => r.discretionId === values[2] && r.crewId === values[1] && r.proposal.airline === values[0] && r.state === 'pending')
      if (!row) return { rows: [] }
      Object.assign(row, JSON.parse(String(values[3])))
      return { rows: [{ payload: row }] }
    }
    const found = sql.includes("payload->>'proposalId'")
      ? rows.filter(r => r.proposalId === values[0] && r.requester === values[1])
      : sql.includes('order by seq desc limit')
        ? rows.filter(r => r.proposal.airline === values[0] && r.crewId === values[1])
        : rows.filter(r => r.proposal.airline === values[0] && r.crewId === values[1] && r.discretionId === values[2])
    return { rows: found.map(payload => ({ payload })) }
  })
  return { rows, state, query, options: { pgPool: { query }, now } as unknown as CrewNotifyServiceOptions }
}
describe('FDP consent communication', () => {
  it('derives all assigned recipients, keeps pending distinct and never grants legality permission', async () => {
    const p = pool(); const created = await createConsent(p.options, proposal, 'controller')
    expect(created.requests.map(r => r.crewId)).toEqual(['S2CA', 'S2FO'])
    expect(created.requests[0].proposal).toEqual(proposal)
    expect(created.consentComplete).toBe(false)
    const status = await getControllerConsent(p.options, created.proposalId, 'controller')
    expect(status.proceedAllowed).toBe(false)
    await expect(getControllerConsent(p.options, created.proposalId, 'other-controller')).rejects.toMatchObject({ statusCode: 404 })
  })
  it('rejects caller-invented before/after FDP and missing canonical counters', async () => {
    const p = pool()
    await expect(createConsent(p.options, { ...proposal, after: { ...proposal.after, fdpMin: 600 } }, 'controller')).rejects.toMatchObject({ statusCode: 409 })
    expect(p.rows).toHaveLength(0)
    p.state.source = { ...source, segments: [] }
    await expect(createConsent(p.options, proposal, 'controller')).rejects.toMatchObject({ statusCode: 409 })
  })
  it('authenticates recipient ownership and airline scope; No never completes consent', async () => {
    const p = pool(); const created = await createConsent(p.options, proposal, 'controller')
    const input = { airline: 'ET', crewId: 'S2CA', discretionId: created.requests[0].discretionId }
    await expect(getCrewConsent(p.options, { ...input, crewId: 'S2FO' })).rejects.toMatchObject({ statusCode: 404 })
    await expect(getCrewConsent(p.options, { ...input, airline: 'F8' })).rejects.toMatchObject({ statusCode: 404 })
    await decideConsent(p.options, { ...input, decision: 'reject', idempotencyKey: 'no' })
    expect((await getControllerConsent(p.options, created.proposalId, 'controller')).consentComplete).toBe(false)
    await expect(decideConsent(p.options, { ...input, decision: 'accept', idempotencyKey: 'yes' })).rejects.toMatchObject({ statusCode: 409 })
  })
  it('accepts all replies idempotently but keeps regulatory execution blocked', async () => {
    const p = pool(); const created = await createConsent(p.options, proposal, 'controller')
    for (const r of created.requests) {
      const input = { airline: 'ET', crewId: r.crewId, discretionId: r.discretionId, decision: 'accept' as const, idempotencyKey: r.crewId }
      expect((await decideConsent(p.options, input)).state).toBe('accepted')
      expect((await decideConsent(p.options, input)).state).toBe('accepted')
    }
    expect(await getControllerConsent(p.options, created.proposalId, 'controller')).toMatchObject({ consentComplete: true, proceedAllowed: false })
    const newer = await createConsent(p.options, { ...proposal, extensionRequestedMin: 90 }, 'controller')
    expect(newer.consentComplete).toBe(false)
    expect(newer.proposalId).not.toBe(created.proposalId)
    expect((await getControllerConsent(p.options, created.proposalId, 'controller')).requests.every(r => r.state === 'superseded')).toBe(true)
  })
  it('invalidates changed flight/roster state and expired proposals before accepting', async () => {
    const p = pool(); const created = await createConsent(p.options, proposal, 'controller')
    const input = { airline: 'ET', crewId: 'S2CA', discretionId: created.requests[0].discretionId }
    p.state.source = { ...source, flights: [...source.flights, { id: 23, dep_arp: 'ASO', arv_arp: 'ADD' }] }
    expect((await getCrewConsent(p.options, input)).state).toBe('superseded')
    await expect(decideConsent(p.options, { ...input, decision: 'accept', idempotencyKey: 'yes' })).rejects.toMatchObject({ statusCode: 409 })
    expect((await getCrewConsent({ ...p.options, now: new Date('2026-09-12T12:00:00Z') }, input)).state).toBe('expired')
  })
  it('carries duty-level detail (check-in, legs, FDP before/after) so the crew sees the whole duty', async () => {
    const p = pool()
    const prepared = await prepareConsent(p.options, 987654, 1, 'controller')
    expect(prepared.duty).toMatchObject({ dutySeq: '1', fdpBeforeMin: 570, fdpAfterMin: 630 })
    expect(prepared.duty.legs.map(l => [l.depArp, l.arvArp])).toEqual([['ADD', 'ASO'], ['ASO', 'ADD']])
    const created = await createConsent(p.options, proposal, 'controller')
    // The immutable snapshot is stored with every recipient, not just the controller reply.
    expect(created.requests[0].duty).toEqual(prepared.duty)
  })
  it('lists the crew FDP-discretion history including terminal states', async () => {
    const p = pool(); const created = await createConsent(p.options, proposal, 'controller')
    await decideConsent(p.options, { airline: 'ET', crewId: 'S2CA', discretionId: created.requests[0].discretionId, decision: 'accept', idempotencyKey: 'y' })
    const all = await listConsents(p.options, 'ET', 'S2CA')
    expect(all.map(r => r.crewId)).toEqual(['S2CA'])
    expect(all[0].state).toBe('accepted')
  })
})
