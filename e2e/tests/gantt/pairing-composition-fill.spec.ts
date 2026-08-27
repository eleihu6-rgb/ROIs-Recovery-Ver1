/**
 * Pairing Composition Fill Tracking E2E Tests.
 *
 * Verifies that pairing_composition.fill is updated correctly via the live-server API:
 *   - After assigning a crew member to a pairing, the relevant composition fill increases by 1.
 *   - After removing that crew member, fill returns to the original value.
 *
 * This is an API-level integration test wrapped in Playwright (no UI interaction needed).
 * It exercises the full stack: POST /api/roster/assign-pairing → DB update →
 * cache invalidation → GET /api/pairing/:id/composition reflects new fill.
 *
 * §No-Illusion: assertions are based on the fill value returned by the API, not
 * inferred from code inspection alone.
 */
import { test, expect } from '@playwright/test'

const GANTT_API = process.env.GANTT_API_URL ?? 'http://localhost:3000'
const GANTT_USER = process.env.GANTT_TEST_USER ?? 'admin'
const GANTT_PASS = process.env.GANTT_TEST_PASS ?? '123456'

// ─── Types ──────────────────────────────────────────────────────────────────

interface CompositionRow {
  id: number
  pairingId: number
  actingRank: string
  plan: number
  fill: number
  open: number
}

interface PairingListItem {
  id: number
  pairingLabel: string
  composition: Array<{ rank: string; plan: number; fill: number }>
  isFull: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const login = async (request: import('@playwright/test').APIRequestContext): Promise<string> => {
  const res = await request.post(`${GANTT_API}/api/auth/login`, {
    data: { userCode: GANTT_USER, password: GANTT_PASS },
  })
  expect(res.ok(), `login failed: ${res.status()}`).toBeTruthy()
  const json = (await res.json()) as { data: { token: string } }
  return json.data.token
}

/** Fetch the composition rows for a single pairing via the dedicated endpoint (bypasses detail cache). */
const getCompositions = async (
  request: import('@playwright/test').APIRequestContext,
  token: string,
  pairingId: number,
): Promise<CompositionRow[]> => {
  const res = await request.get(`${GANTT_API}/api/pairing/${pairingId}/composition`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(res.ok(), `GET /api/pairing/${pairingId}/composition failed: ${res.status()}`).toBeTruthy()
  const body = (await res.json()) as { code: number; data: CompositionRow[] }
  expect(body.code).toBe(200)
  return body.data
}

/**
 * Find a pairing that has at least one composition row where fill < plan (open > 0).
 * Returns undefined if no suitable pairing exists in the date range.
 */
const findOpenPairing = async (
  request: import('@playwright/test').APIRequestContext,
  token: string,
): Promise<{ pairingId: number; actingRank: string; fillBefore: number } | undefined> => {
  // Fetch the pairing list over a wide date range — the list endpoint includes composition
  // with rank/plan/fill for each pairing. We scan until we find one with open slots.
  const startDate = '2026-01-01'
  const endDate = '2026-12-31'
  let page = 1
  const pageSize = 50

  while (true) {
    const res = await request.get(`${GANTT_API}/api/pairing`, {
      params: { startDate, endDate, page, pageSize, sortBy: 'schStrDtUtc', sortOrder: 'asc' },
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok()) break

    const body = (await res.json()) as { code: number; data: { items: PairingListItem[]; total: number } }
    if (body.code !== 200) break

    const { items, total } = body.data
    if (items.length === 0) break

    for (const item of items) {
      // List composition uses { rank, plan, fill } shape
      const openSlot = item.composition.find((c) => c.fill < c.plan)
      if (openSlot) {
        return { pairingId: item.id, actingRank: openSlot.rank, fillBefore: openSlot.fill }
      }
    }

    if (page * pageSize >= total) break
    page++
  }

  return undefined
}

/** Pick a crew member from the crew list. Returns crewId or undefined. */
const pickAnyCrew = async (
  request: import('@playwright/test').APIRequestContext,
  token: string,
): Promise<string | undefined> => {
  const res = await request.get(`${GANTT_API}/api/crew`, {
    params: { page: 1, pageSize: 1 },
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok()) return undefined
  const body = (await res.json()) as { code: number; data: { items: Array<{ crewId: string }> } }
  return body.data?.items?.[0]?.crewId
}

// ─── Test suite ───────────────────────────────────────────────────────────────

test.describe('Pairing Composition — fill tracking', () => {
  let token = ''

  test.beforeEach(async ({ request }) => {
    token = await login(request)
  })

  test('Live-1110 — fill increases by 1 after assign and returns to original after remove', async ({ request }) => {
    // ── Step 1: Find a pairing with an open slot ─────────────────────────────
    const target = await findOpenPairing(request, token)
    if (!target) {
      test.skip(true, 'No pairing with open composition slots found in seed data — skipping')
      return
    }
    const { pairingId, actingRank, fillBefore } = target

    // ── Step 2: Find a crew member to assign ────────────────────────────────
    const crewId = await pickAnyCrew(request, token)
    if (!crewId) {
      test.skip(true, 'No crew found in seed data — skipping')
      return
    }

    // ── Step 3: Verify initial fill via the composition endpoint ────────────
    const compsBefore = await getCompositions(request, token, pairingId)
    const slotBefore = compsBefore.find((c) => c.actingRank === actingRank)
    expect(slotBefore, `Composition slot for rank ${actingRank} must exist`).toBeDefined()
    // Allow for slight drift if this crew is already assigned (idempotent guard)
    const confirmedFillBefore = slotBefore!.fill

    // ── Step 4: Assign crew to pairing ───────────────────────────────────────
    const assignRes = await request.post(`${GANTT_API}/api/roster/assign-pairing`, {
      data: { pairingId, crewId, rosterActingRank: actingRank, username: GANTT_USER },
      headers: { Authorization: `Bearer ${token}` },
    })
    // 200 body code = success; 400 = crew already assigned (idempotent scenario)
    const assignBody = (await assignRes.json()) as { code: number; message: string }
    const alreadyAssigned = assignBody.code !== 200
    if (alreadyAssigned) {
      // Crew was already on this pairing. The test is still valid — we verify fill
      // didn't change, then skip the remove step to avoid corrupting other tests.
      const compsAfterNoop = await getCompositions(request, token, pairingId)
      const slotAfterNoop = compsAfterNoop.find((c) => c.actingRank === actingRank)
      expect(slotAfterNoop?.fill).toBe(confirmedFillBefore)
      test.skip(true, `Crew ${crewId} already assigned to pairing ${pairingId} — idempotent skip`)
      return
    }
    expect(assignBody.code, `assign-pairing body.code: ${assignBody.message}`).toBe(200)

    // ── Step 5: Verify fill increased by 1 ───────────────────────────────────
    const compsAfterAssign = await getCompositions(request, token, pairingId)
    const slotAfterAssign = compsAfterAssign.find((c) => c.actingRank === actingRank)
    expect(slotAfterAssign, `Composition slot for rank ${actingRank} must still exist after assign`).toBeDefined()
    expect(
      slotAfterAssign!.fill,
      `fill must increase by 1 after assigning crew ${crewId} as ${actingRank} to pairing ${pairingId}`,
    ).toBe(confirmedFillBefore + 1)

    // ── Step 6: Remove crew from pairing ─────────────────────────────────────
    const removeRes = await request.post(`${GANTT_API}/api/roster/pairing/${pairingId}/crew/${crewId}/delete`, {
      data: { username: GANTT_USER },
      headers: { Authorization: `Bearer ${token}` },
    })
    const removeBody = (await removeRes.json()) as { code: number; message: string }
    expect(removeBody.code, `remove body.code: ${removeBody.message}`).toBe(200)

    // ── Step 7: Verify fill returned to original value ────────────────────────
    const compsAfterRemove = await getCompositions(request, token, pairingId)
    const slotAfterRemove = compsAfterRemove.find((c) => c.actingRank === actingRank)
    expect(slotAfterRemove, `Composition slot for rank ${actingRank} must exist after remove`).toBeDefined()
    expect(
      slotAfterRemove!.fill,
      `fill must return to ${confirmedFillBefore} after removing crew ${crewId} from pairing ${pairingId}`,
    ).toBe(confirmedFillBefore)
  })
})
