import { useEffect, useMemo, useState } from 'react'
import { ScrollText, Search, Copy, Trash2, Maximize2, Plus } from 'lucide-react'
import { AppDialog, Button } from '@rois/ui'
import { TAXONOMY_CHIP, SEVERITY_CHIP, DEFAULT_CHIP } from '@/components/rule/rule-badge-styles'
import { severityLabelFromNum } from '@/utils/severity-labels'
import { usePermission } from '@/hooks/use-permission'
import { useRuleInstancesStore } from '@/stores/rule-instances-store'
import { notify } from '@/utils/notify'
import { useLegalityStore } from '@/stores/legality-store'
import { ruleDisplayName } from './legality-rule-row'
import { LegalityParamTable } from './legality-param-table'
import { LegalityParamTableEditor } from './legality-param-table-editor'
import { LegalityParamDialog } from './legality-param-dialog'
import type { LegalityCatalogRule } from '@/types/legality'

/** Numeric severity (1/2/3) → the string key SEVERITY_CHIP is built on. */
const SEV_CODE: Record<number, string> = { 1: 'INFO', 2: 'WARNING', 3: 'ERROR' }

/** Copy-into-new-instance is temporarily hidden pending re-enable; flip to re-show. */
const SHOW_COPY_BUTTON = false

interface RowProps {
  rule: LegalityCatalogRule
  /**
   * Pre-computed edit capability bundle for this row. Centralises the ctl lookups
   * in the parent so the row stays render-cheap; non-admins get the read-only
   * "View" label and no action buttons unless each ctl is granted.
   */
  capabilities: {
    canEditParams: boolean
    canAddToSet: boolean
    canDeleteInstance: boolean
  }
  onCopy: (rule: LegalityCatalogRule) => void
  onDelete: (rule: LegalityCatalogRule) => void
  /** When true (Alert Center deep-link), force the params panel open. */
  forceExpand?: boolean
}

/**
 * One catalog row. Templates (instance '001') carry a Template badge and no Delete.
 * The param EDITOR renders only when the caller grants canEditParams — that
 * permission is rooted on BTN_EDIT_PARAM (covers the rule params endpoints).
 */
const RuleInstanceRow = ({ rule, capabilities, onCopy, onDelete, forceExpand = false }: RowProps) => {
  const [expanded, setExpanded] = useState(false)
  useEffect(() => {
    if (forceExpand) setExpanded(true)
  }, [forceExpand])
  const [dialogOpen, setDialogOpen] = useState(false)
  const applyParamSave = useRuleInstancesStore((s) => s.applyParamSave)
  const selectedSetId = useLegalityStore((s) => s.selectedId)
  const setRules = useLegalityStore((s) => s.rules)
  const addRule = useLegalityStore((s) => s.addRule)
  const rulesInSet = useMemo(() => new Set(setRules.map((r) => r.id)), [setRules])
  const key = `${rule.function}-${rule.instance ?? ''}`
  const paramCount = rule.paramJson?.tables.reduce((n, t) => n + t.header.length, 0) ?? 0
  const { canEditParams, canAddToSet, canDeleteInstance } = capabilities

  return (
    <>
      <tr
        data-testid={`rule-instance-row-${key}`}
        onDoubleClick={() => setExpanded((e) => !e)}
        title="Double-click to show / hide parameters"
        className={[
          'cursor-pointer select-none border-b border-border/40 transition-colors',
          expanded ? 'bg-muted/30' : 'hover:bg-muted/20',
        ].join(' ')}
      >
        <td className="py-2.5 pl-4 pr-3">
          <div data-testid={`rule-instance-name-${key}`} className="text-xs font-semibold text-foreground">
            {ruleDisplayName(rule)}
          </div>
          {rule.reference && (
            <div className="mt-0.5 font-mono text-2xs text-muted-foreground">{rule.reference}</div>
          )}
        </td>

        <td className="whitespace-nowrap py-2.5 pr-3">
          <span className={`text-3xs ${TAXONOMY_CHIP}`}>{rule.category ?? '—'}</span>
        </td>

        <td className="whitespace-nowrap py-2.5 pr-3">
          <span className={`text-3xs ${TAXONOMY_CHIP}`}>{rule.division ?? '—'}</span>
        </td>

        <td className="whitespace-nowrap py-2.5 pr-3">
          <span className={`rounded px-1.5 py-0.5 text-2xs font-semibold ${SEVERITY_CHIP[SEV_CODE[rule.severity]] ?? 'bg-muted text-muted-foreground'}`}>
            {severityLabelFromNum(rule.severity)}
          </span>
        </td>

        {/* Source — Template (locked 001) vs Copy */}
        <td className="whitespace-nowrap py-2.5 pr-3">
          {rule.isTemplate ? (
            <span data-testid={`rule-instance-template-${key}`} className={`text-3xs ${DEFAULT_CHIP}`}>Template</span>
          ) : (
            <span className={`text-3xs ${TAXONOMY_CHIP}`}>Copy</span>
          )}
        </td>

        {/* Update By — stored directly on rule, without a users join */}
        <td data-testid={`rule-instance-updatedby-${key}`} className="max-w-[7rem] truncate whitespace-nowrap py-2.5 pr-3 text-2xs text-muted-foreground">
          {rule.updatedBy ?? '—'}
        </td>

        <td className="whitespace-nowrap py-2.5 pr-3 text-2xs text-muted-foreground">
          {paramCount > 0 ? `${paramCount} param${paramCount === 1 ? '' : 's'}` : '—'}
        </td>

        <td className="py-2.5 pr-4">
          <div className="flex items-center gap-1" onDoubleClick={(e) => e.stopPropagation()}>
            <button
              data-testid={`rule-instance-edit-${key}`}
              onClick={() => setExpanded((e) => !e)}
              className="rounded border border-border px-2 py-1 text-2xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              {expanded ? 'Close' : canEditParams ? 'Edit' : 'View'}
            </button>
            {SHOW_COPY_BUTTON && (
              <button
                data-testid={`rule-instance-copy-${key}`}
                onClick={() => onCopy(rule)}
                title="Copy into a new editable instance"
                className="inline-flex h-6 w-6 items-center justify-center rounded border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <Copy className="h-3 w-3" />
              </button>
            )}
            {canAddToSet && (
              <button
                data-testid={`rule-instance-add-to-set-${key}`}
                onClick={() => void addRule(rule.id)}
                disabled={selectedSetId == null || rulesInSet.has(rule.id)}
                title={
                  selectedSetId == null
                    ? 'Select a rule set first (go to Rule Sets tab)'
                    : rulesInSet.has(rule.id)
                      ? 'Already in selected set'
                      : 'Add to selected rule set'
                }
                className="inline-flex h-6 w-6 items-center justify-center rounded border border-border text-muted-foreground hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-30 transition-colors"
              >
                <Plus className="h-3 w-3" />
              </button>
            )}
            {!rule.isTemplate && canDeleteInstance && (
              <button
                data-testid={`rule-instance-delete-${key}`}
                onClick={() => onDelete(rule)}
                title="Delete this instance"
                className="inline-flex h-6 w-6 items-center justify-center rounded border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
            <button
              data-testid={`rule-instance-popup-${key}`}
              onClick={() => setDialogOpen(true)}
              title="Open params in window"
              className="inline-flex h-6 w-6 items-center justify-center rounded border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Maximize2 className="h-3 w-3" />
            </button>
          </div>
          <LegalityParamDialog rule={rule} open={dialogOpen} onClose={() => setDialogOpen(false)} />
        </td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={8} className="bg-muted/10 p-0">
            {canEditParams && rule.paramJson ? (
              <div data-testid={`rule-instance-params-${key}`}>
                <LegalityParamTableEditor
                  ruleId={rule.id}
                  paramJson={rule.paramJson}
                  fn={rule.function}
                  inst={rule.instance}
                  onSaved={(result) => applyParamSave(rule.id, result.paramJson)}
                />
              </div>
            ) : (
              <div data-testid={`rule-instance-params-${key}`}>
                <LegalityParamTable paramJson={rule.paramJson} fn={rule.function} inst={rule.instance} />
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

export const RuleInstancesView = () => {
  const init = useRuleInstancesStore((s) => s.init)
  const rules = useRuleInstancesStore((s) => s.rules)
  const loading = useRuleInstancesStore((s) => s.loading)
  const copy = useRuleInstancesStore((s) => s.copy)
  const remove = useRuleInstancesStore((s) => s.remove)
  const pendingFocus = useRuleInstancesStore((s) => s.pendingFocus)
  const clearPendingFocus = useRuleInstancesStore((s) => s.clearPendingFocus)
  const loaded = useRuleInstancesStore((s) => s.loaded)
  const { canAccessCtl } = usePermission()
  // Centralised per-row capabilities — read once per render, passed down so the
  // row component doesn't re-run the ctl lookups for every instance.
  const capabilities = useMemo(
    () => ({
      canEditParams: canAccessCtl('LEGALITY_RULE_SETS', 'BTN_EDIT_PARAM'),
      canAddToSet: canAccessCtl('LEGALITY_RULE_SETS', 'BTN_ADD_RULES'),
      canDeleteInstance: canAccessCtl('LEGALITY_RULE_INSTANCES', 'BTN_DELETE'),
    }),
    [canAccessCtl],
  )
  const [search, setSearch] = useState('')
  const [pendingDelete, setPendingDelete] = useState<LegalityCatalogRule | null>(null)
  const [focusKey, setFocusKey] = useState<string | null>(null)

  useEffect(() => {
    void init()
  }, [init])

  // Alert Center Rule ID → focus matching template row (search + expand + scroll).
  // Wait until catalog has finished loading — otherwise empty rules clear the pending focus.
  useEffect(() => {
    if (!pendingFocus || !loaded || loading) return
    const label = pendingFocus.instanceCode
      ? `${pendingFocus.functionCode}/${pendingFocus.instanceCode}`
      : pendingFocus.functionCode
    setSearch(label)
    const match = rules.find((r) => {
      if (String(r.function) !== pendingFocus.functionCode) return false
      if (pendingFocus.instanceCode == null) return r.isTemplate
      return (r.instance ?? '') === pendingFocus.instanceCode
    })
    if (!match) {
      notify.warning(`Rule ${label} not found in Rule Templates`)
      setFocusKey(null)
      clearPendingFocus()
      return
    }
    if (!match.isTemplate) {
      notify.warning(`Rule ${label} is not a template — only templates are listed here`)
    }
    const key = `${match.function}-${match.instance ?? ''}`
    setFocusKey(key)
    clearPendingFocus()
    requestAnimationFrame(() => {
      document.querySelector(`[data-testid="rule-instance-row-${key}"]`)?.scrollIntoView({ block: 'center' })
    })
  }, [pendingFocus, loaded, loading, rules, clearPendingFocus])

  const templateRules = rules.filter((r) => r.isTemplate)

  const filtered = templateRules.filter((r) => {
    if (!search) return true
    const q = search.toLowerCase()
    return ruleDisplayName(r).toLowerCase().includes(q) || String(r.function).includes(q)
  })

  return (
    <div data-testid="rule-instances-view" className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-4">
        <ScrollText className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">Rule Templates</span>
        <span className="text-2xs text-muted-foreground">
          Master rule catalog · template (001) entries · read-only for non-admins
        </span>
      </div>

      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background px-4 py-2">
        <div className="flex h-7 max-w-[260px] flex-1 items-center gap-1.5 rounded-md border border-border bg-card px-2.5">
          <Search className="h-3 w-3 shrink-0 text-muted-foreground/50" />
          <input
            data-testid="rule-instances-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search rules…"
            className="w-full bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/50"
          />
        </div>
        <span className="ml-auto text-2xs text-muted-foreground">{templateRules.length} templates</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {loading && <div className="py-16 text-center text-xs text-muted-foreground">Loading…</div>}
        {!loading && templateRules.length === 0 && (
          <div className="py-20 text-center text-sm text-muted-foreground">No rules.</div>
        )}
        {!loading && templateRules.length > 0 && (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border bg-card">
                <th className="py-2 pl-4 pr-3 text-left text-3xs font-bold uppercase tracking-widest text-muted-foreground">Rule</th>
                <th className="py-2 pr-3 text-left text-3xs font-bold uppercase tracking-widest text-muted-foreground">Category</th>
                <th className="py-2 pr-3 text-left text-3xs font-bold uppercase tracking-widest text-muted-foreground">Div</th>
                <th className="py-2 pr-3 text-left text-3xs font-bold uppercase tracking-widest text-muted-foreground">Severity</th>
                <th className="py-2 pr-3 text-left text-3xs font-bold uppercase tracking-widest text-muted-foreground">Source</th>
                <th className="py-2 pr-3 text-left text-3xs font-bold uppercase tracking-widest text-muted-foreground">Update By</th>
                <th className="py-2 pr-3 text-left text-3xs font-bold uppercase tracking-widest text-muted-foreground">Params</th>
                <th className="py-2 pr-4 text-left text-3xs font-bold uppercase tracking-widest text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {search && filtered.length === 0 && (
                <tr><td colSpan={8} className="py-10 text-center text-xs text-muted-foreground">No rules match the search</td></tr>
              )}
              {filtered.map((rule) => {
                const key = `${rule.function}-${rule.instance ?? ''}`
                return (
                  <RuleInstanceRow
                    key={rule.id}
                    rule={rule}
                    capabilities={capabilities}
                    onCopy={(r) => void copy(r.id)}
                    onDelete={(r) => setPendingDelete(r)}
                    forceExpand={focusKey === key}
                  />
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Delete confirm */}
      <AppDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => { if (!o) setPendingDelete(null) }}
        data-testid="rule-instance-delete-dialog"
        className="sm:max-w-[440px]"
        icon={<Trash2 className="h-4 w-4" />}
        title="Delete rule instance"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>Cancel</Button>
            <Button
              variant="destructive"
              data-testid="rule-instance-delete-confirm"
              onClick={() => {
                if (pendingDelete) void remove(pendingDelete.id)
                setPendingDelete(null)
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-xs text-foreground">
          Delete <span className="font-semibold">{pendingDelete ? ruleDisplayName(pendingDelete) : ''}</span>?
          This removes the instance from the catalog. Templates and rules used by a Rule Set cannot be deleted.
        </p>
      </AppDialog>
    </div>
  )
}
