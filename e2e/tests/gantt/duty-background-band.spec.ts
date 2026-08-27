/**
 * Feature: light-gray flight-duty background band (req: group flights of the same duty).
 *
 * The Roster and Pairing panes (Canvas, Segment Mode) draw a light-gray rounded band
 * behind each FLIGHT duty, spanning duty check-in (pickup start) → check-out (dropoff end),
 * so the eye groups all flights belonging to one duty. The inter-duty layover gap, ground
 * tasks, and the aircraft-grouped Flight pane get NO band.
 *
 * Implementation: SEGMENT_DUTY_BG = 'rgba(133, 147, 166, 0.12)' fill in
 *   gantt/src/components/gantt/renderers/{roster,pairing}-renderer.ts
 *
 * Why a fillStyle spy: the band is a faint alpha fill composited under the pucks/bars, so
 * pixel sampling is unreliable. Instead we wrap CanvasRenderingContext2D.fillStyle BEFORE the
 * app loads and record, per canvas (by data-testid), the exact color strings it sets. This is
 * a true regression test — before the feature existed, SEGMENT_DUTY_BG was never emitted, so
 * the positive assertions below would fail.
 */
import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { seedGanttAuth, gotoGantt, waitGanttReady } from '../../utils/gantt-hook'

/** Exact color string set as ctx.fillStyle for the duty band (SEGMENT_DUTY_BG). */
const DUTY_BAND_FILL = 'rgba(133, 147, 166, 0.12)'

type FillSpy = Record<string, Record<string, number>>

/**
 * Wrap CanvasRenderingContext2D.fillStyle on the prototype and tally every color string set,
 * keyed by the owning canvas's data-testid. Installed via addInitScript so it is active before
 * the first paint and accumulates across all re-renders.
 */
const installFillSpy = (): void => {
  const proto = CanvasRenderingContext2D.prototype
  const desc = Object.getOwnPropertyDescriptor(proto, 'fillStyle')
  if (!desc || typeof desc.set !== 'function' || typeof desc.get !== 'function') return
  const origGet = desc.get
  const origSet = desc.set
  const byCanvas: FillSpy = {}
  ;(window as unknown as { __fillSpy: FillSpy }).__fillSpy = byCanvas
  Object.defineProperty(proto, 'fillStyle', {
    configurable: true,
    enumerable: desc.enumerable,
    get(this: CanvasRenderingContext2D) {
      return origGet.call(this)
    },
    set(this: CanvasRenderingContext2D, value: unknown) {
      if (typeof value === 'string') {
        const id = this.canvas?.dataset?.testid
        if (id) {
          const m = byCanvas[id] ?? (byCanvas[id] = {})
          m[value] = (m[value] ?? 0) + 1
        }
      }
      origSet.call(this, value)
    },
  })
}

const readSpy = (page: Page): Promise<FillSpy> =>
  page.evaluate(() => (window as unknown as { __fillSpy?: FillSpy }).__fillSpy ?? {})

test.describe('Gantt — flight-duty background band', () => {
  test('Live-1035 — roster + pairing panes draw the light-gray duty band for flight duties @smoke', async ({
    page,
    request,
  }) => {
    await page.addInitScript(installFillSpy)
    await seedGanttAuth(page, request)
    await gotoGantt(page)
    await waitGanttReady(page)
    await page.waitForTimeout(300) // let the canvases settle after data load

    const spy = await readSpy(page)
    const pairingBands = spy['pairing-canvas']?.[DUTY_BAND_FILL] ?? 0
    const rosterBands = spy['roster-canvas']?.[DUTY_BAND_FILL] ?? 0

    // Pairings contain only flight duties → every visible duty must get a band.
    expect(pairingBands, 'pairing pane drew duty-band fills (pickup→dropoff)').toBeGreaterThan(0)
    // Roster crew rows in Segment Mode get a band per flight duty.
    expect(rosterBands, 'roster pane drew duty-band fills for flight duties').toBeGreaterThan(0)
  })

  test('Live-1036 — flight pane (grouped by aircraft) does NOT draw the duty band', async ({ page, request }) => {
    await page.addInitScript(installFillSpy)
    await seedGanttAuth(page, request)
    await gotoGantt(page)
    await waitGanttReady(page)

    // Default layout shows roster + pairing only; add a Flight pane so its canvas paints.
    await page.getByTestId('add-pane-flight').click()
    const flightCanvas = page.locator('canvas[data-testid="flight-canvas"]')
    await expect(flightCanvas).toBeVisible()
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const c = document.querySelector<HTMLCanvasElement>('canvas[data-testid="flight-canvas"]')
            return !!c && c.width > 0
          }),
        { message: 'flight canvas never sized/painted' },
      )
      .toBe(true)
    await page.waitForTimeout(300)

    const spy = await readSpy(page)
    const flightFills = spy['flight-canvas'] ?? {}
    const flightTotalFills = Object.values(flightFills).reduce((a, b) => a + b, 0)
    const flightBands = flightFills[DUTY_BAND_FILL] ?? 0

    // Sanity: the flight pane actually painted (base row backgrounds etc.) — otherwise the
    // zero-band assertion below would be vacuous.
    expect(flightTotalFills, 'flight pane canvas painted something').toBeGreaterThan(0)
    // The duty band is scoped to the duty-based panes only — never the aircraft Flight pane.
    expect(flightBands, 'flight pane must not draw the flight-duty band').toBe(0)
  })
})
