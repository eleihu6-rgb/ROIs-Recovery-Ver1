import { useMemo, useState, type FormEvent } from 'react'
import { AlertTriangle, ArrowRight, CheckCircle2, Plane, RefreshCw, Save, Users } from 'lucide-react'
import { Button } from '@rois/ui'
import { recoveryApi, type FlightChangeInput, type RecoveryPlanId, type RecoverySession } from '@/services/recovery-api'

const initialFlight: FlightChangeInput = {
  flightNo: 'MU5123',
  departure: 'PVG',
  arrival: 'PEK',
  oldAircraftType: 'A320',
  newAircraftType: 'A350',
  oldTailNumber: 'B-1234',
  newTailNumber: 'B-308X',
}

const money = (value: number, currency: string) => new Intl.NumberFormat('zh-CN', {
  style: 'currency', currency, maximumFractionDigits: 0,
}).format(value)

const changeStyle = (kind: 'unassign' | 'assign' | 'swap') => ({
  unassign: 'bg-destructive/10 text-destructive',
  assign: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  swap: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
}[kind])

export const RecoveryView = () => {
  const [flight, setFlight] = useState(initialFlight)
  const [session, setSession] = useState<RecoverySession | null>(null)
  const [selectedPlanId, setSelectedPlanId] = useState<RecoveryPlanId>('standby')
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedPlan = useMemo(
    () => session?.plans.find((plan) => plan.id === selectedPlanId) ?? null,
    [session, selectedPlanId],
  )

  const updateFlight = (key: keyof FlightChangeInput, value: string) => {
    setFlight((current) => ({ ...current, [key]: value }))
  }

  const simulate = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const result = await recoveryApi.simulateFlightChange(flight)
      setSession(result)
      setSelectedPlanId('standby')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to simulate the aircraft change')
    } finally {
      setLoading(false)
    }
  }

  const apply = async () => {
    if (!session || !selectedPlan) return
    setApplying(true)
    setError(null)
    try {
      setSession(await recoveryApi.applyPlan(session.id, selectedPlan.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to apply the recovery plan')
    } finally {
      setApplying(false)
    }
  }

  return (
    <div data-testid="recovery-view" className="h-full overflow-y-auto bg-background">
      <div className="mx-auto flex min-h-full max-w-[1440px] flex-col gap-4 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <RefreshCw className="h-4 w-4 text-primary" />
              Crew Roster Recovery
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Assess aircraft changes, resolve qualification alerts, and apply the approved roster recovery plan.</p>
          </div>
          {session?.status === 'applied' && (
            <span className="inline-flex items-center gap-1.5 rounded-sm bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> Plan effective
            </span>
          )}
        </div>

        <form onSubmit={simulate} className="grid gap-3 border border-border bg-card p-3 md:grid-cols-4 xl:grid-cols-8">
          <Field label="Flight" value={flight.flightNo} onChange={(value) => updateFlight('flightNo', value)} />
          <Field label="From" value={flight.departure} onChange={(value) => updateFlight('departure', value)} />
          <Field label="To" value={flight.arrival} onChange={(value) => updateFlight('arrival', value)} />
          <Field label="Original type" value={flight.oldAircraftType} onChange={(value) => updateFlight('oldAircraftType', value)} />
          <Field label="New type" value={flight.newAircraftType} onChange={(value) => updateFlight('newAircraftType', value)} />
          <Field label="Original tail" value={flight.oldTailNumber} onChange={(value) => updateFlight('oldTailNumber', value)} />
          <Field label="New tail" value={flight.newTailNumber} onChange={(value) => updateFlight('newTailNumber', value)} />
          <div className="flex items-end">
            <Button type="submit" size="sm" disabled={loading} className="w-full gap-1.5" data-testid="recovery-simulate">
              <Plane className="h-3.5 w-3.5" /> {loading ? 'Checking...' : 'Simulate change'}
            </Button>
          </div>
        </form>

        {error && <div className="border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</div>}

        {!session && !error && (
          <div className="flex min-h-56 items-center justify-center border border-dashed border-border text-center text-xs text-muted-foreground">
            Simulate an Ops aircraft change to generate a crew qualification recovery alert.
          </div>
        )}

        {session && (
          <>
            <section className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)]">
              <div className="border border-destructive/35 bg-destructive/[0.035] p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-semibold text-foreground">{session.alert.title}</h2>
                      <span className="rounded-sm bg-destructive/10 px-1.5 py-0.5 font-mono text-2xs font-bold text-destructive">Rule {session.alert.ruleCode}</span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{session.alert.message}</p>
                  </div>
                </div>
                <div className="mt-3 border-t border-destructive/15 pt-3">
                  <div className="mb-2 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground"><Users className="h-3.5 w-3.5" /> Impacted crew</div>
                  <div className="space-y-1.5">
                    {session.alert.impactedCrew.map((crew) => (
                      <div key={crew.id} className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-medium text-foreground">{crew.name} <span className="font-mono text-muted-foreground">{crew.id}</span></span>
                        <span className="text-muted-foreground">Qualified: {crew.qualification}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="border border-border bg-card p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">Recovery options</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">Choose a plan to compare operational impact before saving.</p>
                  </div>
                  {selectedPlan && <span className="text-xs font-semibold text-foreground">Selected cost: {money(selectedPlan.costDelta, selectedPlan.currency)}</span>}
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {session.plans.map((plan) => {
                    const selected = plan.id === selectedPlanId
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        data-testid={`recovery-plan-${plan.id}`}
                        disabled={session.status === 'applied'}
                        onClick={() => setSelectedPlanId(plan.id)}
                        className={[
                          'min-h-32 border p-3 text-left transition-colors',
                          selected ? 'border-primary bg-primary/[0.045] ring-1 ring-primary' : 'border-border hover:border-primary/50 hover:bg-muted/25',
                          session.status === 'applied' ? 'cursor-default opacity-75' : '',
                        ].join(' ')}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-semibold text-foreground">{plan.title}</span>
                          {selected && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                        </div>
                        <p className="mt-1.5 min-h-9 text-2xs leading-4 text-muted-foreground">{plan.description}</p>
                        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border/70 pt-2 text-2xs">
                          <Metric label="Cost" value={money(plan.costDelta, plan.currency)} />
                          <Metric label="Crew" value={String(plan.affectedCrewCount)} />
                          <Metric label="Rosters" value={String(plan.affectedRosterCount)} />
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </section>

            {selectedPlan && (
              <section className="border border-border bg-card">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">Roster change preview</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">{selectedPlan.title} for {session.flight.flightNo} · {session.flight.oldAircraftType} <ArrowRight className="mx-1 inline h-3 w-3" /> {session.flight.newAircraftType}</p>
                  </div>
                  {session.status === 'open' ? (
                    <Button size="sm" disabled={applying} onClick={apply} className="gap-1.5" data-testid="recovery-apply">
                      <Save className="h-3.5 w-3.5" /> {applying ? 'Applying...' : 'Save and apply plan'}
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">Applied by {session.appliedBy} at {session.appliedAt ? new Date(session.appliedAt).toLocaleString() : ''}</span>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-xs">
                    <thead className="bg-muted/35 text-2xs uppercase tracking-wide text-muted-foreground">
                      <tr><th className="px-4 py-2 font-medium">Crew</th><th className="px-4 py-2 font-medium">Before</th><th className="px-4 py-2 font-medium">After</th><th className="px-4 py-2 font-medium">Action</th></tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {selectedPlan.changes.map((change) => (
                        <tr key={change.crewId}>
                          <td className="px-4 py-2.5 font-medium text-foreground">{change.crewName} <span className="ml-1 font-mono text-2xs text-muted-foreground">{change.crewId}</span></td>
                          <td className="px-4 py-2.5 text-muted-foreground">{change.before}</td>
                          <td className="px-4 py-2.5 text-foreground">{change.after}</td>
                          <td className="px-4 py-2.5"><span className={`rounded-sm px-1.5 py-0.5 text-2xs font-semibold capitalize ${changeStyle(change.changeType)}`}>{change.changeType}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}

const Field = ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) => (
  <label className="block min-w-0">
    <span className="mb-1 block text-2xs font-medium text-muted-foreground">{label}</span>
    <input value={value} onChange={(event) => onChange(event.target.value)} className="h-8 w-full rounded-sm border border-border bg-background px-2 text-xs uppercase text-foreground outline-none focus:border-primary" />
  </label>
)

const Metric = ({ label, value }: { label: string; value: string }) => (
  <div><div className="text-muted-foreground">{label}</div><div className="mt-0.5 font-semibold text-foreground">{value}</div></div>
)
