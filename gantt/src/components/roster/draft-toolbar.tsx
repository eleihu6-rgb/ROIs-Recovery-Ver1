import { Tooltip, TooltipContent, TooltipTrigger } from '@rois/ui'
import { Save, Undo2, Redo2, Trash2, Loader2 } from 'lucide-react'
import { useDraftStore } from '@/stores/draft-store'
import { useRuleCheckStore } from '@/stores/rule-check-store'
import { useGanttViewStore } from '@/stores/gantt-view-store'
import { useRuleCheckSession } from '@/hooks/use-rule-check-session'
import { PermissionGate } from '@/components/common/permission-gate'
import { saveDraft } from '@/utils/save-draft'
import { deleteSelectedGanttItems } from '@/utils/delete-gantt-selection'

  /**
   * Delete + Undo + Redo + Save toolbar.
   *
   * Design: ui-ux-pro-max — uniform h-7 w-7 icon buttons
   */
  export const DraftToolbar = () => {
    const commit = useDraftStore((s) => s.commit)
    const undoOp = useDraftStore((s) => s.undoOp)
    const redoOp = useDraftStore((s) => s.redoOp)
    const opCount = useDraftStore((s) => s.opCount())
    const operations = useDraftStore((s) => s.operations)
    const redoStack = useDraftStore((s) => s.redoStack)
    const saving = useDraftStore((s) => s.saving)  // Read saving state from draft-store
    const checking = useRuleCheckStore((s) => s.checking)
    const confirmDialogOpen = useRuleCheckStore((s) => s.confirmDialog.open)
    const { checkSession } = useRuleCheckSession()
    const selectedTaskIds = useGanttViewStore((s) => s.selectedTaskIds)

    const handleDelete = async () => {
      if (selectedTaskIds.size === 0) return
      await deleteSelectedGanttItems()
    }

  const handleSave = async () => {
    if (opCount === 0 || actionsBlocked) return
    // saving state is managed by draft-store.commit()
    await saveDraft()
  }

  const canDelete = selectedTaskIds.size > 0
  const canUndo = operations.length > 0
  const canRedo = redoStack.length > 0
  const actionsBlocked = checking || saving || confirmDialogOpen
  const canSave = opCount > 0 && !actionsBlocked

  const btnBase = 'inline-flex h-7 w-7 items-center justify-center rounded-md transition-all duration-100'
  const btnActive = 'text-muted-foreground hover:bg-accent/60 hover:text-foreground active:scale-95'
  const btnDisabled = 'pointer-events-none text-muted-foreground/30'

  return (
    <div className="flex items-center gap-0.5">
      {/* Delete */}
      <PermissionGate menuCode="LIVE_ROSTER" ctlCode="LIVE_DELETE">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className={`${btnBase} ${canDelete ? 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive active:scale-95' : btnDisabled}`}
            onClick={handleDelete}
            data-testid="draft-delete-btn"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="flex items-center gap-1.5 text-xs">
          Delete selected <kbd className="rounded border border-border/60 bg-muted/50 px-1 text-3xs">Del</kbd>
        </TooltipContent>
      </Tooltip>
      </PermissionGate>

      {/* Undo */}
      <PermissionGate menuCode="LIVE_ROSTER" ctlCode="LIVE_UNDO">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className={`${btnBase} ${canUndo && !actionsBlocked ? btnActive : btnDisabled}`}
            disabled={!canUndo || actionsBlocked}
            onClick={() => {
              if (actionsBlocked) return
              const op = undoOp()
              if (op) checkSession(null, null, 'undo')
            }}
            data-testid="draft-undo-btn"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="flex items-center gap-1.5 text-xs">
          Undo <kbd className="rounded border border-border/60 bg-muted/50 px-1 text-3xs">Ctrl+Z</kbd>
        </TooltipContent>
      </Tooltip>
      </PermissionGate>

      {/* Redo */}
      <PermissionGate menuCode="LIVE_ROSTER" ctlCode="LIVE_REDO">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className={`${btnBase} ${canRedo && !actionsBlocked ? btnActive : btnDisabled}`}
            disabled={!canRedo || actionsBlocked}
            onClick={() => {
              if (actionsBlocked) return
              const op = redoOp()
              if (op) checkSession(null, null, 'redo')
            }}
            data-testid="draft-redo-btn"
          >
            <Redo2 className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="flex items-center gap-1.5 text-xs">
          Redo <kbd className="rounded border border-border/60 bg-muted/50 px-1 text-3xs">Ctrl+Y</kbd>
        </TooltipContent>
      </Tooltip>
      </PermissionGate>

      {/* Save */}
      <PermissionGate menuCode="LIVE_ROSTER" ctlCode="LIVE_SAVE">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className={`relative ${btnBase} ${canSave ? btnActive : saving ? 'text-primary' : btnDisabled}`}
            disabled={!canSave}
            onClick={handleSave}
            data-testid="draft-save-btn"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {opCount > 0 && !saving && (
              <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-3xs font-bold leading-none text-primary-foreground">
                {opCount}
              </span>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="flex items-center gap-1.5 text-xs">
          {saving ? 'Saving...' : opCount > 0 ? `Save ${opCount} change(s)` : 'Save'}
          <kbd className="rounded border border-border/60 bg-muted/50 px-1 text-3xs">Ctrl+S</kbd>
        </TooltipContent>
      </Tooltip>
      </PermissionGate>
    </div>
  )
}
