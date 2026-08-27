import { useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface CollapsibleSectionProps {
  title: string
  badgeCount?: number
  defaultOpen?: boolean
  children: ReactNode
}

export const CollapsibleSection = ({
  title,
  badgeCount,
  defaultOpen = true,
  children,
}: CollapsibleSectionProps): ReactNode => {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-2 text-xs font-semibold text-foreground hover:bg-accent/50 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        {open
          ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        <span className="flex-1 text-left">{title}</span>
        {badgeCount !== undefined && badgeCount > 0 && (
          <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-2xs font-bold text-primary">
            {badgeCount}
          </span>
        )}
      </button>
      {open && (
        <div className="px-4 pb-3 pt-1">
          {children}
        </div>
      )}
    </div>
  )
}
