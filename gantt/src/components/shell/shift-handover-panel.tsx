import { useEffect, useState } from 'react'
import { AppDialog, Button, Input } from '@rois/ui'
import { ClipboardList, Plus, RefreshCw } from 'lucide-react'
import {
  dashboardApi,
  type HandoverEntry,
  type HandoverSeverity,
} from '@/services/dashboard-service'
import { RECOVERY_CASES } from '@/config/recovery-cases'
import { notify } from '@/utils/notify'

const SHIFT_LABELS = ['Day', 'Night', 'Early', 'Late'] as const
const SEVERITIES: HandoverSeverity[] = ['info', 'watch', 'critical']

const SEVERITY_STYLE: Record<HandoverSeverity, string> = {
  critical: 'border-destructive/30 bg-destructive/10 text-destructive',
  watch: 'border-ring/30 bg-ring/10 text-ring',
  info: 'border-border bg-muted text-muted-foreground',
}

/** Compact "3h ago" / "2d ago" from an ISO timestamp. */
const relativeTime = (iso: string): string => {
  const diffMs = Date.now() - Date.parse(iso)
  if (!Number.isFinite(diffMs)) return ''
  const mins = Math.round(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  return `${days}d ago`
}

const SeverityBadge = ({ severity }: { severity: HandoverSeverity }) => (
  <span
    className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-[0.04em] ${
      SEVERITY_STYLE[severity] ?? SEVERITY_STYLE.info
    }`}
  >
    {severity}
  </span>
)

const EntryRow = ({ entry }: { entry: HandoverEntry }) => (
  <li className="border-t border-border py-2.5 first:border-t-0 first:pt-0">
    <div className="flex items-center gap-2">
      <SeverityBadge severity={(entry.severity as HandoverSeverity) ?? 'info'} />
      <span className="text-2xs font-semibold text-foreground">{entry.shiftLabel}</span>
      <span className="text-3xs text-muted-foreground">{entry.author}</span>
      {entry.caseRef && (
        <span className="rounded-sm bg-muted px-1.5 py-0.5 text-3xs font-medium text-muted-foreground">
          {entry.caseRef}
        </span>
      )}
      <span className="ml-auto text-3xs tabular-nums text-muted-foreground">
        {relativeTime(entry.createdAt)}
      </span>
    </div>
    <p className="mt-1 text-2xs leading-relaxed text-foreground">{entry.note}</p>
  </li>
)

// ─── Add-entry dialog ────────────────────────────────────────────────────────
const AddHandoverDialog = ({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdded: (entry: HandoverEntry) => void
}) => {
  const [shiftLabel, setShiftLabel] = useState<string>('Day')
  const [author, setAuthor] = useState('')
  const [severity, setSeverity] = useState<HandoverSeverity>('info')
  const [caseRef, setCaseRef] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setShiftLabel('Day')
      setAuthor('')
      setSeverity('info')
      setCaseRef('')
      setNote('')
      setBusy(false)
    }
  }, [open])

  const handleSave = async () => {
    if (!author.trim()) {
      notify.info('Author is required')
      return
    }
    if (!note.trim()) {
      notify.info('Handover note is required')
      return
    }
    setBusy(true)
    try {
      const saved = await dashboardApi.handoverAdd({
        shiftLabel,
        author: author.trim(),
        severity,
        caseRef: caseRef || null,
        note: note.trim(),
      })
      onAdded(saved)
      onOpenChange(false)
      notify.success('Handover entry added')
    } catch {
      notify.error('Could not add the handover entry')
    } finally {
      setBusy(false)
    }
  }

  const fieldLabel = 'flex flex-col gap-1 text-3xs font-medium text-muted-foreground'
  const selectCls =
    'w-full rounded-sm border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none'

  return (
    <AppDialog
      open={open}
      onOpenChange={(o) => {
        if (!busy) onOpenChange(o)
      }}
      variant="panel"
      data-testid="handover-dialog"
      className="sm:max-w-[480px]"
      icon={<ClipboardList className="h-4 w-4" />}
      title="Add Handover Entry"
      description="Crew-control shift book"
      dismissable={!busy}
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => void handleSave()} data-testid="handover-save">
            Add
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 py-1">
        <div className="grid grid-cols-2 gap-3">
          <label className={fieldLabel}>
            Shift
            <select
              className={selectCls}
              value={shiftLabel}
              onChange={(e) => setShiftLabel(e.target.value)}
              data-testid="handover-shift"
            >
              {SHIFT_LABELS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className={fieldLabel}>
            Severity
            <select
              className={selectCls}
              value={severity}
              onChange={(e) => setSeverity(e.target.value as HandoverSeverity)}
              data-testid="handover-severity"
            >
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className={fieldLabel}>
            Author
            <Input
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="e.g. A. Bekele"
              data-testid="handover-author"
            />
          </label>
          <label className={fieldLabel}>
            Related case (optional)
            <select
              className={selectCls}
              value={caseRef}
              onChange={(e) => setCaseRef(e.target.value)}
              data-testid="handover-caseref"
            >
              <option value="">—</option>
              {RECOVERY_CASES.map((rc) => (
                <option key={rc.id} value={rc.id}>
                  Case {rc.caseNo} · {rc.trigger}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className={fieldLabel}>
          Note
          <textarea
            className="min-h-[90px] w-full rounded-sm border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground/50"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. ET2681 delay — standby callout prepared, next shift to pick a reserve"
            data-testid="handover-note"
          />
        </label>
      </div>
    </AppDialog>
  )
}

/**
 * Shift Handover — a shared, persisted crew-control shift book. Shows recent
 * handover entries (severity-badged, newest first) and an "Add entry" form
 * that writes to the shared crew_control_handover table.
 */
export const ShiftHandoverPanel = () => {
  const [entries, setEntries] = useState<HandoverEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  const load = async () => {
    setLoading(true)
    setFailed(false)
    try {
      setEntries(await dashboardApi.handoverList())
    } catch {
      setFailed(true)
      setEntries([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-1.5">
        <ClipboardList className="h-3.5 w-3.5 text-primary" />
        <div className="text-xs font-bold text-foreground">Shift Handover</div>
        <button
          className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
          onClick={() => void load()}
          title="Refresh handover entries"
          data-testid="handover-refresh"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <button
          className="inline-flex items-center gap-1 rounded-sm border border-border bg-primary px-2 py-1 text-3xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          onClick={() => setDialogOpen(true)}
          data-testid="handover-add"
        >
          <Plus className="h-3 w-3" />
          Add entry
        </button>
      </div>

      {loading ? (
        <div className="py-6 text-center text-2xs text-muted-foreground" data-testid="handover-loading">
          Loading handover log…
        </div>
      ) : failed ? (
        <div className="py-6 text-center text-2xs text-destructive" data-testid="handover-error">
          Could not load the handover log.{' '}
          <button className="underline hover:no-underline" onClick={() => void load()}>
            Retry
          </button>
        </div>
      ) : entries.length === 0 ? (
        <div className="py-6 text-center text-2xs text-muted-foreground" data-testid="handover-empty">
          No handover entries yet. Add the first one for the next shift.
        </div>
      ) : (
        <ul className="max-h-[280px] overflow-y-auto" data-testid="handover-list">
          {entries.map((e) => (
            <EntryRow key={e.id} entry={e} />
          ))}
        </ul>
      )}

      <AddHandoverDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onAdded={(entry) => setEntries((prev) => [entry, ...prev])}
      />
    </div>
  )
}
