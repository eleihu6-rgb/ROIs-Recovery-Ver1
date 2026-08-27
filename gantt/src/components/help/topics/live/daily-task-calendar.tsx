import { HelpStep, HelpNote, HelpTip, HelpControlsRef } from '../../help-article'
import { CalendarDays, CalendarClock, UserRound, Clock, Grid3X3, BarChart3 } from 'lucide-react'

export default function LiveDailyTaskCalendar() {
  return (
    <>
      <p className="text-xs text-muted-foreground leading-relaxed mb-4">
        <strong>Daily Task Calendar</strong> shows a crew member&apos;s month as a week-at-a-glance
        calendar — every day a cell, every assignment a colour-coded chip.
      </p>

      <HelpStep n={1}>
        <strong>Open it from the roster.</strong> Right-click a task block on a crew&apos;s row (or the
        row&apos;s empty background) and choose <strong>Daily Task Calendar</strong>. The dialog opens for
        the crew under the cursor — its title reads <em>Daily Task Calendar — {`{crew ID}`}</em>.
      </HelpStep>

      <HelpStep n={2}>
        <strong>Pick the crew and the period.</strong> The <strong>Crew</strong> search box is
        pre-filled with the crew you right-clicked. In Live, the <strong>RP Date</strong> stepper
        selects which roster period to lay out — the description shows{' '}
        <em>{`{range} · {start} to {end}`}</em>. In a Scenario the calendar uses the scenario&apos;s own
        date range, so there is no RP Date stepper.
      </HelpStep>

      <HelpStep n={3}>
        <strong>Switch the timezone.</strong> A small <strong>Timezone</strong> toggle lays out the
        days either in the display timezone or in <strong>UTC</strong>. The display timezone defaults
        to the crew&apos;s <strong>base-airport</strong> timezone (when known and listed); otherwise it
        falls back to the toolbar airport code — or <strong>Gantt TZ</strong> when the toolbar zone is
        UTC.
      </HelpStep>

      <HelpStep n={4}>
        <strong>Read the calendar grid.</strong> Columns run <strong>Mon</strong> through{' '}
        <strong>Sun</strong>; each in-range day shows its date number, and an empty in-range day is
        marked <strong>Open</strong>. Each assignment is a chip coloured by its assignment type; a day
        with more than 3 tasks shows <strong>+N</strong> for the remainder. Click any chip to select
        that task on the canvas — the chip gets a ring.
      </HelpStep>

      <HelpStep n={5}>
        <strong>Read the Statistics panel.</strong> The panel on the right summarises the period:{' '}
        <strong>RpCred</strong>, <strong>Flight</strong>, <strong>Reserve</strong>,{' '}
        <strong>Ground</strong>, <strong>Day Off</strong>, <strong>Open</strong>,{' '}
        <strong>Tasks</strong>, <strong>Max Work</strong>, <strong>Max Off/Open</strong>, and{' '}
        <strong>Max Reserve</strong>.
      </HelpStep>

      <HelpNote>
        Days outside the selected period are dimmed, and a day that falls on today&apos;s date carries a
        subtle ring. If there is no data at all the grid shows <em>No calendar data.</em>
      </HelpNote>

      <HelpTip>
        The task chips reuse the same assignment colours as the canvas, so a day&apos;s workload at a
        glance matches the Roster pane.
      </HelpTip>

      <HelpControlsRef items={[
        { name: 'Crew', icon: <UserRound className="h-3.5 w-3.5" />, description: 'Search box, pre-filled with the crew you right-clicked. Type to switch to another crew.' },
        { name: 'RP Date', icon: <CalendarDays className="h-3.5 w-3.5" />, description: 'Live only. Stepper that picks which roster period the calendar covers.' },
        { name: 'Timezone', icon: <Clock className="h-3.5 w-3.5" />, description: 'Toggle between the display timezone (defaults to the crew’s base-airport timezone; falls back to the toolbar airport code, or Gantt TZ when UTC) and UTC for day boundaries.' },
        { name: 'Calendar grid', icon: <Grid3X3 className="h-3.5 w-3.5" />, description: 'Mon–Sun columns; one cell per day. Assignment chips are coloured by assignment type; empty in-range days show Open; more than 3 tasks shows +N.' },
        { name: 'Statistics panel', icon: <BarChart3 className="h-3.5 w-3.5" />, description: 'Right-hand summary: RpCred, Flight, Reserve, Ground, Day Off, Open, Tasks, Max Work, Max Off/Open, Max Reserve.' },
        { name: 'Task chip', icon: <CalendarClock className="h-3.5 w-3.5" />, description: 'Click a chip to select that roster task on the canvas; the selected chip gets a ring.' },
      ]} />
    </>
  )
}
