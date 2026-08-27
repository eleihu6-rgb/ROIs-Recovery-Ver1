import { describe, expect, it } from 'vitest'
import { applyToggleAll, defaultSelectedIds, toggleId } from '../team-rule-selection'

describe('team-rule selection helpers', () => {
  const rows = [
    { id: 'c1', match: true },
    { id: 'c2', match: true },
    { id: 'c3', match: false },
  ]
  const idOf = (row: { id: string }) => row.id
  const matches = (row: { id: string }) => row.match

  it('uses the stored array when present', () => {
    expect(defaultSelectedIds(rows, idOf, ['c1'], matches)).toEqual(['c1'])
  })

  it('defaults to all filter-matching rows when no stored array exists', () => {
    expect(defaultSelectedIds(rows, idOf, undefined, matches)).toEqual(['c1', 'c2'])
  })

  it('defaults to every row when the filter matches everything', () => {
    expect(defaultSelectedIds(rows, idOf, undefined, () => true)).toEqual(['c1', 'c2', 'c3'])
  })

  it('returns a copy of the stored array, not the same reference', () => {
    const stored = ['c2']
    expect(defaultSelectedIds(rows, idOf, stored, matches)).not.toBe(stored)
  })

  it('toggleId adds an id and removes a present id', () => {
    expect(toggleId(['c1'], 'c2')).toEqual(['c1', 'c2'])
    expect(toggleId(['c1', 'c2'], 'c1')).toEqual(['c2'])
  })

  it('applyToggleAll with select-all unions the visible ids', () => {
    expect(applyToggleAll(['c1'], ['c2', 'c3'], true)).toEqual(['c1', 'c2', 'c3'])
  })

  it('applyToggleAll with deselect-all removes only the visible ids', () => {
    expect(applyToggleAll(['c1', 'c2', 'c3'], ['c1', 'c3'], false)).toEqual(['c2'])
  })
})
