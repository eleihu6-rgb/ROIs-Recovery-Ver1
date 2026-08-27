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

const renderGrid = (entityId: string, rows: DataPageRow[]): { root: Root; idCell: HTMLElement | null } => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(<DataGrid entityId={entityId} rows={rows} />)
  })

  const idCell = document.querySelector<HTMLElement>(`[data-testid="data-cell-${entityId}-id"]`)
  return { root, idCell }
}

describe('DataGrid column alignment', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('left-aligns the ID column for Crew Status', () => {
    const { root, idCell } = renderGrid('crew_status', [{ id: 141515, crewId: '1031', status: '1' }])
    expect(idCell).not.toBeNull()
    expect(idCell!.className).toContain('text-left')
    expect(idCell!.className).not.toContain('text-right')
    act(() => root.unmount())
  })

  it('left-aligns the ID column for Crew Certificate', () => {
    const { root, idCell } = renderGrid('crew_certificate', [
      { id: 1688655, crewId: '1031', certificate: 'SPLP', expDt: '2027-01-01' },
    ])
    expect(idCell).not.toBeNull()
    expect(idCell!.className).toContain('text-left')
    expect(idCell!.className).not.toContain('text-right')
    act(() => root.unmount())
  })

  it('left-aligns the ID column for Crew Memo', () => {
    const { root, idCell } = renderGrid('crew_memo', [{ id: 1688655, crewId: '1031', memo: 'note' }])
    expect(idCell).not.toBeNull()
    expect(idCell!.className).toContain('text-left')
    expect(idCell!.className).not.toContain('text-right')
    act(() => root.unmount())
  })

  it('locks ID / Crew ID widths for Crew Memo (short and long memo rows)', () => {
    const rows: DataPageRow[] = [
      { id: 1, crewId: '113', memo: 'DO' },
      { id: 2, crewId: '113', memo: 'DO - 2026-06-21' },
    ]
    const { root } = renderGrid('crew_memo', rows)

    const idHeader = document.querySelector<HTMLElement>('[data-testid="data-grid-header-crew_memo-id"]')
    const crewHeader = document.querySelector<HTMLElement>('[data-testid="data-grid-header-crew_memo-crewId"]')
    const memoHeader = document.querySelector<HTMLElement>('[data-testid="data-grid-header-crew_memo-memo"]')
    expect(idHeader, 'id header').not.toBeNull()
    expect(crewHeader, 'crewId header').not.toBeNull()
    expect(memoHeader, 'memo header').not.toBeNull()
    expect(idHeader!.className).toContain('w-20')
    expect(crewHeader!.className).toContain('w-24')
    expect(memoHeader!.className).not.toMatch(/\bw-20\b|\bw-24\b/)

    const idCells = document.querySelectorAll<HTMLElement>('[data-testid="data-cell-crew_memo-id"]')
    const crewCells = document.querySelectorAll<HTMLElement>('[data-testid="data-cell-crew_memo-crewId"]')
    expect(idCells.length).toBe(2)
    expect(crewCells.length).toBe(2)
    for (const cell of idCells) expect(cell.className).toContain('w-20')
    for (const cell of crewCells) expect(cell.className).toContain('w-24')

    act(() => root.unmount())
  })

  it('uses a real Actions column width instead of w-px', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => {
      root.render(
        <DataGrid
          entityId="crew_memo"
          rows={[{ id: 1, crewId: '113', memo: 'DO' }]}
          onEditRow={() => undefined}
        />,
      )
    })
    const actionsTh = document.querySelector<HTMLElement>('th.sticky.right-0')
    const actionsTd = document.querySelector<HTMLElement>('td.sticky.right-0')
    expect(actionsTh, 'actions header').not.toBeNull()
    expect(actionsTd, 'actions cell').not.toBeNull()
    expect(actionsTh!.className).toContain('w-16')
    expect(actionsTh!.className).not.toContain('w-px')
    expect(actionsTd!.className).toContain('w-16')
    expect(actionsTd!.className).not.toContain('w-px')
    act(() => root.unmount())
  })

  it('left-aligns the Exp Date column for Crew Certificate', () => {
    const { root } = renderGrid('crew_certificate', [
      { id: 1688655, crewId: '1031', certificate: 'SPLP', expDt: '2027-01-01' },
    ])
    const expCell = document.querySelector<HTMLElement>('[data-testid="data-cell-crew_certificate-expDt"]')
    expect(expCell, 'expDt cell').not.toBeNull()
    expect(expCell!.className).toContain('text-left')
    expect(expCell!.className).not.toContain('text-right')
    act(() => root.unmount())
  })

  it('left-aligns Empl Date / Retire / Status for Crew Basic', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => {
      root.render(
        <DataGrid
          entityId="crew"
          rows={[
            {
              id: 1,
              crewId: '1031',
              lastName: 'Last',
              firstName: 'First',
              division: 'P',
              filiale: 'F8',
              gender: 'M',
              grade: 'CA',
              emplDt: '2020-01-01',
              retireDt: '2045-01-01',
              status: 1,
            },
          ]}
        />,
      )
    })
    for (const field of ['emplDt', 'retireDt', 'status']) {
      const cell = document.querySelector<HTMLElement>(`[data-testid="data-cell-crew-${field}"]`)
      expect(cell, `${field} cell`).not.toBeNull()
      expect(cell!.className).toContain('text-left')
      expect(cell!.className).not.toContain('text-right')
    }
    act(() => root.unmount())
  })

  it('left-aligns Eff Date / Exp Date for Crew Base, Rank, Fleet, Qualification', () => {
    const cases: Array<{ entity: string; row: DataPageRow }> = [
      { entity: 'crew_base', row: { id: 1, crewId: '1031', base: 'YVR', effDt: '2020-01-01', expDt: '2021-01-01' } },
      { entity: 'crew_rank', row: { id: 2, crewId: '1031', rank: 'CA', effDt: '2020-01-01', expDt: '2021-01-01' } },
      { entity: 'crew_fleet', row: { id: 3, crewId: '1031', fleetSpecific: 'A320', effDt: '2020-01-01', expDt: '2021-01-01' } },
      { entity: 'crew_qualification', row: { id: 4, crewId: '1031', qualification: 'ETOPS', effDt: '2020-01-01', expDt: '2021-01-01' } },
    ]
    for (const { entity, row } of cases) {
      const { root, idCell } = renderGrid(entity, [row])
      for (const field of ['effDt', 'expDt']) {
        const cell = document.querySelector<HTMLElement>(`[data-testid="data-cell-${entity}-${field}"]`)
        expect(cell, `${entity}.${field} cell`).not.toBeNull()
        expect(cell!.className).toContain('text-left')
        expect(cell!.className).not.toContain('text-right')
      }
      act(() => root.unmount())
    }
  })

  it('keeps other numeric columns right-aligned by default', () => {
    const { root, idCell } = renderGrid('base', [
      { id: 1, filiale: 'F8', base: 'YVR', name: 'Vancouver', displayOrder: 1 },
    ])
    expect(idCell).not.toBeNull()
    expect(idCell!.className).toContain('text-right')
    expect(idCell!.className).not.toContain('text-left')
    act(() => root.unmount())
  })
})
