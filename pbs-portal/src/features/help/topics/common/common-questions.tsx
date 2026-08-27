import {
  HelpFieldTable,
  HelpH2,
  HelpNote,
} from "@/features/help/components/help-article";

export default function CommonQuestions() {
  return (
    <>
      <HelpH2>Saving and finding conditions</HelpH2>
      <HelpFieldTable items={[
        {
          label: "Why is ADD BID unavailable?",
          details: "Complete every REQUIRED field and select at least one T1-T7 value. Correct any field highlighted by the dialog.",
        },
        {
          label: "How do I know a save finished?",
          details: "Wait for the pending button state to finish, then confirm the condition appears in the matching Existing list with the expected summary and Tier tags.",
        },
        {
          label: "Why can I not find a saved Bid?",
          details: "Check the active Tier. A Current Bid condition assigned only to another Tier is not shown in the current Tier view.",
        },
        {
          label: "Where do I edit or delete a condition?",
          details: "Use the action on the condition row in EXISTING BID PROPERTIES or EXISTING STANDING BID.",
        },
      ]} />
      <HelpH2>Choosing the correct page</HelpH2>
      <HelpFieldTable items={[
        {
          label: "Current Bid or Standing Bid?",
          details: "Use Bid for the active bid period. Use Standing Bid for reusable long-term conditions that are not tied to an exact date or specific Pairing occurrence.",
        },
        {
          label: "Why is a property missing from Standing Bid?",
          details: "Standing Bid shows only conditions available for its long-term context. Use Current Bid when the condition is available only for the active period.",
        },
        {
          label: "When should I open Award?",
          details: "Open Award after the result is published. It is not produced immediately after a Bid is saved.",
        },
      ]} />
      <HelpH2>Loading or save problems</HelpH2>
      <HelpFieldTable items={[
        {
          label: "The page did not load",
          details: "Use the page recovery action when one is shown, or reload the page. If the problem continues, contact support and provide the page name and time of the problem.",
        },
        {
          label: "The save failed",
          details: "Keep the dialog open, review the displayed product message, correct any required field, and try again. Do not add the same condition repeatedly while a save is pending.",
        },
        {
          label: "The list did not update",
          details: "Wait for the pending action to finish, check the active Tier or filter, and use the page refresh action when available.",
        },
      ]} />
      <HelpNote>
        Do not include passwords or sensitive roster information when reporting a problem.
      </HelpNote>
    </>
  );
}
