import { cn } from '@rois/ui'
import { useCrewStore } from '@/stores/crew-store'
import type { Crew } from '@/types'

interface CrewRowProps {
  crew: Crew
}

export const CrewRow = ({ crew }: CrewRowProps) => {
  const selectedCrewIds = useCrewStore((s) => s.selectedCrewIds)
  const toggleCrewSelection = useCrewStore((s) => s.toggleCrewSelection)
  const isSelected = selectedCrewIds.includes(crew.crewId)

  return (
    <div
      className={cn(
        'flex cursor-pointer items-center gap-2 border-b px-2 py-1.5 text-sm transition-colors hover:bg-accent',
        isSelected && 'bg-accent/50',
      )}
      onClick={() => toggleCrewSelection(crew.crewId)}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={() => toggleCrewSelection(crew.crewId)}
        className="h-3.5 w-3.5 rounded"
      />
      <div className="flex flex-col overflow-hidden">
        <span className="truncate font-medium">
          {crew.lastName} {crew.firstName}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {crew.crewId} | {crew.division === 'P' ? 'Pilot' : 'Cabin'}
        </span>
      </div>
    </div>
  )
}
