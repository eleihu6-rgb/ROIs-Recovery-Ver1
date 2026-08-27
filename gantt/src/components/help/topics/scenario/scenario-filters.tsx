import { HelpStep, HelpNote, HelpTip, HelpH2, HelpScreenshot, HelpControlsRef } from '../../help-article'
import { useHelpExamples } from '../../use-help-examples'

export default function ScenarioFilters() {
  const ex = useHelpExamples()
  return (
    <>
      <HelpStep n={1}>
        Open a scenario and go to its <strong>Scope Filters</strong> section in the detail panel.
        The fields you see depend on the scenario type (PO, RO, or TO).
      </HelpStep>

      <HelpStep n={2}>
        Fill in the filters that apply to your task. Leave a field empty to include everything
        of that type, then click <strong>Save</strong> to keep your changes.
      </HelpStep>

      <HelpNote>
        Narrower scope means faster results. If you only need to optimize one fleet or one base,
        set the filters accordingly rather than running across everything.
      </HelpNote>

      <HelpH2>PO scope filters</HelpH2>
      <p className="text-xs text-muted-foreground leading-relaxed mb-4">
        PO scenarios optimize pairings from flights, so the scope is a single collapsible{' '}
        <strong>Flight Filters</strong> group. The number badge on the header counts how many
        flight filters are currently active. The tag fields take one or more entries — type a value
        and press Enter to add it as a chip; leave a field empty to include everything.
      </p>
      <HelpScreenshot
        src="/help/screenshots/scenario-po-scope-filters.png"
        alt="PO Flight Filters: Flight Nos, Dep Airports, Arr Airports, Fleets tag fields and a Flight Status dropdown"
        caption="PO scope is one Flight Filters group: flight numbers, departure / arrival airports, fleets, and a Flight Status dropdown."
      />
      <HelpControlsRef items={[
        { name: 'Flight Nos', description: 'Limit optimization to specific flight numbers (e.g. CA101). Tag field.' },
        { name: 'Dep Airports', description: 'Limit to flights departing from these airports. Tag field.' },
        { name: 'Arr Airports', description: 'Limit to flights arriving at these airports. Tag field.' },
        { name: 'Fleets', description: 'Limit to specific aircraft types. Tag field.' },
        { name: 'Flight Status', description: 'Scheduled / Actual / All — which flight times to optimize against.' },
      ]} />

      <HelpH2>RO / TO scope filters</HelpH2>
      <p className="text-xs text-muted-foreground leading-relaxed mb-4">
        RO and TO scenarios assign crew to pairings, so the scope is split into two collapsible
        groups — <strong>Crew Filters</strong> (who can be assigned) and{' '}
        <strong>Pairing Filters</strong> (what they can be assigned to). Click a group header to
        expand or collapse it. The number badge on each header shows how many filters are active,
        and the grey <strong>FILTER</strong> line beneath each group is a live summary of that
        scope — an asterisk (<strong>*</strong>) means “no restriction”.
      </p>
      <HelpScreenshot
        src="/help/screenshots/scenario-ro-scope-filters.png"
        alt="RO scope filters: Crew Filters with Bases, Ranks, Fleets, Seniority and Birthday, and Pairing Filters with Bases, Ranks, Fleets, Types and Duration, each with a live FILTER summary line"
        caption="RO scope splits into Crew and Pairing filters. The FILTER line summarises each group as bases / ranks / fleets / seniority / birthday and bases / ranks / fleets / types / duration."
      />

      <p className="text-xs text-muted-foreground leading-relaxed mb-2">
        <strong>Crew Filters</strong> — narrow the pool of crew the engine may assign:
      </p>
      <HelpControlsRef items={[
        { name: 'Bases', description: 'Multi-select of home bases. Placeholder: All.' },
        { name: 'Ranks', description: 'Multi-select of crew ranks. Placeholder: All.' },
        { name: 'Fleets', description: 'Multi-select of fleet types. Placeholder: All.' },
        { name: 'Seniority', description: 'Min / Max numeric range of crew seniority.' },
        { name: 'Birthday', description: 'Min Date / Max Date range of crew birthdays.' },
      ]} />

      <p className="text-xs text-muted-foreground leading-relaxed mb-2 mt-4">
        <strong>Pairing Filters</strong> — narrow which pairings are eligible to be filled:
      </p>
      <HelpControlsRef items={[
        { name: 'Bases', description: 'Multi-select of pairing bases. Placeholder: All.' },
        { name: 'Ranks', description: 'Multi-select of pairing ranks. Placeholder: All.' },
        { name: 'Fleets', description: 'Multi-select of pairing fleets. Placeholder: All.' },
        { name: 'Type', description: 'Multi-select of pairing types. Placeholder: All types.' },
        { name: 'Duration (days)', description: 'Min / Max numeric range of pairing duration in days.' },
      ]} />

      <HelpTip>
        Bases, ranks, fleets, and pairing types are selected from dropdowns backed by the airline
        reference tables, not typed in by hand — so the scope always matches configured data.
      </HelpTip>

      <HelpNote>
        TO (training) scenarios use the same Crew and Pairing filters, plus an extra Training
        group for course types, expiry filter, and priorities.
      </HelpNote>

      <HelpH2>Crew Bids</HelpH2>
      <p className="text-xs text-muted-foreground leading-relaxed mb-4">
        <strong>Crew Bids</strong> is a separate section in the Scenario sidebar, not part of a
        scenario&apos;s scope filters. It shows the preference bids crew submitted for a period so
        you can review them before building rosters. Pick a <strong>Period</strong> and press{' '}
        <strong>Search</strong> to load that period&apos;s bids, then narrow by{' '}
        <strong>Base</strong>, <strong>Rank</strong>, or <strong>Context</strong>.
      </p>
      <HelpScreenshot
        src="/help/screenshots/scenario-crew-bids.png"
        alt="Crew Bids view: Period, Base, Rank, Context filters and a table of crew bids"
        caption={`Crew Bids for a selected period at ${ex.base}: each crew row lists their bid types (Line, Days-off, Reserve, Pairing) with seniority, rank, and bid status.`}
      />
      <HelpControlsRef items={[
        { name: 'Period', description: 'The bid period to review. Required before Search is enabled.' },
        { name: 'Base', description: 'Multi-select of home bases. Defaults to All Bases.' },
        { name: 'Rank', description: 'Multi-select of crew ranks. Defaults to All Ranks.' },
        { name: 'Context', description: 'All / Current / Default — which bid context to show.' },
        { name: 'Search', description: 'Loads bids for the chosen Period and filters. Disabled until a Period is set.' },
        { name: 'ID or name…', description: 'Crew search box shown after the first search.' },
      ]} />
    </>
  )
}
