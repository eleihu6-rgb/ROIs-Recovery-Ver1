// gantt/src/components/composition/composition-tree.tsx
import { useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { cn } from '@rois/ui'
import { useCompositionStore } from '@/stores/composition-store'

interface Props {
  onAdd(): void
}

export const CompositionTree = ({ onAdd }: Props) => {
  const compositions = useCompositionStore((s) => s.compositions)
  const selectedId   = useCompositionStore((s) => s.selectedId)
  const selectComposition = useCompositionStore((s) => s.selectComposition)

  const [search, setSearch] = useState('')

  const filtered = compositions.filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.division.toLowerCase().includes(search.toLowerCase())
  )

  // Group by division, then sort each group by displayOrder
  const byDivision = filtered.reduce<Record<string, typeof filtered>>((acc, c) => {
    const div = c.division || 'Other'
    if (!acc[div]) acc[div] = []
    acc[div].push(c)
    return acc
  }, {})
  Object.values(byDivision).forEach((arr) =>
    arr.sort((a, b) => a.displayOrder - b.displayOrder)
  )
  const divisions = Object.keys(byDivision).sort()

  const isSby = (name: string) => name.toLowerCase().includes('sby')

  return (
    <aside className="flex w-[220px] shrink-0 flex-col border-r border-border bg-card overflow-hidden">
      {/* Search + Add */}
      <div className="flex items-center gap-1.5 border-b border-border px-2 py-2 flex-shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <input
            className="h-7 w-full rounded-md border border-border bg-background pl-6 pr-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          onClick={onAdd}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 flex-shrink-0"
          title="New Composition"
          aria-label="New Composition"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {divisions.length === 0 && (
          <div className="py-8 text-center text-xs text-muted-foreground">No compositions</div>
        )}
        {divisions.map((div) => (
          <div key={div}>
            {/* Division header */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 text-2xs font-bold uppercase tracking-widest text-muted-foreground/60">
              <span>▾</span>
              <span>{div}</span>
            </div>
            {/* Composition items */}
            {byDivision[div].map((comp) => (
              <div
                key={comp.id}
                role="button"
                tabIndex={0}
                onClick={() => void selectComposition(comp.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    void selectComposition(comp.id)
                  }
                }}
                className={cn(
                  'flex items-center gap-2 py-1.5 pl-7 pr-3 text-xs cursor-pointer border-l-2 transition-colors duration-100',
                  selectedId === comp.id
                    ? 'border-primary bg-primary/10 font-semibold text-primary'
                    : 'border-transparent text-foreground/70 hover:bg-accent/50 hover:text-foreground'
                )}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current flex-shrink-0 opacity-60" />
                <span className="flex-1 truncate">{comp.name}</span>
                {isSby(comp.name) && (
                  <span className="ml-auto rounded bg-amber-500/15 px-1 py-0.5 text-3xs font-bold text-amber-400">
                    SBY
                  </span>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </aside>
  )
}