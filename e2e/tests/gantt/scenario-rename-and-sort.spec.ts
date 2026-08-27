/**
 * Scenario Rename + List Sort E2E Tests.
 *
 * Two product changes are covered:
 *
 *   Scen-2040 — Rename from the list three-dot menu.
 *     The list item three-dot menu now offers "Rename" → opens a dialog
 *     pre-filled with the current name → editing + Save persists via
 *     PUT /api/scenario/:id. Verified the new name shows in the list, the old
 *     name is gone, and it survives a full page reload.
 *
 *   Scen-2041 — Newest scenario sorts to the top.
 *     The list is ordered updated_at DESC, so a freshly created scenario lands
 *     as the FIRST row (a new row's updated_at == created_at). A regression
 *     guard: a brand-new scenario must be the first scenario-list-item.
 *
 *   Scen-2042 — Editing an OLDER scenario floats it back to the top.
 *     Proves the ordering key is updated_at, not created_at: create A then B
 *     (B newest → top), then rename A via the UI. A's updated_at is now the most
 *     recent, so A must become the first row above B. This FAILS under the old
 *     created_at DESC ordering (B would stay on top).
 *
 * All tests drive the REAL backend (create/list/delete via API; rename via UI),
 * matching scenario-create.spec.ts / scenario-duplicate.spec.ts.
 */
import { test, expect } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'

const GANTT_API  = process.env.GANTT_API_URL  ?? 'http://localhost:3000'
const GANTT_USER = process.env.GANTT_TEST_USER ?? 'admin'
const GANTT_PASS = process.env.GANTT_TEST_PASS ?? '123456'

type ApiRequest = import('@playwright/test').APIRequestContext

const login = async (request: ApiRequest) => {
  const res = await request.post(`${GANTT_API}/api/auth/login`, {
    data: { userCode: GANTT_USER, password: GANTT_PASS },
  })
  expect(res.ok(), `login failed: ${res.status()}`).toBeTruthy()
  const json = (await res.json()) as { data: { token: string; userCode: string; userName: string; schema: string } }
  return json.data
}

const createRoScenario = async (request: ApiRequest, token: string, name: string): Promise<number> => {
  const res = await request.post(`${GANTT_API}/api/scenario`, {
    data: {
      name,
      fileType: 'RO',
      strDtLoc: '2026-05-01',
      endDtLoc: '2026-05-31',
      leadinLive: 1,
      username: GANTT_USER,
    },
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(res.ok(), `create failed: ${res.status()}`).toBeTruthy()
  const { data } = (await res.json()) as { data: { id: number } }
  return data.id
}

const deleteByNamePrefix = async (request: ApiRequest, token: string, prefixes: string[]): Promise<void> => {
  for (const name of prefixes) {
    const listRes = await request.get(`${GANTT_API}/api/scenario`, {
      params: { page: 1, pageSize: 50, fileType: 'RO', name },
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!listRes.ok()) continue
    const { data } = (await listRes.json()) as { data: { items: Array<{ id: number }> } }
    for (const item of data.items) {
      await request.delete(`${GANTT_API}/api/scenario/${item.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    }
  }
}

test.describe('Scenario — Rename + Sort', () => {
  // Serial: these tests assert global list ordering, and under updated_at DESC every
  // create/rename touches the top — running them in parallel makes the "top row" racy.
  test.describe.configure({ mode: 'serial' })

  const unique = `${Date.now()}`
  let token = ''

  test.beforeEach(async ({ page, request }) => {
    const auth = await login(request)
    token = auth.token
    await page.addInitScript((a) => {
      window.sessionStorage.setItem(
        'rois-auth',
        JSON.stringify({ user: { userCode: a.userCode, userName: a.userName, schema: a.schema }, token: a.token }),
      )
    }, auth)
  })

  test('Scen-2040 — rename from the list three-dot menu persists the new name', async ({ page, request }) => {
    const originalName = `RO-RENAME-SRC-${unique}`
    const newName      = `RO-RENAMED-${unique}`

    await createRoScenario(request, token, originalName)

    const scenario = new ScenarioPage(page)
    await scenario.gotoRo()

    // The source scenario is visible under its original name.
    const sourceItem = scenario.listItemByName(originalName)
    await expect(sourceItem).toHaveCount(1)

    // Open the three-dot menu and click Rename.
    await sourceItem.hover()
    await sourceItem.locator('button').last().click()
    await page.getByTestId('scenario-item-rename').click()

    // The rename dialog opens pre-filled with the current name.
    const dialog = page.getByTestId('scenario-rename-dialog')
    await expect(dialog).toBeVisible()
    const input = page.getByTestId('scenario-rename-input')
    await expect(input).toHaveValue(originalName)

    // Edit + Save, waiting for the real PUT round-trip.
    await input.fill(newName)
    const saved = page.waitForResponse(
      (r) =>
        /\/api\/scenario\/\d+(\?|$)/.test(r.url()) &&
        r.request().method() === 'PUT' &&
        r.ok(),
      { timeout: 15_000 },
    )
    await page.getByTestId('scenario-rename-confirm').click()
    await saved

    // List now shows the new name and the old name is gone.
    await expect(scenario.listItemByName(newName)).toHaveCount(1)
    await expect(scenario.listItemByName(originalName)).toHaveCount(0)

    // Persistence proof: full reload, re-navigate, re-check.
    await page.reload()
    await page.waitForLoadState('networkidle')
    await scenario.gotoRo()
    await expect(scenario.listItemByName(newName)).toHaveCount(1)
    await expect(scenario.listItemByName(originalName)).toHaveCount(0)

    await deleteByNamePrefix(request, token, [originalName, newName])
  })

  test('Scen-2041 — a freshly created scenario sorts to the top of the list', async ({ page, request }) => {
    const newestName = `RO-NEWEST-${unique}`

    // Create the scenario AFTER navigating away guarantees it is the most
    // recently created RO scenario in the DB.
    await createRoScenario(request, token, newestName)

    const scenario = new ScenarioPage(page)
    await scenario.gotoRo()

    // The newest scenario must be the FIRST row (updated_at DESC), on page 1 — no
    // paging needed to find it.
    const firstItem = page.getByTestId('scenario-list-item').first()
    await expect(firstItem).toContainText(newestName)

    await deleteByNamePrefix(request, token, [newestName])
  })

  test('Scen-2042 — editing an older scenario floats it back to the top (updated_at DESC)', async ({ page, request }) => {
    const olderName = `RO-OLDER-${unique}`
    const newerName = `RO-NEWER-${unique}`
    const editedName = `RO-EDITED-${unique}`

    // Create A (older) then B (newer). B has the more recent created_at AND updated_at,
    // so it starts on top.
    await createRoScenario(request, token, olderName)
    await createRoScenario(request, token, newerName)

    const scenario = new ScenarioPage(page)
    await scenario.gotoRo()

    // Compare the RELATIVE order of MY two rows (robust against other scenarios /
    // parallel tests that may also sit near the top). Returns the row index of the
    // first list-item whose text contains `name`, or -1 if absent.
    const rowIndexOf = async (name: string): Promise<number> => {
      const texts = await page.getByTestId('scenario-list-item').allInnerTexts()
      return texts.findIndex((t) => t.includes(name))
    }

    // Sanity: B (created last) sorts above A — both initially ordered by recency.
    await expect.poll(async () => {
      const [iNewer, iOlder] = [await rowIndexOf(newerName), await rowIndexOf(olderName)]
      return iNewer >= 0 && iOlder >= 0 && iNewer < iOlder
    }, { timeout: 15_000 }).toBe(true)

    // Rename the OLDER scenario through the real UI → bumps its updated_at to now.
    const olderItem = scenario.listItemByName(olderName)
    await expect(olderItem).toHaveCount(1)
    await olderItem.hover()
    await olderItem.locator('button').last().click()
    await page.getByTestId('scenario-item-rename').click()
    const input = page.getByTestId('scenario-rename-input')
    await expect(input).toHaveValue(olderName)
    await input.fill(editedName)
    const saved = page.waitForResponse(
      (r) =>
        /\/api\/scenario\/\d+(\?|$)/.test(r.url()) &&
        r.request().method() === 'PUT' &&
        r.ok(),
      { timeout: 15_000 },
    )
    await page.getByTestId('scenario-rename-confirm').click()
    await saved

    // The just-edited (formerly older) scenario now has the most recent update,
    // so it must sort ABOVE the newer one. Pre-fix (created_at DESC) the newer
    // scenario would still be above it (this assertion would fail).
    await expect.poll(async () => {
      const [iEdited, iNewer] = [await rowIndexOf(editedName), await rowIndexOf(newerName)]
      return iEdited >= 0 && iNewer >= 0 && iEdited < iNewer
    }, { timeout: 15_000 }).toBe(true)

    await deleteByNamePrefix(request, token, [olderName, newerName, editedName])
  })
})
