import {
  HelpFieldTable,
  HelpH2,
  HelpList,
  HelpNote,
  HelpOutcome,
  HelpParagraph,
  HelpStep,
} from "@/features/help/components/help-article";

export default function DashboardCalendar() {
  return (
    <>
      <HelpH2>Read BIDDING CALENDAR</HelpH2>
      <HelpStep n={1}>
        Confirm the month label and weekday headings above the calendar grid.
      </HelpStep>
      <HelpStep n={2}>
        Read the <strong>T1-T7</strong> rows. The highlighted row is the active Tier context shared with Current Bid.
      </HelpStep>
      <HelpStep n={3}>
        Review colored entries inside the date cells. They summarize saved Current Bid activity for the displayed month.
      </HelpStep>
      <HelpStep n={4}>
        Read the small calendar metric badges at the bottom of each date cell, such as <strong>DO 23/33</strong>{" "}
        and <strong>RES 12/33</strong>.
      </HelpStep>
      <HelpFieldTable title="Calendar areas" items={[
        { label: "Month label", details: "The bid-period month displayed by the calendar." },
        { label: "T1-T7", details: "Tier rows used to select the Current Bid view." },
        { label: "Date cells", details: "Calendar dates for the displayed month." },
        { label: "Colored entries", details: "Saved bid activity associated with a date or date span." },
        { label: "DO 23/33", details: "Requested Days Off crew count / maximum crew who can request Days Off for that date." },
        { label: "RES 12/33", details: "Reserve positions needed / available off slots for reserve coverage on that date." },
      ]} />
      <HelpH2>Days Off capacity badge</HelpH2>
      <HelpFieldTable title="requested / max" items={[
        { label: "Requested", details: "The number of unique crew with a Prefer Off or Days Off request on that date. If the same crew requests the same date in multiple Tiers, that crew counts once." },
        { label: "Max", details: "The date's maximum Days Off capacity: total active crew minus pairing demand, reserve demand, and pre-assigned days off." },
        { label: "Green", details: "Requested is below max." },
        { label: "Yellow", details: "Requested equals max." },
        { label: "Red", details: "Requested is above max." },
      ]} />
      <HelpH2>Reserve coverage badge</HelpH2>
      <HelpParagraph>
        When Reserve coverage data is available, the shared calendar can show{" "}
        <strong>RES need/off</strong> together with the Days Off capacity badge. For example, <strong>RES 12/33</strong> means 12 reserve positions are needed
        and 33 off slots are available for reserve coverage on that date.
      </HelpParagraph>
      <HelpH2>Color meaning</HelpH2>
      <HelpList items={[
        "Green entries show Days Off or Prefer Off activity.",
        "Blue entries show Pairing activity.",
        "Yellow entries show warning or special status activity when returned by the calendar data.",
      ]} />
      <HelpOutcome>
        Use the calendar as a visual check, then use the matching bidding page for changes.
      </HelpOutcome>
      <HelpNote>
        The capacity badge is informational. Use Bid to add or edit Current Bid conditions; Dashboard only helps you
        confirm the displayed month and activity.
      </HelpNote>
    </>
  );
}
