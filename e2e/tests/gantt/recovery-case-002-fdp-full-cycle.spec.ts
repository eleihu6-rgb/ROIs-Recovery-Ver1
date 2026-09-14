/**
 * Case 2 — FULL cycle: flight delayed → controller sends the FDP-extension
 * discretion to the crew app → crew replies Yes/No → controller sees the
 * feedback. Exercises the redesigned request dialog (enlarged Before → Proposed
 * cards, single-line timestamps) and the fix for the raw Zod "reason" error.
 *
 * Preconditions (driven by this spec's own DB helpers, scoped to pairing 152675):
 *   - Duty 1 of pairing 152675 already carries the operated FDP (855) from the
 *     .local/s2-et-consent duty fixture, so a proposal can be built.
 *   - set-not-sent-152675.cjs clears any live proposal → the "Not sent yet" state
 *     that matches Ryan's screenshot (empty Reason, "Request FDP discretion").
 * The exact demo baseline is snapshotted before and restored after by the
 * snapshot/restore scripts (run outside this spec), so other recovery cases and
 * the documented rejected baseline are never disturbed.
 *
 * Acceptance:
 *   1. Bug fix — with an empty Reason, Send is DISABLED and NO raw Zod JSON
 *      (`[{"code":"too_small"...}]`) is ever rendered.
 *   2. Layout — Before and Proposed cards both render with their report/release
 *      timestamps (visually inspected via the versioned screenshot for no wrap).
 *   3. Send — a valid Reason enables Send; sending creates the crew proposal.
 *   4. Feedback — after the crew replies accept/reject, the controller's refresh
 *      shows each crew's Yes/No and the status resolves to "Crew rejected".
 */
import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { seedGanttAuth, ganttApiUrl } from '../../utils/gantt-hook'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '../../..')
const SHOT_DIR = path.resolve(REPO, 'docs/assets/screenshots/crew-recovery')
const S2 = path.resolve(REPO, '.local/s2-et-consent')
const PAIRING_ID = 152675
const SOURCE_CREW = 'T2001'
// Shared crew-app test password (sql/seed/2026-09-11-crew-app-accounts-and-password.sql).
const CREW_APP_PASSWORD = 'Pier2026'
const OPTION_ID = `fdp-discretion-${PAIRING_ID}-${SOURCE_CREW}-none`
const CREW_IDS = [
  'T2001', 'T2002', 'T2003', 'T2004', 'T2005', 'T2006', 'T2007',
  ...Array.from({ length: 14 }, (_, i) => `T20${21 + i}`),
]
const runCjs = (file: string, args: string[] = []): string =>
  execFileSync('node', [path.join(S2, file), ...args], { cwd: REPO, encoding: 'utf8' }).trim()

test('Case 2 — send FDP discretion, crew replies Yes/No, controller sees feedback (bug fix + redesign)', async ({ page, request }) => {
  test.setTimeout(600_000)

  // ── Precondition: reach the "not sent yet" state Ryan demos from ──────────
  console.log('[precondition]', runCjs('set-not-sent-152675.cjs'))

  await seedGanttAuth(page, request)
  await page.goto('/altair/', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => typeof (window as unknown as { __ganttTest?: unknown }).__ganttTest !== 'undefined', undefined, { timeout: 30_000 })

  // ── Load Live narrowed to the case-2 crew ────────────────────────────────
  await page.getByTestId('module-nav-live').click()
  const emptyState = page.getByTestId('live-empty-state')
  await expect(emptyState).toBeVisible({ timeout: 10_000 })
  await emptyState.click()
  const filterDialog = page.getByTestId('filter-dialog')
  await expect(filterDialog).toBeVisible({ timeout: 5_000 })
  await page.getByTestId('filter-crew-division-P').click()
  const crewIdField = page.getByTestId('filter-crew-id')
  await crewIdField.fill(CREW_IDS.join(','))
  await crewIdField.press('Enter')
  await page.getByTestId('filter-apply').click()
  await expect(filterDialog).not.toBeVisible({ timeout: 10_000 })
  await expect(emptyState).not.toBeVisible({ timeout: 300_000 })

  // ── Open Recovery for the delayed pairing ────────────────────────────────
  await page.evaluate(({ crewId, pairingId }) => {
    (window as unknown as { __ganttTest: { openLiveRosterContextMenu: (c: string, p: number) => void } }).__ganttTest.openLiveRosterContextMenu(crewId, pairingId)
  }, { crewId: SOURCE_CREW, pairingId: PAIRING_ID })
  const rosterRecovery = page.locator('div.fixed.z-50 button').filter({ hasText: /^Recovery/ }).first()
  await expect(rosterRecovery).toBeVisible({ timeout: 15_000 })
  await rosterRecovery.click({ force: true })

  const dialog = page.getByTestId('recovery-violation-dialog')
  await expect(dialog).toBeVisible({ timeout: 60_000 })
  await expect(dialog).toContainText('Rule 3007')
  await dialog.getByTestId('recovery-plan-filter-fdp-discretion').click()
  await expect(dialog.getByTestId('recovery-options-fdp-discretion')).toBeVisible({ timeout: 30_000 })

  // Not-sent status, since we cleared the live proposal.
  await expect(dialog.getByTestId('recovery-fdp-status-not-sent')).toBeVisible({ timeout: 60_000 })

  // ── Open the request dialog (not-sent → "Request FDP discretion") ─────────
  const requestButton = dialog.getByTestId(`recovery-fdp-request-${OPTION_ID}`)
  await expect(requestButton).toBeVisible({ timeout: 30_000 })
  await expect(requestButton).toContainText('Request FDP discretion')
  await requestButton.click()

  const req = page.getByTestId('recovery-fdp-request-dialog')
  await expect(req).toBeVisible({ timeout: 15_000 })
  await expect(req).toContainText(`Request FDP discretion · Crew ${SOURCE_CREW}`)

  // 2. Redesigned Before → Proposed comparison, both cards + timestamps present.
  await expect(req.getByTestId('recovery-fdp-before-after')).toBeVisible()
  const beforeCard = req.getByTestId('recovery-fdp-window-before')
  const proposedCard = req.getByTestId('recovery-fdp-window-proposed')
  await expect(beforeCard).toContainText('Report')
  await expect(beforeCard).toContainText('Release')
  // FDP is shown in hours, never raw minutes: before 840 = 14h 00m, after 930 =
  // 15h 30m, a +1.5 h discretion (ET2682 delayed 1.5h). No "min" unit anywhere.
  await expect(beforeCard).toContainText('14h 00m')
  await expect(proposedCard).toContainText('15h 30m')
  await expect(proposedCard).toContainText('+1.5 h')
  expect(await req.innerText(), 'FDP must be shown in hours, not raw minutes').not.toMatch(/\bmin FDP\b|\bminutes\b/)
  // A delayed return leg must PUSH the release: Proposed release is 1.5h later than
  // Before (16:15Z → 17:45Z), while the check-in (Report) is unchanged (first leg
  // on-time). Timestamps read as a compact UTC stamp, never a raw ISO string.
  await expect(beforeCard).toContainText('16:15Z')
  await expect(proposedCard).toContainText('17:45Z')
  await expect(proposedCard).not.toContainText('16:15Z')
  expect(await req.innerText(), 'timestamps must be compact UTC, not raw ISO').not.toMatch(/T\d{2}:\d{2}:\d{2}/)
  const releaseLine = (t: string) => (t.match(/Release\s+([0-9]{2} [A-Za-z]{3} [0-9]{2}:[0-9]{2}Z)/)?.[1] ?? '')
  const beforeRelease = releaseLine(await beforeCard.innerText())
  const proposedRelease = releaseLine(await proposedCard.innerText())
  expect(proposedRelease, 'Proposed release must differ from Before').not.toBe(beforeRelease)

  // 1. BUG FIX (regression): empty Reason ⇒ Send disabled, and NO raw Zod JSON.
  const send = req.getByTestId('recovery-fdp-send')
  await expect(req.getByLabel('Reason for crew')).toHaveValue('')
  await expect(send).toBeDisabled()
  const dialogText = (await req.innerText())
  expect(dialogText, 'raw Zod issue JSON must never reach the UI').not.toMatch(/too_small|"code"|String must contain|\[\s*\{/)
  await page.screenshot({ path: `${SHOT_DIR}/case2-fdp-request-redesign-notsent-Ver1.png` })

  // 3. A valid Reason enables Send (the reply deadline is no longer a field —
  //    it defaults server-side, so Reason alone flips Send from disabled).
  await expect(req.getByLabel('Reply deadline UTC')).toHaveCount(0)
  await req.getByLabel('Reason for crew').fill('ET2682 return leg delayed 1.5h; request FDP extension to keep the crew on the duty.')
  await expect(send).toBeEnabled()
  await page.screenshot({ path: `${SHOT_DIR}/case2-fdp-request-ready-Ver1.png` })

  await send.click()
  // On success the dialog closes and the option status flips to "sent".
  await expect(req).not.toBeVisible({ timeout: 30_000 })
  await expect(dialog.getByTestId('recovery-fdp-status-sent')).toBeVisible({ timeout: 30_000 })

  // ── REGRESSION: the crew app actually RECEIVES it ────────────────────────
  // The crew app reads FDP history via the airline-scoped POST /discretions
  // (verifyMobileCrewCredentials by crew_id, then listConsents(airline,crewId)).
  // The bug was that T2001 (ADD/ET crew) was stored under airline 'F8', so an
  // ET login saw nothing. This asserts the real crew-app path, not a controller
  // endpoint, so a future airline regression fails here.
  const recv = async (airline: 'ET' | 'F8', crewId: string) => {
    const r = await request.post(`${ganttApiUrl}/api/crew-app/v1/discretions`, {
      data: { airline, crewId, password: CREW_APP_PASSWORD },
    })
    expect(r.ok(), `crew-app /discretions ${airline}/${crewId} -> ${r.status()}`).toBeTruthy()
    return ((await r.json()).data?.requests ?? []) as Array<{ state: string }>
  }
  // T2001 as ET now sees the freshly-sent request, pending. As F8 (wrong
  // airline) they must see nothing — that mismatch WAS the reported bug.
  expect((await recv('ET', 'T2001'))[0]?.state, 'T2001/ET must receive the request').toBe('pending')
  expect(await recv('F8', 'T2001'), 'wrong airline must not leak the request').toHaveLength(0)

  // ── Crew replies from their phone: T2001 Yes (accept), T2021 No (reject) ──
  console.log('[crew-reply]', runCjs('reply-as-crew-152675.cjs', ['T2001=accept', 'T2021=reject']))

  // The reply is visible through the crew app too (T2001 now sees 'accepted').
  expect((await recv('ET', 'T2001'))[0]?.state, 'T2001/ET sees their own accept').toBe('accepted')

  // 4. Controller reopens (now "Resend") and refreshes to read the Yes/No back.
  await expect(requestButton).toContainText('Resend', { timeout: 30_000 })
  await requestButton.click()
  await expect(req).toBeVisible({ timeout: 15_000 })
  await req.getByRole('button', { name: 'Refresh crew feedback', exact: true }).click()
  const feedback = req.getByTestId('recovery-fdp-feedback')
  await expect(feedback).toContainText('T2001 accepted', { timeout: 30_000 })
  await expect(feedback).toContainText('T2021 rejected')
  await expect(feedback).toContainText('T2022 pending')
  await page.screenshot({ path: `${SHOT_DIR}/case2-fdp-crew-feedback-Ver1.png` })

  // A No present ⇒ the option resolves to "Crew rejected".
  await req.getByRole('button', { name: 'Cancel' }).click()
  await expect(req).not.toBeVisible({ timeout: 10_000 })
  await expect(dialog.getByTestId('recovery-fdp-status-rejected')).toBeVisible({ timeout: 30_000 })
})
