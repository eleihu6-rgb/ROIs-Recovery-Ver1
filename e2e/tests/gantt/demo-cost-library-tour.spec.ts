/**
 * DEMO VIDEO — "ROIS · Cost Library (Cost Sets & Cost Templates)".
 *
 * A guided, subtitled walkthrough that drives the REAL public UI at cr.rois.one
 * and covers, in ~40 seconds, the new cost-library feature exactly as Ryan asked:
 *   1. Plain-English intro: what cost sets / cost templates are and how ROIS uses
 *      them to price crew-recovery decisions. Login is done off-camera (trimmed),
 *      so the delivered clip opens straight on /altair/legality.
 *   2. Cost Set intro — the default "Daily Recovery" cost set.
 *   3. Cost Templates — walk the first two cost items (1002 "Pay above guaranteed
 *      hours" and 1003 "Airport standby credit"), explaining the basic logic and
 *      the live Calculation Workbench (template mode auto-computes the default
 *      case, so the money math is on screen without any typing).
 *
 * Every action is narrated (burned-in English subtitles) with an animated
 * pointer, a highlight ring, callout labels, and chapter cards, via the reusable
 * DemoDirector (e2e/utils/demo-video/). Captions are drawn on the page during
 * capture, so both the .webm and the .mp4 are self-contained subtitled clips.
 *
 * The row / workbench test-ids embed the dynamic DB instance id (NOT the 1002 /
 * 1003 type codes), so we resolve the real ids once from the read-only cost
 * catalog API before driving the UI — a read-only lookup of pre-existing data,
 * which §Simulate-User permits (the demonstrated user actions themselves all run
 * through the real UI).
 *
 * Artifacts (written on completion):
 *   docs/assets/videos/gantt/cost-library-tour.webm      (recording, subtitled)
 *   docs/assets/videos/gantt/cost-library-tour.mp4       (H.264, subtitled)
 *   docs/assets/videos/gantt/cost-library-tour.srt       (subtitle sidecar)
 *   docs/assets/screenshots/gantt/demo-cost-library-tour-Ver1.png (§PW-Snapshot)
 *
 * Run: npx playwright test tests/gantt/demo-cost-library-tour.spec.ts \
 *        --config config/demo-video.config.ts --reporter=list   (from e2e/)
 */
import { test, expect, type APIRequestContext } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { GanttLoginPage } from '../../pages/gantt/gantt-login-page'
import { TEST_ACCOUNTS } from '../../utils/test-data'
import { DemoDirector } from '../../utils/demo-video/demo-director'
import { transcodeToMp4 } from '../../utils/demo-video/render-video'
import type { CostCatalog, CostInstance } from '../../../gantt/src/types/cost-library'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../../..')
const VIDEO_DIR = path.join(REPO_ROOT, 'docs/assets/videos/gantt')
const SHOT_DIR = path.join(REPO_ROOT, 'docs/assets/screenshots/gantt')
const NAME = 'cost-library-tour'
// Target a ~40-second delivered clip (Ryan's ask). The raw walkthrough runs
// ~25s, so we slow the mp4 to ~40s: speedFactor 0.62 → setpts≈1.61×, and the SRT
// is stretched by the reciprocal to stay in sync. The .webm stays the full-speed
// master. (See the demo-video skill's "Playback speed" section.)
const SPEED = 0.62

// Shared with afterAll so the video (flushed only after the context closes) can
// be transcoded once the test itself has finished.
let recordedVideoPath = ''
let srtText = ''
// Blank login + nav time captured before narration starts — trimmed from the mp4.
let leadInSec = 0

// ── Read-only catalog lookup (resolve dynamic instance ids for 1002 / 1003) ──
const apiToken = async (request: APIRequestContext): Promise<string> => {
  const res = await request.post('/api/auth/login', {
    data: { userCode: TEST_ACCOUNTS.ryan.userCode, password: TEST_ACCOUNTS.ryan.password },
  })
  expect(res.ok(), `API login failed: ${res.status()}`).toBeTruthy()
  return ((await res.json()) as { data: { token: string } }).data.token
}
const fetchCatalog = async (request: APIRequestContext): Promise<CostCatalog> => {
  const token = await apiToken(request)
  const res = await request.get('/api/cost-library/catalog', {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(res.ok(), `catalog fetch failed: ${res.status()}`).toBeTruthy()
  return ((await res.json()) as { data: CostCatalog }).data
}

test.describe('Demo video · Cost Library tour', () => {
  test('records the cost-set / cost-template guided walkthrough with burned-in subtitles', async ({ page, request }) => {
    const d = new DemoDirector(page)
    const login = new GanttLoginPage(page)
    const RYAN = TEST_ACCOUNTS.ryan

    // Resolve the real instance ids behind cost codes 1002 / 1003 (instanceNo 1).
    const catalog = await fetchCatalog(request)
    const instance = (code: number): CostInstance => {
      const found = catalog.instances.find((i) => i.typeCode === code && i.instanceNo === 1)
      if (!found) throw new Error(`cost type ${code} (instanceNo 1) not found in catalog`)
      return found
    }
    const id1002 = instance(1002).id
    const id1003 = instance(1003).id

    // ── Off-camera setup: log in and land on Legality (trimmed from the mp4) ──
    // domcontentloaded (not 'load'): the SPA holds the browser 'load' event open.
    const navStart = Date.now()
    await page.goto('/altair/', { waitUntil: 'domcontentloaded' })
    await expect(login.heading).toBeVisible({ timeout: 45_000 })
    await login.userCodeInput.fill(RYAN.userCode)
    await login.passwordInput.fill(RYAN.password)
    await login.signInButton.click()
    await expect(login.heading).not.toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('module-nav-legality')).toBeVisible({ timeout: 30_000 })
    await page.getByTestId('module-nav-legality').click()
    // Legality lands on Rule Sets by default; the intro card covers it anyway.
    leadInSec = (Date.now() - navStart) / 1000
    await d.start()

    // ── Chapter 0 · Plain-English intro ──────────────────────────────────
    await d.chapter(
      'ROIS · Cost Library',
      'ROIS prices every crew-recovery decision. A cost set groups the cost items to charge against; each item’s Calculation Workbench shows the money math.',
    )

    // ── Chapter 1 · Cost Sets ────────────────────────────────────────────
    await d.chapter('Chapter 1 · Cost Sets', 'A cost set is the bundle of priced items a recovery run is scored against.')
    await d.click(page.getByTestId('legality-nav-cost-sets'), 'Open Cost Sets under Legality.', 'Cost Sets')
    await expect(page.getByTestId('cost-library-view')).toBeVisible({ timeout: 20_000 })

    const dailyRecovery = page.locator('[data-testid^="cost-set-"]').filter({ hasText: 'Daily Recovery' }).first()
    await expect(dailyRecovery).toBeVisible({ timeout: 15_000 })
    await expect(page.getByLabel('Default set')).toBeVisible()
    await d.focusOn(
      dailyRecovery,
      '“Daily Recovery” is the default cost set — the starter library ROIS scores against.',
      'Default set',
    )
    await d.narrateFor('It bundles the individual cost items the optimizer charges for each decision.', 2200)
    await page.evaluate(() => window.__demo?.clearFocus())

    // ── Chapter 2 · Cost Templates (items 1002 & 1003) ───────────────────
    await d.chapter('Chapter 2 · Cost Templates', 'Cost templates are the reusable cost items — let’s open the first two.')
    await d.click(page.getByTestId('legality-nav-cost-templates'), 'Switch to Cost Templates.', 'Cost Templates')
    await expect(page.getByTestId('cost-library-view')).toBeVisible({ timeout: 20_000 })

    // In templates mode the items are table rows (the left tree only renders for
    // Cost Sets), so we highlight the row heading and expand it via its toggle to
    // reveal the Calculation Workbench (template mode auto-runs the default case).

    // Item 1002 — guarantee (pay above guaranteed hours).
    const row1002 = page.getByTestId(`cost-row-heading-${id1002}`)
    await expect(row1002).toContainText('1002')
    await d.focusOn(
      row1002,
      '1002 — Pay above guaranteed hours: crew are guaranteed a monthly floor; only credit above it costs money.',
      '1002 / 001',
    )
    await page.getByTestId(`cost-expand-${id1002}`).click()
    await page.evaluate(() => window.__demo?.clearFocus())
    await expect(page.getByTestId(`cost-detail-${id1002}`)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId(`cost-workbench-${id1002}`)).toContainText('Calculation Workbench')
    await expect(page.getByTestId(`cost-result-${id1002}`)).toContainText('$712.50', { timeout: 15_000 })
    await d.focusOn(
      page.getByTestId(`cost-workbench-${id1002}`),
      'The Calculation Workbench runs the default case live: 84h + 6.75h added → $712.50 above the guarantee floor.',
      'Calculation Workbench',
    )
    await d.narrateFor('Only credit above the floor becomes incremental cash, priced through the overtime tiers.', 2400)
    await page.evaluate(() => window.__demo?.clearFocus())

    // Item 1003 — standby (airport standby credit).
    const row1003 = page.getByTestId(`cost-row-heading-${id1003}`)
    await expect(row1003).toContainText('1003')
    await d.focusOn(
      row1003,
      '1003 — Airport standby credit: standby time first converts into credit.',
      '1003 / 001',
    )
    await page.getByTestId(`cost-expand-${id1003}`).click()
    await page.evaluate(() => window.__demo?.clearFocus())
    await expect(page.getByTestId(`cost-detail-${id1003}`)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId(`cost-workbench-${id1003}`)).toContainText('Calculation Workbench')
    await expect(page.getByTestId(`cost-result-${id1003}`)).toContainText('Standby credit', { timeout: 15_000 })
    await d.focusOn(
      page.getByTestId(`cost-workbench-${id1003}`),
      'That standby credit is added to pairing credit, then any hours over guarantee are priced through the linked GH policy.',
      'Calculation Workbench',
    )
    await d.narrateFor('Same workbench, a different calculator — each cost item explains exactly how it turns an action into cash.', 2600)
    await page.evaluate(() => window.__demo?.clearFocus())

    // ── Wrap up ──────────────────────────────────────────────────────────
    await d.chapter(
      'Done',
      'Cost sets group the items; each item’s workbench shows how ROIS prices a recovery decision.',
    )
    d.finish()

    // §PW-Snapshot: capture the final rendered frame as visible proof.
    fs.mkdirSync(SHOT_DIR, { recursive: true })
    await page.screenshot({ path: path.join(SHOT_DIR, `demo-${NAME}-Ver1.png`), fullPage: false })

    // Stash for afterAll (video file is only flushed once the context closes).
    srtText = d.getSrt(1 / SPEED)
    recordedVideoPath = (await page.video()?.path()) ?? ''
    expect(srtText.length, 'SRT captions were collected').toBeGreaterThan(0)
    expect(recordedVideoPath, 'Playwright recorded a video').not.toBe('')
  })

  test.afterAll(async () => {
    if (!recordedVideoPath || !srtText) return
    fs.mkdirSync(VIDEO_DIR, { recursive: true })

    const webmOut = path.join(VIDEO_DIR, `${NAME}.webm`)
    const srtOut = path.join(VIDEO_DIR, `${NAME}.srt`)
    const mp4Out = path.join(VIDEO_DIR, `${NAME}.mp4`)

    // The .webm already carries burned-in captions; keep it + the SRT sidecar.
    fs.copyFileSync(recordedVideoPath, webmOut)
    fs.writeFileSync(srtOut, srtText, 'utf8')

    // Re-encode to a widely-playable H.264 mp4 (captions already in-frame),
    // trimming the blank login/nav lead-in (keep ~1s so the open isn't abrupt).
    const trimSec = Math.max(0, leadInSec - 1)
    const result = await transcodeToMp4(webmOut, mp4Out, trimSec, SPEED)
    if (result.ok) {
      // eslint-disable-next-line no-console
      console.log(`\n✅ Subtitled demo written:\n   MP4: ${mp4Out}\n   WEBM: ${webmOut}\n   SRT: ${srtOut}`)
    } else {
      // eslint-disable-next-line no-console
      console.error(`\n❌ mp4 transcode failed (the subtitled .webm is still valid):\n${result.stderrTail}`)
    }
    expect(result.ok, 'transcoded the subtitled recording to mp4').toBe(true)
  })
})
