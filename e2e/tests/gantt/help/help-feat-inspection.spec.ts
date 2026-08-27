import { test, expect, type Page } from '@playwright/test'
import { openHelp } from './help-login'

const BASE = process.env.GANTT_BASE_URL ?? 'http://localhost:5173'

/**
 * Regression coverage for the 2026-06-22 "feature vs Help" inspection: new topics
 * (Quality Analyzer, Crew Memo), the legality Recheck supplement, the scenario-create
 * "Model" field removal, and the brand-new "NEW" badge in the left nav.
 *
 * Also covers the 2026-06-24 follow-up inspection: new RES Pairing topic,
 * Alert Center search documented in legality-overview, scenario-browse sort/status dot.
 *
 * Each test asserts SPECIFIC corrected content so a revert fails here.
 */
test.describe('Help — feature-vs-Help inspection (2026-06-22)', () => {
  test.beforeEach(async ({ page }) => {
    await openHelp(page, BASE)
  })

  // Filtering the topic list force-expands matching categories (see help-nav), so a
  // search term that matches the title makes its unique topic testid clickable.
  const openBySlug = async (page: Page, searchTerm: string, slug: string) => {
    await page.getByPlaceholder('Search topics…').fill(searchTerm)
    await page.locator(`[data-testid="help-topic-${slug}"]`).click()
    await expect(page.getByRole('article')).toBeVisible({ timeout: 5_000 })
  }

  test('Scen-2090 — Quality Analyzer topic documents the three checks and Issues-only filter', async ({ page }) => {
    await openBySlug(page, 'quality', 'scenario-quality')
    const article = page.getByRole('article')
    await expect(article).toContainText('Quality Analyzer')
    await expect(article).toContainText('Scenario-only')
    await expect(article).toContainText('Standalone RES')
    await expect(article).toContainText('Working >6d')
    await expect(article).toContainText('Day-off only')
    await expect(article).toContainText('Qlty-1004 Max working days')
    await expect(article).toContainText('Issues only')
    await expect(article).toContainText('Parameter Configuration')
    await expect(article).toContainText('Save & Re-analyze')
    await expect(article).toContainText('Before opt')
    await expect(article).toContainText('After opt')
    await expect(article).not.toContainText('Lead-in CRD')
    await expect(article).toContainText('After opt is newly added CR credit from pairings and credited reserve duties')
  })

  test('Live-1290 — Crew Memo topic documents the right-click flow and lazy memo icons', async ({ page }) => {
    await openBySlug(page, 'memo', 'live-crew-memo')
    const article = page.getByRole('article')
    await expect(article).toContainText('Add Memo')
    await expect(article).toContainText('Edit Memo')
    await expect(article).toContainText('sticky-note icon')
    await expect(article).toContainText('does not block the first canvas paint')
  })

  test('Scen-2091 — scenario create topic no longer mentions the removed Model field', async ({ page }) => {
    await openBySlug(page, 'Creating', 'scenario-create')
    const article = page.getByRole('article')
    await expect(article).not.toContainText('shows Model,')
    await expect(article).toContainText('Rule Set')
    await expect(article).toContainText('Pairing Sc.')
  })

  test('Legal-6050 — legality overview documents the Recheck / last-checked / outdated behaviour', async ({ page }) => {
    await openBySlug(page, 'Overview', 'legality-overview')
    const article = page.getByRole('article')
    await expect(article).toContainText('Re-checking legality')
    await expect(article).toContainText('Last checked')
    await expect(article).toContainText('may be outdated')
    // The "documented later" deferral is gone now that param-editing is covered.
    await expect(article).not.toContainText('documented later')
    await expect(article).toContainText('Editing rule parameters')
  })

  test('Legal-6051 — rule-parameter management topic documents the admin editor', async ({ page }) => {
    await openBySlug(page, 'Editing rule parameters', 'legality-edit-params')
    const article = page.getByRole('article')
    await expect(article).toContainText('admin-only')
    await expect(article).toContainText('Save All')
    await expect(article).toContainText('Undo')
    await expect(article).toContainText('Add Row')
    await expect(article).toContainText('legality recheck')
    // The 1-based Row column and the Row N recheck-message prefix (2026-08-14).
    await expect(article).toContainText('1-based')
    await expect(article).toContainText('Row 2:')
  })

  test('Live-1293 — pairing pane Base column and roster sort fields are documented', async ({ page }) => {
    await openBySlug(page, 'panes', 'live-panes')
    const article = page.getByRole('article')
    await expect(article).toContainText('Base')
    await expect(article).toContainText('clock badge')
    await expect(article).toContainText('uncovered pairings currently in scope')
    // Roster sort columns were renamed from MCred/MDO to RpCred/RpDO (roster-period basis).
    await expect(article).toContainText('RpCred')
    await expect(article).toContainText('RpDO')
  })

  test('Live-1294 — no NEW badges remain on established topics', async ({ page }) => {
    // The NEW flag was removed in the Rel 4 housekeeping pass; these topics have
    // shipped long enough that none should carry a NEW badge.
    await expect(page.getByTestId('help-new-badge-live-crew-memo')).toHaveCount(0)
    await expect(page.getByTestId('help-new-badge-scenario-quality')).toHaveCount(0)
    await expect(page.getByTestId('help-new-badge-legality-edit-params')).toHaveCount(0)
    await expect(page.getByTestId('help-new-badge-live-overview')).toHaveCount(0)
  })

  // ── 2026-06-24 follow-up inspection ──────────────────────────────────────

  test('Live-1295 — RES Pairing topic documents the two tabs, call codes, and conflict policy', async ({ page }) => {
    await openBySlug(page, 'reserve pairing', 'live-res-pairing')
    const article = page.getByRole('article')
    await expect(article).toContainText('RES Pairing Planner')
    await expect(article).toContainText('PRAM')
    await expect(article).toContainText('PRPM')
    await expect(article).toContainText('CRAM')
    await expect(article).toContainText('CRPM')
    await expect(article).toContainText('Define')
    await expect(article).toContainText('Manage existing')
    await expect(article).toContainText('Conflict policy')
    await expect(article).toContainText('Skip')
    await expect(article).toContainText('Overwrite')
    await expect(article).toContainText('Live-only')
  })

  test('Legal-6052 — Alert Center search is documented in the legality overview', async ({ page }) => {
    await openBySlug(page, 'Overview', 'legality-overview')
    const article = page.getByRole('article')
    await expect(article).toContainText('search bar')
    await expect(article).toContainText('crew ID, rank, or base')
    await expect(article).toContainText('brings that crew to the top of the Roster pane')
  })

  test('Scen-2092 — scenario browse documents the live status icon and update age', async ({ page }) => {
    await openBySlug(page, 'Browsing', 'scenario-browse')
    const article = page.getByRole('article')
    await expect(article).toContainText('in real time')
    await expect(article).toContainText('update age')
  })

  test('Live-1296 — RES Pairing topic no longer shows a NEW badge', async ({ page }) => {
    // RES Pairing shipped months ago; the NEW flag was removed in Rel 4 housekeeping.
    await expect(page.getByTestId('help-new-badge-live-res-pairing')).toHaveCount(0)
  })

  test('Live-1297 — Filtering topic documents Pairing ID and open/partial credit behaviour', async ({ page }) => {
    await openBySlug(page, 'Pairing ID', 'live-filter')
    const article = page.getByRole('article')
    await expect(article).toContainText('Pairing ID')
    await expect(article).toContainText('hard filter')
    await expect(article).toContainText('Open and/or Partial')
    await expect(article).toContainText('total credited time')
  })

  test("Live-1298 — R'Bot category is removed from Help after the assistant was retired", async ({ page }) => {
    await page.getByPlaceholder('Search topics…').fill("R'Bot")
    await expect(page.getByText("R'Bot")).toHaveCount(0)
    await expect(page.locator('[data-testid^="help-topic-rbot"]')).toHaveCount(0)
  })

  test('Live-1299 — context-menu topic documents Live and Scenario roster actions', async ({ page }) => {
    await openBySlug(page, 'Right-click', 'live-context-menu')
    const article = page.getByRole('article')
    // Live roster actions.
    await expect(article).toContainText('Edit Task')
    await expect(article).toContainText('Create Ground Task')
    // Scenario-only actions and the shared pin helper.
    await expect(article).toContainText('Remove from crew')
    await expect(article).toContainText('View flight detail')
    await expect(article).toContainText('Pin Selected Rows')
  })

  test('Live-1300 — Source topic explains IMP / PA / MA / CR', async ({ page }) => {
    await openBySlug(page, 'Source', 'live-source-column')
    const article = page.getByRole('article')
    await expect(article).toContainText('IMP')
    await expect(article).toContainText('Imported')
    await expect(article).toContainText('MA')
    await expect(article).toContainText('Manual')
    await expect(article).toContainText('PA')
    await expect(article).toContainText('Pre-Assignment')
    await expect(article).toContainText('CR')
    await expect(article).toContainText('Optimizer')
  })

  test('Scen-2093 — optimization-results topic documents each result tab in detail', async ({ page }) => {
    await openBySlug(page, 'optimization results', 'scenario-kpi')
    const article = page.getByRole('article')
    await expect(article).toContainText('Credit Hours per Crew')
    await expect(article).toContainText('Uncovered Pairings & Reserves')
    await expect(article).toContainText('Crew utilization')
    await expect(article).toContainText('Daily Distribution')
    await expect(article).toContainText('Delete Scenario Version')
    await expect(article).toContainText('Clear messages')
  })

  test('Live-1301 — Schedule Details topic documents the period and timezone controls', async ({ page }) => {
    await openBySlug(page, 'Schedule Details', 'schedule-details')
    const article = page.getByRole('article')
    await expect(article).toContainText('RP Date')
    await expect(article).toContainText('timezone')
    // One row per pairing (credit summed), timezone defaults to the crew base.
    await expect(article).toContainText('grouped into a single row')
    await expect(article).toContainText('base-airport')
  })

  test('Live-1302 — Daily Task Calendar topic documents the week grid and statistics', async ({ page }) => {
    await openBySlug(page, 'Daily Task Calendar', 'daily-task-calendar')
    const article = page.getByRole('article')
    await expect(article).toContainText('Statistics')
    await expect(article).toContainText('timezone')
    // Timezone defaults to the crew's base-airport timezone.
    await expect(article).toContainText('base-airport')
  })

  test('Live-1303 — Manday Info topic documents the daily Credit / BH table', async ({ page }) => {
    await openBySlug(page, 'Manday Info', 'manday-info')
    const article = page.getByRole('article')
    await expect(article).toContainText('Credit')
    await expect(article).toContainText('BH')
  })

  test('Live-1304 — Crew Info topic documents the record sections', async ({ page }) => {
    await openBySlug(page, 'Crew Info', 'crew-info')
    const article = page.getByRole('article')
    await expect(article).toContainText('Crew Base')
    await expect(article).toContainText('Crew Qualification')
  })

  test('Legal-6053 — rule 1001 Assignment Overlap is documented', async ({ page }) => {
    await openBySlug(page, '1001', 'legality-1001')
    const article = page.getByRole('article')
    await expect(article).toContainText('Assignment Overlap')
    await expect(article).toContainText('Before')
    await expect(article).toContainText('FLY / DHD')
    await expect(article).toContainText('2015')
  })

  test('Legal-6054 — Managing Rule Sets topic documents the sidebar and dialogs', async ({ page }) => {
    await openBySlug(page, 'Rule Sets', 'legality-rule-sets')
    const article = page.getByRole('article')
    await expect(article).toContainText('Enable this rule set')
    await expect(article).toContainText('LIVE')
    // Rule Instances / Rule Sets columns can be hidden and restored (2026-08-15).
    await expect(article).toContainText('Hide Rule Instances')
    await expect(article).toContainText('Hide Rule Sets')
    await expect(article).toContainText('Show Rule Instances')
  })

  test('Live-1305 — Saving with violations documents the confirm dialog and 8030 grouping', async ({ page }) => {
    await openBySlug(page, 'Saving, undoing', 'live-save-undo')
    const article = page.getByRole('article')
    await expect(article).toContainText('confirmation dialog')
    await expect(article).toContainText('Continue Anyway')
    await expect(article).toContainText('Age Restriction (8030)')
    await expect(article).toContainText('grouped into a single card')
  })

  test('Legal-6055 — Rule Templates topic documents templates vs copies', async ({ page }) => {
    await openBySlug(page, 'Rule Templates', 'legality-rule-templates')
    const article = page.getByRole('article')
    await expect(article).toContainText('Template')
    await expect(article).toContainText('Add to set')
    await expect(article).toContainText('Update By')
  })

  test('Help-2004 — Release overview documents the release-note workspace', async ({ page }) => {
    await openBySlug(page, 'Release', 'release-overview')
    const article = page.getByRole('article')
    await expect(article).toContainText('What the Release tab shows')
    await expect(article).toContainText('user-facing release notes')
  })

  test('Help-2005 — Data, Legality, System, and PBS menu topics describe shipped and partial pages', async ({ page }) => {
    const checks: Array<[string, string, string]> = [
      ['Org & Base', 'data-org-base', 'Department'],
      ['Fleet & Aircraft', 'data-fleet-aircraft', 'Aircraft'],
      ['Location & Route', 'data-location-route', 'Route and Hotel'],
      ['Crew Workload Summary', 'data-crew-workload', 'not yet implemented'],
      ['Rule Sets', 'legality-tab-rule-sets', 'parameter changes'],
      ['Comp Load', 'legality-tab-comp-load', 'not currently exposed'],
      ['Scheduler', 'system-scheduler', 'run history'],
      ['Queue Tasks', 'system-queue-tasks', 'not currently exposed'],
      ['Period', 'pbs-period', 'Generate draft periods'],
      ['Admin Tools', 'pbs-admin-tools', 'Import crew bids'],
    ]

    for (const [search, slug, expected] of checks) {
      await openBySlug(page, search, slug)
      await expect(page.getByRole('article')).toContainText(expected)
    }
  })
})
