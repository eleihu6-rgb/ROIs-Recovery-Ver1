import { HelpStep, HelpNote, HelpScreenshot, HelpControlsRef } from '../../help-article'

export default function LivePanes() {
  return (
    <>
      <HelpStep n={1}>
        Click one of the pane buttons on the right side of the toolbar:
        <strong> Roster</strong> (blue), <strong>Pairing</strong> (green), or <strong>Flight</strong> (purple).
        A new panel appears on the canvas.
      </HelpStep>
      <HelpScreenshot
        src="/help/screenshots/live-panes-buttons.png"
        alt="Roster, Pairing, and Flight pane add buttons in the right section of the toolbar"
        caption="Each button adds one panel of that type to the canvas."
      />
      <HelpStep n={2}>
        Live opens with the <strong>default layout</strong> of one <strong>Roster</strong> pane and
        one <strong>Pairing</strong> pane (no Flight pane). To remove a pane, click its close button
        inside the panel header. To restore that default layout at any time, click{' '}
        <strong>Reset</strong> (next to the pane buttons).
      </HelpStep>

      <HelpNote>
        You can open up to <strong>2 Roster</strong> panes, <strong>2 Pairing</strong> panes, and{' '}
        <strong>1 Flight</strong> pane, and at most <strong>4 panes in total</strong>. When a limit
        is reached, that add button is disabled and its tooltip says, for example,{' '}
        <em>Max 2 Roster panes</em> (or <em>Max 4 panes</em> once the overall cap is hit).
      </HelpNote>

      <HelpStep n={3}>
        To sort a pane, click the <strong>Sort</strong> button (↕) in the pane's condition
        strip and pick a field in the <strong>Universal Sorting</strong> dialog. The active sort
        appears as a chip in the strip; click the chip's <strong>×</strong> to clear it and return
        to the default order.
      </HelpStep>

      <HelpNote>
        In the Sort dialog, the <strong>Pairing</strong> pane sorts the whole result set on the
        server by the field you choose (Sch Start, Pairing, Fleet, Base, TAFB, Segments, or
        Duration); the default is <em>Sch Start</em> ascending. The <strong>Roster</strong> pane
        supports multi-key priority sorting across its columns — CrewId, Rank, Base, Sen, RpCred,
        and RpDO.
      </HelpNote>

      <HelpNote>
        You can also sort the <strong>Pairing</strong> pane by clicking a column header: the
        sortable headers are <strong>Pairing</strong>, <strong>Type</strong>, <strong>Fleet</strong>,
        and <strong>Cred</strong>. Clicking the same header again flips between ascending and
        descending.
      </HelpNote>

      <HelpNote>
        The <strong>Roster</strong> pane shows the <strong>CrewId</strong>, <strong>Rank</strong>,{' '}
        <strong>Base</strong>, <strong>Sen</strong> (seniority), <strong>RpCred</strong> (credited
        minutes), and <strong>RpDO</strong> (days off) columns by default. YBH, Fleet, RpBH, YAL,
        MAL, and YDO are available but hidden until you switch them on in{' '}
        <strong>Column settings</strong> (the sliders icon in the condition strip).
      </HelpNote>

      <HelpNote>
        The <strong>Pairing</strong> pane lists each pairing&apos;s <strong>Pairing</strong> id,{' '}
        <strong>Base</strong> (its home airport), <strong>Tp</strong> (type), <strong>Fleet</strong>,
        and <strong>Cred</strong> (credited minutes). The same panes and columns are used in both Live
        and a Scenario.
      </HelpNote>

      <HelpNote>
        Each pane&apos;s condition strip has an icon cluster on the right. The{' '}
        <strong>Roster</strong> pane shows the <strong>Alert Center</strong> bell (loaded
        violations), an <strong>overlap-lanes</strong> toggle, and a{' '}
        <strong>Bulk delete roster flights</strong> button. The <strong>Pairing</strong> pane shows
        the <strong>RES Pairing Creator</strong> button (shield-plus icon, Live only). A{' '}
        <strong>Roster Quality</strong> gauge appears on roster panes inside a Scenario.
      </HelpNote>

      <HelpNote>
        When the Pairing pane is narrowed to <strong>Open</strong> and/or <strong>Partial</strong>{' '}
        coverage, a clock badge appears next to the row count. It totals the <strong>Cred</strong>{' '}
        value for the uncovered pairings currently in scope, helping you judge how much flying still
        needs crew.
      </HelpNote>

      <HelpStep n={4}>
        To locate the crew working a trip, right-click a flight block in the
        <strong> Pairing</strong> pane and choose <strong>Find Crew by Pairing</strong>
        (everyone assigned to that whole pairing) or <strong>Find Crew by Flight</strong>
        (everyone on any pairing that covers that single flight). You can also right-click a
        flight in the <strong>Flight</strong> pane and choose <strong>Find Crew by Flight</strong>.
        The matching crew jump to the top of the matching Roster pane (Main → Roster Main,
        Sub → Roster Sub) and are selected; every other crew keeps its current order.
      </HelpStep>

      <HelpNote>
        Crew not currently loaded are fetched and added automatically. Running Find Crew again
        adds the new crew to the top group; re-sorting the Roster pane or refreshing the data
        clears the temporary top grouping.
      </HelpNote>

      <HelpStep n={5}>
        To find the pairings that use a flight, right-click a flight — in the
        <strong> Flight</strong> pane, or a flight block in the <strong>Pairing</strong> pane —
        and choose <strong>Find Pairing by Flight</strong>. Every pairing that uses that flight
        jumps to the top of the Pairing pane (loaded first if it is filtered out).
      </HelpStep>

      <HelpNote>
        If a pairing falls <em>outside the current date range</em> (for example a different
        month), the timeline jumps to include it and a message confirms the jump — its bars are
        loaded and shown rather than left off-screen. Re-applying any filter reloads the Gantt
        and clears the temporary top grouping.
      </HelpNote>

      <HelpStep n={6}>
        <strong>Double-click a pairing</strong> — on a pairing block in the Pairing pane, or on a
        crew member&apos;s pairing duty in the Roster pane — to open <strong>Pairing Info</strong>:
        the pairing header, every flight segment (times switchable between Local / UTC / By
        Departure), and the crew rostered on it (with a count). Double-clicking a ground duty in
        the Roster pane opens its editor instead, not Pairing Info.
      </HelpStep>

      <HelpNote>
        Right-clicking the <strong>empty background of a roster row</strong> (not a task block)
        opens a menu for that crew member with <strong>Crew Info</strong>,{' '}
        <strong>Create Ground Task</strong>, <strong>Add Memo</strong>,{' '}
        <strong>Schedule Details</strong>, <strong>Daily Task Calendar</strong>, and{' '}
        <strong>Manday Info</strong>.
      </HelpNote>

      <HelpControlsRef items={[
        { name: 'Roster button', description: 'Opens a new Roster pane showing crew rows on the canvas.' },
        { name: 'Pairing button', description: 'Opens a new Pairing pane.' },
        { name: 'Flight button', description: 'Opens a new Flight pane.' },
        { name: 'Reset', description: 'Restores the default pane arrangement, closing any extra panes you have added.' },
        { name: 'Sort (↕)', description: 'Opens the Universal Sorting dialog for that pane. The applied sort shows as a chip you can close to revert to the default order.' },
        { name: 'Header-click sort', description: 'Pairing pane: click the Pairing, Type, Fleet, or Cred column header to sort by it; click again to flip direction.' },
        { name: 'Column settings', description: 'Sliders icon in the condition strip — shows, hides, and reorders a pane’s columns (e.g. the hidden YBH, Fleet, RpBH, YAL, MAL, YDO roster columns).' },
        { name: 'Alert Center bell', description: 'Roster pane condition strip — opens the list of loaded legality violations.' },
        { name: 'Overlap lanes', description: 'Roster pane condition strip — toggles compact overlap lanes for overlapping duties.' },
        { name: 'Bulk delete roster flights', description: 'Roster pane condition strip — opens the dialog to delete many roster flights at once.' },
        { name: 'RES Pairing Creator', description: 'Pairing pane condition strip (Live only) — opens the RES Pairing Planner.' },
        { name: 'Find Crew by Pairing', description: 'Right-click menu on a Pairing-pane flight block: brings all crew assigned to that pairing to the top of the matching Roster pane.' },
        { name: 'Find Crew by Flight', description: 'Right-click menu on a flight (Pairing or Flight pane): brings all crew on any pairing covering that flight to the top of the matching Roster pane.' },
        { name: 'Find Pairing by Flight', description: 'Right-click menu on a flight (Flight or Pairing pane): brings every pairing that uses that flight to the top of the Pairing pane. If a pairing falls outside the current date range, the timeline jumps to it so its bars are visible.' },
        { name: 'Crew Info', description: 'Right-click menu on a roster row background: opens the crew member’s detail card.' },
        { name: 'Schedule Details', description: 'Right-click menu on a roster row or duty: opens the crew member’s schedule details for the period.' },
        { name: 'Daily Task Calendar', description: 'Right-click menu on a roster row or duty: opens the crew member’s daily task calendar.' },
        { name: 'Manday Info', description: 'Right-click menu on a roster row background: opens the crew member’s manday summary.' },
        { name: 'Locate Pairing', description: 'Right-click menu on a Roster-pane puck that belongs to a pairing: shows the Pairing pane and brings that pairing to its top row (loading it first if it is filtered out).' },
        { name: 'View pairing detail', description: 'Right-click menu on a Roster-pane or Pairing-pane puck that belongs to a pairing: opens the Pairing Info dialog for that pairing (same dialog as double-click).' },
        { name: 'View flight detail', description: 'Right-click menu on a Roster-pane or Pairing-pane puck with a flight id: opens Flight Detail for that flight.' },
        { name: 'Double-click pairing', description: 'Opens the Pairing Info popup: header, flight segments (Local/UTC/By-DEP times), and rostered crew with a count. Ground duties open their editor instead.' },
      ]} />
    </>
  )
}
