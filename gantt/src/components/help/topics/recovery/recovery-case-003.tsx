import { HelpH2, HelpNote, HelpScreenshot, HelpStep, HelpTip, HelpWarning } from '../../help-article'

export default function RecoveryCase003() {
  return (
    <>
      <HelpWarning>
        Partial - the Rule 8004 crew-fleet trigger, all three Recovery entry points, the
        roster-transfer option chain (Executable list, library-priced cost breakdown, Preview,
        Apply to draft and Save) and the full clearance (four 7M8-qualified transfers drop the
        Alert Center 8004 count to zero) are verified on the real Live UI, and fleet matching is
        enforced (unqualified crew are not listed for an 8004). The
        <strong> Standby Crew callout</strong> and <strong>Cross-base positioning</strong> options
        were not executed for this case.
      </HelpWarning>

      <HelpH2>Incident and operating objective</HelpH2>
      <p className="text-xs leading-relaxed">
        <strong>Case 3 - aircraft qualification (Rule 8004)</strong> models a fully rostered pairing
        whose flights are changed to a fleet the crew are not qualified for. The prepared pairing is
        <strong> 152227</strong> on <strong>19 September 2026</strong> at <strong>ADD</strong>:
        <strong> ET452 ADD to CAI</strong> 02:15-06:05Z and <strong>ET453 CAI to ADD</strong>
        07:20-11:05Z. It is a <strong>788</strong> pairing with a composition of two Captains and two
        First Officers. Both flights are then changed to fleet <strong>7M8</strong>, so the
        788-qualified crew no longer cover the operated fleet and Alert Center shows
        <strong> 8004/001</strong> - "Crew fleet (788) is invalid for the pairing (7M8)".
      </p>
      <HelpNote>
        The crew are the synthetic ADD / 788 pool <strong>L3001-L3010</strong> (5 CA + 5 FO), separate
        from Case 1 (J4002) and Case 2 (S21001-S21039). Pairing 152227 is rostered with
        <strong> L3001, L3002 (CA)</strong> and <strong>L3006, L3007 (FO)</strong>. The Rule 8004
        FLEET row is enabled and scoped to Base <strong>ADD</strong> and Fleet <strong>788</strong>
        for this case, so only these crew are checked and no other Live crew is affected.
      </HelpNote>

      <HelpH2>Three Recovery entry points</HelpH2>
      <HelpStep n={1}>
        From the <strong>Alert Center</strong>, tick the 8004 row for the affected crew and pairing,
        then choose <strong>Recovery selected</strong>. The row is only selectable while the Roster
        has not ended.
      </HelpStep>
      <HelpScreenshot
        src="/help/screenshots/s3-entry-alert-center-Ver1.png"
        alt="Alert Center 8004 row opening the Recovery dialog for pairing 152227"
        caption="Entry 1 - Alert Center: select the 8004 crew-fleet row, then Recovery selected. Rule 8004 and the three recovery methods are shown."
      />
      <HelpStep n={2}>
        On the <strong>Pairing</strong> pane, right-click the pairing row and choose
        <strong> Recovery</strong>. The pairing entry resolves the same 8004 alert for a crew
        assigned to that pairing.
      </HelpStep>
      <HelpScreenshot
        src="/help/screenshots/s3-entry-pairing-pane-Ver1.png"
        alt="Pairing pane right-click Recovery opening the same Rule 8004 dialog"
        caption="Entry 2 - Pairing pane right-click: Recovery opens the same Rule 8004 dialog."
      />
      <HelpStep n={3}>
        On the <strong>Roster</strong> pane, right-click the crew row and choose
        <strong> Recovery</strong>. All three entry points open the same dialog with the same
        incident, so the planner can start from whichever surface shows the disruption.
      </HelpStep>
      <HelpScreenshot
        src="/help/screenshots/s3-entry-roster-pane-Ver1.png"
        alt="Roster pane right-click Recovery opening the same Rule 8004 dialog"
        caption="Entry 3 - Roster pane right-click: the same Rule 8004 dialog and recovery methods."
      />

      <HelpH2>Recovery methods and the option list</HelpH2>
      <HelpStep n={4}>
        The dialog offers the three standard methods for an 8004 qualification alert:
        <strong> Roster transfer or exchange</strong>, <strong>Standby Crew callout</strong> and
        <strong> Cross-base positioning</strong>. Pick a method, then work the candidate list on the
        right.
      </HelpStep>
      <HelpStep n={5}>
        Use the <strong>All / Executable / Filtered / Best cost</strong> tiers to separate candidates.
        Each option row shows the target crew, whether it is the same rank and base, the roster
        stability percentage and the cost. A candidate is executable only when the rule preview
        passes for it.
      </HelpStep>
      <HelpScreenshot
        src="/help/screenshots/s3-options-executable-Ver3.png"
        alt="Roster transfer option list filtered to Executable candidates with library-priced costs"
        caption="Roster transfer / exchange: every listed candidate is 7M8-qualified — fleet mismatches are filtered out, not shown. The cheapest transfer is the BEST COST US$410.00 and ranks first; crew who already cross the guaranteed-hours floor quote more (US$430.00 and up)."
      />
      <HelpStep n={6}>
        Click a cost to open the <strong>cost breakdown</strong>. A complete roster transfer is
        priced from the configured <strong>roster-change components</strong> (Roster transfer base
        plus Roster change penalty) <strong>plus each crew's incremental guaranteed-hours pay</strong>
        - one row per crew. A receiving crew that stays under its guaranteed hours adds nothing, so
        the quote stays at <strong>US$410.00</strong>; a crew that crosses the floor adds pay and
        lifts the quote (for example US$430.00). When the fixture has no tariff for a context the
        breakdown reports <strong>Unpriced</strong> - a missing price is not a free option, and an
        unpriced candidate is never treated as the cheapest; in this fixture the exchange
        candidates are Unpriced while the complete transfers price.
      </HelpStep>
      <HelpScreenshot
        src="/help/screenshots/s3-options-cost-breakdown-Ver1.png"
        alt="Cost breakdown dialog for the selected transfer, listing four priced cost rules"
        caption="Cost breakdown - Transfer to J4003: four priced rules (roster-change base, roster-change penalty, receiving crew's incremental GH pay, source released-duty saving) totalling US$410.00."
      />
      <HelpNote>
        Fleet matching is <strong>mandatory</strong> for Rule 8004 recovery. A crew who is not
        qualified for the pairing's fleet cannot resolve the finding, so they are
        <strong> not listed</strong> at all — the option list contains only crew who can operate the
        pairing's fleet. An <strong>exchange</strong> is also dropped when the return pairing would
        move the mismatch onto the releasing crew, because a swap needs <em>both</em> directions to be
        fleet-valid. (Other recovery triggers still treat aircraft type as a soft warning.)
      </HelpNote>

      <HelpH2>Preview, Apply and Save are separate boundaries</HelpH2>
      <HelpStep n={7}>
        <strong>Preview</strong> draws the before/after rosters on the Live Gantt in memory only.
        The header confirms the roster is simulated and not saved, and no draft operation is created
        until you Apply.
      </HelpStep>
      <HelpScreenshot
        src="/help/screenshots/s3-options-preview-Ver1.png"
        alt="Live Gantt preview mode showing the before and after roster for the selected transfer"
        caption="Preview is not Apply: the Live Gantt shows both rosters and the change stays in memory until it is applied."
      />
      <HelpStep n={8}>
        Tick the executable option and choose <strong>Apply selected option</strong>. Apply writes the
        change into the unsaved Gantt draft - the source crew is released and the target crew holds
        the pairing in the draft, but nothing is committed yet.
      </HelpStep>
      <HelpStep n={9}>
        <strong>Save</strong> commits the draft. Confirm the reloaded roster keeps the intended
        coverage, then recheck Rule 8004 to see whether the qualification finding is resolved.
      </HelpStep>
      <HelpStep n={10}>
        Confirm the outcome in the <strong>Alert Center</strong> (group by <strong>Rule</strong>).
        A transfer to a crew who are qualified for the operated fleet <strong>clears</strong> the
        finding: the released crew's 8004 row disappears and no new row is raised for the incoming
        crew. Repeating the transfer for every unqualified crew on the pairing - here
        <strong> L3001 to J4003</strong>, <strong>L3002 to J4005</strong>,
        <strong> L3006 to J4024</strong> and <strong>L3007 to J4025</strong> - drops
        <strong> 8004/001</strong> from 4 to <strong>zero</strong>.
      </HelpStep>
      <HelpScreenshot
        src="/help/screenshots/s3-clear-before-alert-center-Ver1.png"
        alt="Alert Center grouped by Rule showing 8004/001 with four rows before the clearing transfers"
        caption="Before - Alert Center grouped by Rule: 8004/001 has 4 rows (L3001, L3002, L3006, L3007), each 'Crew fleet (788) is invalid for the pairing (7M8)'."
      />
      <HelpScreenshot
        src="/help/screenshots/s3-clear-after-alert-center-Ver1.png"
        alt="Alert Center grouped by Rule after the four transfers, with no 8004 group and no 8004 row"
        caption="After - the same view: 8004/001 is gone and no 8004 row remains, so the qualification finding is cleared on the real Live data."
      />
      <HelpNote>
        The 788-only crew of this fixture (for example L3003) are <strong>not offered</strong> for this
        alert at all: a transfer to an unqualified crew would only move the fleet warning onto the next
        unqualified crew, so fleet matching is enforced before the option list is built.
      </HelpNote>
      <HelpTip>
        Verify the fleet the crew are qualified for, not just that Apply was enabled. Moving the duty
        to another unqualified crew leaves the 8004 in place; only a fleet-qualified replacement clears
        the qualification finding.
      </HelpTip>
    </>
  )
}
