import { HelpStep, HelpNote, HelpTip, HelpControlsRef } from '../../help-article'
import { CalendarDays, UserRound, Clock, ListOrdered } from 'lucide-react'

export default function LiveScheduleDetails() {
  return (
    <>
      <p className="text-xs text-muted-foreground leading-relaxed mb-4">
        <strong>Schedule Details</strong> lists every assignment a crew member has in one roster
        period — a compact, sortable view of the duties that make up their month.
      </p>

      <HelpStep n={1}>
        <strong>Open it from the roster.</strong> Right-click a task block on a crew&apos;s row (or the
        row&apos;s empty background) and choose <strong>Schedule Details</strong>. The dialog opens for
        the crew under the cursor — its title reads <em>Schedule Details — {`{crew ID}`}</em>.
      </HelpStep>

      <HelpStep n={2}>
        <strong>Pick the crew and the period.</strong> The <strong>Crew</strong> search box is
        pre-filled with the crew you right-clicked and you can switch to any other crew. In Live, the{' '}
        <strong>RP Date</strong> stepper selects which roster period to inspect — one period at a time,
        shown in the dialog description as <em>{`{RP} · {start} to {end}`}</em>. (In a Scenario the
        period follows the scenario&apos;s own date range, so there is no RP Date stepper.)
      </HelpStep>

      <HelpStep n={3}>
        <strong>Switch the timezone.</strong> A small <strong>Timezone</strong> toggle shows Start and
        End times either in the display timezone or in <strong>UTC</strong> for a fixed reference. The
        display timezone defaults to the crew&apos;s <strong>base-airport</strong> timezone (matched
        against the timezone-options list); when the base is unknown or not listed it falls back to
        the toolbar airport code — or <strong>Gantt TZ</strong> when the toolbar zone is UTC.
      </HelpStep>

      <HelpStep n={4}>
        <strong>Read the table.</strong> Columns are <strong>Type</strong>, <strong>Start</strong>,{' '}
        <strong>End</strong>, <strong>Credit</strong>, <strong>Label</strong>, <strong>Pairing</strong>,{' '}
        and <strong>Source</strong>. The <strong>Type</strong> column shows the assignment group (for
        example the duty type), and the <strong>Pairing</strong> column shows the pairing id with its
        interface id when one exists. The duties of one pairing are grouped into a <strong>single
        row</strong> spanning the pairing&apos;s earliest start to latest end, with the credit summed
        across its segments; standalone day-off and ground rows appear on their own lines. Click any
        row to select that task on the canvas — clicking a pairing row selects every segment of that
        pairing for that crew — and the dialog highlights the selected row(s). The row count (e.g.{' '}
        <em>12 rows</em>) sits at the top right.
      </HelpStep>

      <HelpNote>
        In Live, the dialog shows the duties already loaded in the viewport and, when the selected
        roster period extends beyond the loaded date range, it fetches the remaining days from the
        server. A row that has no data shows the empty state <em>No schedule rows in the selected
        RP.</em>
      </HelpNote>

      <HelpTip>
        This is the same <strong>Schedule Details</strong> action that appears in the right-click menu
        of both the Live and Scenario roster panes — you do not have to locate the crew in the Roster
        pane first.
      </HelpTip>

      <HelpControlsRef items={[
        { name: 'Crew', icon: <UserRound className="h-3.5 w-3.5" />, description: 'Search box, pre-filled with the crew you right-clicked. Type to switch to another crew.' },
        { name: 'RP Date', icon: <CalendarDays className="h-3.5 w-3.5" />, description: 'Live only. Stepper that picks which roster period to inspect; one period is shown at a time.' },
        { name: 'Timezone', icon: <Clock className="h-3.5 w-3.5" />, description: 'Toggle between the display timezone (defaults to the crew’s base-airport timezone; falls back to the toolbar airport code, or Gantt TZ when UTC) and UTC for the Start / End columns.' },
        { name: 'Row count', icon: <ListOrdered className="h-3.5 w-3.5" />, description: 'Shows how many rows are listed (e.g. 12 rows), or Loading... while data is fetched.' },
        { name: 'Table row', icon: <CalendarDays className="h-3.5 w-3.5" />, description: 'One row per assignment — Type, Start, End, Credit, Label, Pairing, Source — with the duties of one pairing grouped into a single row. Click to select the task (a pairing row selects every segment of that pairing) on the canvas.' },
      ]} />
    </>
  )
}
