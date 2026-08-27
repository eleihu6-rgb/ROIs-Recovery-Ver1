/**
 * R4 验证：/api/roster 精简 DTO 安全性。
 *
 * 证明（避免假象）：
 *  - 保留字段确实仍在 roster 对象上（渲染/面板所需：时间、duty、KPI、展示字段）
 *  - 裁剪字段确实已从响应中移除（审计/版本/学分/per-diem/训练课程等）
 *  - Gantt 仍正常渲染（counts>0 + Canvas 绘制行数>0），即裁剪未破坏 UI
 *
 * 注：roster 对象的 key 集合即 API 响应的字段集（store 原样保存）。
 */
import { test, expect } from '@playwright/test'
import { seedGanttAuth, gotoGantt, waitGanttReady, counts, paneRenderStat } from '../../utils/gantt-hook'

// 渲染 / 面板 / 交互实际消费、必须保留的字段
// （注：KPI ybh/mbh/yal/mal/ydo/mdo 不是 roster_flight 的列，原响应里本就没有，故不在此断言。）
const KEPT = [
  'id', 'crewId', 'pairingId', 'dutySeq', 'segSeq', 'fltId',
  'base', 'label', 'assignmentGroup', 'assignment', 'division', 'actingRank',
  'schStrDtUtc', 'schEndDtUtc', 'actRestMin',
  'pickupStartUtc', 'briefStartUtc', 'debriefEndUtc', 'dropoffStartUtc', 'dropoffEndUtc', 'dutyActRestMin',
]

// gantt 从不读取、应被裁剪掉的字段
const TRIMMED = [
  'ver', 'role', 'subRole', 'isRequested', 'isSwapped', 'preference', 'score', 'workingHour',
  'schCreditedMinutes', 'actCreditedMinutes', 'schPerDiemMins', 'tagSet', 'exceptionCode',
  'checkType', 'seqOrder', 'isPublish', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'isDeleted',
]

test.describe('Roster DTO trim (§R4)', () => {
  test('Live-1212 — roster response keeps consumed fields and drops unused ones, render intact @smoke', async ({ page, request }) => {
    await seedGanttAuth(page, request)
    await gotoGantt(page)
    await waitGanttReady(page)

    const keys = await page.evaluate(() => window.__ganttTest!.rosterKeys())
    expect(keys.length, 'roster object has fields').toBeGreaterThan(0)

    // 保留字段必须在
    const missingKept = KEPT.filter((k) => !keys.includes(k))
    expect(missingKept, `consumed fields must remain: ${missingKept.join(', ')}`).toEqual([])

    // 裁剪字段必须不在
    const leakedTrimmed = TRIMMED.filter((k) => keys.includes(k))
    expect(leakedTrimmed, `unused fields must be trimmed: ${leakedTrimmed.join(', ')}`).toEqual([])

    // 渲染未被破坏：对象仍呈现，Canvas 仍绘制
    const c = await counts(page)
    expect(c.roster, 'roster objects still loaded').toBeGreaterThan(0)
    const stat = await paneRenderStat(page, 'roster')
    expect(stat?.totalRows ?? 0, 'roster canvas still draws rows').toBeGreaterThan(0)
  })
})
