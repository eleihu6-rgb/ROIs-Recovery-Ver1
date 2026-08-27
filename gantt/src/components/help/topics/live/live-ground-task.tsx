import { HelpStep, HelpNote, HelpTip, HelpControlsRef } from '../../help-article'

export default function LiveGroundTask() {
  return (
    <>
      <HelpStep n={1}>
        Click the <strong>Create Ground Task button</strong> (the square-plus icon ⊞) on the right
        side of the toolbar. You can also right-click an empty spot on a crew member&apos;s row in the
        Roster pane and choose <strong>Create Ground Task</strong> — that pre-fills the crew member
        and the day you clicked.
      </HelpStep>

      <HelpStep n={2}>
        In <strong>Crew IDs *</strong>, type a crew ID and press <kbd>Enter</kbd> (comma or space also
        adds it). Add as many as you like — each appears as a removable chip, and the task is created
        for every listed crew member. (When editing an existing task the label is{' '}
        <strong>Crew ID</strong> and the crew member is locked.)
      </HelpStep>

      <HelpStep n={3}>
        Pick an <strong>Assignment *</strong> from the dropdown (each option is shown as{' '}
        <em>code — description</em>, e.g. training, standby, or admin duties). The read-only{' '}
        <strong>Group</strong> field then <em>auto-fills</em> from the assignment you chose — you do
        not edit it directly.
      </HelpStep>

      <HelpStep n={4}>
        Enter <strong>Dep Arp *</strong> and <strong>Arv Arp *</strong> for the ground task&apos;s start
        and end location. The departure airport is also saved as the task&apos;s compatibility base
        for existing roster processing.
      </HelpStep>

      <HelpStep n={5}>
        Set the <strong>Credit</strong> value in minutes — the preview beside it shows the equivalent
        duration, for example <em>2h 30m</em>. The field is editable when you create a task and when
        editing a ground task sourced from <em>CR</em> or <em>MA</em>; for other sources it is
        read-only and shows the existing value.
      </HelpStep>

      <HelpStep n={6}>
        Set the <strong>Start *</strong> and <strong>End *</strong> date and time. Times are entered in
        the airport timezone currently shown on the toolbar (its code appears next to each field).
        The dialog shows the resulting <em>Duration</em>, and warns if End is not after Start.
        Add an optional <strong>Remark</strong> if you need a note.
      </HelpStep>

      <HelpStep n={7}>
        Click <strong>Create</strong>. When several crew are selected, the footer shows how many
        roster entries will be created, for example <em>Will create 3 roster entries</em>. The ground
        task appears as a block on each crew member&apos;s row in the canvas. It is held as a draft —
        press <kbd>Ctrl+S</kbd> to save it permanently.
      </HelpStep>

      <HelpNote>
        Ground tasks are not linked to a pairing. They appear in the Roster pane only and do not
        affect flight assignments. To change one later, double-click it (or right-click →{' '}
        <strong>Edit Ground Task</strong>); the editor also has a <em>Delete This Task</em> action
        in its Danger Zone.
      </HelpNote>

      <HelpTip>
        Flight-style assignment types (the ones whose group is <strong>FLT</strong>) are intentionally
        excluded from this dialog — ground tasks cover non-flying duties only. Deadhead ({' '}
        <strong>DHD</strong>) assignments are <em>not</em> excluded and can still be selected.
      </HelpTip>

      <HelpControlsRef items={[
        { name: 'Create Ground Task (⊞)', description: 'Opens the ground task creation dialog.' },
        { name: 'Crew IDs *', description: 'One or more crew members who receive this assignment. Type an ID and press Enter (comma/space also adds); each shows as a removable chip.' },
        { name: 'Assignment *', description: 'The duty type, listed as code — description (e.g. training, standby, admin). Flight (FLT-group) types are excluded; DHD is available.' },
        { name: 'Group', description: 'Read-only. Auto-fills from the chosen assignment; not edited directly.' },
        { name: 'Dep Arp * / Arv Arp *', description: 'Start and end airport/location codes for the ground task. Dep Arp is also saved as the compatibility base.' },
        { name: 'Credit', description: 'Duration in minutes; the preview shows the equivalent, e.g. 2h 30m. Editable when creating, and when editing CR/MA-sourced tasks; otherwise read-only.' },
        { name: 'Start * / End *', description: 'Date and time the duty begins and ends, in the toolbar timezone (its code shows beside each field). The dialog displays the computed duration.' },
        { name: 'Remark', description: 'Optional free-text note saved with the task.' },
        { name: 'Create button', description: 'Adds the ground task(s) to the canvas as a draft — one roster entry per listed crew member. The footer shows Will create N roster entries.' },
      ]} />
    </>
  )
}
