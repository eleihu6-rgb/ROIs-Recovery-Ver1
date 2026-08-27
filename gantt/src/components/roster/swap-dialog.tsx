import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Button, Input,
} from '@rois/ui'
import { useUiStore } from '@/stores/ui-store'
import { useRosterStore } from '@/stores/roster-store'

export const SwapDialog = () => {
  const open = useUiStore((s) => s.swapDialogOpen)
  const sourceTask = useUiStore((s) => s.swapSourceTask)
  const closeSwapDialog = useUiStore((s) => s.closeSwapDialog)
  const swapTasks = useRosterStore((s) => s.swapTasks)

  const [targetTaskId, setTargetTaskId] = useState('')
  const [swapping, setSwapping] = useState(false)

  if (!sourceTask) return null

  const handleSwap = async () => {
    const targetId = Number(targetTaskId)
    if (!targetId || isNaN(targetId)) return

    setSwapping(true)
    try {
      await swapTasks('main', sourceTask.id, targetId)
      closeSwapDialog()
      setTargetTaskId('')
    } catch {
      // Error handled by store
    } finally {
      setSwapping(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && closeSwapDialog()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Swap Tasks</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 text-sm">
          <div>
            <span className="text-muted-foreground">Source Task:</span>
            <span className="ml-2 font-medium">
              #{sourceTask.id} - {sourceTask.label || sourceTask.assignmentGroup} ({sourceTask.crewId})
            </span>
          </div>

          <div className="grid grid-cols-[100px_1fr] items-center gap-2">
            <label className="text-muted-foreground">Target Task ID:</label>
            <Input
              type="number"
              value={targetTaskId}
              onChange={(e) => setTargetTaskId(e.target.value)}
              placeholder="Enter task ID"
              className="h-8"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={closeSwapDialog}>
            Cancel
          </Button>
          <Button onClick={handleSwap} disabled={swapping || !targetTaskId}>
            {swapping ? 'Swapping...' : 'Swap'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
