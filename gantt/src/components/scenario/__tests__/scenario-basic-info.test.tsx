import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ScenarioBasicInfo } from '../scenario-basic-info'
import { legalityApi } from '@/services/legality-api'
import { scenarioApi } from '@/services/scenario-api'

const patchDraft = vi.fn()

vi.mock('@/stores/scenario-store', () => ({
  useScenarioStore: (selector: (state: { patchDraft: typeof patchDraft }) => unknown) => selector({ patchDraft }),
}))

vi.mock('@/services/legality-api', () => ({
  legalityApi: {
    listRulesets: vi.fn(async () => []),
  },
}))

vi.mock('@/services/scenario-api', () => ({
  scenarioApi: {
    listWorksets: vi.fn(async () => []),
    listPairingScenarioOptions: vi.fn(async () => []),
    getParameters: vi.fn(async () => ({ items: [], summary: { templateCount: 0, configuredCount: 0 } })),
  },
}))

vi.mock('@/stores/roster-period-store', () => {
  const items = [
    { id: 6, rosterPeriod: '2026-06', name: '2026-06', rpStart: '2026-06-01', rpEnd: '2026-06-30', isCurrent: true },
    { id: 7, rosterPeriod: '2026-07', name: '2026-07', rpStart: '2026-07-01', rpEnd: '2026-07-31', isCurrent: false },
  ]
  return {
    useRosterPeriodStore: (selector: (s: unknown) => unknown) =>
      selector({ items, loading: false, loadRosterPeriods: () => Promise.resolve() }),
  }
})

vi.mock('@/stores/reference-store', () => ({
  useReferenceStore: (selector: (state: {
    bases: Array<{ base: string; name: string | null }>
    divisions: Array<{ division: string; description: string | null }>
    loading: boolean
    load: () => Promise<void>
  }) => unknown) =>
    selector({
      bases: [{ base: 'YEG', name: 'Edmonton' }],
      divisions: [
        { division: 'P', description: 'Pilot' },
        { division: 'C', description: 'Cabin' },
      ],
      loading: false,
      load: async () => {},
    }),
}))

vi.mock('@rois/ui', () => ({
  Input: ({ children, ...props }: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props}>{children}</input>,
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => <div data-value={value}>{children}</div>,
  SelectTrigger: ({ children, 'data-testid': testId }: { children: React.ReactNode; 'data-testid'?: string }) => (
    <div data-testid={testId}>{children}</div>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuCheckboxItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  cn: (...args: Array<string | false | null | undefined>) => args.filter(Boolean).join(' '),
}))

vi.mock('../scenario-parameters-dialog', () => ({
  ScenarioParametersDialog: () => null,
}))

const roDetail = {
  id: 701,
  name: 'RO Scenario',
  fileType: 'RO',
  status: 'DRAFT',
  strDtLoc: '2026-06-01',
  endDtLoc: '2026-06-30',
  leadinLive: 0,
  worksetId: 1,
  rulesetId: null,
  pairingScenarioId: null,
  division: 'P',
  filterParams: null,
  comments: null,
}

const poDetail = {
  ...roDetail,
  id: 702,
  name: 'PO Scenario',
  fileType: 'PO',
  division: 'C',
  filterParams: { bases: ['YEG'] },
}

const render = async (detail: typeof roDetail, disabled = false): Promise<HTMLDivElement> => {
  const container = document.createElement('div')
  const root = createRoot(container)
  await act(async () => {
    root.render(<ScenarioBasicInfo detail={detail as never} disabled={disabled} />)
  })
  return container
}

describe('ScenarioBasicInfo', () => {
  beforeEach(() => {
    patchDraft.mockClear()
    vi.mocked(legalityApi.listRulesets).mockResolvedValue([])
    vi.mocked(scenarioApi.listPairingScenarioOptions).mockResolvedValue([])
  })

  it('does not expose Lead-in live as a user option', async () => {
    const container = await render(roDetail)

    const typeBadge = container.querySelector('[data-testid="scenario-type-badge"]')
    expect(typeBadge?.textContent).toBe('RO')
    expect(typeBadge?.className).toContain('bg-[#DFF7EA]')
    expect(typeBadge?.className).toContain('text-[#065F46]')
    expect(typeBadge?.className).toContain('font-semibold')
    expect(typeBadge?.className).not.toContain('border')
    expect(container.textContent).not.toContain('Source')
    expect(container.textContent).not.toContain('Lead-in live')
    expect(container.textContent).toContain('RP Date')
    expect(container.querySelector('[data-testid="scenario-rp-period"]')).toBeTruthy()
    expect(container.querySelector('input[type="checkbox"]')).toBeNull()
    expect(container.querySelector('[data-testid="scenario-po-division"]')).toBeNull()
  })

  it('shows roster period start and end as read-only RP Date fields', async () => {
    const container = await render(roDetail)

    await act(async () => {
      await Promise.resolve()
    })

    const start = container.querySelector('[data-testid="scenario-start-date"]') as HTMLInputElement | null
    const end = container.querySelector('[data-testid="scenario-end-date"]') as HTMLInputElement | null
    expect(container.textContent).toContain('2026-06')
    expect(start?.value).toBe('2026-06-01')
    expect(start?.readOnly).toBe(true)
    expect(end?.value).toBe('2026-06-30')
    expect(end?.readOnly).toBe(true)
  })

  it('shows Division and Bases for PO scenarios', async () => {
    const container = await render(poDetail as typeof roDetail)

    expect(container.querySelector('[data-testid="scenario-type-badge"]')?.textContent).toBe('PO')
    expect(container.querySelector('[data-testid="scenario-po-division"]')).toBeTruthy()
    const bases = container.querySelector('[data-testid="scenario-po-bases"]') as HTMLElement | null
    expect(bases).toBeTruthy()
    expect(bases?.className).toContain('h-auto')
    expect(bases?.className).toContain('min-h-7')
    expect(bases?.className).not.toContain('h-6')
    expect(container.textContent).toContain('Division')
    expect(container.textContent).toContain('Bases')
  })

  it('shows Division in Basic Info for RO scenarios', async () => {
    const container = await render(roDetail)

    expect(container.querySelector('[data-testid="scenario-type-badge"]')?.textContent).toBe('RO')
    expect(container.querySelector('[data-testid="scenario-crew-division"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="scenario-po-bases"]')).toBeNull()
  })

  it('shows PO scenario id, not workset id, in Pairing Sc. options', async () => {
    vi.mocked(scenarioApi.listPairingScenarioOptions).mockResolvedValue([
      {
        id: 692,
        worksetId: 721,
        name: 'Imported PO',
        status: 'DRAFT',
        strDtLoc: '2026-06-01',
        endDtLoc: '2026-06-30',
      },
    ])

    const container = await render(roDetail)

    await act(async () => {
      await Promise.resolve()
    })

    expect(container.textContent).toContain('692 - Imported PO')
    expect(container.textContent).not.toContain('721 - Imported PO')
    expect(container.querySelector('[data-value="692"]')).toBeTruthy()
  })

  it('seeds missing editable draft defaults only while scenario is Draft', async () => {
    await render({ ...roDetail, division: null })

    expect(patchDraft).toHaveBeenCalledWith({ division: 'P' })
  })

  it('does not mark Published scenarios dirty by seeding defaults', async () => {
    vi.mocked(legalityApi.listRulesets).mockResolvedValue([
      { id: 103, name: 'Default rules', category: 'RULE', isDefault: true },
    ] as never)

    await render({
      ...roDetail,
      status: 'PUBLISHED',
      division: null,
      rulesetId: null,
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(patchDraft).not.toHaveBeenCalled()
  })

  it('keeps the algorithm parameters button enabled for Published scenarios (view-only, lock icon)', async () => {
    const container = await render({ ...roDetail, status: 'PUBLISHED' }, true)

    const parametersButton = container.querySelector('[data-testid="scenario-parameters-open"]') as HTMLButtonElement | null
    expect(parametersButton?.disabled).toBe(false)
    expect(container.querySelector('svg.lucide-lock')).toBeTruthy()
  })

  it('shows no lock icon on the algorithm parameters button while editable', async () => {
    const container = await render(roDetail)

    expect(container.querySelector('svg.lucide-lock')).toBeNull()
  })

  it('does not realign a mismatched ruleset on load (freshly duplicated scenario stays clean)', async () => {
    vi.mocked(legalityApi.listRulesets).mockResolvedValue([
      { id: 103, name: 'RO Solver Ruleset FD', category: 'RULE', type: 'RO', division: 'P', enabled: true },
      { id: 637, name: 'RO Solver Ruleset CC', category: 'RULE', type: 'RO', division: 'C', enabled: true },
    ] as never)

    // A duplicated copy: Cabin (C) draft that still carries the Pilot (P) ruleset 103.
    // Opening it must NOT silently rewrite the ruleset and mark the copy dirty.
    await render({ ...roDetail, division: 'C', rulesetId: 103 })
    await act(async () => {
      await Promise.resolve()
    })

    expect(patchDraft).not.toHaveBeenCalled()
  })

  it('realigns the ruleset only when the division actually changes', async () => {
    vi.mocked(legalityApi.listRulesets).mockResolvedValue([
      { id: 103, name: 'RO Solver Ruleset FD', category: 'RULE', type: 'RO', division: 'P', enabled: true },
      { id: 637, name: 'RO Solver Ruleset CC', category: 'RULE', type: 'RO', division: 'C', enabled: true },
    ] as never)

    const container = document.createElement('div')
    const root = createRoot(container)
    await act(async () => {
      root.render(<ScenarioBasicInfo detail={{ ...roDetail, division: 'C', rulesetId: 637 } as never} />)
    })
    await act(async () => {
      await Promise.resolve()
    })
    // Loaded clean (division C + ruleset 637 match) — no seeding on mount.
    expect(patchDraft).not.toHaveBeenCalled()

    // User changes Division from C to P → the ruleset realigns to the P ruleset.
    await act(async () => {
      root.render(<ScenarioBasicInfo detail={{ ...roDetail, division: 'P', rulesetId: 637 } as never} />)
    })
    expect(patchDraft).toHaveBeenCalledWith({ rulesetId: 103 })
  })

  it('an RO scenario lists an enabled multi-type (LIVE,PBS,RO) set in the rule-set picker', async () => {
    vi.mocked(legalityApi.listRulesets).mockResolvedValue([
      { id: 752, name: 'Unified FD', category: 'RULE', type: 'LIVE,PBS,RO', division: 'P', enabled: true },
    ] as never)

    const container = await render(roDetail)
    await act(async () => {
      await Promise.resolve()
    })

    const item = container.querySelector('[data-value="752"]')
    expect(item).toBeTruthy()
    expect(item?.textContent).toContain('LIVE,PBS,RO')
  })

  it('an RO scenario excludes an enabled set that does not claim RO', async () => {
    vi.mocked(legalityApi.listRulesets).mockResolvedValue([
      { id: 754, name: 'Portal FD', category: 'RULE', type: 'LIVE,PBS', division: 'P', enabled: true },
    ] as never)

    const container = await render(roDetail)
    await act(async () => {
      await Promise.resolve()
    })

    expect(container.querySelector('[data-value="754"]')).toBeNull()
  })
})
