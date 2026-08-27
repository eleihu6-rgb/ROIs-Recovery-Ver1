// gantt/src/components/help/topics/live/live-res-pairing.tsx
import { HelpStep, HelpNote, HelpTip, HelpH2, HelpControlsRef } from '../../help-article'

export default function LiveResPairing() {
  return (
    <>
      <HelpStep n={1}>
        On the <strong>Live</strong> screen, open the <strong>Pairing</strong> pane. In the pane's
        condition strip, click the <strong>RES Pairing Creator</strong> button (the shield-with-plus
        icon) to open the <strong>RES Pairing Planner</strong> dialog. This button only appears if
        your account has the reserve-pairing capability.
      </HelpStep>

      <HelpNote>
        RES pairings are <strong>Live-only</strong>. The Planner generates{' '}
        <strong>PRAM / PRPM</strong> (Pilot AM / PM reserves) and{' '}
        <strong>CRAM / CRPM</strong> (Cabin AM / PM reserves) pairings directly against the live
        roster. They are not available inside a Scenario.
      </HelpNote>

      <HelpH2>Step 1 — Define the reserve plan</HelpH2>

      <HelpStep n={2}>
        The <strong>Define</strong> tab shows a monthly calendar and an entry panel.
        At the top, choose your scope: click a <strong>Base</strong> chip (or <em>All bases</em>)
        and choose <strong>Pilot (P)</strong> or <strong>Cabin (C)</strong> division. The ranks
        available for that division appear as a hint.
      </HelpStep>

      <HelpStep n={3}>
        Click a date cell in the calendar. The entry panel on the right becomes active for that date.
        For each rank, enter how many reserve crew slots you need that day for AM and PM call windows.
        Click <strong>Apply</strong> to save the values to that cell. Cells with a plan show a
        coloured indicator; empty cells are left blank.
      </HelpStep>

      <HelpTip>
        Click <strong>Clear all</strong> (top-right of the scope bar) to reset every cell in the
        current view.
      </HelpTip>

      <HelpH2>Step 2 — Review and generate</HelpH2>

      <HelpStep n={4}>
        Stay on the <strong>Define</strong> page. The summary table, conflict policy, and
        <strong>Generate</strong> controls sit at the bottom of the page after the calendar and
        entry panel. Review every base / rank / timing combination you planned — the number of
        days, slots per day, and total slots — before generating.
      </HelpStep>

      <HelpStep n={5}>
        Choose a <strong>Conflict policy</strong> for dates where a RES pairing already exists:
        <ul className="mt-1 ml-4 list-disc space-y-0.5 text-xs">
          <li><strong>Skip</strong> — leave the existing pairing unchanged (default).</li>
          <li><strong>Overwrite</strong> — replace the existing pairing's composition.</li>
          <li><strong>Add</strong> — insert a new pairing alongside the existing one.</li>
        </ul>
        Then click <strong>Generate</strong> on the same page. The dialog closes, the pairing pane filters to the
        newly created reserve pairings, and a banner confirms how many were created or skipped.
      </HelpStep>

      <HelpH2>Step 3 — Manage existing reserves</HelpH2>

      <HelpStep n={6}>
        Open the <strong>Manage existing</strong> tab. Use the filter bar to narrow by Base,
        Division, date range, and type (PRAM / PRPM / CRAM / CRPM), then click{' '}
        <strong>Load</strong>. A KPI summary at the top shows total pairings, per-call-code
        counts, crew slots, bases covered, and dates covered. The table below lists every matching
        RES pairing with its date, base, division, label, type, plan values per rank, and Open /
        Full status.
      </HelpStep>

      <HelpStep n={7}>
        Select one or more rows (checkbox or header checkbox for all). The action bar appears:
        <ul className="mt-1 ml-4 list-disc space-y-0.5 text-xs">
          <li>
            <strong>Modify</strong> — opens a panel where you enter a new plan value for each rank,
            then click <strong>Apply</strong> to update the selected rows.
          </li>
          <li>
            <strong>Delete</strong> — confirms the count and removes the selected pairings.
            Pairings already published to the live roster cannot be deleted and are reported as
            blocked.
          </li>
        </ul>
      </HelpStep>

      <HelpControlsRef items={[
        { name: 'RES Pairing Creator button (shield-plus icon)', description: 'Opens the RES Pairing Planner dialog from the Pairing pane condition strip. Live-only.' },
        { name: 'Base chips', description: 'Filter the Define calendar to a specific base, or show All bases.' },
        { name: 'Division (Pilot / Cabin)', description: 'Selects which crew type the plan covers — Pilot (PRAM/PRPM) or Cabin (CRAM/CRPM).' },
        { name: 'Calendar cell', description: 'Click a date to activate it in the entry panel.' },
        { name: 'Entry panel → Apply', description: 'Saves the rank / AM / PM plan values for the active date.' },
        { name: 'Clear all', description: 'Resets all cell values in the current Define view.' },
        { name: 'Summary table', description: 'Shows the planned base / rank / timing totals before generating pairings.' },
        { name: 'Conflict policy (Skip / Overwrite / Add)', description: 'Controls what happens when a RES pairing already exists for a date–base–type.' },
        { name: 'Generate', description: 'Creates the RES pairings, applies a filter in the pairing pane, and closes the dialog.' },
        { name: 'Load (Manage tab)', description: 'Fetches existing RES pairings matching the current filters.' },
        { name: 'Modify', description: 'Updates plan values for the selected rows.' },
        { name: 'Delete', description: 'Removes the selected RES pairings (blocked pairings are listed as errors).' },
      ]} />
    </>
  )
}
