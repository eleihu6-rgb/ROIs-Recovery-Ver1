import { useState } from 'react'
import { AppDialog, Button } from '@rois/ui'
import { FlaskConical } from 'lucide-react'

export interface AddTestData {
  title: string
  category: string
  priority: string
  description: string
}

interface AddTestDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  onSave: (data: AddTestData) => void
}

const PRIORITIES = ['High', 'Medium', 'Low']

const FIELD_CLASS =
  'mt-1 w-full rounded-sm border border-border bg-background px-2 py-1.5 text-xs text-foreground'

export const AddTestDialog = ({ open, onOpenChange, onSave }: AddTestDialogProps) => {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('General')
  const [priority, setPriority] = useState('Medium')
  const [description, setDescription] = useState('')

  const save = () => {
    if (!title.trim()) return
    onSave({ title: title.trim(), category: category.trim() || 'General', priority, description })
    setTitle('')
    setDescription('')
    setCategory('General')
    setPriority('Medium')
    onOpenChange(false)
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      data-testid="add-test-dialog"
      className="sm:max-w-[540px]"
      icon={<FlaskConical className="h-4 w-4" />}
      title="Add Regression Test"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} data-testid="add-test-save" disabled={!title.trim()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block text-2xs font-medium text-muted-foreground">
          Story / what does this test check?
          <textarea
            data-testid="add-test-title"
            className={FIELD_CLASS}
            rows={6}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Filtering to BKK shows a base chip on the toolbar"
          />
        </label>

        <div className="flex gap-3">
          <label className="flex-1 text-2xs font-medium text-muted-foreground">
            Category
            <input
              data-testid="add-test-category"
              className={FIELD_CLASS}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </label>
          <label className="w-32 text-2xs font-medium text-muted-foreground">
            Priority
            <select
              data-testid="add-test-priority"
              className={FIELD_CLASS}
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block text-2xs font-medium text-muted-foreground">
          Notes / acceptance criteria (optional)
          <textarea
            data-testid="add-test-notes"
            className={FIELD_CLASS}
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
      </div>
    </AppDialog>
  )
}
