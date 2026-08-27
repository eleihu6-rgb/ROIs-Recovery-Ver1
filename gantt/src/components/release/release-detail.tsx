// gantt/src/components/release/release-detail.tsx
import { useState } from 'react'
import {
  CalendarDays, FlaskConical, ScrollText, Database, Globe, Settings2,
  ChevronDown, GitCommitHorizontal,
} from 'lucide-react'
import { HelpScreenshot } from '@/components/help/help-article'
import { AREA_ORDER, itemsForArea, shortDate } from './release-data'
import type { Release, ReleaseArea, ReleaseItem } from './release-data'

const AREA_ICON: Record<ReleaseArea, React.ElementType> = {
  Live: CalendarDays,
  Scenario: FlaskConical,
  Rule: ScrollText,
  Data: Database,
  System: Settings2,
  Regression: FlaskConical,
  Global: Globe,
}

const TypeChip = ({ type }: { type: ReleaseItem['type'] }) =>
  type === 'enhancement' ? (
    <span className="inline-block rounded-sm bg-primary/10 px-1.5 py-0.5 text-3xs font-bold uppercase tracking-wide text-primary">
      Enhancement
    </span>
  ) : (
    <span className="inline-block rounded-sm bg-rose-100 px-1.5 py-0.5 text-3xs font-bold uppercase tracking-wide text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
      Bug fix
    </span>
  )

const ChangeTable = ({ area, items }: { area: ReleaseArea; items: ReleaseItem[] }) => (
  <table className="w-full border-collapse text-left" data-testid={`release-table-${area}`}>
    <thead>
      <tr className="border-b border-border text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
        <th className="w-[68px] py-1.5 pr-3 font-semibold">Date</th>
        <th className="w-[96px] py-1.5 pr-3 font-semibold">Type</th>
        <th className="py-1.5 font-semibold">Change</th>
      </tr>
    </thead>
    <tbody>
      {items.map((item, i) => (
        <tr key={i} className="border-b border-dashed border-border align-top last:border-b-0">
          <td className="py-2.5 pr-3">
            <span className="font-mono text-2xs tabular-nums text-muted-foreground">{shortDate(item.date)}</span>
          </td>
          <td className="py-2.5 pr-3">
            <TypeChip type={item.type} />
          </td>
          <td className="py-2.5">
            <div className="text-sm font-semibold text-foreground">{item.title}</div>
            <p
              className="mt-0.5 text-xs leading-relaxed text-muted-foreground"
              // body holds light inline markup (<b>) authored in release-data
              dangerouslySetInnerHTML={{ __html: item.body }}
            />
          </td>
        </tr>
      ))}
    </tbody>
  </table>
)

const GalleryStrip = ({ area, items }: { area: ReleaseArea; items: ReleaseItem[] }) => {
  const shots = items.filter((i) => i.shot)
  if (shots.length === 0) return null
  return (
    <div
      className="mt-4 grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-3"
      data-testid={`release-gallery-${area}`}
    >
      {shots.map((item, i) => (
        <HelpScreenshot key={i} src={item.shot!.src} alt={item.shot!.alt} caption={item.shot!.caption} />
      ))}
    </div>
  )
}

const AreaSection = ({ area, items }: { area: ReleaseArea; items: ReleaseItem[] }) => {
  const [open, setOpen] = useState(true)
  const Icon = AREA_ICON[area]
  return (
    <section className="mb-3 overflow-hidden rounded-lg border border-border" data-testid={`release-area-${area}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 bg-muted/50 px-4 py-2.5 text-left transition-colors hover:bg-muted"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="flex-1 text-sm font-bold text-foreground">{area}</span>
        <span className="text-2xs font-semibold text-muted-foreground">
          {items.length} change{items.length === 1 ? '' : 's'}
        </span>
        <ChevronDown
          className={['h-4 w-4 shrink-0 text-muted-foreground transition-transform', open ? '' : '-rotate-90'].join(' ')}
        />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-2">
          <ChangeTable area={area} items={items} />
          <GalleryStrip area={area} items={items} />
        </div>
      )}
    </section>
  )
}

const Stat = ({ n, label, tone }: { n: number; label: string; tone?: 'enh' | 'fix' }) => (
  <div className="min-w-[92px] rounded-lg border border-border bg-background px-3.5 py-2">
    <div
      className={[
        'text-xl font-bold leading-none tabular-nums',
        tone === 'enh' ? 'text-primary' : tone === 'fix' ? 'text-rose-600 dark:text-rose-400' : 'text-foreground',
      ].join(' ')}
    >
      {n}
    </div>
    <div className="mt-1 text-2xs text-muted-foreground">{label}</div>
  </div>
)

export const ReleaseDetail = ({ release }: { release: Release }) => {
  const enh = release.items.filter((i) => i.type === 'enhancement').length
  const fix = release.items.filter((i) => i.type === 'fix').length
  const areas = AREA_ORDER.filter((a) => release.items.some((i) => i.area === a))

  return (
    <div className="mx-auto max-w-4xl px-8 py-6" data-testid="release-detail">
      {/* Hero header */}
      <div className="mb-5 rounded-xl border border-border bg-gradient-to-b from-primary/5 to-background p-5">
        <h1 className="text-xl font-bold text-foreground" data-testid="release-detail-title">
          Rel {release.n} — {release.date}
        </h1>
        <p className="mb-3 mt-1 text-xs leading-relaxed text-muted-foreground">{release.summary}</p>
        <div className="flex flex-wrap gap-2.5">
          <Stat n={enh} label="Enhancements" tone="enh" />
          <Stat n={fix} label="Bug fixes" tone="fix" />
          <Stat n={areas.length} label="Areas touched" />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 font-mono tabular-nums">
            <GitCommitHorizontal className="h-3.5 w-3.5" />
            {release.fromCommit} … {release.toCommit}
          </span>
          <span>·</span>
          <span>{release.rangeLabel}</span>
          <span>·</span>
          <span className="font-mono">{release.version}</span>
        </div>
        {release.note && (
          <p className="mt-2 text-2xs italic text-muted-foreground">{release.note}</p>
        )}
      </div>

      {/* Area sections — one table + gallery per nav tab */}
      {areas.map((area) => (
        <AreaSection key={area} area={area} items={itemsForArea(release, area)} />
      ))}
    </div>
  )
}
