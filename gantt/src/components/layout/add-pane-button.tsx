// gantt/src/components/layout/add-pane-button.tsx

import { Plus } from 'lucide-react'

export const AddPaneButton = () => {
  return (
    <div className="flex items-center gap-1 text-muted-foreground text-sm">
      <Plus className="w-4 h-4" />
      <span>Add Pane</span>
    </div>
  )
}