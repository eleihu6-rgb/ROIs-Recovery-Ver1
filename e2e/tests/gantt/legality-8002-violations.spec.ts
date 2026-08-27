/**
 * Rule 8002 (MAX_CUM_BLOCK, 40h/28d) live violations — the gantt's own endpoint.
 *
 * Violations are computed by the Rust rule engine (rule-engine-rs) against the live
 * June-2026 roster and persisted to rule_violation under the gantt's default live
 * rule-check group, rule_code 8002. Post Model-B drop, that partition key is the default
 * RULE workset id ('103'), not the legacy rule_group code ('pbs_solver_ruleset'). This
 * test validates the exact call the gantt canvas / bell / Alert Center use — GET
 * /api/violations — surfaces them.
 *
 * §No-Illusion: asserts concrete rule_code / severity / message, never bare visibility.
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth, ganttApiUrl } from '../../utils/gantt-hook'

const GROUP = '103'
// Expanded default-gantt window (June view → ±1 month): covers the May–June worst windows.
const START = '2026-05-01T00:00:00Z'
const END = '2026-08-31T23:59:59Z'

// "Top viewport" crew the planner sees first — each flies well over 40h/28d in June.
const TARGET_CREW = ['113', '169', '197', '264']

interface Viol { ruleCode: string; message: string; severity: number }
interface Item { crewId: string; checkResults: Viol[] }

test.describe('Rule 8002 — live gantt violations', () => {
  test('Legal-6005 — gantt /api/violations serves Rust-computed 8002 violations (June)', async ({ page, request }) => {
    const token = await seedGanttAuth(page, request)
    await page.goto('/altair/')
    await page.getByTestId('module-nav-live').click()

    const headers = { Authorization: `Bearer ${token}` }
    const url = `${ganttApiUrl}/api/violations?crewIds=${TARGET_CREW.join(',')}&groupCode=${GROUP}&start=${encodeURIComponent(START)}&end=${encodeURIComponent(END)}`
    const res = await request.get(url, { headers })
    expect(res.ok()).toBeTruthy()
    const items = ((await res.json()).data ?? []) as Item[]

    // /api/violations returns ONE item per (crew, pairing); a crew flies several pairings,
    // so 8002 lives on whichever pairing breached — not necessarily the crew's first item.
    // Scan every item for the crew (a plain .find on the first item misses it).
    const has8002 = (crew: string): Viol | undefined =>
      items
        .filter((i) => i.crewId === crew)
        .flatMap((i) => i.checkResults)
        .find((r) => r.ruleCode === '8002')

    // Every top-viewport crew fires an 8002 alarm — Hard (sev 3), cumulative-block message.
    // The cap is param-driven (rule 8002/001 Max Limits), so assert the message shape.
    for (const crew of TARGET_CREW) {
      const v = has8002(crew)
      expect(v, `crew ${crew} must FIRE an 8002 alarm`).toBeTruthy()
      expect(v!.severity).toBe(3)
      expect(v!.message).toMatch(/exceeds \d+h/)
    }
  })
})
