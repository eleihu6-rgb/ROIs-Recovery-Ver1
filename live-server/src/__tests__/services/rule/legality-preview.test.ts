import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

vi.hoisted(() => {
  process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test'
  process.env.FILIALE ||= 'F8'
})

import {
  focusIntervalsFromPreviewItems,
  normalizePreviewViolations,
  resolvePreviewRosterOverlay,
  selectPreviewFocusItems,
  type PreviewRosterItem,
} from '../../../services/rule/legality-preview.js'

const item = (
  id: number,
  schStrDtUtc: string | null,
  schEndDtUtc: string | null,
): PreviewRosterItem => ({
  id,
  crewId: '295',
  pairingId: 42,
  schStrDtUtc,
  schEndDtUtc,
})

describe('selectPreviewFocusItems', () => {
  it('prefers negative-id temporary items and excludes positive-id items', () => {
    const afterItems = [
      item(-1, '2026-09-01T00:00:00.000Z', '2026-09-01T02:30:00.000Z'),
      item(7, '2026-09-02T00:00:00.000Z', '2026-09-02T01:00:00.000Z'),
      item(-2, '2026-09-03T00:00:00.000Z', '2026-09-03T01:00:00.000Z'),
    ]

    expect(selectPreviewFocusItems(afterItems)).toEqual([
      afterItems[0],
      afterItems[2],
    ])
  })

  it('returns no focus when no temporary items or explicit pairing ids exist', () => {
    const afterItems = [
      item(1, '2026-09-01T00:00:00.000Z', '2026-09-01T02:30:00.000Z'),
      item(2, '2026-09-02T00:00:00.000Z', '2026-09-02T01:00:00.000Z'),
    ]

    expect(selectPreviewFocusItems(afterItems)).toEqual([])
  })

  it('uses explicit pairing ids for the same before and after focus', () => {
    const afterItems = [
      { ...item(1, '2026-09-01T00:00:00.000Z', '2026-09-01T02:30:00.000Z'), pairingId: 41 },
      { ...item(-1, '2026-09-02T00:00:00.000Z', '2026-09-02T01:00:00.000Z'), pairingId: 42 },
    ]

    expect(selectPreviewFocusItems(afterItems, [41])).toEqual([afterItems[0]])
  })
})

describe('focusIntervalsFromPreviewItems', () => {
  it('returns epoch-second intervals for items with finite scheduled timestamps', () => {
    const intervals = focusIntervalsFromPreviewItems([
      item(-1, '2026-09-01T00:00:00.000Z', '2026-09-01T02:30:00.000Z'),
      item(7, '2026-09-02T00:00:00.000Z', '2026-09-02T01:00:00.000Z'),
      item(-2, 'invalid', '2026-09-02T02:30:00.000Z'),
      item(-3, '2026-09-03T00:00:00.000Z', null),
    ])

    expect(intervals).toEqual([
      {
        startSecs: Date.parse('2026-09-01T00:00:00.000Z') / 1000,
        endSecs: Date.parse('2026-09-01T02:30:00.000Z') / 1000,
      },
      {
        startSecs: Date.parse('2026-09-02T00:00:00.000Z') / 1000,
        endSecs: Date.parse('2026-09-02T01:00:00.000Z') / 1000,
      },
    ])
  })
})

describe('preview 7500 preflight', () => {
  it('runs the dedicated preflight hook before computeViolations', () => {
    // Vitest cwd is live-server/ when run via `npx vitest` from that package.
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/services/rule/legality-preview.ts'),
      'utf8',
    )
    const preflight = source.lastIndexOf('await recalculatePreviewAccRefTz')
    const compute = source.indexOf('const all = await core.computeViolations')
    expect(preflight).toBeGreaterThanOrEqual(0)
    expect(compute).toBeGreaterThan(preflight)
  })
})

describe('resolvePreviewRosterOverlay', () => {
  const cram = (
    id: number,
    pairingId: number,
    start: string,
    end: string,
  ): PreviewRosterItem => ({
    id,
    crewId: '13645',
    pairingId,
    assignment: 'CRAM',
    assignmentGroup: 'RES',
    schStrDtUtc: start,
    schEndDtUtc: end,
  })

  it('uses pairing-scoped overlay when focusPairingIds are provided (avoids wide wipe)', () => {
    // Partial client list: one early CRAM + the newly assigned Sep 25 CRAM.
    // Time-window overlay would span Sep 1–25 and erase other DB CRAMs.
    const afterItems = [
      cram(1, 138718, '2026-09-01T11:00:00.000Z', '2026-09-01T23:00:00.000Z'),
      cram(-1, 999001, '2026-09-25T11:00:00.000Z', '2026-09-25T23:00:00.000Z'),
    ]
    const overlay = resolvePreviewRosterOverlay(afterItems, [999001])
    expect(overlay).toEqual({
      mode: 'pairing',
      pairingIds: [999001],
      itemsToInsert: [afterItems[1]],
    })
  })

  it('falls back to time-window overlay when focusPairingIds are empty', () => {
    const afterItems = [
      cram(-1, 999001, '2026-09-25T11:00:00.000Z', '2026-09-25T23:00:00.000Z'),
    ]
    const overlay = resolvePreviewRosterOverlay(afterItems, [])
    expect(overlay.mode).toBe('window')
    if (overlay.mode === 'window') {
      expect(overlay.itemsToInsert).toEqual(afterItems)
      expect(overlay.overlayFrom).toBe('2026-09-24')
      expect(overlay.overlayToExclusive).toBe('2026-09-26')
    }
  })
})

describe('normalizePreviewViolations', () => {
  it('uses rule.severity over engine severity for draft preview labels and blocking', () => {
    const result = normalizePreviewViolations(
      [
        {
          crew_id: '246',
          pairing_id: 15572,
          duty_seq: 1,
          rule_code: '7504',
          rule_instance: '001',
          scope_key: '7504-gap',
          severity: 2,
          start_dt: '2026-08-07T00:00:00.000Z',
          end_dt: '2026-08-09T00:00:00.000Z',
          message: 'Engine marked overridable',
        },
        {
          crew_id: '246',
          pairing_id: 15572,
          duty_seq: 1,
          rule_code: '1001',
          rule_instance: '001',
          scope_key: '1001-hard',
          severity: 1,
          start_dt: null,
          end_dt: null,
          message: 'Engine marked soft',
        },
      ],
      new Map([
        ['7504:001', 1],
        ['1001:001', 3],
      ]),
    )

    expect(result.violations.map((v) => [v.ruleCode, v.ruleInstance, v.severity])).toEqual([
      ['7504', '001', 1],
      ['1001', '001', 3],
    ])
    expect(result.allowed).toBe(false)
  })

  it('keeps only focus-window 8030 hits when focusIntervals are provided', () => {
    const focusStart = Date.parse('2026-09-07T13:40:00.000Z') / 1000
    const focusEnd = Date.parse('2026-09-08T00:30:00.000Z') / 1000
    const result = normalizePreviewViolations(
      [
        {
          crew_id: '386',
          pairing_id: 135599,
          rule_code: '8030',
          rule_instance: '001',
          scope_key: '8030',
          severity: 2,
          start_dt: '2026-09-07T13:40:00.000Z',
          end_dt: '2026-09-07T18:50:00.000Z',
          message: 'focus hit',
        },
        {
          crew_id: '386',
          pairing_id: 961,
          rule_code: '8030',
          rule_instance: '001',
          scope_key: '8030',
          severity: 2,
          start_dt: '2026-08-01T12:00:00.000Z',
          end_dt: '2026-08-01T14:00:00.000Z',
          message: 'unrelated historical',
        },
        {
          crew_id: '386',
          pairing_id: 135599,
          rule_code: '1001',
          rule_instance: '001',
          scope_key: '1001',
          severity: 3,
          start_dt: '2026-08-01T12:00:00.000Z',
          end_dt: '2026-08-01T14:00:00.000Z',
          message: 'overlap kept',
        },
      ],
      new Map([
        ['8030:001', 2],
        ['1001:001', 3],
      ]),
      [{ startSecs: focusStart, endSecs: focusEnd }],
    )

    expect(result.violations.map((v) => [v.ruleCode, v.message])).toEqual([
      ['8030', 'focus hit'],
      ['1001', 'overlap kept'],
    ])
  })
})
