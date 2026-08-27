import {
  HelpFieldTable,
  HelpH2,
  HelpList,
  HelpNote,
  HelpOutcome,
  HelpScreenshot,
  HelpStep,
} from "@/features/help/components/help-article";

export default function DashboardOverview() {
  return (
    <>
      <HelpScreenshot
        src="/help/screenshots/dashboard-overview.png"
        alt="Dashboard with bid information, bidding calendar, user information, and pre-assigned duties"
        caption="Dashboard shows the active bid-period context, current calendar, profile fields, and pre-assigned duties."
      />
      <HelpH2>Check the active bid period</HelpH2>
      <HelpStep n={1}>
        Confirm the identity and contact information shown in the left panel.
      </HelpStep>
      <HelpStep n={2}>
        Review <strong>BID INFORMATION-LOCAL TIME</strong>, including <strong>BID START</strong>, <strong>BID END</strong>,
        and <strong>REMAINING</strong>.
      </HelpStep>
      <HelpStep n={3}>
        Confirm the displayed month in <strong>BIDDING CALENDAR</strong>.
      </HelpStep>
      <HelpStep n={4}>
        Review <strong>MESSAGE CENTER</strong> for pre-assigned duties already known for the current period.
      </HelpStep>
      <HelpFieldTable items={[
        { label: "BID INFORMATION-LOCAL TIME", details: "The open and close times for the active bid period." },
        { label: "REMAINING", details: "A coarse remaining-time label. Open periods show days and hours, not minutes; closed periods show Closed." },
        { label: "USER INFORMATION", details: "Profile fields such as BASE, FLEET, POSITION, SENIORITY, LANGUAGE, EXISTING CREDIT, TRAINING MONTH, and LAST LOGIN." },
        { label: "BIDDING CALENDAR", details: "The month view that summarizes saved Current Bid activity by date and Tier." },
        { label: "MESSAGE CENTER", details: "The right-side panel for Pre-assigned Duties, category counts, covered days, and duty details." },
      ]} />
      <HelpH2>Read MESSAGE CENTER</HelpH2>
      <HelpFieldTable title="Pre-assigned Duties" items={[
        { label: "Duties", details: "Total number of pre-assigned duty records in the displayed period." },
        { label: "Pairing / Days Off / Unavailable", details: "Category counts grouped by duty type." },
        { label: "Covered days", details: "Number of unique calendar dates touched by those pre-assigned duties." },
        { label: "Duty Details", details: "Scrollable duty list with the duty label, date range, type tag, and time or Full day label." },
      ]} />
      <HelpList items={[
        "Pairing duties use the same blue pairing color used in the calendar.",
        "Days Off duties use the same green off color used in the calendar.",
        "Unavailable duties use the warning color because they reduce availability for that day.",
        "Dashboard does not show fleet or sub-fleet pool counts.",
      ]} />
      <HelpOutcome>
        Continue only when the identity, bid period, and calendar month are correct.
      </HelpOutcome>
      <HelpNote>
        Use Bid or Standing Bid to maintain conditions. Dashboard is the place to confirm context and review calendar
        activity.
      </HelpNote>
    </>
  );
}
