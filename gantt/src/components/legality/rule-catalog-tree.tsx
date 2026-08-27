import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronRight, ChevronDown, Star, Plus, Copy as CopyIcon, Trash2, Search, Trees } from 'lucide-react'
import { AppDialog, Button } from '@rois/ui'
import { legalityApi } from '@/services/legality-api'
import { useLegalityStore } from '@/stores/legality-store'
import { usePermission } from '@/hooks/use-permission'
import { notify } from '@/utils/notify'
import type { LegalityCatalogRule } from '@/types/legality'

// ── Tree data structures ──────────────────────────────────────────────────────

interface FunctionNode {
  functionCode: number
  description: string | null
  instances: LegalityCatalogRule[]
}
interface CategoryNode {
  category: string
  functions: FunctionNode[]
}
interface ReferenceNode {
  reference: string
  categories: CategoryNode[]
}

/** Group catalog rules into 4-level hierarchy. null → "(No Reference)" / "(No Category)". */
const buildTree = (catalog: LegalityCatalogRule[]): ReferenceNode[] => {
  const refMap = new Map<string, Map<string, Map<number, LegalityCatalogRule[]>>>()
  for (const rule of catalog) {
    const ref = rule.reference ?? '(No Reference)'
    const cat = rule.category ?? '(No Category)'
    if (!refMap.has(ref)) refMap.set(ref, new Map())
    const catMap = refMap.get(ref)!
    if (!catMap.has(cat)) catMap.set(cat, new Map())
    const fnMap = catMap.get(cat)!
    if (!fnMap.has(rule.function)) fnMap.set(rule.function, [])
    fnMap.get(rule.function)!.push(rule)
  }
  return Array.from(refMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([ref, catMap]) => ({
    reference: ref,
    categories: Array.from(catMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([cat, fnMap]) => ({
      category: cat,
      functions: Array.from(fnMap.entries()).sort(([a], [b]) => a - b).map(([fn, instances]) => ({
        functionCode: fn,
        description: instances[0]?.description ?? null,
        instances: [...instances].sort((a, b) => (a.instance ?? '').localeCompare(b.instance ?? '')),
      })),
    })),
  }))
}

/** Return true if a rule matches the search query. */
const ruleMatches = (rule: LegalityCatalogRule, q: string): boolean => {
  const lq = q.toLowerCase()
  return (
    String(rule.function).includes(lq) ||
    (rule.reference?.toLowerCase().includes(lq) ?? false) ||
    (rule.category?.toLowerCase().includes(lq) ?? false) ||
    (rule.description?.toLowerCase().includes(lq) ?? false) ||
    (rule.instance?.toLowerCase().includes(lq) ?? false)
  )
}

// ── Search highlight ──────────────────────────────────────────────────────────

const HL = 'rounded bg-yellow-200 text-yellow-900 dark:bg-yellow-700/50 dark:text-yellow-100'

function applyHighlight(text: string, query: string) {
  if (!query || !text) return text
  const lq = query.toLowerCase()
  const lt = text.toLowerCase()
  let i = lt.indexOf(lq)
  if (i === -1) return text
  const out: ReactNode[] = []
  let c = 0
  while (i !== -1) {
    if (i > c) out.push(text.slice(c, i))
    out.push(<span key={i} className={HL}>{text.slice(i, i + lq.length)}</span>)
    c = i + lq.length
    i = lt.indexOf(lq, c)
  }
  if (c < text.length) out.push(text.slice(c))
  return <>{out}</>
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  width?: number
  onHide?: () => void
}

export const RuleCatalogTree = ({ width = 160, onHide }: Props) => {
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  // Keys = `ref::cat::fn` or `ref::cat`; top-level refs always start open
  const [openNodes, setOpenNodes] = useState<Set<string>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState<LegalityCatalogRule | null>(null)
  const [deleting, setDeleting] = useState(false)
  // Rule-instance management ctl (covers /api/legality/rule POST/DELETE). Admins get
  // every ctl via buildAdminContext(); non-admins must be granted BTN_EDIT on
  // LEGALITY_RULE_INSTANCES to add/copy/delete instances.
  const { canAccessCtl } = usePermission()
  const canManageInstance = canAccessCtl('LEGALITY_RULE_INSTANCES', 'BTN_EDIT')
  const selectedId = useLegalityStore((s) => s.selectedId)
  const selectedCatalogRuleId = useLegalityStore((s) => s.selectedCatalogRuleId)
  const selectCatalogRule = useLegalityStore((s) => s.selectCatalogRule)
  const catalog = useLegalityStore((s) => s.catalogRules)
  const setCatalogRules = useLegalityStore((s) => s.setCatalogRules)
  const storeRules = useLegalityStore((s) => s.rules)
  const rulesInSet = useMemo(() => new Set(storeRules.map((r) => r.id)), [storeRules])
  const addRule = useLegalityStore((s) => s.addRule)

  const loadCatalog = useCallback(async () => {
    setLoading(true)
    try {
      const rules = await legalityApi.listRules()
      setCatalogRules(rules)
      // Expand all top-level reference nodes by default
      setOpenNodes((prev) => {
        const next = new Set(prev)
        const unique = new Set(rules.map((r) => r.reference ?? '(No Reference)'))
        unique.forEach((ref) => next.add(`ref::${ref}`))
        return next
      })
    } catch {
      notify.error('Failed to load rule catalog')
    } finally {
      setLoading(false)
    }
  }, [setCatalogRules])

  useEffect(() => { void loadCatalog() }, [loadCatalog])

  const toggle = (key: string) => setOpenNodes((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  // Filter catalog by search, then rebuild tree
  const filtered = useMemo(
    () => (search ? catalog.filter((r) => ruleMatches(r, search)) : catalog),
    [search, catalog],
  )
  const tree = useMemo(() => buildTree(filtered), [filtered])

  // When searching, auto-expand every ancestor of matched instances
  const autoExpandKeys = useMemo(() => {
    if (!search) return new Set<string>()
    const keys = new Set<string>()
    for (const rule of filtered) {
      const ref = rule.reference ?? '(No Reference)'
      const cat = rule.category ?? '(No Category)'
      keys.add(`ref::${ref}`)
      keys.add(`ref::${ref}::cat::${cat}`)
      keys.add(`ref::${ref}::cat::${cat}::fn::${rule.function}`)
    }
    return keys
  }, [filtered, search])

  const isOpen = (key: string) => search ? autoExpandKeys.has(key) : openNodes.has(key)

  const handleAddToSet = async (rule: LegalityCatalogRule) => {
    if (selectedId == null) return
    try {
      await addRule(rule.id)
      notify.success(`Rule ${rule.function}/${rule.instance ?? ''} added to set`)
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Failed to add rule to set')
    }
  }

  const handleCopy = async (rule: LegalityCatalogRule) => {
    try {
      const copy = await legalityApi.copyRule(rule.id)
      notify.success(`Copied to instance ${copy.instance ?? ''}`)
      await loadCatalog()
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Copy failed')
    }
  }

  const handleDeleteConfirm = async () => {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      await legalityApi.deleteRule(confirmDelete.id)
      notify.success(`Deleted rule ${confirmDelete.function}/${confirmDelete.instance ?? ''}`)
      setConfirmDelete(null)
      await loadCatalog()
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div
      data-testid="rule-catalog-tree"
      className="flex shrink-0 flex-col border-r border-border bg-card"
      style={{ width }}
    >
      {/* Header */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-4">
        <button
          type="button"
          data-testid="legality-rule-instances-hide"
          title="Hide Rule Instances"
          aria-label="Hide Rule Instances"
          onClick={onHide}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Trees className="h-4 w-4 shrink-0" />
        </button>
        <span className="flex-1 text-xs font-semibold text-foreground">Rule Instances</span>
      </div>

      {/* Search */}
      <div className="shrink-0 border-b border-border px-2 py-1.5">
        <div className="flex h-6 items-center gap-1.5 rounded border border-border bg-background px-2">
          <Search className="h-3 w-3 shrink-0 text-muted-foreground/50" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search rules…"
            className="w-full bg-transparent text-2xs text-foreground outline-none placeholder:text-muted-foreground/50"
          />
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {loading && (
          <div className="py-8 text-center text-xs text-muted-foreground">Loading…</div>
        )}
        {!loading && tree.length === 0 && (
          <div className="py-8 text-center text-xs text-muted-foreground">No rules found</div>
        )}
        {tree.map((refNode) => {
          const refKey = `ref::${refNode.reference}`
          const refOpen = isOpen(refKey)
          return (
            <div key={refNode.reference}>
              {/* Level 1: Reference */}
              <button
                type="button"
                onClick={() => toggle(refKey)}
                className="flex w-full items-center gap-1.5 px-2 py-1 text-left hover:bg-accent/40"
              >
                {refOpen ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />}
                <span className="truncate text-xs font-semibold text-foreground">{applyHighlight(refNode.reference, search)}</span>
              </button>

              {refOpen && refNode.categories.map((catNode) => {
                const catKey = `ref::${refNode.reference}::cat::${catNode.category}`
                const catOpen = isOpen(catKey)
                return (
                  <div key={catNode.category}>
                    {/* Level 2: Category */}
                    <button
                      type="button"
                      onClick={() => toggle(catKey)}
                      className="flex w-full items-center gap-1.5 py-0.5 pl-5 pr-2 text-left hover:bg-accent/40"
                    >
                      {catOpen ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />}
                      <span className="truncate text-xs text-muted-foreground">{applyHighlight(catNode.category, search)}</span>
                    </button>

                    {catOpen && catNode.functions.map((fnNode) => {
                      const fnKey = `ref::${refNode.reference}::cat::${catNode.category}::fn::${fnNode.functionCode}`
                      const fnOpen = isOpen(fnKey)
                      return (
                        <div key={fnNode.functionCode}>
                          {/* Level 3: Function */}
                          <button
                            type="button"
                            onClick={() => toggle(fnKey)}
                            className="flex w-full items-center gap-1.5 py-0.5 pl-8 pr-2 text-left hover:bg-accent/40"
                          >
                            {fnOpen ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />}
                            <span className="truncate text-xs text-foreground">
                              <span className="font-mono">{applyHighlight(String(fnNode.functionCode), search)}</span>
                              {fnNode.description && <span className="ml-1 text-muted-foreground">{applyHighlight(fnNode.description, search)}</span>}
                            </span>
                          </button>

                          {fnOpen && fnNode.instances.map((rule) => {
                            const inSet = rulesInSet.has(rule.id)
                            const noSet = selectedId == null
                            const selected = selectedCatalogRuleId === rule.id
                            return (
                              <div
                                key={rule.id}
                                role="button"
                                tabIndex={0}
                                data-testid={`catalog-instance-${rule.function}-${rule.instance ?? ''}`}
                                onClick={() => selectCatalogRule(rule.id)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    selectCatalogRule(rule.id)
                                  }
                                }}
                                className={[
                                  'group flex cursor-pointer items-center gap-1 py-0.5 pl-11 pr-2',
                                  selected ? 'bg-accent' : 'hover:bg-accent/40',
                                ].join(' ')}
                              >
                                {/* Level 4: Instance */}
                                {rule.isTemplate ? (
                                  <Star className="h-3 w-3 shrink-0 text-amber-500" />
                                ) : (
                                  <span className="h-3 w-3 shrink-0" />
                                )}
                                <span className={`flex-1 font-mono text-xs ${rule.isTemplate ? 'font-medium text-amber-600 dark:text-amber-400' : 'text-foreground'}`}>
                                  {applyHighlight(rule.instance ?? '?', search)}
                                </span>
                                {rule.isTemplate && (
                                  <span className="rounded bg-amber-100 px-1 py-0.5 text-3xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                    Template
                                  </span>
                                )}
                                {/* Actions (hover-revealed; gated by LEGALITY_RULE_INSTANCES BTN_EDIT) */}
                                {canManageInstance && (
                                  <div className="ml-1 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                    <button
                                      type="button"
                                      data-testid={`catalog-add-${rule.id}`}
                                      onClick={(e) => { e.stopPropagation(); void handleAddToSet(rule) }}
                                      disabled={noSet || inSet}
                                      title={noSet ? 'Select a rule set first' : inSet ? 'Already in this set' : 'Add to set'}
                                      className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-30"
                                    >
                                      <Plus className="h-3 w-3" />
                                    </button>
                                    <button
                                      type="button"
                                      data-testid={`catalog-copy-${rule.id}`}
                                      onClick={(e) => { e.stopPropagation(); void handleCopy(rule) }}
                                      title="Copy to new instance"
                                      className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-primary/10 hover:text-primary"
                                    >
                                      <CopyIcon className="h-3 w-3" />
                                    </button>
                                    {!rule.isTemplate && (
                                      <button
                                        type="button"
                                        data-testid={`catalog-delete-${rule.id}`}
                                        onClick={(e) => { e.stopPropagation(); setConfirmDelete(rule) }}
                                        title="Delete this instance"
                                        className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* Delete confirmation dialog */}
      <AppDialog
        open={confirmDelete !== null}
        onOpenChange={(o) => { if (!o && !deleting) setConfirmDelete(null) }}
        data-testid="catalog-delete-dialog"
        className="sm:max-w-[400px]"
        icon={<Trash2 className="h-4 w-4" />}
        title="Delete Rule Instance"
        dismissable={!deleting}
        footer={
          <>
            <Button variant="ghost" disabled={deleting} onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="destructive" disabled={deleting} onClick={() => void handleDeleteConfirm()}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </>
        }
      >
        <p className="text-xs text-foreground">
          Delete rule{' '}
          <span className="font-mono font-semibold">
            {confirmDelete?.function}/{confirmDelete?.instance ?? ''}
          </span>
          ? This cannot be undone. The rule must not be a member of any set.
        </p>
      </AppDialog>
    </div>
  )
}
