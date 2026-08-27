import {
  HelpFieldTable,
  HelpH2,
  HelpList,
  HelpNote,
  HelpOutcome,
  HelpStep,
} from "@/features/help/components/help-article";

export default function StandingBidManage() {
  return (
    <>
      <HelpH2>Add a Standing condition</HelpH2>
      <HelpStep n={1}>
        Open <strong>Standing Bid</strong> and review <strong>EXISTING STANDING BID</strong>.
      </HelpStep>
      <HelpStep n={2}>
        Under <strong>ADD STANDING BID</strong>, select <strong>DAYS OFF</strong>, <strong>PAIRING</strong>,
        or <strong> ROSTER</strong>. Reserve Preference is also listed under <strong>ROSTER</strong>.
      </HelpStep>
      <HelpStep n={3}>
        Select a visible property and complete the fields in <strong>Configure Standing Bid</strong>.
      </HelpStep>
      <HelpStep n={4}>
        Select one or more <strong>T1-T7</strong> buttons and select <strong>ADD BID</strong>.
      </HelpStep>
      <HelpStep n={5}>
        Use <strong>ALL</strong> or a T1-T7 filter to find the saved condition.
      </HelpStep>
      <HelpStep n={6}>
        Use <strong>EDIT</strong> and <strong>UPDATE BID</strong> to change it, or use the delete button to remove it.
      </HelpStep>
      <HelpOutcome>
        The saved condition remains in Standing Bid until it is updated or deleted.
      </HelpOutcome>
      <HelpH2>Conditions not shown in Standing Bid</HelpH2>
      <HelpList items={[
        "Conditions tied to an exact calendar date or date range.",
        "Conditions tied to one specific Pairing occurrence.",
        "Other conditions that are available only for a specific bid period.",
      ]} />
      <HelpFieldTable title="Standing-specific controls and empty states" items={[
        { label: "Limit to Event Date", details: "Standing Pairing condition dialogs hide this control. Exact current-period event dates are Current Bid data, not reusable Standing Bid data." },
        { label: "Reserve Preference Date Scope", details: "Standing Bid Reserve Preference supports Whole Month, First Half, or Second Half only. Date Range and Specific Dates are current-period choices." },
        { label: "Airport Preference", details: "Airport and city choices come from the available airport-option data for the current account, base, period, and event type. If no option matches, the selector shows No airports or cities match." },
        { label: "Flight Number Preference", details: "The flight-number selector searches after you type at least one character. Changing Type alone does not select a flight number." },
        { label: "Time Between Flights", details: "The editor is disabled until the valid configured duration bounds load. If loading fails, the dialog shows Unable to load the Time Between Flights limits. and Retry." },
      ]} />
      <HelpNote>
        The available catalog controls which conditions can be used. If a property is not shown, use Current Bid when
        the same condition is available there.
      </HelpNote>
    </>
  );
}
