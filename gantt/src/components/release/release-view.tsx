// gantt/src/components/release/release-view.tsx
import { useState, useRef, useEffect } from 'react'
import { ReleaseNav } from './release-nav'
import { ReleaseDetail } from './release-detail'
import { RELEASES } from './release-data'

export const ReleaseView = () => {
  // Default to the latest release (first in the list).
  const [activeN, setActiveN] = useState<number>(RELEASES[0]?.n ?? 0)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    contentRef.current?.scrollTo(0, 0)
  }, [activeN])

  const active = RELEASES.find((r) => r.n === activeN) ?? RELEASES[0]

  return (
    <div data-testid="release-view" className="flex h-full overflow-hidden">
      {/* Left nav — fixed width, mirrors the Help layout */}
      <div className="w-64 shrink-0 border-r border-border bg-muted/20">
        <ReleaseNav releases={RELEASES} activeN={activeN} onSelect={setActiveN} />
      </div>

      {/* Content area */}
      <div ref={contentRef} className="flex-1 overflow-y-auto bg-background">
        {active ? (
          <ReleaseDetail release={active} />
        ) : (
          <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
            No release notes yet.
          </div>
        )}
      </div>
    </div>
  )
}
