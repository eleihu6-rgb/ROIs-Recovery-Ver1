import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Layers, ScrollText, Search, Plus, Pencil, Copy as CopyIcon, Trash2, ListPlus, Star, Trees } from 'lucide-react'
import { AppDialog, Button } from '@rois/ui'
import { useLegalityStore } from '@/stores/legality-store'
import { useFilterStore } from '@/stores/filter-store'
import { useTimezoneStore } from '@/stores/timezone-store'
import { usePermission } from '@/hooks/use-permission'
import { legalityApi } from '@/services/legality-api'
import { dictionaryApi } from '@/services/dictionary-api'
import { referenceApi } from '@/services/reference-api'
import { notify } from '@/utils/notify'
import { TAXONOMY_CHIP, DEFAULT_CHIP } from '@/components/rule/rule-badge-styles'
import { LegalityRuleRow, ruleDisplayName } from './legality-rule-row'
import { RuleInlineCell } from './rule-inline-cell'
import { LegalityRecheckIndicator } from './legality-recheck-indicator'
import { LegalityParamTable } from './legality-param-table'
import { LegalityParamTableEditor } from './legality-param-table-editor'
import { RuleCatalogTree } from './rule-catalog-tree'
import { NewRuleSetDialog, EditRuleSetDialog, CopyRuleSetDialog, AddRulesDialog } from './rule-set-dialogs'
import { LegalityColumnSplitter } from './legality-column-splitter'
import {
  LEGALITY_CATALOG_WIDTH_DEFAULT,
  LEGALITY_SETS_WIDTH_DEFAULT,
  applyLegalityColumnDrag,
  clampLegalityCatalogWidth,
  clampLegalitySetsWidth,
} from './legality-column-widths'
import type { LegalityRulesetSummary } from '@/types/legality'

/** Square icon-button used for the Rule Set management actions in the header. */
const ACTION_BTN =
  'inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-2xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors'

const DEFAULT_RULE_SET_TYPE_COLORS: Record<string, string> = {
  LIVE: '#34AEE0',
  PBS: '#5B4DBE',
  RO: '#FFCC4B',
}

const isHexColor = (value: string): boolean => /^#[0-9a-f]{6}$/i.test(value) || /^#[0-9a-f]{3}$/i.test(value)

const readableTextColor = (background: string): string => {
  const hex = background.length === 4
    ? background.slice(1).split('').map((c) => c + c).join('')
    : background.slice(1)
  const channels = [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
  const luminance = channels.map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0)
  return luminance > 0.45 ? '#1f2937' : '#ffffff'
}

const ruleSetTypeChip = (type: string, configuredColors: Record<string, string>) => {
  const color = configuredColors[type] ?? DEFAULT_RULE_SET_TYPE_COLORS[type]
  if (!color || !isHexColor(color)) return { className: TAXONOMY_CHIP, style: undefined }
  return {
    className: 'rounded px-1.5 py-0.5 font-semibold',
    style: { backgroundColor: color, color: readableTextColor(color) },
  }
}

/** Format a UTC Date as "YYYY-MM-DD" in the given IANA timezone (matches the DateRangePicker). */
const formatYmdInTz = (date: Date, timezone: string): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(date)

export const LegalityRuleSetsView = () => {
  const init = useLegalityStore((s) => s.init)
  const selectSet = useLegalityStore((s) => s.selectSet)
  const sets = useLegalityStore((s) => s.sets)
  const selectedId = useLegalityStore((s) => s.selectedId)
  const loadingRules = useLegalityStore((s) => s.loadingRules)
  const worksetName = useLegalityStore((s) => s.worksetName)
  const rules = useLegalityStore((s) => s.rules)
  const catalogRules = useLegalityStore((s) => s.catalogRules)
  const selectedCatalogRuleId = useLegalityStore((s) => s.selectedCatalogRuleId)
  const recordParamSave = useLegalityStore((s) => s.recordParamSave)
  const updateRuleMeta = useLegalityStore((s) => s.updateRuleMeta)
  const lastSave = useLegalityStore((s) => s.lastSave)
  const dateRange = useFilterStore((s) => s.dateRange)
  const timezone = useTimezoneStore((s) => s.timezone)
  const [search, setSearch] = useState('')
  const [recheckSignal, setRecheckSignal] = useState(0)
  const { canAccessCtl } = usePermission()
  // Permission bundle for LEGALITY_RULE_SETS — admin users get all ctls via
  // buildAdminContext(); non-admin users only see controls they own.
  const canCreateSet = canAccessCtl('LEGALITY_RULE_SETS', 'BTN_NEW_RULESET')
  const canEditSet = canAccessCtl('LEGALITY_RULE_SETS', 'BTN_EDIT')
  const canCopySet = canAccessCtl('LEGALITY_RULE_SETS', 'BTN_COPY')
  const canDeleteSet = canAccessCtl('LEGALITY_RULE_SETS', 'BTN_DELETE')
  const canAddRules = canAccessCtl('LEGALITY_RULE_SETS', 'BTN_ADD_RULES')
  const canRemoveRule = canAccessCtl('LEGALITY_RULE_SETS', 'BTN_REMOVE_RULE')
  const canEditParam = canAccessCtl('LEGALITY_RULE_SETS', 'BTN_EDIT_PARAM')
  const canEditMeta = canAccessCtl('LEGALITY_RULE_SETS', 'BTN_EDIT_META')
  const canManageSet = canEditSet || canCopySet || canDeleteSet || canAddRules
  const removeRule = useLegalityStore((s) => s.removeRule)
  const deleteSet = useLegalityStore((s) => s.deleteSet)
  const [dialog, setDialog] = useState<null | 'new' | 'edit' | 'copy' | 'add'>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [setsQuery, setSetsQuery] = useState('')
  const [catalogWidth, setCatalogWidth] = useState(LEGALITY_CATALOG_WIDTH_DEFAULT)
  const [setsWidth, setSetsWidth] = useState(LEGALITY_SETS_WIDTH_DEFAULT)
  const [catalogHidden, setCatalogHidden] = useState(false)
  const [setsHidden, setSetsHidden] = useState(false)
  const [ruleSetTypeColors, setRuleSetTypeColors] = useState<Record<string, string>>(DEFAULT_RULE_SET_TYPE_COLORS)
  const [divisionOptions, setDivisionOptions] = useState<Array<{ value: string; label: string }>>([])
  const existingRuleIds = new Set(rules.map((r) => r.id))
  const missingRuleSetCoverage = useMemo(() => {
    const divisions = divisionOptions.length > 0
      ? [...new Set(divisionOptions.map((d) => d.value).filter(Boolean))]
      : ['P', 'C']
    const types = ['LIVE', 'PBS', 'RO']
    return types.flatMap((type) => divisions
      .filter((division) => !sets.some((s) => s.type.split(',').includes(type) && s.division === division && s.enabled))
      .map((division) => `${type}/${division}`))
  }, [divisionOptions, sets])

  const selectedCatalogRule = useMemo(
    () => (selectedCatalogRuleId == null ? null : catalogRules.find((r) => r.id === selectedCatalogRuleId) ?? null),
    [catalogRules, selectedCatalogRuleId],
  )

  const isDefaultSet = sets.find((s) => s.id === selectedId)?.isDefault === true
  // The live recheck targets the default rule set, resolved dynamically (no hardcoded group):
  // its workset id IS the ruleset_id the recheck route/script key on. '' until the list loads.
  const recheckGroup = sets.find((s) => s.isDefault) ? String(sets.find((s) => s.isDefault)!.id) : ''
  // Derive from selectedId (not the `sets` list) so management actions also work for a
  // just-created EMPTY set — empty worksets are excluded from GET /rulesets / `sets`.
  const selectedSet: LegalityRulesetSummary | null =
    selectedId !== null
      ? {
          id: selectedId,
          name: worksetName ?? '',
          category: sets.find((s) => s.id === selectedId)?.category ?? null,
          type: sets.find((s) => s.id === selectedId)?.type ?? 'RO',
          division: sets.find((s) => s.id === selectedId)?.division ?? 'P',
          enabled: sets.find((s) => s.id === selectedId)?.enabled ?? false,
          ruleCount: rules.length,
          isDefault: isDefaultSet,
        }
      : null
  const start = formatYmdInTz(dateRange.start, timezone)
  const end = formatYmdInTz(dateRange.end, timezone)

  useEffect(() => {
    void init()
  }, [init])

  useEffect(() => {
    referenceApi.listDivisions()
      .then((rows) => {
        setDivisionOptions(
          rows
            .filter((d) => d.division)
            .map((d) => ({
              value: d.division,
              label: d.description && d.description !== d.division
                ? `${d.division} — ${d.description}`
                : d.division,
            })),
        )
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    dictionaryApi.getByParentCode('RULE_SET_TYPE')
      .then((rows) => {
        const configured = { ...DEFAULT_RULE_SET_TYPE_COLORS }
        for (const row of rows) {
          if (row.code && row.name && isHexColor(row.name)) configured[row.code] = row.name
        }
        setRuleSetTypeColors(configured)
      })
      .catch(() => {})
  }, [])

  // After a successful param save, auto-trigger a live recheck (if it affects the live
  // default ruleset) and flip the indicator to "Checking…". Scenario impact is announced.
  const lastSaveSeq = useRef(0)
  useEffect(() => {
    if (!lastSave || lastSave.seq === lastSaveSeq.current) return
    lastSaveSeq.current = lastSave.seq
    const res = lastSave.result
    // The server starts the previous/current/next RP recheck transactionally with the
    // parameter update. Only nudge the status poll here; do not start a second range check
    // from the current UI date filter.
    if (res.affectsLiveDefault) setRecheckSignal((n) => n + 1)
    if (res.scenarioCount > 0) {
      notify.info(`${res.scenarioCount} scenario(s) will recheck on next open`)
    }
  }, [lastSave, start, end, recheckGroup])

  const filtered = rules.filter((r) => {
    if (!search) return true
    const q = search.toLowerCase()
    return ruleDisplayName(r).toLowerCase().includes(q) || String(r.function).includes(q)
  })

  const filteredSets = (setsQuery
    ? sets.filter(
        (s) =>
          String(s.id).includes(setsQuery) ||
          s.name.toLowerCase().includes(setsQuery.toLowerCase()),
      )
    : sets
  ).slice().sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.id - b.id)

  return (
    <div data-testid="legality-rule-sets-view" className="flex h-full overflow-hidden">
      {!catalogHidden && (
        <>
          <RuleCatalogTree width={catalogWidth} onHide={() => setCatalogHidden(true)} />
          <LegalityColumnSplitter
            testId="legality-catalog-sets-splitter"
            onDrag={(dx) => setCatalogWidth((w) => applyLegalityColumnDrag(w, dx, clampLegalityCatalogWidth))}
          />
        </>
      )}

      {/* Left: every legacy ruleset (workset) that maps rules — 433 full set + 103 Rust dev set */}
      {!setsHidden && <aside
        className="flex shrink-0 flex-col border-r border-border bg-card"
        style={{ width: setsWidth }}
        data-testid="legality-rule-sets-aside"
      >
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-4">
          <button
            type="button"
            data-testid="legality-rule-sets-hide"
            title="Hide Rule Sets"
            aria-label="Hide Rule Sets"
            onClick={() => setSetsHidden(true)}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Layers
              data-testid="legality-rule-sets-header-icon"
              className="h-4 w-4 shrink-0"
            />
          </button>
          <span className="flex-1 text-xs font-bold text-foreground">Rule Sets</span>
          {missingRuleSetCoverage.length > 0 && (
            <span
              data-testid="rule-set-coverage-warning"
              title={`Missing enabled rule sets: ${missingRuleSetCoverage.join(', ')}`}
              aria-label={`Missing enabled rule sets: ${missingRuleSetCoverage.join(', ')}`}
              className="inline-flex h-6 w-6 items-center justify-center text-amber-500"
            >
              <AlertTriangle className="h-4 w-4" />
            </span>
          )}
          {canCreateSet && (
            <button
              data-testid="rule-set-new-btn"
              onClick={() => setDialog('new')}
              title="New rule set"
              className="inline-flex h-6 w-6 items-center justify-center rounded border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {/* Search */}
        <div className="shrink-0 border-b border-border px-2 py-1.5">
          <div className="flex h-6 items-center gap-1.5 rounded border border-border bg-background px-2">
            <Search className="h-3 w-3 shrink-0 text-muted-foreground/50" />
            <input
              value={setsQuery}
              onChange={(e) => setSetsQuery(e.target.value)}
              placeholder="Search sets…"
              className="w-full bg-transparent text-2xs text-foreground outline-none placeholder:text-muted-foreground/50"
            />
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-1.5 overflow-x-hidden overflow-y-auto p-2">
          {filteredSets.map((s) => {
            const active = s.id === selectedId
            // Id badge takes the first claimed type's color; each claimed type gets its own chip below.
            const typeChip = ruleSetTypeChip(s.type.split(',')[0] ?? '', ruleSetTypeColors)
            return (
              <button
                key={s.id}
                type="button"
                data-testid={`legality-ruleset-card-${s.id}`}
                onClick={() => void selectSet(s.id)}
                className={`w-full min-w-0 shrink-0 overflow-x-hidden rounded-md border p-2.5 text-left ${s.enabled ? '' : 'opacity-60 grayscale'} ${
                  active ? 'border-primary/50 bg-primary/[0.06]' : 'border-border hover:bg-accent/40'
                }`}
              >
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className={`shrink-0 text-2xs tabular-nums ${typeChip.className}`} style={typeChip.style}>{s.id}</span>
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">{s.name}</span>
                </div>
                {/* flex-wrap for narrow width; shrink-0 on card prevents vertical crush at short viewports */}
                <div
                  data-testid={`legality-ruleset-card-meta-${s.id}`}
                  className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5"
                >
                  <span className="min-w-0 max-w-[7rem] truncate text-3xs text-muted-foreground">{s.updatedBy ?? '—'}</span>
                  <div className="flex shrink-0 flex-wrap items-center gap-1">
                    {s.type.split(',').filter(Boolean).map((t) => {
                      const chip = ruleSetTypeChip(t, ruleSetTypeColors)
                      return <span key={t} className={`text-3xs ${chip.className}`} style={chip.style}>{t}</span>
                    })}
                  </div>
                  <span className={`shrink-0 text-3xs ${typeChip.className}`} style={typeChip.style}>{s.division}</span>
                  <span className={`shrink-0 text-3xs font-semibold ${s.enabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                    {s.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                  <span
                    data-testid={`legality-ruleset-rule-count-${s.id}`}
                    className="shrink-0 text-3xs tabular-nums text-muted-foreground"
                  >
                    {s.ruleCount} rules
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </aside>}
      {!setsHidden && (
        <LegalityColumnSplitter
          testId="legality-sets-detail-splitter"
          onDrag={(dx) => setSetsWidth((w) => applyLegalityColumnDrag(w, dx, clampLegalitySetsWidth))}
        />
      )}

      {/* Right: header + rules table OR selected catalog instance params */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div
          data-testid="legality-detail-header"
          className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-4"
        >
          {catalogHidden && (
            <button
              type="button"
              data-testid="legality-rule-instances-show"
              title="Show Rule Instances"
              aria-label="Show Rule Instances"
              onClick={() => setCatalogHidden(false)}
              className="animate-nav-hint inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-primary transition-colors hover:bg-accent"
            >
              <Trees className="h-4 w-4 shrink-0" />
            </button>
          )}
          {setsHidden && (
            <button
              type="button"
              data-testid="legality-rule-sets-show"
              title="Show Rule Sets"
              aria-label="Show Rule Sets"
              onClick={() => setSetsHidden(false)}
              className="animate-nav-hint inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-primary transition-colors hover:bg-accent"
            >
              <Layers className="h-4 w-4 shrink-0" />
            </button>
          )}
          <ScrollText className="h-4 w-4 shrink-0 text-muted-foreground" />
          {selectedCatalogRule ? (
            <>
              <span data-testid="legality-catalog-instance-title" className="text-sm font-semibold text-foreground font-mono">
                {selectedCatalogRule.function}/{selectedCatalogRule.instance ?? ''}
              </span>
              <span data-testid="legality-catalog-description" className="min-w-0 truncate">
                <RuleInlineCell
                  value={selectedCatalogRule.description}
                  type="text"
                  onSave={
                    canEditMeta
                      ? (val) => updateRuleMeta(selectedCatalogRule.id, { description: val })
                      : undefined
                  }
                  placeholder="—"
                />
              </span>
              {selectedCatalogRule.isTemplate && (
                <span className={`shrink-0 text-3xs ${DEFAULT_CHIP}`}>Template</span>
              )}
            </>
          ) : (
            <>
              <span data-testid="legality-set-name" className="text-sm font-semibold text-foreground">
                {worksetName ?? '—'}
              </span>
              {selectedId !== null && (
                <span className="text-2xs text-muted-foreground">Legacy ruleset · workset #{selectedId}</span>
              )}
            </>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            {!selectedCatalogRule && canManageSet && selectedSet && (
              <>
                {canAddRules && <button className={ACTION_BTN} data-testid="rule-set-add-rules-btn" onClick={() => setDialog('add')}><ListPlus className="h-3.5 w-3.5" />Add Rules</button>}
                {canEditSet && <button className={ACTION_BTN} data-testid="rule-set-edit-btn" onClick={() => setDialog('edit')}><Pencil className="h-3.5 w-3.5" />Edit</button>}
                {canCopySet && <button className={ACTION_BTN} data-testid="rule-set-copy-btn" onClick={() => setDialog('copy')}><CopyIcon className="h-3.5 w-3.5" />Copy</button>}
                {canDeleteSet && <button className={ACTION_BTN} data-testid="rule-set-delete-btn" onClick={() => setConfirmDelete(true)}><Trash2 className="h-3.5 w-3.5" />Delete</button>}
              </>
            )}
            {!selectedCatalogRule && isDefaultSet && recheckGroup && (
              <LegalityRecheckIndicator
                groupCode={recheckGroup}
                recheck={start && end ? { from: start, to: end } : null}
                pollSignal={recheckSignal}
              />
            )}
          </div>
        </div>

        {selectedCatalogRule ? (
          <div
            data-testid="legality-catalog-instance-params"
            className="flex flex-1 flex-col overflow-y-auto"
          >
            <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background px-4 py-1.5">
              {selectedCatalogRule.isTemplate && (
                <Star className="h-3.5 w-3.5 shrink-0 text-amber-500" />
              )}
              <span className="text-2xs text-muted-foreground">
                {selectedCatalogRule.reference ?? '—'} · {selectedCatalogRule.category ?? '—'}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {canEditParam && selectedCatalogRule.paramJson ? (
                <LegalityParamTableEditor
                  key={selectedCatalogRule.id}
                  ruleId={selectedCatalogRule.id}
                  paramJson={selectedCatalogRule.paramJson}
                  fn={selectedCatalogRule.function}
                  inst={selectedCatalogRule.instance}
                  onSaved={(result) => recordParamSave(selectedCatalogRule.id, result)}
                />
              ) : (
                <LegalityParamTable
                  key={selectedCatalogRule.id}
                  paramJson={selectedCatalogRule.paramJson}
                  fn={selectedCatalogRule.function}
                  inst={selectedCatalogRule.instance}
                />
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Toolbar */}
            <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background px-4 py-1.5">
              <div className="flex h-6 items-center gap-1.5 rounded border border-border bg-card px-2 flex-1 max-w-[260px]">
                <Search className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search rules…"
                  className="bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/50 w-full"
                />
              </div>
              <span className="ml-auto text-2xs text-muted-foreground">{rules.length} rules</span>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-y-auto">
              {loadingRules && (
                <div className="py-16 text-center text-xs text-muted-foreground">Loading…</div>
              )}
              {!loadingRules && rules.length === 0 && (
                <div className="py-20 text-center text-sm text-muted-foreground">No rules in this ruleset.</div>
              )}
              {!loadingRules && rules.length > 0 && (
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-card">
                      <th className="py-2 pl-4 pr-3 text-left text-3xs font-bold uppercase tracking-widest text-muted-foreground">Rule</th>
                      <th className="py-2 pr-3 text-left text-3xs font-bold uppercase tracking-widest text-muted-foreground">Description</th>
                      <th className="py-2 pr-3 text-left text-3xs font-bold uppercase tracking-widest text-muted-foreground">Reference</th>
                      <th className="py-2 pr-3 text-left text-3xs font-bold uppercase tracking-widest text-muted-foreground">Category</th>
                      <th className="py-2 pr-3 text-left text-3xs font-bold uppercase tracking-widest text-muted-foreground">Severity</th>
                      <th className="py-2 pr-3 text-left text-3xs font-bold uppercase tracking-widest text-muted-foreground">Update By</th>
                      <th className="py-2 pr-3 text-left text-3xs font-bold uppercase tracking-widest text-muted-foreground">Params</th>
                      <th className="py-2 pr-4 text-left text-3xs font-bold uppercase tracking-widest text-muted-foreground" />
                    </tr>
                  </thead>
                  <tbody>
                    {search && filtered.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-10 text-center text-xs text-muted-foreground">No rules match the search</td>
                      </tr>
                    )}
                    {filtered.map((rule) => (
                      <LegalityRuleRow
                        key={`${rule.function}-${rule.instance ?? ''}`}
                        rule={rule}
                        onRemove={canRemoveRule ? (r) => void removeRule(r.id) : undefined}
                      />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>

      {/* Rule Set management dialogs (admin) */}
      <NewRuleSetDialog open={dialog === 'new'} onClose={() => setDialog(null)} />
      <EditRuleSetDialog open={dialog === 'edit'} onClose={() => setDialog(null)} set={selectedSet} />
      <CopyRuleSetDialog open={dialog === 'copy'} onClose={() => setDialog(null)} set={selectedSet} />
      <AddRulesDialog open={dialog === 'add'} onClose={() => setDialog(null)} existingRuleIds={existingRuleIds} />

      <AppDialog
        open={confirmDelete}
        onOpenChange={(o) => { if (!o) setConfirmDelete(false) }}
        data-testid="rule-set-delete-dialog"
        className="sm:max-w-[440px]"
        icon={<Trash2 className="h-4 w-4" />}
        title="Delete Rule Set"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button
              variant="destructive"
              data-testid="rule-set-delete-confirm"
              onClick={() => { if (selectedSet) void deleteSet(selectedSet.id); setConfirmDelete(false) }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-xs text-foreground">
          Delete <span className="font-semibold">{selectedSet?.name}</span>? This removes the set and its rule
          memberships. A set that a scenario currently resolves to cannot be deleted.
        </p>
      </AppDialog>
    </div>
  )
}
