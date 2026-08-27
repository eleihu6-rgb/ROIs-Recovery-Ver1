// gantt/src/components/scenario/scenario-notes-panel.tsx
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Eraser, MessageSquareText, Pencil, Reply, Trash2 } from 'lucide-react'
import { AppDialog, Button, Input } from '@rois/ui'
import { scenarioApi } from '@/services/scenario-api'
import { useAuthStore } from '@/stores/auth-store'
import { notify } from '@/utils/notify'
import type { ScenarioNoteMessage } from '@/types'

interface ScenarioNotesPanelProps {
  scenarioId: number
  /** Reports the current open (unanswered root) count so the tab badge stays in sync. */
  onOpenCountChange?: (count: number) => void
}

interface NoteNode {
  message: ScenarioNoteMessage
  children: NoteNode[]
}

/** Full English date + time — e.g. "Aug 06, 2026, 03:10:00 AM". */
export const formatDateTime = (iso: string): string => {
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
}

/** Unanswered root questions — a root with no replies still needs a reply. */
export const computeOpenCount = (messages: ScenarioNoteMessage[]): number => {
  const childIds = new Set<string>()
  for (const m of messages) if (m.replyTo) childIds.add(m.replyTo)
  return messages.filter((m) => !m.replyTo && !childIds.has(m.id)).length
}

const buildTree = (messages: ScenarioNoteMessage[]): NoteNode[] => {
  const nodes = new Map<string, NoteNode>()
  for (const message of messages) nodes.set(message.id, { message, children: [] })
  const roots: NoteNode[] = []
  for (const node of nodes.values()) {
    const parent = node.message.replyTo ? nodes.get(node.message.replyTo) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  roots.sort((a, b) => b.message.at.localeCompare(a.message.at))
  return roots
}

export const ScenarioNotesPanel = ({ scenarioId, onOpenCountChange }: ScenarioNotesPanelProps): ReactNode => {
  const [messages, setMessages] = useState<ScenarioNoteMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [author, setAuthor] = useState(() => useAuthStore.getState().user?.userCode ?? '')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ScenarioNoteMessage | null>(null)
  const [clearOpen, setClearOpen] = useState(false)

  const load = async (): Promise<void> => {
    setLoading(true)
    try {
      const response = await scenarioApi.getNotes(scenarioId)
      setMessages(response.items)
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'Failed to load notes')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [scenarioId])

  const canPost = draft.trim() !== '' && author.trim() !== ''

  const run = async (action: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true)
    try {
      await action()
      return true
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'Action failed')
      return false
    } finally {
      setBusy(false)
    }
  }

  const post = async (): Promise<void> => {
    if (!canPost) return
    const ok = await run(async () => {
      const response = await scenarioApi.addNote(scenarioId, { text: draft.trim(), author: author.trim(), replyTo })
      setMessages((prev) => [...prev, response.item])
    })
    if (ok) {
      setDraft('')
      setReplyTo(null)
      notify.success('Question posted')
    }
  }

  const confirmDelete = async (): Promise<void> => {
    if (!deleteTarget) return
    const ok = await run(async () => {
      await scenarioApi.deleteNote(scenarioId, deleteTarget.id)
      setMessages((prev) => prev.filter((m) => m.id !== deleteTarget.id))
    })
    if (ok) {
      setDeleteTarget(null)
      notify.success('Message deleted')
    }
  }

  const confirmClear = async (): Promise<void> => {
    const ok = await run(async () => {
      await scenarioApi.clearNotes(scenarioId)
      setMessages([])
    })
    if (ok) {
      setClearOpen(false)
      notify.success('All notes cleared')
    }
  }

  const roots = useMemo(() => buildTree(messages), [messages])
  const openCount = useMemo(() => computeOpenCount(messages), [messages])

  // Keep the parent's tab badge in sync (after load and after every mutation).
  useEffect(() => {
    if (!loading) onOpenCountChange?.(openCount)
  }, [openCount, loading, onOpenCountChange])

  if (loading) return <div className="text-xs text-muted-foreground">Loading notes…</div>

  return (
    <div className="space-y-3" data-testid="scenario-notes-panel">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <MessageSquareText className="h-4 w-4 shrink-0 text-muted-foreground" />
          Notes
        </div>
        {openCount > 0 && (
          <span className="rounded bg-primary/15 px-1.5 py-0.5 text-2xs font-semibold text-primary" data-testid="scenario-notes-open-count">
            {openCount} open
          </span>
        )}
        <div className="ml-auto">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-destructive"
            onClick={() => setClearOpen(true)}
            data-testid="scenario-notes-clear"
          >
            <Eraser className="h-3.5 w-3.5" />
            Clear messages
          </Button>
        </div>
      </div>

      <div className="rounded-md border border-border bg-background p-3">
        {replyTo && (
          <div className="mb-2 flex items-center justify-between gap-2 text-2xs text-muted-foreground">
            <span>
              Replying to{' '}
              <span className="font-semibold text-foreground">
                {messages.find((m) => m.id === replyTo)?.author ?? 'message'}
              </span>
            </span>
            <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setReplyTo(null)}>
              Cancel
            </button>
          </div>
        )}
        <textarea
          className="min-h-16 w-full resize-y rounded-sm border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground/50"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={replyTo ? 'Write a reply…' : 'Ask a question…'}
          data-testid="scenario-notes-composer-text"
        />
        <div className="mt-2 flex items-center justify-end gap-2">
          <Input
            value={author}
            onChange={(event) => setAuthor(event.target.value)}
            placeholder="Your name"
            className="h-7 w-40 text-xs"
            disabled={busy}
            data-testid="scenario-notes-composer-author"
          />
          <Button size="sm" className="h-7 px-3 text-xs" disabled={busy || !canPost} onClick={() => { void post() }} data-testid="scenario-notes-post">
            {busy ? 'Posting…' : 'Post'}
          </Button>
        </div>
      </div>

      {messages.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground" data-testid="scenario-notes-empty">
          No questions yet.
        </div>
      ) : (
        <div className="space-y-2">
          {roots.map((root) => (
            <NoteCard
              key={root.message.id}
              scenarioId={scenarioId}
              node={root}
              depth={0}
              onReply={setReplyTo}
              onDeleteRequest={setDeleteTarget}
              onPatched={(updated) => setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))}
            />
          ))}
        </div>
      )}

      <AppDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open && !busy) setDeleteTarget(null) }}
        title="Delete Message"
        icon={<Trash2 className="h-4 w-4" />}
        description="Delete this message and all its replies? This cannot be undone."
        dismissable={!busy}
        data-testid="scenario-notes-delete-dialog"
        footer={
          <>
            <Button variant="ghost" disabled={busy} onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" disabled={busy} onClick={() => { void confirmDelete() }}>
              {busy ? 'Deleting…' : 'Delete'}
            </Button>
          </>
        }
      />

      <AppDialog
        open={clearOpen}
        onOpenChange={(open) => { if (!open && !busy) setClearOpen(open) }}
        title="Clear All Notes"
        icon={<Eraser className="h-4 w-4" />}
        description="Delete every message in this scenario's Notes? This cannot be undone."
        dismissable={!busy}
        data-testid="scenario-notes-clear-dialog"
        footer={
          <>
            <Button variant="ghost" disabled={busy} onClick={() => setClearOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={busy} onClick={() => { void confirmClear() }}>
              {busy ? 'Clearing…' : 'Clear All'}
            </Button>
          </>
        }
      />
    </div>
  )
}

interface NoteCardProps {
  scenarioId: number
  node: NoteNode
  depth: number
  onReply: (id: string) => void
  onDeleteRequest: (message: ScenarioNoteMessage) => void
  onPatched: (message: ScenarioNoteMessage) => void
}

const NoteCard = ({ scenarioId, node, depth, onReply, onDeleteRequest, onPatched }: NoteCardProps): ReactNode => {
  const { message, children } = node
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(message.text)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (editing) setEditText(message.text)
  }, [editing, message.text])

  const saveEdit = async (): Promise<void> => {
    if (!editText.trim()) return
    setBusy(true)
    try {
      const response = await scenarioApi.patchNote(scenarioId, message.id, editText.trim())
      onPatched(response.item)
      setEditing(false)
      notify.success('Message updated')
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={depth > 0 ? 'ml-6 border-l border-border pl-3' : ''}
      data-testid={depth === 0 ? 'scenario-note-root' : 'scenario-note-reply'}
      data-message-id={message.id}
    >
      <div className="rounded-md border border-border bg-background px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={depth === 0 ? 'rounded bg-primary/15 px-1.5 py-0.5 text-2xs font-semibold text-primary' : 'rounded bg-muted px-1.5 py-0.5 text-2xs font-semibold text-muted-foreground'}>
            {depth === 0 ? 'Q' : 'A'}
          </span>
          <span className="text-2xs text-muted-foreground">
            {message.author.trim() || 'unknown'}
            {message.at ? ` · ${formatDateTime(message.at)}` : ''}
            {message.editedAt ? ' · edited' : ''}
          </span>
          {depth === 0 && children.length === 0 && (
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-2xs font-semibold text-amber-600">unanswered</span>
          )}
          <div className="ml-auto flex items-center gap-1">
            <button type="button" className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent/60 hover:text-foreground" title="Reply" onClick={() => onReply(message.id)} data-testid="scenario-note-reply-btn">
              <Reply className="h-3 w-3" />
            </button>
            <button type="button" className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent/60 hover:text-foreground" title="Edit" onClick={() => setEditing((v) => !v)} data-testid="scenario-note-edit-btn">
              <Pencil className="h-3 w-3" />
            </button>
            <button type="button" className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent/60 hover:text-destructive" title="Delete" onClick={() => onDeleteRequest(message)} data-testid="scenario-note-delete-btn">
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
        {editing ? (
          <div className="mt-2 space-y-2">
            <textarea
              className="min-h-14 w-full resize-y rounded-sm border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none"
              value={editText}
              onChange={(event) => setEditText(event.target.value)}
              data-testid="scenario-note-edit-text"
            />
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={busy} onClick={() => setEditing(false)}>Cancel</Button>
              <Button size="sm" className="h-7 px-2 text-xs" disabled={busy || !editText.trim()} onClick={() => { void saveEdit() }} data-testid="scenario-note-edit-save">
                {busy ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-1.5 break-words text-xs text-foreground">{message.text}</p>
        )}
      </div>
      {children.map((child) => (
        <NoteCard
          key={child.message.id}
          scenarioId={scenarioId}
          node={child}
          depth={depth + 1}
          onReply={onReply}
          onDeleteRequest={onDeleteRequest}
          onPatched={onPatched}
        />
      ))}
    </div>
  )
}
