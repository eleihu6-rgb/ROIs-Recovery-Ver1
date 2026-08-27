import React, { useState } from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { MultiSelectDropdown } from '../multi-select-dropdown'

describe('MultiSelectDropdown', () => {
  it('opens from the trigger without changing selected values and keeps chip remove explicit', async () => {
    const onChange = vi.fn()
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <MultiSelectDropdown
          options={[
            { value: 'P', label: 'P - Pilot' },
            { value: 'C', label: 'C - Cabin' },
          ]}
          selected={['P']}
          onChange={onChange}
          testId="division"
        />,
      )
    })

    await act(async () => {
      ;(container.querySelector('[data-testid="division-trigger"]') as HTMLElement).click()
    })

    expect(onChange).not.toHaveBeenCalled()
    expect(container.querySelector('[data-testid="division-opt-P"]')).toBeTruthy()

    await act(async () => {
      ;(container.querySelector('[data-testid="division-remove-P"]') as HTMLButtonElement).click()
    })

    expect(onChange).toHaveBeenCalledWith([])
  })

  it('toggles options from the opened menu', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    const Probe = () => {
      const [selected, setSelected] = useState<string[]>(['P'])
      return (
        <MultiSelectDropdown
          options={[
            { value: 'P', label: 'P - Pilot' },
            { value: 'C', label: 'C - Cabin' },
          ]}
          selected={selected}
          onChange={setSelected}
          testId="division"
        />
      )
    }

    await act(async () => {
      root.render(<Probe />)
    })
    await act(async () => {
      ;(container.querySelector('[data-testid="division-trigger"]') as HTMLElement).click()
    })
    await act(async () => {
      ;(container.querySelector('[data-testid="division-opt-C"]') as HTMLButtonElement).click()
    })

    expect(container.querySelector('[data-testid="division-trigger"]')?.textContent).toContain('P')
    expect(container.querySelector('[data-testid="division-trigger"]')?.textContent).toContain('C')
  })

  it('renders chips in options order and honors showChipLabels', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    await act(async () => {
      root.render(
        <MultiSelectDropdown
          options={[
            { value: '9', label: '2026RP09' },
            { value: '2', label: '2026RP02' },
            { value: '8', label: '2026RP08' },
          ]}
          selected={['8', '2']} // click order 08 then 02
          onChange={vi.fn()}
          testId="rp"
          showChipLabels
        />,
      )
    })
    const trigger = container.querySelector('[data-testid="rp-trigger"]') as HTMLElement
    const text = trigger.textContent ?? ''
    // options order = 02, 08, 09 → chip order 02 before 08
    expect(text.indexOf('2026RP02')).toBeGreaterThanOrEqual(0)
    expect(text.indexOf('2026RP08')).toBeGreaterThan(text.indexOf('2026RP02'))
    expect(text).not.toContain('2026RP09')
  })

  it('keeps raw values in chips when showChipLabels is off', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    await act(async () => {
      root.render(
        <MultiSelectDropdown
          options={[{ value: 'P', label: 'Pilot' }, { value: 'C', label: 'Cabin' }]}
          selected={['C']}
          onChange={vi.fn()}
          testId="dv"
        />,
      )
    })
    expect((container.querySelector('[data-testid="dv-trigger"]') as HTMLElement).textContent).toContain('C')
    expect((container.querySelector('[data-testid="dv-trigger"]') as HTMLElement).textContent).not.toContain('Cabin')
  })

  it('renders option hints, trigger summary, footer hint and the load-more row', async () => {
    const onLoadMore = vi.fn()
    const container = document.createElement('div')
    const root = createRoot(container)
    await act(async () => {
      root.render(
        <MultiSelectDropdown
          options={[
            { value: '8', label: '2026RP08', hint: '08-01 ~ 08-31' },
            { value: '9', label: '2026RP09', hint: '09-01 ~ 09-30' },
          ]}
          selected={['8']}
          onChange={vi.fn()}
          testId="rp"
          summary="2026-07-25 ~ 2026-09-07"
          summaryTestId="rp-range"
          loadMoreAvailable
          onLoadMore={onLoadMore}
          loadMoreLabel="Load earlier RPs"
          loadMoreTestId="rp-load-more"
          footerHint="Max 6 RPs span (performance)"
          triggerTooltip="Select up to 6 roster periods (max span, for performance)"
        />,
      )
    })

    const trigger = container.querySelector('[data-testid="rp-trigger"]') as HTMLElement
    expect(trigger.title).toContain('max span')
    expect((container.querySelector('[data-testid="rp-range"]') as HTMLElement).textContent)
      .toBe('2026-07-25 ~ 2026-09-07')

    await act(async () => { trigger.click() })

    expect((container.querySelector('[data-testid="rp-opt-8"]') as HTMLElement).textContent).toContain('08-01 ~ 08-31')
    const loadMore = container.querySelector('[data-testid="rp-load-more"]') as HTMLElement
    expect(loadMore.textContent).toContain('Load earlier RPs')
    await act(async () => { loadMore.click() })
    expect(onLoadMore).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain('Max 6 RPs span (performance)')
  })

  it('summaryOnly shows just the date range — no chips, no selected-count footer', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    await act(async () => {
      root.render(
        <MultiSelectDropdown
          options={[
            { value: '8', label: '2026RP08', hint: '08-01 ~ 08-28' },
            { value: '9', label: '2026RP09', hint: '09-01 ~ 09-28' },
          ]}
          selected={['8']}
          onChange={vi.fn()}
          testId="rp"
          summary="2026-07-25 ~ 2026-09-04"
          summaryTestId="rp-range"
          summaryOnly
        />,
      )
    })

    const trigger = container.querySelector('[data-testid="rp-trigger"]') as HTMLElement
    expect(trigger.textContent).toContain('2026-07-25 ~ 2026-09-04')
    expect(container.querySelector('[data-testid^="rp-remove-"]'), 'no chips in summaryOnly').toBeNull()

    await act(async () => { trigger.click() })
    expect(container.textContent).toContain('Clear all')
    expect(container.textContent, 'no N-selected count in summaryOnly').not.toContain('selected')
  })
})
