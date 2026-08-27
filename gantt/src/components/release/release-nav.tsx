// gantt/src/components/release/release-nav.tsx
import { Megaphone } from 'lucide-react'
import type { Release } from './release-data'

interface ReleaseNavProps {
  releases: Release[]
  activeN: number
  onSelect: (n: number) => void
}

/** Left tree of releases — latest on top, labelled "Rel N — <date>". */
export const ReleaseNav = ({ releases, activeN, onSelect }: ReleaseNavProps) => (
  <div className="flex h-full flex-col">
    {/* Header — mirrors the content-panel title-bar standard */}
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-4">
      <Megaphone className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="text-sm font-semibold text-foreground">Release Notes</span>
    </div>

    <nav className="flex-1 overflow-y-auto py-1" data-testid="release-tree">
      {releases.map((r) => {
        const isActive = r.n === activeN
        const enh = r.items.filter((i) => i.type === 'enhancement').length
        const fix = r.items.filter((i) => i.type === 'fix').length
        return (
          <button
            key={r.n}
            type="button"
            data-testid={`release-tree-item-${r.n}`}
            onClick={() => onSelect(r.n)}
            className={[
              'flex w-full flex-col items-start border-b border-border px-4 py-2.5 text-left transition-colors',
              isActive
                ? 'bg-primary/10 border-r-2 border-r-primary'
                : 'hover:bg-muted/50',
            ].join(' ')}
          >
            <span className="flex items-center gap-2">
              <span className="rounded-sm bg-primary px-1.5 py-0.5 text-2xs font-bold text-primary-foreground tabular-nums">
                Rel {r.n}
              </span>
              <span className={['text-xs font-semibold', isActive ? 'text-primary' : 'text-foreground'].join(' ')}>
                {r.date}
              </span>
            </span>
            <span className="mt-1 text-2xs text-muted-foreground">
              {enh} enhancement{enh === 1 ? '' : 's'} · {fix} fix{fix === 1 ? '' : 'es'}
            </span>
          </button>
        )
      })}
    </nav>
  </div>
)
