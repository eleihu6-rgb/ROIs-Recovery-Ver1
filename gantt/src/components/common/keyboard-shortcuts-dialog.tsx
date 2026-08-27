import { Button } from '@rois/ui'
import { X, Keyboard } from 'lucide-react'

interface ShortcutGroup {
  title: string
  shortcuts: { keys: string[]; label: string }[]
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'File',
    shortcuts: [
      { keys: ['Ctrl', 'S'], label: 'Save all pending changes' },
    ],
  },
  {
    title: 'Edit',
    shortcuts: [
      { keys: ['Ctrl', 'Z'], label: 'Undo last operation' },
      { keys: ['Ctrl', 'Y'], label: 'Redo' },
      { keys: ['Del'], label: 'Delete selected item' },
      { keys: ['Esc'], label: 'Clear all selections / Close menu' },
    ],
  },
  {
    title: 'Selection',
    shortcuts: [
      { keys: ['Click'], label: 'Select single task' },
      { keys: ['Ctrl', 'Click'], label: 'Toggle multi-select' },
    ],
  },
  {
    title: 'Pairing',
    shortcuts: [
      { keys: ['Ctrl', 'Q'], label: 'Create Pairing from selected flights' },
    ],
  },
  {
    title: 'View',
    shortcuts: [
      { keys: ['Ctrl', '+'], label: 'Zoom in' },
      { keys: ['Ctrl', '−'], label: 'Zoom out' },
    ],
  },
]

interface Props {
  open: boolean
  onClose: () => void
}

/**
 * Keyboard shortcuts reference panel — ui-ux-pro-max.
 *
 * Design references: Jeppesen / VS Code command palette style.
 * - Two-column layout per shortcut (label left, keys right)
 * - Physical key-cap styling on <kbd> tags
 * - Grouped with subtle section headers
 * - Semantic theme colors throughout
 */
export const KeyboardShortcutsDialog = ({ open, onClose }: Props) => {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 pt-[15vh]"
      onClick={onClose}
    >
      <div
        data-testid="keyboard-shortcuts-dialog"
        className="w-[460px] overflow-hidden rounded-xl border border-border/50 bg-popover shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 border-b border-border/40 bg-muted/30 px-4 py-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
            <Keyboard className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-popover-foreground">Keyboard Shortcuts</h3>
            <p className="text-2xs text-muted-foreground">Quick reference for all available shortcuts</p>
          </div>
          <button
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-all duration-100 hover:bg-accent/60 hover:text-foreground active:scale-95"
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Shortcut groups — compact, no scroll */}
        <div>
          {SHORTCUT_GROUPS.map((group, gi) => (
            <div key={group.title} className={gi > 0 ? 'border-t border-border/30' : ''}>
              {/* Section header */}
              <div className="px-4 pt-2 pb-0.5">
                <span className="text-2xs font-semibold uppercase tracking-widest text-primary/70">
                  {group.title}
                </span>
              </div>

              {/* Shortcuts */}
              <div className="px-4 pb-1.5">
                {group.shortcuts.map((s) => (
                  <div
                    key={s.label}
                    className="flex items-center justify-between rounded-md px-2 py-1 transition-colors hover:bg-accent/30"
                  >
                    <span className="text-xs text-popover-foreground">{s.label}</span>
                    <div className="flex items-center gap-1 pl-4">
                      {s.keys.map((key, i) => (
                        <span key={i} className="flex items-center gap-1">
                          {i > 0 && <span className="text-3xs text-muted-foreground/30">+</span>}
                          <kbd className={[
                            'inline-flex items-center justify-center rounded-sm font-mono',
                            'border border-border/70 bg-card text-muted-foreground',
                            'shadow-[0_1px_0_1px_hsl(var(--border)/0.5),0_2px_3px_rgba(0,0,0,0.06)]',
                            key.length === 1
                              ? 'h-[22px] min-w-[22px] px-1 text-2xs font-semibold'
                              : 'h-[22px] px-1.5 text-3xs font-medium',
                          ].join(' ')}>
                            {key}
                          </kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-border/30 bg-muted/20 px-4 py-2">
          <p className="text-center text-2xs text-muted-foreground/50">
            On macOS, use <kbd className="mx-0.5 rounded-sm border border-border/50 bg-card px-1 text-3xs shadow-[0_1px_0_hsl(var(--border)/0.3)]">⌘</kbd> instead of <kbd className="mx-0.5 rounded-sm border border-border/50 bg-card px-1 text-3xs shadow-[0_1px_0_hsl(var(--border)/0.3)]">Ctrl</kbd>
          </p>
        </div>
      </div>
    </div>
  )
}
