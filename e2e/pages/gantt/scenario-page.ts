/**
 * Scenario Page Object (Gantt).
 *
 * Drives the Scenario module: navigation, RO scenario creation, the
 * basic-info + RO crew-filter form, and the list/detail assertions.
 *
 * Selectors are data-testid based, matching the rest of the gantt e2e suite.
 */
import { type Page, type Locator, expect } from '@playwright/test'
import { gotoScenarioList } from './scenario-nav'

export interface RoScenarioInput {
  name: string
  startDate: string   // YYYY-MM-DD
  endDate: string     // YYYY-MM-DD
  crewBase: string    // e.g. 'YEG'
  /**
   * Division as shown in the dropdown label (from division table).
   * Prefer matching by option text contains; values are typically
   * "P — …" / "C — …" or legacy "Pilots"/"Cabin".
   */
  division: string
}

export interface PoScenarioInput {
  name: string
  startDate: string
  endDate: string
  /** Division option text substring, e.g. 'P' or 'Pilot'. */
  division: string
  /** Optional base code for multi-select, e.g. 'YEG'. */
  base?: string
}

export class ScenarioPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  // ─── Locators ────────────────────────────────────────────────────────

  get newButton(): Locator { return this.page.getByTestId('scenario-new-btn') }
  get s3PairingButton(): Locator { return this.page.getByTestId('scenario-s3-pairing-btn') }
  get importButton(): Locator { return this.page.getByTestId('scenario-import-btn') }
  get detailPanel(): Locator { return this.page.getByTestId('scenario-detail-panel') }
  get nameInput(): Locator { return this.page.getByTestId('scenario-name-input') }
  get typeBadge(): Locator { return this.page.getByTestId('scenario-type-badge') }
  get rpPeriod(): Locator { return this.page.getByTestId('scenario-rp-period') }
  get startDate(): Locator { return this.page.getByTestId('scenario-start-date') }
  get endDate(): Locator { return this.page.getByTestId('scenario-end-date') }
  get divisionSelect(): Locator { return this.page.getByTestId('scenario-crew-division') }
  get crewBases(): Locator { return this.page.getByTestId('scenario-crew-bases') }
  get poDivisionSelect(): Locator { return this.page.getByTestId('scenario-po-division') }
  get poBases(): Locator { return this.page.getByTestId('scenario-po-bases') }
  get saveButton(): Locator { return this.page.getByTestId('scenario-save-btn') }

  listItemByName(name: string): Locator {
    return this.page.getByTestId('scenario-list-item').filter({ hasText: name })
  }

  /**
   * Pin a scenario list row by its exact `#<id>` chip. The demo DB holds several copies
   * sharing a display name (e.g. "RO-2026-06 YEG Test---" → #6/#460/#467), so a name
   * filter resolves to >1 row; the id chip is unique. Prefer this over listItemByName
   * when opening a specific demo scenario.
   */
  listItemById(id: number): Locator {
    return this.page.getByTestId('scenario-list-item').filter({
      has: this.page.getByTestId('scenario-item-id').getByText(String(id), { exact: true }),
    })
  }

  /**
   * Surface and pin a specific demo scenario row: narrow the (long / virtualized) list by
   * name so the target row renders, then resolve the unique `#<id>` chip. Returns the row
   * locator, already asserted visible. Use this when several demo rows share a display name
   * — a bare name filter is ambiguous and the row may not be in the DOM until searched.
   */
  async scenarioRow(id: number, searchName: string): Promise<Locator> {
    await this.page.getByPlaceholder('Search scenarios…').fill(searchName)
    const item = this.listItemById(id)
    // The live-server connects to a remote Postgres; scenario list queries can take 15-30s.
    await expect(item, `scenario #${id} ("${searchName}") must be in the list`).toBeVisible({ timeout: 40_000 })
    return item
  }

  // ─── Navigation ──────────────────────────────────────────────────────

  /** Open the app, go to the Scenario module and select the RO section. */
  async gotoRo(): Promise<void> {
    await this.page.goto('/altair/')
    // The gantt keeps persistent WebSocket connections that permanently block
    // networkidle. Playwright's built-in auto-wait on getByTestId is sufficient
    // for the SPA to hydrate before each click.
    await gotoScenarioList(this.page)
    await this.page.getByTestId('scenario-nav-ro').click()
    // Wait for the RO list to settle (New button is the stable anchor).
    await expect(this.newButton).toBeVisible()
  }

  /** Open the app, go to the Scenario module and select the PO (pairing) section. */
  async gotoPo(): Promise<void> {
    await this.page.goto('/altair/')
    await gotoScenarioList(this.page)
    await this.page.getByTestId('scenario-nav-po').click()
    // Wait for the PO list to settle (New button is the stable anchor).
    await expect(this.newButton).toBeVisible()
  }

  // ─── Actions ─────────────────────────────────────────────────────────

  /**
   * Create a new RO scenario and fill the whole form, then save.
   * Returns once the Save button reports the persisted "Saved" state.
   */
  async createRoScenario(input: RoScenarioInput): Promise<void> {
    // 1. Create — the new draft is auto-selected and the detail panel opens.
    await this.newButton.click()
    await expect(this.detailPanel).toBeVisible()
    await expect(this.nameInput).toHaveValue('New Scenario')
    await expect(this.typeBadge).toHaveText('RO')

    // 2. Name
    await this.nameInput.fill(input.name)

    // 3. RP Date
    await this.selectRpDate(input.startDate, input.endDate)

    // 4. Crew division — option labels come from the division table
    // (e.g. "P — 飞行员 Pilot"). Map legacy labels Pilots/Cabin → P/C.
    const divisionMatch =
      input.division === 'Pilots' || input.division === 'P' || input.division === 'Pilot'
        ? /P|Pilot|飞行员/
        : input.division === 'Cabin' || input.division === 'C'
          ? /C|Cabin|客舱/
          : new RegExp(input.division.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    await this.divisionSelect.click()
    const divOption = this.page.getByRole('option').filter({ hasText: divisionMatch }).first()
    await expect(divOption).toBeVisible()
    await divOption.click()
    await expect(this.divisionSelect).toContainText(divisionMatch)

    // 5. Crew base — pick from the system base dropdown (MultiSelect), not free text.
    await this.crewBases.click()
    await this.page.getByRole('menuitemcheckbox', { name: input.crewBase, exact: true }).click()
    await this.page.keyboard.press('Escape')
    await expect(this.crewBases).toContainText(input.crewBase)

    // 6. Save and wait for the save to actually COMPLETE.
    await this.save()
  }

  /**
   * Create a new PO scenario, set Division / optional Bases, then save.
   */
  async createPoScenario(input: PoScenarioInput): Promise<void> {
    await this.newButton.click()
    await expect(this.detailPanel).toBeVisible()
    await expect(this.nameInput).toHaveValue('New Scenario')
    await expect(this.typeBadge).toHaveText('PO')

    await this.nameInput.fill(input.name)
    await this.selectRpDate(input.startDate, input.endDate)

    await expect(this.poDivisionSelect).toBeVisible()
    await this.poDivisionSelect.click()
    const divOption = this.page.getByRole('option').filter({ hasText: input.division }).first()
    await expect(divOption).toBeVisible()
    await divOption.click()
    await expect(this.poDivisionSelect).toContainText(input.division)

    if (input.base) {
      await this.poBases.click()
      await this.page.getByRole('menuitemcheckbox', { name: input.base, exact: true }).click()
      await this.page.keyboard.press('Escape')
      await expect(this.poBases).toContainText(input.base)
    }

    await this.save()
  }

  /**
   * Click Save and wait for the save round-trip to COMPLETE (the PUT
   * /api/scenario/:id response), not merely to start.
   *
   * Why this matters: the Save button is disabled both while saving AND once
   * clean, so "wait for disabled" returns at save *start*. Any edit made before
   * the save's success handler runs is at risk (the store overwrites the draft
   * with the server row on success). Waiting for the real response makes
   * sequential edit→save→edit→save flows deterministic. The dedicated
   * scenario-store-draft-race.spec.ts intentionally does NOT use this helper —
   * it provokes that race to flag the product bug.
   */
  async save(): Promise<void> {
    await expect(this.saveButton).toBeEnabled()
    const saved = this.page.waitForResponse(
      (r) =>
        /\/api\/scenario\/\d+(\?|$)/.test(r.url()) &&
        r.request().method() === 'PUT' &&
        r.ok(),
      { timeout: 15_000 },
    )
    await this.saveButton.click()
    await saved
    // Let the success handler settle the store (draft reset) before returning,
    // so a subsequent edit isn't clobbered by the in-flight save's resolution.
    await expect(this.saveButton).toBeDisabled({ timeout: 15_000 })
  }

  async selectRpDate(startDate: string, endDate: string): Promise<void> {
    const periodLabel = new RegExp(`${startDate.slice(0, 4)}.*${startDate.slice(5, 7)}`)
    await this.rpPeriod.click()
    const option = this.page.getByRole('option').filter({ hasText: periodLabel }).first()
    await expect(option).toBeVisible()
    await option.click()
    await expect(this.startDate).toHaveValue(startDate)
    await expect(this.endDate).toHaveValue(endDate)
  }

  // ─── Assertions ──────────────────────────────────────────────────────

  /** Assert the detail panel reflects the given RO scenario values. */
  async expectDetailMatches(input: RoScenarioInput): Promise<void> {
    await expect(this.nameInput).toHaveValue(input.name)
    await expect(this.typeBadge).toHaveText('RO')
    await expect(this.startDate).toHaveValue(input.startDate)
    await expect(this.endDate).toHaveValue(input.endDate)
    await expect(this.divisionSelect).toContainText(input.division)
    await expect(this.crewBases).toContainText(input.crewBase)
  }
}
