import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DataGrid } from '../data-grid'
import type { DataPageRow } from '@/types/data-maintenance'

vi.mock('@rois/ui', async () => {
  const ReactModule = await import('react')
  return {
    Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
      ReactModule.createElement('button', props, children),
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) =>
      ReactModule.createElement('input', props),
    cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' '),
  }
})

const renderGrid = (props: {
  onEditRow?: (row: DataPageRow) => void
  onCopyRow?: (row: DataPageRow) => void
  onDeleteRow?: (row: DataPageRow) => void
  onCellCommit?: (row: DataPageRow, field: string, value: unknown) => Promise<void> | void
}): Root => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(
      <DataGrid
        entityId="base"
        rows={[{ id: 1, filiale: 'F8', base: 'YVR', name: 'Vancouver', displayOrder: 1 }]}
        onEditRow={props.onEditRow}
        onCopyRow={props.onCopyRow}
        onDeleteRow={props.onDeleteRow}
        onCellCommit={props.onCellCommit}
      />,
    )
  })

  return root
}

const setInputValue = (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('DataGrid row actions', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders row actions in a sticky Actions column', () => {
    const root = renderGrid({
      onEditRow: vi.fn(),
      onCopyRow: vi.fn(),
      onDeleteRow: vi.fn(),
    })

    const headers = Array.from(document.body.querySelectorAll('thead th'))
      .map((header) => header.textContent?.trim())

    expect(headers.at(-1)).toBe('Actions')
    expect(document.body.querySelector('thead th:last-child')?.className).toContain('sticky')
    expect(document.body.querySelector('thead th:last-child')?.className).toContain('right-0')

    const editBtn = document.querySelector<HTMLButtonElement>('[data-testid="data-edit-row-1"]')
    const copyBtn = document.querySelector<HTMLButtonElement>('[data-testid="data-copy-row-1"]')
    const deleteBtn = document.querySelector<HTMLButtonElement>('[data-testid="data-delete-row-1"]')
    const actionCell = editBtn?.closest('td')
    expect(editBtn?.getAttribute('aria-label')).toBe('Edit')
    expect(copyBtn?.getAttribute('aria-label')).toBe('Copy')
    expect(deleteBtn?.getAttribute('aria-label')).toBe('Delete')
    expect(editBtn?.textContent?.trim()).toBe('')
    expect(copyBtn?.textContent?.trim()).toBe('')
    expect(actionCell?.className).toContain('sticky')
    expect(actionCell?.className).toContain('right-0')

    act(() => {
      root.unmount()
    })
  })

  it('calls onCopyRow with the source row', () => {
    const onCopyRow = vi.fn()
    const root = renderGrid({
      onEditRow: vi.fn(),
      onCopyRow,
      onDeleteRow: vi.fn(),
    })

    act(() => {
      document.querySelector<HTMLButtonElement>('[data-testid="data-copy-row-1"]')?.click()
    })

    expect(onCopyRow).toHaveBeenCalledWith(expect.objectContaining({ id: 1, base: 'YVR' }))

    act(() => {
      root.unmount()
    })
  })

  it('edits a single cell inline and commits only that field', async () => {
    const onCellCommit = vi.fn().mockResolvedValue(undefined)
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(
        <DataGrid
          entityId="assignment"
          rows={[{ id: 11, assignment: 'CRE', description: 'Crew', btPct: '0.33' }]}
          onCellCommit={onCellCommit}
        />,
      )
    })

    const cell = document.querySelector<HTMLElement>('[data-testid="data-cell-assignment-description"]')
    expect(cell).not.toBeNull()
    const editableValue = document.querySelector<HTMLElement>('[data-testid="data-cell-editable-assignment-description"]')
    expect(editableValue?.getAttribute('title')).toBe('Double-click to edit')
    expect(editableValue?.className).toContain('cursor-pointer')
    expect(editableValue?.querySelector('span')?.className).toContain('bg-muted/60')
    expect(document.querySelector('[data-testid="data-cell-editable-assignment-id"]')).toBeNull()
    await act(async () => {
      cell?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    })

    const input = document.querySelector<HTMLInputElement>('[data-testid="data-cell-editor-assignment-description"]')
    expect(input).not.toBeNull()
    await act(async () => {
      setInputValue(input!, 'Crew Updated')
    })
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-testid="data-cell-save-assignment-description"]')?.click()
    })

    expect(onCellCommit).toHaveBeenCalledWith(
      expect.objectContaining({ id: 11 }),
      'description',
      'Crew Updated',
    )

    act(() => root.unmount())
  })

  it('rejects percent ratio values above one before commit', async () => {
    const onCellCommit = vi.fn().mockResolvedValue(undefined)
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(
        <DataGrid
          entityId="assignment"
          rows={[{ id: 11, assignment: 'CRE', btPct: '0.33' }]}
          onCellCommit={onCellCommit}
        />,
      )
    })

    const cell = document.querySelector<HTMLElement>('[data-testid="data-cell-assignment-btPct"]')
    await act(async () => {
      cell?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    })

    const input = document.querySelector<HTMLInputElement>('[data-testid="data-cell-editor-assignment-btPct"]')
    await act(async () => {
      setInputValue(input!, '33')
    })
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-testid="data-cell-save-assignment-btPct"]')?.click()
    })

    expect(onCellCommit).not.toHaveBeenCalled()
    expect(document.querySelector('[data-testid="data-cell-error-assignment-btPct"]')?.textContent ?? '').toContain('Use 0.33 for 33%')

    act(() => root.unmount())
  })

  it('virtualizes large row sets', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const rows = Array.from({ length: 200 }, (_, index) => ({
      id: index + 1,
      filiale: 'F8',
      base: `B${String(index).padStart(3, '0')}`,
      name: `Base ${index}`,
      displayOrder: index,
    }))

    act(() => {
      root.render(<DataGrid entityId="base" rows={rows} />)
    })

    const renderedDataRows = Array.from(document.body.querySelectorAll('tbody tr'))
      .filter((row) => row.getAttribute('aria-hidden') !== 'true')
    expect(renderedDataRows.length).toBeLessThan(80)
    expect(renderedDataRows.length).toBeGreaterThan(0)

    act(() => root.unmount())
  })
})
