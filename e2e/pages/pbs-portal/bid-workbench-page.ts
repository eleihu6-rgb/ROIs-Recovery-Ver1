/**
 * PBS Portal Bid Workbench Page Object.
 *
 * Drives the real bid-placement UI (pairing / days-off / line / reserve) the way
 * a crew does: open a property's config dialog, set action + value + tier, click
 * ADD BID, and verify the property lands in the EXISTING list.
 *
 * Selectors are grounded in the live DOM (observed via exploration), NOT guessed:
 *   - Pairing add workspace:  [data-testid="pairing-add-properties-workspace"]
 *   - Rule-bid add workspace:  [data-testid="rule-bid-add-properties-workspace"]
 *   - Existing rows: pairing-property-row-* | rule-bid-existing-row
 *   - Config dialog: role=dialog with TIER buttons T1..T7, Award/Avoid, ADD BID,
 *     value inputs aria-labelled "BID <name>" / "BID <name> operator" / "BID <name> date".
 *
 * placeProperty NEVER throws on an unsupported control — it returns
 * { placed:false, reason } so the caller can record it (project rule #7: record
 * Playwright blockers, do not change product code to fit).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Page, type Locator, expect } from '@playwright/test'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const FAILURE_IMAGE_DIR = path.join(repoRoot, 'image/pbs')
const PAIRING_OPTION_TIMEOUT_MS = process.env.CREWBIDS_FAST_MODE === '1' ? 2500 : 10_000

/** Compact timestamp YYYYMMDD-HHMMSS-mmm for snapshot filenames. */
const stamp = (): string => {
  const d = new Date()
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${p(d.getMilliseconds(), 3)}`
}
const safe = (s: string): string => s.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export type BidPageKind = 'pairing' | 'days-off' | 'line' | 'reserve'

export interface FixtureBid {
  type: string
  timeType?: 'check_in' | 'check_out'
  operator?: string
  value?: string | number
  values?: string[]
  from?: string
  to?: string
  mode?: string
  event?: 'landing' | 'layover' | 'both'
  locations?: string[]
  dateScope?: unknown
  minDays?: number | null
  maxDays?: number | null
  minimumDuration?: string
  minimumCredit?: string
  maximumCredit?: string
  minimumLayoverDuration?: string | null
  daysOnMin?: number
  daysOnMax?: number
  daysOff?: number
  callType?: string
  window?: { from: string; to: string }
  raw?: string
  employeeNumber?: string
  crewId?: string
  crewName?: string
  relationship?: 'together' | 'apart'
  scheduleType?: 'work' | 'days_off'
  thresholdType?: 'minimum' | 'maximum'
  days?: number
  originDates?: string[]
}

export interface FixtureProperty {
  tier: string
  page: BidPageKind
  propertyCode: number
  name: string
  action: 'award' | 'avoid'
  quantifier?: 'any' | 'every'
  bid: FixtureBid
  predicate?: string
}

export interface PlaceResult {
  placed: boolean
  reason?: string
  /** Relative path to the failure snapshot under image/pbs (set on failure). */
  image?: string
}

const MONTHS: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
}
const DOW3: Record<string, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
}

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/**
 * "Jun 3, 2026" -> "2026-06-03"; returns null if not a date. Clamps an
 * out-of-range day to the month's last day (the Mar->Jun shift can produce
 * "Jun 31", which has no real equivalent — clamp to Jun 30 rather than emit a
 * malformed date the input would reject).
 */
const toIso = (s: string): string | null => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^([A-Z][a-z]{2}) (\d{1,2}), (\d{4})$/)
  if (!m) return null
  const mm = MONTHS[m[1]]
  if (!mm) return null
  let day = parseInt(m[2], 10)
  const max = DAYS_IN_MONTH[parseInt(mm, 10) - 1]
  if (day > max) day = max
  if (day < 1) day = 1
  return `${m[3]}-${mm}-${String(day).padStart(2, '0')}`
}
const asDow = (s: string): string | null => DOW3[s.trim().toLowerCase()] ?? null

const PAGE_PATH: Record<BidPageKind, string> = {
  pairing: 'bid',
  'days-off': 'bid',
  line: 'bid',
  reserve: 'reserve',
}

const CURRENT_DRAFT_ENDPOINT: Record<BidPageKind, string> = {
  pairing: '/pairing-bids/current',
  'days-off': '/days-off-bids/current',
  line: '/line-bids/current',
  reserve: '/reserve-bids/current',
}

const BID_TAB_LABEL: Record<Exclude<BidPageKind, 'reserve'>, string> = {
  'days-off': 'DAYS OFF',
  pairing: 'PAIRING',
  line: 'ROSTER',
}

const SUMMARY_BADGE: Record<BidPageKind, string> = {
  'days-off': 'Days Off',
  pairing: 'Pairing',
  line: 'Roster',
  reserve: 'Reserve',
}

export interface BidWorkbenchContext {
  crewId: string
  testId: string
}

export class BidWorkbenchPage {
  readonly page: Page
  private readonly ctx: BidWorkbenchContext

  constructor(page: Page, ctx: BidWorkbenchContext = { crewId: 'unknown', testId: 'unknown' }) {
    this.page = page
    this.ctx = ctx
  }

  /**
   * Snapshot the current screen for a failed step into image/pbs, named by crew
   * id, test case id, the property, a tag, and a timestamp (user requirement).
   * Returns the relative image path so the caller can record it in the issues file.
   */
  async snapshotFailure(tag: string, property?: FixtureProperty): Promise<string> {
    fs.mkdirSync(FAILURE_IMAGE_DIR, { recursive: true })
    const propPart = property ? `${property.tier}-${property.propertyCode}` : 'step'
    const file = `${safe(this.ctx.crewId)}_${safe(this.ctx.testId)}_${safe(propPart)}_${safe(tag)}_${stamp()}.png`
    const abs = path.join(FAILURE_IMAGE_DIR, file)
    await this.page.screenshot({ path: abs }).catch(() => {})
    return path.relative(repoRoot, abs)
  }

  private workspaceTestId(kind: BidPageKind): string {
    return kind === 'pairing' ? 'pairing-add-properties-workspace' : 'rule-bid-add-properties-workspace'
  }

  private existingLocator(kind: BidPageKind): Locator {
    if (kind === 'reserve') return this.page.getByTestId('rule-bid-existing-row')
    return this.page.getByTestId('tier-summary-row').filter({ hasText: SUMMARY_BADGE[kind] })
  }

  /** Navigate to a bid page and wait for its add-properties workspace (slow remote DB). */
  async goto(kind: BidPageKind): Promise<void> {
    const draftResponsePromise = this.page.waitForResponse((response) =>
      response.url().includes(CURRENT_DRAFT_ENDPOINT[kind])
        && response.request().method() === 'GET',
      { timeout: 120_000 },
    )
    await this.page.goto(PAGE_PATH[kind])
    if (kind === 'reserve') {
      await expect(this.page.getByText('Reserve Preference').first()).toBeVisible({ timeout: 120_000 })
      const draftResponse = await draftResponsePromise
      if (!draftResponse.ok()) {
        throw new Error(`Load ${kind} current draft failed with HTTP ${draftResponse.status()}`)
      }
      return
    }
    await expect(this.page.getByTestId('bid-page')).toBeVisible({ timeout: 120_000 })
    const tab = this.page.getByRole('tab', { name: BID_TAB_LABEL[kind], exact: true })
    if (await tab.count()) await tab.click()
    const workspace = this.page.getByTestId(this.workspaceTestId(kind))
    // The remote demo Postgres can take tens of seconds to hydrate the panel.
    await expect(workspace).toBeVisible({ timeout: 120_000 })
    const draftResponse = await draftResponsePromise
    if (!draftResponse.ok()) {
      throw new Error(`Load ${kind} current draft failed with HTTP ${draftResponse.status()}`)
    }
  }

  /** Locate a property by name in the workspace, paginating/searching if needed. */
  private async openPropertyDialog(property: FixtureProperty): Promise<'dialog' | 'direct-added' | 'not-found'> {
    await this.dismissDialog()
    const { page: kind, name } = property
    if (kind === 'reserve') {
      const addReserve = this.page.getByRole('button', { name: /add reserve preference/i }).first()
      if (!(await addReserve.count())) return 'not-found'
      await addReserve.click()
      await this.page.getByRole('dialog').waitFor({ timeout: 10_000 }).catch(() => {})
      return (await this.page.getByRole('dialog').count()) ? 'dialog' : 'not-found'
    }
    const workspace = this.page.getByTestId(this.workspaceTestId(kind))
    const search = this.page.getByPlaceholder(/search bid properties|search/i).first()
    if (await search.count()) {
      await search.fill('')
      await search.fill(name)
      await this.page.waitForTimeout(700)
    }

    const findItem = (): Locator =>
      workspace
        .getByRole('button', { name: new RegExp(`^Add ${escapeRegExp(name)}$`) })
        .first()

    let item = findItem()
    if (!(await item.count())) {
      // paginate through footer page buttons 1..6
      for (const p of ['1', '2', '3', '4', '5', '6']) {
        const pageBtn = this.page.getByRole('button', { name: p, exact: true }).last()
        if (await pageBtn.count()) {
          await pageBtn.click().catch(() => {})
          await this.page.waitForTimeout(500)
        }
        item = findItem()
        if (await item.count()) break
      }
    }
    if (!(await item.count())) return 'not-found'

    await item.scrollIntoViewIfNeeded().catch(() => {})
    const row = this.page.getByTestId('rule-bid-available-row').filter({ hasText: name }).first()
    if (kind !== 'pairing' && await row.count()) await this.setAvailableRuleBidTier(row, name, property.tier)
    await item.click()
    const dialog = this.page.getByRole('dialog')
    await dialog.waitFor({ timeout: 10_000 }).catch(() => {})
    if (await dialog.count()) return 'dialog'
    // Some rule-bid flag properties (for example Line "Max Credit Window") are
    // added immediately without opening a configure dialog.
    if (await this.isAlreadyPresent(property)) return 'direct-added'
    return 'not-found'
  }

  /**
   * Rule-bid pages (line/days-off/reserve) expose tier toggles on the available
   * row itself. Flag rows such as Line "Min Credit Window" are added directly
   * without opening a dialog, so their target tier must be selected before Add.
   */
  private async setAvailableRuleBidTier(item: Locator, name: string, tier: string): Promise<void> {
    const tierBtn = (label: string) => item
      .getByRole('button', { name: new RegExp(`^Toggle available ${label} for ${escapeRegExp(name)}$`) })
      .first()
    const hasTierButtons = (await tierBtn(tier).count()) > 0
    if (!hasTierButtons) return

    const isActive = async (label: string): Promise<boolean> => {
      const btn = tierBtn(label)
      return (await btn.getAttribute('data-active')) === 'true'
        || (await btn.getAttribute('aria-pressed')) === 'true'
        || (await btn.getAttribute('aria-selected')) === 'true'
    }

    if (!(await isActive(tier))) {
      await tierBtn(tier).click()
      await this.page.waitForTimeout(120)
    }
    for (const k of ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']) {
      if (k === tier) continue
      if (await isActive(k)) {
        await tierBtn(k).click()
        await this.page.waitForTimeout(120)
      }
    }
  }

  /** Close any open config dialog (Cancel, then Escape) so a failure never blocks the next property. */
  private async dismissDialog(): Promise<void> {
    const dialog = this.page.getByRole('dialog')
    if (!(await dialog.count())) return
    await dialog.getByRole('button', { name: /cancel/i }).last().click({ timeout: 3000, force: true }).catch(() => {})
    for (let i = 0; i < 3 && await this.page.getByRole('dialog').count(); i += 1) {
      await this.page.keyboard.press('Escape').catch(() => {})
      await this.page.waitForTimeout(200)
    }
    await this.page.getByRole('dialog').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {})
  }

  /**
   * Set the property to EXACTLY one tier. The TierToggleGroup buttons carry an
   * aria-label ("Toggle tier T3 <name>") that overrides their accessible name, so
   * we must locate by visible text inside ul[aria-label="Tier options"] and read
   * data-active for state. Toggling is multi-select with "can't drop the last
   * active", so we activate the target first, then deactivate every other tier.
   */
  private async setTier(dialog: Locator, tier: string, propertyName?: string): Promise<void> {
    const group = dialog.locator('ul[aria-label="Tier options"]').first()
    const tierBtn = (label: string) => group.getByRole('button').filter({ hasText: new RegExp(`^${label}$`) }).first()
    const isActive = async (label: string) => (await tierBtn(label).getAttribute('data-active')) === 'true'
    if (!(await group.count())) {
      const reserveLabel = dialog.locator(`fieldset[aria-label="Reserve Preference tiers"] label`).filter({ hasText: new RegExp(`^${escapeRegExp(tier)}$`) }).first()
      if (await reserveLabel.count()) {
        const checkbox = reserveLabel.getByRole('checkbox').first()
        if (await checkbox.count() && !(await checkbox.isChecked())) await checkbox.check()
        return
      }
      if (!propertyName) return
      const target = dialog.getByRole('button', { name: new RegExp(`^Toggle ${escapeRegExp(tier)} for ${escapeRegExp(propertyName)}$`) }).first()
      if (await target.count()) await target.click()
      return
    }
    if (!(await isActive(tier))) {
      await tierBtn(tier).click()
      await this.page.waitForTimeout(120)
    }
    for (const k of ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']) {
      if (k === tier) continue
      if (await isActive(k)) {
        await tierBtn(k).click()
        await this.page.waitForTimeout(120)
      }
    }
  }

  /**
   * Delete all existing properties on the current page so the run places bids from
   * a clean state (idempotent re-runs, and corrects any drafts left at the wrong
   * tier by an earlier run). Deletes one row at a time, letting the draft refetch.
   */
  async clearExisting(kind: BidPageKind): Promise<void> {
    if (kind !== 'reserve') {
      let guard = 0
      while (guard < 80) {
        let deleted = false
        for (const tier of ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']) {
          await this.selectSummaryTier(tier)
          const rows = () => this.existingLocator(kind)
          const countBeforeDelete = await rows().count()
          if (countBeforeDelete === 0) continue

          const row = rows().first()
          const delButton = row.getByRole('button', { name: /^Delete / }).first()
          await expect(delButton).toBeVisible({ timeout: 5000 })
          await delButton.click()

          const confirmDelete = this.page.getByRole('button', { name: 'Delete', exact: true }).last()
          await expect(confirmDelete).toBeVisible({ timeout: 5000 })
          const deleteResponsePromise = this.page.waitForResponse((response) =>
            response.url().includes('/current/properties/')
              && response.request().method() === 'DELETE',
            { timeout: 20_000 },
          )
          await confirmDelete.click()
          const deleteResponse = await deleteResponsePromise
          if (!deleteResponse.ok()) {
            throw new Error(`Delete ${kind} property failed with HTTP ${deleteResponse.status()}`)
          }
          await expect.poll(
            () => rows().count(),
            { timeout: 20_000, message: `Expected ${kind} Existing count to decrease after delete` },
          ).toBeLessThan(countBeforeDelete)

          deleted = true
          guard += 1
          break
        }
        if (!deleted) return
      }
      throw new Error(`Refusing to delete more than 80 existing ${kind} bid groups`)
    }
    const del = () => this.page.locator('button[aria-label^="Delete existing property"]')
    let guard = 0
    while ((await del().count()) > 0 && guard < 60) {
      const deleteResponsePromise = this.page.waitForResponse((response) =>
        response.url().includes('/current/properties/')
          && response.request().method() === 'DELETE',
        { timeout: 20_000 },
      )
      await del().first().click()
      const deleteResponse = await deleteResponsePromise
      if (!deleteResponse.ok()) {
        throw new Error(`Delete ${kind} property failed with HTTP ${deleteResponse.status()}`)
      }
      guard += 1
    }
    if (guard >= 60 && (await del().count()) > 0) {
      throw new Error(`Refusing to delete more than 60 existing ${kind} bid groups`)
    }
  }

  private async setAction(dialog: Locator, action: 'award' | 'avoid'): Promise<void> {
    const labels = action === 'avoid' ? ['Avoid', 'Avoid no reserve'] : ['Award', 'Award reserve-only']
    for (const label of labels) {
      const btn = dialog.getByRole('button', { name: label, exact: true })
      if (await btn.count()) {
        await btn.first().click()
        return
      }
    }
  }

  private async setQuantifier(dialog: Locator, quantifier?: 'any' | 'every'): Promise<void> {
    if (!quantifier) return
    const label = quantifier === 'every' ? 'Every' : 'Any'
    const btn = dialog.getByRole('button', { name: label, exact: true })
    if (await btn.count()) await btn.first().click()
  }

  private async selectOperator(dialog: Locator, name: string, op?: string): Promise<void> {
    if (!op) return
    const sel = dialog.getByLabel(`BID ${name} operator`)
    if (!(await sel.count())) return
    const options = await sel.locator('option').evaluateAll((os) =>
      os.map((o) => ({ value: (o as HTMLOptionElement).value, text: (o.textContent || '').trim() })),
    )
    const want = op.toLowerCase()
    const synonyms: Record<string, string[]> = {
      '>': ['>', 'greater', 'more', 'after', 'above'],
      '<': ['<', 'less', 'fewer', 'before', 'below'],
      '=': ['=', 'equal', 'exactly', 'on', 'is'],
      between: ['between'],
      in: ['in'],
    }
    const keys = synonyms[want] ?? [want]
    const match = options.find((o) => keys.some((k) => o.text.toLowerCase().includes(k) || o.value.toLowerCase().includes(k)))
    if (match) await sel.selectOption({ value: match.value }).catch(() => {})
  }

  /** The visible, fillable value input by its exact aria-label (never a hidden/template input). */
  private bidInput(dialog: Locator, ariaLabel: string): Locator {
    if (ariaLabel === 'BID Pairing Number') {
      return dialog
        .locator('input[aria-label="BID Pairing Number"]:visible, input[placeholder="Search Pairing Number"]:visible')
        .first()
    }
    return dialog
      .locator(`input[aria-label="${ariaLabel}"]:visible, textarea[aria-label="${ariaLabel}"]:visible`)
      .first()
  }

  private async fillValueInput(dialog: Locator, name: string, value: string): Promise<boolean> {
    const input = this.bidInput(dialog, `BID ${name}`)
    if (!(await input.count())) return false
    await input.fill(String(value))
    return true
  }

  private async fillTagList(dialog: Locator, name: string, values: string[]): Promise<boolean> {
    if (!(await this.bidInput(dialog, `BID ${name}`).count())) return false
    // Each Enter creates a chip and may re-mount the input, so re-resolve per value.
    // The remote demo DB can leave the dialog briefly unstable — wait + click first,
    // and bound the fill so a stuck field is recorded (not a 15s hang).
    for (const v of values) {
      const input = this.bidInput(dialog, `BID ${name}`)
      await input.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
      await input.click({ timeout: 8000 }).catch(() => {})
      await input.fill(v, { timeout: 8000 })
      await input.press('Enter')
      await this.page.waitForTimeout(250)
    }
    return true
  }

  /**
   * Pairing Number (102) is an autocomplete with allowCustomTokens=false: a typed
   * token is NOT accepted — only a value picked from the dropdown commits. The NPBS
   * pairing label (e.g. "V4105") does map to our pairing (interface_id / pairing_label),
   * but the dropdown is scoped to the crew's base AND the bid period, so we must type
   * the label, wait for the period/base-scoped options, and click the match. The
   * options render as <button> rows carrying the label + a "(date)" line. If no option
   * appears (the pairing genuinely isn't in this base+period), return false so the
   * caller records it honestly — we never force an unmatched id.
   */
  private async fillPairingAutocomplete(dialog: Locator, name: string, values: string[]): Promise<boolean> {
    const firstInput = this.bidInput(dialog, `BID ${name}`)
    await firstInput.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
    if (!(await firstInput.count())) return false
    let any = false
    for (const v of values) {
      const query = v.trim()
      if (!query) continue
      const input = this.bidInput(dialog, `BID ${name}`)
      await input.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
      await input.click({ timeout: 8000 }).catch(() => {})
      await input.fill(query, { timeout: 8000 }) // dispatches input → debounced (300ms) period+base-scoped search
      // Option rows are <button type=button> containing the pairing label and a "(date)" line.
      const option = dialog
        .locator('button[type="button"]')
        .filter({ hasText: query })
        .filter({ hasText: '(' })
        .first()
      try {
        await option.waitFor({ state: 'visible', timeout: 8000 })
      } catch {
        continue // no match in this base+period — caller records the blocker
      }
      await option.click()
      await this.page.waitForTimeout(250)
      any = true
    }
    // If the input exists but none of the typed labels produced a selectable
    // option, let ADD BID's disabled state classify this as a current-period
    // value gap instead of "unsupported input".
    return any || values.some((value) => value.trim().length > 0)
  }

  private async selectPairingAutocompleteOption(
    dialog: Locator,
    name: string,
    pairingNumber: string,
    originDate?: string,
  ): Promise<void> {
    const query = pairingNumber.trim()
    if (!query) throw new Error(`empty pairing number for ${name}`)

    const input = this.bidInput(dialog, `BID ${name}`)
    await input.waitFor({ state: 'visible', timeout: 8000 })
    await input.click({ timeout: 8000 })
    await input.fill(query, { timeout: 8000 })

    let option = dialog
      .locator('button[type="button"]')
      .filter({ hasText: query })
      .filter({ hasText: '(' })

    if (originDate) option = option.filter({ hasText: originDate })
    const target = option.first()
    await target.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {
      throw new Error(`pairing option not found: ${query}${originDate ? ` on ${originDate}` : ''}`)
    })
    await target.click()
    await this.page.waitForTimeout(250)
  }

  /**
   * Drive Pairing Number "Specific Date" mode through the real dialog:
   * autocomplete pairing number -> Specific Date -> click each requested run date
   * -> leave CONFIRMED RUNS populated before ADD BID / UPDATE BID.
   */
  private async fillPairingOccurrenceList(dialog: Locator, name: string, bid: FixtureBid): Promise<boolean> {
    const pairingNumbers = bid.values ?? []
    const originDates = bid.originDates ?? []
    if (pairingNumbers.length === 0 || originDates.length === 0) return false

    const selectedRuns: Array<{ pairingNumber: string; originDate: string }> = []
    for (let index = 0; index < originDates.length; index += 1) {
      const originDate = toIso(originDates[index])
      const pairingNumber = pairingNumbers.length === originDates.length
        ? pairingNumbers[index]
        : pairingNumbers[0]
      if (!originDate || !pairingNumber) return false
      await this.selectPairingAutocompleteOption(dialog, name, pairingNumber, originDate)
      selectedRuns.push({ pairingNumber, originDate })
    }

    const specificDate = dialog.getByRole('button', { name: 'Specific Date', exact: true }).first()
    await specificDate.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
    if (!(await specificDate.count())) return false
    await specificDate.click()

    await dialog.getByText('RUN DATE', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})

    for (let index = 0; index < selectedRuns.length; index += 1) {
      const { pairingNumber, originDate } = selectedRuns[index]
      if (selectedRuns.length > 1) {
        const sameLabelIndex = selectedRuns
          .slice(0, index + 1)
          .filter((item) => item.pairingNumber === pairingNumber)
          .length - 1
        const pairingButton = dialog.getByRole('button', { name: pairingNumber, exact: true }).nth(sameLabelIndex)
        await pairingButton.waitFor({ state: 'visible', timeout: 10_000 })
        await pairingButton.click()
      }

      const runDateButton = dialog
        .locator('button[type="button"]')
        .filter({ hasText: originDate })
        .first()
      await runDateButton.waitFor({ state: 'visible', timeout: 15_000 }).catch(async () => {
        const noRuns = await dialog.getByText('No pairing runs found in this bid period.').isVisible().catch(() => false)
        throw new Error(noRuns
          ? `no pairing runs found for ${pairingNumber} in current bid period`
          : `run date not found: ${pairingNumber} on ${originDate}`)
      })
      await runDateButton.click()
      await this.page.waitForTimeout(150)
      await expect(dialog.getByText('CONFIRMED RUNS', { exact: true })).toBeVisible({ timeout: 5000 })
      await expect(dialog.getByText(originDate).last()).toBeVisible({ timeout: 5000 })
    }

    return true
  }

  /** Whether the property's value control is the airport multi-select dropdown (codes 101/104). */
  private airportSelectTrigger(dialog: Locator, name: string): Locator {
    return dialog.locator(`[role="combobox"][aria-haspopup="listbox"][aria-label="BID ${name}"]`).first()
  }

  private async isAirportSelect(dialog: Locator, name: string): Promise<boolean> {
    return (await this.airportSelectTrigger(dialog, name).count()) > 0
  }

  private async waitForAirportSelect(dialog: Locator, name: string): Promise<boolean> {
    const trigger = this.airportSelectTrigger(dialog, name)
    await trigger.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
    return (await trigger.count()) > 0
  }

  /**
   * Drive the airport multi-select (pairing-bid-airport-select.tsx): open the
   * listbox, filter to each code, and click its option. Codes not in the airline's
   * landing/layover option set simply can't be selected (recorded honestly).
   */
  private async fillAirportSelect(dialog: Locator, name: string, values: string[]): Promise<boolean> {
    const trigger = this.airportSelectTrigger(dialog, name)
    let any = false
    for (const code of values) {
      const up = code.toUpperCase()
      const filter = dialog.getByLabel('Filter airports')
      if (!(await filter.isVisible().catch(() => false))) {
        await trigger.click()
        await filter.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
      }
      await filter.fill(up).catch(() => {})
      await this.page.waitForTimeout(200)
      const option = dialog.getByRole('option', { name: up, exact: true }).first()
      if (await option.count()) {
        await option.click()
        any = true
      }
    }
    // Close the dropdown (toggle the trigger) before continuing to tier / ADD BID.
    await trigger.click().catch(() => {})
    await this.page.waitForTimeout(200)
    return any
  }

  private async fillCurrentAirportPreference(dialog: Locator, bid: FixtureBid): Promise<boolean> {
    const eventLabel = bid.event === 'layover'
      ? 'Layover'
      : bid.event === 'both'
        ? 'Both'
        : 'Landing'
    const eventButton = dialog.getByRole('button', { name: eventLabel, exact: true }).first()
    if (await eventButton.count()) await eventButton.click()

    const trigger = dialog.getByRole('combobox', { name: /Airport Preference airports or cities/i }).first()
    await trigger.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
    if (!(await trigger.count())) return false
    const values = bid.locations ?? bid.values ?? []
    let selected = 0
    for (const code of values) {
      const up = code.toUpperCase()
      const filter = this.page.getByLabel('Filter airports or cities').first()
      if (!(await filter.isVisible().catch(() => false))) {
        await trigger.click()
        await filter.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
      }
      await filter.fill(up).catch(() => {})
      await this.page.waitForTimeout(200)
      const option = this.page.getByRole('option', { name: new RegExp(`^${escapeRegExp(up)}\\b`, 'i') }).first()
      await option.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
      if (await option.count()) {
        await option.click()
        selected += 1
      }
    }
    await trigger.click().catch(() => {})
    return values.length > 0 && selected === values.length
  }

  private async fillCurrentPairingPreference(dialog: Locator, values: string[]): Promise<boolean> {
    const input = dialog.getByLabel('Search pairings').first()
    await input.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
    if (!(await input.count())) return false
    let matchedValues = 0
    for (const value of values) {
      const query = value.trim()
      if (!query) continue
      await input.fill('')
      await input.fill(query, { timeout: 8000 })
      const exactCheckboxes = dialog.getByLabel(new RegExp(`^Select pairing ${escapeRegExp(query)}$`, 'i'))
      await exactCheckboxes.first().waitFor({ state: 'visible', timeout: PAIRING_OPTION_TIMEOUT_MS }).catch(() => {})

      let selectedForValue = 0
      while (true) {
        const checkboxCount = await exactCheckboxes.count()
        for (let index = 0; index < checkboxCount; index += 1) {
          const checkbox = exactCheckboxes.nth(index)
          if (!(await checkbox.isChecked().catch(() => false))) {
            await checkbox.check().catch(async () => checkbox.click())
          }
          selectedForValue += 1
        }

        const nextPage = dialog.getByRole('button', { name: 'Next pairing page', exact: true }).first()
        if (!(await nextPage.count()) || await nextPage.isDisabled()) break

        const pageLabel = dialog.getByText(/^Page \d+ of \d+$/).first()
        const currentPageLabel = await pageLabel.textContent()
        await nextPage.click()
        if (currentPageLabel) {
          await expect(pageLabel).not.toHaveText(currentPageLabel, { timeout: PAIRING_OPTION_TIMEOUT_MS })
        }
      }

      if (selectedForValue > 0) matchedValues += 1
    }
    return values.length > 0 && matchedValues === values.length
  }

  private async fillByLabel(dialog: Locator, label: string, value: string | number | null | undefined): Promise<boolean> {
    if (value === null || value === undefined || value === '') return false
    const control = dialog.getByLabel(label, { exact: true }).first()
    await control.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
    if (!(await control.count())) return false
    await control.fill(String(value))
    return true
  }

  private async fillTagInputByLabel(dialog: Locator, label: string, values: string[]): Promise<boolean> {
    const firstInput = dialog.getByLabel(label, { exact: true }).first()
    await firstInput.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
    if (!(await firstInput.count())) return false
    let any = false
    for (const value of values) {
      const input = dialog.getByLabel(label, { exact: true }).first()
      await input.fill(value, { timeout: 8000 })
      await input.press('Enter')
      await this.page.waitForTimeout(200)
      any = true
    }
    return any
  }

  private async fillAutocompleteTags(dialog: Locator, label: string, values: string[]): Promise<boolean> {
    const input = dialog.getByLabel(label, { exact: true }).first()
    await input.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
    if (!(await input.count())) return false

    let selected = 0
    for (const value of values) {
      const normalized = value.trim().toUpperCase()
      if (!normalized) continue
      await input.fill(normalized, { timeout: 8000 })
      const menu = this.page.getByTestId('pairing-tag-list-autocomplete')
      await menu.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
      const option = menu.getByRole('button').filter({ hasText: new RegExp(`^${escapeRegExp(normalized)}\\b`, 'i') }).first()
      await option.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
      if (!(await option.count())) continue
      await option.click()
      selected += 1
    }

    return values.length > 0 && selected === values.length
  }

  private async selectCurrentOperator(dialog: Locator, label: string, op?: string): Promise<boolean> {
    if (!op) return true
    const sel = dialog.getByRole('combobox', { name: label, exact: true }).first()
    await sel.waitFor({ state: 'visible', timeout: 4000 }).catch(() => {})
    if (!(await sel.count())) return false
    const options = await sel.locator('option').evaluateAll((os) =>
      os.map((o) => ({ value: (o as HTMLOptionElement).value, text: (o.textContent || '').trim() })),
    )
    const want = op.toLowerCase()
    const synonyms: Record<string, string[]> = {
      '>': ['>', 'more', 'greater'],
      '<': ['<', 'less', 'fewer'],
      '=': ['=', 'equal', 'exactly'],
      between: ['between'],
    }
    const keys = synonyms[want] ?? [want]
    const match = options.find((option) => keys.some((key) =>
      option.value.toLowerCase().includes(key) || option.text.toLowerCase().includes(key)))
    if (!match) return false
    await sel.selectOption({ value: match.value }).catch(() => {})
    return true
  }

  private async selectDateRange(dialog: Locator, openLabel: RegExp, from?: string, to?: string): Promise<boolean> {
    const fromIso = from ? toIso(from) : null
    const toIsoValue = to ? toIso(to) : null
    if (!fromIso || !toIsoValue) return false
    const open = dialog.getByRole('button', { name: openLabel }).first()
    await open.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
    if (!(await open.count())) return false
    await open.click()
    await this.page.getByRole('gridcell', { name: `Select ${fromIso}` }).click({ timeout: 8000 })
    await this.page.getByRole('gridcell', { name: `Select ${toIsoValue}` }).click({ timeout: 8000 })
    await this.page.waitForTimeout(200)
    return true
  }

  private async fillDateOrDow(dialog: Locator, name: string, values: string[]): Promise<boolean> {
    const dateInput = this.bidInput(dialog, `BID ${name} date`)
    let any = false
    for (const v of values) {
      const dow = asDow(v)
      if (dow) {
        const btn = dialog.getByRole('button', { name: dow, exact: true })
        if (await btn.count()) { await btn.first().click(); any = true }
        continue
      }
      const iso = toIso(v)
      if (iso && (await dateInput.count())) {
        await dateInput.fill(iso)
        const addDate = dialog.getByRole('button', { name: /add date/i }).first()
        if (await addDate.count()) await addDate.click()
        any = true
      }
    }
    return any
  }

  /** Days-off "Prefer Off" uses UI aliases: Dates, Days of Week, and Date Range. */
  private async fillPreferOff(dialog: Locator, bid: FixtureBid): Promise<boolean> {
    if (bid.mode === 'weekends') {
      let any = false
      for (const label of ['Saturday', 'Sunday']) {
        const checkbox = dialog.getByRole('checkbox', { name: new RegExp(`^Prefer Off ${label}$`, 'i') })
        if (await checkbox.count()) { await checkbox.first().check(); any = true; continue }
        const btn = dialog.getByRole('button', { name: new RegExp(`^${label}$`, 'i') })
        if (await btn.count()) { await btn.first().click(); any = true }
      }
      return any
    }
    if (bid.mode === 'days_of_week') {
      let any = false
      for (const v of bid.values ?? []) {
        const dow = asDow(v)
        const label = v.trim()
        if (!dow && !label) continue
        const checkbox = dialog.getByRole('checkbox', { name: new RegExp(`^Prefer Off (${dow ?? label}|${label})$`, 'i') })
        if (await checkbox.count()) { await checkbox.first().check(); any = true; continue }
        const btn = dialog.getByRole('button', { name: new RegExp(`^(${dow ?? label}|${label})$`, 'i') })
        if (await btn.count()) { await btn.first().click(); any = true }
      }
      return any
    }
    if (bid.mode === 'date_range') {
      const mode = dialog.getByRole('button', { name: 'Date Range', exact: true }).first()
      if (await mode.count()) await mode.click()
      return this.selectDateRange(dialog, /Open Prefer Off calendar/, bid.from, bid.to)
    }

    const values = bid.values ?? []
    const mode = dialog.getByRole('button', { name: 'Specific Dates', exact: true }).first()
    if (await mode.count()) await mode.click()
    const open = dialog.getByRole('button', { name: 'Open Prefer Off calendar' }).first()
    await open.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
    if (!(await open.count()) || values.length === 0) return false
    await open.click()
    const calendar = this.page.getByRole('grid', { name: 'Prefer Off calendar' })
    await calendar.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
    let selected = 0
    for (const v of values) {
      const iso = toIso(v)
      if (!iso) continue
      const cell = calendar.getByRole('gridcell', { name: `Select ${iso}` }).first()
      if (!(await cell.count())) continue
      await cell.click()
      selected += 1
    }
    await dialog.getByText('PREFER OFF TYPE').click().catch(() => {})
    return selected === values.length
  }

  private async fillEmployeeSchedulePreference(dialog: Locator, property: FixtureProperty): Promise<boolean> {
    const { bid, name } = property
    const crewId = bid.crewId?.trim() || bid.employeeNumber?.trim()
    const crewSearch = bid.crewName?.trim() || crewId
    if (!crewSearch || !crewId) return false

    const crewInput = dialog
      .locator(`input[aria-label="Configure bid for ${name} crew"]:visible`)
      .first()
    const daysInput = dialog
      .locator(`input[aria-label="Configure bid for ${name} days"]:visible`)
      .first()
    await crewInput.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
    if (!(await crewInput.count())) return false
    await crewInput.fill(crewSearch)
    const crewOption = dialog.getByRole("option", { name: new RegExp(escapeRegExp(crewId), "i") }).first()
    await crewOption.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
    if (!(await crewOption.count())) return false
    await crewOption.click()

    const relationshipLabel = bid.relationship === 'apart' ? 'Apart' : 'Together'
    const scheduleTypeLabel = bid.scheduleType === 'work' ? 'Work' : 'Days Off'
    await dialog.getByRole('button', { name: relationshipLabel, exact: true }).first().click()
    await dialog.getByRole('button', { name: scheduleTypeLabel, exact: true }).first().click()
    const thresholdSelect = dialog.locator(`select[aria-label="Configure bid for ${name} threshold operator"]`).first()
    await thresholdSelect.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
    if (!(await thresholdSelect.count())) return false
    await thresholdSelect.selectOption(bid.thresholdType === 'maximum' ? 'maximum' : 'minimum')

    await daysInput.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
    if (!(await daysInput.count())) return false
    await daysInput.fill(String(bid.days ?? 1))
    return true
  }

  /** Fill the dialog's value controls based on the bid type. Returns false if no control matched. */
  private async fillBid(dialog: Locator, property: FixtureProperty): Promise<boolean> {
    const { name, bid } = property
    switch (bid.type) {
      case 'flag':
        return true
      case 'airport-preference':
        return this.fillCurrentAirportPreference(dialog, bid)
      case 'pairing-preference':
        return this.fillCurrentPairingPreference(dialog, bid.values ?? [])
      case 'pairing-check-time': {
        const timeTypeLabel = bid.timeType === 'check_out' ? 'Check-Out' : 'Check-In'
        const timeType = dialog.getByRole('button', { name: timeTypeLabel, exact: true }).first()
        await timeType.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
        if (!(await timeType.count())) return false
        await timeType.click()

        const operatorSet = await this.selectCurrentOperator(dialog, `${name} operator`, bid.operator)
        if (!operatorSet) return false
        if (bid.operator === 'Between') {
          return (await this.fillByLabel(dialog, `${name} from`, bid.from))
            && (await this.fillByLabel(dialog, `${name} to`, bid.to))
        }
        return this.fillByLabel(dialog, name, bid.value)
      }
      case 'pairing-length-preference': {
        const minFilled = bid.minDays !== null && bid.minDays !== undefined
          ? await this.fillByLabel(dialog, 'Pairing Length minimum days', bid.minDays)
          : true
        const maxFilled = bid.maxDays !== null && bid.maxDays !== undefined
          ? await this.fillByLabel(dialog, 'Pairing Length maximum days', bid.maxDays)
          : true
        return minFilled && maxFilled
      }
      case 'flight-legs-per-duty': {
        const operatorSet = await this.selectCurrentOperator(dialog, 'Flight Legs per Duty operator', bid.operator)
        if (!operatorSet) return false
        if (bid.operator === 'Between') {
          const fromFilled = await this.fillByLabel(dialog, 'Flight Legs per Duty from legs', bid.from ?? bid.value)
          const toFilled = await this.fillByLabel(dialog, 'Flight Legs per Duty to legs', bid.to ?? bid.value)
          return fromFilled && toFilled
        }
        return this.fillByLabel(dialog, 'Flight Legs per Duty legs per duty', bid.value)
      }
      case 'flight-number-preference':
        return this.fillAutocompleteTags(dialog, 'Flight Number Preference flight numbers', bid.values ?? [])
      case 'redeye-preference':
        return true
      case 'deadhead-flying':
        return true
      case 'month-end-carryover': {
        const operatorSet = await this.selectCurrentOperator(dialog, 'Month-End Carryover operator', bid.operator)
        if (!operatorSet) return false
        return this.fillByLabel(dialog, 'Month-End Carryover carry-out days', bid.value)
      }
      case 'minimum-base-layover':
        return this.fillByLabel(dialog, 'Configure bid for Minimum Base Layover minimum base layover', bid.minimumDuration ?? bid.value)
      case 'credit-window-preference':
        if (bid.direction) {
          const directionLabel = bid.direction === 'less' ? 'Less credit' : 'More credit'
          const directionButton = dialog.getByRole('button', { name: directionLabel, exact: true }).first()
          if (await directionButton.count()) await directionButton.click()
        }
        return true
      case 'days-off-on-pattern':
        return (await this.fillByLabel(dialog, 'Configure bid for Commuter Pattern min days on', bid.daysOnMin))
          && (await this.fillByLabel(dialog, 'Configure bid for Commuter Pattern max days on', bid.daysOnMax))
          && (await this.fillByLabel(dialog, 'Configure bid for Commuter Pattern minimum days off', bid.daysOff))
      case 'stepper-date-range': {
        const valueFilled = await this.fillByLabel(dialog, `Configure bid for ${name} minimum consecutive days off`, bid.value)
        const rangeSwitch = dialog.getByRole('switch', { name: new RegExp(`Configure bid for ${escapeRegExp(name)} limit to a date range`) }).first()
        if (await rangeSwitch.count()) {
          const checked = await rangeSwitch.getAttribute('aria-checked')
          if (checked !== 'true') await rangeSwitch.click()
        }
        const rangeFilled = await this.selectDateRange(dialog, new RegExp(`Open Configure bid for ${escapeRegExp(name)} date range calendar`), bid.from, bid.to)
        return valueFilled && rangeFilled
      }
      case 'reserve-call-type-date-scope': {
        const callType = dialog.getByRole('combobox', { name: 'Reserve Preference short-call type' }).first()
        await callType.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
        if (!(await callType.count())) return false
        await callType.selectOption(bid.callType ?? 'CRPM').catch(() => {})
        return true
      }
      case 'tag-list':
        // Airport properties (101/104) now use a listbox dropdown; others are free text.
        if ([101, 104].includes(property.propertyCode) && await this.waitForAirportSelect(dialog, name)) {
          return this.fillAirportSelect(dialog, name, bid.values ?? [])
        }
        if (await this.isAirportSelect(dialog, name)) return this.fillAirportSelect(dialog, name, bid.values ?? [])
        return this.fillTagList(dialog, name, bid.values ?? [])
      case 'pairing-id-list':
        return this.fillPairingAutocomplete(dialog, name, bid.values ?? [])
      case 'pairing-occurrence-list':
        return this.fillPairingOccurrenceList(dialog, name, bid)
      case 'duration':
      case 'time':
      case 'text':
      case 'stepper':
        await this.selectOperator(dialog, name, bid.operator)
        return this.fillValueInput(dialog, name, String(bid.value ?? ''))
      case 'time-range': {
        await this.selectOperator(dialog, name, 'between')
        const inputs = dialog.locator('input[type="time"]')
        if ((await inputs.count()) >= 2 && bid.from && bid.to) {
          await inputs.nth(0).fill(bid.from)
          await inputs.nth(1).fill(bid.to)
          return true
        }
        return false
      }
      case 'date-or-dow-list':
        return this.fillDateOrDow(dialog, name, bid.values ?? [])
      case 'prefer-off':
        return this.fillPreferOff(dialog, bid)
      case 'employee-schedule-preference':
        return this.fillEmployeeSchedulePreference(dialog, property)
      default:
        return false
    }
  }

  /**
   * Place one property through the full UI. Returns { placed } honestly:
   * placed:false with a reason for any control/property the UI does not support,
   * so the caller records it as a blocker instead of failing the whole crew.
   */
  async placeProperty(property: FixtureProperty): Promise<PlaceResult> {
    // Snapshot the failed step, then dismiss any dialog, then return the result.
    const fail = async (reason: string, tag: string): Promise<PlaceResult> => {
      const image = await this.snapshotFailure(tag, property)
      await this.dismissDialog()
      return { placed: false, reason, image }
    }
    try {
      const opened = await this.openPropertyDialog(property)
      if (opened === 'not-found') return await fail(`property-not-found-in-workspace: ${property.name}`, 'not-found')
      if (opened === 'direct-added') return { placed: true }

      const dialog = this.page.getByRole('dialog')
      await this.setAction(dialog, property.action)
      await this.setQuantifier(dialog, property.quantifier)
      await this.page.waitForTimeout(300) // let the dialog settle after toggling action
      const filled = await this.fillBid(dialog, property)
      if (!filled && property.bid.type !== 'flag') {
        return await fail(`unsupported-input: ${property.bid.type} for ${property.name}`, 'unsupported-input')
      }
      await this.setTier(dialog, property.tier, property.name)

      const addBidCandidates = dialog.getByRole('button', { name: 'ADD BID', exact: true })
      const addBid = addBidCandidates.last()
      if (!(await addBid.count())) return await fail(`no-add-bid-button: ${property.name}`, 'no-add-bid')
      await expect.poll(
        () => addBid.isEnabled().catch(() => false),
        { timeout: 3000, message: `Wait for ${property.name} validation state` },
      ).toBe(true).catch(() => {})
      // A disabled ADD BID means the value was not accepted (e.g. autocomplete-only
      // fields like Pairing Number need a real match). Detect fast, don't hang.
      if (!(await addBid.isEnabled())) {
        const disabled = await addBid.getAttribute('disabled')
        const ariaDisabled = await addBid.getAttribute('aria-disabled')
        return await fail(
          `add-bid-disabled (value not accepted): ${property.name}; candidates=${await addBidCandidates.count()}; disabled=${disabled}; aria-disabled=${ariaDisabled}`,
          'add-bid-disabled',
        )
      }
      const saveResponsePromise = this.page.waitForResponse((response) =>
        response.url().includes('/api/')
          && response.url().includes('-bids/current')
          && response.url().includes('/properties')
          && response.request().method() === 'POST',
      { timeout: 60_000 }).catch(() => null)
      await addBid.click({ timeout: 8000 })
      const saveResponse = await saveResponsePromise
      const saveResponseDetail = saveResponse
        ? `${saveResponse.status()} ${await saveResponse.text().catch(() => '')}`.replace(/\s+/g, ' ').slice(0, 240)
        : 'no save response observed'
      // dialog should close on success. Specific-date Pairing Number bids can
      // write many selected runs in one request, so allow the real save to finish.
      await this.page.getByRole('dialog').waitFor({ state: 'detached', timeout: 60_000 }).catch(() => {})
      if (await this.page.getByRole('dialog').count()) {
        // Dialog still open => validation error. The common cause on re-runs is a
        // duplicate of a property the crew already has from a prior run. If the
        // property is already present, treat it as idempotently placed; otherwise
        // record the rejection (with a snapshot).
        const msg = await this.page.getByRole('dialog').innerText().catch(() => '')
        if (await this.isAlreadyPresent(property)) {
          await this.dismissDialog()
          return { placed: true }
        }
        return await fail(
          `add-bid-rejected (${saveResponseDetail}): ${msg.replace(/\s+/g, ' ').slice(0, 120)}`,
          'rejected',
        )
      }
      return { placed: true }
    } catch (error) {
      return await fail(`exception: ${String(error).slice(0, 160)}`, 'exception')
    }
  }

  /** Whether a property with this name is already in the EXISTING list (idempotent re-runs). */
  private async isAlreadyPresent(property: FixtureProperty): Promise<boolean> {
    return (await this.existingRowForTargetTier(property).count()) > 0
  }

  private existingCandidateTexts(property: FixtureProperty): string[] {
    const bid = property.bid
    const values = bid.values ?? bid.locations ?? []
    const primaryValue = values.find((value) => value.trim().length > 0)
    const isoValue = primaryValue ? toIso(primaryValue) : null
    const pairingCheckTimeValues = bid.type === 'pairing-check-time'
      ? [bid.from, bid.to, bid.value]
      : []
    const candidates = [
      ...pairingCheckTimeValues,
      primaryValue,
      isoValue,
      typeof bid.value === 'number' || typeof bid.value === 'string' ? String(bid.value) : undefined,
      bid.minDays !== null && bid.minDays !== undefined ? String(bid.minDays) : undefined,
      bid.maxDays !== null && bid.maxDays !== undefined ? String(bid.maxDays) : undefined,
      bid.daysOnMin !== undefined ? String(bid.daysOnMin) : undefined,
      bid.daysOnMax !== undefined ? String(bid.daysOnMax) : undefined,
      bid.daysOff !== undefined ? String(bid.daysOff) : undefined,
      bid.minimumDuration,
      bid.type === 'credit-window-preference' && bid.direction === 'more' ? 'more credit' : undefined,
      bid.type === 'credit-window-preference' && bid.direction === 'less' ? 'less credit' : undefined,
      property.name,
    ].filter((value): value is string => Boolean(value && value.trim().length > 0))

    return [...new Set(candidates)]
  }

  private existingRowsFor(property: FixtureProperty): Locator {
    const rows = this.existingLocator(property.page)
    const [candidate = property.name] = this.existingCandidateTexts(property)
    return rows.filter({ hasText: candidate })
  }

  private existingRowForTargetTier(property: FixtureProperty): Locator {
    const rows = this.existingRowsFor(property)
    if (property.page !== 'reserve') {
      return rows
        .filter({ hasText: property.tier })
        .first()
    }

    const activeTargetTier = this.page
      .locator('ul[aria-label="Tier options"] button[data-active="true"]')
      .filter({ hasText: new RegExp(`^${property.tier}$`) })

    return rows.filter({ has: activeTargetTier }).first()
  }

  private async selectSummaryTier(tier: string): Promise<void> {
    if (!/^T[1-7]$/.test(tier)) return
    const label = `TIER-${tier.slice(1).padStart(2, '0')}`
    const button = this.page.getByRole('button', { name: label, exact: true }).first()
    if (!(await button.count())) return
    await button.click()
    await expect(this.page.getByTestId('bid-existing-tier-filter-label')).toContainText(`${tier} only`, { timeout: 10_000 })
  }

  /**
   * Assert a placed property is in the EXISTING list AT ITS TARGET TIER — not just
   * present by name. This is what catches a wrong-tier regression (e.g. everything
   * defaulting to T1): we require an existing row for the name whose target-tier
   * toggle is data-active="true".
   */
  async assertExisting(property: FixtureProperty): Promise<void> {
    if (property.page !== 'reserve') await this.selectSummaryTier(property.tier)
    await expect(this.existingRowsFor(property).first()).toBeVisible({ timeout: 20_000 })
    await expect(this.existingRowForTargetTier(property)).toBeVisible({ timeout: 10_000 })
  }

  /** Assert the read-only existing bid summary contains the expected value text. */
  async assertExistingBidContains(property: FixtureProperty, expectedTexts: string[]): Promise<void> {
    const row = this.existingRowForTargetTier(property)
    await expect(row).toBeVisible({ timeout: 20_000 })
    const bid = row.getByLabel(`Bid for existing ${property.name}`)
    await expect(bid).toBeVisible({ timeout: 10_000 })
    const actual = (await row.innerText({ timeout: 10_000 })).replace(/\s+/g, ' ').trim()
    const missing = expectedTexts.filter((text) => !actual.includes(text))
    if (missing.length > 0) {
      throw new Error(`${property.name} existing bid is missing expected value(s): ${missing.join(', ')}; actual text: ${actual.slice(0, 240)}`)
    }
  }

  /** Count of existing properties currently shown. */
  async existingCount(kind: BidPageKind): Promise<number> {
    return this.existingLocator(kind).count()
  }

  /** Count existing rows for one bid kind across every hidden T1-T7 summary view. */
  async existingCountAcrossTiers(kind: BidPageKind): Promise<number> {
    if (kind === 'reserve') return this.existingCount(kind)
    let total = 0
    for (const tier of ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']) {
      await this.selectSummaryTier(tier)
      total += await this.existingCount(kind)
    }
    return total
  }
}
