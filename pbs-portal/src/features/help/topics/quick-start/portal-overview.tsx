import {
  HelpFieldTable,
  HelpH2,
  HelpNote,
  HelpParagraph,
} from "@/features/help/components/help-article";

export default function PortalOverview() {
  return (
    <>
      <HelpH2>What PBS Portal is for</HelpH2>
      <HelpParagraph>
        PBS Portal is where you record schedule preferences for a bid period and review the Award after results are
        published. A saved preference is a request for the system to consider, not a guaranteed result.
      </HelpParagraph>
      <HelpH2>Portal pages</HelpH2>
      <HelpFieldTable items={[
        { label: "Dashboard", details: "Check the active bid period, profile information, bidding calendar, and saved bid activity." },
        { label: "Bid", details: "Add and maintain Current Bid conditions for Days Off, Pairing, Roster, and Reserve Preference." },
        { label: "Standing Bid", details: "Maintain reusable long-term conditions that can be used when the Current Bid has no saved business conditions." },
        { label: "Award", details: "Review the published roster and duty details when results are available." },
        { label: "Help", details: "Return to these instructions at any time." },
      ]} />
      <HelpNote>
        Use the page names and button labels shown in this manual to find the same controls in Portal.
      </HelpNote>
    </>
  );
}
