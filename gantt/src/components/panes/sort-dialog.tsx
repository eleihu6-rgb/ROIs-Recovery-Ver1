import { useEffect, useState } from 'react'
import { AppDialog, Button } from '@rois/ui'
import { ArrowUpDown, ChevronRight, ChevronLeft, ChevronUp, ChevronDown } from 'lucide-react'
import type { SortCriterion } from '@/stores/pane-store'

/** A field the user may sort by (derived from a pane's column config). */
export interface SortField {
  key: string
  label: string
}

interface SortDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Shown as the single pane tab (placeholder for future multi-pane tabs). */
  paneLabel: string
  /** All sortable fields for this pane. */
  fields: SortField[]
  /** Current committed criteria (used to seed the dialog when it opens). */
  initialCriteria: SortCriterion[]
  /** Commit handler — called on Apply with the new priority-ordered criteria. */
  onApply: (criteria: SortCriterion[]) => void
}

/**
 * Universal Sorting dialog. Dual list (Sort Item / Selected Item + Priority) with
 * arrow buttons and double-click to move between lists; a single global Asc/Desc
 * applies to all selected criteria. Built on the standard @rois/ui AppDialog.
 */
export const SortDialog = ({ open, onOpenChange, paneLabel, fields, initialCriteria, onApply }: SortDialogProps) => {
  const [selected, setSelected] = useState<string[]>([])
  const [order, setOrder] = useState<'asc' | 'desc'>('asc')
  const [availHi, setAvailHi] = useState<string | null>(null)
  const [selHi, setSelHi] = useState<string | null>(null)

  // Seed local state from the committed criteria on the open rising-edge only.
  // Depending on `open` alone (not `initialCriteria`) avoids clobbering an in-progress
  // draft if the parent ever passes a fresh array reference while the dialog is open.
  useEffect(() => {
    if (!open) return
    setSelected(initialCriteria.map((c) => c.column))
    setOrder(initialCriteria[0]?.direction ?? 'asc')
    setAvailHi(null)
    setSelHi(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const labelOf = (key: string): string => fields.find((f) => f.key === key)?.label ?? key
  const available = fields.filter((f) => !selected.includes(f.key)).map((f) => f.key)

  const moveToSelected = (key: string): void => {
    setSelected((prev) => (prev.includes(key) ? prev : [...prev, key]))
    setAvailHi(null)
    setSelHi(key)
  }
  const moveToAvailable = (key: string): void => {
    setSelected((prev) => prev.filter((k) => k !== key))
    setSelHi(null)
    setAvailHi(key)
  }
  const moveUp = (key: string): void => {
    setSelected((prev) => {
      const i = prev.indexOf(key)
      if (i <= 0) return prev
      const next = [...prev]
      ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
      return next
    })
  }
  const moveDown = (key: string): void => {
    setSelected((prev) => {
      const i = prev.indexOf(key)
      if (i < 0 || i >= prev.length - 1) return prev
      const next = [...prev]
      ;[next[i + 1], next[i]] = [next[i], next[i + 1]]
      return next
    })
  }

  const handleApply = (): void => {
    onApply(selected.map((column) => ({ column, direction: order })))
    onOpenChange(false)
  }

  const moveBtn = 'inline-flex h-7 w-7 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-accent disabled:opacity-40'

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      data-testid="sort-dialog"
      className="sm:max-w-[680px]"
      bodyClassName="p-0"
      icon={<ArrowUpDown className="h-4 w-4" />}
      title="Universal Sorting"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} data-testid="sort-cancel">Cancel</Button>
          <Button onClick={handleApply} data-testid="sort-apply">Apply</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 p-4">
        {/* Single pane tab (placeholder for future multi-pane tabs) */}
        <div className="flex items-center gap-1 border-b border-border">
          <span className="rounded-t bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{paneLabel}</span>
        </div>

        <div className="flex items-stretch gap-2">
          {/* Sort Item (available) */}
          <div className="flex-1" data-testid="sort-available">
            <div className="border-b border-border bg-muted/40 px-2 py-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
              Sort Item
            </div>
            <ul className="h-56 overflow-auto rounded-sm border border-border">
              {available.map((key) => (
                <li
                  key={key}
                  data-testid={`sort-available-${key}`}
                  onClick={() => setAvailHi(key)}
                  onDoubleClick={() => moveToSelected(key)}
                  className={['cursor-pointer px-2 py-1 text-xs', availHi === key ? 'bg-primary/15 text-primary' : 'hover:bg-accent/50'].join(' ')}
                >
                  {labelOf(key)}
                </li>
              ))}
            </ul>
          </div>

          {/* Move controls */}
          <div className="flex flex-col items-center justify-center gap-2">
            <button type="button" data-testid="sort-move-right" disabled={!availHi} onClick={() => availHi && moveToSelected(availHi)} className={moveBtn} title="Add to sort">
              <ChevronRight className="h-4 w-4" />
            </button>
            <button type="button" data-testid="sort-move-left" disabled={!selHi} onClick={() => selHi && moveToAvailable(selHi)} className={moveBtn} title="Remove from sort">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button type="button" data-testid="sort-move-up" disabled={!selHi || selected.indexOf(selHi) <= 0} onClick={() => selHi && moveUp(selHi)} className={moveBtn} title="Raise priority">
              <ChevronUp className="h-4 w-4" />
            </button>
            <button type="button" data-testid="sort-move-down" disabled={!selHi || selected.indexOf(selHi) >= selected.length - 1} onClick={() => selHi && moveDown(selHi)} className={moveBtn} title="Lower priority">
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>

          {/* Selected Item + Priority */}
          <div className="flex-1" data-testid="sort-selected">
            <div className="flex border-b border-border bg-muted/40 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span className="flex-1 px-2 py-1">Selected Item</span>
              <span className="w-14 border-l border-border px-2 py-1 text-center">Priority</span>
            </div>
            <ul className="h-56 overflow-auto rounded-sm border border-border">
              {selected.map((key, idx) => (
                <li
                  key={key}
                  data-testid={`sort-selected-${key}`}
                  onClick={() => setSelHi(key)}
                  onDoubleClick={() => moveToAvailable(key)}
                  className={['flex cursor-pointer text-xs', selHi === key ? 'bg-primary/15 text-primary' : 'hover:bg-accent/50'].join(' ')}
                >
                  <span className="flex-1 px-2 py-1">{labelOf(key)}</span>
                  <span className="w-14 border-l border-border px-2 py-1 text-center font-mono tabular-nums">{idx + 1}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Sort order — single global radio for all selected criteria */}
        <div className="flex items-center gap-4 text-xs">
          <span className="text-muted-foreground">Sort Order:</span>
          <label className="flex items-center gap-1.5">
            <input type="radio" name={`sort-order-${paneLabel}`} checked={order === 'asc'} onChange={() => setOrder('asc')} data-testid="sort-order-asc" />
            Ascending
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" name={`sort-order-${paneLabel}`} checked={order === 'desc'} onChange={() => setOrder('desc')} data-testid="sort-order-desc" />
            Descending
          </label>
        </div>
      </div>
    </AppDialog>
  )
}
