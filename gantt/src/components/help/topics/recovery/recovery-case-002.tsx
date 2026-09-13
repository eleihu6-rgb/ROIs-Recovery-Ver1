import { HelpH2, HelpNote, HelpScreenshot, HelpStep, HelpTip, HelpWarning } from '../../help-article'

export default function RecoveryCase002() {
  return (
    <>
      <HelpWarning>
        Partial - Case 2 is prepared for review, but it is not yet a completed Recovery execution. The
        isolated crew pool, candidate cost fixtures and crew-app agreement communication are verified.
        A real published revised ETD, FDP violation alert, regulatory extension limit and Recovery
        Preview/Apply/Save path still need final wiring before this case can be treated as an operational
        recovery run.
      </HelpWarning>

      <HelpH2>Incident and operating objective</HelpH2>
      <p className="text-xs leading-relaxed">
        <strong>S2 - Flight Delay</strong> models a published operational delay to return flight
        <strong> PI202 HKG to SIN</strong>, where the revised duty would exceed the operating crew's
        full-duty FDP. The prepared source pairing is <strong>152548</strong> on 28 September 2026:
        <strong> PI201 SIN to HKG</strong> at 06:00-10:00Z and <strong>PI202 HKG to SIN</strong> at
        11:00-15:00Z. The assigned crew are <strong>S21001 Maya Chen</strong> (CA),
        <strong> S21014 Daniel Chen</strong> (FO) and <strong>S21015 Ethan Koh</strong> (FO).
      </p>
      <HelpNote>
        The S2 crew set is synthetic SIN/B787 crew S21001-S21039. It is separate from Case 1 and does
        not reuse J4002, pairing 152056 or the ADD recovery candidates.
      </HelpNote>
      <HelpScreenshot
        src="/help/screenshots/s2-isolated-crew-pool-Ver1.png"
        alt="S2 isolated SIN B787 crew pool with source, standby and donor crews"
        caption="Prepared Case 2 crew pool: source crew, standby teams and donor crews are isolated from Case 1."
      />

      <HelpH2>Decision path for S2</HelpH2>
      <HelpStep n={1}>
        Start from the published estimate change. When the revised ETD is received, recalculate the full
        duty from report through debrief for every crew member on PI201/PI202. Do not substitute a 1001
        assignment-overlap alert for this case; S2 requires a genuine delay-to-FDP legality trigger.
      </HelpStep>
      <HelpStep n={2}>
        Build the option set from feasible actions only: <strong>Discretion (FDP extension)</strong>,
        <strong> Standby Replacement</strong>, <strong>Swap / Move-up</strong> and
        <strong> Flight Cancellation</strong>. Keep eligibility, legality and pricing separate so a cheap
        but illegal option cannot become the recommended answer.
      </HelpStep>
      <HelpStep n={3}>
        Rank by direct cost, roster stability, reserve consumption and passenger disruption. For this
        prepared fixture, the cost fixtures already provide six selectable standby teams and six donor
        teams with distinct GH outcomes, but the commercial cancellation and passenger costs are still
        external inputs.
      </HelpStep>

      <HelpH2>Option 1 - Discretion agreement communication</HelpH2>
      <HelpStep n={4}>
        In the controller UI, open the source duty, choose <strong>Request FDP agreement</strong>, enter
        requested extension minutes, deadline and reason, then send the request. The server sends one
        immutable proposal to every assigned recipient.
      </HelpStep>
      <HelpScreenshot
        src="/help/screenshots/s2-consent-controller-feedback-Ver1.png"
        alt="Controller feedback showing one Yes, one No and one Pending crew response"
        caption="Controller feedback after crew replies: Yes, No and Pending states are visible without applying a roster draft."
      />
      <HelpStep n={5}>
        In the Crew App, each assigned crew member opens Alerts, reviews the before/proposed duty
        windows, requested extension, reason and deadline, then replies <strong>Yes</strong> or
        <strong>No</strong>. One No, no reply, expiry or changed operating snapshot prevents reuse of that
        consent group.
      </HelpStep>
      <HelpScreenshot
        src="/help/screenshots/s2-consent-mobile-request-Ver1.png"
        alt="Crew App discretion request showing before and proposed FDP details"
        caption="Crew view of the FDP agreement request. The crew response records actor, time and immutable proposal details."
      />
      <HelpStep n={6}>
        When all assigned crew accept, the controller sees all Yes and can return to controller review.
        This closes the agreement review loop only; it does not write a regulatory override or change
        the roster.
      </HelpStep>
      <HelpScreenshot
        src="/help/screenshots/s2-consent-controller-unanimous-Ver1.png"
        alt="Controller feedback showing all assigned crew accepted the discretion request"
        caption="All-Yes communication proof. The current implementation deliberately keeps execution separate from consent."
      />

      <HelpH2>Option 2 - Standby replacement candidates</HelpH2>
      <HelpStep n={7}>
        Six SIN standby teams are prepared for 28 September, each with one CA and two FOs. Compare the
        team cost, remaining reserve depth and downstream legality before selecting one. These are the
        saved captain GH estimates from the current cost function.
      </HelpStep>
      <div className="overflow-x-auto">
        <table className="w-full text-xs" data-testid="s2-standby-costs">
          <thead>
            <tr>
              <th className="text-left">Team</th>
              <th className="text-left">Crew</th>
              <th className="text-right">Estimated GH cost USD</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>1</td><td>S21002, S21016, S21017</td><td className="text-right">300</td></tr>
            <tr><td>2</td><td>S21003, S21018, S21019</td><td className="text-right">420</td></tr>
            <tr><td>3</td><td>S21004, S21020, S21021</td><td className="text-right">540</td></tr>
            <tr><td>4</td><td>S21005, S21022, S21023</td><td className="text-right">675</td></tr>
            <tr><td>5</td><td>S21006, S21024, S21025</td><td className="text-right">825</td></tr>
            <tr><td>6</td><td>S21007, S21026, S21027</td><td className="text-right">855</td></tr>
          </tbody>
        </table>
      </div>

      <HelpH2>Option 3 - Swap / move-up candidates</HelpH2>
      <HelpStep n={8}>
        Six donor teams are prepared on separate SIN-DXB-SIN rotations. A valid swap must preserve
        physical location, coverage, qualification, FDP, rest and the donor pairing after both sides move.
        The fixture currently records cost variety; it does not yet prove that all six are legal S2 swaps.
      </HelpStep>
      <div className="overflow-x-auto">
        <table className="w-full text-xs" data-testid="s2-swap-costs">
          <thead>
            <tr>
              <th className="text-left">Team</th>
              <th className="text-left">Donor pairing</th>
              <th className="text-left">Crew</th>
              <th className="text-right">Both-CA GH delta USD</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>1</td><td>152569</td><td>S21008, S21028, S21029</td><td className="text-right">-240</td></tr>
            <tr><td>2</td><td>152590</td><td>S21009, S21030, S21031</td><td className="text-right">-300</td></tr>
            <tr><td>3</td><td>152611</td><td>S21010, S21032, S21033</td><td className="text-right">-360</td></tr>
            <tr><td>4</td><td>152632</td><td>S21011, S21034, S21035</td><td className="text-right">-420</td></tr>
            <tr><td>5</td><td>152653</td><td>S21012, S21036, S21037</td><td className="text-right">-480</td></tr>
            <tr><td>6</td><td>152674</td><td>S21013, S21038, S21039</td><td className="text-right">-540</td></tr>
          </tbody>
        </table>
      </div>

      <HelpH2>Option 4 - Cancellation</HelpH2>
      <HelpStep n={9}>
        Cancellation is the fallback when no legal operating solution remains. It protects crew legality
        but creates passenger reaccommodation, aircraft, slot and commercial disruption. Treat it as
        priced only after passenger and downstream schedule inputs are available.
      </HelpStep>

      <HelpH2>What still blocks completion</HelpH2>
      <HelpStep n={10}>
        Before Case 2 becomes a finished recovery demo, confirm the approved FDP rule instances and
        extension limits, wire the published-delay trigger into the shared Recovery framework, generate
        only legally executable choices, then prove Preview, Apply, Save, reload and rule recheck on the
        real Live UI.
      </HelpStep>
      <HelpTip>
        The crew agreement loop should remain separate from legal execution. Consent is required for a
        discretion path, but consent alone never makes an over-limit FDP legal.
      </HelpTip>
    </>
  )
}
