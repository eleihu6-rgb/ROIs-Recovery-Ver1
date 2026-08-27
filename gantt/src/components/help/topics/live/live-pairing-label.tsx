import { HelpStep, HelpNote, HelpScreenshot, HelpControlsRef } from '../../help-article'

export default function LivePairingLabel() {
  return (
    <>
      <HelpNote>
        A <strong>pairing label</strong> is a human-readable identifier assigned to a pairing by your
        airline&apos;s scheduling system (stored in the database as <code>pairing.label</code>). It is
        distinct from the internal numeric pairing ID - for example, a pairing might have label{' '}
        <code>P1234</code> and internal ID <code>5678</code>.
      </HelpNote>

      <HelpStep n={1}>
        <strong>Pairing pane.</strong> Every row in the Pairing pane uses the label as the pairing&apos;s
        primary identifier. The label appears as the first column (&quot;Pairing&quot;) in the pane table and
        is rendered on each puck in the canvas view. If no label is set, the system falls back to{' '}
        <code>P-{'{id}'}</code>.
      </HelpStep>
      <HelpScreenshot
        src="/help/screenshots/pairing-label-pane.png"
        alt="Pairing pane showing V4538, T4527, V4164 labels in the Pairing column"
        caption="The first column in the Pairing pane shows the pairing label for every loaded pairing."
      />

      <HelpStep n={2}>
        <strong>Pairing Info dialog.</strong> Click any pairing row to open the Pairing Info dialog.
        When a label is set, the dialog title begins with the label followed by the internal numeric
        ID - for example <em>V4538 #10708</em> - so you can identify the pairing at a glance
        without reading the raw number.
      </HelpStep>
      <HelpScreenshot
        src="/help/screenshots/pairing-label-info-dialog.png"
        alt="Pairing Info dialog title showing V4538 #10708 with label before the hash ID"
        caption="The dialog title leads with the label. The internal ID follows after the #."
      />

      <HelpStep n={3}>
        <strong>Status bar (ground tasks).</strong> When you hover over a ground-task assignment in
        the Roster canvas, the status bar at the bottom of the screen shows the assignment&apos;s label as
        part of the hover line (between the assignment code and the time range). Pairing assignments
        use the pairing&apos;s own identifier in the status bar instead.
      </HelpStep>

      <HelpStep n={4}>
        <strong>Finding pairings by label.</strong> Open the Filter dialog, go to the{' '}
        <strong>Pairing</strong> tab, and type a substring into the <strong>Label</strong> field.
        When you apply, the Pairing pane shows only pairings whose label contains that text.
        Clear the field and re-apply to show pairings from the rest of the active filter scope again.
      </HelpStep>
      <HelpScreenshot
        src="/help/screenshots/live-filter-dialog-pairing.png"
        alt="Filter dialog Pairing tab showing the Label field for substring search"
        caption="Pairing tab - Label field. Type any part of a label to show only matching pairings."
      />

      <HelpControlsRef items={[
        { name: 'Pairing pane - Pairing column', description: 'Displays the pairing label (falls back to P-{id} when unset).' },
        { name: 'Pairing Info dialog title', description: 'Shows "Label #id" when a label is set, or just "Pairing Info" when opening a pairing without one.' },
        { name: 'Filter - Pairing tab - Label', description: 'Substring match. Shows only matching pairings in the Pairing pane on Apply.' },
      ]} />
    </>
  )
}
