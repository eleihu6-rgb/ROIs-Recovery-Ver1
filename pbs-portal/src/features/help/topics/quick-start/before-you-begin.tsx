import {
  HelpH2,
  HelpList,
  HelpOutcome,
  HelpStep,
} from "@/features/help/components/help-article";

export default function BeforeYouBegin() {
  return (
    <>
      <HelpH2>Checks before adding a condition</HelpH2>
      <HelpStep n={1}>
        Open <strong>Dashboard</strong> and confirm the name and employee information shown for the active session.
      </HelpStep>
      <HelpStep n={2}>
        Check <strong>BID INFORMATION-LOCAL TIME</strong>, including the bid start, bid end, and remaining time.
      </HelpStep>
      <HelpStep n={3}>
        Confirm the month shown in <strong>BIDDING CALENDAR</strong>.
      </HelpStep>
      <HelpStep n={4}>
        Decide whether the condition belongs in the current bid period or should be a reusable <strong>Standing Bid</strong>.
      </HelpStep>
      <HelpH2>Terms used in Portal</HelpH2>
      <HelpList items={[
        <><strong>Current Bid</strong> means the conditions saved for the active bid period in Bid.</>,
        <><strong>Standing Bid</strong> means reusable long-term conditions stored separately from Current Bid.</>,
        <><strong>T1-T7</strong> are the tiers attached to a condition. A condition must be assigned to at least one tier before it can be added.</>,
        <><strong>Award</strong> is the published result. It is not created immediately when a bid is saved.</>,
      ]} />
      <HelpOutcome>
        When the profile and bid period are correct, continue to Bid or Standing Bid.
      </HelpOutcome>
    </>
  );
}
