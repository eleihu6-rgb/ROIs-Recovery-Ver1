import { HelpStep, HelpNote, HelpTip, HelpWarning, HelpControlsRef } from '../../help-article'

export default function LiveSaveUndo() {
  return (
    <>
      <HelpStep n={1}>
        The middle of the toolbar is the <strong>draft toolbar</strong>: <strong>Delete</strong>,{' '}
        <strong>Undo</strong>, <strong>Redo</strong>, and <strong>Save</strong>. To{' '}
        <strong>save all pending changes</strong>, press <kbd>Ctrl+S</kbd>, or click the{' '}
        <strong>Save</strong> button. While a save is running the Save button shows a spinner and
        its tooltip reads <em>Saving...</em>; otherwise it shows a badge with the number of pending
        changes, which clears once everything has been saved.
      </HelpStep>

      <HelpNote>
        Save, Undo, and Redo (and their <kbd>Ctrl+S</kbd> / <kbd>Ctrl+Z</kbd> /{' '}
        <kbd>Ctrl+Y</kbd> shortcuts) are temporarily disabled while a legality check is in
        flight — the buttons grey out and the keystrokes are ignored. The same lock applies to
        drag-drop in a Scenario. The check finishes quickly on small windows, so the lock
        usually lifts in well under a second.
      </HelpNote>

      <HelpNote>
        If your pending edits would introduce new rule violations, saving opens a{' '}
        <strong>confirmation dialog</strong> first: it lists the violations with{' '}
        <strong>Error</strong> / <strong>Warning</strong> / <strong>Info</strong> badges. Hard-limit
        errors allow only <strong>Cancel</strong>; overridable warnings also offer{' '}
        <strong>Continue Anyway</strong>. Pairing-level <strong>Age Restriction (8030)</strong>{' '}
        findings are grouped into a single card — the shared flight condition is stated once and every
        affected <strong>Crew</strong> id is listed with its age — instead of repeating the same
        message once per crew member.
      </HelpNote>

      <HelpNote>
        The <strong>Delete</strong> button at the front of the same row removes the currently
        selected blocks as a draft edit (the same as pressing <kbd>Del</kbd>). It is enabled
        whenever something on the canvas is selected.
      </HelpNote>

      <HelpStep n={2}>
        To <strong>undo</strong> the last edit, press <kbd>Ctrl+Z</kbd>, or click the{' '}
        <strong>Undo</strong> button. Each press undoes one more edit.
      </HelpStep>

      <HelpStep n={3}>
        To <strong>redo</strong> an undone edit, press <kbd>Ctrl+Y</kbd> (or <kbd>Ctrl+Shift+Z</kbd>),
        or click the <strong>Redo</strong> button.
      </HelpStep>

      <HelpNote>
        On macOS, use <kbd>⌘</kbd> instead of <kbd>Ctrl</kbd> for every shortcut — <kbd>⌘S</kbd>,{' '}
        <kbd>⌘Z</kbd>, <kbd>⌘Y</kbd>.
      </HelpNote>

      <HelpTip>
        You can undo and redo multiple times before saving. Save when you are satisfied with the result.
      </HelpTip>

      <HelpWarning>
        If you sign out or refresh the page without saving, your unsaved edits will be lost.
        Always save before leaving the Live screen.
      </HelpWarning>

      <HelpControlsRef items={[
        { name: 'Delete', description: 'Removes the selected blocks as a draft edit. Enabled when anything is selected (same as the Del key).' },
        { name: 'Save (Ctrl+S)', description: 'Commits all draft edits to the live schedule. Shows a spinner and a Saving... tooltip while saving, then a badge with the pending-change count.' },
        { name: 'Undo (Ctrl+Z)', description: 'Reverses the most recent edit. Can be pressed repeatedly.' },
        { name: 'Redo (Ctrl+Y)', description: 'Re-applies an edit you just undid. Ctrl+Shift+Z also works.' },
        { name: 'DraftToolbar', description: 'The row of Delete / Undo / Redo / Save buttons in the middle of the toolbar. The Save button carries the pending-change count.' },
      ]} />
    </>
  )
}
