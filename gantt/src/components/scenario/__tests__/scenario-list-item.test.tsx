import { describe, expect, it, vi } from 'vitest'
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ScenarioListItem } from '../scenario-list-item'
import type { ScenarioItem } from '@/types'

vi.mock('@rois/ui', () => ({
  Button: ({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: React.MouseEventHandler }) => (
    <button className={className} onClick={onClick}>{children}</button>
  ),
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: React.MouseEventHandler }) => (
    <button className={className} onClick={onClick}>{children}</button>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' '),
  formatUiDateRange: (start: string, end: string) => `${start} - ${end}`,
}))

const makeItem = (overrides: Partial<ScenarioItem> = {}): ScenarioItem => ({
  id: 524,
  name: 'RO-DUP-SRC-1781803508099',
  fileType: 'RO',
  status: 'DONE',
  strDtLoc: '2026-05-01',
  endDtLoc: '2026-05-31',
  optimizedCount: 3,
  leadinLive: 1,
  updatedBy: 'admin',
  updatedByName: 'Kevin Zhang',
  updatedAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
  ...overrides,
})

describe('ScenarioListItem', () => {
  const renderItem = (item: ScenarioItem): HTMLElement => {
    const container = document.createElement('div')
    const root = createRoot(container)
    act(() => {
      root.render(
        <ScenarioListItem
          item={item}
          isSelected={false}
          onSelect={vi.fn()}
          onDelete={vi.fn()}
          onDuplicate={vi.fn()}
          onRename={vi.fn()}
        />,
      )
    })
    return container
  }

  it('renders the dense scenario summary layout', () => {
    const container = renderItem(makeItem())

    const typeBadge = container.querySelector('[data-testid="scenario-item-type"]')
    const idBadge = container.querySelector('[data-testid="scenario-item-id"]')
    expect(typeBadge).not.toBeNull()
    expect(idBadge).not.toBeNull()
    expect(typeBadge?.textContent).toBe('RO')
    expect(idBadge?.textContent).toBe('524')
    expect(typeBadge?.className).toContain('bg-slate')
    expect(idBadge?.className).toContain('bg-[#DFF7EA]')
    expect(idBadge?.className).toContain('text-[#065F46]')
    expect(idBadge?.className).toContain('text-sm')
    expect(idBadge?.className).toContain('font-semibold')
    expect(idBadge?.className).not.toContain('border')
    expect(idBadge?.className).not.toContain('font-mono')
    expect(typeBadge && idBadge && (typeBadge.compareDocumentPosition(idBadge) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy()

    const meta = container.querySelector('[data-testid="scenario-item-meta"]')
    expect(meta).not.toBeNull()
    expect(meta?.textContent).toContain('1-31 May 2026')
    expect(meta?.textContent).toContain('admin')
    expect(meta?.textContent).toContain('3 results')
    expect(meta?.textContent).toContain('days ago')
    expect(meta?.textContent).not.toContain('Live')
    const optimized = container.querySelector('[data-testid="scenario-item-optimized-count"]')
    expect(optimized).not.toBeNull()
    expect(optimized?.textContent).toContain('3 results')
    expect(optimized?.className).toContain('bg-[#DFF7EA]')
    expect(optimized?.className).toContain('text-[#065F46]')
    expect(optimized?.className).toContain('font-semibold')
    expect(optimized?.className).not.toContain('border')

    expect(container.querySelector('[aria-label="Scenario status: Done"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="scenario-item-status-dot"]')).toBeNull()
    expect(container.querySelector('[data-testid="scenario-item-source-row"]')).toBeNull()
  })

  it('formats cross-month dates and leaves zero result count unhighlighted', () => {
    const container = renderItem(makeItem({
      strDtLoc: '2026-05-20',
      endDtLoc: '2026-06-10',
      optimizedCount: 0,
      status: 'RUNNING',
    }))

    const meta = container.querySelector('[data-testid="scenario-item-meta"]')
    expect(meta).not.toBeNull()
    expect(meta?.textContent).toContain('20 May-10 Jun 2026')
    expect(meta?.textContent).toContain('admin')
    const optimized = container.querySelector('[data-testid="scenario-item-optimized-count"]')
    expect(optimized).not.toBeNull()
    expect(optimized?.textContent).toContain('0 results')
    expect(optimized?.className).not.toContain('text-[#065F46]')
    expect(optimized?.className).not.toContain('bg-[#DFF7EA]')
    expect(container.querySelector('[aria-label="Scenario status: Running"]')).not.toBeNull()
  })

  it('falls back to updatedBy when no display name is available', () => {
    const container = renderItem(makeItem({ updatedByName: null, updatedBy: 'engine' }))

    expect(container.querySelector('[data-testid="scenario-item-meta"]')?.textContent).toContain('engine')
  })

  it('renders relative time without the about prefix', () => {
    const container = renderItem(makeItem({
      updatedAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    }))

    const age = container.querySelector('[data-testid="scenario-item-updated-age"]')?.textContent
    expect(age).toBe('6 hours ago')
    expect(age).not.toContain('about')
  })

  it('shortens minute labels in relative time', () => {
    const container = renderItem(makeItem({
      updatedAt: new Date(Date.now() - 59 * 60 * 1000).toISOString(),
    }))

    expect(container.querySelector('[data-testid="scenario-item-updated-age"]')?.textContent).toBe('59 mins ago')
  })

  it('uses singular result for one optimized roster', () => {
    const container = renderItem(makeItem({ optimizedCount: 1 }))

    expect(container.querySelector('[data-testid="scenario-item-optimized-count"]')?.textContent).toBe('1 result')
  })
})
