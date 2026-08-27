import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ImportPbsDialog } from '../import-pbs-dialog'
import { createInitialProgress, applyImportProgressEvent } from '@/services/import-pbs-progress'

vi.mock('@/stores/roster-period-store', () => {
  const items = [
    { id: 5, rosterPeriod: '2026-05', name: '2026-05', rpStart: '2026-05-01', rpEnd: '2026-05-31', isCurrent: false },
    { id: 6, rosterPeriod: '2026-06', name: '2026-06', rpStart: '2026-06-01', rpEnd: '2026-06-30', isCurrent: true },
    { id: 7, rosterPeriod: '2026-07', name: '2026-07', rpStart: '2026-07-01', rpEnd: '2026-07-31', isCurrent: false },
  ]
  return {
    useRosterPeriodStore: (selector: (s: unknown) => unknown) =>
      selector({ items, loading: false, loadRosterPeriods: () => Promise.resolve() }),
  }
})

vi.mock('@rois/ui', () => ({
  AppDialog: ({ open, title, children, footer }: { open: boolean; title: string; children: React.ReactNode; footer?: React.ReactNode }) =>
    open ? <div data-testid="dialog"><h1>{title}</h1>{children}{footer}</div> : null,
  Button: ({ children, onClick, disabled, 'data-testid': testId }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; 'data-testid'?: string }) =>
    <button data-testid={testId} disabled={disabled} onClick={onClick}>{children}</button>,
  EnglishDatePicker: ({
    disabled,
    testId,
    value,
  }: {
    disabled?: boolean
    testId?: string
    value: string
  }) => <input data-testid={testId} disabled={disabled} readOnly type="text" value={value} />,
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => <div data-value={value}>{children}</div>,
  SelectTrigger: ({ children, 'data-testid': testId }: { children: React.ReactNode; 'data-testid'?: string }) => <button data-testid={testId}>{children}</button>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  cn: (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' '),
}))

describe('ImportPbsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('uses roster period dates and removes legacy filters', async () => {
    const onConfirm = vi.fn()
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <ImportPbsDialog
          open
          onOpenChange={vi.fn()}
          onConfirm={onConfirm}
        />,
      )
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(container.textContent).toContain('Import PBS Material')
    expect(container.textContent).toContain('RosterGround')
    expect(container.textContent).toContain('Crew')
    expect(container.textContent).not.toContain('Base')
    expect(container.textContent).not.toContain('Rank')
    expect(container.textContent).not.toContain('Fleet')
    expect(container.textContent).not.toContain('Mode')

    const startDate = container.querySelector('[data-testid="import-pbs-start-date"]') as HTMLInputElement
    const endDate = container.querySelector('[data-testid="import-pbs-end-date"]') as HTMLInputElement
    expect(startDate.value).toBe('2026-06-01')
    expect(endDate.value).toBe('2026-06-30')
    expect(startDate.disabled).toBe(true)
    expect(endDate.disabled).toBe(true)

    expect(container.querySelector('[data-testid="import-pbs-bases"]')).toBeNull()
    expect(container.querySelector('[data-testid="import-pbs-ranks"]')).toBeNull()
    expect(container.querySelector('[data-testid="import-pbs-fleets"]')).toBeNull()
    expect(container.querySelector('[data-testid="import-pbs-mode"]')).toBeNull()
  })

  it('confirms current roster period and material scope', async () => {
    const onConfirm = vi.fn()
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(<ImportPbsDialog open onOpenChange={vi.fn()} onConfirm={onConfirm} />)
    })
    await act(async () => {
      await Promise.resolve()
    })
    await act(async () => {
      ;(container.querySelector('[data-testid="import-pbs-scope-crew"]') as HTMLInputElement).click()
    })
    await act(async () => {
      ;(container.querySelector('[data-testid="import-pbs-confirm"]') as HTMLButtonElement).click()
    })

    expect(onConfirm).toHaveBeenCalledWith({
      rosterPeriodId: 6,
      rosterPeriod: '2026-06',
      startDate: '2026-06-01',
      endDate: '2026-06-30',
      scope: {
        flight: false,
        pairing: false,
        roster: false,
        rosterGround: false,
        crew: true,
      },
    })
  })

  it('defaults material scope to unchecked and orders material options by workflow', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(<ImportPbsDialog open onOpenChange={vi.fn()} onConfirm={vi.fn()} />)
    })
    await act(async () => {
      await Promise.resolve()
    })

    const labels = Array.from(container.querySelectorAll('[data-testid="import-pbs-scope"] label'))
      .map((label) => label.textContent)
    expect(labels).toEqual(['Crew', 'Roster', 'RosterGround', 'Pairing', 'Flight'])
    for (const key of ['crew', 'roster', 'rosterGround', 'pairing', 'flight']) {
      expect((container.querySelector(`[data-testid="import-pbs-scope-${key}"]`) as HTMLInputElement).checked).toBe(false)
    }
    expect((container.querySelector('[data-testid="import-pbs-confirm"]') as HTMLButtonElement).disabled).toBe(true)
    expect(container.textContent).toContain('Select at least one material type.')
  })

  it('shows status and seconds only in each material stage cell while confirming is running', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-16T00:00:03.000Z'))
    const progress = applyImportProgressEvent(createInitialProgress(['crew']), {
      type: 'stage',
      importId: 'import-uuid-1',
      material: 'crew',
      stage: 'fetch',
      status: 'running',
      processed: 1200,
      at: '2026-07-16T00:00:00.000Z',
    })

    await act(async () => {
      root.render(
        <ImportPbsDialog
          open
          onOpenChange={vi.fn()}
          onConfirm={vi.fn()}
          importing
          progress={progress}
        />,
      )
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(container.querySelector('[data-testid="import-pbs-progress"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="import-pbs-elapsed"]')?.textContent).toBe('00:00')
    expect(container.querySelector('[data-testid="import-pbs-stage-label"]')?.textContent).toBe('Overall import progress')
    expect(Number(container.querySelector('[data-testid="import-pbs-progress-bar"]')?.getAttribute('aria-valuenow'))).toBeGreaterThan(0)
    expect(container.querySelector('[data-testid="import-pbs-material-progress"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="import-pbs-material-progress-crew-fetch"]')?.getAttribute('data-status')).toBe('running')
    expect(container.querySelector('[data-testid="import-pbs-material-progress-crew-transform"]')?.getAttribute('data-status')).toBe('waiting')
    expect(container.querySelector('[data-testid="import-pbs-material-progress-crew-write"]')?.getAttribute('data-status')).toBe('waiting')
    expect(container.querySelector('[data-testid="import-pbs-material-progress-crew-fetch"]')?.textContent).toBe('Running3s')
    expect(container.querySelector('[data-testid="import-pbs-material-progress-crew-transform"]')?.textContent).toBe('Waiting0s')
    expect(container.querySelector('[data-testid="import-pbs-material-progress-crew-write"]')?.textContent).toBe('Waiting0s')
    expect(container.querySelector('[data-testid="import-pbs-material-progress"]')?.textContent).not.toContain('1,200')
    expect(container.textContent).not.toContain('Fetching selected materials from the API in parallel')
    expect((container.querySelector('[data-testid="import-pbs-confirm"]') as HTMLButtonElement).disabled).toBe(true)
  })

  it('marks transform stage active from real progress props', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    const fetched = applyImportProgressEvent(createInitialProgress(['crew']), {
      type: 'stage',
      importId: 'import-uuid-1',
      material: 'crew',
      stage: 'fetch',
      status: 'done',
      at: '2026-07-16T00:00:00.000Z',
    })
    const progress = applyImportProgressEvent(fetched, {
      type: 'stage',
      importId: 'import-uuid-1',
      material: 'crew',
      stage: 'transform',
      status: 'running',
      at: '2026-07-16T00:00:00.000Z',
    })

    await act(async () => {
      root.render(
        <ImportPbsDialog
          open
          onOpenChange={vi.fn()}
          onConfirm={vi.fn()}
          importing
          progress={progress}
        />,
      )
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(container.querySelector('[data-testid="import-pbs-stage-label"]')?.textContent).toBe('Overall import progress')
    expect(container.querySelector('[data-testid="import-pbs-material-progress-crew-fetch"]')?.getAttribute('data-status')).toBe('done')
    expect(container.querySelector('[data-testid="import-pbs-material-progress-crew-transform"]')?.getAttribute('data-status')).toBe('running')
    expect(container.querySelector('[data-testid="import-pbs-material-progress-crew-fetch"]')?.textContent).toBe('Done0s')
    expect(Number(container.querySelector('[data-testid="import-pbs-progress-bar"]')?.getAttribute('aria-valuenow'))).toBeGreaterThan(0)
  })

  it('defaults to fetch at 0% when importing without progress yet', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <ImportPbsDialog
          open
          onOpenChange={vi.fn()}
          onConfirm={vi.fn()}
          importing
          progress={null}
        />,
      )
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(container.querySelector('[data-testid="import-pbs-progress"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="import-pbs-stage-label"]')?.textContent).toBe('Overall import progress')
    expect(container.querySelector('[data-testid="import-pbs-progress-bar"]')?.getAttribute('aria-valuenow')).toBe('0')
    expect(container.querySelector('[data-testid="import-pbs-material-progress"]')).toBeNull()
  })

  it('shows per-material fetch, transform, and write progress', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    let progress = applyImportProgressEvent(createInitialProgress([]), {
      type: 'started',
      importId: 'import-uuid-1',
      rosterPeriodId: 7,
      rosterPeriod: '2026-07',
      startDt: '2026-07-01',
      endDt: '2026-07-31',
      materials: ['roster', 'rosterGround', 'pairing', 'flight'],
      at: '2026-07-16T00:00:00.000Z',
    })
    progress = applyImportProgressEvent(progress, {
      type: 'stage',
      importId: 'import-uuid-1',
      material: 'flight',
      stage: 'fetch',
      status: 'running',
      at: '2026-07-16T00:00:00.000Z',
    })
    progress = applyImportProgressEvent(progress, {
      type: 'stage',
      importId: 'import-uuid-1',
      material: 'flight',
      stage: 'fetch',
      status: 'done',
      recordsIn: 2400,
      at: '2026-07-16T00:00:01.000Z',
    })
    progress = applyImportProgressEvent(progress, {
      type: 'stage',
      importId: 'import-uuid-1',
      material: 'flight',
      stage: 'transform',
      status: 'done',
      recordsOut: 2398,
      at: '2026-07-16T00:00:02.000Z',
    })
    progress = applyImportProgressEvent(progress, {
      type: 'stage',
      importId: 'import-uuid-1',
      material: 'flight',
      stage: 'write',
      status: 'running',
      processed: 1200,
      total: 2398,
      at: '2026-07-16T00:00:03.000Z',
    })

    await act(async () => {
      root.render(
        <ImportPbsDialog
          open
          onOpenChange={vi.fn()}
          onConfirm={vi.fn()}
          importing
          progress={progress}
        />,
      )
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(container.querySelector('[data-testid="import-pbs-material-progress"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="import-pbs-progress-summary"]')).toBeNull()
    expect(container.querySelector('[data-testid="import-pbs-material-progress-flight-fetch"]')?.getAttribute('data-status')).toBe('done')
    expect(container.querySelector('[data-testid="import-pbs-material-progress-flight-transform"]')?.getAttribute('data-status')).toBe('done')
    expect(container.querySelector('[data-testid="import-pbs-material-progress-flight-write"]')?.getAttribute('data-status')).toBe('running')
    expect(container.querySelector('[data-testid="import-pbs-material-progress-flight-fetch"]')?.textContent).toBe('Done1s')
    expect(container.querySelector('[data-testid="import-pbs-material-progress-roster-fetch"]')?.getAttribute('data-status')).toBe('waiting')
    expect(container.querySelector('[data-testid="import-pbs-material-progress"]')?.textContent).not.toContain('2,400')
    expect(container.querySelector('[data-testid="import-pbs-material-progress"]')?.textContent).not.toContain('2,398')
    expect(container.querySelector('[data-testid="import-pbs-material-progress"]')?.textContent).not.toContain('1,200')
    expect(container.textContent).toContain('Waiting')
  })

  it('keeps the dialog open after complete and renders material statistics', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <ImportPbsDialog
          open
          onOpenChange={vi.fn()}
          onConfirm={vi.fn()}
          completedElapsedMs={630_366}
          result={{
            rosterPeriodId: 6,
            rosterPeriod: '2026-06',
            startDt: '2026-06-01',
            endDt: '2026-06-30',
            results: [],
            materialStats: [{
              material: 'crew',
              status: 'success',
              added: 12,
              updated: 204,
              deleted: 0,
              success: 216,
              failed: 0,
              skipped: 0,
              rejected: 0,
              recordsIn: 216,
              recordsOut: 216,
              warnings: [],
              errors: [],
              timings: {
                fetchMs: 1000,
                transformMs: 1200,
                enqueueMs: 800,
                databaseMs: 3000,
                totalMs: 6000,
              },
            }],
          }}
        />,
      )
    })

    expect(container.querySelector('[data-testid="import-pbs-result"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="import-pbs-result-elapsed"]')?.textContent).toContain('10m 30s')
    expect(container.querySelector('[data-testid="import-pbs-result-crew"]')?.textContent).toContain('Crew')
    expect(container.querySelector('[data-testid="import-pbs-result-crew"]')?.textContent).toContain('12')
    expect(container.querySelector('[data-testid="import-pbs-result-crew"]')?.textContent).toContain('204')
    expect(container.querySelector('[data-testid="import-pbs-result-crew-fetch-ms"]')?.textContent).toContain('1s')
    expect(container.querySelector('[data-testid="import-pbs-result-crew-transform-ms"]')?.textContent).toContain('2s')
    expect(container.querySelector('[data-testid="import-pbs-result-crew-db-ms"]')?.textContent).toContain('3s')
    expect(container.querySelector('[data-testid="import-pbs-result-crew-total-ms"]')?.textContent).toContain('6s')
    expect(container.textContent).toContain('Done')
  })

  it('renders import failure details when material statistics include errors', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <ImportPbsDialog
          open
          onOpenChange={vi.fn()}
          onConfirm={vi.fn()}
          result={{
            rosterPeriodId: 8,
            rosterPeriod: '2026-08',
            startDt: '2026-08-01',
            endDt: '2026-08-31',
            results: [],
            materialStats: [{
              material: 'pairing',
              status: 'partial',
              added: 10,
              updated: 2,
              deleted: 0,
              success: 12,
              failed: 4,
              skipped: 0,
              rejected: 0,
              recordsIn: 14,
              recordsOut: 14,
              warnings: [
                'Missing optional duty node',
                'pairing 118557 not found, skipping crew 417',
                'pairing 118513 not found, skipping crew 784',
                'pairing 118352 not found, skipping crew 1488',
              ],
              errors: [
                { id: '117168', reason: 'missing start/end time' },
                { id: '117169', reason: 'DB constraint failed' },
                { id: '117170', reason: 'missing pairing segment' },
                { id: '117171', reason: 'invalid crew assignment' },
              ],
              timings: {
                fetchMs: 1000,
                transformMs: 200,
                enqueueMs: 50,
                databaseMs: 3000,
                totalMs: 4250,
              },
            }],
          }}
        />,
      )
    })

    const details = container.querySelector('[data-testid="import-pbs-result-pairing-details"]')
    expect(details?.textContent).toContain('117168: missing start/end time')
    expect(details?.textContent).toContain('117169: DB constraint failed')
    expect(details?.textContent).toContain('117170: missing pairing segment')
    expect(details?.textContent).toContain('117171: invalid crew assignment')
    expect(details?.textContent).toContain('Missing optional duty node')
    expect(details?.textContent).toContain('pairing 118557 not found, skipping crew 417')
    expect(details?.textContent).toContain('pairing 118513 not found, skipping crew 784')
    expect(details?.textContent).toContain('pairing 118352 not found, skipping crew 1488')
    expect(details?.textContent).not.toContain('more details not shown')
    expect(details?.className).toContain('overflow-y-auto')
  })

  it('uses final material timings for progress stage cell seconds after completion', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    let progress = applyImportProgressEvent(createInitialProgress([]), {
      type: 'started',
      importId: 'import-uuid-1',
      rosterPeriodId: 6,
      rosterPeriod: '2026-06',
      startDt: '2026-06-01',
      endDt: '2026-06-30',
      materials: ['crew'],
      at: '2026-07-16T00:00:00.000Z',
    })
    progress = applyImportProgressEvent(progress, {
      type: 'stage',
      importId: 'import-uuid-1',
      material: 'crew',
      stage: 'fetch',
      status: 'done',
      at: '2026-07-16T00:00:02.000Z',
    })
    progress = applyImportProgressEvent(progress, {
      type: 'stage',
      importId: 'import-uuid-1',
      material: 'crew',
      stage: 'transform',
      status: 'done',
      at: '2026-07-16T00:00:05.000Z',
    })
    progress = applyImportProgressEvent(progress, {
      type: 'stage',
      importId: 'import-uuid-1',
      material: 'crew',
      stage: 'enqueue',
      status: 'done',
      at: '2026-07-16T00:00:06.000Z',
    })
    progress = applyImportProgressEvent(progress, {
      type: 'stage',
      importId: 'import-uuid-1',
      material: 'crew',
      stage: 'write',
      status: 'done',
      at: '2026-07-16T00:00:10.000Z',
    })

    await act(async () => {
      root.render(
        <ImportPbsDialog
          open
          onOpenChange={vi.fn()}
          onConfirm={vi.fn()}
          progress={progress}
          result={{
            rosterPeriodId: 6,
            rosterPeriod: '2026-06',
            startDt: '2026-06-01',
            endDt: '2026-06-30',
            results: [],
            materialStats: [{
              material: 'crew',
              status: 'success',
              added: 0,
              updated: 0,
              deleted: 0,
              success: 1,
              failed: 0,
              skipped: 0,
              rejected: 0,
              recordsIn: 1,
              recordsOut: 1,
              warnings: [],
              errors: [],
              timings: {
                fetchMs: 2400,
                transformMs: 3100,
                enqueueMs: 1200,
                databaseMs: 4700,
                totalMs: 11_400,
              },
            }],
          }}
        />,
      )
    })

    expect(container.querySelector('[data-testid="import-pbs-material-progress-crew-fetch"]')?.textContent).toBe('Done2s')
    expect(container.querySelector('[data-testid="import-pbs-material-progress-crew-transform"]')?.textContent).toBe('Done4s')
    expect(container.querySelector('[data-testid="import-pbs-material-progress-crew-write"]')?.textContent).toBe('Done5s')
  })
})
