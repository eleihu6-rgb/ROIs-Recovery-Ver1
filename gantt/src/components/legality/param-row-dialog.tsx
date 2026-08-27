import { Pencil } from 'lucide-react'
import { AppDialog, Button } from '@rois/ui'
import { ParamCellInput } from './param-cell-input'
import { isDraftValid } from '@/utils/param-format'
import type { CellFormat } from '@/utils/param-format'
import type { EditingRowDialog } from './param-editor-reducer'

interface Props {
  editing: EditingRowDialog
  header: string[]
  columnFormats: CellFormat[]
  ruleName: string
  onUpdate: (colIdx: number, value: string) => void
  onConfirm: () => void
  onCancel: () => void
}

export const ParamRowDialog = ({
  editing,
  header,
  columnFormats,
  ruleName,
  onUpdate,
  onConfirm,
  onCancel,
}: Props) => {
  const valid = isDraftValid(editing.draft, columnFormats)

  return (
    <AppDialog
      open
      onOpenChange={(o) => { if (!o) onCancel() }}
      data-testid="param-row-dialog"
      className="sm:max-w-[880px]"
      icon={<Pencil className="h-4 w-4" />}
      title={`Edit Row · ${ruleName}`}
      description={`Row ${editing.rowIdx + 1} — ${header.length} columns`}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button onClick={onConfirm} disabled={!valid} data-testid="param-row-dialog-confirm">
            Save
          </Button>
        </>
      }
    >
      {/* 3-column grid + full-width inputs: fewer rows (less scrolling) and wide cells so
          pipe-delimited values (e.g. GRD|VAC|SIM) stay readable. */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-1 py-2 md:grid-cols-3">
        {header.map((col, ci) => (
          <div key={ci} className="flex flex-col gap-1">
            <label className="text-3xs font-bold uppercase tracking-wide text-muted-foreground">
              {col}
            </label>
            <ParamCellInput
              data-testid={`param-row-dialog-cell-${ci}`}
              value={editing.draft[ci] ?? ''}
              format={columnFormats[ci] ?? 'text'}
              onChange={(v) => onUpdate(ci, v)}
              fullWidth
            />
          </div>
        ))}
      </div>
    </AppDialog>
  )
}
