import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Coins, Copy, Layers, ListPlus, Pencil, Plus, RefreshCw, Search, Star, Trash2, Trees } from 'lucide-react'
import { AppDialog, Button } from '@rois/ui'
import { usePermission } from '@/hooks/use-permission'
import { costLibraryApi } from '@/services/cost-library-api'
import { costCode, toNormalizedCostError, type NormalizedCostError } from '@/types/cost-library'
import type { CostCatalog, CostInstance, CostRevision, CostSet, SetDraft } from '@/types/cost-library'
import { CostDetail, costInputClass } from './cost-detail'
import { CostErrorBanner } from './cost-error-banner'

const actionClass = 'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40'
const badgeClass = 'inline-flex shrink-0 items-center rounded-sm bg-muted px-1.5 py-0.5 text-2xs font-normal text-muted-foreground'
const rowGridClass = 'grid grid-cols-[minmax(0,1fr)_6rem] items-center gap-x-3 gap-y-2 px-4 py-3 @lg:grid-cols-[minmax(0,1fr)_6rem_7rem] @3xl:grid-cols-[minmax(0,2fr)_7rem_6rem_7rem_7rem]'
const priceNumber = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
type DialogKind = 'new' | 'edit' | 'copy' | 'delete' | 'members' | 'instance' | 'delete-instance'
export const CostLibraryView = ({ templates = false }: { templates?: boolean }): React.JSX.Element => {
  const [catalog, setCatalog] = useState<CostCatalog | null>(null)
  const [selectedSet, setSelectedSet] = useState<number | null>(null)
  const [selectedInstance, setSelectedInstance] = useState<number | null>(null)
  const [latestInstances, setLatestInstances] = useState<Set<number>>(new Set())
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [history, setHistory] = useState<Record<number, CostRevision[]>>({})
  const [search, setCostSearch] = useState('')
  const [setSearch, setSetSearch] = useState('')
  // Structured error state replaces the previous plain string. Keeping
  // `null` as the "no error" sentinel makes the UI conditional rendering
  // explicit and avoids the old "Cost library request failed" toast.
  const [error, setError] = useState<NormalizedCostError | null>(null)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState<DialogKind | null>(null)
  const [draft, setDraft] = useState<SetDraft>({ name: '', description: '', division: '', enabled: true })
  const [mode, setMode] = useState<'shared' | 'independent'>('shared')
  const [target, setTarget] = useState<CostInstance | null>(null)
  const [members, setMembers] = useState<Record<number, number>>({})
  const { canAccessCtl } = usePermission()
  const allowed = (control: string): boolean => canAccessCtl('LEGALITY_RULE_SETS', control)
  const reload = useCallback(async (): Promise<void> => {
    const data = await costLibraryApi.catalog()
    setCatalog(data)
    setSelectedSet((id) => data.sets.some((s) => s.id === id) ? id : data.sets[0]?.id ?? null)
  }, [])
  useEffect(() => { let live = true; const load = async (): Promise<void> => { try { const data = await costLibraryApi.catalog(); if (live) { setCatalog(data); setSelectedSet(data.sets[0]?.id ?? null); setError(null) } } catch (e) { if (live) setError(toNormalizedCostError(e)) } }; void load(); return () => { live = false } }, [])
  useEffect(() => { setSelectedInstance(null); setExpanded(new Set()) }, [templates])
  useEffect(() => { setLatestInstances(new Set()) }, [selectedSet, templates])
  useEffect(() => {
    if (!catalog || templates) return
    const members = catalog.sets.find((s) => s.id === selectedSet)?.members ?? []
    const missing = catalog.instances.filter((i) => members.some((m) => m.costInstanceId === i.id && m.costRevisionId !== i.latestRevision.id))
    let active = true
    const load = async (): Promise<void> => {
      try {
        const lists = await Promise.all(missing.map((i) => costLibraryApi.revisions(i.id)))
        if (active) setHistory((h) => ({ ...h, ...Object.fromEntries(missing.map((i, index) => [i.id, lists[index]])) }))
      } catch (e) { if (active) setError(toNormalizedCostError(e)) }
    }
    void load()
    return () => { active = false }
  }, [catalog, selectedSet, templates])
  const run = async (operation: () => Promise<void>): Promise<void> => { setBusy(true); setError(null); try { await operation() } catch (e) { setError(toNormalizedCostError(e)) } finally { setBusy(false) } }
  const loadHistory = async (instance: CostInstance): Promise<void> => {
    const revisions = await costLibraryApi.revisions(instance.id)
    const policies = revisions.some((revision) => revision.calculatorCode === 'standby')
      ? catalog?.instances.filter((i) => i.id !== instance.id && (i.latestRevision.calculatorCode === 'guarantee' || catalog.types.some((type) => type.id === i.costTypeId && type.calculatorCode === 'guarantee'))) ?? []
      : []
    const lists = await Promise.all(policies.map((policy) => costLibraryApi.revisions(policy.id)))
    setHistory((h) => ({ ...h, [instance.id]: revisions, ...Object.fromEntries(policies.map((policy, index) => [policy.id, lists[index]])) }))
  }
  const set = catalog?.sets.find((s) => s.id === selectedSet)
  const openDialog = (kind: DialogKind, instance?: CostInstance): void => {
    setError(null); setTarget(instance ?? null); setMode('shared')
    setDraft(instance ? { name: instance.name, enabled: instance.enabled, description: '', division: '' } : kind === 'new' ? { name: '', description: '', division: catalog?.sets[0]?.division ?? '', enabled: true } : { name: kind === 'copy' ? `${set?.name ?? ''} copy` : set?.name ?? '', description: set?.description ?? '', division: set?.division ?? '', enabled: set?.enabled ?? true })
    setMembers(Object.fromEntries(set?.members.map((m) => [m.costInstanceId, m.costRevisionId]) ?? [])); setDialog(kind)
    if (kind === 'members' && catalog) void run(async () => { const lists = await Promise.all(catalog.instances.map((i) => costLibraryApi.revisions(i.id))); setHistory(Object.fromEntries(catalog.instances.map((i, index) => [i.id, lists[index]]))) })
  }
  const submit = async (): Promise<void> => run(async () => {
    let next: CostSet | undefined
    if (dialog === 'new') next = await costLibraryApi.createSet(draft)
    if (dialog === 'edit' && set) next = await costLibraryApi.updateSet(set.id, { ...draft, expectedVersion: set.version })
    if (dialog === 'copy' && set) next = await costLibraryApi.copySet(set.id, draft.name, mode)
    if (dialog === 'delete' && set) await costLibraryApi.deleteSet(set.id)
    if (dialog === 'members' && set) next = await costLibraryApi.members(set.id, Object.values(members), set.version)
    if (dialog === 'instance' && target) await costLibraryApi.updateInstance(target.id, { name: draft.name, enabled: draft.enabled })
    if (dialog === 'delete-instance' && target) { await costLibraryApi.deleteInstance(target.id); setSelectedInstance(null) }
    await reload(); if (next) setSelectedSet(next.id); setDialog(null)
  })
  if (!catalog) return <div className="p-4 text-xs" data-testid="cost-library-loading">{error ? <CostErrorBanner error={error} onRetry={() => void run(reload)} onDismiss={() => setError(null)} testIdPrefix="cost-library-load-error" /> : 'Loading cost library...'}</div>
  const filtered = catalog.instances.filter((i) => (!templates || i.instanceNo === 1) && `${costCode(i)} ${i.name}`.toLowerCase().includes(search.toLowerCase()))
  const rows = filtered.filter((i) => selectedInstance ? i.id === selectedInstance : templates ? i.instanceNo === 1 : set?.members.some((m) => m.costInstanceId === i.id))
  const guarantees = [...new Map([...catalog.instances.map((i) => i.latestRevision), ...Object.values(history).flat()].filter((r) => r.calculatorCode === 'guarantee').map((r) => [r.id, r])).values()]
  const icon = (title: string, Icon: typeof Plus, onClick: () => void, testId?: string, disabled = false): React.JSX.Element => <button title={title} aria-label={title} data-testid={testId} className={actionClass} disabled={busy || disabled} onClick={onClick}><Icon className="h-3.5 w-3.5" /></button>
  const toggle = (instance: CostInstance): void => { const next = new Set(expanded); if (next.has(instance.id)) next.delete(instance.id); else { next.add(instance.id); void run(() => loadHistory(instance)) } setExpanded(next) }
  return <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background md:flex-row" data-testid="cost-library-view">
    {!templates && <aside aria-label="Cost catalogue" className="max-h-44 w-full shrink-0 overflow-auto border-b border-border bg-background md:max-h-none md:w-48 md:border-b-0 md:border-r xl:w-52">
      <div className="flex h-10 items-center gap-2 border-b border-border px-3"><Trees className="h-4 w-4 shrink-0 text-muted-foreground" /><h3 className="text-sm font-semibold">Cost Catalogue</h3><span className={`${badgeClass} ml-auto`}>{filtered.length}</span></div>
      <div className="p-2"><label className="relative block"><Search className="pointer-events-none absolute left-2 top-2.5 h-3 w-3 text-muted-foreground" /><input aria-label="Search costs" placeholder="Search cost ID or name" className={`${costInputClass} pl-7`} value={search} onChange={(e) => setCostSearch(e.target.value)} /></label></div>
      <button aria-pressed={selectedInstance === null} className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${selectedInstance === null ? 'bg-primary/10 text-primary' : ''}`} onClick={() => setSelectedInstance(null)}><Layers className="h-3.5 w-3.5 shrink-0" />All {templates ? 'templates' : 'set members'}</button>
      {[...new Set(catalog.types.map((t) => t.categoryCode))].map((category) => <details key={category} open className="text-xs"><summary className="cursor-pointer px-3 py-2 font-medium text-muted-foreground">{category}<span className={`${badgeClass} ml-2`}>{filtered.filter((i) => i.categoryCode === category).length}</span></summary>{filtered.filter((i) => i.categoryCode === category).map((i) => <button key={i.id} aria-pressed={selectedInstance === i.id} data-testid={`cost-tree-${i.id}`} style={{ borderLeftColor: selectedInstance === i.id ? 'hsl(var(--primary))' : 'transparent' }} className={`flex w-full flex-col gap-0.5 border-l-2 px-3 py-2 text-left text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${selectedInstance === i.id ? 'bg-primary/10 text-primary' : ''}`} onClick={() => { setSelectedInstance(i.id); setLatestInstances((current) => { const next = new Set(current); next.delete(i.id); return next }); setExpanded(new Set([i.id])); void run(() => loadHistory(i)) }}><span className="font-mono text-2xs text-primary">{costCode(i)}</span><span className="w-full break-words leading-relaxed">{i.name}</span></button>)}</details>)}
    </aside>}
    {!templates && <aside aria-label="Cost sets" className="max-h-44 w-full shrink-0 overflow-auto border-b border-border bg-background md:max-h-none md:w-52 md:border-b-0 md:border-r xl:w-60">
      <div className="flex h-10 items-center justify-between border-b border-border px-3"><span className="flex items-center gap-2"><Layers className="h-4 w-4 shrink-0 text-muted-foreground" /><h3 className="text-sm font-semibold">Cost Sets</h3></span>{allowed('BTN_NEW_RULESET') && icon('New cost set', Plus, () => openDialog('new'), 'cost-set-new')}</div>
      <div className="p-2"><label className="relative block"><Search className="pointer-events-none absolute left-2 top-2.5 h-3 w-3 text-muted-foreground" /><input aria-label="Search cost sets" placeholder="Search sets" className={`${costInputClass} pl-7`} value={setSearch} onChange={(e) => setSetSearch(e.target.value)} /></label></div>
      {catalog.sets.filter((s) => s.name.toLowerCase().includes(setSearch.toLowerCase())).map((s) => <button key={s.id} aria-pressed={s.id === selectedSet} data-testid={`cost-set-${s.id}`} style={{ borderLeftColor: s.id === selectedSet ? 'hsl(var(--primary))' : 'transparent' }} className={`w-full border-b border-l-2 border-b-border px-3 py-3 text-left text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${s.id === selectedSet ? 'bg-primary/10' : ''}`} onClick={() => { setSelectedSet(s.id); setSelectedInstance(null); setExpanded(new Set()) }}>
        <span className="flex items-start gap-1.5 font-semibold">{s.isDefault && <Star aria-label="Default set" className="mt-0.5 h-3 w-3 shrink-0 text-primary" />}<span className="min-w-0 break-words">{s.name}</span></span>
        <span className="mt-2 flex flex-wrap items-center justify-between gap-2"><span className="font-mono text-2xs text-muted-foreground">Set #{s.id}</span><span className={`${badgeClass} ${s.enabled ? 'bg-chart-2/15 text-foreground' : ''}`}>{s.enabled ? 'Enabled' : 'Disabled'}</span></span>
        {s.description && <span className="my-2 block break-words text-2xs leading-relaxed text-muted-foreground">{s.description}</span>}
        <span className="mt-2 flex flex-wrap items-center justify-between gap-2 text-2xs text-muted-foreground"><span>{s.members.length} costs</span><span>{s.division}</span></span>
      </button>)}
    </aside>}
    <main className="@container min-h-0 min-w-0 flex-1 overflow-auto bg-background">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4">
        <div className="min-w-0 flex-1"><div className="flex items-start gap-2"><Coins className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" /><h2 className="min-w-0 break-words text-base font-semibold">{templates ? 'Cost Templates' : set?.name ?? 'Cost Sets'}</h2><span className={badgeClass}>{rows.length} costs</span></div>{!templates && set && <p className="mt-1.5 break-words text-xs leading-relaxed text-muted-foreground">{set.description}{set.description && <span className="mx-2" aria-hidden="true">·</span>}Version {set.version}</p>}</div>
        <div className="flex shrink-0 items-center gap-1">{icon('Refresh cost library', RefreshCw, () => void run(async () => { await reload(); setHistory({}); setExpanded(new Set()) }))}{!templates && set && <>{allowed('BTN_EDIT') && icon('Edit cost set', Pencil, () => openDialog('edit'), 'cost-set-edit')}{allowed('BTN_COPY') && icon('Copy cost set', Copy, () => openDialog('copy'), 'cost-set-copy')}{allowed('BTN_ADD_RULES') && icon('Manage cost membership', ListPlus, () => openDialog('members'), 'cost-set-members')}{allowed('BTN_DELETE') && icon('Delete cost set', Trash2, () => openDialog('delete'), 'cost-set-delete')}</>}</div>
      </header>
      <div data-testid="cost-table-heading" className={`${rowGridClass} border-b border-border bg-muted/40 text-2xs text-muted-foreground`}><span>Cost ID / Description</span><span className="hidden @3xl:block">Category / Source</span><span className="text-right">Unit price</span><span className="hidden @3xl:block">Revision / Status</span><span className="hidden text-right @lg:block">Actions</span></div>
      {error && !dialog && (
        <div className="px-4 pt-3" data-testid="cost-error-region">
          <CostErrorBanner error={error} onRetry={() => void run(reload)} onDismiss={() => setError(null)} testIdPrefix="cost-table-error" />
        </div>
      )}
      {notice && <p role="status" className="p-3 text-xs text-muted-foreground">{notice}</p>}
      {rows.length === 0 && <p className="p-4 text-xs text-muted-foreground">No costs found.</p>}
      {rows.map((instance) => {
        const member = !templates && !latestInstances.has(instance.id) ? set?.members.find((m) => m.costInstanceId === instance.id) : undefined
        const revisionId = member?.costRevisionId ?? instance.latestRevision.id
        const revision = revisionId === instance.latestRevision.id ? instance.latestRevision : history[instance.id]?.find((r) => r.id === revisionId)
        const type = catalog.types.find((t) => t.id === instance.costTypeId)
        const isExpanded = expanded.has(instance.id)
        const revisionLabel = member ? `Set revision ${revision?.revisionNo ?? `#${revisionId}`}` : `Latest revision ${instance.latestRevision.revisionNo}`
        const parameterCount = revision ? Object.values(revision.paramsJson).reduce<number>((count, value) => count + (Array.isArray(value) ? value.reduce<number>((n, row) => n + (row && typeof row === 'object' ? Object.keys(row).length : 1), 0) : 1), 0) + 2 + (revision.ghPolicyRevisionId !== null ? 1 : 0) : null
        return <article key={instance.id} className="border-b border-border" data-testid={`cost-row-${instance.id}`} data-expanded={isExpanded}>
          <div data-testid={`cost-row-heading-${instance.id}`} style={{ borderLeftColor: isExpanded ? 'hsl(var(--primary))' : 'transparent' }} className={`${rowGridClass} min-h-20 border-l-2 ${isExpanded ? 'bg-primary/10' : 'hover:bg-muted/30'}`}>
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs"><span className="font-mono text-primary">{costCode(instance)}</span><span className="min-w-0 break-words font-medium leading-relaxed">{instance.name}</span></div>
              <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-2xs text-muted-foreground">{parameterCount !== null && <span>{parameterCount} parameters</span>}<span className="@3xl:hidden">{revisionLabel}</span>{!templates && !set?.members.some((m) => m.costInstanceId === instance.id) && <span>Not in selected set</span>}</div>
              <div className="mt-1 flex flex-wrap gap-1 text-2xs text-muted-foreground @3xl:hidden"><span>{instance.categoryCode}</span><span>{instance.instanceNo === 1 ? 'Template' : 'Copy'}</span>{!instance.enabled && <span className={badgeClass}>Disabled</span>}</div>
            </div>
            <div className="hidden min-w-0 text-2xs @3xl:block"><span className={`${badgeClass} max-w-full shrink break-words whitespace-normal`}>{instance.categoryCode}</span><span className="mt-1 block break-words text-muted-foreground">{instance.instanceNo === 1 ? 'Template' : 'Copy'}</span>{revision?.reference && <span className="mt-1 block break-words text-muted-foreground">{revision.reference}</span>}</div>
            <div className="min-w-0 break-words text-right text-xs tabular-nums"><span className={revision?.unitPrice == null && revision?.calculatorCode !== 'standby' ? 'text-muted-foreground' : 'font-medium'}>{!revision ? 'Loading...' : revision.calculatorCode === 'standby' ? `${revision.paramsJson.creditFactor}\u00d7 credit` : revision.unitPrice == null ? 'Unpriced' : priceNumber.format(revision.unitPrice)}</span><div className="mt-1 text-2xs text-muted-foreground">{revision?.calculatorCode === 'standby' ? 'credit hour' : <>{revision?.unitPrice != null && <span>{revision.currencyCode} / </span>}{revision?.unitCode ?? instance.latestRevision.unitCode}</>}</div></div>
            <div className="hidden min-w-0 text-2xs @3xl:block"><span className={`${badgeClass} ${instance.enabled ? 'bg-chart-2/15 text-foreground' : ''}`}>{instance.enabled ? 'Enabled' : 'Disabled'}</span><span className="mt-1 block text-muted-foreground">{revisionLabel}</span>{revision?.createdBy && <span className="mt-1 block break-words text-muted-foreground">By {revision.createdBy}</span>}</div>
            <div className="col-span-2 flex justify-end @lg:col-span-1">
              {!templates && set?.members.some((m) => m.costInstanceId === instance.id && m.costRevisionId !== instance.latestRevision.id) && icon(member ? 'View latest revision' : 'View set revision', RefreshCw, () => { setLatestInstances((current) => { const next = new Set(current); if (next.has(instance.id)) next.delete(instance.id); else next.add(instance.id); return next }); setExpanded((current) => new Set([...current, instance.id])) }, `cost-revision-toggle-${instance.id}`)}
              {icon(isExpanded ? 'Collapse cost' : 'Expand cost', isExpanded ? ChevronDown : ChevronRight, () => toggle(instance), `cost-expand-${instance.id}`)}
              {allowed('BTN_COPY') && icon('Copy cost instance', Copy, () => void run(async () => { const copy = await costLibraryApi.copyInstance(instance.id); await reload(); setNotice(`Created ${costCode(copy)}. Available in the Cost Sets catalogue.`); setSelectedInstance(templates ? null : copy.id); setExpanded(templates ? new Set() : new Set([copy.id])) }), `cost-copy-${instance.id}`)}
              {allowed('BTN_EDIT_META') && icon('Edit cost instance', Pencil, () => openDialog('instance', instance), `cost-edit-${instance.id}`)}
            </div>
          </div>
          {isExpanded && (revision && type ? <CostDetail instance={instance} revision={revision} type={type} guarantees={guarantees} defaults={catalog.instances.filter((i) => i.instanceNo === 1).map((i) => i.latestRevision)} canEdit={allowed('BTN_EDIT_PARAM')} templateMode={templates} onSaved={async () => { await reload(); await loadHistory(instance) }} /> : <p className="bg-muted/20 p-4 text-xs">Loading pinned revision...</p>)}
        </article>
      })}
    </main>
    <AppDialog open={dialog !== null} onOpenChange={(open) => { if (!open && !busy) setDialog(null) }} title={dialog === 'members' ? 'Manage cost membership' : dialog === 'instance' ? 'Edit cost instance' : dialog === 'delete-instance' ? 'Delete cost instance' : `${dialog === 'new' ? 'New' : dialog === 'edit' ? 'Edit' : dialog === 'copy' ? 'Copy' : 'Delete'} cost set`} data-testid="cost-dialog" footer={<><Button variant="ghost" disabled={busy} onClick={() => setDialog(null)}>Cancel</Button><Button data-testid="cost-dialog-save" disabled={busy || (!draft.name.trim() && dialog !== 'members')} onClick={() => void submit()}>{dialog?.startsWith('delete') ? 'Delete' : 'Save'}</Button></>}>
      <div className="flex flex-col gap-3 text-xs">
        {dialog === 'members' ? catalog.instances.map((i) => <div key={i.id} className="flex items-center gap-2 border-b border-border pb-2"><label className="flex min-w-0 flex-1 items-center gap-2"><input type="checkbox" aria-label={`Include ${costCode(i)}`} checked={members[i.id] !== undefined} onChange={(e) => setMembers((m) => { const next = { ...m }; if (e.target.checked) next[i.id] = i.latestRevision.id; else delete next[i.id]; return next })} /><span>{costCode(i)} {i.name}</span></label><select aria-label={`Revision ${costCode(i)}`} className={`${costInputClass} max-w-36`} disabled={members[i.id] === undefined || busy} value={members[i.id] ?? i.latestRevision.id} onChange={(e) => setMembers({ ...members, [i.id]: Number(e.target.value) })}>{(history[i.id] ?? [i.latestRevision]).map((r) => <option key={r.id} value={r.id}>Revision {r.revisionNo}{r.id === i.latestRevision.id ? ' (latest)' : ''}</option>)}</select></div>) : dialog?.startsWith('delete') ? <p>Delete {target?.name ?? set?.name}?</p> : <><label>Name<input aria-label="Name" className={costInputClass} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>{dialog === 'copy' ? <label>Cost instances<select aria-label="Copy mode" className={costInputClass} value={mode} onChange={(e) => setMode(e.target.value as 'shared' | 'independent')}><option value="shared">Use existing instances</option><option value="independent">Create independent copies</option></select></label> : <>{dialog !== 'instance' && <><label>Description<input aria-label="Description" className={costInputClass} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label><label>Division<input aria-label="Division" className={costInputClass} value={draft.division} onChange={(e) => setDraft({ ...draft, division: e.target.value })} /></label></>}<label className="flex items-center gap-2"><input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />Enabled</label></>}{dialog === 'instance' && target?.instanceNo !== 1 && allowed('BTN_DELETE') && <Button variant="destructive" onClick={() => setDialog('delete-instance')}><Trash2 className="mr-1 h-3 w-3" />Delete instance</Button>}</>}
        {error && (
          <CostErrorBanner error={error} compact onDismiss={() => setError(null)} testIdPrefix="cost-dialog-error" />
        )}
      </div>
    </AppDialog>
  </div>
}
