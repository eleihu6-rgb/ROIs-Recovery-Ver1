/**
 * Legality Rule Sets — column resize + short-viewport card height.
 *
 * Cards live in a flex-col list. With overflow-hidden they used to flex-shrink
 * vertically at short heights and clip the meta row to thin color strips.
 * Cards must be shrink-0 so the list scrolls instead of crushing rows.
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test'

const GANTT_API = process.env.GANTT_API_URL ?? 'http://127.0.0.1:3000'

interface Auth {
  token: string
  userCode: string
  userName: string
  schema: string
  isAdmin: number
}

const adminLogin = async (request: APIRequestContext): Promise<Auth> => {
  const res = await request.post(`${GANTT_API}/api/auth/login`, {
    data: { userCode: 'admin', password: '123456' },
  })
  expect(res.ok()).toBeTruthy()
  return ((await res.json()) as { data: Auth }).data
}

const seedAdmin = async (page: Page, a: Auth) => {
  await page.addInitScript((x) => {
    window.sessionStorage.setItem(
      'rois-auth',
      JSON.stringify({
        user: {
          userCode: x.userCode,
          userName: x.userName,
          schema: x.schema,
          isAdmin: x.isAdmin,
        },
        token: x.token,
      }),
    )
  }, a)
}

const dragSplitterBy = async (page: Page, testId: string, dx: number) => {
  const splitter = page.getByTestId(testId)
  await expect(splitter).toBeVisible()
  const box = await splitter.boundingBox()
  expect(box).toBeTruthy()
  const x = box!.x + box!.width / 2
  const y = box!.y + box!.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y, { steps: 8 })
  await page.mouse.up()
}

const openRuleSets = async (page: Page): Promise<void> => {
  await page.goto('/')
  await page.getByTestId('module-nav-legality').click()
  await page.getByTestId('legality-nav-rule-sets').waitFor({ state: 'visible' }).catch(() => {})
  await expect(page.getByTestId('legality-rule-sets-view')).toBeVisible()
}

const firstCardId = async (page: Page): Promise<string> => {
  const card = page.locator('[data-testid^="legality-ruleset-card-"]').first()
  await expect(card).toBeVisible()
  const cardTestId = await card.getAttribute('data-testid')
  expect(cardTestId).toMatch(/^legality-ruleset-card-\d+$/)
  return cardTestId!.replace('legality-ruleset-card-', '')
}

test.describe('Legality Rule Sets — resizable columns', () => {
  test('dragging splitters widens catalog and sets columns', async ({ page, request }) => {
    await seedAdmin(page, await adminLogin(request))
    await openRuleSets(page)

    const catalog = page.getByTestId('rule-catalog-tree')
    const sets = page.getByTestId('legality-rule-sets-aside')
    await expect(catalog).toBeVisible()
    await expect(sets).toBeVisible()
    await expect(page.getByTestId('legality-catalog-sets-splitter')).toBeVisible()
    await expect(page.getByTestId('legality-sets-detail-splitter')).toBeVisible()

    const catalogBefore = (await catalog.boundingBox())!.width
    const setsBefore = (await sets.boundingBox())!.width
    expect(catalogBefore).toBeGreaterThanOrEqual(160)
    expect(setsBefore).toBeGreaterThanOrEqual(180)

    await dragSplitterBy(page, 'legality-catalog-sets-splitter', 80)
    const catalogAfter = (await catalog.boundingBox())!.width
    expect(catalogAfter).toBeGreaterThan(catalogBefore + 40)

    await dragSplitterBy(page, 'legality-sets-detail-splitter', 60)
    const setsAfter = (await sets.boundingBox())!.width
    expect(setsAfter).toBeGreaterThan(setsBefore + 30)
  })
})

test.describe('Legality Rule Sets — short viewport card height', () => {
  test('meta row stays tall when viewport height is short (no flex crush)', async ({ page, request }) => {
    await page.setViewportSize({ width: 1280, height: 560 })
    await seedAdmin(page, await adminLogin(request))
    await openRuleSets(page)

    const setId = await firstCardId(page)
    const meta = page.getByTestId(`legality-ruleset-card-meta-${setId}`)
    await expect(meta.getByText(/Enabled|Disabled/)).toBeVisible()

    const layout = await page.evaluate((id) => {
      const cardEl = document.querySelector(`[data-testid="legality-ruleset-card-${id}"]`)
      const metaEl = document.querySelector(`[data-testid="legality-ruleset-card-meta-${id}"]`)
      const enabledEl = metaEl?.querySelector('span.font-semibold')
      if (
        !(cardEl instanceof HTMLElement) ||
        !(metaEl instanceof HTMLElement) ||
        !(enabledEl instanceof HTMLElement)
      ) {
        return { ok: false, reason: 'missing' as const }
      }
      const cr = cardEl.getBoundingClientRect()
      const mr = metaEl.getBoundingClientRect()
      const er = enabledEl.getBoundingClientRect()
      const shrink = getComputedStyle(cardEl).flexShrink
      // Meta must not be a ~1–2px clipped strip (the short-viewport bug).
      const metaTallEnough = mr.height >= 12
      const enabledReadable =
        er.height >= 8 &&
        er.top >= cr.top - 1 &&
        er.bottom <= cr.bottom + 1
      return {
        ok: shrink === '0' && metaTallEnough && enabledReadable,
        reason: 'layout' as const,
        shrink,
        metaHeight: mr.height,
        enabledHeight: er.height,
        enabledReadable,
      }
    }, setId)
    expect(layout.ok, JSON.stringify(layout)).toBe(true)
  })
})
