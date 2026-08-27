import {
  HelpH2,
  HelpNote,
  HelpOutcome,
  HelpStep,
} from "@/features/help/components/help-article";

export default function CompleteABid() {
  return (
    <>
      <HelpH2>Basic bidding flow</HelpH2>
      <HelpStep n={1}>
        Open <strong>Dashboard</strong> and confirm the active bid period and calendar month.
      </HelpStep>
      <HelpStep n={2}>
        Open <strong>Bid</strong>. Select <strong>DAYS OFF</strong>, <strong>PAIRING</strong>, or <strong>ROSTER</strong> under
        <strong> ADD BID PROPERTIES</strong>.
      </HelpStep>
      <HelpStep n={3}>
        Select a property, complete its required fields, and choose one or more <strong>T1-T7</strong> buttons.
      </HelpStep>
      <HelpStep n={4}>
        Select <strong>ADD BID</strong>. Keep the dialog open while the button shows a pending action, then confirm the
        condition appears under <strong>EXISTING BID PROPERTIES</strong>.
      </HelpStep>
      <HelpStep n={5}>
        Review the summary and Tier tags. Use <strong>EDIT</strong> to change the condition or the delete button to remove it.
      </HelpStep>
      <HelpStep n={6}>
        After results are published, open <strong>Award</strong> to review the roster and duty details.
      </HelpStep>
      <HelpOutcome>
        A saved row in EXISTING BID PROPERTIES confirms that the condition is part of the Current Bid.
      </HelpOutcome>
      <HelpNote>
        Use <strong>ROSTER</strong> for Reserve Preference conditions. Use Standing Bid only for reusable long-term conditions.
      </HelpNote>
    </>
  );
}
