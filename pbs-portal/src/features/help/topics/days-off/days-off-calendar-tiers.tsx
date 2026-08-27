import {
  HelpControlsRef,
  HelpFieldTable,
  HelpH2,
  HelpList,
  HelpNote,
  HelpOutcome,
  HelpStep,
} from "@/features/help/components/help-article";

export default function DaysOffCalendarTiers() {
  return (
    <>
      <HelpH2>Calendar and tier context</HelpH2>
      <HelpStep n={1}>
        Select the tier context you want to work with. The Portal uses <strong>T1-T7</strong> throughout the workbench.
      </HelpStep>
      <HelpStep n={2}>
        Use the Dashboard or shared calendar to review existing days-off and pairing activity before adding a new
        date-based bid.
      </HelpStep>
      <HelpStep n={3}>
        If a date or weekday action popover is available, choose the date or weekday, confirm the active tier, then save
        the days-off action.
      </HelpStep>
      <HelpStep n={4}>
        Return to <strong>EXISTING DAYS OFF PROPERTIES</strong> to verify that the created row has the expected{" "}
        <strong>TIERS</strong>.
      </HelpStep>
      <HelpFieldTable title="Tier behavior" items={[
        { label: "Active calendar tier", details: "The tier highlighted in the calendar matrix. Date actions default to this context when supported." },
        { label: "Dialog TIERS", details: "The explicit T1-T7 selection saved on the Days Off bid." },
        { label: "Existing row TIERS", details: "The saved tier state visible after a successful add or update." },
      ]} />
      <HelpH2>What to check for conflicts</HelpH2>
      <HelpList items={[
        "Look for dates that already show pairing activity before adding Prefer Off or other date bids.",
        "Use the DO requested/max capacity badge, such as DO 23/33, to understand how many crew have requested Days Off compared with the date's current maximum.",
        "If RES need/off is also shown, such as RES 12/33, read it as reserve positions needed compared with available off slots for that same date.",
        "Requested is a crew count, not your personal bid count; the same crew is counted once per date even if multiple Tiers include that date.",
        "Check whether the same date is already covered by another Days Off bid in the same tier.",
        "After saving, verify the Bid workspace and Dashboard calendar if the date affects a critical tier.",
      ]} />
      <HelpOutcome>
        When a Days Off action creates or updates a bid, the calendar and Bid review reload from the latest draft data.
      </HelpOutcome>
      <HelpNote>
        Green capacity means requests are below the maximum, yellow means requests equal the maximum, and red means
        requests exceed the maximum. The color is a planning signal, not an Award guarantee.
      </HelpNote>
      <HelpControlsRef items={[
        { name: "T1-T7", description: "Tier selection range available in the Portal." },
        { name: "BIDDING CALENDAR", description: "Shared calendar context for days-off and pairing activity." },
        { name: "TIERS", description: "Column and dialog control that shows which tiers the bid applies to." },
      ]} />
    </>
  );
}
