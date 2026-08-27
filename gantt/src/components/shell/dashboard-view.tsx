import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { formatUiDate } from '@rois/ui'
import { dashboardApi, type DashboardOverview } from '@/services/dashboard-service'

/** Indeterminate loading bar — sits flush at the bottom inside the card */
const CardProgress = () => (
  <div className="absolute inset-x-0 bottom-0 h-[2px] overflow-hidden rounded-b-lg bg-muted/60">
    <div
      className="absolute h-full rounded-full bg-primary/70"
      style={{ animation: 'rois-bar 1.5s cubic-bezier(0.65,0.815,0.735,0.395) infinite' }}
    />
  </div>
)

/** Skeleton block for not-yet-loaded values */
const Skeleton = ({ className = '' }: { className?: string }) => (
  <div className={`animate-pulse rounded bg-muted/80 ${className}`} />
)

// ─── Stat card ──────────────────────────────────────────────────────────────
const StatCard = ({
  label,
  value,
  accentClass,
  sub,
  loading,
}: {
  label: string
  value: number | null
  accentClass: string
  sub: string
  loading: boolean
}) => (
  <div className="relative overflow-hidden rounded-lg border border-border bg-card p-4 pb-5 shadow-sm transition-shadow hover:shadow-md">
    {/* Top accent stripe */}
    <div className={`absolute inset-x-0 top-0 h-[3px] rounded-t-lg ${accentClass}`} />

    {/* Label — always visible */}
    <div className="mb-2 text-3xs font-bold uppercase tracking-[0.06em] text-muted-foreground">
      {label}
    </div>

    {/* Value or skeleton */}
    {loading ? (
      <Skeleton className="mb-2 h-7 w-20" />
    ) : (
      <div className="mb-1.5 text-2xl font-bold tabular-nums tracking-tight text-foreground leading-none transition-opacity duration-300">
        {value === null ? '—' : value.toLocaleString()}
      </div>
    )}

    {/* Sub label */}
    <div className={`text-2xs transition-opacity duration-300 ${loading ? 'text-muted-foreground/40' : 'text-muted-foreground'}`}>
      {sub}
    </div>

    {/* Bottom progress bar */}
    {loading && <CardProgress />}
  </div>
)

// ─── Chart card wrapper ─────────────────────────────────────────────────────
const ChartCard = ({
  title,
  loading,
  children,
  minH = 'h-[90px]',
}: {
  title: string
  loading: boolean
  children: React.ReactNode
  minH?: string
}) => (
  <div className="relative overflow-hidden rounded-lg border border-border bg-card p-4 pb-5 shadow-sm">
    <div className="mb-3 text-xs font-bold text-foreground">{title}</div>

    {loading ? (
      <div className={`flex ${minH} flex-col gap-2 justify-center`}>
        {/* Skeleton rows to hint at chart shape */}
        <Skeleton className="h-1.5 w-full" />
        <Skeleton className="h-1.5 w-5/6" />
        <Skeleton className="h-1.5 w-4/6" />
        <Skeleton className="h-1.5 w-3/5" />
      </div>
    ) : (
      <div className="transition-opacity duration-300">
        {children}
      </div>
    )}

    {loading && <CardProgress />}
  </div>
)

// ─── Main view ──────────────────────────────────────────────────────────────
export const DashboardView = () => {
  const [data, setData] = useState<DashboardOverview | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const result = await dashboardApi.overview()
      setData(result)
    } catch {
      // silently fail — cards stay in skeleton state showing "—"
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const today = formatUiDate(new Date())

  const maxRank = Math.max(...(data?.crewByRank.map((r) => r.count) ?? [1]), 1)
  const maxDay  = Math.max(...(data?.flightsByDay.map((d) => d.count) ?? [1]), 1)

  return (
    <div className="h-full overflow-y-auto p-5">
        {/* Page header */}
        <div className="mb-4 flex items-start justify-between">
          <div>
            <div className="text-base font-semibold tracking-tight text-foreground">Overview</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{today} · F8 Airlines</div>
          </div>
          <button
            className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* ── Stat cards — always rendered ───────────────────────────────── */}
        <div className="mb-3 grid grid-cols-4 gap-2.5">
          <StatCard
            label="Flights Today"
            value={data?.flightsToday ?? null}
            accentClass="bg-chart-1"
            sub="Scheduled departures"
            loading={loading}
          />
          <StatCard
            label="Active Crew"
            value={data?.totalActiveCrew ?? null}
            accentClass="bg-chart-2"
            sub="On payroll"
            loading={loading}
          />
          <StatCard
            label="Violations"
            value={data?.violations ?? null}
            accentClass="bg-destructive"
            sub="Rule checks"
            loading={loading}
          />
          <StatCard
            label="Pending Approvals"
            value={data?.pendingApprovals ?? null}
            accentClass="bg-chart-4"
            sub="Awaiting review"
            loading={loading}
          />
        </div>

        {/* ── Chart cards — always rendered ──────────────────────────────── */}
        <div className="mb-3 grid grid-cols-3 gap-2.5">

          {/* Crew by Rank */}
          <ChartCard title="Crew by Rank" loading={loading} minH="h-[90px]">
            {data && data.crewByRank.length > 0 ? (
              <div className="flex flex-col gap-2">
                {data.crewByRank.map(({ rank, count }) => (
                  <div key={rank} className="flex items-center gap-2 text-xs">
                    <div className="w-10 shrink-0 text-right text-2xs font-medium text-muted-foreground">
                      {rank}
                    </div>
                    <div className="h-1.5 flex-1 overflow-hidden rounded bg-muted">
                      <div
                        className="h-full rounded bg-primary transition-[width] duration-700"
                        style={{ width: `${Math.round((count / maxRank) * 100)}%` }}
                      />
                    </div>
                    <div className="w-8 shrink-0 text-right text-2xs font-semibold text-muted-foreground">
                      {count}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-20 items-center justify-center text-xs italic text-muted-foreground/50">
                No data
              </div>
            )}
          </ChartCard>

          {/* Crew Status placeholder */}
          <ChartCard title="Crew Status" loading={loading} minH="h-[90px]">
            <div className="flex h-[72px] items-center justify-center text-xs italic text-muted-foreground/50">
              Data integration pending
            </div>
          </ChartCard>

          {/* Flights last 14 days */}
          <ChartCard title="Flights — Last 14 Days" loading={loading} minH="h-[80px]">
            {data && data.flightsByDay.length > 0 ? (
              <>
                <div className="flex h-[60px] items-end gap-0.5">
                  {data.flightsByDay.map(({ date, count }) => (
                    <div
                      key={date}
                      className="min-h-[4px] flex-1 rounded-t-[2px] bg-primary/50 transition-[height] duration-700 hover:bg-primary"
                      style={{ height: `${Math.max(4, Math.round((count / maxDay) * 100))}%` }}
                      title={`${date}: ${count}`}
                    />
                  ))}
                </div>
                <div className="mt-1 flex justify-between text-3xs text-muted-foreground">
                  <span>{data.flightsByDay[0]?.date?.slice(5) ?? ''}</span>
                  <span>{data.flightsByDay.at(-1)?.date?.slice(5) ?? ''}</span>
                </div>
              </>
            ) : (
              <div className="flex h-[60px] items-center justify-center text-xs italic text-muted-foreground/50">
                No data
              </div>
            )}
          </ChartCard>

        </div>
    </div>
  )
}
