import {
  HelpH2,
  HelpNote,
  HelpOutcome,
  HelpStep,
} from "@/features/help/components/help-article";

export default function BidManageProperties() {
  return (
    <>
      <HelpH2>Review and maintain saved conditions</HelpH2>
      <HelpStep n={1}>
        Use the active Tier in <strong>BIDDING CALENDAR</strong> to choose the T1-T7 view shown in Bid.
      </HelpStep>
      <HelpStep n={2}>
        Read the category badge, condition summary, and Tier tags in <strong>EXISTING BID PROPERTIES</strong>.
      </HelpStep>
      <HelpStep n={3}>
        Select <strong>PREVIEW</strong> on a supported Pairing row to see matching evidence before making changes.
      </HelpStep>
      <HelpStep n={4}>
        Select <strong>EDIT</strong>, update the required fields or Tier selection, and select <strong>UPDATE BID</strong>.
      </HelpStep>
      <HelpStep n={5}>
        Use the delete button to remove a condition, then confirm the row no longer appears in the current Tier view.
      </HelpStep>
      <HelpOutcome>
        The Existing list and summary refresh after a successful update or delete.
      </HelpOutcome>
      <HelpNote>
        A condition assigned only to another Tier does not appear in the current Tier view. Change the active Tier before
        deciding that the condition is missing.
      </HelpNote>
    </>
  );
}
