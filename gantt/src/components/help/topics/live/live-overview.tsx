import { HelpH2, HelpScreenshot } from '../../help-article'

export default function LiveOverview() {
  return (
    <>
      <HelpH2>What you see on the Live screen</HelpH2>
      <p className="text-xs text-muted-foreground leading-relaxed mb-3">
        When you open Live, you land on the <strong className="text-foreground">Roster</strong> view
        with an <strong className="text-foreground">empty Gantt</strong> — no data is loaded yet.
        An inline <em>No data loaded — apply filters to pull data</em> reminder next to the
        filter icon in the toolbar invites you to choose what to load.
      </p>
      <HelpScreenshot
        src="/help/screenshots/live-empty-state.png"
        alt="Empty Live toolbar with the inline No data loaded reminder next to the filter icon"
        caption="Live starts empty. Click the reminder (or the filter icon next to it) to choose what to load."
      />
      <p className="text-xs text-muted-foreground leading-relaxed mb-3">
        Click the reminder to open the <strong className="text-foreground">Filters</strong> dialog,
        pick the crew you manage (for example by Base and Rank), and press{' '}
        <strong className="text-foreground">Apply Filters</strong>. Applying with no filters
        loads the complete schedule. You can re-open the dialog at any time to change what is shown.
      </p>
      <p className="text-xs text-muted-foreground leading-relaxed mb-3">
        Once loaded, the toolbar at the top controls what is shown; the large area below is the
        Gantt canvas, where each row represents one crew member and each coloured block represents
        an assignment.
      </p>
      <HelpScreenshot
        src="/help/screenshots/live-toolbar.png"
        alt="The Live toolbar with roster-period selector, filter, zoom, rule set, time zone, and pane buttons"
        caption="The Live toolbar. Every control described in this section lives here."
      />
      <p className="text-xs text-muted-foreground leading-relaxed mb-3">
        From left to right the toolbar holds: the <strong className="text-foreground">roster-period
        selector</strong> (pick one or more roster periods to set the Gantt window), the Refresh and
        Filter buttons, the <strong className="text-foreground">Delete / Undo / Redo / Save</strong>{' '}
        draft toolbar, the zoom controls, the <strong className="text-foreground">rule set</strong>{' '}
        selector, and the time zone switcher. Next comes the{' '}
        <strong className="text-foreground">Roster / Pairing / Flight</strong> pane buttons with a{' '}
        <em>Reset</em> layout button. At the far right are the{' '}
        <strong className="text-foreground">Publish Roster</strong> and{' '}
        <strong className="text-foreground">Create Ground Task</strong> buttons, followed by the{' '}
        <strong className="text-foreground">keyboard-shortcuts</strong> button (keyboard icon).
      </p>
      <p className="text-xs text-muted-foreground leading-relaxed mb-3">
        You can open side panels (called <em>panes</em>) to see Pairings or Flights alongside the
        Roster at the same time.
      </p>

      <HelpH2>When to use Live vs Scenario</HelpH2>
      <p className="text-xs text-muted-foreground leading-relaxed mb-3">
        Use <strong className="text-foreground">Live</strong> when you need to view or manually
        adjust today&apos;s operational schedule — for example, swapping a crew member,
        adding a ground task, or checking a rule violation.
      </p>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Use <strong className="text-foreground">Scenario</strong> when you want to plan a future
        period without touching the live schedule. Scenarios are sandboxes — no change you make
        there appears in Live until you explicitly publish it.
      </p>
    </>
  )
}
