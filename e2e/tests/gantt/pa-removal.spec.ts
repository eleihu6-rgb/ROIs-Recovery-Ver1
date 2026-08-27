import { test, expect } from '@playwright/test'
import { ganttApiLogin, ganttApiUrl } from '../../utils/gantt-hook'

/**
 * PA-removal 3-stage workflow (Live-1304).
 *
 * Stage 1 — R'Bot writes the de-assignment plan as type=3 memos (visualize).
 * Stage 2 — planner corrects the plan by deleting a memo.
 * Stage 3 — execute soft-deletes the approved rosters. The destructive path is
 *   GATED on type=3 + status=Y; this test proves the SAFETY gate (a manual type=1
 *   memo is never executed, and no rosters are touched) without mutating the shared
 *   live demo data. The plan-count fixtures double as the over-removal guard.
 */
const FROM = '2026-06-01T00:00:00Z'
const TO = '2026-07-01T00:00:00Z'
const auth = (t: string) => ({ headers: { Authorization: `Bearer ${t}` } })

test.describe('PA-removal workflow (Live-1304)', () => {
  test('stage1 plan → stage2 correction → stage3 safety gate', async ({ request }) => {
    const token = await ganttApiLogin(request)

    // Stage 1 — plan for two sample crew; the protected/no-touch duties (sim-commute
    // F8 pairings, VAC, VAC-adjacent days off) are excluded by the classifier. Times
    // are read as true UTC, so 535 = 5 flying + 10 DO; 927 = 1 flying + 0 DO.
    const plan = await request.post(`${ganttApiUrl}/api/crew-memo/pa-removal`, {
      ...auth(token), data: { crewIds: ['535', '927'], from: FROM, to: TO },
    })
    const planData = (await plan.json()).data
    expect(planData.byCrew['535']).toBe(15)
    expect(planData.byCrew['927']).toBe(1)

    const list535 = async () =>
      (await (await request.get(`${ganttApiUrl}/api/crew-memo?crewIds=535&from=${FROM}&to=${TO}`, auth(token))).json()).data as Array<{ id: number; name: string }>
    let rows = await list535()
    expect(rows.filter((m) => m.name === 'De-assign pairing')).toHaveLength(5)
    expect(rows.filter((m) => m.name === 'De-assign day off')).toHaveLength(10)

    // Stage 2 — planner correction: drop one memo from the plan.
    const before = rows.length
    await request.delete(`${ganttApiUrl}/api/crew-memo/${rows[0].id}`, auth(token))
    rows = await list535()
    expect(rows.length).toBe(before - 1)

    // Stage 3 safety — a MANUAL (type=1) memo pointing at a real roster row is NOT
    // executed (execute only acts on type=3). No rosters are mutated.
    const manual = await request.post(`${ganttApiUrl}/api/crew-memo`, {
      ...auth(token),
      data: { crewId: 'E2E-EXEC-SAFE', strDtLoc: FROM, endDtLoc: TO, memo: 'manual', type: 1, rosterId: 1 },
    })
    const manualId = (await manual.json()).data.id
    const exec = await request.post(`${ganttApiUrl}/api/crew-memo/pa-removal/execute`, {
      ...auth(token), data: { crewIds: ['E2E-EXEC-SAFE'], from: FROM, to: TO },
    })
    expect(exec.ok()).toBeTruthy()
    expect((await exec.json()).data.deassigned).toBe(0)
    await request.delete(`${ganttApiUrl}/api/crew-memo/${manualId}`, auth(token))
  })
})
