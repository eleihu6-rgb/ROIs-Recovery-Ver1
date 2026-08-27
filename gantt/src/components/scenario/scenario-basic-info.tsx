// gantt/src/components/scenario/scenario-basic-info.tsx
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Lock } from 'lucide-react'
import { Input, Select, SelectTrigger, SelectContent, SelectItem, SelectValue, Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@rois/ui'
import type { PoFilterParams, ScenarioDetail, ScenarioParameterSaveRequest, ScenarioType } from '@/types'
import { useScenarioStore } from '@/stores/scenario-store'
import { legalityApi } from '@/services/legality-api'
import { scenarioApi } from '@/services/scenario-api'
import { useRosterPeriodStore } from '@/stores/roster-period-store'
import { RpSelect } from '@/components/common/rp-select'
import type { LegalityRulesetSummary } from '@/types/legality'
import { normalizeCrewDivision, normalizePoFilterParams } from '@/utils/scenario-filter-params'
import { MultiSelect } from './multi-select'
import { useBaseOptions } from './filter/use-base-options'
import { useDivisionOptions } from './filter/use-division-options'
import { ScenarioParametersDialog, summarizeParameters, type ParameterSummary } from './scenario-parameters-dialog'
import type { PairingScenarioOption } from '@/services/scenario-api'
import { DEFAULT_CHIP } from '@/components/rule/rule-badge-styles'

interface ScenarioBasicInfoProps {
  detail: ScenarioDetail
  disabled?: boolean
}

const TYPE_BADGE: Record<ScenarioType, string> = {
  PO: 'bg-blue-500/15 text-blue-400',
  RO: 'bg-[#DFF7EA] text-[#065F46]',
  TO: 'bg-violet-500/15 text-violet-400',
}

const RULESET_TYPE_ORDER: Record<string, number> = { LIVE: 0, RO: 1, PBS: 2 }
const ruleSetTypeStyle = (type: string, division: string): string => {
  if (!type.includes(',')) {
    if (type === 'LIVE' && division === 'P') return DEFAULT_CHIP
    if (type === 'LIVE') return 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400'
    if (type === 'RO') return 'bg-[#DFF7EA] text-[#065F46]'
    if (type === 'PBS') return 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
  }
  return 'bg-muted text-muted-foreground'
}

const toDateInputValue = (v: string | null | undefined): string => (v ?? '').slice(0, 10)

const Field = ({ label, children }: { label: string; children: ReactNode }): ReactNode => (
  <div className="flex items-center gap-2 min-w-0">
    <span className="w-20 shrink-0 text-xs text-muted-foreground">{label}</span>
    <div className="min-w-0 flex-1">{children}</div>
  </div>
)

export const ScenarioBasicInfo = ({ detail, disabled = false }: ScenarioBasicInfoProps): ReactNode => {
  const patchDraft = useScenarioStore((s) => s.patchDraft)
  const [rulesets, setRulesets] = useState<LegalityRulesetSummary[]>([])
  const [rulesetsLoading, setRulesetsLoading] = useState(false)
  const [pairingScenarioOptions, setPairingScenarioOptions] = useState<PairingScenarioOption[]>([])
  const periods = useRosterPeriodStore((s) => s.items)
  const [parametersOpen, setParametersOpen] = useState(false)
  const [parameterSummary, setParameterSummary] = useState('Using defaults')
  const [parameterDraft, setParameterDraft] = useState<ScenarioParameterSaveRequest['items'] | undefined>(undefined)
  const { options: divisionOptions, loading: divisionLoading } = useDivisionOptions()
  const { options: baseOptions, loading: basesLoading } = useBaseOptions()
  const canSeedDraftDefaults = detail.status === 'DRAFT'
  const divisionValue = normalizeCrewDivision(detail.division)
  const sortedRulesets = useMemo(() => [...rulesets].sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1
    return (RULESET_TYPE_ORDER[a.type] ?? 99) - (RULESET_TYPE_ORDER[b.type] ?? 99)
      || a.division.localeCompare(b.division)
      || a.name.localeCompare(b.name)
  }), [rulesets])
  const visibleRulesets = useMemo(
    () => detail.fileType === 'RO'
      ? sortedRulesets.filter((r) => r.division === divisionValue && r.type.split(',').includes('RO') && r.enabled)
      : sortedRulesets,
    [detail.fileType, divisionValue, sortedRulesets],
  )
  const selectedRuleset = visibleRulesets.find((r) => r.id === detail.rulesetId)

  useEffect(() => {
    let active = true
    setRulesetsLoading(true)
    legalityApi
      .listRulesets()
      .then((rows) => {
        if (active) setRulesets(rows.filter((r) => r.category === 'RULE'))
      })
      .catch(() => {
        if (active) setRulesets([])
      })
      .finally(() => {
        if (active) setRulesetsLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    scenarioApi
      .listPairingScenarioOptions()
      .then((rows) => {
        if (active) setPairingScenarioOptions(rows)
      })
      .catch(() => {
        if (active) setPairingScenarioOptions([])
      })
    return () => {
      active = false
    }
  }, [])

  // Rule sets are owned by division. Align the ruleset selection whenever the user
  // CHANGES the division (enabled sets preferred for LIVE/PBS, then RO). Deliberately
  // does NOT run on load: a freshly opened or duplicated scenario must open clean —
  // silently rewriting its ruleset on mount and marking the copy dirty is what made
  // duplicated scenarios show an unsaved state.
  const alignedDivisionRef = useRef<{ id: number; division: string } | null>(null)
  useEffect(() => {
    if (!canSeedDraftDefaults) return
    if (detail.fileType !== 'RO' && detail.fileType !== 'TO') return
    // First run for a scenario (mount or scenario switch): record the loaded division
    // and leave the ruleset untouched.
    const aligned = alignedDivisionRef.current
    if (!aligned || aligned.id !== detail.id) {
      alignedDivisionRef.current = { id: detail.id, division: divisionValue }
      return
    }
    // rulesets load asynchronously; only align when the division actually changed
    // since this scenario was loaded (a user action), not on every re-render.
    if (aligned.division === divisionValue) return
    alignedDivisionRef.current = { id: detail.id, division: divisionValue }
    const candidates = rulesets.filter((r) => r.division === divisionValue &&
      (detail.fileType === 'RO' ? r.type.split(',').includes('RO') && r.enabled : true))
    if (candidates.length === 0) return
    const current = rulesets.find((r) => r.id === detail.rulesetId)
    if (current?.division === divisionValue &&
      (detail.fileType !== 'RO' || (current.type.split(',').includes('RO') && current.enabled))) return
    const next = candidates.find((r) => r.enabled && (r.type.split(',').includes('RO') || r.type.split(',').includes('PBS')))
      ?? candidates.find((r) => r.type.split(',').includes('RO') || r.type.split(',').includes('PBS'))
      ?? candidates[0]
    patchDraft({ rulesetId: next.id })
  }, [canSeedDraftDefaults, detail.fileType, detail.rulesetId, detail.id, detail.division, divisionValue, rulesets, patchDraft])

  // Ensure PO filter_params has bases[] + flight facets (division is workset-owned).
  useEffect(() => {
    if (!canSeedDraftDefaults) return
    if (detail.fileType !== 'PO') return
    const raw = (detail.filterParams ?? {}) as Record<string, unknown>
    const hasBasesArray = Array.isArray(raw.bases)
    const hasFlightShape = Array.isArray(raw.flightNos)
    if (hasBasesArray && hasFlightShape) return
    patchDraft({ filterParams: normalizePoFilterParams(raw) })
  }, [canSeedDraftDefaults, detail.fileType, detail.filterParams, patchDraft])

  // Seed default division on draft when missing (workset-owned field).
  useEffect(() => {
    if (!canSeedDraftDefaults) return
    const d = detail.division
    if (d && d !== 'ALL' && d !== '*' && d !== 'A') return
    patchDraft({ division: 'P' })
  }, [canSeedDraftDefaults, detail.division, patchDraft])

  const showPoScope = detail.fileType === 'PO'
  const showRoFields = detail.fileType === 'RO' || detail.fileType === 'TO'
  const showDivision = showPoScope || showRoFields
  const poFilter: PoFilterParams = normalizePoFilterParams(detail.filterParams)
  const selectedPeriod = useMemo(
    () => periods.find((period) =>
      period.rpStart === toDateInputValue(detail.strDtLoc)
      && period.rpEnd === toDateInputValue(detail.endDtLoc),
    ) ?? null,
    [periods, detail.strDtLoc, detail.endDtLoc],
  )
  const selectedPeriodId = selectedPeriod ? String(selectedPeriod.id) : ''

  const patchPoFilter = (partial: Partial<PoFilterParams>): void => {
    const next = normalizePoFilterParams({ ...poFilter, ...partial })
    patchDraft({ filterParams: next })
  }

  const patchDivision = (v: string): void => {
    patchDraft({ division: normalizeCrewDivision(v) })
  }

  const patchRosterPeriod = (periodId: string): void => {
    const period = periods.find((item) => String(item.id) === periodId)
    if (!period) return
    patchDraft({ strDtLoc: period.rpStart, endDtLoc: period.rpEnd })
  }

  const updateParameterSummary = (summary: ParameterSummary): void => {
    setParameterSummary(summary.changedLabels.length > 0
      ? `Changed: ${summary.changedLabels.join(', ')}`
      : 'Using defaults')
  }

  const updateParameterDraft = (items: ScenarioParameterSaveRequest['items'], summary: ParameterSummary): void => {
    setParameterDraft(items)
    patchDraft({ algorithmParameters: items })
    updateParameterSummary(summary)
  }

  useEffect(() => {
    if (!showRoFields) return
    let active = true
    scenarioApi.getParameters(detail.id)
      .then((result) => {
        if (active) updateParameterSummary(summarizeParameters(result.items))
      })
      .catch(() => {
        // The parameter dialog still reports a precise status when opened.
      })
    return () => {
      active = false
    }
  }, [detail.id, showRoFields])

  useEffect(() => {
    setParameterDraft(undefined)
    setParameterSummary('Using defaults')
  }, [detail.id])

  return (
    <div className="@container min-w-0 border-b border-border p-4 @[820px]:border-b-0">
      <div className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
        Basic Info
      </div>
      {/* Cap width so the Date / Model / Rule controls stay compact instead of
          stretching the full column width. */}
      <div className="flex max-w-xl flex-col gap-2.5 text-xs">
        <Field label="Type">
          <span
            data-testid="scenario-type-badge"
            className={`inline-block rounded px-2 py-0.5 text-2xs font-semibold ${TYPE_BADGE[detail.fileType]}`}
          >
            {detail.fileType}
          </span>
        </Field>

        <Field label="RP Date">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <RpSelect
              testId="scenario-rp-period"
              value={selectedPeriodId}
              onValueChange={patchRosterPeriod}
              disabled={disabled}
              className="h-6 min-w-[5.25rem] flex-[1_1_5.25rem] text-xs"
            />
            <Input
              data-testid="scenario-start-date"
              className="h-6 min-w-[5.75rem] flex-[1_1_5.75rem] max-w-full text-xs"
              value={selectedPeriod?.rpStart ?? toDateInputValue(detail.strDtLoc)}
              readOnly
              disabled
            />
            <Input
              data-testid="scenario-end-date"
              className="h-6 min-w-[5.75rem] flex-[1_1_5.75rem] max-w-full text-xs"
              value={selectedPeriod?.rpEnd ?? toDateInputValue(detail.endDtLoc)}
              readOnly
              disabled
            />
          </div>
        </Field>

        {/* Division (workset.division) — PO + RO/TO Basic Info */}
        {showDivision && (
          <Field label="Division">
            <Select
              value={divisionValue}
              onValueChange={patchDivision}
              disabled={disabled || divisionLoading}
            >
              <SelectTrigger
                data-testid={showPoScope ? 'scenario-po-division' : 'scenario-crew-division'}
                className="h-6 min-w-0 flex-1 text-xs"
              >
                <SelectValue placeholder={divisionLoading ? 'Loading…' : 'Select division'} />
              </SelectTrigger>
              <SelectContent>
                {divisionOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}

        {/* PO Bases (optional multi-select) — still filter_params.bases */}
        {showPoScope && (
          <Field label="Bases">
            <MultiSelect
              testId="scenario-po-bases"
              options={baseOptions}
              selected={poFilter.bases}
              onChange={(bases) => patchPoFilter({ bases })}
              placeholder="All bases"
              loading={basesLoading}
              disabled={disabled}
              className="text-xs"
            />
          </Field>
        )}

        {/* RO/TO-specific criteria */}
        {showRoFields && (
          <>
            <Field label="Rule Set">
              <Select
                value={detail.rulesetId != null ? String(detail.rulesetId) : ''}
                onValueChange={(v) => patchDraft({ rulesetId: v ? Number(v) : null })}
                disabled={disabled || rulesetsLoading}
              >
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <SelectTrigger data-testid="scenario-ruleset-select" className="h-6 min-w-0 flex-1 text-xs">
                        <SelectValue placeholder={rulesetsLoading ? 'Loading...' : 'Select rule set'} />
                      </SelectTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-sm text-xs">
                      {selectedRuleset
                        ? `${selectedRuleset.type} / ${selectedRuleset.division} · #${selectedRuleset.id} ${selectedRuleset.name}`
                        : 'Select rule set'}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <SelectContent>
                  {visibleRulesets.map((r) => (
                    <SelectItem
                      key={r.id}
                      value={String(r.id)}
                      className={`text-xs ${r.enabled ? '' : 'text-muted-foreground opacity-60'}`}
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className={`shrink-0 rounded px-1 py-0.5 text-3xs font-semibold ${ruleSetTypeStyle(r.type, r.division)}`}>
                          {r.type} / {r.division}
                        </span>
                        <span className="truncate">#{r.id} {r.name}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Pairing Sc.">
              <Select
                value={detail.pairingScenarioId != null ? String(detail.pairingScenarioId) : ''}
                onValueChange={(v) => patchDraft({ pairingScenarioId: v ? Number(v) : null })}
                disabled={disabled}
              >
                <SelectTrigger data-testid="scenario-pairing-sc" className="h-6 min-w-0 flex-1 text-xs">
                  <SelectValue placeholder="Select pairing scenario" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0" className="text-xs">
                    0 - Live
                  </SelectItem>
                  {pairingScenarioOptions.map((option) => (
                    <SelectItem key={option.id} value={String(option.id)} className="text-xs">
                      {option.id} - {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="flex flex-col gap-1 min-w-0">
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      data-testid="scenario-parameters-open"
                      className="flex h-7 w-full items-center gap-1.5 rounded border border-border bg-background px-2 text-xs text-foreground hover:bg-accent/60"
                      onClick={() => setParametersOpen(true)}
                    >
                      {disabled && <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />}
                      <span className="shrink-0">Algorithm Parameters</span>
                      <span className="min-w-0 flex-1 truncate text-right text-muted-foreground">{parameterSummary}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-sm text-xs">{parameterSummary}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <ScenarioParametersDialog
                scenarioId={detail.id}
                scenarioDetail={detail}
                division={divisionValue}
                draftItems={parameterDraft}
                open={parametersOpen}
                disabled={disabled}
                onOpenChange={setParametersOpen}
                onDraftChange={updateParameterDraft}
                onLoaded={updateParameterSummary}
              />
            </div>

            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-xs text-muted-foreground">Comment</span>
              <textarea
                className="w-full resize-none rounded border border-border bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                rows={2}
                placeholder="Optional notes..."
                value={detail.comments ?? ''}
                disabled={disabled}
                onChange={(e) => patchDraft({ comments: e.target.value || null })}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
