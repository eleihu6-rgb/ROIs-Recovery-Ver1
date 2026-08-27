/**
 * Browser tab identity — title + favicon.
 *
 * Change: the gantt app's browser tab previously said "Gantt" with no favicon
 * (browser default icon). It now identifies as "ROIs Altair" with an abstract
 * green paper-plane favicon (served as /altair/favicon.svg from public/).
 *
 * Assertions (§No-Illusion — specific values, not mere visibility):
 *  - document.title is exactly "ROIs Altair" (and NOT the old "Gantt")
 *  - <link rel="icon"> exists, is image/svg+xml and points at favicon.svg
 *  - the favicon URL actually serves: HTTP 200, svg content type, and the
 *    body contains the aircraft <path> (so it is not an empty/default icon)
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth } from '../../utils/gantt-hook'

test.describe('Gantt — browser tab identity (title + aircraft favicon)', () => {
  test('Live-1263 — tab is titled "ROIs Altair" and serves an aircraft SVG favicon @smoke', async ({
    page,
    request,
  }) => {
    await seedGanttAuth(page, request)
    await page.goto('/altair/')
    await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, {
      timeout: 30_000,
    })

    // 1. Tab title — exact value, old name must be gone.
    await expect(page).toHaveTitle('ROIs Altair')
    expect(await page.title()).not.toBe('Gantt')

    // 2. Favicon <link> — declared in <head>, svg type, correct href.
    const iconLink = page.locator('head link[rel="icon"]')
    await expect(iconLink).toHaveAttribute('type', 'image/svg+xml')
    const href = await iconLink.getAttribute('href')
    expect(href, 'favicon link href missing').toBeTruthy()
    expect(href).toContain('favicon.svg')

    // 3. The favicon actually resolves and contains the aircraft path.
    const iconUrl = new URL(href as string, page.url()).toString()
    const res = await request.get(iconUrl)
    expect(res.status(), `favicon fetch failed at ${iconUrl}`).toBe(200)
    expect(res.headers()['content-type'] ?? '').toContain('svg')
    const body = await res.text()
    expect(body).toContain('<svg')
    // The abstract paper-plane is faceted in greens — assert the nose vertex
    // path and a green facet fill, proving the file is the aircraft icon and
    // not a placeholder or an empty svg.
    expect(body).toContain('M22 2')
    expect(body).toContain('#22c55e')
  })
})
