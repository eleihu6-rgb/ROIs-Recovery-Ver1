import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Asterisk, Calculator, ChartNoAxesCombined, FileText, UserRound, UsersRound } from 'lucide-react'
import { Button } from '@rois/ui'
import { costLibraryApi } from '@/services/cost-library-api'
import type { CalculatorCode, CostResult, CostRevision } from '@/types/cost-library'

const inputClass = 'mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground'

const fields: Record<CalculatorCode, [string, string][]> = {
  quantity: [['quantity', 'Billable quantity']],
  fixed: [['quantity', 'Qualifying event (0 or 1)']],
  minimum: [['quantity', 'Billable quantity']],
  guarantee: [
    ['beforeCredit', 'Monthly credit before'],
    ['addedCredit', 'Additional credit (hours)'],
    ['removedCredit', 'Removed unprotected credit'],
    ['hourlyRate', 'Crew hourly rate (optional)'],
  ],
  standby: [
    ['reportAt', 'Report (UTC)'],
    ['departureAt', 'Pairing departure (UTC)'],
    ['pairingCredit', 'Pairing credit (hours)'],
    ['beforeCredit', 'Monthly credit before'],
    ['baselineStandbyCredit', 'Standby credit in baseline'],
    ['removedCredit', 'Removed unprotected credit'],
    ['hourlyRate', 'Crew hourly rate (optional)'],
  ],
  bands: [
    ['delayBefore', 'Delay before (minutes)'],
    ['delayAfter', 'Delay after (minutes)'],
  ],
  booking: [],
}

const crewKeys = new Set(['beforeCredit', 'removedCredit', 'hourlyRate', 'baselineStandbyCredit'])
const optionalKeys = new Set(['removedCredit', 'hourlyRate', 'baselineStandbyCredit'])

const duration = (hours: number): string => {
  const minutes = Math.round(Math.abs(hours) * 60)
  return `${hours < 0 ? '-' : ''}${Math.floor(minutes / 60).toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}`
}

const valueOf = (result: CostResult, label: string): number | null => {
  const value = result.breakdown.find((line) => line.label === label)?.value
  return value !== undefined && Number.isFinite(Number(value)) ? Number(value) : null
}

const money = (amount: number, currency: string): string => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)

const amountText = (result: CostResult): string => (
  result.status === 'priced' && result.amount !== null ? money(result.amount, result.currencyCode) : result.status === 'disabled' ? 'Disabled' : 'Unpriced'
)

const numberParam = (revision: CostRevision, key: string): number | null => (
  typeof revision.paramsJson[key] === 'number' ? revision.paramsJson[key] : null
)

const formulaExplanation = (revision: CostRevision, guarantee: number | null): string => {
  const rate = revision.unitPrice !== null ? money(revision.unitPrice, revision.currencyCode) : null
  switch (revision.calculatorCode) {
    case 'quantity':
      return `The system multiplies the billable quantity by the configured unit price${rate ? ` of ${rate}` : ''}.`
    case 'fixed':
      return `The system treats the qualifying event as 0 or 1, then multiplies that value by the configured fixed price${rate ? ` of ${rate}` : ''}.`
    case 'minimum': {
      const minimumQuantity = numberParam(revision, 'minimumQuantity')
      return `The system charges the larger of the entered quantity and the configured minimum quantity${minimumQuantity !== null ? ` (${minimumQuantity})` : ''}, then multiplies it by the unit price${rate ? ` of ${rate}` : ''}. A zero quantity remains zero.`
    }
    case 'guarantee':
      return `The system compares monthly credit before and after the added assignment against the GH floor${guarantee !== null ? ` (${duration(guarantee)})` : ''}. Only credit above the floor creates incremental cash, using the configured overtime tiers and optional crew hourly-rate override.`
    case 'standby': {
      const factor = numberParam(revision, 'creditFactor')
      const cutoff = numberParam(revision, 'departureCutoffMinutes')
      return `The system first converts airport standby into credit: report-to-departure time minus the cutoff${cutoff !== null ? ` (${cutoff} minutes)` : ''}, multiplied by the standby factor${factor !== null ? ` (${factor})` : ''}. It adds that standby credit to pairing credit, then prices any GH overage through the linked GH policy.`
    }
    case 'bands': {
      const threshold = numberParam(revision, 'threshold')
      const upperRate = numberParam(revision, 'upperRate')
      return `The system prices only the delay increase. Minutes up to the first threshold${threshold !== null ? ` (${threshold})` : ''} use the base unit price${rate ? ` of ${rate}` : ''}; minutes above that threshold use the upper rate${upperRate !== null ? ` of ${upperRate}` : ''}.`
    }
    case 'booking': {
      const refund = numberParam(revision, 'refundAmount')
      const fee = numberParam(revision, 'changeFee')
      return `The system calculates the net booking impact as new booking price minus refund${refund !== null ? ` (${money(refund, revision.currencyCode)})` : ''}, plus change fee${fee !== null ? ` (${money(fee, revision.currencyCode)})` : ''}.`
    }
    default:
      return 'The system applies the saved revision formula and parameters to the entered workbench values.'
  }
}

const templateInputs = (calculatorCode: CalculatorCode): { comparison: boolean; inputs: Record<string, string>; crewB: Record<string, string> } => {
  switch (calculatorCode) {
    case 'guarantee':
      return { comparison: true, inputs: { addedCredit: '6.75', beforeCredit: '84' }, crewB: { beforeCredit: '70' } }
    case 'standby':
      return {
        comparison: true,
        inputs: { reportAt: '2026-09-10T07:00', departureAt: '2026-09-10T10:00', pairingCredit: '5.75', beforeCredit: '84' },
        crewB: { beforeCredit: '70' },
      }
    case 'fixed':
      return { comparison: false, inputs: { quantity: '1' }, crewB: {} }
    case 'bands':
      return { comparison: false, inputs: { delayBefore: '120', delayAfter: '140' }, crewB: {} }
    case 'booking':
      return { comparison: false, inputs: {}, crewB: {} }
    case 'minimum':
    case 'quantity':
    default:
      return { comparison: false, inputs: { quantity: '2' }, crewB: {} }
  }
}

const convertInputs = (source: Record<string, string>): Record<string, string | number> => (
  Object.fromEntries(
    Object.entries(source)
      .filter(([, value]) => value !== '')
      .map(([key, value]) => [key, key.endsWith('At') ? new Date(`${value}Z`).toISOString() : Number(value)]),
  )
)

interface Props {
  instanceId: number
  revision: CostRevision
  guarantees: CostRevision[]
  canCalculate: boolean
  parameterKey: string
  demoMode?: boolean
}

export const CostWorkbench = ({ instanceId, revision, guarantees, canCalculate, parameterKey: _parameterKey, demoMode = false }: Props): React.JSX.Element => {
  const [comparison, setComparison] = useState(false)
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [crewB, setCrewB] = useState<Record<string, string>>({})
  const [results, setResults] = useState<CostResult[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [missingFields, setMissingFields] = useState<Set<string>>(new Set())
  const inputRefs = useRef(new Map<string, HTMLInputElement>())
  const requestVersion = useRef(0)
  const demoSeedKey = `${demoMode ? 'demo' : 'entry'}:${revision.id}`
  const creditCalculator = revision.calculatorCode === 'guarantee' || revision.calculatorCode === 'standby'
  const policy = revision.calculatorCode === 'guarantee' ? revision : guarantees.find((item) => item.id === revision.ghPolicyRevisionId)
  const guarantee = typeof policy?.paramsJson.guaranteeHours === 'number' ? policy.paramsJson.guaranteeHours : null
  const standby = revision.calculatorCode === 'standby'

  const clear = useCallback((): void => {
    requestVersion.current += 1
    setResults([])
    setError('')
    setBusy(false)
  }, [])

  const fieldId = useCallback((key: string, crew?: 'A' | 'B'): string => `cost-input-${instanceId}-${crew ?? 'single'}-${key}`, [instanceId])

  const calculateFrom = useCallback(async (sourceInputs: Record<string, string>, sourceCrewB: Record<string, string>, sourceComparison: boolean, focusMissing: boolean): Promise<void> => {
    clear()
    const missing = new Set<string>()
    const check = (key: string, crew?: 'A' | 'B'): void => {
      if (!optionalKeys.has(key) && !((crew === 'B' ? sourceCrewB : sourceInputs)[key] ?? '').trim()) {
        missing.add(fieldId(key, crew))
      }
    }
    const activeFields = fields[revision.calculatorCode]
    if (sourceComparison && creditCalculator) {
      activeFields.filter(([key]) => !crewKeys.has(key)).forEach(([key]) => check(key))
      ;(['A', 'B'] as const).forEach((crew) => {
        activeFields.filter(([key]) => crewKeys.has(key)).forEach(([key]) => check(key, crew))
      })
    } else {
      activeFields.forEach(([key]) => check(key))
    }
    setMissingFields(missing)
    if (missing.size > 0) {
      setError('Complete the highlighted required fields.')
      if (focusMissing) inputRefs.current.get(missing.values().next().value!)?.focus()
      return
    }
    const version = requestVersion.current
    setBusy(true)
    try {
      const second = { ...Object.fromEntries(Object.entries(sourceInputs).filter(([key]) => !crewKeys.has(key))), ...sourceCrewB }
      const next = await Promise.all((sourceComparison && creditCalculator ? [sourceInputs, second] : [sourceInputs]).map((source) => (
        costLibraryApi.calculate(revision.id, convertInputs(source))
      )))
      if (version === requestVersion.current) setResults(next)
    } catch (cause) {
      if (version === requestVersion.current) setError(cause instanceof Error ? cause.message : 'Calculation failed')
    } finally {
      if (version === requestVersion.current) setBusy(false)
    }
  }, [clear, creditCalculator, fieldId, revision.calculatorCode, revision.id])

  useEffect(() => {
    clear()
    setMissingFields(new Set())
    if (demoMode) {
      const demo = templateInputs(revision.calculatorCode)
      setComparison(demo.comparison)
      setInputs(demo.inputs)
      setCrewB(demo.crewB)
      if (canCalculate) void calculateFrom(demo.inputs, demo.crewB, demo.comparison, false)
    } else {
      setComparison(false)
      setInputs({})
      setCrewB({})
    }
  }, [calculateFrom, canCalculate, clear, demoMode, demoSeedKey, revision.calculatorCode])

  useEffect(() => () => { requestVersion.current += 1 }, [])

  const changeInput = (key: string, value: string, second: boolean, id: string): void => {
    clear()
    if (value.trim() !== '') {
      setMissingFields((current) => {
        const next = new Set(current)
        next.delete(id)
        return next
      })
    }
    if (second) setCrewB((current) => ({ ...current, [key]: value }))
    else setInputs((current) => ({ ...current, [key]: value }))
  }

  const latestFormValues = (root: HTMLElement | null): { sourceInputs: Record<string, string>; sourceCrewB: Record<string, string> } => {
    const sourceInputs = { ...inputs }
    const sourceCrewB = { ...crewB }
    const inputValue = (id: string, fallback: string): string => (
      root?.querySelector<HTMLInputElement>(`[id="${id}"]`)?.value ?? inputRefs.current.get(id)?.value ?? fallback
    )
    if (comparison && creditCalculator) {
      sharedFields.forEach(([key]) => {
        const id = fieldId(key)
        sourceInputs[key] = inputValue(id, sourceInputs[key] ?? '')
      })
      crewFields.forEach(([key]) => {
        const crewAId = fieldId(key, 'A')
        const crewBId = fieldId(key, 'B')
        sourceInputs[key] = inputValue(crewAId, sourceInputs[key] ?? '')
        sourceCrewB[key] = inputValue(crewBId, sourceCrewB[key] ?? '')
      })
    } else {
      activeFields.forEach(([key]) => {
        const id = fieldId(key)
        sourceInputs[key] = inputValue(id, sourceInputs[key] ?? '')
      })
    }
    return { sourceInputs, sourceCrewB }
  }

  const calculate = async (button: HTMLButtonElement): Promise<void> => {
    const current = latestFormValues(button.closest('section'))
    setInputs(current.sourceInputs)
    setCrewB(current.sourceCrewB)
    await calculateFrom(current.sourceInputs, current.sourceCrewB, comparison, true)
  }

  const renderField = ([key, label]: [string, string], crew?: 'A' | 'B'): React.JSX.Element => {
    const id = fieldId(key, crew)
    const required = !optionalKeys.has(key)
    const invalid = missingFields.has(id)
    return (
      <label key={key} htmlFor={id} className="min-w-0 text-xs text-muted-foreground">
        <span className="inline-flex max-w-full items-start gap-1">
          <span className="min-w-0">{label}{key.endsWith('Credit') && !label.includes('(hours)') ? ' (hours)' : ''}</span>
          {required && <span title="Required" className="mt-0.5 inline-flex shrink-0 text-destructive"><Asterisk aria-hidden="true" className="h-3 w-3" /></span>}
        </span>
        <input
          id={id}
          ref={(node) => {
            if (node) inputRefs.current.set(id, node)
            else inputRefs.current.delete(id)
          }}
          aria-label={crew ? `Crew ${crew} ${label}` : label}
          required={required}
          aria-required={required}
          aria-invalid={invalid}
          aria-describedby={invalid ? `${id}-error` : undefined}
          className={inputClass}
          style={invalid ? { borderColor: 'hsl(var(--destructive))', outline: '2px solid hsl(var(--destructive))', outlineOffset: '2px' } : undefined}
          type={key.endsWith('At') ? 'datetime-local' : 'number'}
          min="0"
          step="any"
          value={(crew === 'B' ? crewB : inputs)[key] ?? ''}
          onChange={(event) => changeInput(key, event.target.value, crew === 'B', id)}
        />
        {invalid && <span id={`${id}-error`} className="mt-1.5 block text-xs text-destructive">Enter {label.toLowerCase()}.</span>}
      </label>
    )
  }

  const maxCredit = Math.max(1, guarantee ?? 0, ...results.flatMap((result) => [valueOf(result, 'Before credit') ?? 0, valueOf(result, 'After credit') ?? 0]))
  const scale = Math.ceil(maxCredit * 1.15)
  const comparable = results.length === 2 && results.every((result) => result.status === 'priced' && result.amount !== null) && results[0].currencyCode === results[1].currencyCode
  const eligibleHours = standby && inputs.reportAt && inputs.departureAt && typeof revision.paramsJson.departureCutoffMinutes === 'number'
    ? Math.max(0, (Date.parse(`${inputs.departureAt}Z`) - Date.parse(`${inputs.reportAt}Z`)) / 3600000 - revision.paramsJson.departureCutoffMinutes / 60)
    : null
  const activeFields = fields[revision.calculatorCode]
  const sharedFields = activeFields.filter(([key]) => !crewKeys.has(key))
  const crewFields = activeFields.filter(([key]) => crewKeys.has(key))
  const resultLabels = useMemo(() => [...new Set(results.flatMap((result) => result.breakdown.map((line) => line.label)))], [results])

  return (
    <section className="mt-4 border-t border-border pt-4" data-testid={`cost-workbench-${instanceId}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Calculator className="h-4 w-4 shrink-0 text-primary" />
          <h3 className="text-sm font-medium">Calculation Workbench</h3>
          <span className="text-2xs text-muted-foreground">Saved revision {revision.revisionNo}</span>
          {demoMode && <span className="rounded border border-border bg-background px-1.5 py-0.5 text-2xs text-muted-foreground">Default case</span>}
        </div>
        {creditCalculator && (
          <div role="group" aria-label="Calculation mode" className="inline-flex max-w-full flex-wrap rounded-md border border-border bg-background p-0.5">
            {([false, true] as const).map((mode) => {
              const Icon = mode ? UsersRound : UserRound
              return (
                <Button key={String(mode)} size="sm" variant={comparison === mode ? 'secondary' : 'ghost'} aria-pressed={comparison === mode} onClick={() => { clear(); setMissingFields(new Set()); setComparison(mode) }}>
                  <Icon className="mr-1.5 h-3.5 w-3.5" />{mode ? 'Compare crews' : 'Single crew'}
                </Button>
              )
            })}
          </div>
        )}
      </div>

      {creditCalculator && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-2xs text-muted-foreground">
          <span>Credit input: hours</span>
          <span className="rounded border border-border bg-background px-1.5 py-0.5">Results: HH:MM</span>
          {standby && <span className="rounded border border-border bg-background px-1.5 py-0.5">UTC</span>}
          {policy && <span>GH {duration(guarantee ?? 0)} / policy revision {policy.revisionNo}</span>}
        </div>
      )}

      {comparison && creditCalculator ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{sharedFields.map((field) => renderField(field))}</div>
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {(['A', 'B'] as const).map((crew) => (
              <fieldset key={crew} className="min-w-0 border-t border-border pt-3">
                <legend className="px-1 text-xs font-medium">Crew {crew}</legend>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{crewFields.map((field) => renderField(field, crew))}</div>
              </fieldset>
            ))}
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{activeFields.map((field) => renderField(field))}</div>
      )}

      <Button className="mt-3" size="sm" variant="outline" disabled={busy || !canCalculate} data-testid={`cost-calculate-${instanceId}`} onClick={(event) => void calculate(event.currentTarget)}>
        <Calculator className="mr-1.5 h-3.5 w-3.5" />{busy ? 'Calculating...' : comparison && creditCalculator ? 'Compare costs' : 'Calculate'}
      </Button>

      {error && <p role="alert" className="mt-3 text-xs text-destructive">{error}</p>}

      {results.length > 0 && (
        <div aria-live="polite" data-testid={`cost-result-${instanceId}`} className="mt-4 space-y-4 text-xs">
          <p className="border-l-2 pl-3 font-mono text-xs text-muted-foreground" style={{ borderLeftColor: 'hsl(var(--primary))' }}>{results[0].formula}</p>
          {standby && (
            <dl className="grid grid-cols-1 gap-3 border-y border-border py-3 sm:grid-cols-3">
              {[
                ['Eligible standby', eligibleHours],
                ['Standby credit', valueOf(results[0], 'Standby credit')],
                ['Total assignment credit', valueOf(results[0], 'Assignment credit')],
              ].map(([label, hours]) => (
                <div key={String(label)}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="mt-1 font-mono text-lg font-medium">{typeof hours === 'number' && Number.isFinite(hours) ? duration(hours) : 'Unavailable'}</dd>
                </div>
              ))}
            </dl>
          )}
          {creditCalculator && (
            <div data-testid={`cost-credit-chart-${instanceId}`}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h4 className="flex items-center gap-2 font-medium"><ChartNoAxesCombined className="h-4 w-4 text-primary" />Monthly credit</h4>
                <span className="text-2xs text-muted-foreground">{guarantee === null ? 'Pinned GH policy unavailable' : `GH ${duration(guarantee)}`} / HH:MM</span>
              </div>
              <div className={`grid grid-cols-1 gap-5 ${results.length === 2 ? 'lg:grid-cols-2' : ''}`}>
                {results.map((result, index) => {
                  const before = valueOf(result, 'Before credit')
                  const after = valueOf(result, 'After credit')
                  return (
                    <div key={index} className="min-w-0" data-testid={`cost-credit-${index === 0 ? 'a' : 'b'}-${instanceId}`}>
                      <p className="mb-2 font-medium">{comparison ? `Crew ${index === 0 ? 'A' : 'B'}` : 'Crew'} credit movement</p>
                      {[
                        ['Before', before, 'bg-muted-foreground/30'],
                        ['After', after, 'bg-primary/70'],
                      ].map(([label, credit, tone]) => (
                        <div key={String(label)} className="mb-2 grid grid-cols-[3.5rem_minmax(0,1fr)_3.5rem] items-center gap-2">
                          <span className="text-muted-foreground">{label}</span>
                          <div className="relative h-3 overflow-hidden rounded-sm bg-muted">
                            <div className={`h-full rounded-sm ${tone}`} style={{ width: typeof credit === 'number' ? `${Math.min(100, (credit / scale) * 100)}%` : '0%' }} />
                            {guarantee !== null && <span data-testid={`cost-gh-marker-${index}-${String(label).toLowerCase()}-${instanceId}`} className="absolute top-0 h-full border-l-2" style={{ left: `${Math.min(100, (guarantee / scale) * 100)}%`, borderLeftColor: 'hsl(var(--chart-4))' }} />}
                          </div>
                          <span className="text-right font-mono tabular-nums">{typeof credit === 'number' ? duration(credit) : 'N/A'}</span>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
              <div className="flex justify-between pl-14 pr-16 text-2xs text-muted-foreground"><span>00:00</span><span>{duration(scale)}</span></div>
            </div>
          )}
          <div className={`grid grid-cols-1 gap-3 border-y border-border px-3 py-3 ${results.every((result) => result.status === 'priced') ? 'bg-chart-2/10' : 'bg-muted'} ${results.length === 2 ? 'sm:grid-cols-3' : ''}`}>
            {results.map((result, index) => (
              <div key={index}>
                <p className="text-muted-foreground">{comparison && creditCalculator ? `Crew ${index === 0 ? 'A' : 'B'} incremental cash` : creditCalculator ? 'Incremental cash' : 'Calculated cost'}</p>
                <p className={`mt-1 text-xl font-medium tabular-nums ${result.status === 'priced' ? 'text-foreground' : 'text-muted-foreground'}`}>{amountText(result)}</p>
              </div>
            ))}
            {results.length === 2 && (
              <div data-testid={`cost-cash-difference-${instanceId}`}>
                <p className="text-muted-foreground">Cash difference</p>
                <p className="mt-1 text-xl font-medium tabular-nums">{comparable ? money(Math.abs(results[0].amount! - results[1].amount!), results[0].currencyCode) : 'Not comparable'}</p>
                {comparable && <p className="mt-1 text-2xs text-muted-foreground">{results[0].amount === results[1].amount ? 'Equal incremental cost' : `Crew ${results[0].amount! < results[1].amount! ? 'A' : 'B'} has lower incremental cost`}</p>}
              </div>
            )}
          </div>
          {resultLabels.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-2 font-medium">Breakdown</th>
                    {results.map((_, index) => <th key={index} className="py-2 pl-3 text-right font-medium">{comparison && creditCalculator ? `Crew ${index === 0 ? 'A' : 'B'}` : 'Value'}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {resultLabels.map((label) => (
                    <tr key={label} className="border-b border-border/60">
                      <th className="py-2 font-normal text-muted-foreground">{label}{creditCalculator ? ' (HH:MM)' : ''}</th>
                      {results.map((result, index) => {
                        const value = valueOf(result, label)
                        return <td key={index} className="py-2 pl-3 text-right font-mono tabular-nums">{creditCalculator && value !== null ? duration(value) : result.breakdown.find((line) => line.label === label)?.value ?? 'N/A'}</td>
                      })}
                    </tr>
                  ))}
                  {standby && (
                    <tr className="border-b border-border/60">
                      <th className="py-2 font-normal text-muted-foreground">Baseline standby credit replaced (HH:MM)</th>
                      {results.map((_, index) => <td key={index} className="py-2 pl-3 text-right font-mono tabular-nums">{duration(Number((index === 0 ? inputs : crewB).baselineStandbyCredit || 0))}</td>)}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <div className="border-l-2 bg-muted/30 px-3 py-2" style={{ borderLeftColor: 'hsl(var(--primary))' }} data-testid={`cost-formula-explanation-${instanceId}`}>
            <h4 className="flex items-center gap-2 text-xs font-medium">
              <FileText className="h-3.5 w-3.5 text-primary" />
              Calculation logic
            </h4>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{formulaExplanation(revision, guarantee)}</p>
          </div>
        </div>
      )}
    </section>
  )
}
