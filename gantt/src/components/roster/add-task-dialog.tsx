import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Button, Input, Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@rois/ui'
import { useUiStore } from '@/stores/ui-store'
import { useRosterStore } from '@/stores/roster-store'
import { useCrewStore } from '@/stores/crew-store'
import type { CreateRosterInput } from '@/types'

const ASSIGNMENT_GROUPS = [
  { value: 'FLT', label: 'Flight' },
  { value: 'DHD', label: 'Deadhead' },
  { value: 'SBY', label: 'Standby' },
  { value: 'TRN', label: 'Training' },
  { value: 'GRD', label: 'Ground Duty' },
  { value: 'SIM', label: 'Simulator' },
  { value: 'OFF', label: 'Day Off' },
  { value: 'VAC', label: 'Vacation' },
  { value: 'SLV', label: 'Sick Leave' },
  { value: 'ADM', label: 'Admin' },
]

export const AddTaskDialog = () => {
  const open = useUiStore((s) => s.addTaskOpen)
  const preselectedCrewId = useUiStore((s) => s.addTaskCrewId)
  const closeAddTask = useUiStore((s) => s.closeAddTask)
  const addTask = useRosterStore((s) => s.addTask)
  const selectedCrewIds = useCrewStore((s) => s.selectedCrewIds)

  const [form, setForm] = useState({
    crewId: '',
    assignmentGroup: 'GRD',
    label: '',
    base: '',
    flightActingRank: '',
    schStrDtUtc: '',
    schEndDtUtc: '',
    comments: '',
  })
  const [saving, setSaving] = useState(false)

  // Reset form when dialog opens
  const handleOpenChange = (v: boolean) => {
    if (!v) {
      closeAddTask()
    } else {
      setForm({
        crewId: preselectedCrewId || (selectedCrewIds.length === 1 ? selectedCrewIds[0] : ''),
        assignmentGroup: 'GRD',
        label: '',
        base: '',
        flightActingRank: '',
        schStrDtUtc: '',
        schEndDtUtc: '',
        comments: '',
      })
    }
  }

  const handleSubmit = async () => {
    if (!form.crewId || !form.schStrDtUtc || !form.schEndDtUtc || !form.base || !form.flightActingRank) {
      return
    }

    setSaving(true)
    try {
      const input: CreateRosterInput = {
        crewId: form.crewId,
        assignmentGroup: form.assignmentGroup,
        label: form.label || undefined,
        base: form.base,
        flightActingRank: form.flightActingRank,
        schStrDtUtc: new Date(form.schStrDtUtc).toISOString(),
        schEndDtUtc: new Date(form.schEndDtUtc).toISOString(),
        comments: form.comments || undefined,
      }
      await addTask('main', input)
      closeAddTask()
    } catch {
      // Error handled by store
    } finally {
      setSaving(false)
    }
  }

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Task</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid grid-cols-[100px_1fr] items-center gap-2">
            <label className="text-sm text-muted-foreground">Crew ID *</label>
            <Input
              value={form.crewId}
              onChange={(e) => updateField('crewId', e.target.value)}
              placeholder="e.g. C001"
              className="h-8"
            />
          </div>

          <div className="grid grid-cols-[100px_1fr] items-center gap-2">
            <label className="text-sm text-muted-foreground">Type *</label>
            <Select
              value={form.assignmentGroup}
              onValueChange={(v) => updateField('assignmentGroup', v)}
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSIGNMENT_GROUPS.map((ag) => (
                  <SelectItem key={ag.value} value={ag.value}>
                    {ag.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-[100px_1fr] items-center gap-2">
            <label className="text-sm text-muted-foreground">Label</label>
            <Input
              value={form.label}
              onChange={(e) => updateField('label', e.target.value)}
              placeholder="e.g. CA1234"
              className="h-8"
            />
          </div>

          <div className="grid grid-cols-[100px_1fr] items-center gap-2">
            <label className="text-sm text-muted-foreground">Base *</label>
            <Input
              value={form.base}
              onChange={(e) => updateField('base', e.target.value)}
              placeholder="e.g. PEK"
              className="h-8"
            />
          </div>

          <div className="grid grid-cols-[100px_1fr] items-center gap-2">
            <label className="text-sm text-muted-foreground">Rank *</label>
            <Input
              value={form.flightActingRank}
              onChange={(e) => updateField('flightActingRank', e.target.value)}
              placeholder="e.g. CA"
              className="h-8"
            />
          </div>

          <div className="grid grid-cols-[100px_1fr] items-center gap-2">
            <label className="text-sm text-muted-foreground">Start *</label>
            <Input
              type="datetime-local"
              value={form.schStrDtUtc}
              onChange={(e) => updateField('schStrDtUtc', e.target.value)}
              className="h-8"
            />
          </div>

          <div className="grid grid-cols-[100px_1fr] items-center gap-2">
            <label className="text-sm text-muted-foreground">End *</label>
            <Input
              type="datetime-local"
              value={form.schEndDtUtc}
              onChange={(e) => updateField('schEndDtUtc', e.target.value)}
              className="h-8"
            />
          </div>

          <div className="grid grid-cols-[100px_1fr] items-center gap-2">
            <label className="text-sm text-muted-foreground">Comments</label>
            <Input
              value={form.comments}
              onChange={(e) => updateField('comments', e.target.value)}
              placeholder="Optional notes..."
              className="h-8"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={closeAddTask}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? 'Creating...' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
