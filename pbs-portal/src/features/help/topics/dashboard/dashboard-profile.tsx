import {
  HelpControlsRef,
  HelpFieldTable,
  HelpH2,
  HelpList,
  HelpNote,
  HelpParagraph,
  HelpStep,
} from "@/features/help/components/help-article";

export default function DashboardProfile() {
  return (
    <>
      <HelpH2>What to verify first</HelpH2>
      <HelpStep n={1}>
        Review the avatar, name, and email at the top of the left panel to confirm the active Portal user.
      </HelpStep>
      <HelpStep n={2}>
        In <strong>BID INFORMATION-LOCAL TIME</strong>, confirm the bid window before editing Current Bid.
      </HelpStep>
      <HelpStep n={3}>
        In <strong>REMAINING</strong>, review the coarse time left for bidding. Open periods show days and hours, not
        minutes; closed periods show <strong>Closed</strong>.
      </HelpStep>
      <HelpStep n={4}>
        In <strong>USER INFORMATION</strong>, confirm base, fleet, position, and other profile fields that
        can explain why available bids or pairing results differ by user.
      </HelpStep>
      <HelpH2>BID INFORMATION-LOCAL TIME</HelpH2>
      <HelpParagraph>
        These times are shown in the local time for the crew's base when that timezone is available.
      </HelpParagraph>
      <HelpFieldTable title="Bid window fields" items={[
        { label: "BID START", details: "The date and time when the current bid window opens for editing." },
        { label: "BID END", details: "The date and time when the current bid window closes. A closed window is read-only." },
        { label: "REMAINING", details: "A coarse countdown to BID END. It intentionally removes minutes, so users do not expect a live second-by-second timer." },
      ]} />
      <HelpH2>USER INFORMATION</HelpH2>
      <HelpFieldTable title="Profile fields" items={[
        { label: "BASE", details: "The crew base used for the Portal view and base-local date/time labels." },
        { label: "FLEET", details: "The active fleet values returned for this crew. Multiple values appear on separate lines." },
        { label: "POSITION", details: "The crew position or rank value returned by the profile data, such as IFD." },
        { label: "SENIORITY", details: "The crew seniority number from the profile source. The Portal displays the source value and does not reinterpret the ranking direction." },
        { label: "LANGUAGE", details: "Valid language qualifications returned for the crew. A dash means no language value was returned." },
        { label: "EXISTING CREDIT", details: "The existing credit value from the current roster period's manday summary for this crew. It is informational profile data, not a value calculated from newly edited bids." },
        { label: "TRAINING MONTH", details: "The training-month value when the profile source returns one. A dash means no value was returned." },
        { label: "LAST LOGIN", details: "The last Portal login time, formatted in the crew base timezone when available; otherwise the system falls back to UTC." },
      ]} />
      <HelpH2>When to check it</HelpH2>
      <HelpList items={[
        "Before adding bids, confirm you are logged in as the expected crew member.",
        "Before comparing results with another user, compare base, fleet, and rank fields.",
        "Before reporting missing options, confirm the visible bid period is the period you intended to work in.",
      ]} />
      <HelpNote>
        The Dashboard profile panel is read-only. If the identity or bid-period context is wrong, do not continue editing
        the draft until the session or profile data is corrected.
      </HelpNote>
      <HelpControlsRef items={[
        { name: "User profile", description: "Shows the active portal user and crew identity." },
        { name: "BID INFORMATION-LOCAL TIME", description: "Shows the editable bid window in local time." },
        { name: "User information", description: "Shows profile fields that can affect eligibility and available bid behavior." },
      ]} />
    </>
  );
}
