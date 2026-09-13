import { HelpH2, HelpNote, HelpScreenshot, HelpStep, HelpTip, HelpWarning } from '../../help-article'

export default function RecoveryCase003() {
  return (
    <>
      <HelpWarning>
        Partial - the Rule 8004 crew-fleet trigger, all three Recovery entry points and the
        roster-transfer option chain (Executable list, cost breakdown, Preview, Apply to draft and
        Save) are verified on the real Live UI. A transfer to a 788-only candidate does not clear
        the 8004 warning, because fleet is a soft constraint; a fully clearing replacement is not
        yet demonstrated, and the Standby / Cross-base options were not executed.
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
        src="/help/screenshots/s3-options-executable-Ver1.png"
        alt="Roster transfer option list filtered to Executable candidates"
        caption="Roster transfer / exchange: candidate L3003 (same rank, same base) is Executable. Cost is Unpriced because no cost-library entry exists for an ADD transfer."
      />
      <HelpStep n={6}>
        Click a cost to open the <strong>cost breakdown</strong>. When the fixture has no tariff for
        the context the breakdown reports <strong>Unpriced</strong> - a missing price is not a free
        option, and an unpriced candidate is never treated as the cheapest.
      </HelpStep>
      <HelpNote>
        Fleet is a <strong>soft constraint</strong> for qualification recovery. A candidate that
        would receive a fleet it is not qualified for still appears as Executable with a
        <strong> Fleet mismatch (8004)</strong> warning, so the planner sees the trade-off instead of
        losing the option.
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
        With a 788-only candidate the 8004 <strong>remains</strong> after Save: the transfer moves the
        duty to another crew who are equally unqualified for the 7M8 fleet, and the fleet warning
        simply follows the pairing. Clearing the finding needs a candidate who is qualified for the
        fleet actually operated, or a change to the flight fleet itself.
      </HelpStep>
      <HelpTip>
        Verify the fleet the crew are qualified for, not just that Apply was enabled. A successful
        Save with a remaining 8004 is a legitimate soft-constraint outcome, but it is not a cleared
        qualification finding.
      </HelpTip>
    </>
  )
}
