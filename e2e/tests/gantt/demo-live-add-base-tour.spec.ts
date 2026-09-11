/**
 * DEMO VIDEO — "ROIS Live · Addis Ababa (ADD) Base Tour".
 *
 * A guided, subtitled walkthrough (Option A: SRT + ffmpeg burn-in) that drives
 * the REAL public UI at cr.rois.one exactly as Ryan asked:
 *   1. Log in at /altair as Ryan / Our2027 (real form login, no auth seeding).
 *   2. Open Live, filter BOTH crew base and pairing base to ADD, open the Gantt.
 *   3. Jump the timeline to the current roster period.
 *
 * Every action is narrated (burned-in English subtitles), and each step shows an
 * animated pointer, a highlight ring, a callout label, and chapter cards, via the
 * reusable DemoDirector (e2e/utils/demo-video/).
 *
 * Captions are burned into the recording live (on-page subtitle bar), so both the
 * .webm and the .mp4 are self-contained subtitled clips. The delivered .mp4 plays
 * at half speed (SPEED) so each step is easy to follow; the .webm is the
 * full-speed master and the .srt sidecar is stretched to match the mp4.
 *
 * Artifacts (written on completion):
 *   docs/assets/videos/gantt/live-add-base-tour.webm      (recording, subtitled)
 *   docs/assets/videos/gantt/live-add-base-tour.mp4       (H.264, subtitled)
 *   docs/assets/videos/gantt/live-add-base-tour.srt       (subtitle sidecar)
 *   docs/assets/screenshots/gantt/demo-live-add-base-tour-Ver1.png (§PW-Snapshot)
 *
 * Run: npx playwright test e2e/tests/gantt/demo-live-add-base-tour.spec.ts \
 *        --config e2e/config/demo-video.config.ts --reporter=list
 */
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { GanttLoginPage } from '../../pages/gantt/gantt-login-page'
import { TEST_ACCOUNTS } from '../../utils/test-data'
import { waitGanttReady, counts } from '../../utils/gantt-hook'
import { DemoDirector } from '../../utils/demo-video/demo-director'
import { transcodeToMp4 } from '../../utils/demo-video/render-video'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../../..')
const VIDEO_DIR = path.join(REPO_ROOT, 'docs/assets/videos/gantt')
const SHOT_DIR = path.join(REPO_ROOT, 'docs/assets/screenshots/gantt')
const NAME = 'live-add-base-tour'
// Play the delivered mp4 at half speed so each action is easy to follow; the
// webm stays the full-speed master and the SRT is stretched to match the mp4.
const SPEED = 0.5

// Shared with afterAll so the video (flushed only after the context closes) can
// be burned once the test itself has finished.
let recordedVideoPath = ''
let srtText = ''
// Blank page-load time captured before the demo starts — trimmed from the mp4.
let leadInSec = 0

test.describe('Demo video · Live ADD base tour', () => {
  test('records the ADD-base guided walkthrough with burned-in subtitles', async ({ page }) => {
    const d = new DemoDirector(page)
    const login = new GanttLoginPage(page)
    const RYAN = TEST_ACCOUNTS.ryan

    // ── Sign in ──────────────────────────────────────────────────────────
    // Use domcontentloaded (not 'load'): the SPA keeps a long-lived connection
    // open, so the browser 'load' event never fires (mirrors gotoGantt()).
    // Measure right before goto so leadIn ≈ the blank recorded during page load
    // (recording starts at context creation, ~this point) — used to trim the mp4.
    const navStart = Date.now()
    await page.goto('/altair/', { waitUntil: 'domcontentloaded' })
    await expect(login.heading).toBeVisible({ timeout: 45_000 })
    leadInSec = (Date.now() - navStart) / 1000
    await d.start()

    await d.chapter(
      'ROIS Live · Addis Ababa Base Tour',
      'A guided walkthrough — sign in, scope crew and pairings to the ADD base, and open the Gantt.',
    )

    await d.chapter('Chapter 1 · Sign In', 'Logging in to ROIS as Ryan.')
    await d.fill(login.userCodeInput, RYAN.userCode, 'Enter the user code “Ryan”.', 'User code')
    await d.fill(login.passwordInput, RYAN.password, 'Enter the password.', 'Password')
    await d.click(login.signInButton, 'Click Sign In to enter ROIS.', 'Sign In')

    await expect(login.heading).not.toBeVisible({ timeout: 15_000 })
    await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, { timeout: 30_000 })
    await expect(page.getByTestId('module-nav-live')).toBeVisible({ timeout: 15_000 })

    // ── Open Live ────────────────────────────────────────────────────────
    await d.chapter('Chapter 2 · Open Live', 'Navigate to the Live scheduling view.')
    await d.click(page.getByTestId('module-nav-live'), 'Open the Live view from the top navigation.', 'Live')

    const emptyState = page.getByTestId('live-empty-state')
    await expect(emptyState).toBeVisible({ timeout: 15_000 })
    await d.click(emptyState, 'Live starts empty — click here to choose what to load.', 'Load data')
    await expect(page.getByTestId('filter-dialog')).toBeVisible({ timeout: 10_000 })

    // ── Filter to ADD base (crew + pairing) ──────────────────────────────
    await d.chapter('Chapter 3 · Filter to ADD', 'Scope both crew and pairings to the Addis Ababa (ADD) base.')

    await d.click(page.getByTestId('filter-tab-crew'), 'Open the Crew filter tab.', 'Crew')
    await d.click(page.getByTestId('filter-crew-base-trigger'), 'Open the crew Base selector.', 'Crew Base')
    const crewAdd = page.getByTestId('filter-crew-base-opt-ADD')
    await expect(crewAdd).toBeVisible({ timeout: 30_000 })
    await d.click(crewAdd, 'Select ADD — Addis Ababa — for crew.', 'ADD')

    await d.click(page.getByTestId('filter-tab-pairing'), 'Now open the Pairing filter tab.', 'Pairing')
    await d.click(page.getByTestId('filter-pairing-base-trigger'), 'Open the pairing Base selector.', 'Pairing Base')
    const pairAdd = page.getByTestId('filter-pairing-base-opt-ADD')
    await expect(pairAdd).toBeVisible({ timeout: 30_000 })
    await d.click(pairAdd, 'Select ADD for pairings too.', 'ADD')

    await d.click(page.getByTestId('filter-apply'), 'Apply the filter and open the Gantt.', 'Apply')
    await expect(page.getByTestId('filter-dialog')).toBeHidden({ timeout: 10_000 })

    await d.narrateFor('Loading the ADD-base roster and pairings…', 1200)
    await expect(emptyState).not.toBeVisible({ timeout: 270_000 })
    await waitGanttReady(page)

    // §No-Illusion: prove the ADD data actually loaded, not just "no error".
    const loaded = await counts(page)
    expect(loaded.roster + loaded.pairing, 'ADD base roster/pairings loaded into the Gantt').toBeGreaterThan(0)

    // ── Go to current roster period ──────────────────────────────────────
    await d.chapter('Chapter 4 · Current Roster Period', 'Jump the timeline to the current roster period.')
    const timeAxis = page.getByTestId('pane-time-axis').first()
    await d.focusOn(timeAxis, 'Right-click the time axis to open “GO TO RP”.', 'Time axis')
    await timeAxis.click({ button: 'right' })
    await page.evaluate(() => window.__demo?.clearFocus())

    const rpMenu = page.getByTestId('time-axis-rp-menu')
    await expect(rpMenu).toBeVisible({ timeout: 10_000 })
    const currentRp = rpMenu.getByRole('menuitem').filter({ hasText: 'now' })
    const rpTarget = (await currentRp.count()) > 0 ? currentRp.first() : rpMenu.getByRole('menuitem').first()
    await d.click(rpTarget, 'Select the current roster period (marked “now”).', 'Current RP')
    await waitGanttReady(page)

    // ── Wrap up ──────────────────────────────────────────────────────────
    await d.chapter(
      'Done',
      `ADD base is loaded — ${loaded.roster} crew rosters and ${loaded.pairing} pairings on the Gantt.`,
    )
    d.finish()

    // §PW-Snapshot: capture the final rendered frame as visible proof.
    fs.mkdirSync(SHOT_DIR, { recursive: true })
    await page.screenshot({ path: path.join(SHOT_DIR, `demo-${NAME}-Ver1.png`), fullPage: false })

    // Stash for afterAll (video file is only flushed once the context closes).
    // Scale the captions by 1/SPEED so the sidecar lines up with the slowed mp4.
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

    // Re-encode to a widely-playable H.264 mp4 (captions are already in-frame),
    // trimming the blank page-load lead-in (keep ~1s so the open isn't abrupt)
    // and slowing playback to SPEED so each step is easy to follow.
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
