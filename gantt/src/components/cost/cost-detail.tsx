import { useEffect, useState } from 'react'
import { Plus, Save, SlidersHorizontal, Trash2 } from 'lucide-react'
import { Button } from '@rois/ui'
import { costLibraryApi } from '@/services/cost-library-api'
import type { CalculatorCode, CostInstance, CostRevision, CostType, RevisionDraft } from '@/types/cost-library'
import { CostWorkbench } from './cost-workbench'

export const costInputClass = 'mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs'
const labels: Record<string, string> = { guaranteeHours: 'Guarantee floor (hours)', creditFactor: 'Standby credit factor', departureCutoffMinutes: 'Departure cutoff (minutes)', minimumQuantity: 'Minimum billable quantity', threshold: 'First band through (minutes)', upperRate: 'Rate above threshold', originalAmount: 'Original booking amount', refundAmount: 'Refund amount', changeFee: 'Change fee' }
const parameterKeys: Record<CalculatorCode, string[]> = { quantity: [], fixed: [], minimum: ['minimumQuantity'], guarantee: ['guaranteeHours'], standby: ['creditFactor', 'departureCutoffMinutes'], bands: ['threshold', 'upperRate'], booking: ['originalAmount', 'refundAmount', 'changeFee'] }
const errorText = (error: unknown): string => error instanceof Error ? error.message : 'Request failed'
interface Props { instance: CostInstance; revision: CostRevision; type: CostType; guarantees: CostRevision[]; defaults: CostRevision[]; canEdit: boolean; templateMode?: boolean; onSaved: () => Promise<void> }
export const CostDetail = ({ instance, revision, type, guarantees, defaults, canEdit, templateMode = false, onSaved }: Props): React.JSX.Element => {
  const [draft, setDraft] = useState<RevisionDraft>({ ...revision, expectedRevisionNo: instance.latestRevision.revisionNo })
  const [error, setError] = useState('')
  const [savedRevision, setSavedRevision] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [tierBoundary, setTierBoundary] = useState('')
  const [applicability, setApplicability] = useState(JSON.stringify(revision.applicabilityJson))
  useEffect(() => { setDraft({ ...revision, expectedRevisionNo: instance.latestRevision.revisionNo }); setApplicability(JSON.stringify(revision.applicabilityJson)) }, [revision, instance.latestRevision.revisionNo])
  const tiers = (draft.paramsJson.tiers ?? []) as { upToHours: number | null; multiplier: number | null }[]
  const param = (key: string, value: unknown): void => setDraft((d) => ({ ...d, paramsJson: { ...d.paramsJson, [key]: value } }))
  const save = async (): Promise<void> => {
    setBusy(true); setError('')
    try {
      if (parameterKeys[draft.calculatorCode].some((key) => typeof draft.paramsJson[key] !== 'number')) throw new Error('Enter all numeric parameters before saving')
      if (draft.calculatorCode === 'guarantee' && tiers.some((tier) => tier.multiplier === null)) throw new Error('Enter every tier multiplier')
      const parsed: unknown = JSON.parse(applicability)
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('Applicability must be an object')
      const { calculatorCode, effectiveFrom, effectiveTo, currencyCode, unitCode, unitPrice, paramsJson, reference, ghPolicyRevisionId, expectedRevisionNo } = draft
      const saved = await costLibraryApi.saveRevision(instance.id, { calculatorCode, effectiveFrom, effectiveTo, currencyCode, unitCode, unitPrice, paramsJson, reference, ghPolicyRevisionId, expectedRevisionNo, applicabilityJson: parsed as Record<string, unknown> })
      await onSaved()
      setSavedRevision(saved.revisionNo)
    } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }
  const allowed = (type.parameterSchemaJson.calculatorCodes ?? [type.calculatorCode]) as string[]
  return <div className="border-t border-border bg-muted/30 p-4" data-testid={`cost-detail-${instance.id}`}>
    {savedRevision !== null && <p role="status" className="mb-2 text-xs text-muted-foreground">Revision {savedRevision} saved. Existing set memberships retain their pinned revision.</p>}
    <div className="mb-3 flex flex-wrap items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-primary" /><h3 className="text-sm font-medium">Parameters</h3><span className="text-2xs text-muted-foreground">Displayed revision {revision.revisionNo} / Latest {instance.latestRevision.revisionNo}</span></div>
    <fieldset disabled={!canEdit || busy} className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
      <label className="text-xs">Unit price ({draft.currencyCode})<input disabled={draft.calculatorCode === 'standby'} aria-label="Unit price" className={costInputClass} type="number" min="0" step="any" value={draft.unitPrice ?? ''} onChange={(e) => setDraft({ ...draft, unitPrice: e.target.value === '' ? null : Number(e.target.value) })} /></label>
      <label className="text-xs">Calculation logic<select aria-label="Calculation logic" className={costInputClass} value={draft.calculatorCode} onChange={(e) => { const code = e.target.value as CalculatorCode; const source = defaults.find((r) => r.calculatorCode === code); setDraft({ ...draft, calculatorCode: code, paramsJson: source?.paramsJson ?? {}, ghPolicyRevisionId: code === 'standby' ? source?.ghPolicyRevisionId ?? null : null, unitPrice: code === 'standby' ? null : draft.unitPrice }) }}>{allowed.map((code) => <option key={code} value={code}>{code}</option>)}</select></label>
      <label className="text-xs">Currency<input aria-label="Currency" className={costInputClass} value={draft.currencyCode} onChange={(e) => setDraft({ ...draft, currencyCode: e.target.value })} /></label>
      <label className="text-xs">Unit<input aria-label="Unit" className={costInputClass} value={draft.unitCode} onChange={(e) => setDraft({ ...draft, unitCode: e.target.value })} /></label>
      <label className="text-xs">Effective from<input aria-label="Effective from" className={costInputClass} type="datetime-local" value={draft.effectiveFrom.slice(0, 16)} onChange={(e) => setDraft({ ...draft, effectiveFrom: e.target.value ? `${e.target.value}:00Z` : '' })} /></label>
      <label className="text-xs">Effective to (UTC)<input aria-label="Effective to" className={costInputClass} type="datetime-local" value={draft.effectiveTo?.slice(0, 16) ?? ''} onChange={(e) => setDraft({ ...draft, effectiveTo: e.target.value ? `${e.target.value}:00Z` : null })} /></label>
      {parameterKeys[draft.calculatorCode].map((key) => <label key={key} className="text-xs">{labels[key] ?? key}<input aria-label={labels[key] ?? key} type="number" min="0" step="any" className={costInputClass} value={typeof draft.paramsJson[key] === 'number' ? Number(draft.paramsJson[key]) : ''} onChange={(e) => param(key, e.target.value === '' ? null : Number(e.target.value))} /></label>)}
      {draft.calculatorCode === 'standby' && <label className="text-xs">GH policy revision<select aria-label="GH policy revision" className={costInputClass} value={draft.ghPolicyRevisionId ?? ''} onChange={(e) => setDraft({ ...draft, ghPolicyRevisionId: Number(e.target.value) || null })}><option value="">Select policy</option>{guarantees.map((r) => <option key={r.id} value={r.id}>Instance {r.costInstanceId}, revision {r.revisionNo}</option>)}</select></label>}
      <label className="text-xs">Reference<input aria-label="Reference" className={costInputClass} value={draft.reference} onChange={(e) => setDraft({ ...draft, reference: e.target.value })} /></label>
      <label className="text-xs">Applicability<input aria-label="Applicability" className={costInputClass} value={applicability} onChange={(e) => setApplicability(e.target.value)} /></label>
    </fieldset>
    {draft.calculatorCode === 'guarantee' && <fieldset disabled={!canEdit || busy} className="mt-4 max-w-2xl">
      <legend className="mb-2 text-xs font-medium">Overtime tiers</legend>
      <div className="overflow-x-auto"><table className="w-full table-fixed text-left text-xs">
        <thead><tr className="border-b border-border text-muted-foreground"><th className="w-1/4 pb-2 pr-3 font-medium">Credit above</th><th className="pb-2 pr-3 font-medium">Through hours<span className="block text-2xs font-normal">Blank = unlimited</span></th><th className="w-1/4 pb-2 pr-2 font-medium">Multiplier</th><th className="w-9"><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{tiers.map((tier, index) => <tr key={index} className="border-b border-border/60">
          <td className="py-2 pr-3 font-mono tabular-nums">{index ? tiers[index - 1].upToHours : String(draft.paramsJson.guaranteeHours)}</td>
          <td className="py-2 pr-3"><input aria-label={`Tier ${index + 1} upper hours`} className={costInputClass} type="number" min="0" step="any" value={tier.upToHours ?? ''} onChange={(e) => param('tiers', tiers.map((t, i) => i === index ? { ...t, upToHours: e.target.value === '' ? null : Number(e.target.value) } : t))} /></td>
          <td className="py-2 pr-2"><input aria-label={`Tier ${index + 1} multiplier`} className={costInputClass} type="number" min="0" step="any" value={tier.multiplier ?? ''} onChange={(e) => param('tiers', tiers.map((t, i) => i === index ? { ...t, multiplier: e.target.value === '' ? null : Number(e.target.value) } : t))} /></td>
          <td className="py-2"><button title="Delete tier" aria-label={`Delete tier ${index + 1}`} disabled={tiers.length < 2} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40" onClick={() => param('tiers', tiers.filter((_, i) => i !== index).map((t, i, all) => i === all.length - 1 ? { ...t, upToHours: null } : t))}><Trash2 className="h-3.5 w-3.5" /></button></td>
        </tr>)}</tbody>
      </table></div>
      <div className="mt-3 flex flex-wrap items-end gap-2"><label className="min-w-0 text-xs">New tier boundary (hours)<input aria-label="New tier boundary (hours)" className={costInputClass} type="number" min="0" step="any" value={tierBoundary} onChange={(e) => setTierBoundary(e.target.value)} /></label><Button variant="outline" size="sm" disabled={!tierBoundary || !tiers.length} onClick={() => { param('tiers', [...tiers.map((t, i) => i === tiers.length - 1 ? { ...t, upToHours: Number(tierBoundary) } : t), { upToHours: null, multiplier: tiers.at(-1)?.multiplier ?? null }]); setTierBoundary('') }}><Plus className="mr-1 h-3.5 w-3.5" />Add tier</Button></div>
    </fieldset>}
    {canEdit && <Button size="sm" className="mt-3" disabled={busy} data-testid={`cost-save-${instance.id}`} onClick={() => void save()}><Save className="mr-1 h-3 w-3" />Save new revision</Button>}
    <CostWorkbench instanceId={instance.id} revision={revision} guarantees={guarantees} canCalculate={canEdit && !busy} parameterKey={JSON.stringify([draft, applicability])} demoMode={templateMode} />
    {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
  </div>
}
