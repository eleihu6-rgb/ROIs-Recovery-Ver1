import { test, expect } from '@playwright/test'
import { PbsLoginPage } from '../../pages/pbs-portal/pbs-login-page'

const PBS_USER = process.env.PBS_TEST_USER ?? '762'
const PBS_PASS = process.env.PBS_TEST_PASS ?? 'rois'

test.use({ storageState: { cookies: [], origins: [] } })

/**
 * Regression for the top-nav layout: the version badge ("Ver:B/F") is positioned
 * in the right-side actions cluster (real px, anchored right-8), while nav items
 * live in a scaled design canvas. When MENU_RIGHT_RESERVED was too small the last
 * visible nav item ("Help") extended right and overlapped the version badge.
 *
 * This test would have FAILED before the fix (Help box right edge ran past the
 * badge left edge) and passes after reserving enough real-px width + tighter gap.
 */
const VIEWPORTS = [
  { width: 1366, height: 768, label: '1366 (common laptop — bug reproduced here)' },
  { width: 1440, height: 900, label: '1440' },
  { width: 1536, height: 864, label: '1536' },
]

for (const vp of VIEWPORTS) {
  test(`PBS-3101 — version badge does not overlap Help nav item @ ${vp.label}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height })

    const login = new PbsLoginPage(page)
    await login.goto()
    await login.login(PBS_USER, PBS_PASS)
    await page.waitForURL(/\/dashboard$/, { timeout: 15_000 })

    const badge = page.locator('[data-testid="pbs-version-badge"]')
    await expect(badge).toBeVisible({ timeout: 5000 })
    await expect(badge).toContainText('Ver:B')

    // Whatever the LAST visible nav item is (Help, or whatever survives before the
    // overflow "More" menu at narrower widths), it must not run into the version
    // badge. This was the collision before the fix.
    const navLinks = page.getByTestId('dashboard-top-nav').getByRole('link')
    const linkCount = await navLinks.count()
    expect(linkCount, 'at least one nav item should be visible').toBeGreaterThan(0)
    const lastNavLink = navLinks.nth(linkCount - 1)
    await expect(lastNavLink).toBeVisible()

    const badgeBox = await badge.boundingBox()
    const lastBox = await lastNavLink.boundingBox()
    expect(badgeBox, 'version badge should have a layout box').not.toBeNull()
    expect(lastBox, 'last nav link should have a layout box').not.toBeNull()

    // No horizontal overlap: last nav item must end before the version badge begins.
    expect(
      lastBox!.x + lastBox!.width,
      `last nav item right edge (${(lastBox!.x + lastBox!.width).toFixed(1)}) must stay left of ` +
        `version badge left edge (${badgeBox!.x.toFixed(1)})`,
    ).toBeLessThanOrEqual(badgeBox!.x)
  })
}
