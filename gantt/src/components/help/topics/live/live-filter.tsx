import { HelpStep, HelpNote, HelpScreenshot, HelpControlsRef } from '../../help-article'
import { useHelpExamples } from '../../use-help-examples'

export default function LiveFilter() {
  const ex = useHelpExamples()
  return (
    <>
      <HelpNote>
        Filters are also how you <strong>load data in the first place</strong>: Live opens empty,
        and the first <strong>Apply Filters</strong> pulls the crew, pairing and flight data you
        asked for. Applying with no filters loads everything.
      </HelpNote>
      <HelpStep n={1}>
        Click the <strong>Filters button</strong> in the toolbar (or the inline{' '}
        <em>No data loaded</em> reminder next to it while the screen is still empty).
        When filters are active it turns amber and shows a count, for example <em>Filters (2 active)</em>.
        Each pane also has its own <strong>funnel button</strong> at the top right - it opens the
        same dialog, pre-switched to that pane&apos;s tab (Roster - Crew, Pairing - Pairing,
        Flight - Flight). All tabs stay available no matter where you open it from.
      </HelpStep>
      <HelpScreenshot
        src="/help/screenshots/live-filter-btn.png"
        alt="Filter button in the toolbar showing an active filter count badge"
        caption="The filter button turns amber when any filter is active."
      />
      <HelpStep n={2}>
        The filter dialog opens with three tabs: <strong>Crew</strong>, <strong>Pairing</strong>,
        and <strong>Flight</strong>. Click the tab for the type of data you want to filter.
        The <strong>Division</strong> you pick on the Crew tab is inherited by the Pairing tab -
        there is no separate Division field there.
      </HelpStep>
      <HelpScreenshot
        src="/help/screenshots/live-filter-dialog-crew.png"
        alt="Filter dialog open on the Crew tab"
        caption="The Crew tab filters by Division, Base, Rank, Fleet, and Crew ID. Live allows only one division at a time."
      />
      <HelpScreenshot
        src="/help/screenshots/live-filter-dialog-pairing.png"
        alt="Filter dialog open on the Pairing tab"
        caption="The Pairing tab filters by Label, Pairing ID, Rank, Base, Fleet, Type, Arpt, and Coverage."
      />
      <HelpScreenshot
        src="/help/screenshots/live-filter-dialog-flight.png"
        alt="Filter dialog open on the Flight tab"
        caption="The Flight tab filters by Dep Airport, Arr Airport, Flight No., Fleet, and Status."
      />
      <HelpStep n={3}>
        Fill in the fields you care about. You can combine filters across tabs - for example, filter
        by Crew Base <em>and</em> Flight Departure Airport at the same time. Active filters appear as
        chips in the <strong>Active</strong> summary bar at the bottom of the dialog; each chip has a
        remove button to remove just that one. The footer shows how many are active, for example{' '}
        <em>3 filters active</em>, next to the <strong>Reset</strong> and{' '}
        <strong>Apply Filters</strong> buttons.
      </HelpStep>

      <HelpStep n={4}>
        Click <strong>Apply Filters</strong>. The canvas reloads showing only matching items.
        After applying, each pane&apos;s title bar shows an amber funnel badge with{' '}
        <em>filtered/total</em> counts, for example <em>12/80</em> - 12 matching crew out of 80 in
        total. Without a filter the title bar simply shows the total count. On the Pairing pane the{' '}
        <strong>Coverage</strong> selection also drives this funnel - with Open + Partial selected by
        default, the pane shows only under-crewed pairings (fully-crewed and over-staffed ones are
        hidden) and the badge counts them against the total.
      </HelpStep>
      <HelpScreenshot
        src="/help/screenshots/live-filter-result.png"
        alt="Roster pane title bar showing the amber funnel badge with filtered/total counts"
        caption="The pane title bar shows 'filtered/total' - here only the matching crew are loaded out of the full set."
      />
      <HelpNote>
        <strong>Reset</strong> reverts changes you made <em>inside</em> the dialog during this
        session, putting fields back to what they were when you opened the dialog.{' '}
        <strong>Clear all</strong> (in the Active summary bar) removes every active filter
        completely.
      </HelpNote>

      <HelpStep n={5}>
        <strong>Find exact rows.</strong> The Crew tab&apos;s <strong>Crew ID</strong> field
        locates crew without hiding the rest: type one or more IDs separated by a comma or a
        period, for example <em>{ex.crewId}</em>, then Apply to move those crew to the top. The
        Pairing tab&apos;s <strong>Label</strong> field filters by pairing label substring. The{' '}
        <strong>Pairing ID</strong> field accepts one or more numeric pairing IDs separated by
        comma, period, or space, and is a hard filter: only those exact pairings remain visible.
        Clear the fields and Apply again to remove the filters.
      </HelpStep>

      <HelpControlsRef items={[
        { name: 'Crew tab - Division', description: 'Single-select pill group: P — Pilot or C — Cabin. Live allows only one division at a time; the Pairing tab inherits the selected division.' },
        { name: 'Crew tab - Base', description: 'Show only crew based at the selected airports.' },
        { name: 'Crew tab - Rank', description: 'Filter by crew rank (e.g. CA, FO, FA).' },
        { name: 'Crew tab - Fleet', description: 'Show only crew qualified on the selected aircraft types.' },
        { name: 'Crew tab - Crew ID', description: 'Comma- or period-separated crew IDs. Brings those crew to the top of the Roster pane (added if not loaded), keeping everyone else below.' },
        { name: 'Pairing tab - Label', description: 'Substring search on the pairing label. Shows only pairings whose label contains the entered text.' },
        { name: 'Pairing tab - Pairing ID', description: 'Comma-, period-, or space-separated numeric pairing IDs. Shows only the exact matching pairings in Live and Scenario.' },
        { name: 'Pairing tab - Rank', description: 'Filter pairings by crew rank. Division comes from the Crew tab.' },
        { name: 'Pairing tab - Base', description: 'Show only pairings based at the selected airports.' },
        { name: 'Pairing tab - Fleet', description: 'Show only pairings on the selected aircraft types.' },
        { name: 'Pairing tab - Type', description: 'Filter pairings by assignment type (e.g. flying, standby, ground). Pick one or more - pairings of ANY selected type are shown, each as its own chip.' },
        { name: 'Pairing tab - Arpt', description: `Enter IATA codes (e.g. ${ex.base}, ${ex.second}) to filter pairings that start at those airports.` },
        { name: 'Pairing tab - Coverage', description: 'Multi-select crewing state: Open (nobody assigned), Partial (a slot still short), Full (every slot exactly met), Over (over-staffed with no slot short). The Pairing pane shows only pairings in the selected coverage - by default Open + Partial, so fully-crewed and over-staffed pairings are hidden until you select them. When the selection is limited to Open and/or Partial, the pane title also shows the total credited time of that uncovered work.' },
        { name: 'Flight tab - Dep Airport', description: `Comma-separated departure IATA codes (e.g. ${ex.base}, ${ex.second}).` },
        { name: 'Flight tab - Arr Airport', description: 'Comma-separated arrival IATA codes.' },
        { name: 'Flight tab - Flight No.', description: 'Comma-separated flight numbers (e.g. 1001).' },
        { name: 'Flight tab - Fleet', description: 'Show only flights on the selected aircraft types.' },
        { name: 'Flight tab - Status', description: 'All / Full / Partial / Open - filter by how many crew positions are filled.' },
        { name: 'Active summary bar', description: 'Lists every active filter as a removable chip. Clear all removes them all.' },
        { name: 'Pane funnel button', description: 'Top right of each pane - opens this dialog on the tab matching the pane.' },
        { name: 'Apply Filters', description: 'Apply all current settings and reload the canvas.' },
        { name: 'Reset', description: 'Undo filter dialog changes made in this session.' },
        { name: 'Clear all', description: 'Remove every active filter.' },
      ]} />
    </>
  )
}
