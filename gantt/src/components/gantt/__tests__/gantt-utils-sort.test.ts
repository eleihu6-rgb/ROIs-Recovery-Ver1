import { describe, expect, it } from 'vitest'

import { sortPanelRowsByValues } from '../gantt-utils'
import type { PanelRowData } from '../pane-header-canvas'

const row = (rowId: string, value: string): PanelRowData => ({
  rowId,
  values: { mcred: value },
})

describe('sortPanelRowsByValues', () => {
  it('sorts HH:MM panel values by duration minutes instead of text', () => {
    const rows = [
      row('crew-609', '98:21'),
      row('crew-1988', '110:11'),
      row('crew-small', '9:10'),
    ]

    const sorted = sortPanelRowsByValues(
      rows,
      [{ column: 'mcred', direction: 'desc' }],
      (a, b) => a.rowId.localeCompare(b.rowId),
    )

    expect(sorted.map((r) => r.rowId)).toEqual(['crew-1988', 'crew-609', 'crew-small'])
  })
})
