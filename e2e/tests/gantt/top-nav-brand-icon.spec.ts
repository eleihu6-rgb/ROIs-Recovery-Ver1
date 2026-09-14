/**
 * Top Nav brand slot — ROIs Altair crew-app icon replaces the airline (F8) logo.
 *
 * Ryan: the top-left brand slot in the shell top nav should show the crew-app
 * icon (docs/design/altair-crew-app-icon.svg) as static branding, not the
 * per-airline logo. §No-Illusion: assert the actual rendered <img> src/alt,
 * not just "something is visible".
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'
import { seedGanttAuth, gotoGantt } from '../../utils/gantt-hook'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

test.describe('Top Nav brand icon', () => {
  test('Live-brand-icon — brand slot renders the crew-app icon, not the airline logo', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await gotoGantt(page)

    const brandIcon = page.getByAltText('ROIs Altair crew app icon')
    await expect(brandIcon).toBeVisible()

    // Vite inlines this small SVG as a data URI (not a file path) — assert on
    // the icon's distinctive sage-tile fill color instead of a filename.
    const src = await brandIcon.getAttribute('src')
    expect(src).toMatch(/^data:image\/svg\+xml/)
    expect(src).toContain('1e443d')

    await page.screenshot({ path: path.join(repoRoot, 'docs/assets/screenshots/gantt/top-nav-brand-icon-Ver1.png') })
  })
})
