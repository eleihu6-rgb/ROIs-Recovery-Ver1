import { useEffect, useMemo, useState } from 'react'
import { Bot, Send, X, MessageSquare } from 'lucide-react'
import { useAiChat } from './use-ai-chat'
import { useAiHints } from './use-ai-hints'

export const AiChatPanel = () => {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  // Reseed which client-specific examples surface each time the panel is opened, so
  // users discover the full range (base/rank/fleet/crew id) over repeated visits.
  const [rotateSeed, setRotateSeed] = useState(0)
  const { thread, busy, send } = useAiChat()
  const hints = useAiHints(open)

  useEffect(() => {
    if (open) setRotateSeed((s) => s + 1)
  }, [open])

  // R'Bot example prompts must reference the airline's ACTUAL setup (real base/rank/
  // fleet/crew id from /api/ai/hints) — a hardcoded "Bangkok" that isn't a configured
  // base could never match a filter. Show a rotating subset of 3 so the hint stays
  // compact, always anchored by the universally-useful "clear all filters".
  const tips = useMemo<string[]>(() => {
    const client = [
      hints.base ? `"show only ${hints.base} crew"` : null,
      hints.rank ? `"show ${hints.rank} crew"` : null,
      hints.fleet ? `"show ${hints.fleet} fleet crew"` : null,
      hints.crewId ? `"find crew ${hints.crewId}"` : null,
    ].filter((t): t is string => t !== null)

    const rotating =
      client.length >= 2
        ? Array.from({ length: 2 }, (_, i) => client[(rotateSeed + i) % client.length])
        : [...client, '"sort roster by crew id descending"']

    return [...rotating, '"clear all filters"'].slice(0, 3)
  }, [hints, rotateSeed])

  const submit = () => {
    // Only clear the box once we've accepted a non-empty, non-busy send —
    // otherwise a rejected/ignored submit would wipe the user's unsent text.
    if (!input.trim() || busy) return
    void send(input)
    setInput('')
  }

  if (!open) {
    return (
      <button
        data-testid="ai-chat-toggle"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 left-4 z-50 inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
        aria-label="Open R'Bot assistant"
      >
        <MessageSquare className="h-4 w-4" />
      </button>
    )
  }

  return (
    <div
      data-testid="ai-chat-panel"
      className="fixed bottom-4 left-4 z-50 flex h-[28rem] w-80 flex-col rounded-lg border border-border bg-background shadow-xl"
    >
      <div className="flex h-10 shrink-0 items-center gap-2 rounded-t-lg bg-primary px-3 text-primary-foreground">
        <Bot className="h-4 w-4 shrink-0" />
        <span className="text-sm font-semibold">R&apos;Bot</span>
        <button
          onClick={() => setOpen(false)}
          className="ml-auto inline-flex h-6 w-6 items-center justify-center"
          aria-label="Close"
          data-testid="ai-chat-close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3" data-testid="ai-chat-thread">
        {thread.length === 0 && (
          <p className="text-xs text-muted-foreground" data-testid="ai-chat-tips">
            Try: {tips.join(', ')}.
          </p>
        )}
        {thread.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'text-right' : 'text-left'}>
            <div
              className={[
                'inline-block max-w-[85%] rounded-md px-2 py-1 text-xs',
                m.role === 'user' ? 'bg-primary/10 text-foreground' : 'bg-muted text-foreground',
              ].join(' ')}
            >
              {m.content}
            </div>
            {m.applied?.map((chip, j) => (
              <div key={j} className="mt-1 text-2xs text-muted-foreground" data-testid="ai-chat-applied">
                ✓ {chip}
              </div>
            ))}
          </div>
        ))}
        {busy && (
          <div className="text-2xs text-muted-foreground" data-testid="ai-chat-busy">
            Thinking…
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5 border-t border-border p-2">
        <input
          data-testid="ai-chat-input"
          className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs outline-none"
          placeholder="Ask R'Bot…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
        />
        <button
          data-testid="ai-chat-send"
          onClick={submit}
          disabled={busy}
          className="inline-flex h-7 w-7 items-center justify-center rounded bg-primary p-0 text-primary-foreground disabled:opacity-50"
          aria-label="Send"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
