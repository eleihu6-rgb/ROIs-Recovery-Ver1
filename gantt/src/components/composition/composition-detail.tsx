// gantt/src/components/composition/composition-detail.tsx
import { useState } from 'react'
import { Pencil, Trash2, X, Check } from 'lucide-react'
import { useCompositionStore } from '@/stores/composition-store'
import { RankOptionMatrix } from './rank-option-matrix'
import { notify } from '@/utils/notify'
import type { CreateCompositionData } from '@/types/composition'

export const CompositionDetail = () => {
  const compositions       = useCompositionStore((s) => s.compositions)
  const selectedId         = useCompositionStore((s) => s.selectedId)
  const updateComposition  = useCompositionStore((s) => s.updateComposition)
  const removeComposition  = useCompositionStore((s) => s.removeComposition)

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Partial<CreateCompositionData>>({})
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const comp = compositions.find((c) => c.id === selectedId)

  if (!comp) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        Select a composition from the tree
      </div>
    )
  }

  const hierarchyLabel = comp.hierarchy === 2 ? 'Enhanced (L2)' : 'Standard (L1)'

  const startEdit = () => {
    setForm({
      name: comp.name,
      nameDesc: comp.nameDesc ?? '',
      division: comp.division,
      displayOrder: comp.displayOrder,
      hierarchy: comp.hierarchy ?? 1,
      filiale: comp.filiale ?? undefined,
    })
    setEditing(true)
  }

  const handleSave = async () => {
    if (!form.name?.trim() || !form.division?.trim()) {
      notify.error('Name and Division are required')
      return
    }
    setSaving(true)
    try {
      await updateComposition(comp.id, {
        ...form,
        nameDesc: form.nameDesc || null,
      })
      notify.success('Composition updated')
      setEditing(false)
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Delete composition "${comp.name}"? This cannot be undone.`)) return
    setDeleting(true)
    try {
      await removeComposition(comp.id)
      notify.success('Composition deleted')
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  const inputCls = 'h-7 w-full rounded border border-border bg-background px-2 text-xs text-foreground focus:border-primary focus:outline-none'
  const cellLabel = 'bg-card/50 px-3 py-2 text-2xs font-semibold text-muted-foreground border-r border-border flex items-center min-w-[90px]'
  const cellValue = 'px-3 py-2 text-xs text-foreground flex items-center'

  return (
    <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
      {/* ── Header info ── */}
      <div className="flex-shrink-0 border-b border-border">
        {/* Title row */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border">
          <span className="text-sm font-bold text-foreground">{comp.name}</span>
          <span className="rounded bg-violet-500/15 px-2 py-0.5 text-3xs font-bold text-violet-400">
            {hierarchyLabel}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            {editing ? (
              <>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="flex h-7 items-center gap-1 rounded border border-border px-2.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" /> Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="flex h-7 items-center gap-1 rounded bg-primary px-2.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  <Check className="h-3 w-3" /> {saving ? 'Saving…' : 'Save'}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={startEdit}
                  className="flex h-7 items-center gap-1 rounded border border-border px-2.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="h-3 w-3" /> Edit
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex h-7 items-center gap-1 rounded bg-destructive/10 px-2.5 text-xs text-destructive hover:bg-destructive/20 disabled:opacity-50"
                >
                  <Trash2 className="h-3 w-3" /> {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-4 border-b border-border">
          {/* Row 1 */}
          <div className="flex border-r border-border">
            <div className={cellLabel}>Name</div>
            <div className={cellValue + ' flex-1'}>
              {editing
                ? <input className={inputCls} value={form.name ?? ''} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                : comp.name}
            </div>
          </div>
          <div className="flex border-r border-border">
            <div className={cellLabel}>Division</div>
            <div className={cellValue + ' flex-1'}>
              {editing
                ? <input className={inputCls} value={form.division ?? ''} onChange={(e) => setForm((f) => ({ ...f, division: e.target.value }))} />
                : comp.division}
            </div>
          </div>
          <div className="flex border-r border-border">
            <div className={cellLabel}>Display Order</div>
            <div className={cellValue + ' flex-1'}>
              {editing
                ? <input className={inputCls} type="number" value={form.displayOrder ?? ''} onChange={(e) => setForm((f) => ({ ...f, displayOrder: parseInt(e.target.value) || 0 }))} />
                : comp.displayOrder}
            </div>
          </div>
          <div className="flex">
            <div className={cellLabel}>Hierarchy</div>
            <div className={cellValue + ' flex-1'}>
              {editing
                ? (
                  <select className={inputCls} value={form.hierarchy ?? 1} onChange={(e) => setForm((f) => ({ ...f, hierarchy: parseInt(e.target.value) }))}>
                    <option value={1}>1 — Standard</option>
                    <option value={2}>2 — Enhanced</option>
                  </select>
                )
                : hierarchyLabel}
            </div>
          </div>

          {/* Row 2 */}
          <div className="col-span-4 flex border-t border-border">
            <div className={cellLabel}>Description</div>
            <div className={cellValue + ' flex-1'}>
              {editing
                ? <input className={inputCls} value={form.nameDesc ?? ''} onChange={(e) => setForm((f) => ({ ...f, nameDesc: e.target.value }))} placeholder="Optional description" />
                : (comp.nameDesc ?? '—')}
            </div>
          </div>
        </div>
      </div>

      {/* ── Rank × Option matrix ── */}
      <RankOptionMatrix />
    </div>
  )
}