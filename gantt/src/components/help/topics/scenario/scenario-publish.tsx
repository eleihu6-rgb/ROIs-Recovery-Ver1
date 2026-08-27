import { HelpStep, HelpNote, HelpTip, HelpH2, HelpScreenshot, HelpControlsRef } from '../../help-article'

export default function ScenarioPublish() {
  return (
    <>
      <p className="text-xs text-muted-foreground leading-relaxed mb-4">
        Importing writes the optimized crew-to-pairing assignments back to the{' '}
        <strong>live roster</strong>. Only assignments you explicitly select are written —
        you stay in full control of what goes live.
      </p>

      <HelpStep n={1}>
        The scenario must be in <strong>Done</strong> or <strong>Published</strong> status before
        you can import to Live. Click the <strong>UploadCloud</strong> icon (tooltip:{' '}
        <strong>Import to Live Roster</strong>) in the scenario toolbar. The icon is disabled while
        the scenario is in Draft, Running, or Failed status.
      </HelpStep>

      <HelpStep n={2}>
        The <strong>Import Optimized Roster to Live</strong> dialog opens and loads the list of
        optimized assignments. The table is virtualized so long optimization results remain
        responsive. Each row shows:
      </HelpStep>

      <table className="w-full text-xs mb-4 ml-7">
        <thead>
          <tr className="border-b border-border">
            <th className="py-1.5 pr-4 text-left font-semibold text-foreground">Column</th>
            <th className="py-1.5 text-left font-semibold text-foreground">What it shows</th>
          </tr>
        </thead>
        <tbody>
          {[
            { col: 'Crew ID', what: 'The crew member\'s employee number.' },
            { col: 'Kind', what: 'Flying or Ground.' },
            { col: 'Pairing ID', what: 'The numeric pairing id, or — for ground rows.' },
            { col: 'Pairing Label', what: 'The label of the pairing being assigned, or — when none is available.' },
            { col: 'Source', what: 'Where the row came from, such as Solver or PA.' },
            { col: 'Base', what: 'The crew base for this pairing.' },
            { col: 'Div', what: 'Division — P for pilots, C for cabin crew.' },
            { col: 'Asgmt Group', what: 'The broad assignment category (e.g. CA_CQ).' },
            { col: 'Assignment', what: 'The specific position on the pairing (e.g. CA, FO).' },
            { col: 'Start (UTC)', what: 'Pairing start date in UTC.' },
            { col: 'End (UTC)', what: 'Pairing end date in UTC.' },
            { col: 'Status', what: 'Pre-assign, Pending (not yet imported), Imported (already written to Live), or No Live Crew (exception).' },
          ].map((r) => (
            <tr key={r.col} className="border-b border-border/50 last:border-0">
              <td className="py-1.5 pr-4 font-semibold text-foreground align-top">{r.col}</td>
              <td className="py-1.5 text-muted-foreground align-top">{r.what}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <HelpScreenshot
        src="/help/screenshots/scenario-publish.png"
        alt="Import Optimized Roster to Live dialog showing a table of assignments with checkboxes and a filter bar"
        caption="Imported rows are greyed out and cannot be re-selected."
      />

      <HelpStep n={3}>
        Use <strong>Crew ID</strong>, <strong>Base</strong>, <strong>Pairing ID</strong>, and{' '}
        <strong>Pairing Label</strong> at the top of the dialog to narrow the list, then click{' '}
        <strong>Search</strong>. The row count on the right shows <em>filtered / total</em> rows.
      </HelpStep>

      <HelpStep n={4}>
        Select the rows you want to import by clicking each row or its checkbox. Use the header
        checkbox to select or deselect all visible unpublished rows at once. You can also use{' '}
        <strong>Select Unpublished</strong> and <strong>Clear Selection</strong>.
      </HelpStep>

      <HelpNote>
        Rows marked <strong>Imported</strong> (greyed out) are already in the Live roster and
        cannot be re-selected. Use <strong>Hide Imported</strong> to focus on rows that still
        need action; click <strong>Show Imported</strong> to bring them back for reference.
      </HelpNote>

      <HelpStep n={5}>
        Click <strong>Import N Selected</strong>. The dialog shows a progress bar — the step label
        moves from <strong>Preparing selected rows</strong> to <strong>Writing to Live roster</strong>{' '}
        — along with the elapsed time. When the write completes you see{' '}
        <strong>Imported: N</strong> and the elapsed time.
      </HelpStep>

      <HelpStep n={6}>
        After importing, the scenario status changes to <strong>Published</strong>: the status icon
        becomes an amber <strong>UploadCloud</strong> in the list and the detail badge shows an
        amber <em>Published</em> label.
      </HelpStep>

      <HelpNote>
        When every importable row has been written, the dialog shows a{' '}
        <strong>"All assignments have been imported to the Live roster."</strong> notice.
      </HelpNote>

      <HelpH2>Re-opening the import dialog</HelpH2>
      <p className="text-xs text-muted-foreground leading-relaxed mb-3">
        You can open the import dialog again from a <strong>Published</strong> scenario. Previously
        imported rows appear greyed out and disabled. Any rows that were not imported in the first
        pass remain selectable, letting you import them later.
      </p>

      <HelpTip>
        If you imported the wrong assignments, use the <strong>Eraser</strong> icon to revert the
        scenario to Draft, correct the optimization, and import again. Note that previously
        written <code>roster_flight</code> records are not automatically deleted — ask your
        administrator to remove them if needed.
      </HelpTip>

      <HelpControlsRef items={[
        { name: 'UploadCloud icon (Import to Live Roster)', description: 'Opens the Import Optimized Roster to Live dialog. Available when status is Done or Published for a live-pairing RO scenario.' },
        { name: 'Crew ID filter', description: 'Filters the dialog table to rows matching the typed crew ID.' },
        { name: 'Base filter', description: 'Filters the dialog table to rows matching the typed base code.' },
        { name: 'Pairing ID filter', description: 'Filters the dialog table to rows whose numeric pairing id contains the typed value.' },
        { name: 'Pairing Label filter', description: 'Filters the dialog table to rows whose pairing label contains the typed text.' },
        { name: 'Search', description: 'Applies the filter fields without changing the current selection.' },
        { name: 'Hide Imported / Show Imported', description: 'Hides or restores already-imported rows in the dialog table.' },
        { name: 'Select Unpublished', description: 'Selects all visible rows that can still be imported.' },
        { name: 'Clear Selection', description: 'Clears every selected row.' },
        { name: 'Header checkbox', description: 'Selects or deselects all visible pending (ungreyed) rows.' },
        { name: 'Import N Selected', description: 'Writes the selected assignments to the Live roster and transitions the scenario to Published status.' },
        { name: 'Status', description: 'Pre-assign / Pending / Imported / No Live Crew — exception rows show the AlertTriangle icon.' },
        { name: 'Published status', description: 'Amber UploadCloud icon in list, amber badge in detail panel — some or all assignments have been written to live.' },
      ]} />
    </>
  )
}
