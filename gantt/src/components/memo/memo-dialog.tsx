import { useState, useEffect } from 'react'
import { AppDialog, Button, Input } from '@rois/ui'
import { StickyNote, Trash2 } from 'lucide-react'
import { useUiStore } from '@/stores/ui-store'
import { useCrewMemoStore } from '@/stores/crew-memo-store'
import { crewMemoApi } from '@/services/crew-memo-api'
import { notify } from '@/utils/notify'

/**
 * Crew Memo dialog — add / edit / delete a range-based note for a crew.
 * Opened from the roster context menu with a prefill (crewId + date range, and,
 * for an existing memo, its id + text). Saves via the live-server CRUD API.
 */
export const MemoDialog = () => {
  const open = useUiStore((s) => s.memoDialogOpen)
  const prefill = useUiStore((s) => s.memoDialogPrefill)
  const close = useUiStore((s) => s.closeMemoDialog)
  const put = useCrewMemoStore((s) => s.put)
  const drop = useCrewMemoStore((s) => s.drop)

  const [memo, setMemo] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open && prefill) {
      setMemo(prefill.memo ?? '')
      setName(prefill.name ?? '')
    }
  }, [open, prefill])

  if (!prefill) return null
  const isEdit = prefill.id != null

  const handleSave = async () => {
    if (!memo.trim()) { notify.info('Memo text is required'); return }
    setBusy(true)
    try {
      const saved = await crewMemoApi.save({
        id: prefill.id,
        crewId: prefill.crewId,
        strDtLoc: prefill.strDtLoc,
        endDtLoc: prefill.endDtLoc,
        memo: memo.trim(),
        name: name.trim() || undefined,
        type: 1,
      })
      put(saved)
      notify.success(isEdit ? 'Memo updated' : 'Memo added')
      close()
    } catch (e) {
      notify.error(`Save failed: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    if (prefill.id == null) return
    setBusy(true)
    try {
      await crewMemoApi.remove(prefill.id)
      drop(prefill.id)
      notify.success('Memo deleted')
      close()
    } catch (e) {
      notify.error(`Delete failed: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={(o) => { if (!o) close() }}
      data-testid="memo-dialog"
      className="sm:max-w-[460px]"
      icon={<StickyNote className="h-4 w-4" />}
      title={isEdit ? 'Edit Crew Memo' : 'Add Crew Memo'}
      description={`Crew ${prefill.crewId}`}
      dismissable={!busy}
      footer={
        <>
          {isEdit && (
            <Button variant="ghost" className="mr-auto text-destructive" disabled={busy}
              onClick={handleDelete} data-testid="memo-delete">
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
            </Button>
          )}
          <Button variant="ghost" disabled={busy} onClick={close}>Cancel</Button>
          <Button disabled={busy} onClick={handleSave} data-testid="memo-save">
            {isEdit ? 'Save' : 'Add'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 py-1">
        <label className="flex flex-col gap-1 text-2xs font-medium text-muted-foreground">
          Title
          <Input value={name} onChange={(e) => setName(e.target.value)}
            placeholder="e.g. De-assign pairing" data-testid="memo-title-input" />
        </label>
        <label className="flex flex-col gap-1 text-2xs font-medium text-muted-foreground">
          Memo
          <textarea
            className="min-h-[80px] w-full rounded-sm border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground/50"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="e.g. V4110 (10827) — this duty will be de-assigned"
            data-testid="memo-text-input"
          />
        </label>
      </div>
    </AppDialog>
  )
}
