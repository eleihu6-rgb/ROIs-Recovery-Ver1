/**
 * Gantt Scenario scope filters — Base selection from the system base list.
 *
 * Bases (crew + pairing) used to be entered as FREE TEXT via a TagInput, which
 * let schedulers type anything. They now come from the airline's configured
 * base list (GET /api/base, shared reference-store) via a MultiSelect dropdown.
 *
 * This test proves:
 *   - the crew Bases control is a dropdown that lists SYSTEM bases (YVR/YEG/YYZ…),
 *     not a free-text field (the old `scenario-crew-bases-input` is gone),
 *   - picking a base from the dropdown adds it to the selection and updates the
 *     compiled FILTER summary,
 *   - the pairing Bases control offers the same system dropdown.
 *
 * In the old free-text layout there was no `menuitemcheckbox` option list, so
 * the "system option visible" assertion would have failed before the change.
 */
import { test, expect } from '@playwright/test'
import { ScenarioPage } from '../../pages/gantt/scenario-page'

const GANTT_API = process.env.GANTT_API_URL ?? 'http://localhost:3000'
const GANTT_USER = process.env.GANTT_TEST_USER ?? 'admin'
const GANTT_PASS = process.env.GANTT_TEST_PASS ?? '123456'

test.describe('Scenario — Base selection from system list', () => {
  const namePrefix = `RO-BaseSel-${Date.now()}`
  let token = ''

  const login = async (request: import('@playwright/test').APIRequestContext) => {
    const res = await request.post(`${GANTT_API}/api/auth/login`, {
      data: { userCode: GANTT_USER, password: GANTT_PASS },
    })
    expect(res.ok(), `login failed: ${res.status()}`).toBeTruthy()
    const json = (await res.json()) as {
      data: { token: string; userCode: string; userName: string; schema: string }
    }
    return json.data
  }

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

  // Self-clean: remove any scenario this test created (name starts with our prefix).
  test.afterEach(async ({ request }) => {
    const listRes = await request.get(`${GANTT_API}/api/scenario`, {
      params: { page: 1, pageSize: 50, fileType: 'RO', name: namePrefix },
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!listRes.ok()) return
    const { data } = (await listRes.json()) as { data: { items: Array<{ id: number }> } }
    for (const item of data.items) {
      await request.delete(`${GANTT_API}/api/scenario/${item.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    }
  })

  test('Scen-2007 — crew & pairing Bases are dropdowns sourced from the system base list, not free text', async ({ page }) => {
    const scenario = new ScenarioPage(page)

    await scenario.gotoRo()
    await scenario.newButton.click()
    await expect(scenario.detailPanel).toBeVisible()

    // Rename + save so the afterEach cleanup (filters by our prefix) can delete it.
    await scenario.nameInput.fill(namePrefix)
    await scenario.save()

    const panel = scenario.detailPanel

    // ── Crew Bases: open the dropdown and confirm it lists SYSTEM bases. ──────
    await scenario.crewBases.click()
    const yeg = page.getByRole('menuitemcheckbox', { name: 'YEG', exact: true })
    const yyz = page.getByRole('menuitemcheckbox', { name: 'YYZ', exact: true })
    await expect(yeg).toBeVisible()
    await expect(yyz).toBeVisible()

    // The old free-text input must NOT exist anymore.
    await expect(page.getByTestId('scenario-crew-bases-input')).toHaveCount(0)

    // ── Pick YEG from the dropdown → it becomes a selected chip on the trigger.
    await yeg.click()
    await page.keyboard.press('Escape')
    await expect(scenario.crewBases).toContainText('YEG')

    // ── The compiled FILTER summary reflects the chosen base. ────────────────
    await expect(panel.getByText(/FILTER:/i).first()).toBeVisible()
    await expect(panel.getByText(/YEG/).first()).toBeVisible()

    // ── Pairing Bases: same system dropdown, distinct from crew. ─────────────
    const pairingBases = panel.getByTestId('scenario-pairing-bases')
    await pairingBases.click()
    const pairingYyz = page.getByRole('menuitemcheckbox', { name: 'YYZ', exact: true })
    await expect(pairingYyz).toBeVisible()
    await pairingYyz.click()
    await page.keyboard.press('Escape')
    await expect(pairingBases).toContainText('YYZ')
  })
})
