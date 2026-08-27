import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'

import { RoCrewFilter } from '../ro-crew-filter'
import { RoPairingFilter } from '../ro-pairing-filter'

vi.mock('@/stores/reference-store', () => ({
  useReferenceStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
    bases: [{ id: 1, base: 'YYZ', name: 'Toronto', filiale: 'F8', isPrimeDisplayBase: 1, displayOrder: 1 }],
    fleets: [
      { id: 1, fleet: '7M8', description: 'Boeing 737 MAX 8', fleetGrp: '737', acType: 'B38M', displayOrder: 1 },
      { id: 2, fleet: '320', description: 'Airbus A320', fleetGrp: '320', acType: 'A320', displayOrder: 2 },
    ],
    ranks: [
      { id: 1, rank: 'CA', division: 'P', description: 'Captain', displayOrder: 1, isCrewRank: 1 },
      { id: 2, rank: 'FA', division: 'C', description: 'Flight Attendant', displayOrder: 2, isCrewRank: 1 },
    ],
    pairingTypes: [
      { assignment: 'FLT', description: 'Flight' },
      { assignment: 'PRAM', description: 'Reserve AM' },
    ],
    pairingAssignmentGroups: [
      { assignmentGroup: 'FLT', description: 'Flight' },
      { assignmentGroup: 'SBY', description: 'Standby' },
    ],
    loading: false,
    load: vi.fn(async () => undefined),
  }),
}))

vi.mock('@rois/ui', () => ({
  cn: (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' '),
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => <div data-value={value}>{children}</div>,
  SelectTrigger: ({ children, 'data-testid': testId }: { children: React.ReactNode; 'data-testid'?: string }) => <div data-testid={testId}>{children}</div>,
  SelectValue: () => null,
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  EnglishDatePicker: ({
    ariaLabel,
    value,
    onValueChange,
    testId,
  }: {
    ariaLabel: string
    value: string
    onValueChange: (value: string) => void
    testId?: string
  }) => (
    <input
      aria-label={ariaLabel}
      data-testid={testId}
      type="text"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    />
  ),
}))

vi.mock('../../multi-select', () => ({
  MultiSelect: ({
    testId,
    options,
    selected,
    placeholder,
  }: {
    testId?: string
    options: { value: string; label: string }[]
    selected: string[]
    placeholder?: string
  }) => (
    <div data-testid={testId}>
      <span>{selected.length > 0 ? selected.join(',') : placeholder}</span>
      {options.map((option) => (
        <span key={option.value} data-option-value={option.value}>{option.label}</span>
      ))}
    </div>
  ),
}))

const render = async (node: React.ReactNode): Promise<HTMLDivElement> => {
  const container = document.createElement('div')
  const root = createRoot(container)
  await act(async () => {
    root.render(<>{node}</>)
  })
  return container
}

describe('Scenario scope filters', () => {
  it('uses fleet table options for crew fleet qualification scope', async () => {
    const container = await render(
      <RoCrewFilter
        crew={{
          bases: [],
          ranks: [],
          fleets: [],
          seniority: { min: null, max: null },
          birthday: { from: '', to: '' },
          status: 'ACTIVE',
        }}
        division="P"
        onChange={() => undefined}
      />,
    )

    const fleetSelect = container.querySelector('[data-testid="scenario-crew-fleets"]')
    expect(fleetSelect?.textContent).toContain('7M8')
    expect(fleetSelect?.textContent).toContain('320')
    expect(fleetSelect?.textContent).not.toContain('Boeing 737 MAX 8')
    expect(fleetSelect?.textContent).not.toContain('Airbus A320')
    expect(container.querySelector('[data-testid="scenario-crew-fleets-add"]')).toBeNull()
  })

  it('uses fleet table options for pairing scope and hides Pairing Source', async () => {
    const container = await render(
      <RoPairingFilter
        pairing={{
          bases: [],
          ranks: [],
          fleets: [],
          types: [],
          duration: { min: null, max: null },
          sources: ['MANUAL', 'OPT', 'IMPORT'],
        }}
        division="P"
        onChange={() => undefined}
      />,
    )

    const fleetSelect = container.querySelector('[data-testid="scenario-pairing-fleets"]')
    expect(fleetSelect?.textContent).toContain('7M8')
    expect(fleetSelect?.textContent).toContain('320')
    expect(fleetSelect?.textContent).not.toContain('Boeing 737 MAX 8')
    expect(fleetSelect?.textContent).not.toContain('Airbus A320')
    expect(container.textContent).not.toContain('Pairing Source')
    expect(container.textContent).not.toContain('Manual')
    expect(container.textContent).not.toContain('Optimized')
    expect(container.textContent).not.toContain('Imported')
    expect(container.textContent).toContain('Duration (days)')
    const typeSelect = container.querySelector('[data-testid="scenario-pairing-types"]')
    expect(typeSelect?.textContent).toContain('PRAM')
    expect(typeSelect?.textContent).not.toContain('SBY')
  })
})
