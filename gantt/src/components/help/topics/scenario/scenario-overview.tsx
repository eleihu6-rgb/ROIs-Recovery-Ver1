import { HelpH2, HelpNote } from '../../help-article'

export default function ScenarioOverview() {
  return (
    <>
      <HelpH2>What is a scenario?</HelpH2>
      <p className="text-xs text-muted-foreground leading-relaxed mb-3">
        A scenario is a sandbox copy of your schedule that you can plan, optimize, and review
        without affecting the live schedule. Nothing you do in a scenario is visible to crew
        until you publish it.
      </p>

      <HelpH2>Scenario types</HelpH2>
      <table className="w-full text-xs mb-4">
        <thead>
          <tr className="border-b border-border">
            <th className="py-2 pr-4 text-left font-semibold text-foreground w-1/5">Type</th>
            <th className="py-2 text-left font-semibold text-foreground">What it does</th>
          </tr>
        </thead>
        <tbody>
          {[
            { type: 'PO', desc: 'Pairing Optimization — builds the best pairings (multi-day trip sequences) from a set of flights.' },
            { type: 'RO', desc: 'Roster Optimization — assigns crew to existing pairings, building individual rosters.' },
            { type: 'TO', desc: 'Training Optimization — plans training assignments alongside operational duties.' },
          ].map((row) => (
            <tr key={row.type} className="border-b border-border/50 last:border-0">
              <td className="py-2 pr-4 font-semibold text-foreground align-top">{row.type}</td>
              <td className="py-2 text-muted-foreground align-top">{row.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <HelpNote>
        <strong>Crew Bids</strong> is not a scenario type. It is a separate section in the Scenario
        sidebar where you review the preference bids crew submitted for a period — Period / Base /
        Rank / Context filters plus the crew bid table. See the Scope Filters topic for details.
      </HelpNote>

      <HelpH2>Status lifecycle</HelpH2>
      <table className="w-full text-xs mb-4">
        <thead>
          <tr className="border-b border-border">
            <th className="py-2 pr-4 text-left font-semibold text-foreground w-1/4">Status</th>
            <th className="py-2 text-left font-semibold text-foreground">Meaning</th>
          </tr>
        </thead>
        <tbody>
          {[
            { status: 'Pencil icon · Draft', desc: 'Scenario is being configured. No optimization has run yet (or the previous result was removed).' },
            { status: 'LoaderCircle icon · Running', desc: 'The optimization engine is working. The icon spins to indicate activity.' },
            { status: 'CheckCircle2 icon · Done', desc: 'Optimization completed successfully. Results are available and you can publish.' },
            { status: 'AlertCircle icon · Failed', desc: 'The engine could not complete. Review your settings and re-run.' },
            { status: 'UploadCloud icon · Published', desc: 'Optimized assignments have been written back to the live roster.' },
          ].map((row) => (
            <tr key={row.status} className="border-b border-border/50 last:border-0">
              <td className="py-2 pr-4 font-semibold text-foreground align-top">{row.status}</td>
              <td className="py-2 text-muted-foreground align-top">{row.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <HelpH2>Setting the period</HelpH2>
      <p className="text-xs text-muted-foreground leading-relaxed mb-4">
        In <strong>Basic Info</strong>, choose a roster period with the <strong>RP Date</strong>{' '}
        selector. The scenario&apos;s <strong>Start</strong> and <strong>End</strong> date inputs
        are filled automatically from the selected period and are read-only.
      </p>

      <HelpH2>Algorithm Parameters</HelpH2>
      <p className="text-xs text-muted-foreground leading-relaxed mb-4">
        For RO and TO scenarios the Basic Info panel has an <strong>Algorithm Parameters</strong>{' '}
        button that shows <em>Using defaults</em> (or <em>Changed: …</em> once parameters differ
        from the defaults). It opens a dialog with tabs for Credit Range, Floor Rescue, Reserve
        Priority, Min Reserve Coverage %, Day Pressure Spread, Team Rules, and Crew Bid.
      </p>
      <p className="text-xs text-muted-foreground leading-relaxed mb-4">
        While a scenario is <strong>Running</strong> or <strong>Published</strong> the dialog opens
        read-only: you can review every parameter but cannot change them.
      </p>

      <HelpH2>Reviewing results</HelpH2>
      <p className="text-xs text-muted-foreground leading-relaxed mb-4">
        When a run reaches <strong>Done</strong>, the detail panel shows a tab rail with{' '}
        <strong>KPI</strong>, <strong>Credit Hours</strong>, <strong>Uncovered</strong>,{' '}
        <strong>Distribution</strong>, and <strong>Versions</strong>. KPI cards summarise the key
        metrics; the other tabs break down per-crew credit, uncovered demand, daily distribution,
        and the archived version history.
      </p>

      <HelpH2>Typical workflow</HelpH2>
      <p className="text-xs text-muted-foreground leading-relaxed mb-4">
        Create a scenario → set the roster period and required fields (rule set, pairing scenario)
        → set scope filters → run the optimization → review the KPI / Credit Hours / Uncovered /
        Distribution results → adjust and re-run if needed → publish selected assignments to the
        live roster.
      </p>

      <HelpH2>Gantt selection</HelpH2>
      <p className="text-xs text-muted-foreground leading-relaxed">
        In the Scenario Gantt (Roster, Pairing, and Flight panes), press on empty canvas space and
        drag a box to select every block the box touches — the same drag-box multi-select as Live.
        Hold <kbd>Ctrl</kbd> (<kbd>⌘</kbd> on macOS) while dragging to add to the current selection.
      </p>

      <HelpH2>Locate Flight</HelpH2>
      <p className="text-xs text-muted-foreground leading-relaxed">
        When the Flight pane is already open, right-click a roster or pairing block that has a
        flight and choose <strong>Locate Flight</strong> to float that flight’s row to the top of
        the Flight pane and select it. The menu item is hidden if the Flight pane is not in the
        layout — it does not open the pane for you.
      </p>
    </>
  )
}
