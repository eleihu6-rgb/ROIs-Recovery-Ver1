import { HelpNote, HelpScreenshot } from '../../help-article'

// Mirrors the in-app Keyboard Shortcuts dialog (keyboard-shortcuts-dialog.tsx) exactly,
// so this reference and the dialog never drift. Alternate keys that the dialog omits but
// the app supports are listed in the note below, not baked into a row.
const SHORTCUTS = [
  { group: 'File',      key: 'Ctrl+S',       action: 'Save all pending changes' },
  { group: 'Edit',      key: 'Ctrl+Z',       action: 'Undo last operation' },
  { group: 'Edit',      key: 'Ctrl+Y',       action: 'Redo' },
  { group: 'Edit',      key: 'Del',          action: 'Delete selected item' },
  { group: 'Edit',      key: 'Esc',          action: 'Clear all selections / Close menu' },
  { group: 'Selection', key: 'Click',        action: 'Select single task' },
  { group: 'Selection', key: 'Ctrl+Click',   action: 'Toggle multi-select' },
  { group: 'Pairing',   key: 'Ctrl+Q',       action: 'Create Pairing from selected flights' },
  { group: 'View',      key: 'Ctrl++',       action: 'Zoom in' },
  { group: 'View',      key: 'Ctrl+−',       action: 'Zoom out' },
]

const groups = [...new Set(SHORTCUTS.map((s) => s.group))]

export default function LiveKeyboard() {
  return (
    <>
      <HelpScreenshot src="/help/screenshots/live-keyboard-shortcuts.png" alt="Keyboard shortcuts dialog showing all available shortcut groups" caption="The Keyboard Shortcuts dialog — open it from the toolbar or via the Help topic." />
      {groups.map((group) => (
        <div key={group} className="mb-5">
          <h3 className="text-2xs font-bold text-muted-foreground uppercase tracking-wider mb-2">{group}</h3>
          <table className="w-full text-xs">
            <tbody>
              {SHORTCUTS.filter((s) => s.group === group).map((s) => (
                <tr key={s.key} className="border-b border-border/50 last:border-0">
                  <td className="py-1.5 pr-4 w-1/3 align-top">
                    <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-2xs font-mono">
                      {s.key}
                    </kbd>
                  </td>
                  <td className="py-1.5 text-muted-foreground align-top">{s.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <HelpNote>
        On macOS, use <kbd>⌘</kbd> instead of <kbd>Ctrl</kbd> for all shortcuts.{' '}
        <strong>Redo</strong> also responds to <kbd>Ctrl+Shift+Z</kbd>, and{' '}
        <strong>Delete</strong> also responds to <kbd>Backspace</kbd>.
      </HelpNote>
    </>
  )
}
