import { useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, ExternalLink, Loader2 } from 'lucide-react'
import { RECOVERY_CASES, type RecoveryCase } from '@/config/recovery-cases'
import { openRecoveryCaseInLive } from '@/utils/open-recovery-case-in-live'
import { notify } from '@/utils/notify'

/** Cases sorted most-urgent first — soonest disruption window at the top. */
const sortedCases = (): RecoveryCase[] =>
  [...RECOVERY_CASES].sort(
    (a, b) => Date.parse(a.windowStartIso) - Date.parse(b.windowStartIso),
  )

const CrewChips = ({ crew }: { crew: RecoveryCase['sourceCrew'] }) => (
  <div className="flex flex-wrap gap-1">
    {crew.map((c) => (
      <span
        key={c.crewId}
        className="inline-flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 text-3xs font-medium text-muted-foreground"
      >
        <span className="font-semibold text-foreground">{c.crewId}</span>
        {c.rank}
      </span>
    ))}
  </div>
)

const CaseRow = ({ rc }: { rc: RecoveryCase }) => {
  const [expanded, setExpanded] = useState(false)
  const [opening, setOpening] = useState(false)

  const handleOpen = async () => {
    setOpening(true)
    try {
      await openRecoveryCaseInLive(rc)
    } catch {
      notify.error('Could not open the case in Live')
    } finally {
      setOpening(false)
    }
  }

  const { options, executable, filtered } = rc.result ?? { options: null, executable: 0, filtered: 0 }

  return (
    <>
      <tr
        className="cursor-pointer border-t border-border align-top transition-colors hover:bg-accent/40"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Case + expand chevron */}
        <td className="py-2 pl-1 pr-2">
          <div className="flex items-center gap-1.5">
            {expanded ? (
              <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
            )}
            <span className="text-2xs font-semibold text-foreground">Case {rc.caseNo}</span>
          </div>
          <div className="mt-0.5 pl-[18px] text-3xs text-muted-foreground">{rc.dateLabel}</div>
        </td>

        {/* Trigger + rule */}
        <td className="py-2 pr-2">
          <div className="text-2xs font-medium text-foreground">{rc.trigger}</div>
          <div className="mt-0.5 text-3xs text-muted-foreground">{rc.ruleCode ? `Rule ${rc.ruleCode}` : 'Unpaired flight'}</div>
        </td>

        {/* Pairing */}
        <td className="py-2 pr-2">
          <div className="text-2xs font-semibold tabular-nums text-foreground">{rc.pairingId ?? 'Not built'}</div>
          <div className="mt-0.5 text-3xs text-muted-foreground">
            {rc.base} · {rc.fleet}
          </div>
        </td>

        {/* Concerned crew */}
        <td className="py-2 pr-2">
          {rc.sourceCrew.length ? <CrewChips crew={rc.sourceCrew} /> : <span className="text-2xs text-muted-foreground">Unassigned</span>}
        </td>

        {/* Result */}
        <td className="py-2 pr-2">
          {rc.result ? <div className="text-2xs tabular-nums text-foreground">
            <span className="font-semibold text-success">{executable}</span> exec
            {filtered > 0 && (
              <span className="ml-1 text-muted-foreground">· {filtered} filtered</span>
            )}
          </div>
          : null}
          {!rc.result && <div className="text-2xs text-muted-foreground">Build pairing first</div>}
          {options !== null && (
            <div className="mt-0.5 text-3xs text-muted-foreground">{options} options</div>
          )}
        </td>

        {/* Cost spread */}
        <td className="py-2 pr-2">
          <div className="text-2xs font-medium tabular-nums text-foreground">
            {rc.result ? `${rc.costLow} → ${rc.costHigh}` : 'Estimate after build'}
          </div>
        </td>

        {/* Open in Live */}
        <td className="py-2 pr-1 text-right">
          <button
            className="inline-flex items-center gap-1 rounded-sm border border-border bg-primary px-2 py-1 text-3xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            onClick={(e) => {
              e.stopPropagation()
              void handleOpen()
            }}
            disabled={opening}
            title="Open this case on the Live gantt — filtered to its crew, pairing & flights, zoomed to the window"
            data-testid={`open-case-${rc.id}`}
          >
            {opening ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <ExternalLink className="h-3 w-3" />
            )}
            Open in Live
          </button>
        </td>
      </tr>

      {/* Expanded brief */}
      {expanded && (
        <tr className="bg-muted/30">
          <td colSpan={7} className="px-1 pb-3 pt-1">
            <div className="rounded-md border border-border bg-card p-3">
              <div className="mb-1.5 text-3xs font-bold uppercase tracking-[0.06em] text-muted-foreground">
                Recovery options brief
              </div>
              <p className="text-2xs leading-relaxed text-foreground">{rc.optionsBrief}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-3xs text-muted-foreground">
                <span>
                  <span className="font-semibold text-foreground">Flights:</span>{' '}
                  {rc.flights.join(' · ')}
                </span>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

/**
 * Disruption Cases — the four documented recovery incidents, with
 * concerned crew, flights, result & cost spread, an expandable options brief,
 * and a per-case "Open in Live" quick-link that drives the existing gantt
 * filters and zooms onto the case window. Sorted soonest-window-first.
 */
export const DisruptionCasesPanel = () => {
  const cases = useMemo(sortedCases, [])

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-1.5">
        <AlertTriangle className="h-3.5 w-3.5 text-warning" />
        <div className="text-xs font-bold text-foreground">Disruption Cases</div>
        <div className="ml-auto text-3xs text-muted-foreground">
          {cases.length} active · soonest first
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="text-left text-3xs font-bold uppercase tracking-[0.06em] text-muted-foreground">
              <th className="pb-1 pl-1 pr-2 font-bold">Case</th>
              <th className="pb-1 pr-2 font-bold">Disruption cause</th>
              <th className="pb-1 pr-2 font-bold">Pairing</th>
              <th className="pb-1 pr-2 font-bold">Concerned crew</th>
              <th className="pb-1 pr-2 font-bold">Result</th>
              <th className="pb-1 pr-2 font-bold">Cost spread</th>
              <th className="pb-1 pr-1" />
            </tr>
          </thead>
          <tbody>
            {cases.map((rc) => (
              <CaseRow key={rc.id} rc={rc} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
