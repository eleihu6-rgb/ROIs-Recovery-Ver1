import { Loader2 } from 'lucide-react'
import type { ChangeEntry } from './param-editor-reducer'

const BADGE: Record<ChangeEntry['type'], { label: string; cls: string }> = {
  EDIT:  { label: 'EDIT',  cls: 'bg-blue-100 text-blue-700' },
  DEL:   { label: 'DEL',   cls: 'bg-red-100 text-red-700' },
  ADD:   { label: 'ADD',   cls: 'bg-green-100 text-green-700' },
  COPY:  { label: 'COPY',  cls: 'bg-purple-100 text-purple-700' },
  MOVE:  { label: 'MOVE',  cls: 'bg-muted text-muted-foreground' },
}

const entryLabel = (e: ChangeEntry): string => {
  switch (e.type) {
    case 'EDIT':  return `col ${e.colIdx}: ${e.before || '—'} → ${e.after || '—'}`
    case 'DEL':   return `row ${e.rowIdx + 1} deleted`
    case 'ADD':   return `row ${e.rowIdx + 1} added`
    case 'COPY':  return `row ${e.fromRowIdx + 1} copied`
    case 'MOVE':  return `row ${e.fromIdx + 1} → ${e.toIdx + 1}`
  }
}

interface Props {
  history: ChangeEntry[]
  saving: boolean
  saveError: string | null
  onUndo: () => void
  onSaveAll: () => void
}

export const ParamChangeLogPanel = ({ history, saving, saveError, onUndo, onSaveAll }: Props) => {
  const dirty = history.length > 0

  return (
    <div
      data-testid="param-change-log-panel"
      className="flex w-44 shrink-0 flex-col rounded-md border border-border bg-background text-xs overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-muted/40 px-2.5 py-1.5">
        <span className="text-3xs font-bold uppercase tracking-wide text-muted-foreground">
          Changes {dirty ? `(${history.length})` : ''}
        </span>
        <button
          data-testid="param-undo-btn"
          onClick={onUndo}
          disabled={!dirty || saving}
          className="text-3xs font-semibold text-primary disabled:text-muted-foreground disabled:cursor-not-allowed hover:underline"
        >
          ⟲ Undo
        </button>
      </div>

      {/* Entry list */}
      <div className="flex-1 overflow-y-auto">
        {history.length === 0 ? (
          <p className="px-2.5 py-3 text-3xs text-muted-foreground italic">No changes yet</p>
        ) : (
          [...history].reverse().map((entry, i) => {
            const badge = BADGE[entry.type]
            return (
              <div
                key={i}
                data-testid={`param-change-entry-${history.length - 1 - i}`}
                className={`flex items-start gap-1.5 border-b border-border/40 px-2.5 py-1.5 last:border-0 ${i === 0 ? 'bg-amber-50/60' : ''}`}
              >
                <span className={`mt-0.5 shrink-0 rounded px-1 py-0 text-3xs font-bold ${badge.cls}`}>
                  {badge.label}
                </span>
                <span className="text-3xs text-muted-foreground leading-tight break-all">
                  {entryLabel(entry)}
                </span>
              </div>
            )
          })
        )}
      </div>

      {/* Save All */}
      <div className="border-t border-border p-2">
        {saveError && (
          <p className="mb-1.5 text-3xs text-destructive">{saveError}</p>
        )}
        <button
          data-testid="param-save-all-btn"
          onClick={onSaveAll}
          disabled={!dirty || saving}
          className="flex w-full items-center justify-center gap-1.5 rounded bg-primary px-2 py-1.5 text-2xs font-semibold text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/90"
        >
          {saving ? <Loader2 className="h-3 w-3 shrink-0 animate-spin" /> : null}
          {saving ? 'Saving…' : 'Save All'}
        </button>
      </div>
    </div>
  )
}
