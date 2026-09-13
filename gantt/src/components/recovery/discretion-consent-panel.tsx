import { useEffect, useState } from 'react'
import { Button, Input } from '@rois/ui'
import { api } from '@/services/api'

export interface DiscretionConsentProposal {
  airline: 'F8' | 'ET'
  pairingId: number
  dutySeq: number
  ruleSetId: number
  before: { reportUtc: string; releaseUtc: string; fdpMin: number }
  after: { reportUtc: string; releaseUtc: string; fdpMin: number }
  extensionRequestedMin: number
  reason: string
  expiresUtc: string
}
interface Feedback {
  proposalId: string
  requests: Array<{ crewId: string; state: string; decidedUtc?: string; decisionReason?: string }>
  consentComplete: boolean
  proceedAllowed: false
  proceedReason: string
}
const stateLabel: Record<string, string> = {
  pending: 'Pending', accepted: 'Yes', rejected: 'No', expired: 'Expired', superseded: 'Duty changed — request again',
}
/** Consent is deliberately separate from roster execution / regulatory authority. */
export function DiscretionConsentPanel({ proposal, previous, onFeedback, onReturnToReview }: { proposal: DiscretionConsentProposal; previous?: Feedback | null; onFeedback?: (value: Feedback | null, reason: string) => void; onReturnToReview: () => void }) {
  const [reason, setReason] = useState(proposal.reason)
  const [feedback, setFeedback] = useState<Feedback | null>(previous ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const identity = JSON.stringify(proposal)
  useEffect(() => { setFeedback(previous ?? null); setReason(proposal.reason) }, [identity, proposal.reason, previous])
  const send = async () => {
    setBusy(true); setError('')
    try {
      const result = await api.post('/api/crew-app/v1/discretion-requests', { ...proposal, reason }) as Feedback
      setFeedback(result); onFeedback?.(result, reason)
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to send request.') }
    finally { setBusy(false) }
  }
  const refresh = async () => {
    if (!feedback) return
    setBusy(true); setError('')
    try {
      const result = await api.get(`/api/crew-app/v1/discretion-requests/${feedback.proposalId}`) as Feedback
      setFeedback(result); onFeedback?.(result, reason)
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to load feedback.') }
    finally { setBusy(false) }
  }
  return <section className="space-y-3 p-3 text-xs" data-testid="discretion-consent-panel">
    <p className="font-semibold">Crew agreement · FDP extension{feedback ? ' · Sent proposal' : ''}</p>
    <div className="grid grid-cols-2 gap-3">
      {[['Before', proposal.before], ['Proposed', proposal.after]].map(([label, value]) => {
        const window = value as DiscretionConsentProposal['before']
        return <div key={String(label)} className="rounded-md border border-border p-2">
          <p className="font-medium">{String(label)} · UTC</p>
          <p className="font-mono tabular-nums">Report {window.reportUtc}</p>
          <p className="font-mono tabular-nums">Release {window.releaseUtc}</p>
          <p className="font-mono tabular-nums">FDP {window.fdpMin} min</p>
        </div>
      })}
    </div>
    <p>Requested extension: <span className="font-mono tabular-nums">{proposal.extensionRequestedMin} min</span>. Every assigned crew member must reply Yes.</p>
    <label className="block space-y-1">Reason for crew
      <Input aria-label="Reason for crew" value={reason} maxLength={500} disabled={busy || !!feedback} onChange={e => setReason(e.target.value)} />
    </label>
    <div className="flex items-center gap-2">
      <Button size="sm" disabled={busy || !reason.trim() || !!feedback} onClick={send}>Send request to crew</Button>
      {feedback && <Button size="sm" variant="outline" disabled={busy} onClick={refresh}>Refresh crew feedback</Button>}
      {feedback?.requests.some(r => ['rejected', 'expired', 'superseded'].includes(r.state)) && <Button size="sm" variant="outline" disabled={busy} onClick={() => { setFeedback(null); onFeedback?.(null, reason) }}>Prepare new request</Button>}
    </div>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {feedback && <>
      <table className="w-full text-left"><thead><tr><th>Crew</th><th>Reply</th><th>Received · UTC</th></tr></thead>
        <tbody>{feedback.requests.map(r => <tr key={r.crewId}><td className="font-mono tabular-nums">{r.crewId}</td><td>{stateLabel[r.state] ?? r.state}</td><td className="font-mono tabular-nums">{r.decidedUtc ?? '—'}</td></tr>)}</tbody>
      </table>
      <p role="status">{feedback.proceedReason}</p>
    </>}
    <p className="text-muted-foreground">Consent does not override regulatory limits. Execution requires independent legality validation.</p>
    <Button size="sm" disabled={!feedback?.consentComplete} onClick={onReturnToReview}>Return to controller review</Button>
  </section>
}

export function DiscretionConsentComposer({ pairingId, dutySeq, ruleSetId, onReturnToReview }: {
  pairingId: number; dutySeq: number; ruleSetId: number; onReturnToReview: () => void
}) {
  const [airline, setAirline] = useState<DiscretionConsentProposal['airline'] | null>(null)
  const [duty, setDuty] = useState<Pick<DiscretionConsentProposal, 'before' | 'after'> | null>(null)
  const [canonicalDuty, setCanonicalDuty] = useState<Pick<DiscretionConsentProposal, 'before' | 'after'> | null>(null)
  const [previous, setPrevious] = useState<Feedback | null>(null)
  const [reason, setReason] = useState('')
  const [extension, setExtension] = useState('')
  const [expiry, setExpiry] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    setDuty(null); setError('')
    api.get(`/api/crew-app/v1/discretion-duty/${pairingId}/${dutySeq}`)
      .then(result => {
        if (!active) return
        const prepared = result as unknown as Pick<DiscretionConsentProposal, 'before' | 'after'> & { airline: DiscretionConsentProposal['airline']; previous?: Feedback; previousProposal?: DiscretionConsentProposal }
        setAirline(prepared.airline)
        const current = { before: prepared.before, after: prepared.after }
        setCanonicalDuty(current)
        setDuty(prepared.previousProposal ? { before: prepared.previousProposal.before, after: prepared.previousProposal.after } : current)
        setPrevious(prepared.previous ?? null)
        if (prepared.previousProposal) {
          setExtension(String(prepared.previousProposal.extensionRequestedMin))
          setExpiry(prepared.previousProposal.expiresUtc.slice(0, 16))
          setReason(prepared.previousProposal.reason)
        }
      })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : 'Unable to load duty details.') })
    return () => { active = false }
  }, [pairingId, dutySeq])
  const expiryDate = new Date(expiry.endsWith('Z') ? expiry : `${expiry}Z`)
  const valid = airline && duty && Number.isInteger(Number(extension)) && Number(extension) > 0 && Number.isFinite(expiryDate.getTime())
  return <div className="space-y-2" data-testid="discretion-consent-composer">
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {!duty && !error && <p>Loading duty details…</p>}
    {duty && <div className="grid grid-cols-2 gap-2 px-3 pt-3 text-xs">
      <label>Extension requested · minutes<Input aria-label="Extension requested in minutes" type="number" min="1" value={extension} disabled={!!previous} onChange={e => setExtension(e.target.value)} /></label>
      <label>Reply deadline · UTC<Input aria-label="Reply deadline UTC" type="datetime-local" value={expiry} disabled={!!previous} onChange={e => setExpiry(e.target.value)} /></label>
    </div>}
    {valid && <DiscretionConsentPanel onReturnToReview={onReturnToReview} previous={previous} onFeedback={(value, text) => { setPrevious(value); setReason(text); if (!value && canonicalDuty) setDuty(canonicalDuty) }} proposal={{ airline, pairingId, dutySeq, ruleSetId, ...duty,
      extensionRequestedMin: Number(extension), reason, expiresUtc: expiryDate.toISOString() }} />}
  </div>
}
