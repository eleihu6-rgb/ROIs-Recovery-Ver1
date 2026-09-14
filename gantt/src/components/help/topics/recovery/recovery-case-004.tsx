import { HelpH2, HelpNote, HelpStep, HelpTip, HelpWarning, HelpScreenshot } from '../../help-article'

export default function RecoveryCase004() {
  return (
    <>
      <HelpWarning>
        Case 4 covers an unpaired flight or an open/partially staffed pairing. Pairing construction and
        crew staffing are separate actions. Only unpaired flights are used to build a rotation; existing pairings are not reshaped.
      </HelpWarning>

      <HelpNote>
        On Dashboard, Case 4 is listed under Disruption Cases as <strong>Ad hoc new flight</strong>.
        Choose <strong>Open in Live</strong> to locate the prepared ET895 flight on 17 September.
        In <strong>Shift Handover</strong>, select Case 4 when adding a note for the next shift.
      </HelpNote>
      <HelpH2>Build a pairing from an unpaired flight</HelpH2>
      <HelpStep n={1}>
        Right-click an unpaired flight, choose <strong>Recovery</strong>, then <strong>Pairing Options</strong>. Review the
        anchor flight, date range, base, fleet and crew composition, then choose <strong>Search Pairing Options</strong>.
      </HelpStep>
      <HelpStep n={2}>
        Select a route that includes the anchor flight and returns to the selected base. Choose
        <strong> Build pairing (Save)</strong>. Building is an immediate save of the pairing; it is not
        a draft roster operation. The saved pairing is brought to the top of the Pairing pane after creation.
      </HelpStep>
      <HelpNote>
        The Rotation timeline uses an independent time scale per duty so flight labels stay readable across
        long layovers. Ground intervals and rest are shown separately, not drawn to scale. If the search
        limit is reached, the displayed options are not exhaustive; narrow From/To and search again.
      </HelpNote>
      <HelpNote>
        If the new row is not visible after the build, the pairing is still saved. Refresh or reopen the Pairing
        pane before trying again; do not build a duplicate route.
      </HelpNote>

      <HelpScreenshot src="/help/screenshots/recovery-case4-pairing-options-Ver2.png" alt="Recovery Pairing Options showing ET895 and ET894 with a base-return chart" caption="Compare competing routes and the selected rotation’s timeline before Build pairing (Save)." />
      <HelpH2>Staff an open or partially staffed pairing</HelpH2>
      <HelpStep n={3}>
        Close Recovery without assigning crew if needed: the pairing remains saved. Right-click that open or partially staffed pairing and choose <strong>Recovery — open seats</strong> to resume directly at roster options. Recovery shows the pairing’s remaining
        required rank seats and preserves existing assignments. Solutions are detected automatically for the first <strong>Open rank</strong> when Recovery opens
        or a pairing is built. Changing the rank automatically refreshes the solutions. Fill missing seats only; do not overfill the composition.
      </HelpStep>
      <HelpStep n={4}>
        The common recovery methods are <strong>Standby Crew</strong>, <strong>Available Crew</strong> and
        <strong> Move-up / Roster Transfer</strong>. Standby is a common approach across Cases 1–4: it is
        offered only when the loaded crew has a qualifying overlapping standby task. Available Crew adds
        the pairing without removing another pairing.
      </HelpStep>
      <HelpTip>
        The left panel offers <strong>By strategy</strong> and <strong>By cost tier</strong>, just like Cases 1–3.
        Cost tiers group each method by its cheapest priced executable candidate; choosing a method there
        keeps its full candidate list, including higher-cost alternatives. The star marks the cheapest method.
        Unpriced candidates are excluded, and different currencies are not compared.
      </HelpTip>
      <HelpScreenshot src="/help/screenshots/recovery-case4-cost-tiers-Ver2.png" alt="Case 4 Recovery showing shared By strategy and By cost tier navigation" caption="Select a method by its lowest executable cost; all of that method’s candidates remain available for comparison." />
      <HelpStep n={5}>
        Move-up / Roster Transfer removes only the selected crew’s actual donor pairing before adding the
        open pairing. A donor vacancy remains a prominent <strong>Partial</strong> recovery warning; staffing
        the target pairing does not clear that donor vacancy.
      </HelpStep>
      <HelpTip>
        Candidate generation uses the loaded Live crew and roster scope. Rank, base, fleet and division
        must match. A missing candidate can mean the crew is not loaded or is not eligible for this pairing.
      </HelpTip>

      <HelpScreenshot src="/help/screenshots/recovery-case4-standby-cost-Ver3.png" alt="Standby crew cost breakdown with incremental guarantee-hours pay" caption="Standby uses the existing Cost Library. This example crosses a GH pay tier; prices come from saved roster credit, not a special Case 4 tariff." />
      <HelpNote>
        The prepared Captain standby pool has seven executable candidates, including zero-cost options
        and options crossing the GH guarantee or a higher pay tier. These estimates come from real saved
        roster duties and recomputed calendar-month credit—not manually entered manday totals. Future
        saved duties are planned credit, not already-flown hours. Refresh Live and find roster options again
        after roster changes to compare current estimates.
      </HelpNote>
      <HelpH2>Preview and save</HelpH2>
      <HelpStep n={6}>
        All three strategies use the same option table as Cases 1–3: <strong>All</strong>, <strong>Executable</strong> and <strong>Filtered</strong> tabs, crew information, Cancel / Add / Stability / Cost columns, and row-level <strong>Preview</strong> and <strong>Detail</strong> actions. Click a cost to open its <strong>Cost breakdown</strong>; Detail shows the before / after roster changes. Use <strong>Preview</strong> to
        run the authoritative legality check and compare the before and after roster. Preview does not save
        the roster.
      </HelpStep>
      <HelpStep n={7}>
        When the preview passes, choose <strong>Apply</strong> to add the operations to the draft, then use
        the main Gantt <strong>Save</strong> action to commit them. A target remains Partial until every
        required seat is covered; a move-up with a donor vacancy remains Partial overall.
      </HelpStep>
      <HelpScreenshot src="/help/screenshots/recovery-case4-moveup-preview-Ver2.png" alt="Recovery Preview with before and after roster and donor vacancy warning" caption="Move-up can staff the target but leaves overall recovery Partial until the donor vacancy is resolved." />
      <HelpNote>
        Cost estimates use saved duty and calendar-month credit where available. Missing pricing inputs are
        shown as <strong>Unpriced</strong>, not zero. Legality approval, cost pricing and crew acceptance are
        separate decisions.
      </HelpNote>
    </>
  )
}
