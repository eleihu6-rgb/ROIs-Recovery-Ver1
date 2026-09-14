import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, RefreshCw, Send, XCircle } from 'lucide-react'
import { AppDialog, Button, Input } from '@rois/ui'
import { api } from '@/services/api'
import { fdpHoursToMin, formatFdpHm, formatFdpHours, formatFdpHoursDelta, formatUtcStamp } from '@/utils/fdp-duration'

/** Communication state of the crew FDP-extension agreement for one pairing/duty. */
export type FdpConsentStatus = 'not-sent' | 'sent' | 'partial' | 'accepted' | 'rejected' | 'expired' | 'superseded'

export interface FdpConsentFeedback {
  proposalId: string
  requests: Array<{ crewId: string; state: string; decidedUtc?: string; decisionReason?: string }>
  consentComplete: boolean
  proceedAllowed: false
  proceedReason: string
}

interface DutyWindow { reportUtc: string; releaseUtc: string; fdpMin: number }

/** Friendly labels for the proposal fields the server validates. */
const CONSENT_FIELD_LABELS: Record<string, string> = {
  reason: 'Reason for crew',
  extensionRequestedMin: 'Requested extension',
  expiresUtc: 'Reply deadline',
  before: 'Before duty window',
  after: 'Proposed duty window',
}

/**
 * The live-server returns a Zod `error.message` — a raw JSON array of issues —
 * as the failure message on a 400. Render it as one plain-English sentence so
 * the request dialog never shows raw `[{ "code": "too_small", … }]` JSON to a
 * controller. Non-JSON messages (network errors, 409 business errors) pass
 * through unchanged.
 */
export const humanizeConsentError = (message: string): string => {
  const trimmed = message.trim()
  if (!trimmed.startsWith('[')) return message
  try {
    const issues = JSON.parse(trimmed) as Array<{ message?: string; path?: Array<string | number> }>
    if (!Array.isArray(issues) || issues.length === 0) return message
    const parts = issues.map((issue) => {
      const field = issue.path?.find((segment): segment is string => typeof segment === 'string')
      const label = field ? CONSENT_FIELD_LABELS[field] ?? field : ''
      const detail = /at least 1 character/i.test(issue.message ?? '') ? 'is required' : (issue.message ?? 'is invalid')
      return [label, detail].filter(Boolean).join(' ')
    })
    return `${[...new Set(parts)].join('. ')}.`
  } catch {
    return message
  }
}

/** One side of the Before → Proposed comparison in the request dialog. */
const DutyWindowCard = ({ kind, window, delta }: { kind: 'before' | 'proposed'; window: DutyWindow; delta: number }) => {
  const proposed = kind === 'proposed'
  return (
    <div
      data-testid={`recovery-fdp-window-${kind}`}
      className={proposed
        ? 'rounded-lg border border-amber-500/40 bg-amber-500/[0.06] p-3'
        : 'rounded-lg border border-border bg-muted/30 p-3'}
    >
      <div className="mb-2 flex items-center gap-1.5">
        <span className={['h-2 w-2 rounded-full', proposed ? 'bg-amber-500' : 'bg-muted-foreground'].join(' ')} />
        <span className={['text-2xs font-semibold uppercase tracking-wide', proposed ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'].join(' ')}>
          {proposed ? 'Proposed' : 'Before'}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={['text-lg font-bold tabular-nums', proposed ? 'text-amber-700 dark:text-amber-300' : 'text-foreground'].join(' ')}>{formatFdpHm(window.fdpMin)}</span>
        <span className="text-2xs text-muted-foreground">FDP</span>
        {proposed && delta !== 0 && (
          <span className="ml-auto rounded-full bg-amber-500/15 px-1.5 py-0.5 text-2xs font-semibold tabular-nums text-amber-700 dark:text-amber-300">
            {formatFdpHoursDelta(delta)}
          </span>
        )}
      </div>
      <div className="mt-2 space-y-1 border-t border-border/60 pt-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-2xs text-muted-foreground">Report</span>
          <span className="whitespace-nowrap font-mono text-2xs tabular-nums text-foreground">{formatUtcStamp(window.reportUtc)}</span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-2xs text-muted-foreground">Release</span>
          <span className="whitespace-nowrap font-mono text-2xs tabular-nums text-foreground">{formatUtcStamp(window.releaseUtc)}</span>
        </div>
      </div>
    </div>
  )
}

export interface FdpConsentProposal {
  airline: 'F8' | 'ET'
  pairingId: number
  dutySeq: number
  ruleSetId: number
  before: DutyWindow
  after: DutyWindow
  extensionRequestedMin: number
  reason: string
  expiresUtc: string
}

/**
 * The one sentence that must accompany every surface of this feature. Consent is
 * communication only; it never grants regulatory authority to operate the duty.
 */
export const FDP_CONSENT_EXECUTION_NOTE =
  'Crew agreement communication only; Apply remains disabled until independent FDP legality execution is implemented.'

// Default crew reply window (days). The deadline is no longer a controller field;
// the request stays open comfortably past the duty so the crew always has time.
const REPLY_WINDOW_DAYS = 14

/** Derive the controller-facing status from the per-crew replies of one proposal. */
export const deriveFdpConsentStatus = (feedback: FdpConsentFeedback | null): FdpConsentStatus => {
  if (!feedback || feedback.requests.length === 0) return 'not-sent'
  const states = feedback.requests.map((request) => request.state)
  if (states.every((state) => state === 'accepted')) return 'accepted'
  if (states.some((state) => state === 'rejected')) return 'rejected'
  if (states.some((state) => state === 'expired')) return 'expired'
  if (states.some((state) => state === 'superseded')) return 'superseded'
  return states.some((state) => state !== 'pending') ? 'partial' : 'sent'
}

export const fdpConsentStatusLabel = (status: FdpConsentStatus, feedback: FdpConsentFeedback | null): string => {
  const total = feedback?.requests.length ?? 0
  const replied = feedback?.requests.filter((request) => request.state !== 'pending').length ?? 0
  switch (status) {
    case 'sent': return 'Sent · waiting for crew'
    case 'partial': return `Sent · ${replied} of ${total} replied`
    case 'accepted': return 'Crew accepted'
    case 'rejected': return 'Crew rejected'
    case 'expired': return 'Expired · no reply'
    case 'superseded': return 'Duty changed · request again'
    default: return 'Not sent yet'
  }
}

/** True when the FDP extension is refused (or lapsed) and standby is the next best answer. */
export const fdpConsentNeedsFallback = (status: FdpConsentStatus): boolean =>
  status === 'rejected' || status === 'expired'

export const fdpConsentActionLabel = (status: FdpConsentStatus): string => {
  if (status === 'not-sent') return 'Request FDP discretion'
  if (status === 'accepted') return 'Send again'
  return 'Resend'
}

const statusTone: Record<FdpConsentStatus, string> = {
  'not-sent': 'border-border bg-muted text-muted-foreground',
  sent: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  partial: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  accepted: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  rejected: 'border-destructive/40 bg-destructive/10 text-destructive',
  expired: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  superseded: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
}

const StatusIcon = ({ status }: { status: FdpConsentStatus }) => {
  if (status === 'accepted') return <CheckCircle2 className="h-3 w-3" />
  if (status === 'rejected') return <XCircle className="h-3 w-3" />
  if (status === 'expired' || status === 'superseded') return <AlertTriangle className="h-3 w-3" />
  return <Clock className="h-3 w-3" />
}

/** Compact status chip shown next to the FDP Discretion option title. */
export const FdpConsentChip = ({ status, feedback }: { status: FdpConsentStatus; feedback: FdpConsentFeedback | null }) => (
  <span
    className={['inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-2xs', statusTone[status]].join(' ')}
    title={`${fdpConsentStatusLabel(status, feedback)}. ${FDP_CONSENT_EXECUTION_NOTE}`}
    data-testid={`recovery-fdp-status-${status}`}
  >
    <StatusIcon status={status} />
    {fdpConsentStatusLabel(status, feedback)}
  </span>
)

export interface FdpDiscretionConsentState {
  status: FdpConsentStatus
  feedback: FdpConsentFeedback | null
  ready: boolean
  busy: boolean
  error: string
  openRequest: () => void
  /** Rendered by the caller (a dialog describing the request). */
  dialog: React.ReactNode
}

/**
 * Owns the FDP-discretion communication for one recovery option: loads the
 * authoritative duty + the latest proposal, exposes the status, and renders the
 * request/resend dialog.
 */
export const useFdpDiscretionConsent = ({
  enabled,
  pairingId,
  dutySeq,
  ruleSetId,
  crewId,
  onStatusChange,
}: {
  enabled: boolean
  pairingId: number | null
  dutySeq: number | null
  ruleSetId: number | null
  crewId: string
  onStatusChange?: (status: FdpConsentStatus) => void
}): FdpDiscretionConsentState => {
  const [feedback, setFeedback] = useState<FdpConsentFeedback | null>(null)
  const [previousProposal, setPreviousProposal] = useState<FdpConsentProposal | null>(null)
  const [duty, setDuty] = useState<{ airline: 'F8' | 'ET'; before: DutyWindow; after: DutyWindow } | null>(null)
  const [canonicalDuty, setCanonicalDuty] = useState<{ before: DutyWindow; after: DutyWindow } | null>(null)
  const [loadError, setLoadError] = useState('')
  const [dialogError, setDialogError] = useState('')
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  // Controller-facing extension is entered and shown in hours (never raw minutes).
  const [extension, setExtension] = useState('')
  const [reason, setReason] = useState('')

  const load = useCallback(async () => {
    if (!enabled || pairingId == null || dutySeq == null) return
    setLoadError('')
    try {
      const prepared = await api.get(`/api/crew-app/v1/discretion-duty/${pairingId}/${dutySeq}`) as unknown as {
        airline: 'F8' | 'ET'
        before: DutyWindow
        after: DutyWindow
        previous?: FdpConsentFeedback
        previousProposal?: FdpConsentProposal
      }
      setFeedback(prepared.previous ?? null)
      setPreviousProposal(prepared.previousProposal ?? null)
      setDuty({ airline: prepared.airline, before: prepared.before, after: prepared.after })
      setCanonicalDuty({ before: prepared.before, after: prepared.after })
      if (prepared.previousProposal) {
        setExtension(String(prepared.previousProposal.extensionRequestedMin / 60))
        setReason(prepared.previousProposal.reason)
      } else {
        // Default the extension to the operated FDP increase (after − before) in hours.
        setExtension(String(Math.max(prepared.after.fdpMin - prepared.before.fdpMin, 0) / 60))
      }
    } catch (err) {
      setDuty(null)
      setFeedback(null)
      setLoadError(humanizeConsentError(err instanceof Error ? err.message : 'Unable to prepare the FDP discretion request.'))
    }
  }, [enabled, pairingId, dutySeq])

  useEffect(() => { void load() }, [load])

  const status = deriveFdpConsentStatus(feedback)
  useEffect(() => { if (enabled) onStatusChange?.(status) }, [enabled, status, onStatusChange])

  const send = async () => {
    if (!duty) return
    if (!(Number(extension) > 0)) {
      setDialogError('Enter a positive extension.')
      return
    }
    const extensionRequestedMin = fdpHoursToMin(extension)
    // The reply deadline is not a controller input; default it well past the duty
    // so the crew always has time to respond before the request can expire.
    const expiresUtc = new Date(Date.now() + REPLY_WINDOW_DAYS * 864e5).toISOString()
    setBusy(true); setDialogError('')
    try {
      const result = await api.post('/api/crew-app/v1/discretion-requests', {
        airline: duty.airline, pairingId, dutySeq, ruleSetId: ruleSetId ?? 1,
        before: duty.before, after: duty.after,
        extensionRequestedMin, reason: reason.trim(), expiresUtc,
      }) as unknown as FdpConsentFeedback
      setFeedback(result)
      setPreviousProposal({ airline: duty.airline, pairingId: pairingId!, dutySeq: dutySeq!, ruleSetId: ruleSetId ?? 1,
        before: duty.before, after: duty.after, extensionRequestedMin, reason: reason.trim(), expiresUtc })
      setOpen(false)
    } catch (err) {
      setDialogError(humanizeConsentError(err instanceof Error ? err.message : 'Unable to send the FDP request.'))
    } finally {
      setBusy(false)
    }
  }

  const refresh = async () => {
    if (!feedback) return
    setBusy(true); setDialogError('')
    try {
      setFeedback(await api.get(`/api/crew-app/v1/discretion-requests/${feedback.proposalId}`) as unknown as FdpConsentFeedback)
    } catch (err) {
      setDialogError(humanizeConsentError(err instanceof Error ? err.message : 'Unable to refresh crew feedback.'))
    } finally {
      setBusy(false)
    }
  }

  // A reason is mandatory server-side (`reason: z.string().trim().min(1)`); gate
  // Send on it too so an empty reason can never reach the API and bounce back as
  // a raw Zod error.
  const valid = !!duty && Number(extension) > 0 && reason.trim() !== ''

  const dialog = (
    <AppDialog
      open={open}
      onOpenChange={setOpen}
      data-testid="recovery-fdp-request-dialog"
      className="sm:max-w-[min(720px,94vw)]"
      title={status === 'not-sent' ? `Request FDP discretion · Crew ${crewId}` : `Resend FDP discretion · Crew ${crewId}`}
      icon={<Send className="h-4 w-4" />}
      footer={<div className="flex w-full items-center justify-between gap-2">
        <span className="text-2xs text-muted-foreground">Every assigned crew member must reply Yes.</span>
        <div className="flex gap-2">
          {feedback && <Button variant="ghost" size="sm" className="h-7" disabled={busy} onClick={() => void refresh()}>Refresh crew feedback</Button>}
          <Button variant="outline" size="sm" className="h-7" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" className="h-7" disabled={busy || !valid} onClick={() => void send()} data-testid="recovery-fdp-send">
            {busy ? 'Sending...' : status === 'not-sent' ? 'Send request to crew' : 'Send new request'}
          </Button>
        </div>
      </div>}
    >
      <div className="space-y-3 p-3 text-xs">
        {duty && (
          <div data-testid="recovery-fdp-before-after" className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_auto_1fr]">
            <DutyWindowCard kind="before" window={duty.before} delta={0} />
            <ArrowRight className="mx-auto h-5 w-5 rotate-90 text-muted-foreground sm:rotate-0" />
            <DutyWindowCard kind="proposed" window={duty.after} delta={duty.after.fdpMin - duty.before.fdpMin} />
          </div>
        )}
        {feedback && <p data-testid="recovery-fdp-feedback">Current status: <b>{fdpConsentStatusLabel(status, feedback)}</b> · {feedback.requests.map((request) => `${request.crewId} ${request.state}`).join(', ')}</p>}
        <label className="block space-y-1">Extension requested · hours
          <Input aria-label="Extension requested in hours" type="number" min="0.5" step="0.5" value={extension} disabled={busy} onChange={(event) => setExtension(event.target.value)} />
        </label>
        <label className="block space-y-1">Reason for crew
          <Input aria-label="Reason for crew" value={reason} maxLength={500} disabled={busy} onChange={(event) => setReason(event.target.value)} placeholder="Explain why the extension is needed" />
          <span className="block text-2xs text-muted-foreground">Required — the crew sees this reason with the proposal.</span>
        </label>
        {dialogError && <p role="alert" className="text-destructive">{dialogError}</p>}
        {previousProposal && <p className="text-2xs text-muted-foreground">Previous request asked for {formatFdpHours(previousProposal.extensionRequestedMin)}. A new send supersedes it.</p>}
        <p className="rounded border border-amber-500/40 bg-amber-500/[0.08] p-2 text-2xs text-amber-800 dark:text-amber-200" data-testid="recovery-fdp-execution-note">
          {FDP_CONSENT_EXECUTION_NOTE}
        </p>
      </div>
    </AppDialog>
  )

  return {
    status, feedback, ready: !!duty && !loadError, busy,
    error: loadError || dialogError,
    openRequest: () => { setDialogError(''); setOpen(true) },
    dialog,
  }
}

export const FdpDiscretionActionButton = ({ state, disabled, disabledReason, testId }: {
  state: FdpDiscretionConsentState
  disabled?: boolean
  disabledReason?: string
  testId?: string
}) => (
  <button
    type="button"
    disabled={disabled || state.busy}
    title={disabled ? disabledReason : `${fdpConsentActionLabel(state.status)}. ${FDP_CONSENT_EXECUTION_NOTE}`}
    onClick={state.openRequest}
    data-testid={testId}
    className="inline-flex h-6 items-center gap-1 rounded border border-sky-500/50 bg-sky-500/10 px-1.5 text-3xs font-semibold text-sky-700 transition-colors hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:text-sky-300"
  >
    {state.feedback ? <RefreshCw className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
    {fdpConsentActionLabel(state.status)}
  </button>
)
