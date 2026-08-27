import { HelpStep, HelpNote, HelpControlsRef } from '../../help-article'

export default function LegalityEditParams() {
  return (
    <>
      <HelpStep n={1}>
        On the <strong>Legality</strong> tab, click a rule to expand its parameter table in place — or
        open the full-screen view with the <strong>Maximize</strong> icon. If you are signed in as an{' '}
        <strong>admin</strong> the table is editable; everyone else sees the same table read-only.
      </HelpStep>

      <HelpNote>
        Every parameter table has a leftmost <strong>Row</strong> column — a 1-based row number
        (1, 2, 3 …) that is UI-only and not saved with the rule. Recheck violation messages begin
        with the matching row number (for example <em>Row 2:</em>), so you can trace an Alert
        Center message back to the parameter row that produced it.
      </HelpNote>

      <HelpStep n={2}>
        To change a row, click the <strong>Edit row</strong> pencil in its <strong>Actions</strong>{' '}
        column. Narrow rules edit <strong>inline</strong> (the row turns amber and each cell validates
        its own format — number, date, or applicability list); very wide rules open an{' '}
        <strong>Edit Row</strong> dialog instead. Click <strong>✓</strong> to keep the change (enabled
        only when every cell is valid) or <strong>✕</strong> to cancel.
      </HelpStep>

      <HelpNote>
        Date cells accept free-text input or a calendar picker — click the small calendar icon
        next to any date cell (Eff Date, Exp Date, etc.) and pick a day from the popover. The
        picker only opens for cells whose format is <em>date</em>; numeric cells keep the plain
        input.
      </HelpNote>

      <HelpStep n={3}>
        The Actions column also offers <strong>Copy row</strong> (duplicate it), <strong>Delete row</strong>{' '}
        (trash → confirm <em>Delete?</em> → <strong>Yes, delete</strong>), and <strong>Move up</strong> /{' '}
        <strong>Move down</strong> to reorder. Use <strong>+ Add Row</strong> below the table to append a
        blank row.
      </HelpStep>

      <HelpStep n={4}>
        The <strong>Changes</strong> panel on the right logs every action — <em>EDIT</em>, <em>ADD</em>,{' '}
        <em>DEL</em>, <em>COPY</em>, <em>MOVE</em> — newest first. Click <strong>⟲ Undo</strong> to
        revert the last change. Nothing is written to the rule set until you save.
      </HelpStep>

      <HelpStep n={5}>
        Click <strong>Save All</strong>. The button shows <em>Saving…</em> and then a{' '}
        <em>Parameters saved</em> confirmation. Because the rule’s values changed, the affected rosters
        are flagged for a legality recheck (see <strong>Re-checking legality</strong> in the Overview).
      </HelpStep>

      <HelpNote>
        Editing is <strong>admin-only</strong>. Without admin rights you can still expand any rule and
        read its parameters, but the Actions column, Add Row, and Save All are not shown.
      </HelpNote>

      <HelpControlsRef items={[
        { name: 'Edit row (pencil)', description: 'Edit the row inline (narrow rules) or in an Edit Row dialog (very wide rules). ✓ saves the row when valid; ✕ cancels.' },
        { name: 'Copy row', description: 'Duplicates the row immediately below it.' },
        { name: 'Delete row (trash)', description: 'Asks "Delete?" — click "Yes, delete" to confirm, or Cancel.' },
        { name: 'Move up / Move down', description: 'Reorders the row within its table.' },
        { name: '+ Add Row', description: 'Appends a new blank row to the table.' },
        { name: 'Changes panel', description: 'Logs each edit/add/delete/copy/move with a coloured badge, newest first.' },
        { name: '⟲ Undo', description: 'Reverts the most recent change. Disabled when there is nothing to undo or a save is in flight.' },
        { name: 'Save All', description: 'Writes every pending change to the rule set, then flags affected rosters for a legality recheck.' },
      ]} />
    </>
  )
}
