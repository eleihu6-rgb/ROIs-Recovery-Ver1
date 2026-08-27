import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'

import { scenarioApi } from '@/services/scenario-api'
import { ScenarioParametersDialog, formatReservePriorityDefault } from '../scenario-parameters-dialog'
import { __scenarioParameterEditorTest } from '../scenario-parameter-editors'

vi.mock('@rois/ui', () => ({
  AppDialog: ({
    open,
    title,
    children,
    footer,
    'data-testid': testId,
  }: {
    open: boolean
    title: string
    children: React.ReactNode
    footer?: React.ReactNode
    'data-testid'?: string
  }) => open ? <div data-testid={testId}><h1>{title}</h1>{children}{footer}</div> : null,
  Button: ({
    children,
    onClick,
    disabled,
    type,
    ...props
  }: {
    children: React.ReactNode
    onClick?: () => void
    disabled?: boolean
    type?: 'button' | 'submit' | 'reset'
    [key: string]: unknown
  }) => <button type={type} disabled={disabled} onClick={onClick} {...props}>{children}</button>,
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))

vi.mock('@/services/scenario-api', () => ({
  scenarioApi: {
    getParameters: vi.fn(),
  },
}))

describe('ScenarioParametersDialog', () => {
  it('matches Scenario pairing Type against assignment code, not assignmentGroup', () => {
    const filter = {
      bases: [],
      ranks: [],
      fleets: [],
      types: ['PRAM'],
      duration: { min: null, max: null },
      sources: [],
    }
    const reservePairing = {
      pairing_id: '200',
      label: 'PRAM200',
      assignment: 'PRAM',
      type: 'PRAM',
      type_label: 'PRAM',
      carry_in: 'Open',
      base: 'YVR',
      division: 'P',
      start: '2026-05-02',
      days: '1',
      airports: [],
      ranks: ['CA'],
    }
    const assignmentCodeOnly = {
      ...reservePairing,
      pairing_id: '300',
      label: 'F300',
      assignment: 'RES',
      type: 'RES',
      type_label: 'RES',
    }

    expect(__scenarioParameterEditorTest.pairingMatchesScenarioFilter(reservePairing, filter, 'P')).toBe(true)
    expect(__scenarioParameterEditorTest.pairingMatchesScenarioFilter(assignmentCodeOnly, filter, 'P')).toBe(false)
    expect(__scenarioParameterEditorTest.pairingMatchesRuleFilter(reservePairing, { types: ['PRAM'] })).toBe(true)
    expect(__scenarioParameterEditorTest.pairingMatchesRuleFilter(assignmentCodeOnly, { types: ['PRAM'] })).toBe(false)
  })

  it('edits OBJ and LIST values and saves them', async () => {
    vi.mocked(scenarioApi.getParameters).mockResolvedValue({
      items: [
        {
          code: 'solver_limits',
          type: 'OBJ',
          description: 'Limits',
          idx: 10,
          schema: { maxIterations: { type: 'number', label: 'Max Iterations' } },
          defaultValue: { maxIterations: 100 },
          value: { maxIterations: 100 },
          hasScenarioValue: false,
        },
        {
          code: 'solver_csv_overrides',
          type: 'LIST',
          description: 'CSV',
          idx: 20,
          schema: { format: 'csv', label: 'CSV Overrides' },
          defaultValue: { csv: '' },
          value: { csv: 'a,b' },
          hasScenarioValue: false,
        },
      ],
      summary: { templateCount: 2, configuredCount: 0 },
    })
    const container = document.createElement('div')
    const root = createRoot(container)
    const onDraftChange = vi.fn()

    await act(async () => {
      root.render(<ScenarioParametersDialog scenarioId={42} open onOpenChange={() => undefined} onDraftChange={onDraftChange} disabled={false} />)
    })

    const numberInput = container.querySelector<HTMLInputElement>('input[aria-label="Max Iterations"]')
    expect(numberInput).not.toBeNull()

    await act(async () => {
      const inputSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      inputSetter?.call(numberInput, '120')
      numberInput!.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      ;[...container.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent === 'CSV')
        ?.click()
    })
    const csvInput = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="CSV Overrides"]')
    expect(csvInput).not.toBeNull()
    await act(async () => {
      const textAreaSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
      textAreaSetter?.call(csvInput, 'x,y')
      csvInput!.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[data-action="done"]')?.click()
    })

    expect(onDraftChange).toHaveBeenCalledWith([
        { code: 'solver_limits', value: { maxIterations: 120 } },
        { code: 'solver_csv_overrides', value: { csv: 'x,y' } },
      ], expect.objectContaining({ changedCodes: ['solver_limits', 'solver_csv_overrides'] }))

    await act(async () => {
      root.unmount()
    })
  })

  it('Reserve Priority shows the algorithm default line and stacks weekdays vertically Mon→Sun', async () => {
    vi.mocked(scenarioApi.getParameters).mockResolvedValue({
      items: [
        {
          code: 'reserve_weekday_priority',
          type: 'OBJ',
          description: 'Reserve Priority',
          idx: 30,
          schema: {},
          defaultValue: { mon: 2, tue: 3, wed: 3, thu: 1, fri: 1, sat: 1, sun: 2 },
          value: { mon: 2, tue: 3, wed: 3, thu: 1, fri: 1, sat: 1, sun: 2 },
          hasScenarioValue: false,
        },
      ],
      summary: { templateCount: 1, configuredCount: 0 },
    })
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(<ScenarioParametersDialog scenarioId={42} open onOpenChange={() => undefined} disabled={false} />)
    })

    expect(container.textContent).toContain('Algorithm default: Thu/Fri/Sat 1, Mon/Sun 2, Tue/Wed 3.')

    const labels = [...container.querySelectorAll<HTMLElement>('span')]
      .map((span) => span.textContent?.trim())
      .filter((text) => text && ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].includes(text))
    expect(labels).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'])

    // Vertical layout: the weekday inputs live inside a flex-col container.
    const priorityInput = container.querySelector<HTMLInputElement>('input[aria-label="Monday reserve priority"]')
    expect(priorityInput).not.toBeNull()
    const col = priorityInput?.closest('div[class*="flex-col"]')
    expect(col).not.toBeNull()

    await act(async () => { root.unmount() })
  })

  it('renders read-only when disabled: Close-only footer, inputs disabled, no draft commit', async () => {
    vi.mocked(scenarioApi.getParameters).mockResolvedValue({
      items: [
        {
          code: 'solver_limits',
          type: 'OBJ',
          description: 'Limits',
          idx: 10,
          schema: { maxIterations: { type: 'number', label: 'Max Iterations' } },
          defaultValue: { maxIterations: 100 },
          value: { maxIterations: 100 },
          hasScenarioValue: false,
        },
      ],
      summary: { templateCount: 1, configuredCount: 0 },
    })
    const container = document.createElement('div')
    const root = createRoot(container)
    const onDraftChange = vi.fn()
    const onOpenChange = vi.fn()

    await act(async () => {
      root.render(<ScenarioParametersDialog scenarioId={42} open onOpenChange={onOpenChange} onDraftChange={onDraftChange} disabled />)
    })

    const numberInput = container.querySelector<HTMLInputElement>('input[aria-label="Max Iterations"]')
    expect(numberInput).not.toBeNull()
    expect(numberInput?.disabled).toBe(true)

    // No Done button in read-only mode — Close replaces Cancel + Done.
    expect(container.querySelector<HTMLButtonElement>('button[data-action="done"]')).toBeNull()

    const closeButton = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === 'Close')
    expect(closeButton).toBeTruthy()

    await act(async () => {
      closeButton?.click()
    })

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onDraftChange).not.toHaveBeenCalled()

    await act(async () => { root.unmount() })
  })
})

describe('formatReservePriorityDefault', () => {
  it('groups weekdays by priority, chronological within group, groups ascending', () => {
    expect(formatReservePriorityDefault({ mon: 2, tue: 3, wed: 3, thu: 1, fri: 1, sat: 1, sun: 2 }))
      .toBe('Algorithm default: Thu/Fri/Sat 1, Mon/Sun 2, Tue/Wed 3.')
    expect(formatReservePriorityDefault({ mon: 3, tue: 1, wed: 1, thu: 3, fri: 2, sat: 2, sun: 2 }))
      .toBe('Algorithm default: Tue/Wed 1, Fri/Sat/Sun 2, Mon/Thu 3.')
  })
})
