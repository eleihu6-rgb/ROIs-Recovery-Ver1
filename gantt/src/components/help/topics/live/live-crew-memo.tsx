import { HelpStep, HelpNote, HelpControlsRef } from '../../help-article'

export default function LiveCrewMemo() {
  return (
    <>
      <HelpStep n={1}>
        <strong>Right-click</strong> a duty on a crew member&apos;s row in the <strong>Roster</strong>{' '}
        pane. The context menu shows <strong>Add Memo</strong> (sticky-note icon) when no memo yet
        covers that date, or <strong>Edit Memo</strong> when one already does.
      </HelpStep>

      <HelpStep n={2}>
        The dialog opens titled <strong>Add Crew Memo</strong> (or <strong>Edit Crew Memo</strong> when
        editing), with the crew you are annotating shown underneath as <em>Crew &lt;id&gt;</em>. Fill in
        an optional <strong>Title</strong> and the <strong>Memo</strong> text. The memo text is required.
      </HelpStep>

      <HelpStep n={3}>
        Click <strong>Add</strong> (or <strong>Save</strong> when editing). A small yellow{' '}
        <strong>sticky-note icon</strong> then appears on that crew&apos;s row at the memo&apos;s dates,
        so the note is visible at a glance on the canvas.
      </HelpStep>

      <HelpStep n={4}>
        To remove a memo, open it with <strong>Edit Memo</strong> and click <strong>Delete</strong>{' '}
        (trash icon, on the left of the dialog footer).
      </HelpStep>

      <HelpNote>
        Use crew memos for operational notes that must stay attached to a crew member&apos;s roster
        over a specific date range. The icon appears only after memo data loads, so it does not
        block the first canvas paint.
      </HelpNote>

      <HelpControlsRef items={[
        { name: 'Add Memo / Edit Memo', description: 'Roster row right-click menu (sticky-note icon). Add when no memo covers the date; Edit when one already does.' },
        { name: 'Title', description: 'Optional short label for the memo, e.g. "Planner note".' },
        { name: 'Memo', description: 'The note text (required).' },
        { name: 'Add / Save', description: 'Stores the memo and draws a sticky-note icon on the crew row.' },
        { name: 'Delete', description: 'Removes the memo (shown only when editing an existing memo).' },
      ]} />
    </>
  )
}
