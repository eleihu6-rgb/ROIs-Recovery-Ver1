import type { ReactNode } from 'react'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@rois/ui'
import type { ToFilterParams, TrainingExpiryFilter } from '@/types'
import { TagInput } from './tag-input'
import { CollapsibleSection } from './collapsible-section'

interface ToTrainingFilterProps {
  training: ToFilterParams['training']
  onChange: (training: ToFilterParams['training']) => void
  disabled?: boolean
}

export const ToTrainingFilter = ({ training, onChange, disabled = false }: ToTrainingFilterProps): ReactNode => {
  const patch = (partial: Partial<ToFilterParams['training']>): void => onChange({ ...training, ...partial })
  const badgeCount = training.courseTypes.length + training.priorities.length

  return (
    <CollapsibleSection title="Training Filters" badgeCount={badgeCount}>
      <div className="flex flex-col gap-3 text-xs">
        <div className="flex flex-col gap-1">
          <label className="text-muted-foreground">Course Types</label>
          <TagInput tags={training.courseTypes} onChange={(courseTypes) => patch({ courseTypes })} placeholder="e.g. Annual Recurrent" disabled={disabled} />
        </div>
        <div className="flex items-center gap-2">
          <label className="w-20 shrink-0 text-muted-foreground">Expiry Filter</label>
          <Select value={training.expiryFilter} onValueChange={(v: string) => patch({ expiryFilter: v as TrainingExpiryFilter })} disabled={disabled}>
            <SelectTrigger className="h-6 flex-1 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="EXPIRING_90D" className="text-xs">Expiring within 90 days</SelectItem>
              <SelectItem value="ALL" className="text-xs">All</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-muted-foreground">Priorities</label>
          <TagInput tags={training.priorities} onChange={(priorities) => patch({ priorities })} placeholder="e.g. Urgent" disabled={disabled} />
        </div>
      </div>
    </CollapsibleSection>
  )
}
