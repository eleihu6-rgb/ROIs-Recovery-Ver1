// gantt/src/components/composition/composition-load-view.tsx
import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Plus } from 'lucide-react'
import { formatUiDate } from '@rois/ui'
import { useCompositionLoadStore } from '@/stores/composition-load-store'
import { CompositionLoadDialog } from './composition-load-dialog'
import { notify } from '@/utils/notify'
import type { CompositionLoad } from '@/types/composition'

export const CompositionLoadView = () => {
  const fetchAll          = useCompositionLoadStore((s) => s.fetchAll)
  const fetchCompositions = useCompositionLoadStore((s) => s.fetchCompositions)
  const items             = useCompositionLoadStore((s) => s.items)
  const compositions      = useCompositionLoadStore((s) => s.compositions)
  const loading           = useCompositionLoadStore((s) => s.loading)
  const filters           = useCompositionLoadStore((s) => s.filters)
  const setFilter         = useCompositionLoadStore((s) => s.setFilter)
  const clearFilters      = useCompositionLoadStore((s) => s.clearFilters)
  const remove            = useCompositionLoadStore((s) => s.remove)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editItem, setEditItem] = useState<CompositionLoad | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)

  useEffect(() => {
    void fetchAll()
    void fetchCompositions()
  }, [fetchAll, fetchCompositions])

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (filters.division && item.division !== filters.division) return false
      if (filters.sequence && String(item.sequence) !== filters.sequence.trim()) return false
      if (filters.fleet && !(item.fleet ?? '*').toLowerCase().includes(filters.fleet.toLowerCase())) return false
      if (filters.fltNum && !(item.fltNum ?? '*').toLowerCase().includes(filters.fltNum.toLowerCase())) return false
      if (filters.subFleet && item.subFleet !== filters.subFleet) return false
      if (filters.flightFlag && item.flightFlag !== filters.flightFlag) return false
      if (filters.flightAssignment && item.flightAssignment !== filters.flightAssignment) return false
      return true
    })
  }, [items, filters])

  const compName = (id: number | null) => {
    if (!id) return '-'
    return compositions.find((c) => c.id === id)?.name ?? String(id)
  }

  const handleDelete = (id: number) => {
    setDeleteId(id)
  }

  const confirmDelete = async () => {
    if (deleteId === null) return
    try {
      await remove(deleteId)
      notify.success('Deleted')
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Delete failed')
    }
    setDeleteId(null)
  }

  const inputCls = 'h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none'

  return (
    <div data-testid="composition-load-view" className="flex h-full flex-col overflow-hidden">
      {/* - Filter Bar - */}
      <div className="flex-shrink-0 border-b border-border bg-card px-4 py-2 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-2xs font-semibold text-muted-foreground w-16 text-right">Division</span>
          <input className={inputCls} placeholder="P / C" value={filters.division}
            onChange={(e) => setFilter({ division: e.target.value })} />
          <span className="text-2xs font-semibold text-muted-foreground w-16 text-right">Priority</span>
          <input className={inputCls} placeholder="1" value={filters.sequence} style={{ width: 60 }}
            onChange={(e) => setFilter({ sequence: e.target.value })} />
          <span className="text-2xs font-semibold text-muted-foreground w-10 text-right">Fleet</span>
          <input className={inputCls} placeholder="A330" value={filters.fleet}
            onChange={(e) => setFilter({ fleet: e.target.value })} />
          <span className="text-2xs font-semibold text-muted-foreground w-16 text-right">Flight No.</span>
          <input className={inputCls} placeholder="FU1234" value={filters.fltNum}
            onChange={(e) => setFilter({ fltNum: e.target.value })} />
          <div className="ml-auto flex items-center gap-1.5">
            <button onClick={clearFilters}
              className="h-7 px-3 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground">
              Reset
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-2xs font-semibold text-muted-foreground w-16 text-right">Sub Fleet</span>
          <input className={inputCls} value={filters.subFleet}
            onChange={(e) => setFilter({ subFleet: e.target.value })} />
          <span className="text-2xs font-semibold text-muted-foreground w-16 text-right">Flt Flag</span>
          <input className={inputCls} placeholder="A / C" value={filters.flightFlag}
            onChange={(e) => setFilter({ flightFlag: e.target.value })} />
          <span className="text-2xs font-semibold text-muted-foreground w-20 text-right">Flt Assign.</span>
          <input className={inputCls} placeholder="FLY / SBY" value={filters.flightAssignment}
            onChange={(e) => setFilter({ flightAssignment: e.target.value })} />
        </div>
      </div>

      {/* - Table Toolbar - */}
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-border px-4 py-1.5">
        <span className="text-xs text-muted-foreground">
          Total <strong className="text-foreground">{filtered.length}</strong> records
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={() => { void fetchAll(); void fetchCompositions() }}
            className="flex h-7 items-center gap-1 rounded-md border border-border px-3 text-xs text-muted-foreground hover:text-foreground">
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
          <button onClick={() => { setEditItem(null); setDialogOpen(true) }}
            className="flex h-7 items-center gap-1 rounded-md bg-primary/15 px-3 text-xs font-semibold text-primary hover:bg-primary/25">
            <Plus className="h-3 w-3" /> Add
          </button>
        </div>
      </div>

      {/* - Table - */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">Loading...</div>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="sticky top-0 z-10 bg-card">
                {['Filiale','Division','Priority','Fleet','Flight No.','Sub Fleet','Flt Flag','Flt Assign.',
                  'Svc Type','Seg Type','Load Factor%','Pax Num','DEP Time','ARR Time',
                  'Effective Date','Expiry Date','DoW','Description','BLH','Composition','Option','Action'
                ].map((h) => (
                  <th key={h} className="border-b border-border px-3 py-2 text-left text-2xs font-bold text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={22} className="py-12 text-center text-xs text-muted-foreground">
                    No records match the current filters.
                  </td>
                </tr>
              )}
              {filtered.map((row) => (
                <tr key={row.id} data-testid="composition-load-row" className="border-b border-border/50 hover:bg-card/80">
                  <td className="px-3 py-1.5 whitespace-nowrap">{row.filiale}</td>
                  <td className="px-3 py-1.5">{row.division}</td>
                  <td className="px-3 py-1.5">{row.sequence}</td>
                  <td className="px-3 py-1.5">{row.fleet ?? '*'}</td>
                  <td className="px-3 py-1.5">{row.fltNum ?? '*'}</td>
                  <td className="px-3 py-1.5">{row.subFleet ?? '*'}</td>
                  <td className="px-3 py-1.5">
                    {row.flightFlag && (
                      <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-3xs font-bold text-blue-400">
                        {row.flightFlag}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    {row.flightAssignment && (
                      <span className="rounded bg-green-500/12 px-1.5 py-0.5 text-3xs font-bold text-green-400">
                        {row.flightAssignment}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5">{row.serviceType ?? '*'}</td>
                  <td className="px-3 py-1.5">{row.segType ?? '*'}</td>
                  <td className="px-3 py-1.5">{row.loadFactor ?? '*'}</td>
                  <td className="px-3 py-1.5">{row.paxNum ?? '*'}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{row.departureTime ?? '-'}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{row.arrivalTime ?? '-'}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{row.effDt ? formatUiDate(row.effDt.slice(0, 10)) : '-'}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{row.expDt ? formatUiDate(row.expDt.slice(0, 10)) : '-'}</td>
                  <td className="px-3 py-1.5">{row.dow}</td>
                  <td className="max-w-[120px] truncate px-3 py-1.5">{row.description ?? '-'}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    {row.blhLow && row.blhUpper ? `${row.blhLow}-${row.blhUpper}` : '-'}
                  </td>
                  <td className="px-3 py-1.5 text-primary whitespace-nowrap">{compName(row.compId)}</td>
                  <td className="px-3 py-1.5">{row.optionId ?? '-'}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    <button
                      onClick={() => { setEditItem(row); setDialogOpen(true) }}
                      className="mr-2 text-primary hover:underline text-2xs font-semibold"
                    >Edit</button>
                    <button
                      onClick={() => handleDelete(row.id)}
                      className="text-destructive hover:underline text-2xs font-semibold"
                    >Del</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CompositionLoadDialog
        open={dialogOpen}
        editItem={editItem}
        onClose={() => setDialogOpen(false)}
      />

      {/* Delete confirmation dialog */}
      {deleteId !== null && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/25" onClick={() => setDeleteId(null)}>
          <div className="rounded-lg border border-border bg-card p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="mb-3 text-sm">Delete this load rule?</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteId(null)} className="px-3 py-1 text-xs rounded border border-border text-muted-foreground hover:text-foreground">Cancel</button>
              <button onClick={confirmDelete} className="px-3 py-1 text-xs rounded bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}