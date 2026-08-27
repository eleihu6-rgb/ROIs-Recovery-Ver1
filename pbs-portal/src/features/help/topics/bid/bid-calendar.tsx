import {
  HelpFieldTable,
  HelpH2,
  HelpList,
  HelpNote,
  HelpOutcome,
  HelpParagraph,
  HelpScreenshot,
  HelpStep,
} from "@/features/help/components/help-article";

export default function BidCalendar() {
  return (
    <>
      <HelpScreenshot
        src="/help/screenshots/bid-calendar.png"
        alt="BIDDING CALENDAR with current-period status, month, T1-T7, saved bid activity, days-off capacity, and collapse control"
        caption="The BIDDING CALENDAR shows the active period, month, Tier context, saved bid activity, days-off capacity, and the control used to collapse the panel."
      />
      <HelpH2>What BIDDING CALENDAR is for</HelpH2>
      <HelpParagraph>
        The calendar is the shared month view beside Bid. It shows saved activity by date and keeps the
        active Tier context visible while you work.
      </HelpParagraph>
      <HelpFieldTable title="Calendar areas" items={[
        { label: "Current period", details: "Shows whether the active bid period is open and how much time remains." },
        { label: "Month", details: "The bid-period month displayed in the date grid." },
        { label: "T1-T7", details: "Selects the active Current Bid Tier. The heatmap cells summarize activity by date." },
        { label: "Date grid", details: "Shows calendar dates and the saved bid entries associated with them." },
        { label: "Calendar metric badges", details: "Shows planning metrics at the bottom of a date cell. A date can show both DO 23/33 and RES 12/33 when both data sets are available." },
        { label: "Collapse / Expand", details: "Hides or restores the left calendar. Portal remembers this choice in the browser." },
      ]} />

      <HelpH2>Read Days Off capacity</HelpH2>
      <HelpParagraph>
        A badge such as <strong>DO 23/33</strong> means <strong>23</strong> crew have requested Days Off on that date,
        and <strong>33</strong> is the maximum number that can be supported for that date.
      </HelpParagraph>
      <HelpFieldTable title="Capacity calculation" items={[
        { label: "Requested", details: "Crew count for Days Off requests in the current base, division, and period. The same crew counts once per date even if they requested that date in multiple Tiers." },
        { label: "Max", details: "Total crew count minus pairing demand, reserve demand, and pre-assigned days off for that date." },
      ]} />
      <HelpList items={[
        "Green means requested is below max.",
        "Yellow means requested equals max.",
        "Red means requested is above max.",
        "The badge is guidance only. It does not replace save validation or guarantee the date will be awarded.",
      ]} />

      <HelpH2>Read Reserve coverage</HelpH2>
      <HelpParagraph>
        The shared calendar can show Reserve coverage below the Days Off capacity badge. A badge such as{" "}
        <strong>RES 12/33</strong> means the date needs <strong>12</strong> reserve positions and has <strong>33</strong>{" "}
        available off slots for reserve planning.
      </HelpParagraph>
      <HelpList items={[
        "Green means reserve need is below available off coverage.",
        "Yellow means reserve need equals available off coverage.",
        "Red means reserve need is above available off coverage.",
      ]} />

      <HelpH2>Use it in Bid</HelpH2>
      <HelpStep n={1}>
        Select <strong>T1-T7</strong> to choose the Current Bid Tier you want to review.
      </HelpStep>
      <HelpStep n={2}>
        Select a date. When both actions are available, choose <strong>DAYS OFF</strong> or <strong>PAIRING</strong>.
      </HelpStep>
      <HelpStep n={3}>
        Select a weekday heading to request Days Off on the matching dates in the displayed month.
      </HelpStep>
      <HelpStep n={4}>
        Select an existing Pairing entry to review its detail. When editing is available, update its Tier selection and
        save the change.
      </HelpStep>
      <HelpStep n={5}>
        Use the left arrow to collapse the calendar. Use the calendar button that appears to expand it again.
      </HelpStep>

      <HelpH2>How it differs by page</HelpH2>
      <HelpFieldTable items={[
        { label: "Dashboard", details: "Review the month summary and available Pairing detail. Use Bid for Current Bid changes." },
        { label: "Bid", details: "Use supported date, weekday, and Pairing-entry actions while the Current Bid is open." },
      ]} />
      <HelpOutcome>
        After a successful Bid calendar action, the calendar and the related Current Bid view refresh with the saved
        change.
      </HelpOutcome>
      <HelpNote>
        An action may be unavailable when the bid period is closed, data is still loading, or the selected date or Tier
        is blocked by an existing condition.
      </HelpNote>
    </>
  );
}
