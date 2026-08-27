import { useEffect, useState } from 'react'
import { Plus, Pencil, Copy as CopyIcon } from 'lucide-react'
import { AppDialog, Button, Input } from '@rois/ui'
import { useLegalityStore } from '@/stores/legality-store'
import { legalityApi, type RuleSetTypeOption } from '@/services/legality-api'
import { ruleDisplayName } from './legality-rule-row'
import type { LegalityCatalogRule, LegalityRulesetSummary } from '@/types/legality'

const DIVISIONS: Array<{ value: string; label: string }> = [
  { value: 'P', label: 'Pilot (P)' },
  { value: 'C', label: 'Cabin (C)' },
]

const fieldLabel = 'text-2xs font-medium text-muted-foreground'
const fieldInput =
  'h-8 w-full rounded-md border border-border bg-card px-2.5 text-xs text-foreground outline-none focus:border-primary/50'

const confirmLiveRefresh = (): boolean => window.confirm(
  'Enabling or switching a LIVE rule set will clear old legality alerts and recheck the affected roster period in the background. This may take some time, and alerts may be temporarily empty. Continue?',
)

/** Rule Type multi-select toggle buttons — at least one must stay selected. */
const RuleTypeToggleGroup = ({ types, onChange, options }: {
  types: string[]
  onChange: (types: string[]) => void
  options: RuleSetTypeOption[]
}) => {
  const toggle = (code: string) => {
    onChange(types.includes(code) ? types.filter((t) => t !== code) : [...types, code])
  }
  return (
    <div className="flex gap-1.5">
      {options.map((o) => {
        const active = types.includes(o.code)
        return (
          <button
            key={o.code}
            type="button"
            data-testid={`rule-set-type-${o.code.toLowerCase()}`}
            aria-pressed={active}
            onClick={() => toggle(o.code)}
            className={`h-7 flex-1 rounded-md border text-xs font-medium transition-colors ${
              active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:bg-accent/60'
            }`}
          >
            {o.name}
          </button>
        )
      })}
    </div>
  )
}

/** New Rule Set — name + division + one-or-more Rule Types. */
export const NewRuleSetDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const createSet = useLegalityStore((s) => s.createSet)
  const [name, setName] = useState('')
  const [division, setDivision] = useState('P')
  const [types, setTypes] = useState<string[]>(['RO'])
  const [enabled, setEnabled] = useState(false)
  const [typeOptions, setTypeOptions] = useState<RuleSetTypeOption[]>([])
  useEffect(() => { if (open) { setName(''); setDivision('P'); setTypes(['RO']); setEnabled(false); void legalityApi.listRulesetTypes().then(setTypeOptions).catch(() => setTypeOptions([])) } }, [open])

  const options = typeOptions.length ? typeOptions : [{ code: 'LIVE', name: 'Live', value: 'LIVE' }, { code: 'RO', name: 'RO', value: 'RO' }, { code: 'PBS', name: 'PBS', value: 'PBS' }]

  return (
    <AppDialog
      open={open}
      onOpenChange={(o) => { if (!o) onClose() }}
      data-testid="rule-set-new-dialog"
      className="sm:max-w-[440px]"
      icon={<Plus className="h-4 w-4" />}
      title="New Rule Set"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            data-testid="rule-set-new-confirm"
            disabled={!name.trim() || types.length === 0}
            onClick={() => {
              if (types.includes('LIVE') && enabled && !confirmLiveRefresh()) return
              void createSet({ name: name.trim(), division, type: types, enabled }); onClose()
            }}
          >
            Create
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className={fieldLabel}>Name</span>
          <input data-testid="rule-set-name-input" value={name} onChange={(e) => setName(e.target.value)} className={fieldInput} placeholder="e.g. F8 Reserve Ruleset" />
        </label>
        <label className="flex flex-col gap-1">
          <span className={fieldLabel}>Division</span>
          <select value={division} onChange={(e) => setDivision(e.target.value)} className={fieldInput}>
            {DIVISIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={fieldLabel}>Rule Type</span>
          <RuleTypeToggleGroup types={types} onChange={setTypes} options={options} />
          {types.length === 0 && <span className="text-2xs text-amber-600">Select at least one rule type</span>}
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Enable this rule set
        </label>
        <div className="text-2xs text-amber-600">LIVE/PBS: each division should have at least one enabled rule set. Enabling a set deactivates the previous enabled set of the same type.</div>
      </div>
    </AppDialog>
  )
}

/** Edit Rule Set — category is fixed to RULE and is not user-editable. */
export const EditRuleSetDialog = ({ open, onClose, set }: { open: boolean; onClose: () => void; set: LegalityRulesetSummary | null }) => {
  const editSet = useLegalityStore((s) => s.editSet)
  const [name, setName] = useState('')
  const [division, setDivision] = useState('P')
  const [types, setTypes] = useState<string[]>(['RO'])
  const [enabled, setEnabled] = useState(false)
  const [typeOptions, setTypeOptions] = useState<RuleSetTypeOption[]>([])
  useEffect(() => { if (open && set) { setName(set.name); setDivision(set.division); setTypes(set.type.split(',').filter(Boolean)); setEnabled(set.enabled); void legalityApi.listRulesetTypes().then(setTypeOptions).catch(() => setTypeOptions([])) } }, [open, set])

  const options = typeOptions.length ? typeOptions : [{ code: 'LIVE', name: 'Live', value: 'LIVE' }, { code: 'RO', name: 'RO', value: 'RO' }, { code: 'PBS', name: 'PBS', value: 'PBS' }]

  return (
    <AppDialog
      open={open}
      onOpenChange={(o) => { if (!o) onClose() }}
      data-testid="rule-set-edit-dialog"
      className="sm:max-w-[440px]"
      icon={<Pencil className="h-4 w-4" />}
      title="Edit Rule Set"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            data-testid="rule-set-edit-confirm"
            disabled={!name.trim() || !set || types.length === 0}
            onClick={() => {
              if (!set) return
              const liveRefresh = types.includes('LIVE') && enabled &&
                (!set.enabled || !set.type.split(',').includes('LIVE') || set.division !== division)
              if (liveRefresh && !confirmLiveRefresh()) return
              void editSet(set.id, { name: name.trim(), division, type: types, enabled }); onClose()
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className={fieldLabel}>Name</span>
          <input data-testid="rule-set-name-input" value={name} onChange={(e) => setName(e.target.value)} className={fieldInput} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={fieldLabel}>Division</span>
          <select value={division} onChange={(e) => setDivision(e.target.value)} className={fieldInput}>{DIVISIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={fieldLabel}>Rule Type</span>
          <RuleTypeToggleGroup types={types} onChange={setTypes} options={options} />
          {types.length === 0 && <span className="text-2xs text-amber-600">Select at least one rule type</span>}
        </label>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />Enable this rule set</label>
        <div className="text-2xs text-amber-600">LIVE/PBS: each division should have at least one enabled rule set. Enabling a set deactivates the previous enabled set of the same type.</div>
      </div>
    </AppDialog>
  )
}

/** Copy Rule Set — new name + mode (copy-rules vs share-rules). */
export const CopyRuleSetDialog = ({ open, onClose, set }: { open: boolean; onClose: () => void; set: LegalityRulesetSummary | null }) => {
  const copySet = useLegalityStore((s) => s.copySet)
  const [name, setName] = useState('')
  const [mode, setMode] = useState<'copy-rules' | 'share-rules'>('share-rules')
  useEffect(() => { if (open && set) { setName(`${set.name} (Copy)`); setMode('share-rules') } }, [open, set])

  return (
    <AppDialog
      open={open}
      onOpenChange={(o) => { if (!o) onClose() }}
      data-testid="rule-set-copy-dialog"
      className="sm:max-w-[480px]"
      icon={<CopyIcon className="h-4 w-4" />}
      title="Copy Rule Set"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            data-testid="rule-set-copy-confirm"
            disabled={!name.trim() || !set}
            onClick={() => { if (set) void copySet(set.id, name.trim(), mode); onClose() }}
          >
            Copy
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className={fieldLabel}>New name</span>
          <input data-testid="rule-set-name-input" value={name} onChange={(e) => setName(e.target.value)} className={fieldInput} />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className={fieldLabel}>Rules</span>
          <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-2">
            <input type="radio" data-testid="rule-set-copy-mode-share-rules" checked={mode === 'share-rules'} onChange={() => setMode('share-rules')} className="mt-0.5" />
            <span className="text-xs">
              <span className="font-semibold text-foreground">Share rules</span>
              <span className="block text-2xs text-muted-foreground">Reference the same rules — editing a rule affects both sets.</span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-2">
            <input type="radio" data-testid="rule-set-copy-mode-copy-rules" checked={mode === 'copy-rules'} onChange={() => setMode('copy-rules')} className="mt-0.5" />
            <span className="text-xs">
              <span className="font-semibold text-foreground">Copy rules</span>
              <span className="block text-2xs text-muted-foreground">Duplicate each rule into new instances — fully independent.</span>
            </span>
          </label>
        </div>
      </div>
    </AppDialog>
  )
}

/** Add Rules — pick from the catalog the rules not already in the set. */
export const AddRulesDialog = ({ open, onClose, existingRuleIds }: { open: boolean; onClose: () => void; existingRuleIds: Set<number> }) => {
  const addRule = useLegalityStore((s) => s.addRule)
  const [catalog, setCatalog] = useState<LegalityCatalogRule[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setSelected(new Set())
    setSearch('')
    void legalityApi.listRules()
      .then(setCatalog)
      .catch(() => setCatalog([]))
      .finally(() => setLoading(false))
  }, [open])

  const available = catalog.filter((r) => !existingRuleIds.has(r.id))

  const filtered = available.filter((r) => {
    if (!search) return true
    const q = search.toLowerCase()
    const code = `${r.function}/${r.instance ?? ''}`.toLowerCase()
    return (
      code.includes(q) ||
      (r.description ?? '').toLowerCase().includes(q) ||
      (r.category ?? '').toLowerCase().includes(q)
    )
  })

  // Group by category for section headers
  const grouped = filtered.reduce<Record<string, LegalityCatalogRule[]>>((acc, r) => {
    const cat = r.category ?? 'Uncategorized'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(r)
    return acc
  }, {})

  const sortedCategories = Object.keys(grouped).sort()

  const toggleOne = (id: number) =>
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const allFilteredIds = filtered.map((r) => r.id)
  const allSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selected.has(id))
  const someSelected = allFilteredIds.some((id) => selected.has(id))

  const toggleAll = () => {
    if (allSelected) {
      setSelected((s) => { const n = new Set(s); allFilteredIds.forEach((id) => n.delete(id)); return n })
    } else {
      setSelected((s) => { const n = new Set(s); allFilteredIds.forEach((id) => n.add(id)); return n })
    }
  }

  const handleAddSelected = async () => {
    if (selected.size === 0) return
    setSaving(true)
    const ids = [...selected]
    // Add one at a time so the store refreshes correctly after each
    for (const id of ids) {
      await addRule(id)
    }
    setSaving(false)
    onClose()
  }

  const SEV_CHIP: Record<number, string> = {
    3: 'bg-destructive/10 text-destructive',
    2: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    1: 'bg-muted text-muted-foreground',
  }

  const fieldLabel = 'text-2xs font-medium text-muted-foreground'

  return (
    <AppDialog
      open={open}
      onOpenChange={(o) => { if (!o) onClose() }}
      data-testid="rule-set-add-rules-dialog"
      className="sm:max-w-[720px]"
      icon={<Plus className="h-4 w-4" />}
      title="Add Rules to Set"
      footer={
        <>
          <div className="flex items-center gap-3 mr-auto">
            {selected.size > 0 && (
              <span className="text-xs text-muted-foreground">{selected.size} selected</span>
            )}
          </div>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            data-testid="rule-set-add-selected"
            disabled={selected.size === 0 || saving}
            onClick={handleAddSelected}
          >
            {saving ? 'Adding...' : `Add selected (${selected.size})`}
          </Button>
        </>
      }
    >
      {/* Search bar */}
      <div className="mb-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by code, description, or category..."
          className="h-8 w-full text-xs"
        />
      </div>

      {/* Table */}
      <div className="max-h-[50vh] overflow-y-auto rounded-md border border-border">
        {loading ? (
          <div className="py-10 text-center text-xs text-muted-foreground">Loading rules...</div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-xs text-muted-foreground">
            {available.length === 0 ? 'All rules are already in this set.' : 'No rules match your search.'}
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur-sm">
              <tr className="border-b border-border">
                <th className="w-8 px-2 py-2 text-left">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = !allSelected && someSelected }}
                    onChange={toggleAll}
                    className="h-3.5 w-3.5 rounded accent-primary"
                  />
                </th>
                <th className="px-2 py-2 text-left">
                  <span className={fieldLabel}>Function / Instance</span>
                </th>
                <th className="px-2 py-2 text-left">
                  <span className={fieldLabel}>Description</span>
                </th>
                <th className="px-2 py-2 text-left">
                  <span className={fieldLabel}>Category</span>
                </th>
                <th className="px-2 py-2 text-left">
                  <span className={fieldLabel}>Severity</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedCategories.map((cat) => (
                <>
                  <tr key={`cat-${cat}`} className="bg-muted/50">
                    <td colSpan={5} className="px-3 py-1.5">
                      <span className="text-2xs font-bold uppercase tracking-widest text-muted-foreground">{cat}</span>
                    </td>
                  </tr>
                  {grouped[cat].map((r) => {
                    const key = `${r.function}-${r.instance ?? ''}`
                    const checked = selected.has(r.id)
                    return (
                      <tr
                        key={r.id}
                        className={[
                          'border-b border-border/40 transition-colors',
                          checked ? 'bg-primary/5' : 'hover:bg-muted/20',
                        ].join(' ')}
                      >
                        <td className="px-2 py-2">
                          <input
                            type="checkbox"
                            aria-label={ruleDisplayName(r)}
                            checked={checked}
                            onChange={() => toggleOne(r.id)}
                            className="h-3.5 w-3.5 rounded accent-primary"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <span className="font-mono text-xs font-semibold text-foreground tabular-nums">
                            {r.function}/{r.instance ?? ''}
                          </span>
                        </td>
                        <td className="px-2 py-2">
                          <span className="truncate text-xs text-foreground" title={r.description ?? ''}>
                            {r.description ?? '—'}
                          </span>
                        </td>
                        <td className="px-2 py-2">
                          <span className="text-xs text-muted-foreground">{r.category ?? '—'}</span>
                        </td>
                        <td className="px-2 py-2">
                          <span className={`rounded px-1.5 py-0.5 text-2xs font-semibold ${SEV_CHIP[r.severity] ?? 'bg-muted text-muted-foreground'}`}>
                            {r.severity === 3 ? 'Hard' : r.severity === 2 ? 'Overridable' : 'Soft'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppDialog>
  )
}
