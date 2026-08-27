import { useState, useEffect } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Button, Input, Badge,
} from '@rois/ui'
import { useUiStore } from '@/stores/ui-store'
import { useRosterStore } from '@/stores/roster-store'
import { formatDateTime, formatDuration, safeParseISO } from '@/utils/date'
import { getTaskColor } from '@/utils/color'

export const TaskDetailDialog = () => {
  const open = useUiStore((s) => s.taskDetailOpen)
  const task = useUiStore((s) => s.taskDetailItem)
  const closeTaskDetail = useUiStore((s) => s.closeTaskDetail)
  const updateTask = useRosterStore((s) => s.updateTask)

  const [comments, setComments] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (task) {
      setComments(task.comments || '')
    }
  }, [task])

  if (!task) return null

  const color = getTaskColor(task.assignmentGroup)
  const startDate = safeParseISO(task.schStrDtUtc)
  const endDate = safeParseISO(task.schEndDtUtc)

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateTask('main', task.id, { comments })
      closeTaskDetail()
    } catch {
      // Error handled by store
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && closeTaskDetail()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Task Detail
            <Badge
              style={{ backgroundColor: color.bg, color: color.text }}
            >
              {task.assignmentGroup}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 text-sm">
          <div className="grid grid-cols-[120px_1fr] gap-1">
            <span className="text-muted-foreground">Crew ID:</span>
            <span className="font-medium">{task.crewId}</span>
          </div>

          <div className="grid grid-cols-[120px_1fr] gap-1">
            <span className="text-muted-foreground">Label:</span>
            <span className="font-medium">{task.label || '-'}</span>
          </div>

          <div className="grid grid-cols-[120px_1fr] gap-1">
            <span className="text-muted-foreground">Assignment:</span>
            <span className="font-medium">
              {task.assignmentGroup}
              {task.assignment ? ` / ${task.assignment}` : ''}
            </span>
          </div>

          <div className="grid grid-cols-[120px_1fr] gap-1">
            <span className="text-muted-foreground">Role:</span>
            <span className="font-medium">{task.role || '-'}</span>
          </div>

          <div className="grid grid-cols-[120px_1fr] gap-1">
            <span className="text-muted-foreground">Acting Rank:</span>
            <span className="font-medium">{task.flightActingRank}</span>
          </div>

          <div className="grid grid-cols-[120px_1fr] gap-1">
            <span className="text-muted-foreground">Start (UTC):</span>
            <span className="font-medium">
              {startDate ? formatDateTime(startDate) : '-'}
            </span>
          </div>

          <div className="grid grid-cols-[120px_1fr] gap-1">
            <span className="text-muted-foreground">End (UTC):</span>
            <span className="font-medium">
              {endDate ? formatDateTime(endDate) : '-'}
            </span>
          </div>

          {task.schStrDtUtc && task.schEndDtUtc && (
            <div className="grid grid-cols-[120px_1fr] gap-1">
              <span className="text-muted-foreground">Duration:</span>
              <span className="font-medium">
                {formatDuration(task.schStrDtUtc, task.schEndDtUtc)}
              </span>
            </div>
          )}

          <div className="grid grid-cols-[120px_1fr] gap-1">
            <span className="text-muted-foreground">Base:</span>
            <span className="font-medium">{task.base}</span>
          </div>

          {task.fltId && (
            <div className="grid grid-cols-[120px_1fr] gap-1">
              <span className="text-muted-foreground">Flight ID:</span>
              <span className="font-medium">{task.fltId}</span>
            </div>
          )}

          <div className="grid grid-cols-[120px_1fr] gap-1">
            <span className="text-muted-foreground">Comments:</span>
            <Input
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Add comments..."
              className="h-8"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={closeTaskDetail}>
            Close
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
