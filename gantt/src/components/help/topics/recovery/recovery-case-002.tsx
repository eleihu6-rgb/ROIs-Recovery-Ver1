import { HelpH2, HelpNote, HelpScreenshot, HelpStep, HelpTip, HelpWarning } from '../../help-article'

export default function RecoveryCase002() {
  return (
    <>
      <HelpWarning>
        Partial - the ET published-delay incident, its Rule 3007 Alert Center rows and the Recovery
        entry points are verified on the real Live UI, and the dialog lists the FDP Discretion,
        Standby Crew callout and Swap duty options. Recovery is <strong>not</strong> complete: the
        FDP Discretion option is communication only (Apply stays disabled), the Flight Delay group
        offers no candidate for a published-delay trigger, and no Apply, Save or rule recheck has
        been demonstrated for this case.
      </HelpWarning>

      <HelpH2>Incident and operating objective</HelpH2>
      <p className="text-xs leading-relaxed">
        <strong>Case 2 - S2 published flight delay at ADD.</strong> The prepared pairing is
        <strong> 152675</strong> at <strong>ADD</strong> on <strong>29-30 September 2026</strong>:
        <strong> ET2681 ADD to DXB</strong> and <strong>ET2682 DXB to ADD</strong> on the first
        duty, then <strong>ET2683 ADD to JNB</strong> and <strong>ET2684 JNB to ADD</strong> on the
        second duty. It is a <strong>B787</strong> pairing with 2 duties and 4 segments. The
        assigned crew are <strong>T2001</strong> (CA), <strong>T2021</strong> (FO) and
        <strong> T2022</strong> (FO).
      </p>
      <p className="text-xs leading-relaxed mt-2">
        ET2681 departs later than scheduled, so the first duty is stretched and the operating crew
        would fly beyond the flight-duty-period limit. Live raises <strong>Rule 3007</strong> for
        every assigned crew on the pairing, and Recovery opens so the planner can review the FDP
        impact and the available answers.
      </p>
      <HelpNote>
        This is the ET / ADD case. It is separate from Case 1 (crew J4002, pairing 152056) and
        Case 3 (crew L3001-L3010, pairing 152227), and it replaces the earlier synthetic SIN /
        HKG narrative. The revised departure is prepared fixture data in the SIT database, not a
        rule-engine output.
      </HelpNote>

      <HelpH2>Entry points</HelpH2>
      <HelpStep n={1}>
        From the <strong>Alert Center</strong>, the delay appears as three
        <strong> 3007</strong> rows - one per assigned crew (T2001, T2021, T2022) - each reading
        "Published delay: actual departure is later than scheduled; open Recovery preparation to
        review FDP impact and request crew agreement (FDP Discretion)". Tick the crew rows and
        choose <strong>Recovery selected</strong>.
      </HelpStep>
      <HelpScreenshot
        src="/help/screenshots/s2-et-entry-alert-center-Ver1.png"
        alt="Alert Center showing three Rule 3007 published-delay rows for T2001, T2021 and T2022"
        caption="Entry 1 - Alert Center: the ET2681 published delay is three 3007 rows (T2001, T2021, T2022), grouped here by Severity. Tick the rows, then Recovery selected."
      />
      <HelpStep n={2}>
        You can also open the same dialog from the <strong>Pairing</strong> pane or the
        <strong> Roster</strong> pane: right-click the affected pairing or duty bar and choose
        <strong> Recovery</strong>. The pairing entry resolves the same published-delay alert, so
        the planner can start from the surface that already shows the disruption.
      </HelpStep>
      <HelpStep n={3}>
        The dialog header names the incident - <strong>Rule 3007 &middot; ET2681 &middot;
        2026-09-29</strong> - with <strong>3 Crew &middot; 1 Roster</strong> and the banner
        "Published delay: actual departure later than scheduled; open Recovery preparation for FDP
        impact review". Nothing is written until an option is applied.
      </HelpStep>

      <HelpH2>Recovery methods</HelpH2>
      <HelpStep n={4}>
        Use the <strong>Recovery methods</strong> rail to pick a strategy; each entry shows how many
        options it holds. For this case the loaded data offers <strong>FDP Discretion</strong> (1),
        <strong> Standby Crew callout</strong> (4), <strong>Swap duty</strong> (3) and
        <strong> Flight Delay</strong> (0). Counts follow the loaded data, so available and filtered
        totals move with the roster window in view.
      </HelpStep>

      <HelpH2>Option 1 - FDP Discretion</HelpH2>
      <HelpStep n={5}>
        The only FDP Discretion option is <strong>Execute with Crew T2001</strong>
        (<em>Crew consent</em>, same rank and base), and this is
        <strong> communication only</strong>: the dialog states "Crew agreement communication
        only; Apply remains disabled until independent FDP legality execution is implemented". A
        <strong> Request FDP discretion</strong> (or <strong>Resend</strong>) action sits in the
        option's ACTIONS cell, <strong>before the Preview icon</strong>, and the row carries the
        live communication status: <em>Not sent yet</em>, <em>Sent · waiting for crew</em>,
        <em> Sent · n of m replied</em>, <em>Crew accepted</em>, <em>Crew rejected</em>,
        <em> Expired · no reply</em> or <em>Duty changed · request again</em>. The action is offered
        only when an authoritative report, release and FDP exist for this crew, so a crew who
        cannot extend the FDP is never asked.
      </HelpStep>
      <HelpScreenshot
        src="/help/screenshots/s2-et-recovery-fdp-discretion-Ver2.png"
        alt="FDP Discretion option with the request action before Preview and the live consent status chip"
        caption="FDP Discretion - the request action sits before Preview, the status chip reads the live consent state (here Crew rejected for T2001) and Apply stays disabled until independent FDP legality execution is wired."
      />
      <HelpStep n={6}>
        Choosing the action opens the request dialog - extension minutes, reply deadline (UTC) and a
        reason for the crew. Each assigned crew member then opens <strong>Alerts</strong> - or
        Home, Quick actions, <strong>Discretion</strong> - in the <strong>Crew App</strong>,
        reviews the before/proposed duty windows and replies <strong>Yes</strong> or
        <strong> No</strong>. One No, an unanswered request, an expiry or a changed operating
        snapshot blocks consent, and a resend supersedes the previous request. After a rejection
        the dialog marks <strong>Standby Crew callout</strong> as <em>Recommended next</em> and the
        FDP row links straight to it. The same request is also available from the Edit Duty Node
        dialog's <strong>Request FDP agreement</strong> button.
      </HelpStep>

      <HelpH2>Option 2 - Standby Crew callout</HelpH2>
      <HelpStep n={7}>
        Standby teams are ADD B787 crews already on airport standby for the duty window
        (SBY 29 September 00:00-08:00Z). The original SBY is retained and the chosen team's SBY is
        marked <em>Callout</em> in the preview. Each team is one Captain plus two First Officers,
        and the same rank / same base line confirms the seat match. Costs are the saved
        calendar-month guaranteed-hours (GH) deltas, so a crew already below the guarantee can
        price at US$0.00.
      </HelpStep>
      <div className="overflow-x-auto">
        <table className="w-full text-xs" data-testid="s2-standby-costs">
          <thead>
            <tr>
              <th className="text-left">Team</th>
              <th className="text-left">First Officers</th>
              <th className="text-right">GH credit before to after</th>
              <th className="text-right">Estimated GH cost USD</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>T2002</td><td>T2023, T2024</td><td className="text-right">55:30 to 71:00</td><td className="text-right">0.00</td></tr>
            <tr><td>T2003</td><td>T2025, T2026</td><td className="text-right">71:30 to 87:00</td><td className="text-right">240.00</td></tr>
            <tr><td>T2004</td><td>T2027, T2028</td><td className="text-right">75:00 to 90:30</td><td className="text-right">675.00</td></tr>
            <tr><td>T2005</td><td>T2029, T2030</td><td className="text-right">79:30 to 95:00</td><td className="text-right">1,350.00</td></tr>
          </tbody>
        </table>
      </div>
      <HelpNote>
        The fixture prepares six standby teams (T2002-T2007); the loaded run shows four as
        Executable and two as Filtered, so only the four selectable teams are listed above. An
        option is Executable only when the rule preview passes for it - open
        <strong> All / Executable / Filtered</strong> to see the excluded teams and their reasons.
      </HelpNote>
      <HelpScreenshot
        src="/help/screenshots/s2-et-recovery-standby-Ver2.png"
        alt="Standby Crew callout option list for the ET2681 published delay with GH costs per team"
        caption="Standby Crew callout - after a rejected FDP extension the group is marked Recommended next, with a distinct GH cost per team and the retained SBY window."
      />

      <HelpH2>Option 3 - Swap duty</HelpH2>
      <HelpStep n={8}>
        Swap duty exchanges the affected pairing with a crew whose pairing reports later, and the
        list is ranked by cost and stability. In the loaded run the executable candidate is
        <strong> J4021</strong> (rank adjustment, same base, 115-minute start gap); the cross-base
        candidates <strong>K1014</strong> and <strong>K1015</strong> are <em>Blocked</em>. Every
        swap candidate is currently <strong>Unpriced</strong>, so compare them on the rest of the
        line - crew, base, start gap, stability and warnings - not on cost alone.
      </HelpStep>
      <HelpScreenshot
        src="/help/screenshots/s2-et-recovery-swap-duty-Ver1.png"
        alt="Swap duty options for the ET2681 published delay, showing an executable and two blocked candidates"
        caption="Swap duty - J4021 is Executable; K1014 and K1015 are Blocked. All three are Unpriced, and the fleet-mismatch warnings are shown rather than hidden."
      />
      <HelpNote>
        Fleet is a <strong>soft constraint</strong>. A swap can still be Executable while the
        orange warning records that the incoming crew is not qualified for the receiving aircraft
        (here J4021 is not B787-qualified and T2001 is not 7M8-qualified). Read the warning before
        choosing the option.
      </HelpNote>

      <HelpH2>Option 4 - Flight Delay</HelpH2>
      <HelpStep n={9}>
        The Flight Delay strategy keeps the original crew and moves the affected flights. For a
        <strong> published-delay</strong> incident the group is empty - the delay has already been
        published, so there is nothing further to shift. The panel reports
        <em> "No executable candidates in the current loaded data range"</em> and Best cost shows
        a dash. Treat an empty group as "no answer here", never as a free or zero-cost recovery.
      </HelpStep>
      <HelpScreenshot
        src="/help/screenshots/s2-et-recovery-flight-delay-Ver1.png"
        alt="Flight Delay group showing zero options for the published-delay case"
        caption="Flight Delay - 0 options for a published-delay trigger, so this strategy cannot resolve Case 2."
      />

      <HelpH2>What still blocks completion</HelpH2>
      <HelpStep n={10}>
        Before Case 2 can be treated as a finished recovery, three things must land: an executor for
        the FDP discretion path (today the option communicates but Apply is disabled), a genuine
        end-to-end run of the chosen answer through Preview, Apply, Save and rule recheck, and a
        priced comparison in a single currency. Until then the Alert Center
        <strong> 3007</strong> rows stay open for T2001, T2021 and T2022.
      </HelpStep>
      <HelpTip>
        Crew agreement never makes an over-limit FDP legal. Consent is one input to a discretion
        decision; the independent legality execution still has to pass for the recovery to be
        defensible.
      </HelpTip>
    </>
  )
}
