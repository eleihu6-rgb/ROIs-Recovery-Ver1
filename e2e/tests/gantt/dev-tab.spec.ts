import { test, expect, type Page } from '@playwright/test'

import { seedGanttAuth } from '../../utils/gantt-hook'

const BASE = process.env.GANTT_BASE_URL ?? 'http://localhost:5173'

const openDev = async (page: Page) => {
  await page.click('[data-testid="nav-dev"]')
  await expect(page.getByTestId('dev-view')).toBeVisible()
}

const unlock = async (page: Page, code: string) => {
  await page.getByTestId('dev-code-input').fill(code)
  await page.getByTestId('dev-code-submit').click()
}

test.describe('Dev tab — Code Enhancement Playbook (gated)', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await page.goto(`${BASE}/altair/`)
    await page.waitForSelector('[data-testid="nav-dev"]', { timeout: 20_000 })
  })

  test('Dev tab sits AFTER Regression and BEFORE Help in the top nav', async ({ page }) => {
    const regression = await page.getByTestId('nav-regression').boundingBox()
    const dev = await page.getByTestId('nav-dev').boundingBox()
    const help = await page.getByTestId('nav-help').boundingBox()
    expect(regression && dev && help).toBeTruthy()
    expect(dev!.x).toBeGreaterThan(regression!.x)
    expect(dev!.x).toBeLessThan(help!.x)
  })

  test('content and sidebar gated until access code entered', async ({ page }) => {
    await openDev(page)
    await expect(page.getByTestId('dev-gate')).toBeVisible()
    await expect(page.getByTestId('dev-content')).toHaveCount(0)
    await expect(page.getByTestId('dev-sidebar')).toHaveCount(0)
  })

  test('a wrong code keeps tab locked and shows error', async ({ page }) => {
    await openDev(page)
    await unlock(page, '1234')
    await expect(page.getByTestId('dev-code-error')).toBeVisible()
    await expect(page.getByTestId('dev-content')).toHaveCount(0)
  })

  test('entering 5566 shows timeline and sidebar coverage', async ({ page }) => {
    await openDev(page)
    await unlock(page, '5566')

    await expect(page.getByTestId('dev-content')).toBeVisible()
    await expect(page.getByTestId('dev-enhancement-log')).toBeVisible()
    await expect(page.getByTestId('dev-day-2026-06-16')).toBeVisible()
    await expect(page.getByTestId('dev-sidebar')).toBeVisible()
    await expect(page.getByTestId('dev-coverage')).toContainText('2')
    await expect(page.getByTestId('dev-coverage')).toContainText('12 modules')
  })

  test('Playbook sub-view shows steps; Timeline sub-view shows log', async ({ page }) => {
    await openDev(page)
    await unlock(page, '5566')

    await page.getByTestId('dev-subview-playbook').click()
    const steps = page.getByTestId('dev-playbook-steps')
    await expect(steps).toBeVisible()
    await expect(steps).toContainText('Verify against live code')
    await expect(steps).toContainText('Record & bump')
    await expect(page.getByTestId('dev-enhancement-log')).toHaveCount(0)

    await page.getByTestId('dev-subview-timeline').click()
    await expect(page.getByTestId('dev-enhancement-log')).toBeVisible()
  })

  test('sidebar lists module brief info; clicking filters timeline', async ({ page }) => {
    await openDev(page)
    await unlock(page, '5566')

    const gantt = page.getByTestId('dev-sidebar-module-gantt')
    await expect(gantt).toHaveAttribute('data-done', 'true')
    await expect(gantt).toContainText('gantt')
    await expect(gantt).toContainText('5')
    await expect(gantt).toContainText('last 2026-06-16')

    const pbs = page.getByTestId('dev-sidebar-module-pbs-server')
    await expect(pbs).toHaveAttribute('data-done', 'false')
    await expect(pbs).toContainText('no job done yet')

    await expect(page.locator('[data-testid^="dev-sidebar-module-"]')).toHaveCount(12)

    await gantt.click()
    const log = page.getByTestId('dev-enhancement-log')
    await expect(log).toContainText('getGanttColors')
    await expect(log).not.toContainText('assignPairing')

    await page.getByTestId('dev-sidebar-module-pbs-server').click()
    await expect(log).toContainText('No job done yet pbs-server')

    await page.getByTestId('dev-sidebar-all').click()
    await expect(log).toContainText('getGanttColors')
    await expect(log).toContainText('assignPairing')
  })

  test('focus filter search narrow timeline', async ({ page }) => {
    await openDev(page)
    await unlock(page, '5566')

    const log = page.getByTestId('dev-enhancement-log')

    await page.getByTestId('dev-focus-code-quality').click()
    await expect(log).toContainText('Deleted 12')
    await expect(log).not.toContainText('getGanttColors')

    await page.getByTestId('dev-focus-all').click()
    await expect(log).toContainText('getGanttColors')

    await page.getByTestId('dev-search').fill('getGanttColors')
    await expect(log).toContainText('getGanttColors')
    await expect(log).not.toContainText('assignPairing')
  })

  test('skill tree opens generated project skill details', async ({ page }) => {
    await openDev(page)
    await unlock(page, '5566')

    const skillHeader = page.getByTestId('dev-tree-skills')
    const moduleHeader = page.getByTestId('dev-tree-modules')
    await expect(skillHeader).toHaveAttribute('data-open', 'false')
    await expect(page.getByTestId('dev-skill-tree')).toHaveCount(0)

    const skillBox = await skillHeader.boundingBox()
    const moduleBox = await moduleHeader.boundingBox()
    expect(skillBox && moduleBox).toBeTruthy()
    expect(skillBox!.y).toBeLessThan(moduleBox!.y)

    await skillHeader.click()
    await expect(skillHeader).toHaveAttribute('data-open', 'true')

    const tree = page.getByTestId('dev-skill-tree')
    await expect(tree).toBeVisible()

    const firstSkill = page.locator('[data-testid^="dev-sidebar-skill-"]').first()
    await expect(firstSkill).toContainText('001')

    await page.getByTestId('dev-sidebar-skill-108-npbs-bids-portal-simulation').click()

    const details = page.getByTestId('dev-skill-details')
    await expect(details).toBeVisible()
    await expect(details).toContainText('108')
    await expect(details).toContainText('NPBS-Legend')
    await expect(details).toContainText('How To Use')
    await expect(details).toContainText('.agents/skills/108-npbs-bids-portal-simulation/SKILL.md')
    await expect(details).toContainText('agents')

    await page.getByTestId('dev-sidebar-skill-115-gantt-playbook').click({ button: 'right' })
    await expect(details).toContainText('115')
    await expect(details).toContainText('Gantt Playbook')
  })

  test('unlock persists across reload within session without re-prompt', async ({ page }) => {
    await openDev(page)
    await unlock(page, '5566')
    await expect(page.getByTestId('dev-content')).toBeVisible()

    await page.reload()
    await page.waitForSelector('[data-testid="nav-dev"]', { timeout: 20_000 })
    await openDev(page)

    await expect(page.getByTestId('dev-content')).toBeVisible()
    await expect(page.getByTestId('dev-gate')).toHaveCount(0)
  })
})
