/**
 * Live-1100 / Scen-2421 — End-to-end: login, view Live gantt + violations,
 * then check Scenario 6 legality endpoint.
 *
 * Validates the Rust rule engine is the source of truth for violations:
 *   1. Login as admin.
 *   2. Live gantt loads crew rows. Rust-computed violations appear via
 *      __ganttTest.liveViolations() (rule 8056 — pairwise spacing, pairing-level)
 *      and in the Alert Center dialog.
 *      Note: rule 8002 (cumulative block hours) is stored with pairing_id=NULL
 *      (roster-level), so it does NOT appear in liveViolations() or the Alert Center
 *      (which only surfaces pairing-attributed violations). 8056 is used here because
 *      it IS pairing-attributed and proven to be computed by the Rust engine.
 *   3. Scenario 6 legality endpoint returns READY with Rust-computed violations.
 *
 * §No-Illusion: every assertion targets real data — rule_code, severity, message.
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth, gotoGantt } from '../../utils/gantt-hook'

const GANTT_API = process.env.GANTT_API_URL ?? 'http://localhost:3000'
const SCENARIO_6_ID = 6

type LiveViol = { pairingId: number; ruleCode: string; severity: number; message: string }

// ─── Test 1: Live view — bell data + Alert Center show Rust pairing violations ──

test('Live-1100 — Live gantt shows Rust 8056 violations in bell data and Alert Center after login', async ({ page, request }) => {
  // Remote DB bootstrap takes ~90 s on first load; add 35 s for phase-2 retry on slow days.
  test.setTimeout(360_000)

  // ── 1. Login ──────────────────────────────────────────────────────────────
  await seedGanttAuth(page, request)

  // Capture [PersistedViolations] console lines so we know if the fetch ran / errored.
  const violLogs: string[] = []
  page.on('console', (msg) => {
    const t = msg.text()
    if (t.includes('PersistedViolations') || t.includes('violations')) violLogs.push(`[${msg.type()}] ${t}`)
  })

  // navigates → opens Live view → applies default filter → waits for empty-state to clear
  await gotoGantt(page)

  // ── 2. Bell data: liveViolations() populated with 8056 rows (Rust engine).
  // Bootstrap (90 s timeout) → on failure, phase-1 fallback fetchCrews (30 s) → on failure,
  // phase-2 background fetchCrews with 5 s wait + retry (35 s) → violations hook fires.
  // Rule 8056 (pairwise 24h spacing, sev 2) is pairing-level and reliably present.
  // Track crew count changes during the poll for diagnostics.
  let lastLoggedCrew = -1
  await expect
    .poll(
      async () => {
        const [crewCount, viols8056] = await page.evaluate(() => {
          const t = (window as unknown as {
            __ganttTest?: {
              liveViolations?: () => LiveViol[]
              selectedCrewCount?: () => number
              marks?: () => Record<string, number>
            }
          }).__ganttTest
          return [
            t?.selectedCrewCount?.() ?? -1,
            (t?.liveViolations?.() ?? []).filter((v) => v.ruleCode === '8056').length,
          ] as [number, number]
        })
        if (crewCount !== lastLoggedCrew) {
          console.log(`[E2E poll] selectedCrewCount changed to ${crewCount}, 8056 viols=${viols8056}`)
          lastLoggedCrew = crewCount
        }
        return viols8056
      },
      // Phase-2 retry path: first fetchCrews (30s) + 5s wait + retry (30s) + violations API (30s)
      // = ~95s from gotoGantt return; 120s gives a safe margin.
      { timeout: 120_000, intervals: [2000], message: 'Expected 8056 violations in bell data' },
    )
    .toBeGreaterThan(0)
    .catch((e: unknown) => {
      // Diagnostic dump so we can see if the hook ran / what blocked it.
      console.error('[Live-1100 diag] violLogs:', violLogs)
      throw e
    })

  const viols8056 = await page.evaluate(() => {
    const t = (window as unknown as { __ganttTest: { liveViolations: () => LiveViol[] } }).__ganttTest
    return t.liveViolations().filter((v) => v.ruleCode === '8056')
  })
  expect(viols8056.length, '8056 pairwise-spacing violations must be present').toBeGreaterThan(0)
  expect(viols8056.every((v) => v.severity >= 1 && v.severity <= 3), 'violations must have valid severity').toBe(true)

  // ── 3. Alert Center: dialog shows 8056 rows with real crew attribution ────
  await page.getByTestId('violations-button').first().click()
  const dialog = page.getByTestId('violation-list-dialog')
  await expect(dialog).toBeVisible()

  const rows8056 = dialog.locator('[data-testid="violation-list-row"][data-rule-code="8056"]')
  await expect
    .poll(() => rows8056.count(), { timeout: 15_000, message: '8056 rows must appear in Alert Center' })
    .toBeGreaterThan(0)

  const firstRow = rows8056.first()
  await expect(firstRow).toContainText('8056')

  const crewId = await firstRow.getAttribute('data-crew-id')
  expect(crewId && crewId.length > 0, 'violation must be attributed to a real crew').toBe(true)
})

// ─── Test 2: Scenario 6 — legality endpoint returns Rust violations ───────────

test('Scen-2421 — Scenario 6 legality endpoint returns Rust-computed violations', async ({ request }) => {
  test.setTimeout(120_000)

  // ── 1. Login via API ──────────────────────────────────────────────────────
  const res = await request.post(`${GANTT_API}/api/auth/login`, {
    data: { userCode: process.env.GANTT_TEST_USER ?? 'admin', password: process.env.GANTT_TEST_PASS ?? '123456' },
  })
  expect(res.ok(), `login failed: ${res.status()}`).toBeTruthy()
  const { data: auth } = (await res.json()) as { data: { token: string } }
  const token = auth.token

  // ── 2. Legality endpoint returns READY with Rust violations ──────────────
  // The Rust compute has already run (cold-start hook or prior test); if it is
  // still COMPUTING we poll until READY (up to 90 s).
  type ViolRow = { rule_code: string; pairing_id: number | null; severity: number; message: string }
  type Legality = { status: string; violations: ViolRow[] }

  let legality: Legality | undefined
  await expect
    .poll(
      async () => {
        const r = await request.get(`${GANTT_API}/api/scenario/${SCENARIO_6_ID}/legality`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const body = (await r.json()) as { data: Legality }
        legality = body.data
        return legality?.status
      },
      { timeout: 90_000, intervals: [2000], message: 'Scenario 6 legality must reach READY' },
    )
    .toBe('READY')

  const viols = legality!.violations
  expect(viols.length, 'Scenario 6 must have at least one Rust-computed violation').toBeGreaterThan(0)

  // 8002 and / or 8056 are always expected for June roster data.
  const ruleSet = new Set(viols.map((v) => v.rule_code))
  expect(
    ruleSet.has('8002') || ruleSet.has('8056'),
    `Expected at least 8002 or 8056 violations, got: ${[...ruleSet].join(', ')}`,
  ).toBe(true)

  // Every violation row has a severity value (1/2/3) — confirms Rust row shape, not Python.
  expect(viols.every((v) => v.severity >= 1 && v.severity <= 3)).toBe(true)
})
