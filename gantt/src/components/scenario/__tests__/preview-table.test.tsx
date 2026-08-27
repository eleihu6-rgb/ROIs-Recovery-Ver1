import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-virtual', () => {
  const useVirtualizer = ({ count, estimateSize }: { count: number; estimateSize: () => number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        start: index * estimateSize(),
        end: (index + 1) * estimateSize(),
        size: estimateSize(),
      })),
    getTotalSize: () => count * estimateSize(),
  })
  return { useVirtualizer }
})

import { PreviewTable } from '../scenario-parameter-editors'

const rows = [
  { crew_id: 'F8001', name: 'Alice', rank: 'CA' },
  { crew_id: 'F8002', name: 'Bob', rank: 'FO' },
  { crew_id: 'F8003', name: 'Carol', rank: 'CA' },
]

const renderTable = (props: Parameters<typeof PreviewTable>[0]) => {
  const container = document.createElement('div')
  const root = createRoot(container)
  act(() => {
    root.render(<PreviewTable {...props} />)
  })
  return { container, root }
}

describe('PreviewTable', () => {
  it('renders a checkbox column before the data columns when selectable', () => {
    const { container, root } = renderTable({
      rows,
      columns: [{ key: 'crew_id', label: 'Crew' }],
      emptyText: 'none',
      caption: '3 crews',
      selectable: true,
      rowId: (row) => String(row.crew_id),
      selectedIds: [],
      onToggleRow: vi.fn(),
      onToggleAll: vi.fn(),
    })
    const checkboxes = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    expect(checkboxes).toHaveLength(1 + rows.length) // header + one per row
    const firstCell = container.querySelector('thead th')
    expect(firstCell?.querySelector('input[type="checkbox"]')).not.toBeNull()
    act(() => root.unmount())
  })

  it('marks the header checked only when every visible row is selected', () => {
    const { container, root } = renderTable({
      rows,
      columns: [{ key: 'crew_id', label: 'Crew' }],
      emptyText: 'none',
      caption: '3 crews',
      selectable: true,
      rowId: (row) => String(row.crew_id),
      selectedIds: ['F8001', 'F8002', 'F8003'],
      onToggleRow: vi.fn(),
      onToggleAll: vi.fn(),
    })
    const header = container.querySelector<HTMLInputElement>('thead input[type="checkbox"]')
    expect(header?.checked).toBe(true)
    act(() => root.unmount())
  })

  it('calls onToggleAll(false) when all rows are selected and the header is clicked', () => {
    const onToggleAll = vi.fn()
    const { container, root } = renderTable({
      rows,
      columns: [{ key: 'crew_id', label: 'Crew' }],
      emptyText: 'none',
      caption: '3 crews',
      selectable: true,
      rowId: (row) => String(row.crew_id),
      selectedIds: ['F8001', 'F8002', 'F8003'],
      onToggleRow: vi.fn(),
      onToggleAll,
    })
    act(() => {
      container.querySelector<HTMLInputElement>('thead input[type="checkbox"]')?.click()
    })
    expect(onToggleAll).toHaveBeenCalledWith(false)
    act(() => root.unmount())
  })

  it('renders an empty-row placeholder when there are no rows', () => {
    const { container, root } = renderTable({
      rows: [],
      columns: [{ key: 'crew_id', label: 'Crew' }],
      emptyText: 'No crews match.',
      caption: '0 crews',
      selectable: true,
      rowId: (row) => String(row.crew_id),
      selectedIds: [],
      onToggleRow: vi.fn(),
      onToggleAll: vi.fn(),
    })
    expect(container.textContent).toContain('No crews match.')
    act(() => root.unmount())
  })
})
