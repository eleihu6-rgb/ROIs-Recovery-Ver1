import React from 'react'
import { FlaskConical, Plus } from 'lucide-react'
import { Button } from '@rois/ui'

interface ScenarioEmptyStateProps {
  onCreateNew?: () => void
  /** 是否显示创建按钮，默认 true；右侧详情面板空态设为 false */
  showCreateButton?: boolean
}

export const ScenarioEmptyState = ({
  onCreateNew,
  showCreateButton = true,
}: ScenarioEmptyStateProps): React.ReactNode => {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center">
      <FlaskConical size={44} className="text-muted-foreground/50" />
      <div>
        <h2 className="text-sm font-semibold text-foreground">
          {showCreateButton ? 'No scenarios yet' : 'No scenario selected'}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {showCreateButton
            ? 'Click "+ New" above to create your first scenario'
            : 'Select a scenario from the list, or create a new one'}
        </p>
      </div>
      {showCreateButton && onCreateNew && (
        <Button onClick={onCreateNew} variant="outline" size="sm" className="h-7 text-xs">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New Scenario
        </Button>
      )}
    </div>
  )
}
